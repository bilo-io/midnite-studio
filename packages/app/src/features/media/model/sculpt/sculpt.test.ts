import { decodeMeshBin, EditableMesh, encodeMeshBin, modelAssetHash, type GitOpResult, type ModelMeshResult, type ModelOpEntry, type ModelSpec } from '@midnite/studio-shared';
import { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';

import { editorReducer, initialEditorState, type EditorAction, type EditorState } from '../editor-state';
import { lazyFollow, pointerPressure } from './lazy';
import { SculptSession, type SculptPort } from './sculpt-client';
import { SculptController, uniformScale, worldPerPixel, type SculptIO } from './sculpt-controller';
import { applySculptDelta, applySculptMask, createSculptGeometry, maskShade } from './sculpt-display';
import { createSculptHost } from './sculpt-host';
import type { SculptRequest, SculptResponse } from './sculpt-protocol';

/** A flat `n × n` grid in XZ, normals up — a draw dab is a pure +Y move. */
function gridBytes(n: number): Uint8Array {
  const positions: number[] = [];
  for (let z = 0; z <= n; z += 1) for (let x = 0; x <= n; x += 1) positions.push(x / n - 0.5, 0, z / n - 0.5);
  const at = (x: number, z: number): number => z * (n + 1) + x;
  const indices: number[] = [];
  for (let z = 0; z < n; z += 1) for (let x = 0; x < n; x += 1) indices.push(at(x, z), at(x, z + 1), at(x + 1, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1));
  const mesh = new EditableMesh({ positions: new Float32Array(positions), indices: new Uint32Array(indices) });
  return encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0 });
}

/** A session wired straight to the host, replies delivered asynchronously like a real worker's. */
function session(): { session: SculptSession; transfers: Transferable[][] } {
  const transfers: Transferable[][] = [];
  const port: SculptPort = {
    onmessage: null,
    postMessage: (message: SculptRequest) => host(message),
    terminate: () => undefined,
  };
  const host = createSculptHost((message: SculptResponse, transfer) => {
    transfers.push(transfer ?? []);
    queueMicrotask(() => port.onmessage?.({ data: message } as MessageEvent<SculptResponse>));
  });
  return { session: new SculptSession(port), transfers };
}

const BRUSH = { brush: 'draw' as const, radius: 0.2, strength: 1, falloff: 'smooth' as const, spacing: 0.1 };
const NO_SYM = { x: false, y: false, z: false, space: 'local' as const };
const DOWN = { origin: [0, 1, 0] as [number, number, number], dir: [0, -1, 0] as [number, number, number] };

describe('sculpt worker pipeline', () => {
  it('strokes a region and hands back only the changed vertex range as transferables', async () => {
    const { session: s, transfers } = session();
    const loaded = await s.load(gridBytes(20));
    expect(loaded).toMatchObject({ vertices: 441, triangles: 800, revision: 0, levels: [0] });
    expect(transfers.at(-1)).toHaveLength(4);

    const geometry = createSculptGeometry(loaded);
    await s.strokeBegin(BRUSH, NO_SYM);
    const edit = await s.strokeTo(DOWN.origin, DOWN.dir);
    expect(edit.hit?.point[1]).toBeCloseTo(0, 6);
    const delta = edit.delta!;
    expect(delta.end - delta.start).toBeLessThan(441);
    expect(transfers.at(-1)).toHaveLength(2);
    applySculptDelta(geometry, delta);
    const position = geometry.getAttribute('position') as BufferAttribute;
    expect(position.updateRanges).toEqual([{ start: delta.start * 3, count: (delta.end - delta.start) * 3 }]);
    const centre = 10 * 21 + 10;
    expect(position.getY(centre)).toBeGreaterThan(0);
    expect(position.getY(0)).toBe(0);

    const end = await s.strokeEnd();
    expect(end.revision).toBe(1);
    expect(end.summary).toMatchObject({ brush: 'draw', dabs: 1 });
  });

  it('seeks back and forth through stroke history', async () => {
    const { session: s } = session();
    const geometry = createSculptGeometry(await s.load(gridBytes(10)));
    await s.strokeBegin(BRUSH, NO_SYM);
    applySculptDelta(geometry, (await s.strokeTo(DOWN.origin, DOWN.dir)).delta!);
    await s.strokeEnd();
    const centre = 5 * 11 + 5;
    const raised = (geometry.getAttribute('position') as BufferAttribute).getY(centre);
    const back = await s.seek(0);
    expect(back).toMatchObject({ ok: true, revision: 0 });
    applySculptDelta(geometry, back.delta!);
    expect((geometry.getAttribute('position') as BufferAttribute).getY(centre)).toBe(0);
    const forward = await s.seek(1);
    applySculptDelta(geometry, forward.delta!);
    expect((geometry.getAttribute('position') as BufferAttribute).getY(centre)).toBeCloseTo(raised, 6);
    expect((await s.seek(9)).ok).toBe(false);
  });

  it('masks show as vertex colour, and subdivide / level steps post a whole new mesh', async () => {
    const { session: s } = session();
    const geometry = createSculptGeometry(await s.load(gridBytes(4)));
    const masked = await s.mask('invert');
    expect(masked.changed).toBe(true);
    applySculptMask(geometry, masked.mask!);
    expect((geometry.getAttribute('color') as BufferAttribute).getX(0)).toBeCloseTo(maskShade(1));
    const up = await s.subdivide();
    expect(up.mesh).toMatchObject({ vertices: 25 + 56, multiresLevel: 1, levels: [0, 1] });
    expect(up.revision).toBe(2);
    const down = await s.setLevel(0);
    expect(down.mesh.vertices).toBe(25);
    // An open grid has no inside to remesh: the error comes back and nothing changes.
    await expect(s.voxelRemesh({ voxelSize: 0.2 })).rejects.toThrow(/no surface/);
    const back = await s.seek(2);
    expect(back.mesh?.vertices).toBe(81);
  });

  it('raycasts with a surface normal and serializes what it holds', async () => {
    const { session: s } = session();
    await s.load(gridBytes(10));
    const hit = await s.raycast([0, 5, 0], [0, -1, 0]);
    expect(hit!.normal[1]).toBeCloseTo(1);
    const saved = await s.serialize();
    expect(saved).toMatchObject({ vertices: 121, triangles: 200, multiresLevel: 0, revision: 0 });
    expect(decodeMeshBin(saved.bytes).positions.length).toBe(363);
  });

  it('answers errors as rejections, not crashes', async () => {
    const { session: s } = session();
    await expect(s.strokeTo([0, 0, 0], [0, -1, 0])).rejects.toThrow(/No sculpt mesh/);
    await expect(s.load(new TextEncoder().encode('nope, not a mesh at all, really not'))).rejects.toThrow(/not a sculpt mesh/);
  });
});

describe('lazy mouse and pressure', () => {
  it('trails the pointer by the radius', () => {
    expect(lazyFollow([0, 0], [5, 0], 10)).toEqual([0, 0]);
    expect(lazyFollow([0, 0], [30, 40], 10)).toEqual([24, 32]);
    expect(lazyFollow([0, 0], [3, 4], 0)).toEqual([3, 4]);
  });

  it('reads a pen, ignores a mouse', () => {
    expect(pointerPressure({ pointerType: 'pen', pressure: 0.3 })).toBe(0.3);
    expect(pointerPressure({ pointerType: 'mouse', pressure: 0.5 })).toBe(1);
  });

  it('converts screen pixels to world size', () => {
    expect(worldPerPixel({ ortho: true, zoom: 100 }, 5, 800)).toBeCloseTo(0.01);
    expect(worldPerPixel({ ortho: false, fovDeg: 90 }, 1, 2)).toBeCloseTo(1);
    expect(uniformScale([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1])).toBeCloseTo(2);
  });
});

describe('SculptController', () => {
  const bytes = gridBytes(10);
  const hash = modelAssetHash(bytes);
  const spec: ModelSpec = {
    name: 'Bust',
    parts: [
      {
        id: 'p1',
        name: 'head',
        shape: 'sculpt',
        src: 'bust.p1.mesh.bin',
        hash,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#cccccc',
        sdf: { tree: { nodes: [{ name: 'ball', kind: 'sphere', radius: 0.5 }] }, resolution: 64 },
      } as unknown as ModelSpec['parts'][number],
    ],
  } as ModelSpec;

  function rig() {
    const files = new Map<string, Uint8Array>([['bust.p1.mesh.bin', bytes]]);
    const writes: { src: string; ops: ModelOpEntry[] }[] = [];
    const ok = (value: ModelMeshResult): GitOpResult<ModelMeshResult> => ({ ok: true, value });
    const io: SculptIO = {
      stem: 'bust',
      read: async (src) => (files.has(src) ? ok({ data: files.get(src)!.slice() }) : { ok: false, kind: 'error', message: 'missing' }),
      write: async ({ src, data, ops }) => {
        files.set(src, data.slice());
        writes.push({ src, ops });
        return ok({});
      },
      readOps: async () => ok({ entries: [{ kind: 'sdf', at: '2026-10-06T00:00:00.000Z', by: 'user' }] }),
    };
    let state: EditorState = initialEditorState(spec, 'models/bust.json');
    const dispatch = (action: EditorAction) => {
      state = editorReducer(state, action);
    };
    const controller = new SculptController(async () => session().session, io, dispatch);
    return { controller, io, writes, files, get state() {
      return state;
    }, dispatch };
  }

  const centreY = (controller: SculptController): number => (controller.getSnapshot().geometry!.getAttribute('position') as BufferAttribute).getY(5 * 11 + 5);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('a stroke is one undo step; undo and redo walk the live mesh', async () => {
    const r = rig();
    expect(await r.controller.enter(r.state.spec, 0)).toBe(true);
    expect(r.controller.getSnapshot()).toMatchObject({ status: 'ready', vertices: 121, revision: 0 });
    r.controller.beginStroke(DOWN, { radius: 0.3 });
    r.controller.moveStroke({ origin: [0.05, 1, 0], dir: [0, -1, 0] });
    const summary = await r.controller.endStroke();
    expect(summary?.moved).toBeGreaterThan(0);
    const part = r.state.spec.parts[0]!;
    expect(part).toMatchObject({ revision: 1 });
    expect('sdf' in part).toBe(false); // the first stroke ends the SDF history
    expect(r.state.past).toHaveLength(1);
    const raised = centreY(r.controller);
    expect(raised).toBeGreaterThan(0);

    r.dispatch({ type: 'undo' });
    await r.controller.sync(r.state.spec);
    expect(centreY(r.controller)).toBe(0);
    expect(r.controller.getSnapshot().revision).toBe(0);
    r.dispatch({ type: 'redo' });
    await r.controller.sync(r.state.spec);
    expect(centreY(r.controller)).toBeCloseTo(raised, 6);
  });

  it('flushes to a content-named file with the op log carried over, without a history step', async () => {
    const r = rig();
    await r.controller.enter(r.state.spec, 0);
    r.controller.beginStroke(DOWN, { radius: 0.3 });
    await r.controller.endStroke();
    await r.controller.maskOp('invert');
    expect(r.state.spec.parts[0]).toMatchObject({ revision: 2 });
    const past = r.state.past.length;
    const flushed = await r.controller.flush(r.state.spec);
    expect(flushed.ok).toBe(true);
    const write = r.writes[0]!;
    expect(write.src).toMatch(/^bust\.p1\.[0-9a-f]{8}\.mesh\.bin$/);
    expect(write.ops.map((o) => o.kind)).toEqual(['sdf', 'stroke', 'mask', 'save']);
    const part = r.state.spec.parts[0]!;
    expect(part).toMatchObject({ src: write.src, revision: 2 });
    expect(r.state.past).toHaveLength(past);
    if (!flushed.ok) throw new Error('unreachable');
    expect(flushed.spec.parts[0]).toMatchObject({ src: write.src });
    // Nothing new: a second flush writes nothing, and the new hash is known (no reload).
    await r.controller.flush(r.state.spec);
    expect(r.writes).toHaveLength(1);
    await r.controller.sync(r.state.spec);
    expect(r.controller.getSnapshot().geometryEpoch).toBe(1);
    // Undo past the save: the old hash is still this session's, so the worker seeks instead of reloading.
    r.dispatch({ type: 'undo' });
    await r.controller.sync(r.state.spec);
    expect(r.controller.getSnapshot()).toMatchObject({ revision: 1, geometryEpoch: 1, unsaved: true });
  });

  it('a mask stroke darkens the vertex colour and moves nothing', async () => {
    const r = rig();
    await r.controller.enter(r.state.spec, 0);
    r.controller.setSettings({ brush: 'mask', strength: 1 });
    r.controller.beginStroke(DOWN, { radius: 0.3 });
    r.controller.moveStroke({ origin: [0.1, 1, 0], dir: [0, -1, 0] });
    const summary = await r.controller.endStroke();
    expect(summary).toMatchObject({ brush: 'mask', moved: 0 });
    expect(summary!.masked).toBeGreaterThan(0);
    const color = r.controller.getSnapshot().geometry!.getAttribute('color') as BufferAttribute;
    expect(color.getX(5 * 11 + 5)).toBeLessThan(0.5);
    expect(centreY(r.controller)).toBe(0);
  });

  it('subdivide records the new level and counts on the part', async () => {
    const r = rig();
    await r.controller.enter(r.state.spec, 0);
    expect(await r.controller.subdivide()).toBeNull();
    expect(r.state.spec.parts[0]).toMatchObject({ revision: 1, multiresLevel: 1, vertices: 121 + 320 });
    r.dispatch({ type: 'undo' });
    await r.controller.sync(r.state.spec);
    expect(r.controller.getSnapshot()).toMatchObject({ vertices: 121, level: 0 });
  });

  it('refuses a part whose file changed, and leaves when the part is removed', async () => {
    const r = rig();
    r.files.set('bust.p1.mesh.bin', gridBytes(4));
    expect(await r.controller.enter(r.state.spec, 0)).toBe(false);
    expect(r.controller.getSnapshot().error).toMatch(/changed/);
    r.files.set('bust.p1.mesh.bin', bytes);
    expect(await r.controller.enter(r.state.spec, 0)).toBe(true);
    await r.controller.sync({ ...r.state.spec, parts: [] });
    await settle();
    expect(r.controller.getSnapshot().status).toBe('idle');
  });

  it('F-drags radius and strength, and cancel puts them back', async () => {
    const r = rig();
    r.controller.startAdjust('radius', 100);
    r.controller.updateAdjust(150);
    expect(r.controller.getSnapshot().settings.screenRadius).toBe(98);
    r.controller.endAdjust(true);
    expect(r.controller.getSnapshot().settings.screenRadius).toBe(48);
    r.controller.startAdjust('strength', 0);
    r.controller.updateAdjust(150);
    r.controller.endAdjust();
    expect(r.controller.getSnapshot().settings.strength).toBeCloseTo(1);
    r.controller.stepRadius(1);
    expect(r.controller.getSnapshot().settings.screenRadius).toBe(55);
  });
});
