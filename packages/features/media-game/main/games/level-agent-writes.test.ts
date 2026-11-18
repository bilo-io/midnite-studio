import { describe, expect, it, vi } from 'vitest';

import { ok, prefabFromObjects, type GitOpResult, type LevelEditorResult, type LevelEditorRequest, type LevelOp } from '@midnite/studio-shared';

import { LEVEL_EDITOR_TIMEOUT_MESSAGE } from './level-editor-bridge';
import { defaultLevelWriteLabel, writeLevelOps, type LevelAgentWriteDeps } from './level-agent-writes';

// vitest: the editor-or-file write path with a mock bridge and mock levels — nothing real is touched.
const map = (objects: unknown[]) => ({
  type: 'map',
  infinite: false,
  orientation: 'orthogonal',
  width: 10,
  height: 10,
  tilewidth: 16,
  tileheight: 16,
  nextobjectid: 10,
  tilesets: [],
  layers: [{ id: 1, name: 'Entities', type: 'objectgroup', objects }],
});
const spawn = { id: 1, name: '', type: 'spawn', x: 8, y: 8, width: 0, height: 0, rotation: 0, visible: true, point: true };
const add: LevelOp = { op: 'add', entity: { type: 'pickup', x: 16, y: 16 } };
const applied = { changeSetId: 'cs1', added: [2], updated: [], deleted: [], refs: {} };

type Answer = (req: LevelEditorRequest) => GitOpResult<LevelEditorResult>;
function make(answer: Answer, file: unknown = map([spawn])) {
  const set = vi.fn(async (_g: string, _s: string, _l: unknown) => ok({ sha: 'sha1' }));
  const request = vi.fn(async (req: LevelEditorRequest) => answer(req));
  const deps: LevelAgentWriteDeps = {
    levels: { get: async () => ok({ level: file, issues: [], images: [] }), set } as never,
    levelEditor: { request },
    modelAssets: async () => null,
  };
  const run = (ops: LevelOp[], over: { save?: boolean; prefab?: LevelAgentWriteDeps['prefab'] } = {}) =>
    writeLevelOps(over.prefab ? { ...deps, prefab: over.prefab } : deps, { gameId: 'g1', scene: 'level', ops, unit: 'px', save: over.save ?? false, select: true });
  return { run, set, request };
}
const editorAnswer: Answer = (req) =>
  req.kind === 'apply'
    ? ok({ handled: true, value: applied })
    : ok({ handled: true, value: { level: map([spawn, { ...spawn, id: 2, type: 'pickup' }]), dirty: true } });
const notOpen: Answer = () => ok({ handled: false, reason: 'not-open' });

describe('writeLevelOps', () => {
  it('E1: with the editor open it applies there and writes nothing', async () => {
    const { run, set } = make(editorAnswer);
    expect(await run([add])).toMatchObject({ ok: true, value: { applied: 'editor', changeSetId: 'cs1', added: [2], saved: false, sha: null } });
    expect(set).not.toHaveBeenCalled();
  });

  it('E2: save writes the editor snapshot once and reports the sha', async () => {
    const { run, set } = make(editorAnswer);
    expect(await run([add], { save: true })).toMatchObject({ ok: true, value: { applied: 'editor', saved: true, sha: 'sha1' } });
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(set.mock.calls[0]?.[2])).toContain('pickup');
  });

  it('E3: a closed editor writes the file once', async () => {
    const { run, set } = make(notOpen);
    const result = await run([add]);
    expect(result).toMatchObject({ ok: true, value: { applied: 'file', changeSetId: null, saved: true, sha: 'sha1', added: [10] } });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('falls back to the file when the editor times out', async () => {
    const { run, set } = make(() => ({ ok: false, kind: 'error', message: LEVEL_EDITOR_TIMEOUT_MESSAGE }));
    expect(await run([add])).toMatchObject({ ok: true, value: { applied: 'file' } });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('E4: an invalid batch writes nothing and names each bad op', async () => {
    const { run, set } = make(notOpen);
    const result = await run([{ op: 'update', id: 41, set: {} }, add, { op: 'add', entity: { type: 'dragon', x: 1, y: 1 } }]);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect('message' in result && result.message).toMatch(/op 0 \(update\): .*41/);
    expect('message' in result && result.message).toMatch(/op 2 \(add\)/);
    expect(set).not.toHaveBeenCalled();
  });

  it('passes the renderer’s own failure through (an invalid batch in the open editor)', async () => {
    const { run, set } = make(() => ({ ok: false, kind: 'error', message: 'op 0 (delete): no object with id 9' }));
    expect(await run([{ op: 'delete', id: 9 }])).toEqual({ ok: false, kind: 'error', message: 'op 0 (delete): no object with id 9' });
    expect(set).not.toHaveBeenCalled();
  });

  it('a read-only editor refuses', async () => {
    const { run } = make(() => ok({ handled: false, reason: 'read-only' }));
    expect(await run([add])).toMatchObject({ ok: false, message: 'The level is open read-only in the editor.' });
  });

  it('reports validation issues of the result, errors and warnings only', async () => {
    const { run } = make(notOpen, map([]));
    const result = await run([add]);
    expect(result.ok && result.value.issues.some((i) => i.rule === 'level/no-spawn')).toBe(true);
  });
});

describe('place-prefab', () => {
  const hut = prefabFromObjects('hut', '2d', [
    { type: 'pickup', x: 40, y: 40 },
    { type: 'pickup', x: 60, y: 40 },
    { type: 'pickup', x: 50, y: 60 },
  ]);
  const place: LevelOp = { op: 'place-prefab', prefab: 'hut', x: 80, y: 80 };

  it('I2: a closed editor gets three tagged objects in one commit', async () => {
    const { run, set } = make(notOpen);
    const result = await run([place], { prefab: async (_g, name) => (name === 'hut' ? hut : null) });
    expect(result).toMatchObject({ ok: true, value: { applied: 'file', added: [10, 11, 12] } });
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(set.mock.calls[0]?.[2])).toContain('midnite.prefabInstance');
  });

  it('an open editor receives the prefab files the batch names', async () => {
    const { run, request } = make(editorAnswer);
    await run([place], { prefab: async () => hut });
    const sent = request.mock.calls.find(([r]) => r.kind === 'apply')?.[0];
    expect(sent && sent.kind === 'apply' && sent.prefabs).toEqual({ hut });
  });

  it('an unknown prefab fails the batch by name', async () => {
    const { run, set } = make(notOpen);
    const result = await run([place], { prefab: async () => null });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('"hut"') });
    expect(set).not.toHaveBeenCalled();
  });

  it('labels a prefab-only batch', () => {
    expect(defaultLevelWriteLabel([place, place])).toBe('Place 2 prefabs');
  });
});

describe('defaultLevelWriteLabel', () => {
  it('names the batch', () => {
    const del: LevelOp = { op: 'delete', id: 1 };
    expect(defaultLevelWriteLabel([add, add, add])).toBe('Add 3 objects');
    expect(defaultLevelWriteLabel([del])).toBe('Delete 1 object');
    expect(defaultLevelWriteLabel([{ op: 'update', id: 1, set: {} }, { op: 'update', id: 2, set: {} }])).toBe('Update 2 objects');
    expect(defaultLevelWriteLabel([add, del])).toBe('Edit 2 objects');
  });
});
