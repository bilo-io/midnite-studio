// @vitest-environment node
// vitest (node): the mediaAnimation dispatcher — picker flow, events, envelopes, and the channel through a recording context.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, type AnimationChangedEvent, type AnimationClip, type AnimationImportResult, type AnimationProgressEvent } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mediaModelMain } from '../index';
import { createModelRuntime } from '../model/model-runtime';
import { createAnimationLibrary } from './animation-library';
import { createAnimationService } from './animation-service';
import { buildFbx, buildGlb, GLTF_DOC } from './fixtures';
import { SketchfabError, type SketchfabClient } from './sketchfab';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'anim-svc-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const make = (picked: string[] | null = null) => {
  const changed: AnimationChangedEvent[] = [];
  const progress: AnimationProgressEvent[] = [];
  const pickPaths = vi.fn(async () => picked);
  const service = createAnimationService({
    library: createAnimationLibrary({ root: join(dir, 'library') }),
    pickPaths,
    emitChanged: (e) => changed.push(e),
    emitProgress: (e) => progress.push(e),
  });
  return { service, changed, progress, pickPaths };
};

const value = <T>(result: unknown): T => {
  const r = result as { ok: boolean; value: T; message?: string };
  expect(r.ok, r.message).toBe(true);
  return r.value;
};

describe('createAnimationService', () => {
  it('lists an empty library', async () => {
    expect(value(await make().service.handle({ op: 'list' }))).toEqual({ clips: [] });
  });

  it('importFolder: asks the picker for a folder, imports, emits changed and progress', async () => {
    await mkdir(join(dir, 'mx'), { recursive: true });
    await writeFile(join(dir, 'mx', 'Walking.fbx'), buildFbx());
    const { service, changed, progress, pickPaths } = make([join(dir, 'mx')]);
    const result = value<AnimationImportResult>(await service.handle({ op: 'importFolder' }));
    expect(pickPaths).toHaveBeenCalledWith('folder');
    expect(result.added).toHaveLength(1);
    expect(changed).toEqual([{ reason: 'import', count: 1 }]);
    expect(progress.at(-1)).toMatchObject({ finished: true });
    expect(value<{ clips: unknown[] }>(await service.handle({ op: 'list' })).clips).toHaveLength(1);
  });

  it('importFiles uses the files picker; a dismissed picker is a cancelled success that changes nothing', async () => {
    const { service, changed, pickPaths } = make(null);
    const result = value<AnimationImportResult>(await service.handle({ op: 'importFiles' }));
    expect(pickPaths).toHaveBeenCalledWith('files');
    expect(result).toMatchObject({ cancelled: true, added: [], failed: [] });
    expect(changed).toEqual([]);
  });

  it('importBytes decodes a dropped file', async () => {
    const { service, changed } = make();
    const result = value<AnimationImportResult>(await service.handle({ op: 'importBytes', name: 'Run.fbx', dataBase64: buildFbx().toString('base64') }));
    expect(result.added[0]).toMatchObject({ name: 'Run', tags: ['locomotion'] });
    expect(changed).toHaveLength(1);
  });

  it('update, read and remove round-trip, each announcing the change', async () => {
    const { service, changed } = make();
    const { added } = value<AnimationImportResult>(await service.handle({ op: 'importBytes', name: 'Wave.fbx', dataBase64: buildFbx().toString('base64') }));
    const id = added[0]!.id;
    const updated = value<{ clip: AnimationClip }>(await service.handle({ op: 'update', id, patch: { tags: ['emote', 'friendly'] } }));
    expect(updated.clip.tags).toEqual(['emote', 'friendly']);
    const read = value<{ dataBase64: string; format: string }>(await service.handle({ op: 'read', id }));
    expect(read.format).toBe('fbx');
    expect(Buffer.from(read.dataBase64, 'base64').equals(buildFbx())).toBe(true);
    value(await service.handle({ op: 'remove', id }));
    expect(changed.map((c) => c.reason)).toEqual(['import', 'update', 'remove']);
  });

  it('answers an unknown id with the error envelope, never a throw', async () => {
    const { service } = make();
    for (const req of [
      { op: 'update', id: 'ffffffffffff', patch: { name: 'x' } },
      { op: 'remove', id: 'ffffffffffff' },
      { op: 'read', id: 'ffffffffffff' },
    ] as const) {
      expect(await service.handle(req)).toMatchObject({ ok: false, kind: 'error' });
    }
  });

  it('turns a throwing picker into the envelope', async () => {
    const service = createAnimationService({
      library: createAnimationLibrary({ root: join(dir, 'library') }),
      pickPaths: async () => {
        throw new Error('dialog exploded');
      },
      emitChanged: () => undefined,
      emitProgress: () => undefined,
    });
    expect(await service.handle({ op: 'importFolder' })).toMatchObject({ ok: false, message: 'dialog exploded' });
  });
});

describe('the channel on the model feature', () => {
  it('validates the payload and routes it to the composer-supplied service', async () => {
    const ctx = createRecordingContext();
    const { service } = make();
    const handle = vi.spyOn(service, 'handle');
    mediaModelMain.register(ctx, {
      runtime: createModelRuntime({} as never),
      pickSavePath: async () => null,
      sf3d: async () => ({ ok: true as const, value: undefined }),
      animation: service,
    });
    expect(await ctx.invoke(CHANNELS.mediaAnimation, { op: 'nope' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaAnimation, { op: 'list' })).toMatchObject({ ok: true, value: { clips: [] } });
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe('Sketchfab ops (Theme E)', () => {
  const UID = 'a'.repeat(32);
  const client = (over: Partial<SketchfabClient> = {}): SketchfabClient => ({
    hasToken: async () => true,
    search: async () => ({ results: [], nextCursor: null }),
    download: async () => ({ uid: UID, name: 'Walk Cycle', author: 'Ada', licence: 'cc-by', viewUrl: `https://sketchfab.com/3d-models/walk-${UID}`, bytes: buildGlb(GLTF_DOC) }),
    ...over,
  });
  const withSketchfab = (sketchfab?: SketchfabClient) => {
    const changed: AnimationChangedEvent[] = [];
    const service = createAnimationService({
      library: createAnimationLibrary({ root: join(dir, 'library') }),
      pickPaths: async () => null,
      emitChanged: (e) => changed.push(e),
      emitProgress: () => undefined,
      sketchfab,
    });
    return { service, changed };
  };

  it('status reports whether a token is set and nothing else', async () => {
    expect(value(await withSketchfab(client()).service.handle({ op: 'sketchfabStatus' }))).toEqual({ hasToken: true });
    expect(value(await withSketchfab(client({ hasToken: async () => false })).service.handle({ op: 'sketchfabStatus' }))).toEqual({ hasToken: false });
    expect(value(await withSketchfab(undefined).service.handle({ op: 'sketchfabStatus' }))).toEqual({ hasToken: false });
  });

  it('answers "not available" in a host with no Sketchfab client', async () => {
    expect(await withSketchfab(undefined).service.handle({ op: 'sketchfabSearch', q: 'walk', licences: ['cc0'] })).toMatchObject({ ok: false });
    expect(await withSketchfab(undefined).service.handle({ op: 'sketchfabDownload', uid: UID })).toMatchObject({ ok: false });
  });

  it('turns a Sketchfab error into the envelope with its own message', async () => {
    const { service } = withSketchfab(
      client({
        search: async () => {
          throw new SketchfabError('unauthorized', 'Sketchfab did not accept your API token.');
        },
      }),
    );
    expect(await service.handle({ op: 'sketchfabSearch', q: 'walk', licences: ['cc0'] })).toMatchObject({ ok: false, message: 'Sketchfab did not accept your API token.' });
  });

  it('download adds the GLB to the library with Sketchfab provenance and announces it', async () => {
    const { service, changed } = withSketchfab(client());
    const result = value<AnimationImportResult>(await service.handle({ op: 'sketchfabDownload', uid: UID }));
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({
      name: 'Walk Cycle',
      source: 'sketchfab',
      site: 'sketchfab.com',
      licence: 'cc-by',
      author: 'Ada',
      originalUrl: `https://sketchfab.com/3d-models/walk-${UID}`,
      format: 'glb',
    });
    expect(changed).toEqual([{ reason: 'import', count: 1 }]);
    expect(value<{ clips: AnimationClip[] }>(await service.handle({ op: 'list' })).clips).toHaveLength(1);
    // The same bytes again are a duplicate, not a second clip.
    expect(value<AnimationImportResult>(await service.handle({ op: 'sketchfabDownload', uid: UID })).duplicates).toHaveLength(1);
  });

  it('cancel aborts the download in flight', async () => {
    let started!: () => void;
    const begun = new Promise<void>((resolve) => (started = resolve));
    const { service } = withSketchfab(
      client({
        download: (_uid, signal) =>
          new Promise((_resolve, reject) => {
            started();
            signal?.addEventListener('abort', () => reject(new SketchfabError('cancelled', 'Cancelled.')));
          }),
      }),
    );
    const pending = service.handle({ op: 'sketchfabDownload', uid: UID });
    await begun;
    expect(await service.handle({ op: 'sketchfabDownload', uid: UID })).toMatchObject({ ok: false, message: 'That model is already downloading.' });
    await service.handle({ op: 'sketchfabCancel', uid: UID });
    expect(await pending).toMatchObject({ ok: false, message: 'Cancelled.' });
  });

  it('the channel rejects a malformed uid and an empty licence list', async () => {
    const ctx = createRecordingContext();
    const { service } = withSketchfab(client());
    mediaModelMain.register(ctx, { runtime: createModelRuntime({} as never), pickSavePath: async () => null, sf3d: async () => ({ ok: true as const, value: undefined }), animation: service });
    expect(await ctx.invoke(CHANNELS.mediaAnimation, { op: 'sketchfabDownload', uid: '../x' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaAnimation, { op: 'sketchfabSearch', q: 'x', licences: [] })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaAnimation, { op: 'sketchfabSearch', q: 'x', licences: ['cc0'] })).toMatchObject({ ok: true });
  });
});
