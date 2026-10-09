import { bakeSdf, decodeMeshBin, isClosed, ModelSpecSchema, ok, parseOpsLog, serializeOp, type ModelOpEntry, type ModelSpec } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useReducer, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { editorReducer, initialEditorState } from './editor-state';
import { SdfPanel } from './sdf-panel';
import { bakeSdfDesign, type SdfBakeDeps, type SdfBaker } from './sculpt/use-sdf';

/**
 * vitest/jsdom: Theme C's SDF tab — the bake pipeline over a fake worker and a fake mesh channel, the
 * reducer step, and the panel's DOM (new shape, add/wrap/remove nodes, preview vs commit). No browser
 * capability is needed: the bake is pure TS and the panel is plain DOM.
 */
afterEach(cleanup);
vi.setConfig({ testTimeout: 30_000 });

const SPEC: ModelSpec = ModelSpecSchema.parse({ name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [0.6, 0.1, 0.6] }] });

type Written = { src: string; data: Uint8Array; ops: ModelOpEntry[] };
const fakeDeps = (written: Written[] = []): SdfBakeDeps => ({
  stem: 'bust',
  bake: async (tree, resolution) => bakeSdf(tree, { resolution }),
  writeMesh: async (req) => {
    written.push(req);
    return ok({});
  },
});
const fakeBaker = (written: Written[] = []): SdfBaker => ({
  preview: (r) => bakeSdfDesign(fakeDeps(written), r, 'preview'),
  commit: (r) => bakeSdfDesign(fakeDeps(written), r, 'commit'),
});

describe('bakeSdfDesign', () => {
  const tree = { nodes: [{ kind: 'sphere' as const, name: 'head', radius: 0.3 }] };

  it('commits: writes a closed mesh whose op log opens with the tree, then adds the part', async () => {
    const written: Written[] = [];
    const out = await bakeSdfDesign(fakeDeps(written), { spec: SPEC, tree, index: null, resolution: 32, name: 'head' }, 'commit');
    if (!out.ok) throw new Error(out.error);
    expect(written).toHaveLength(1);
    expect(written[0]!.src).toMatch(/^bust\.p2\.[0-9a-f]{8}\.mesh\.bin$/);
    const bin = decodeMeshBin(written[0]!.data);
    expect(isClosed({ positions: Array.from(bin.positions), indices: Array.from(bin.indices) })).toBe(true);
    expect(parseOpsLog(written[0]!.ops.map(serializeOp).join('\n')).entries[0]).toMatchObject({ kind: 'sdf', by: 'user', data: { tree } });
    expect(out.index).toBe(1);
    expect(out.spec.parts[1]).toMatchObject({ shape: 'sculpt', name: 'head', sdf: { resolution: 32, tree } });
  });

  it('previews without writing, and reports a failed save', async () => {
    const written: Written[] = [];
    const preview = await bakeSdfDesign(fakeDeps(written), { spec: SPEC, tree, index: null, resolution: 24 }, 'preview');
    expect(preview.ok).toBe(true);
    expect(written).toHaveLength(0);
    const failing: SdfBakeDeps = { ...fakeDeps(), writeMesh: async () => ({ ok: false, kind: 'error', message: 'disk full' }) };
    expect(await bakeSdfDesign(failing, { spec: SPEC, tree, index: null, resolution: 24 }, 'commit')).toEqual({ ok: false, error: 'disk full' });
  });

  it('is one undo step in the editor, selecting the part', async () => {
    const start = initialEditorState(SPEC, 'gen/bust.obj');
    const out = await bakeSdfDesign(fakeDeps(), { spec: start.spec, tree, index: null, resolution: 24 }, 'commit');
    if (!out.ok) throw new Error(out.error);
    const next = editorReducer(start, { type: 'sdf', spec: out.spec, index: out.index });
    expect(next.selected).toBe(1);
    expect(next.past).toHaveLength(1);
    expect(editorReducer(next, { type: 'undo' }).spec.parts).toHaveLength(1);
  });
});

function Harness({ baker, onPreview }: { baker: SdfBaker; onPreview?: (spec: ModelSpec | null) => void }) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState(SPEC, 'gen/bust.obj'));
  const [previewed, setPreviewed] = useState(0);
  const sculpt = state.spec.parts.find((p) => p.shape === 'sculpt');
  return (
    <>
      <SdfPanel
        state={state}
        dispatch={dispatch}
        baker={baker}
        onPreview={(spec) => {
          if (spec) setPreviewed((n) => n + 1);
          onPreview?.(spec);
        }}
      />
      <output data-testid="nodes">{sculpt?.shape === 'sculpt' ? JSON.stringify(sculpt.sdf?.tree) : ''}</output>
      <output data-testid="history">{state.past.length}</output>
      <output data-testid="previews">{previewed}</output>
    </>
  );
}

const tree = () => JSON.parse(screen.getByTestId('nodes').textContent || 'null') as { nodes: { name: string; kind: string; children?: { name: string }[] }[]; blend?: number } | null;

describe('SdfPanel', () => {
  it('starts a new SDF shape, adds and wraps nodes, each edit one undo step', async () => {
    const written: Written[] = [];
    render(<Harness baker={fakeBaker(written)} />);
    fireEvent.click(screen.getByRole('button', { name: /New SDF shape/ }));
    await waitFor(() => expect(tree()?.nodes.map((n) => n.name)).toEqual(['body']));
    expect(screen.getByRole('tree', { name: 'SDF nodes' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Add primitive'), { target: { value: 'capsule' } });
    await waitFor(() => expect(tree()?.nodes.map((n) => n.name)).toEqual(['body', 'capsule 1']));
    // The new node is selected: wrap it in a smooth union.
    fireEvent.change(screen.getByLabelText('Wrap node'), { target: { value: 'union' } });
    await waitFor(() => expect(tree()?.nodes[1]).toMatchObject({ kind: 'union', name: 'union 1', children: [{ name: 'capsule 1' }] }));
    expect(screen.getByTestId('history').textContent).toBe('3');
    expect(written).toHaveLength(3);

    // Edit a field of the selected union's child.
    fireEvent.click(screen.getByRole('button', { name: /capsule 1/ }));
    const radius = screen.getByLabelText('Radius') as HTMLInputElement;
    fireEvent.change(radius, { target: { value: '0.25' } });
    fireEvent.blur(radius);
    await waitFor(() => expect(JSON.stringify(tree())).toContain('"radius":0.25'));

    // Removing the union's only child would leave it empty: refused, with the reason.
    fireEvent.click(screen.getByRole('button', { name: 'Remove node' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 1/i);
    fireEvent.click(screen.getByRole('button', { name: /union 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove node' }));
    await waitFor(() => expect(tree()?.nodes.map((n) => n.name)).toEqual(['body']));
  });

  it('previews while a blend slider moves and bakes once on release', async () => {
    const written: Written[] = [];
    render(<Harness baker={fakeBaker(written)} />);
    fireEvent.click(screen.getByRole('button', { name: /New SDF shape/ }));
    await waitFor(() => expect(tree()).not.toBeNull());
    const slider = screen.getByLabelText('Root blend slider');
    fireEvent.change(slider, { target: { value: '0.1' } });
    await waitFor(() => expect(screen.getByTestId('previews').textContent).toBe('1'));
    expect(written).toHaveLength(1);
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(tree()?.blend).toBe(0.1));
    expect(written).toHaveLength(2);
  });

  it('shows a refused bake as an alert and leaves the design alone', async () => {
    const refusing: SdfBaker = { preview: async () => ({ ok: false, error: 'no' }), commit: async () => ({ ok: false, error: 'The tree has no surface.' }) };
    render(<Harness baker={refusing} />);
    fireEvent.click(screen.getByRole('button', { name: /New SDF shape/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('The tree has no surface.');
    expect(screen.getByTestId('history').textContent).toBe('0');
  });
});
