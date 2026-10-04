import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelSpecSchema, parseModelManifest, type ModelLibraryGroup, type ModelLibraryModel, type ModelSidecar } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createModelLibrary } from './model-library';

const spec = ModelSpecSchema.parse({ name: 'Crate', parts: [{ name: 'body', shape: 'box', size: [1, 1, 1], color: '#aa7744' }] });
const sidecar = (stem: string): ModelSidecar => ({
  version: 1,
  name: stem,
  prompt: 'a crate',
  engine: 'ollama:qwen2.5-coder:7b',
  spec,
  createdAt: '2026-10-03T10:00:00.000Z',
});

let root: string;
let trashed: string[];
let changes: number;

const lib = () =>
  createModelLibrary({
    rootFor: async () => root,
    createGroup: async (_repo, name) => {
      await mkdir(join(root, name));
      return { ok: true, value: undefined };
    },
    trash: async (abs) => {
      trashed.push(abs);
      await rm(abs, { recursive: true });
    },
    onChanged: () => {
      changes += 1;
    },
    author: async () => ({ name: 'Bilo' }),
    now: () => new Date('2026-10-03T12:00:00.000Z'),
  });

/** A pre-folder output: `<group>/<stem>.{json,obj,mtl,fbx,glb}`. */
async function legacy(group: string, stem: string): Promise<void> {
  await mkdir(join(root, group), { recursive: true });
  await writeFile(join(root, group, `${stem}.json`), JSON.stringify(sidecar(stem)));
  for (const ext of ['obj', 'mtl', 'fbx', 'glb']) await writeFile(join(root, group, `${stem}.${ext}`), `data-${ext}`);
}

/** A folder-layout output. */
async function folder(path: string, stem: string, manifest = true): Promise<void> {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${stem}.obj`), 'obj');
  await writeFile(join(dir, `${stem}.json`), JSON.stringify(sidecar(stem)));
  if (manifest) await writeFile(join(dir, 'model.json'), '{"x":1}');
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'model-lib-'));
  trashed = [];
  changes = 0;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const listed = async () => {
  const result = await lib().list('r');
  if (!result.ok) throw new Error('list failed');
  return result.value.tree;
};

describe('migrate', () => {
  it('moves each flat set into its own folder, writes model.json from the sidecar, and loses nothing', async () => {
    await legacy('robots', 'rover-1');
    await legacy('robots', 'rover-2');
    const result = await lib().migrate('r');
    expect(result).toEqual({ ok: true, value: { migrated: 2, skipped: 0 } });
    expect((await readdir(join(root, 'robots'))).sort()).toEqual(['rover-1', 'rover-2']);
    expect((await readdir(join(root, 'robots', 'rover-1'))).sort()).toEqual(['model.json', 'rover-1.fbx', 'rover-1.glb', 'rover-1.json', 'rover-1.mtl', 'rover-1.obj']);
    expect(await readFile(join(root, 'robots', 'rover-1', 'rover-1.obj'), 'utf8')).toBe('data-obj');
    const manifest = parseModelManifest(await readFile(join(root, 'robots', 'rover-1', 'model.json'), 'utf8'))!;
    expect(manifest).toMatchObject({ name: 'Crate', agent: { provider: 'ollama', model: 'qwen2.5-coder:7b' }, author: { name: 'Bilo' }, prompt: 'a crate', createdAt: '2026-10-03T10:00:00.000Z' });
    expect(manifest.details.parts).toBe(1);
    expect(changes).toBe(1);
  });

  it('is idempotent', async () => {
    await legacy('robots', 'rover-1');
    await lib().migrate('r');
    expect(await lib().migrate('r')).toEqual({ ok: true, value: { migrated: 0, skipped: 0 } });
  });

  it('skips a set whose folder name is taken instead of overwriting anything', async () => {
    await legacy('robots', 'rover');
    await writeFile(join(root, 'robots', 'rover'), 'a file called rover'); // a file squats on the folder name
    // stemOf groups `rover` with the set, so the squatter is part of it; the folder cannot be made.
    const result = await lib().migrate('r');
    expect(result).toEqual({ ok: true, value: { migrated: 0, skipped: 1 } });
    expect(await readFile(join(root, 'robots', 'rover.obj'), 'utf8')).toBe('data-obj');
    expect(await readFile(join(root, 'robots', 'rover'), 'utf8')).toBe('a file called rover');
  });

  it('keeps a hand-added .obj with no sidecar (a folder, no model.json) and adds a manifest to a folder that has only a design', async () => {
    await mkdir(join(root, 'misc'), { recursive: true });
    await writeFile(join(root, 'misc', 'stray.obj'), 'v 0 0 0');
    await folder('misc/old', 'old', false);
    await lib().migrate('r');
    expect(existsSync(join(root, 'misc', 'stray', 'stray.obj'))).toBe(true);
    expect(existsSync(join(root, 'misc', 'stray', 'model.json'))).toBe(false);
    expect(existsSync(join(root, 'misc', 'old', 'model.json'))).toBe(true);
  });
});

describe('list', () => {
  it('builds groups → model folders with their manifests, newest model first, and reads legacy sets too', async () => {
    await folder('a/one', 'one');
    await folder('a/nested/two', 'two');
    await legacy('b', 'flat');
    const tree = await listed();
    expect(tree.map((n) => [n.kind, n.name])).toEqual([['group', 'a'], ['group', 'b']]);
    const a = tree[0] as ModelLibraryGroup;
    expect(a.children.map((n) => [n.kind, n.name])).toEqual([['group', 'nested'], ['model', 'one']]);
    const one = a.children[1] as ModelLibraryModel;
    expect(one.path).toBe('a/one');
    expect(one.files.map((f) => f.name).sort()).toEqual(['model.json', 'one.json', 'one.obj']);
    const nested = a.children[0] as ModelLibraryGroup;
    expect((nested.children[0] as ModelLibraryModel).path).toBe('a/nested/two');
    const flat = (tree[1] as ModelLibraryGroup).children[0] as ModelLibraryModel;
    expect(flat).toMatchObject({ kind: 'model', legacy: true, path: 'b/flat', manifest: null });
  });

  it('is empty when the root does not exist', async () => {
    const empty = createModelLibrary({ rootFor: async () => null, createGroup: async () => ({ ok: true, value: undefined }), trash: async () => undefined, author: async () => ({ name: 'x' }) });
    expect(await empty.list('r')).toEqual({ ok: true, value: { tree: [] } });
  });
});

describe('folder operations', () => {
  it('renames a model folder and its manifest label, refusing an existing name', async () => {
    await folder('g/one', 'one');
    await folder('g/two', 'two', false);
    await writeFile(join(root, 'g/one/model.json'), JSON.stringify({ name: 'one' }));
    expect(await lib().rename({ repoId: 'r', path: 'g/one', to: 'two' })).toMatchObject({ ok: false });
    expect(await lib().rename({ repoId: 'r', path: 'g/one', to: 'uno' })).toEqual({ ok: true, value: { path: 'g/uno' } });
    expect(existsSync(join(root, 'g/uno/one.obj'))).toBe(true);
    expect(JSON.parse(await readFile(join(root, 'g/uno/model.json'), 'utf8')).name).toBe('uno');
  });

  it('moves a model into another group, and a group into a group, but never into itself or a model', async () => {
    await folder('a/one', 'one');
    await mkdir(join(root, 'b'));
    await mkdir(join(root, 'a/inner'));
    expect(await lib().move({ repoId: 'r', path: 'a/one', toGroup: 'b' })).toEqual({ ok: true, value: { path: 'b/one' } });
    expect(existsSync(join(root, 'b/one/one.obj'))).toBe(true);
    expect(await lib().move({ repoId: 'r', path: 'a', toGroup: 'a/inner' })).toMatchObject({ ok: false, message: 'A folder cannot move into itself.' });
    expect(await lib().move({ repoId: 'r', path: 'a/inner', toGroup: 'b/one' })).toMatchObject({ ok: false });
    expect(await lib().move({ repoId: 'r', path: 'b/one', toGroup: '' })).toMatchObject({ ok: false });
    expect(await lib().move({ repoId: 'r', path: 'a/inner', toGroup: '' })).toEqual({ ok: true, value: { path: 'inner' } });
  });

  it('refuses a move that would collide', async () => {
    await folder('a/one', 'one');
    await folder('b/one', 'one');
    expect(await lib().move({ repoId: 'r', path: 'a/one', toGroup: 'b' })).toMatchObject({ ok: false });
    expect(existsSync(join(root, 'a/one/one.obj'))).toBe(true);
  });

  it('deletes through the Trash, whole folders and legacy sets', async () => {
    await folder('a/one', 'one');
    await legacy('a', 'flat');
    expect(await lib().delete({ repoId: 'r', path: 'a/one' })).toEqual({ ok: true, value: undefined });
    expect(trashed).toEqual([join(root, 'a/one')]);
    expect(await lib().delete({ repoId: 'r', path: 'a/flat' })).toEqual({ ok: true, value: undefined });
    expect(trashed).toHaveLength(1 + 5); // json, obj, mtl, fbx, glb
    expect((await readdir(join(root, 'a'))).length).toBe(0);
  });

  it('duplicates a folder under a fresh name, relabelling its manifest', async () => {
    await folder('a/one', 'one');
    await writeFile(join(root, 'a/one/model.json'), JSON.stringify({ name: 'one' }));
    expect(await lib().duplicate({ repoId: 'r', path: 'a/one' })).toEqual({ ok: true, value: { path: 'a/one copy' } });
    expect(await lib().duplicate({ repoId: 'r', path: 'a/one' })).toEqual({ ok: true, value: { path: 'a/one copy 2' } });
    expect(existsSync(join(root, 'a/one copy/one.obj'))).toBe(true);
    expect(JSON.parse(await readFile(join(root, 'a/one copy/model.json'), 'utf8')).name).toBe('one copy');
    expect(existsSync(join(root, 'a/one/one.obj'))).toBe(true);
  });

  it('creates a nested group and refuses a duplicate', async () => {
    await mkdir(join(root, 'a'));
    expect(await lib().newGroup({ repoId: 'r', parent: 'a', name: 'sub' })).toEqual({ ok: true, value: { path: 'a/sub' } });
    expect(await lib().newGroup({ repoId: 'r', parent: 'a', name: 'sub' })).toMatchObject({ ok: false });
    expect(await lib().newGroup({ repoId: 'r', parent: '', name: 'top' })).toEqual({ ok: true, value: { path: 'top' } });
  });

  it('refuses paths that escape the model root', async () => {
    await mkdir(join(root, 'a'));
    expect(await lib().delete({ repoId: 'r', path: '../x' })).toMatchObject({ ok: false });
    expect(await lib().rename({ repoId: 'r', path: 'a/../..', to: 'z' })).toMatchObject({ ok: false });
    expect(await lib().move({ repoId: 'r', path: 'a', toGroup: '../../etc' })).toMatchObject({ ok: false });
  });
});
