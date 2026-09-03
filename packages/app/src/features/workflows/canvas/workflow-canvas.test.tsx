import { validateWorkflow, type Workflow, type WorkflowNode } from '@midnite/studio-shared';
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

  it('draws a destructive badge on a node named by invalidNodeIds', () => {
    const { container } = render(
      <WorkflowCanvas
        graph={{ nodes: [noteNode('a', 0, 0), noteNode('b', 20, 0)], edges: [] }}
        resetKey="w1"
        onChange={() => {}}
        invalidNodeIds={new Set(['a'])}
      />,
    );
    expect(container.querySelector('[data-node-id="a"] [data-invalid-badge]')).not.toBeNull();
    expect(container.querySelector('[data-node-id="b"] [data-invalid-badge]')).toBeNull();
  });

  it('hides the Run control entirely when onRun is not passed', () => {
    render(<Harness initial={{ nodes: [], edges: [] }} />);
    expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
  });

  it('disables Run and names the reason when runDisabledReason is set', () => {
    const onRun = vi.fn();
    render(
      <WorkflowCanvas
        graph={{ nodes: [], edges: [] }}
        resetKey="w1"
        onChange={() => {}}
        onRun={onRun}
        runDisabledReason={'"HTTP" has no URL.'}
      />,
    );
    const run = screen.getByRole('button', { name: /run/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('title')).toBe('"HTTP" has no URL.');
    fireEvent.click(run);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('calls onRun when the workflow is valid', () => {
    const onRun = vi.fn();
    render(
      <WorkflowCanvas graph={{ nodes: [], edges: [] }} resetKey="w1" onChange={() => {}} onRun={onRun} />,
    );
    const run = screen.getByRole('button', { name: /run/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('acceptance: clearing a required URL disables Run via the real validateWorkflow pass', () => {
    const httpNodeWithUrl = (url: string): WorkflowNode => ({
      id: 'n1',
      label: 'HTTP',
      x: 0,
      y: 0,
      kind: 'http',
      config: { method: 'GET', url, headers: {}, params: {}, queryShaped: false },
    });
    const asWorkflow = (nodes: WorkflowNode[]): Workflow => ({
      id: 'w1',
      name: 'W',
      nodes,
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    });

    function ValidatedHarness({ url }: { url: string }) {
      const nodes = [httpNodeWithUrl(url)];
      const issues = validateWorkflow(asWorkflow(nodes));
      return (
        <WorkflowCanvas
          graph={{ nodes, edges: [] }}
          resetKey="w1"
          onChange={() => {}}
          onRun={() => {}}
          runDisabledReason={issues[0]?.message}
        />
      );
    }

    const { rerender } = render(<ValidatedHarness url="https://example.com" />);
    expect((screen.getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<ValidatedHarness url="" />);
    expect((screen.getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  describe('readOnly (Theme G — run view)', () => {
    it('hides the editing toolbar and shows a "Viewing run" label instead', () => {
      render(<WorkflowCanvas graph={{ nodes: [noteNode('a', 0, 0)], edges: [] }} resetKey="w1" onChange={() => {}} readOnly />);
      expect(screen.getByText('Viewing run')).not.toBeNull();
      expect(screen.queryByLabelText('Undo')).toBeNull();
      expect(screen.queryByLabelText('Add Note node')).toBeNull();
    });

    it('still selects a node with a click, but a Delete does nothing', () => {
      const { container } = render(
        <WorkflowCanvas graph={{ nodes: [noteNode('a', 0, 0)], edges: [] }} resetKey="w1" onChange={() => {}} readOnly />,
      );
      const nodeEl = container.querySelector('[data-node-id="a"]')!;
      fireEvent.pointerDown(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
      fireEvent.pointerUp(nodeEl, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });

      fireEvent.keyDown(screen.getByRole('application'), { key: 'Delete' });
      expect(container.querySelectorAll('[data-node-id]')).toHaveLength(1);
    });

    it('does not drag a node — its position stays put', () => {
      const onChangeSpy = vi.fn();
      const { container } = render(
        <WorkflowCanvas graph={{ nodes: [noteNode('a', 0, 0)], edges: [] }} resetKey="w1" onChange={onChangeSpy} readOnly />,
      );
      const nodeEl = container.querySelector('[data-node-id="a"]')!;
      fireEvent.pointerDown(nodeEl, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(nodeEl, { pointerId: 1, clientX: 40, clientY: 40 });
      fireEvent.pointerUp(nodeEl, { pointerId: 1, button: 0, clientX: 40, clientY: 40 });
      expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('colours a node by its run status rather than by validity/selection', () => {
      const { container } = render(
        <WorkflowCanvas
          graph={{ nodes: [noteNode('a', 0, 0), noteNode('b', 20, 0)], edges: [] }}
          resetKey="w1"
          onChange={() => {}}
          readOnly
          nodeStatuses={new Map([['a', 'failed'], ['b', 'succeeded']])}
        />,
      );
      expect(container.querySelector('[data-node-id="a"]')?.getAttribute('data-status')).toBe('failed');
      expect(container.querySelector('[data-node-id="a"] rect')?.getAttribute('class')).toContain('stroke-destructive');
      expect(container.querySelector('[data-node-id="b"] rect')?.getAttribute('class')).toContain('stroke-green-500');
    });
  });
});
