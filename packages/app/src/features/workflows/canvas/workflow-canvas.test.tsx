import type { WorkflowNode } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { NODE_KIND_META } from './node-kind-meta';
import { WorkflowCanvas, type WorkflowGraph } from './workflow-canvas';

/**
 * jsdom implements neither `ResizeObserver`, pointer capture, nor
 * `PointerEvent` itself — the first two are the same gaps
 * `use-browser-bounds.test.tsx` patches for the same reason. The third is
 * why `fireEvent.pointerDown` alone is not enough here: `@testing-library/dom`
 * constructs a real `window.PointerEvent` when one exists and falls back to
 * a bare `Event` with none of the requested init (`button`, `clientX`,
 * `pointerId`, …) applied when it doesn't — so every pointer test below
 * would silently no-op without this polyfill. `MouseEvent` already carries
 * `button`/`clientX`/`clientY` correctly under jsdom; `pointerId` is the one
 * field a real `PointerEvent` adds that this canvas reads.
 *
 * Real coordinates don't matter either way: `getBoundingClientRect` is
 * always `{0,0,0,0}` under jsdom, so every test below works in the tiny
 * viewport that leaves the canvas centred on the origin by construction.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);

  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  vi.stubGlobal('PointerEvent', PointerEventPolyfill);

  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function noteNode(id: string, x: number, y: number): WorkflowNode {
  return { id, label: id, x, y, kind: 'note', config: { text: '' } };
}

function Harness({
  initial,
  onChangeSpy,
}: {
  initial: WorkflowGraph;
  onChangeSpy?: (next: WorkflowGraph) => void;
}) {
  const [graph, setGraph] = useState(initial);
  return (
    <WorkflowCanvas
      graph={graph}
      resetKey="w1"
      onChange={(next) => {
        onChangeSpy?.(next);
        setGraph(next);
      }}
    />
  );
}

describe('WorkflowCanvas', () => {
  afterEach(() => cleanup());

  it('renders every node close enough to the default viewport to be visible', () => {
    const { container } = render(
      <Harness initial={{ nodes: [noteNode('a', 0, 0), noteNode('b', 20, 0)], edges: [] }} />,
    );
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2);
  });

  it('adds one node of each kind from the toolbar, at the same fresh id', () => {
    render(<Harness initial={{ nodes: [], edges: [] }} />);
    for (const kind of Object.keys(NODE_KIND_META) as (keyof typeof NODE_KIND_META)[]) {
      fireEvent.click(screen.getByLabelText(`Add ${NODE_KIND_META[kind].label} node`));
    }
    expect(document.querySelectorAll('[data-node-id]')).toHaveLength(Object.keys(NODE_KIND_META).length);
  });

  it('selects a node with a click and removes it on Delete', () => {
    const { container } = render(<Harness initial={{ nodes: [noteNode('a', 0, 0)], edges: [] }} />);

    const nodeEl = container.querySelector('[data-node-id="a"]')!;
    fireEvent.pointerDown(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });

    fireEvent.keyDown(screen.getByRole('application'), { key: 'Delete' });

    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(0);
  });

  it('Escape clears the selection instead of deleting anything', () => {
    const { container } = render(<Harness initial={{ nodes: [noteNode('a', 0, 0)], edges: [] }} />);

    const nodeEl = container.querySelector('[data-node-id="a"]')!;
    fireEvent.pointerDown(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });

    const surface = screen.getByRole('application');
    fireEvent.keyDown(surface, { key: 'Escape' });
    fireEvent.keyDown(surface, { key: 'Delete' });

    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(1);
  });

  it('undoes the last committed change with Undo', () => {
    const { container } = render(<Harness initial={{ nodes: [noteNode('a', 0, 0)], edges: [] }} />);

    fireEvent.click(screen.getByLabelText('Add Note node'));
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2);

    fireEvent.click(screen.getByLabelText('Undo'));
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Redo'));
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2);
  });

  it('culls nodes far outside the viewport, keeping the DOM small at 200 nodes', () => {
    const nodes: WorkflowNode[] = [];
    for (let i = 0; i < 10; i += 1) nodes.push(noteNode(`near-${i}`, i * 10, 0));
    for (let i = 0; i < 190; i += 1) nodes.push(noteNode(`far-${i}`, 5_000 + i * 1_000, 5_000));

    const { container } = render(<Harness initial={{ nodes, edges: [] }} />);
    const rendered = container.querySelectorAll('[data-node-id]').length;

    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(nodes.length);
    expect(rendered).toBeLessThan(300);
  });
});
