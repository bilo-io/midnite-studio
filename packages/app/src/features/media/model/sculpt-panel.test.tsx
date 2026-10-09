import { EditableMesh, encodeMeshBin, modelAssetHash, ok, type GitOpResult, type ModelMeshResult, type ModelSpec } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveKey } from './editor-keys';
import { editorReducer, initialEditorState, type EditorAction } from './editor-state';
import { SculptPanel } from './sculpt-panel';
import { SculptSession, type SculptPort } from './sculpt/sculpt-client';
import { SculptController, type SculptIO } from './sculpt/sculpt-controller';
import { createSculptHost } from './sculpt/sculpt-host';
import type { SculptRequest, SculptResponse } from './sculpt/sculpt-protocol';
import { SHORTCUTS } from './shortcuts';

/**
 * vitest/jsdom: Theme D's editor side — the sculpt keys, the reducer's sculpt steps and the Sculpt tab's
 * DOM over the real worker host (no browser capability is needed: the brushes are pure TS and the panel
 * is plain DOM; the viewport's pointer plumbing is covered by the screenshot spec).
 */
afterEach(cleanup);

function gridBytes(n: number): Uint8Array {
  const positions: number[] = [];
  for (let z = 0; z <= n; z += 1) for (let x = 0; x <= n; x += 1) positions.push(x / n - 0.5, 0, z / n - 0.5);
  const at = (x: number, z: number): number => z * (n + 1) + x;
  const indices: number[] = [];
  for (let z = 0; z < n; z += 1) for (let x = 0; x < n; x += 1) indices.push(at(x, z), at(x, z + 1), at(x + 1, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1));
  const mesh = new EditableMesh({ positions: new Float32Array(positions), indices: new Uint32Array(indices) });
  return encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0 });
}

const BYTES = gridBytes(10);
const SPEC = {
  name: 'Bust',
  parts: [
    { id: 'p1', name: 'head', shape: 'sculpt', src: 'bust.p1.mesh.bin', hash: modelAssetHash(BYTES), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#cccccc', sdf: { tree: { nodes: [{ name: 'ball', kind: 'sphere', radius: 0.5 }] }, resolution: 64 } },
  ],
} as unknown as ModelSpec;

function startSession(): Promise<SculptSession> {
  const port: SculptPort = { onmessage: null, postMessage: (m: SculptRequest) => host(m), terminate: () => undefined };
  const host = createSculptHost((message: SculptResponse) => queueMicrotask(() => port.onmessage?.({ data: message } as MessageEvent<SculptResponse>)));
  return Promise.resolve(new SculptSession(port));
}

describe('sculpt keys', () => {
  const state = initialEditorState(SPEC);
  it('borrow F, [ ], Mod+I and Alt+M only in sculpt mode', () => {
    expect(resolveKey({ key: 'f', mod: false, shift: false, sculpt: true }, state, 0.1)).toEqual({ kind: 'ui', command: 'sculpt:radius' });
    expect(resolveKey({ key: 'F', mod: false, shift: true, sculpt: true }, state, 0.1)).toEqual({ kind: 'ui', command: 'sculpt:strength' });
    expect(resolveKey({ key: 'f', mod: false, shift: false }, state, 0.1)).toEqual({ kind: 'ui', command: 'frame' });
    expect(resolveKey({ key: '[', mod: false, shift: false, sculpt: true }, state, 0.1)).toEqual({ kind: 'ui', command: 'sculpt:smaller' });
    expect(resolveKey({ key: ']', mod: false, shift: false }, state, 0.1)).toEqual({ kind: 'ui', command: 'snap:up' });
    expect(resolveKey({ key: 'i', mod: true, shift: false, sculpt: true }, state, 0.1)).toEqual({ kind: 'ui', command: 'sculpt:maskInvert' });
    expect(resolveKey({ key: 'µ', mod: false, shift: false, alt: true, sculpt: true }, state, 0.1)).toEqual({ kind: 'ui', command: 'sculpt:maskClear' });
    // Undo stays undo — it is what walks the mesh back.
    expect(resolveKey({ key: 'z', mod: true, shift: false, sculpt: true }, state, 0.1)).toEqual({ kind: 'dispatch', action: { type: 'undo' } });
  });

  it('are listed in the shortcut help with unique chords', () => {
    const chords = SHORTCUTS.map((s) => s.chord);
    expect(new Set(chords).size).toBe(chords.length);
    expect(SHORTCUTS.filter((s) => s.group === 'Sculpt').length).toBeGreaterThanOrEqual(5);
  });
});

describe('sculpt steps in the reducer', () => {
  it('a sculpt edit is one undo step that bumps the revision and ends the SDF history', () => {
    let state = initialEditorState(SPEC);
    state = editorReducer(state, { type: 'sculptEdit', id: 'p1', revision: 1 });
    expect(state.spec.parts[0]).toMatchObject({ revision: 1 });
    expect('sdf' in state.spec.parts[0]!).toBe(false);
    state = editorReducer(state, { type: 'sculptEdit', id: 'p1', revision: 2, multiresLevel: 1, vertices: 441, triangles: 800 });
    expect(state.spec.parts[0]).toMatchObject({ revision: 2, multiresLevel: 1, vertices: 441 });
    state = editorReducer(state, { type: 'sculptEdit', id: 'p1', revision: 3, multiresLevel: 0 });
    expect('multiresLevel' in state.spec.parts[0]!).toBe(false);
    state = editorReducer(state, { type: 'undo' });
    state = editorReducer(state, { type: 'undo' });
    state = editorReducer(state, { type: 'undo' });
    expect(state.spec.parts[0]).toMatchObject({ sdf: expect.anything() });
    expect(editorReducer(state, { type: 'sculptEdit', id: 'nope', revision: 1 })).toBe(state);
  });

  it('a flush repoints the part without a history step', () => {
    const start = editorReducer(initialEditorState(SPEC), { type: 'sculptEdit', id: 'p1', revision: 1 });
    const flushed = editorReducer(start, { type: 'sculptFlushed', id: 'p1', file: { src: 'bust.p1.abcdef12.mesh.bin', hash: 'abcdef1234567890', vertices: 121, triangles: 200, multiresLevel: 0 } });
    expect(flushed.past).toHaveLength(start.past.length);
    expect(flushed.spec.parts[0]).toMatchObject({ src: 'bust.p1.abcdef12.mesh.bin', hash: 'abcdef1234567890', revision: 1 });
  });
});

function Harness({ io, spec = SPEC }: { io: SculptIO; spec?: ModelSpec }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(spec));
  const ref = useRef<(a: EditorAction) => void>(dispatch);
  const controller = useMemo(() => new SculptController(startSession, io, (a) => ref.current(a)), [io]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return (
    <>
      <span data-testid="revision">{String((state.spec.parts[0] as { revision?: number }).revision ?? 0)}</span>
      <span data-testid="src">{(state.spec.parts[0] as { src: string }).src}</span>
      <SculptPanel state={state} dispatch={dispatch} controller={controller} snapshot={snapshot} />
    </>
  );
}

describe('the Sculpt tab', () => {
  it('opens the part, picks brushes and symmetry, edits the mask and saves on Done', async () => {
    const files = new Map<string, Uint8Array>([['bust.p1.mesh.bin', BYTES]]);
    const result = (value: ModelMeshResult): GitOpResult<ModelMeshResult> => ok(value);
    const io: SculptIO = {
      stem: 'bust',
      read: async (src) => (files.has(src) ? result({ data: files.get(src)!.slice() }) : { ok: false, kind: 'error', message: 'missing' }),
      write: async ({ src, data }) => {
        files.set(src, data);
        return result({});
      },
      readOps: async () => result({ entries: [] }),
    };
    render(<Harness io={io} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sculpt head' }));
    await waitFor(() => expect(screen.getByTestId('sculpt-status').textContent).toContain('Sculpting head · 121 verts · level 0'));

    const clay = screen.getByRole('radio', { name: 'Clay' });
    fireEvent.click(clay);
    expect(clay.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Draw' }).getAttribute('aria-checked')).toBe('false');
    const mirrorX = screen.getByRole('button', { name: 'Mirror X' });
    expect(mirrorX.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mirrorX);
    expect(mirrorX.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Invert mask' }));
    await waitFor(() => expect(screen.getByTestId('revision').textContent).toContain('1'));
    expect(screen.getByTestId('sculpt-status').textContent).toContain('unsaved');

    fireEvent.click(screen.getByRole('button', { name: 'Subdivide' }));
    await waitFor(() => expect(screen.getByTestId('sculpt-status').textContent).toContain('441 verts · level 1'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done sculpting' }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sculpt head' })).toBeTruthy());
    expect(screen.getByTestId('src').textContent).toMatch(/^bust\.p1\.[0-9a-f]{8}\.mesh\.bin$/);
    expect(files.size).toBe(2);
  });

  it('says why a part cannot open', async () => {
    const io: SculptIO = {
      stem: 'bust',
      read: async () => ({ ok: false, kind: 'error', message: 'The mesh file is missing.' }),
      write: async () => ok({}),
      readOps: async () => ok({ entries: [] }),
    };
    render(<Harness io={io} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sculpt head' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The mesh file is missing.'));
  });

  it('will not open an unwrapped mesh, and says how to sculpt it again', () => {
    const unwrapped = { ...SPEC, parts: [{ ...SPEC.parts[0], uv: { charts: 6, density: { mean: 900, min: 700, max: 1100 }, textureSize: 2048, coverage: 0.6 } }] } as unknown as ModelSpec;
    const io: SculptIO = { stem: 'bust', read: async () => ({ ok: false, kind: 'error', message: 'unused' }), write: async () => ok({}), readOps: async () => ok({ entries: [] }) };
    render(<Harness io={io} spec={unwrapped} />);
    expect((screen.getByRole('button', { name: 'Sculpt head' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('sculpt-unwrapped-note').textContent).toContain('model_unwrap');
  });
});
