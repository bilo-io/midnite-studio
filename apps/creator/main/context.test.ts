// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mediaCoreManifest } from '@midnite/studio-feature-media-core/main';
import { mediaDocsManifest } from '@midnite/studio-feature-media-docs/main';
import { mediaImagesManifest } from '@midnite/studio-feature-media-images/main';
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
    trashItem: async () => undefined,
    send: () => undefined,
    mediaRoot: dir,
    revealPath: () => undefined,
    pickSavePath: async () => null,
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
  it('registers exactly media-core, Docs and Images channels', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual(
      [...mediaCoreManifest.ipc, ...mediaDocsManifest.ipc, ...mediaImagesManifest.ipc].sort(),
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
});
