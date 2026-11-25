// vitest/jsdom: the renderer's answers to select / frame / view over the store and a stub editor — the real
// capture (WebGL, OffscreenCanvas) is exercised by the human gate, so the editor's controls are stubbed here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerEditorControls, type LevelEditorControls } from './level-editor-controls';
import { toEditLevel } from './level-edit-model';
import { useLevelStore } from './level-store';
import { answerLevelEditorRequest } from './use-level-editor-bridge';
import { blankLevel3d } from './test-helpers';

const data = (level: unknown) => ({ level, issues: [], images: [] }) as never;

function controls(over: Partial<LevelEditorControls> = {}): LevelEditorControls {
  return {
    mode: () => 'plan',
    can3d: () => true,
    terrain: () => null,
    frame: vi.fn(),
    show3d: vi.fn(async () => true),
    capture3d: vi.fn(async () => ({ png: 'AAAA', camera: { position: [0, 1, 2] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 50 }, objects: 3, width: 960, height: 600 })),
    capturePlan: vi.fn(async () => ({ png: 'BBBB', camera: null, objects: 3, width: 960, height: 600 })),
    ...over,
  };
}

const spawnId = () => toEditLevel(blankLevel3d())!.layers.find((l) => l.type === 'objectgroup')!.objects![0]!.id;

describe('select / frame / view requests (Phase 138 G, H)', () => {
  let unregister: () => void = () => undefined;
  beforeEach(() => {
    useLevelStore.setState({ byGame: {} });
    useLevelStore.getState().open('g1', 'level', data(blankLevel3d()));
  });
  afterEach(() => unregister());

  it('G1: select answers the found ids and the missing ones, selects them and pulses', async () => {
    const c = controls();
    unregister = registerEditorControls('g1', c);
    const id = spawnId();
    const answer = answerLevelEditorRequest({ kind: 'select', gameId: 'g1', scene: 'level', ids: [id, 999], frame: true });
    expect(answer).toEqual({ handled: true, value: { selected: [id], missing: [999] } });
    const entry = useLevelStore.getState().byGame.g1!;
    expect(entry.edit.selection).toMatchObject({ objectId: id });
    expect(entry.highlight?.ids).toEqual([id]);
    expect(c.frame).toHaveBeenCalledTimes(1);
  });

  it('select with frame false leaves the camera alone', () => {
    const c = controls();
    unregister = registerEditorControls('g1', c);
    answerLevelEditorRequest({ kind: 'select', gameId: 'g1', scene: 'level', ids: [spawnId()], frame: false });
    expect(c.frame).not.toHaveBeenCalled();
  });

  it('frame moves the camera to a region, and answers the view; unknown ids fail', () => {
    const c = controls({ mode: () => '3d' });
    unregister = registerEditorControls('g1', c);
    const region = { x: 0, y: 0, width: 64, height: 64 };
    expect(answerLevelEditorRequest({ kind: 'frame', gameId: 'g1', scene: 'level', region })).toEqual({ handled: true, value: { view: '3d' } });
    expect(c.frame).toHaveBeenCalledWith(region, []);
    expect(answerLevelEditorRequest({ kind: 'frame', gameId: 'g1', scene: 'level', ids: [999] })).toMatchObject({ ok: false });
  });

  it('answers not-open for another scene', () => {
    unregister = registerEditorControls('g1', controls());
    expect(answerLevelEditorRequest({ kind: 'select', gameId: 'g1', scene: 'other', ids: [], frame: true })).toEqual({ handled: false, reason: 'not-open' });
  });

  it('H3: a 3D view against the Floorplan shows 3D first, then captures', async () => {
    const order: string[] = [];
    const c = controls({
      show3d: vi.fn(async () => (order.push('show3d'), true)),
      capture3d: vi.fn(async () => (order.push('capture3d'), { png: 'AAAA', camera: null, objects: 1, width: 960, height: 600 })),
    });
    unregister = registerEditorControls('g1', c);
    const answer = await answerLevelEditorRequest({ kind: 'view', gameId: 'g1', scene: 'level', view: '3d', preset: 'iso', width: 960, height: 600 });
    expect(order).toEqual(['show3d', 'capture3d']);
    expect(answer).toMatchObject({ handled: true, value: { png: 'AAAA', view: '3d' } });
  });

  it('a plan view, or a level with no 3D view, captures the plan; preset selection passes the selection bounds', async () => {
    const c = controls({ can3d: () => false });
    unregister = registerEditorControls('g1', c);
    useLevelStore.getState().update('g1', (s) => ({ ...s, selected: [{ layerId: s.level.layers.find((l) => l.type === 'objectgroup')!.id!, objectId: spawnId() }] }));
    const answer = await answerLevelEditorRequest({ kind: 'view', gameId: 'g1', scene: 'level', view: '3d', preset: 'selection', width: 960, height: 600 });
    expect(c.capture3d).not.toHaveBeenCalled();
    expect(c.capturePlan).toHaveBeenCalledWith(expect.objectContaining({ rect: expect.objectContaining({ width: expect.any(Number) }) }));
    expect(answer).toMatchObject({ handled: true, value: { view: 'plan' } });
  });

  it('a 3D view that never opens fails with a message instead of hanging', async () => {
    unregister = registerEditorControls('g1', controls({ show3d: async () => false }));
    expect(await answerLevelEditorRequest({ kind: 'view', gameId: 'g1', scene: 'level', view: '3d', preset: 'top', width: 960, height: 600 })).toMatchObject({ ok: false });
  });
});
