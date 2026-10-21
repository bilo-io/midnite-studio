import type { ModelLibraryGroup, ModelLibraryModel, ModelLibraryNode, ModelManifest } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  agentTooltip,
  canDrop,
  collectGroups,
  countFiles,
  countModels,
  designFile,
  findNode,
  modelFilePath,
  primaryFile,
  splitProjectPath,
  visibleFiles,
} from './library-tree';
import { resolveCentre, selectionForGenerated } from './model-centre';

const manifest = (agent: ModelManifest['agent'], files: ModelManifest['files'] = {}): ModelManifest => ({
  version: 1,
  name: 'm',
  agent,
  author: { name: 'x' },
  prompt: '',
  details: { vertices: 0, polygons: 0, parts: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] }, materials: [] },
  files,
  createdAt: 'now',
});

const model = (path: string, names: string[], extra: Partial<ModelLibraryModel> = {}): ModelLibraryModel => ({
  kind: 'model',
  name: path.split('/').pop()!,
  path,
  manifest: null,
  files: names.map((name) => ({ name, size: 1, mtimeMs: 1 })),
  legacy: false,
  mtimeMs: 1,
  ...extra,
});
const group = (path: string, children: ModelLibraryNode[]): ModelLibraryGroup => ({ kind: 'group', name: path.split('/').pop()!, path, children, mtimeMs: 1 });

const fox = model('animals/fox', ['fox.obj', 'fox.mtl', 'fox.fbx', 'fox.glb', 'fox.json', 'model.json'], {
  manifest: manifest({ provider: 'claude', model: 'sonnet-5', iterative: true }, { design: 'fox.json', obj: 'fox.obj' }),
});
const bare = model('animals/wolf', ['wolf.glb']);
const flat = model('animals/old', ['old.obj', 'old.json'], { legacy: true });
const tree: ModelLibraryNode[] = [group('animals', [fox, bare, flat, group('animals/birds', [model('animals/birds/owl', ['owl.obj', 'owl.json'])])]), group('empty', [])];

describe('library tree', () => {
  it('finds nodes by path, counts models and files, and lists every group', () => {
    expect(findNode(tree, 'animals/birds/owl')?.kind).toBe('model');
    expect(findNode(tree, 'nope')).toBeNull();
    expect(countModels(tree)).toBe(4);
    expect(countFiles(tree[0]!)).toBe(6 + 1 + 2 + 2);
    expect(collectGroups(tree).map((g) => g.path)).toEqual(['animals', 'animals/birds', 'empty']);
    expect(splitProjectPath('a/b/c')).toEqual({ project: 'a', rest: 'b/c' });
  });

  it('hides the .mtl and picks the manifest-declared obj as the primary file', () => {
    expect(visibleFiles(fox).map((f) => f.name)).not.toContain('fox.mtl');
    expect(primaryFile(fox)).toBe('fox.obj');
    expect(primaryFile(bare)).toBe('wolf.glb');
    expect(designFile(fox)).toBe('fox.json');
    expect(designFile(bare)).toBeNull();
    expect(modelFilePath(fox)).toEqual({ project: 'animals', path: 'fox/fox.obj' });
    // a legacy model's files sit in its group, not in a folder of its own
    expect(modelFilePath(flat)).toEqual({ project: 'animals', path: 'old.obj' });
  });

  it('names the specific model in the provider tooltip', () => {
    expect(agentTooltip(fox)).toBe('Claude · sonnet-5 (iterative)');
    expect(agentTooltip(model('g/x', ['x.obj'], { manifest: manifest({ provider: 'ollama', model: 'qwen2.5-coder:7b' }) }))).toBe('Ollama · qwen2.5-coder:7b');
    expect(agentTooltip(bare)).toMatch(/No model\.json/);
  });
});

describe('drop rules', () => {
  it('moves a model between groups, but not onto the root, its own parent or a descendant', () => {
    expect(canDrop({ path: 'a/m', kind: 'model' }, { path: 'b', kind: 'group' }).ok).toBe(true);
    expect(canDrop({ path: 'a/m', kind: 'model' }, { path: '', kind: 'root' }).ok).toBe(false);
    expect(canDrop({ path: 'a/m', kind: 'model' }, { path: 'a', kind: 'group' }).ok).toBe(false);
    expect(canDrop({ path: 'a', kind: 'group' }, { path: 'a/b', kind: 'group' }).ok).toBe(false);
    expect(canDrop({ path: 'a/b', kind: 'group' }, { path: '', kind: 'root' }).ok).toBe(true);
    expect(canDrop({ path: 'a', kind: 'group' }, { path: '', kind: 'root' }).ok).toBe(false); // already top level
  });
});

describe('centre pane switching', () => {
  const pick = (kind: 'model' | 'file' | 'group', path: string) => resolveCentre({ kind, path }, tree);

  it('a generation folder opens the 3D editor on its design', () => {
    expect(pick('model', 'animals/fox')).toEqual({ kind: 'editor', project: 'animals', path: 'fox/fox.obj' });
    expect(pick('model', 'animals/old')).toEqual({ kind: 'editor', project: 'animals', path: 'old.obj' });
  });

  it('a folder with no design shows its 3D file read-only', () => {
    expect(pick('model', 'animals/wolf')).toEqual({ kind: 'viewer', project: 'animals', path: 'wolf/wolf.glb', format: 'glb' });
  });

  it('the design file opens the editor; model.json and other .json open the JSON viewer', () => {
    expect(pick('file', 'animals/fox/fox.json')).toEqual({ kind: 'editor', project: 'animals', path: 'fox/fox.obj' });
    expect(pick('file', 'animals/fox/model.json')).toEqual({ kind: 'json', project: 'animals', path: 'fox/model.json' });
    expect(pick('file', 'animals/fox/notes.json')).toEqual({ kind: 'json', project: 'animals', path: 'fox/notes.json' });
  });

  it('.obj, .fbx and .glb open the read-only viewer in their own format', () => {
    expect(pick('file', 'animals/fox/fox.obj')).toMatchObject({ kind: 'viewer', format: 'obj' });
    expect(pick('file', 'animals/fox/fox.fbx')).toMatchObject({ kind: 'viewer', format: 'fbx' });
    expect(pick('file', 'animals/fox/fox.glb')).toMatchObject({ kind: 'viewer', format: 'glb', path: 'fox/fox.glb' });
  });

  it('pictures show as images, anything else says there is no preview, a group shows nothing', () => {
    expect(pick('file', 'animals/fox/fox.ref.png')).toMatchObject({ kind: 'image' });
    expect(pick('file', 'animals/fox/readme.txt')).toMatchObject({ kind: 'unsupported' });
    expect(pick('group', 'animals')).toEqual({ kind: 'empty' });
    expect(resolveCentre(null, tree)).toEqual({ kind: 'empty' });
  });

  it('a finished generation selects its folder; a flat legacy file selects itself', () => {
    expect(selectionForGenerated('g', 'fox-1/fox-1.obj')).toEqual({ kind: 'model', path: 'g/fox-1' });
    expect(selectionForGenerated('g', 'fox-1.obj')).toEqual({ kind: 'file', path: 'g/fox-1.obj' });
  });
});
