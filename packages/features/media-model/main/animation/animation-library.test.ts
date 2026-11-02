// @vitest-environment node
// vitest (node): the animation library's store on a real temp directory — manifest, dedupe, jail, concurrency.
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ANIMATION_MANIFEST_FILE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAnimationLibrary, type NewClip } from './animation-library';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'anim-lib-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const clip = (name: string, bytes = Buffer.from(name), over: Partial<NewClip> = {}): NewClip => ({
  bytes,
  format: 'fbx',
  name,
  tags: [],
  durationSec: 1,
  hasSkin: false,
  source: 'local',
  licence: 'unknown',
  ...over,
});

describe('createAnimationLibrary', () => {
  it('starts empty, adds a clip, and writes the manifest and the file under the root', async () => {
    const lib = createAnimationLibrary({ root, now: () => 1000 });
    expect(await lib.list()).toEqual([]);
    const { clip: added, duplicate } = await lib.add(clip('Walking', Buffer.from('walk-bytes'), { tags: ['locomotion'], durationSec: 1.2, source: 'mixamo', licence: 'mixamo-eula' }));
    expect(duplicate).toBe(false);
    expect(added).toMatchObject({ name: 'Walking', tags: ['locomotion'], source: 'mixamo', licence: 'mixamo-eula', addedAt: 1000, sizeBytes: 10 });
    expect(added.id).toBe(added.sha256.slice(0, 12));
    expect(added.file).toBe(`clips/${added.id}-walking.fbx`);
    expect((await readdir(join(root, 'clips'))).length).toBe(1);
    const manifest = JSON.parse(await readFile(join(root, ANIMATION_MANIFEST_FILE), 'utf8'));
    expect(manifest.version).toBe(1);
    expect(manifest.clips).toHaveLength(1);
  });

  it('survives a restart: a new library over the same root lists the same clips', async () => {
    await createAnimationLibrary({ root }).add(clip('Run'));
    const again = createAnimationLibrary({ root });
    expect((await again.list()).map((c) => c.name)).toEqual(['Run']);
  });

  it('dedupes by content: the same bytes are one clip, and a second add merges its tags', async () => {
    const lib = createAnimationLibrary({ root });
    const first = await lib.add(clip('Idle', Buffer.from('same'), { tags: ['idle'] }));
    const second = await lib.add(clip('Idle (copy)', Buffer.from('same'), { tags: ['idle', 'loop'] }));
    expect(second.duplicate).toBe(true);
    expect(second.clip.id).toBe(first.clip.id);
    expect(second.clip.tags).toEqual(['idle', 'loop']);
    expect(await lib.list()).toHaveLength(1);
    expect(await readdir(join(root, 'clips'))).toHaveLength(1);
    // Nothing new to merge: a plain duplicate, untouched.
    expect((await lib.add(clip('Idle', Buffer.from('same'), { tags: ['idle'] }))).duplicate).toBe(true);
  });

  it('two imports racing cannot lose a clip', async () => {
    const lib = createAnimationLibrary({ root });
    await Promise.all(Array.from({ length: 12 }, (_, i) => lib.add(clip(`Clip ${i}`, Buffer.from(`bytes-${i}`)))));
    expect(await lib.list()).toHaveLength(12);
    expect(JSON.parse(await readFile(join(root, ANIMATION_MANIFEST_FILE), 'utf8')).clips).toHaveLength(12);
  });

  it('updates the editable fields only, normalises tags, and refuses an unknown id', async () => {
    const lib = createAnimationLibrary({ root });
    const { clip: added } = await lib.add(clip('Jump'));
    const next = await lib.update(added.id, { name: 'High Jump', tags: ['traversal', 'traversal', 'fun'], licence: 'cc0', author: 'Someone' });
    expect(next).toMatchObject({ name: 'High Jump', tags: ['traversal', 'fun'], licence: 'cc0', author: 'Someone', sha256: added.sha256, file: added.file });
    expect(await lib.update('ffffffffffff', { name: 'x' })).toBeNull();
    expect((await createAnimationLibrary({ root }).get(added.id))?.name).toBe('High Jump');
  });

  it('removes the clip and its file', async () => {
    const lib = createAnimationLibrary({ root });
    const { clip: added } = await lib.add(clip('Die'));
    expect(await lib.remove(added.id)).toBe(true);
    expect(await lib.list()).toEqual([]);
    expect(await readdir(join(root, 'clips'))).toEqual([]);
    expect(await lib.remove(added.id)).toBe(false);
  });

  it('reads a clip back byte for byte, and answers null for an unknown or vanished one', async () => {
    const lib = createAnimationLibrary({ root });
    const { clip: added } = await lib.add(clip('Wave', Buffer.from('wave-bytes')));
    expect(Buffer.from((await lib.read(added.id))!.bytes).toString()).toBe('wave-bytes');
    expect(await lib.read('ffffffffffff')).toBeNull();
    await rm(join(root, added.file));
    expect(await lib.read(added.id)).toBeNull();
  });

  it('moves a corrupt manifest aside and starts empty instead of throwing', async () => {
    await writeFile(join(root, ANIMATION_MANIFEST_FILE), '{ this is not json');
    const logs: string[] = [];
    const lib = createAnimationLibrary({ root, now: () => 42, log: (l) => logs.push(l) });
    expect(await lib.list()).toEqual([]);
    expect((await readdir(root)).some((f) => f === 'animations.manifest.corrupt-42.json')).toBe(true);
    expect(logs.join(' ')).toContain('not valid JSON');
    await lib.add(clip('After'));
    expect(await lib.list()).toHaveLength(1);
  });

  it('moves aside a manifest of another version rather than rewriting it', async () => {
    await writeFile(join(root, ANIMATION_MANIFEST_FILE), JSON.stringify({ version: 2, clips: [] }));
    const lib = createAnimationLibrary({ root, now: () => 7 });
    expect(await lib.list()).toEqual([]);
    expect((await readdir(root)).some((f) => f.includes('corrupt-7'))).toBe(true);
  });

  it('drops a malformed entry and an entry whose file escapes the root, keeping the rest', async () => {
    const good = createAnimationLibrary({ root });
    const { clip: kept } = await good.add(clip('Keep'));
    const manifest = JSON.parse(await readFile(join(root, ANIMATION_MANIFEST_FILE), 'utf8'));
    const evil = { ...kept, id: 'bbbbbbbbbbbb', file: 'clips/../../outside.fbx' };
    const outside = { ...kept, id: 'cccccccccccc', file: '../outside.fbx' };
    manifest.clips.push(evil, outside, { nonsense: true });
    await writeFile(join(root, ANIMATION_MANIFEST_FILE), JSON.stringify(manifest));
    const lib = createAnimationLibrary({ root, log: () => undefined });
    expect((await lib.list()).map((c) => c.id)).toEqual([kept.id]);
  });

  it('will not read through a symlink planted under clips/ that points outside the library', async () => {
    const lib = createAnimationLibrary({ root });
    const { clip: added } = await lib.add(clip('Link'));
    const secret = join(await mkdtemp(join(tmpdir(), 'anim-secret-')), 'secret.fbx');
    await writeFile(secret, 'secret');
    await rm(join(root, added.file));
    await mkdir(join(root, 'clips'), { recursive: true });
    await symlink(secret, join(root, added.file));
    expect(await lib.read(added.id)).toBeNull();
  });
});
