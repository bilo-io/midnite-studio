import { createPaintImage, encodeMeshBin, modelAssetHash, ok, type GitOpResult, type ModelMeshResult, type ModelSculptPart, type ModelSpec } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { editorReducer, initialEditorState, type EditorAction } from './editor-state';
import { PaintPanel } from './paint-panel';
import { PaintController, type PaintIO } from './paint/paint-controller';
import { decodePng, encodePng } from './paint/png';

/**
 * vitest/jsdom: Theme G's editor side — the PNG codec, the paint controller over a fake IO (strokes, undo,
 * re-flattening on a stack change, the flush) and the Paint tab's DOM. No browser capability is needed: the
 * brushes and the flattening are pure TS and the panel is plain DOM; the viewport is covered by the screenshot spec.
 */
afterEach(cleanup);

/** A unit square facing +z, uv = (x, 1 − y). */
const PLANE = encodeMeshBin({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
  multiresLevel: 0,
});
const UV = { charts: 1, density: { mean: 64, min: 64, max: 64 }, textureSize: 64, coverage: 1 };
const SPEC = {
  name: 'Tile',
  parts: [{ id: 'p1', name: 'tile', shape: 'sculpt', src: 'tile.p1.mesh.bin', hash: modelAssetHash(PLANE), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#808080', uv: UV }],
} as unknown as ModelSpec;

function fakeIO(): { io: PaintIO; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>([['tile.p1.mesh.bin', PLANE]]);
  const result = (value: ModelMeshResult): GitOpResult<ModelMeshResult> => ok(value);
  return {
    files,
    io: {
      stem: 'tile',
      readMesh: async (src) => (files.has(src) ? result({ data: files.get(src)!.slice() }) : { ok: false, kind: 'error', message: 'missing' }),
      readFile: async (src) => files.get(src) ?? null,
      writeTexture: async (src, data) => {
        files.set(src, data);
        return result({ texture: { src, hash: modelAssetHash(data), width: 64, height: 64 } });
      },
    },
  };
}

const down = { origin: [0.25, 0.75, 1] as [number, number, number], dir: [0, 0, -1] as [number, number, number] };
const alpha = (data: Uint8Array, x: number, y: number, size = 64): number => data[(y * size + x) * 4 + 3]!;

describe('the renderer PNG codec', () => {
  it('round-trips RGBA exactly, low alpha included', () => {
    const image = createPaintImage(8);
    for (let i = 0; i < image.data.length; i += 1) image.data[i] = (i * 37) % 256;
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(8);
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
  });
});

describe('the paint controller', () => {
  it('paints the active layer at the hit, undoes and redoes, and flushes PNGs plus the flattened set', async () => {
    const { io, files } = fakeIO();
    const actions: EditorAction[] = [];
    let spec = SPEC;
    const controller = new PaintController(io, (action) => {
      actions.push(action);
      if (action.type === 'patch') spec = editorReducer(initialEditorState(spec), action).spec;
    });
    expect(await controller.enter(spec, 0)).toBe(true);
    const snap = controller.getSnapshot();
    expect(snap.status).toBe('ready');
    expect(snap.textures!.baseColor.image.width).toBe(64);
    // Base colour flattened from the part colour.
    expect(Array.from(snap.textures!.baseColor.image.data.subarray(0, 4))).toEqual([128, 128, 128, 255]);

    controller.setSettings({ color: '#ff0000', radiusUnit: 'world', strength: 1, falloff: 'constant' });
    expect(controller.beginStroke(spec, down, { radius: 0.1 })).toBe(true);
    // The first stroke made a paint layer, as one reducer step.
    expect(actions[0]).toMatchObject({ type: 'patch', patch: { pbr: { layers: [{ id: 'paint', kind: 'paint' }] } } });
    controller.endStroke();
    const layer = controller.layerImage('paint', 'albedo')!;
    expect(alpha(layer.data, 16, 16)).toBe(255);
    const base = controller.getSnapshot().textures!.baseColor.image.data;
    expect(Array.from(base.subarray((16 * 64 + 16) * 4, (16 * 64 + 16) * 4 + 3))).toEqual([255, 0, 0]);
    expect(controller.getSnapshot()).toMatchObject({ undo: 1, redo: 0, unsaved: true });

    controller.undo();
    expect(alpha(layer.data, 16, 16)).toBe(0);
    expect(Array.from(base.subarray((16 * 64 + 16) * 4, (16 * 64 + 16) * 4 + 3))).toEqual([128, 128, 128]);
    controller.redo();
    expect(alpha(layer.data, 16, 16)).toBe(255);

    const out = await controller.flush(spec);
    if (!out.ok) throw new Error(out.error);
    const part = out.spec.parts[0] as ModelSculptPart;
    expect(part.pbr!.layers[0]!.maps!.albedo!.src).toMatch(/^tile\.p1\.paint-albedo\.[0-9a-f]{8}\.png$/);
    expect(Object.keys(part.pbr!.flattened!).sort()).toEqual(['baseColor', 'orm']);
    expect(files.has(part.pbr!.flattened!.baseColor!.src)).toBe(true);
    expect(actions.at(-1)).toMatchObject({ type: 'paintFlushed', id: 'p1' });
    expect(controller.getSnapshot().unsaved).toBe(false);
    // Nothing new: a second flush writes nothing.
    const count = files.size;
    await controller.flush(out.spec);
    expect(files.size).toBe(count);
  });

  it('re-flattens when the stack changes in the design, and reopens with the saved layer', async () => {
    const { io } = fakeIO();
    let spec = SPEC;
    const controller = new PaintController(io, (action) => {
      if (action.type === 'patch' || action.type === 'paintFlushed') spec = editorReducer(initialEditorState(spec), action).spec;
    });
    await controller.enter(spec, 0);
    const withFill = {
      ...spec,
      parts: [{ ...spec.parts[0]!, pbr: { layers: [{ id: 'fill', name: 'Fill', kind: 'fill', fill: { albedo: '#0000ff', roughness: 0.2 } }] } }],
    } as ModelSpec;
    await controller.sync(withFill);
    const snap = controller.getSnapshot();
    expect(Array.from(snap.textures!.baseColor.image.data.subarray(0, 3))).toEqual([0, 0, 255]);
    expect(snap.textures!.orm.image.data[1]).toBe(Math.round(0.2 * 255));
    expect(snap.unsaved).toBe(true);

    controller.setSettings({ color: '#00ff00', radiusUnit: 'world', falloff: 'constant', strength: 1 });
    spec = withFill;
    controller.beginStroke(spec, down, { radius: 0.1 });
    controller.endStroke();
    const flushed = await controller.flush(spec);
    if (!flushed.ok) throw new Error(flushed.error);
    await controller.dispose();
    // Reopening reads the layer PNG back.
    expect(await controller.enter(flushed.spec, 0)).toBe(true);
    expect(alpha(controller.layerImage('paint', 'albedo')!.data, 16, 16)).toBe(255);
  });

  it('refuses a part without uvs, saying how to get them', async () => {
    const { io } = fakeIO();
    const controller = new PaintController(io, () => undefined);
    const bare = { ...SPEC, parts: [{ ...SPEC.parts[0]!, uv: undefined }] } as unknown as ModelSpec;
    expect(await controller.enter(bare, 0)).toBe(false);
    expect(controller.getSnapshot().error).toContain('model_unwrap');
  });
});

function Harness({ io, spec = SPEC }: { io: PaintIO; spec?: ModelSpec }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(spec));
  const ref = useRef<(a: EditorAction) => void>(dispatch);
  const controller = useMemo(() => new PaintController(io, (a) => ref.current(a)), [io]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return (
    <>
      <span data-testid="layers">{((state.spec.parts[0] as ModelSculptPart).pbr?.layers ?? []).map((l) => l.id).join(',')}</span>
      <span data-testid="colour">{state.spec.parts[0]!.color}</span>
      <PaintPanel state={state} dispatch={dispatch} controller={controller} snapshot={snapshot} />
    </>
  );
}

describe('the Paint tab', () => {
  it('opens the part, picks brushes and channels, manages layers and presets, and saves on Done', async () => {
    const { io, files } = fakeIO();
    render(<Harness io={io} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paint tile' }));
    await waitFor(() => expect(screen.getByTestId('paint-status').textContent).toContain('Painting tile'));

    const fill = screen.getByRole('radio', { name: 'Fill' });
    fireEvent.click(fill);
    expect(fill.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Clone' }));
    expect(screen.getByTestId('paint-clone-hint').textContent).toContain('Alt-click');

    fireEvent.click(screen.getByRole('button', { name: 'Fill layer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paint layer' }));
    expect(screen.getByTestId('layers').textContent).toBe('fill,paint');
    fireEvent.click(screen.getByRole('button', { name: 'Move Paint down' }));
    expect(screen.getByTestId('layers').textContent).toBe('paint,fill');
    fireEvent.change(screen.getByRole('combobox', { name: 'Fill blend mode' }), { target: { value: 'multiply' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Fill mask' }), { target: { value: '!cavity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Fill' }));
    expect(screen.getByRole('button', { name: 'Show Fill' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Paint' }));
    expect(screen.getByTestId('layers').textContent).toBe('fill');

    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), { target: { value: 'wood' } });
    expect(screen.getByTestId('layers').textContent).toBe('grain,rings,dirt');
    expect(screen.getByTestId('colour').textContent).toBe('#8a5a33');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done painting' }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Paint tile' })).toBeTruthy());
    expect([...files.keys()].some((k) => /pbr-baseColor/.test(k))).toBe(true);
  });

  it('says a part needs an unwrap first', () => {
    const { io } = fakeIO();
    const bare = { ...SPEC, parts: [{ ...SPEC.parts[0]!, uv: undefined }] } as unknown as ModelSpec;
    render(<Harness io={io} spec={bare} />);
    expect((screen.getByRole('button', { name: 'Paint tile' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('paint-needs-uv').textContent).toContain('model_unwrap');
  });

  it('the reducer adopts flushed textures without a history step', () => {
    const start = initialEditorState(SPEC);
    const flushed = editorReducer(start, { type: 'paintFlushed', id: 'p1', pbr: { layers: [], flattened: { baseColor: { src: 'a.png', hash: 'abcdef12' } } } });
    expect(flushed.past).toHaveLength(0);
    expect((flushed.spec.parts[0] as ModelSculptPart).pbr!.flattened!.baseColor!.src).toBe('a.png');
  });
});
