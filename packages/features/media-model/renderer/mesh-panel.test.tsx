import { ModelSpecSchema, voxelRemesh, ok, type ModelSpec, isClosed, decodeMeshBin } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { editorReducer, initialEditorState } from './editor-state';
import { MeshPanel } from './mesh-panel';
import { convertToSculpt, type ConvertDeps, type ConvertOutcome } from './sculpt/use-convert';

/**
 * vitest/jsdom: Theme B's conversion — the editor reducer steps, the conversion pipeline over a fake
 * worker and a fake mesh channel, and the Mesh tab's DOM. (No browser capability is needed: the voxel
 * remesh is pure TS and the panel is plain DOM.)
 */
afterEach(cleanup);

const SPEC: ModelSpec = ModelSpecSchema.parse({
  name: 'pill',
  parts: [
    { name: 'body', shape: 'capsule', radius: 0.4, height: 0.8, color: '#3366cc' },
    { name: 'cap', shape: 'sphere', radius: 0.3, position: [0, 0.9, 0], color: '#cc3333' },
  ],
});

const fakeDeps = (written: { src: string; data: Uint8Array }[] = []): ConvertDeps => ({
  stem: 'pill',
  remesh: async (soup, options) => voxelRemesh(soup, options),
  writeMesh: async (req) => {
    written.push({ src: req.src, data: req.data });
    return ok({});
  },
});

describe('convertToSculpt', () => {
  it('remeshes, writes a valid .mesh.bin named for the part and returns the design to adopt', async () => {
    const written: { src: string; data: Uint8Array }[] = [];
    const out = await convertToSculpt(fakeDeps(written), { spec: SPEC, targetVertices: 2500 });
    if (!out.ok) throw new Error(out.error);
    expect(written).toHaveLength(1);
    expect(written[0]!.src).toBe(`pill.${out.partId}.mesh.bin`);
    const bin = decodeMeshBin(written[0]!.data);
    expect(isClosed({ positions: Array.from(bin.positions), indices: Array.from(bin.indices) })).toBe(true);
    expect(out.spec.parts.map((p) => p.shape)).toEqual(['capsule', 'sphere', 'sculpt']);
    expect(out.spec.parts.slice(0, 2).every((p) => p.hidden)).toBe(true);
  });

  it('reports a failed save and an empty selection without throwing', async () => {
    const failing: ConvertDeps = { ...fakeDeps(), writeMesh: async () => ({ ok: false, kind: 'error', message: 'disk full' }) };
    expect(await convertToSculpt(failing, { spec: SPEC, targetVertices: 1000 })).toEqual({ ok: false, error: 'disk full' });
    const none = await convertToSculpt(fakeDeps(), { spec: SPEC, parts: ['nobody'] });
    expect(none).toMatchObject({ ok: false });
  });
});

describe('convert actions in the editor reducer', () => {
  it('is one undo step that selects the new mesh, and revert brings the primitives back', async () => {
    const start = initialEditorState(SPEC, 'gen/pill.obj');
    const out = await convertToSculpt(fakeDeps(), { spec: start.spec, targetVertices: 1500 });
    if (!out.ok) throw new Error(out.error);
    const a = editorReducer(start, { type: 'convert', spec: out.spec, partId: out.partId });
    expect(a.spec.parts).toHaveLength(3);
    expect(a.selected).toBe(2);
    expect(a.past).toHaveLength(1);

    const reverted = editorReducer(a, { type: 'revertSculpt', index: 2 });
    expect(reverted.spec.parts.map((p) => [p.shape, p.hidden === true])).toEqual([['capsule', false], ['sphere', false]]);
    // A plain primitive has nothing to revert.
    expect(editorReducer(reverted, { type: 'revertSculpt', index: 0 })).toBe(reverted);

    const undone = editorReducer(a, { type: 'undo' });
    expect(undone.spec.parts).toHaveLength(2);
    expect(undone.spec.parts.every((p) => !p.hidden)).toBe(true);
  });
});

function Harness({ onConvert }: { onConvert: (req: Parameters<typeof convertToSculpt>[1]) => Promise<ConvertOutcome> }) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState(SPEC, 'gen/pill.obj'));
  return (
    <>
      <MeshPanel state={state} dispatch={dispatch} onConvert={onConvert} />
      <output data-testid="parts">{state.spec.parts.map((p) => `${p.shape}${p.hidden ? '*' : ''}`).join(',')}</output>
    </>
  );
}

describe('MeshPanel', () => {
  it('converts the whole design at the chosen detail, then offers to revert the new mesh', async () => {
    const onConvert = vi.fn((req: Parameters<typeof convertToSculpt>[1]) => convertToSculpt(fakeDeps(), req));
    render(<Harness onConvert={onConvert} />);
    fireEvent.change(screen.getByLabelText('Detail'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Convert to sculpt mesh/ }));
    await waitFor(() => expect(screen.getByTestId('parts').textContent).toBe('capsule*,sphere*,sculpt'));
    expect(onConvert).toHaveBeenCalledWith(expect.objectContaining({ targetVertices: 5000 }));
    expect(onConvert.mock.calls[0]![0].parts).toBeUndefined();
    expect(screen.getByText(/Converted to [\d,]+ vertices/)).toBeTruthy();
    // The new mesh is selected: the panel now offers the way back.
    fireEvent.click(await screen.findByRole('button', { name: /Revert to parts/ }));
    expect(screen.getByTestId('parts').textContent).toBe('capsule,sphere');
  });

  it('shows a refusal in an alert and leaves the design alone', async () => {
    render(<Harness onConvert={async () => ({ ok: false, error: 'Nothing visible to convert.' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to sculpt mesh/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing visible to convert.');
    expect(screen.getByTestId('parts').textContent).toBe('capsule,sphere');
  });
});
