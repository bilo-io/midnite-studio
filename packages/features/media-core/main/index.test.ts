// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, MEDIA_ROOT_DIR } from '@midnite/studio-shared';

import { mediaCoreManifest } from '../manifest';
import { createMediaService, mediaCoreMain, type MediaCoreMainServices, type MediaService } from './index';
import { createSerialQueue } from './serial-queue';

let root: string;
let media: MediaService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'media-core-main-'));
  media = createMediaService({
    resolveRepo: async (id) => (id === 'r1' ? root : null),
    trash: vi.fn(async () => {}),
    emit: vi.fn(),
  });
});

afterEach(async () => {
  media.stopWatchers();
  await rm(root, { recursive: true, force: true });
});

function services(over: Partial<MediaCoreMainServices> = {}): MediaCoreMainServices {
  return {
    media,
    revealPath: vi.fn(),
    ffmpegStatus: async () => ({ found: false, reason: 'no ffmpeg here' }),
    pickSavePath: async () => null,
    ...over,
  };
}

describe('media-core main', () => {
  it('registers exactly the manifest channels', () => {
    const ctx = createRecordingContext();
    mediaCoreMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...mediaCoreManifest.ipc].sort());
  });

  it('writes and reads through the store under the resolved root', async () => {
    const ctx = createRecordingContext();
    mediaCoreMain.register(ctx, services());
    const scope = { repoId: 'r1', tab: 'doc' as const };
    expect(await ctx.invoke(CHANNELS.mediaProjectCreate, { ...scope, project: 'notes' })).toMatchObject({ ok: true });
    await ctx.invoke(CHANNELS.mediaFileWrite, { ...scope, project: 'notes', path: 'a.md', content: '# hi' });
    expect(await readFile(join(root, MEDIA_ROOT_DIR, 'doc', 'notes', 'a.md'), 'utf8')).toBe('# hi');
    expect(await ctx.invoke(CHANNELS.mediaFileRead, { ...scope, project: 'notes', path: 'a.md' })).toEqual({
      ok: true,
      value: '# hi',
    });
  });

  it('answers a malformed payload and an unknown repo with a failure, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaCoreMain.register(ctx, services());
    expect(await ctx.invoke(CHANNELS.mediaFileRead, { repoId: 'r1' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaProjectList, { repoId: 'nope', tab: 'doc' })).toMatchObject({ ok: false });
  });

  it('refuses an ffmpeg export when ffmpeg is missing, before any dialog opens', async () => {
    const ctx = createRecordingContext();
    const pickSavePath = vi.fn(async () => '/tmp/out.png');
    mediaCoreMain.register(ctx, services({ pickSavePath }));
    const result = await ctx.invoke(CHANNELS.mediaExport, {
      exportId: 'e1',
      source: { kind: 'media', repoId: 'r1', tab: 'image', project: 'p', path: 'a.png' },
      format: 'png',
    });
    expect(result).toEqual({ ok: false, kind: 'error', message: 'no ffmpeg here' });
    expect(pickSavePath).not.toHaveBeenCalled();
  });
});

describe('createSerialQueue', () => {
  it('runs one key in order and survives a rejection', async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    const slow = queue.run('k', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('a');
    });
    const failing = queue.run('k', async () => {
      order.push('b');
      throw new Error('boom');
    });
    const after = queue.run('k', async () => order.push('c'));
    await slow;
    await expect(failing).rejects.toThrow('boom');
    await after;
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
