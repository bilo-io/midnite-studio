import type { WorkflowNode } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useDismiss } from '../../../components/use-dismiss';
import { WorkflowCanvas, type WorkflowGraph } from './workflow-canvas';

/**
 * Escape and deletion on the canvas selection — the half of the inspector's
 * auto-collapse that lives in the canvas: every one of "Escape", "delete the
 * selected node" and "click empty canvas" has to reach the editor as an
 * EMPTY `onSelectionChange`, which `use-inspector-collapse.ts` turns into a
 * collapse. vitest/jsdom: key events, focus and the dismissal stack are all
 * DOM-level, and nothing here needs real layout. The empty-canvas click is
 * not here: with `selectionOnDrag` on, xyflow routes it through its marquee
 * pointer-capture path, which jsdom's zero-size rects cannot drive — it is
 * xyflow's own `resetSelectedElements`, arriving as the same empty
 * selection the hook test covers.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  vi.setConfig({ testTimeout: 15000 });
});

afterEach(() => cleanup());

function note(id: string, x: number): WorkflowNode {
  return { id, label: id, x, y: 0, kind: 'note', config: { text: '' } };
}

function Harness({ onSelection, withMenu = false }: { onSelection: (ids: string[]) => void; withMenu?: boolean }) {
  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [note('a', 0), note('b', 300)], edges: [] });
  const [menuOpen, setMenuOpen] = useState(withMenu);
  return (
    <>
      <input aria-label="Inspector field" />
      {menuOpen ? <FakeMenu onClose={() => setMenuOpen(false)} /> : null}
      <WorkflowCanvas
        graph={graph}
        resetKey="w1"
        onChange={setGraph}
        onSelectionChange={(ids) => onSelection(Array.from(ids))}
      />
    </>
  );
}

/** Stands in for any open menu: `menu` outranks the canvas's `inline` registration. */
function FakeMenu({ onClose }: { onClose: () => void }) {
  useDismiss(true, onClose, { layer: 'menu' });
  return <div role="menu" aria-label="Fake menu" />;
}

async function selectNode(container: HTMLElement, id: string) {
  await waitFor(() => expect(container.querySelector(`.react-flow__node[data-id="${id}"]`)).not.toBeNull());
  fireEvent.click(container.querySelector(`.react-flow__node[data-id="${id}"]`)!);
}

const escape = () => act(() => void fireEvent.keyDown(window, { key: 'Escape' }));

describe('canvas selection — Escape and delete', () => {
  it('Escape deselects the selected node', async () => {
    const onSelection = vi.fn();
    const { container } = render(<Harness onSelection={onSelection} />);
    await selectNode(container, 'a');
    expect(onSelection).toHaveBeenLastCalledWith(['a']);

    escape();
    expect(onSelection).toHaveBeenLastCalledWith([]);
    expect(container.querySelector('.react-flow__node.selected')).toBeNull();
  });

  it('does nothing while an input has focus — the Escape belongs to the field', async () => {
    const onSelection = vi.fn();
    const { container, getByLabelText } = render(<Harness onSelection={onSelection} />);
    await selectNode(container, 'a');

    const field = getByLabelText('Inspector field');
    act(() => field.focus());
    act(() => void fireEvent.keyDown(field, { key: 'Escape' }));
    expect(onSelection).toHaveBeenLastCalledWith(['a']);

    act(() => field.blur());
    escape();
    expect(onSelection).toHaveBeenLastCalledWith([]);
  });

  it('lets an open menu take Escape first, and keeps the selection', async () => {
    const onSelection = vi.fn();
    const { container, queryByRole } = render(<Harness onSelection={onSelection} withMenu />);
    await selectNode(container, 'a');

    escape();
    expect(queryByRole('menu', { name: 'Fake menu' })).toBeNull();
    expect(onSelection).toHaveBeenLastCalledWith(['a']);

    escape();
    expect(onSelection).toHaveBeenLastCalledWith([]);
  });

  it('deleting the selected node reports an empty selection', async () => {
    const onSelection = vi.fn();
    const { container } = render(<Harness onSelection={onSelection} />);
    await selectNode(container, 'a');

    act(() => void fireEvent.keyDown(document.body, { key: 'Backspace' }));
    await waitFor(() => expect(container.querySelector('[data-node-id="a"]')).toBeNull());
    expect(onSelection).toHaveBeenLastCalledWith([]);
  });
});
