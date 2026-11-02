// @vitest-environment node
// vitest (node): bulk import on a real temp tree — folder walk, Mixamo naming and tags, dedupe, bad files.
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AnimationProgressEvent } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAnimationLibrary } from './animation-library';
import { BVH_TEXT, buildFbx, buildGlb, GLTF_DOC } from './fixtures';
import { collectClipFiles, createAnimationImporter, MAX_DEPTH } from './import-service';

let dir: string;
let lib: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'anim-imp-'));
  lib = join(dir, 'library');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const put = async (rel: string, data: Buffer | string) => {
  const abs = join(dir, 'in', rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, data);
  return abs;
};

const setup = () => {
  const library = createAnimationLibrary({ root: lib });
  const progress: AnimationProgressEvent[] = [];
  return { library, progress, importer: createAnimationImporter({ library, onProgress: (e) => progress.push(e) }) };
};

describe('importPaths', () => {
  it('imports a Mixamo folder: names from file names, auto-tags, Mixamo source and licence, skin detected', async () => {
    await put('Walking.fbx', buildFbx({ seconds: 1 }));
    await put('Standing Idle (1).fbx', buildFbx({ seconds: 3, keys: 91 }));
    await put('Sword And Shield Slash_withSkin.fbx', buildFbx({ seconds: 1.2, skin: true }));
    const { importer, library, progress } = setup();
    const result = await importer.importPaths([join(dir, 'in')]);
    expect(result.failed).toEqual([]);
    expect(result.added.map((c) => c.name).sort()).toEqual(['Standing Idle', 'Sword And Shield Slash', 'Walking']);
    const byName = Object.fromEntries((await library.list()).map((c) => [c.name, c]));
    expect(byName['Walking']).toMatchObject({ tags: ['locomotion'], source: 'mixamo', licence: 'mixamo-eula', site: 'mixamo.com', author: 'Mixamo', hasSkin: false, boneCount: 6, fps: 30 });
    expect(byName['Standing Idle']).toMatchObject({ tags: ['idle'] });
    expect(byName['Standing Idle']!.durationSec).toBeCloseTo(3, 4);
    expect(byName['Sword And Shield Slash']).toMatchObject({ tags: ['combat'], hasSkin: true });
    // Progress ends finished, counting every file.
    expect(progress.at(-1)).toEqual({ done: 3, total: 3, finished: true });
    expect(progress[0]).toMatchObject({ done: 0, total: 3, finished: false });
  });

  it('accepts GLB, glTF and BVH, and a non-Mixamo skeleton stays a local clip with an unknown licence', async () => {
    await put('Walk.glb', buildGlb(GLTF_DOC));
    await put('cmu/run_01.bvh', BVH_TEXT);
    const { importer, library } = setup();
    const result = await importer.importPaths([join(dir, 'in')]);
    expect(result.added).toHaveLength(2);
    const clips = await library.list();
    expect(clips.map((c) => c.format).sort()).toEqual(['bvh', 'glb']);
    expect(clips.every((c) => c.source === 'local' && c.licence === 'unknown')).toBe(true);
    expect(clips.find((c) => c.format === 'bvh')).toMatchObject({ name: 'Run 01', tags: ['locomotion'], hasSkin: false });
  });

  it('reports a bad file with a reason and imports the rest', async () => {
    await put('good.fbx', buildFbx());
    await put('broken.fbx', 'definitely not fbx');
    await put('empty.bvh', '');
    await put('notes.txt', 'ignored');
    const { importer } = setup();
    const result = await importer.importPaths([join(dir, 'in')]);
    expect(result.added).toHaveLength(1);
    expect(result.failed.map((f) => f.name).sort()).toEqual(['broken.fbx', 'empty.bvh']);
    expect(result.failed.find((f) => f.name === 'broken.fbx')!.reason).toContain('not an FBX');
  });

  it('puts a second import of the same files in duplicates, adding nothing', async () => {
    await put('Walking.fbx', buildFbx());
    const { importer, library } = setup();
    expect((await importer.importPaths([join(dir, 'in')])).added).toHaveLength(1);
    const again = await importer.importPaths([join(dir, 'in', 'Walking.fbx')]);
    expect(again.added).toHaveLength(0);
    expect(again.duplicates).toHaveLength(1);
    expect(await library.list()).toHaveLength(1);
  });

  it('says so when a folder holds no clip files', async () => {
    await put('readme.md', 'hi');
    const { importer } = setup();
    const result = await importer.importPaths([join(dir, 'in')]);
    expect(result.added).toEqual([]);
    expect(result.failed[0]!.reason).toContain('No .fbx');
  });

  it('carries parse warnings (an ASCII FBX) beside the result', async () => {
    await put('ascii.fbx', '; FBX 7.4.0 project file\nAnimationStack: 1, "AnimStack::Take 001", ""\n');
    const { importer } = setup();
    const result = await importer.importPaths([join(dir, 'in')]);
    expect(result.added).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('ASCII');
  });
});

describe('collectClipFiles', () => {
  it('walks to the depth cap, skips dotfiles and symlinks, and reads in name order', async () => {
    await put('b.fbx', 'x');
    await put('a.fbx', 'x');
    await put('.hidden.fbx', 'x');
    await put('.git/hook.fbx', 'x');
    let deep = '';
    for (let i = 0; i <= MAX_DEPTH + 1; i += 1) deep = join(deep, `d${i}`);
    await put(join(deep, 'too-deep.fbx'), 'x');
    await put('d0/ok.fbx', 'x');
    const outside = join(dir, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'escape.fbx'), 'x');
    await symlink(outside, join(dir, 'in', 'link'));
    await symlink(join(outside, 'escape.fbx'), join(dir, 'in', 'linked.fbx'));
    const { files } = await collectClipFiles([join(dir, 'in')]);
    const names = files.map((f) => f.path.slice(join(dir, 'in').length + 1));
    expect(names).toEqual(['a.fbx', 'b.fbx', join('d0', 'ok.fbx')]);
  });

  it('takes a file path as itself, and ignores a missing one', async () => {
    const file = await put('one.fbx', 'x');
    const { files } = await collectClipFiles([file, join(dir, 'nope.fbx')]);
    expect(files.map((f) => f.path)).toEqual([file]);
  });
});

describe('importBytes (a dropped file)', () => {
  it('imports from bytes, using the dropped folder for naming and tags', async () => {
    const { importer, library } = setup();
    const result = await importer.importBytes({ name: 'take_001.fbx', bytes: buildFbx(), folder: 'Combat' });
    expect(result.added).toHaveLength(1);
    expect((await library.list())[0]).toMatchObject({ name: 'Combat', tags: ['combat'] });
  });

  it('refuses an unsupported extension and an empty drop', async () => {
    const { importer } = setup();
    expect((await importer.importBytes({ name: 'a.png', bytes: Buffer.from('x') })).failed[0]!.reason).toContain('Not an animation file');
    expect((await importer.importBytes({ name: 'a.fbx', bytes: Buffer.alloc(0) })).failed[0]!.reason).toContain('empty');
  });
});
