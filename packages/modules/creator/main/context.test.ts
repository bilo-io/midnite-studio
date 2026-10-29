// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mediaCoreManifest } from '@midnite/studio-feature-media-core/main';
import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/main';
import { mediaDocsManifest } from '@midnite/studio-feature-media-docs/main';
import { mediaVideoManifest } from '@midnite/studio-feature-media-video/main';
import { mediaImagesManifest } from '@midnite/studio-feature-media-images/main';
import { reportManifest } from '@midnite/studio-feature-report/main';
import { CHANNELS, MEDIA_ROOT_DIR, mstudioFileUrl } from '@midnite/studio-shared';

import { CREATOR_REPO_ID, registerCreatorHandlers } from './context';
import { resolveCreatorFileUrl } from './file-protocol';

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'creator-media-'));
  dirs.push(dir);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const readKey = vi.fn(async () => null);
  const media = registerCreatorHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: () => undefined },
    report: { sink: () => null, homeDir: () => '/home', openExternal: () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    trashItem: async () => undefined,
    send: () => undefined,
    mediaRoot: dir,
    revealPath: () => undefined,
    pickSavePath: async () => null,
    pickImportFiles: async () => null,
    videoSettingsDir: dir,
    videoTemplateRoot: join(dir, 'no-templates'),
    openPath: async () => '',
    printToPdf: async () => Buffer.from(''),
    ffmpegStatus: async () => ({ found: false, reason: 'none' }),
    readKey,
    fetch: (async () => {
      throw new Error('no network in tests');
    }) as unknown as typeof fetch,
  });
  stops.push(media.stopWatchers);
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload);
  return { dir, handlers, invoke, readKey };
}

describe('registerCreatorHandlers', () => {
  it('registers exactly media-core, Docs, Images, Audio and Video channels', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual(
      [...mediaCoreManifest.ipc, ...mediaDocsManifest.ipc, ...mediaImagesManifest.ipc, ...mediaAudioManifest.ipc, ...mediaVideoManifest.ipc, ...reportManifest.ipc].sort(),
    );
  });

  it('keeps media under its own root, for its one repo id', async () => {
    const { dir, invoke } = await setup();
    const scope = { repoId: CREATOR_REPO_ID, tab: 'doc' };
    await invoke(CHANNELS.mediaProjectCreate, { ...scope, project: 'drafts' });
    await invoke(CHANNELS.mediaFileWrite, { ...scope, project: 'drafts', path: 'a.md', content: '# a' });
    expect(await readFile(join(dir, MEDIA_ROOT_DIR, 'doc', 'drafts', 'a.md'), 'utf8')).toBe('# a');
    expect(await invoke(CHANNELS.mediaProjectList, { repoId: 'some-studio-repo', tab: 'doc' })).toMatchObject({ ok: false });
  });

  it('answers Ask AI with a plain failure — Creator has no agents', async () => {
    const { invoke } = await setup();
    const result = await invoke(CHANNELS.mediaDocEdit, {
      repoId: CREATOR_REPO_ID,
      project: 'p',
      path: 'a.md',
      markdown: '',
      prompt: 'tighten',
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe('Creator Video', () => {
  it('resolves its one repo to the media root, so Setup Video targets .midnite/media/video under it', async () => {
    const { dir, invoke } = await setup();
    const resolved = await invoke(CHANNELS.videoRootResolve, { repoId: CREATOR_REPO_ID });
    expect(resolved).toMatchObject({ root: null, setupTarget: join(dir, MEDIA_ROOT_DIR, 'video') });
  });

  it('refuses Setup Video for a repository that is not Creator’s, without reading the template', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.videoSetup, { repoId: 'some-studio-repo' })).toMatchObject({ ok: false });
  });

  it('keeps its video setting in its own userData, never a Studio path', async () => {
    const { dir, invoke } = await setup();
    await invoke(CHANNELS.videoRootSet, { root: join(dir, 'elsewhere') });
    expect(JSON.parse(await readFile(join(dir, 'video-settings.json'), 'utf8'))).toMatchObject({ videoRoot: join(dir, 'elsewhere') });
  });
});

describe('Creator Audio', () => {
  it('reports the local engine as unavailable instead of offering a download it cannot run', async () => {
    const { invoke } = await setup();
    const { engine } = (await invoke(CHANNELS.mediaAudioEngine)) as { engine: { musicgen: { state: string }; ollama: { running: boolean } } };
    expect(engine.musicgen.state).toBe('unavailable');
    expect(engine.ollama.running).toBe(false);
    expect(await invoke(CHANNELS.mediaAudioEngineInstall)).toMatchObject({ ok: false });
  });

  it('answers Import with "cancelled" when the native picker is dismissed', async () => {
    const { invoke } = await setup();
    const result = await invoke(CHANNELS.mediaAudioImport, {
      repoId: CREATOR_REPO_ID,
      importId: 'i1',
      project: 'imports',
      prompt: { title: 't', style: [], lyrics: '', instrumental: true, durationS: 30, count: 1 },
    });
    expect(result).toMatchObject({ ok: false, message: 'cancelled' });
  });
});

describe('resolveCreatorFileUrl', () => {
  it('serves a gallery URL from the media root and nothing outside it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'creator-file-'));
    dirs.push(dir);
    await writeFile(join(dir, 'a.png'), 'x');
    await symlink('/etc/hosts', join(dir, 'out.png'));
    expect(await resolveCreatorFileUrl(mstudioFileUrl('repo', CREATOR_REPO_ID, 'a.png'), dir)).toMatch(/a\.png$/);
    expect(await resolveCreatorFileUrl(mstudioFileUrl('repo', CREATOR_REPO_ID, 'out.png'), dir)).toBeNull();
    expect(await resolveCreatorFileUrl(mstudioFileUrl('repo', 'other', 'a.png'), dir)).toBeNull();
    expect(await resolveCreatorFileUrl('mstudio-file://repo/creator/..%2F..%2Fetc%2Fhosts', dir)).toBeNull();
  });

  it('serves a video iteration from the resolved video root only, through the same jail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'creator-video-'));
    dirs.push(root);
    await writeFile(join(root, 'v1.mp4'), 'x');
    await symlink('/etc/hosts', join(root, 'out.mp4'));
    const videoRoot = async () => root;
    expect(await resolveCreatorFileUrl('mstudio-file://video/-/v1.mp4', root, videoRoot)).toMatch(/v1\.mp4$/);
    expect(await resolveCreatorFileUrl('mstudio-file://video/-/out.mp4', root, videoRoot)).toBeNull();
    expect(await resolveCreatorFileUrl('mstudio-file://video/-/..%2Fx.mp4', root, videoRoot)).toBeNull();
    // No root resolved yet → nothing is served.
    expect(await resolveCreatorFileUrl('mstudio-file://video/-/v1.mp4', root)).toBeNull();
  });
});
