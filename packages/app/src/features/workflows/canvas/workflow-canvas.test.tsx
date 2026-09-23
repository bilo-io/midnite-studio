import { validateWorkflow, type Workflow, type WorkflowNode } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WorkflowCanvas, type WorkflowGraph } from './workflow-canvas';

/**
 * @xyflow/react needs the same jsdom gaps the hand-rolled SVG canvas's own
 * tests patched (`ResizeObserver`, `PointerEvent`, pointer capture) — see
 * this file's own history for why: `getBoundingClientRect` is always
 * `{0,0,0,0}` under jsdom, which the library tolerates (it renders nodes at
 * their given positions regardless of an unmeasured viewport), but it reads
 * `ResizeObserver` on mount and pointer capture on every drag.
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
  // @xyflow/react's first mount in a file pays a real one-time setup cost
  // under jsdom — see `workflow-panel-stack.test.tsx`'s identical note.
  vi.setConfig({ testTimeout: 15000 });
});

function noteNode(id: string, x: number, y: number): WorkflowNode {
  return { id, label: id, x, y, kind: 'note', config: { text: '' } };
}

function httpNode(id: string, x: number, y: number, url = 'https://example.com'): WorkflowNode {
  return {
    id,
    label: id,
    x,
    y,
    kind: 'http',
    config: { method: 'GET', url, headers: {}, params: {}, queryShaped: false },
  };
}

function Harness({
  initial,
  onChangeSpy,
  ...rest
}: {
  initial: WorkflowGraph;
  onChangeSpy?: (next: WorkflowGraph) => void;
} & Partial<Omit<Parameters<typeof WorkflowCanvas>[0], 'graph' | 'onChange' | 'resetKey'>>) {
  const [graph, setGraph] = useState(initial);
  return (
    <WorkflowCanvas
      graph={graph}
      resetKey="w1"
      onChange={(next) => {
        onChangeSpy?.(next);
        setGraph(next);
      }}
      {...rest}
    />
  );
}

describe('WorkflowCanvas', () => {
  afterEach(() => cleanup());

  it('renders every node, each carrying its own id and kind', async () => {
    const { container } = render(
      <Harness initial={{ nodes: [noteNode('a', 0, 0), httpNode('b', 300, 0)], edges: [] }} />,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2));
    expect(container.querySelector('[data-node-id="a"]')?.getAttribute('data-node-kind')).toBe('note');
    expect(container.querySelector('[data-node-id="b"]')?.getAttribute('data-node-kind')).toBe('http');
  });

  it('draws a destructive ring on a node named by invalidNodeIds', async () => {
    const { container } = render(
      <Harness
        initial={{ nodes: [noteNode('a', 0, 0), noteNode('b', 200, 0)], edges: [] }}
        invalidNodeIds={new Set(['a'])}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-node-id]')).toHaveLength(2));
    expect(container.querySelector('[data-node-id="a"]')?.className).toContain('ring-destructive');
    expect(container.querySelector('[data-node-id="b"]')?.className).not.toContain('ring-destructive');
  });

  it('colours a node by its run status rather than by validity', async () => {
    const { container } = render(
      <Harness
        initial={{ nodes: [noteNode('a', 0, 0), noteNode('b', 200, 0)], edges: [] }}
        nodeStatuses={new Map([['a', 'failed'], ['b', 'succeeded']])}
        readOnly
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-node-id="a"]')?.getAttribute('data-status')).toBe('failed'),
    );
    expect(container.querySelector('[data-node-id="b"]')?.getAttribute('data-status')).toBe('succeeded');
  });

  it('shows an inline error on a node nodeErrors names', async () => {
    render(
      <Harness
        initial={{ nodes: [httpNode('a', 0, 0)], edges: [] }}
        nodeErrors={new Map([['a', 'Connection refused']])}
        readOnly
      />,
    );
    expect(await screen.findByText('Connection refused')).not.toBeNull();
  });

  it('hides the editing toolbar and shows a "Viewing run" label in read-only mode', () => {
    render(<Harness initial={{ nodes: [noteNode('a', 0, 0)], edges: [] }} readOnly />);
    expect(screen.getByText('Viewing run')).not.toBeNull();
    expect(screen.queryByLabelText('Undo')).toBeNull();
    expect(screen.queryByLabelText('Auto layout')).toBeNull();
  });

  it('shows Undo/Redo/Auto layout while editing, Undo and Redo starting disabled', () => {
    render(<Harness initial={{ nodes: [noteNode('a', 0, 0)], edges: [] }} />);
    expect((screen.getByLabelText('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Redo') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Auto layout') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Auto layout with nothing on the canvas', () => {
    render(<Harness initial={{ nodes: [], edges: [] }} />);
    expect((screen.getByLabelText('Auto layout') as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the Run control entirely when onRun is not passed', () => {
    render(<Harness initial={{ nodes: [], edges: [] }} />);
    expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
  });

  it('disables Run and names the reason when runDisabledReason is set', () => {
    const onRun = vi.fn();
    render(
      <Harness initial={{ nodes: [], edges: [] }} onRun={onRun} runDisabledReason={'"HTTP" has no URL.'} />,
    );
    const run = screen.getByRole('button', { name: /run/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('title')).toBe('"HTTP" has no URL.');
    fireEvent.click(run);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('calls onRun when the workflow is valid', () => {
    const onRun = vi.fn();
    render(<Harness initial={{ nodes: [], edges: [] }} onRun={onRun} />);
    const run = screen.getByRole('button', { name: /run/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('acceptance: clearing a required URL disables Run via the real validateWorkflow pass', () => {
    const asWorkflow = (nodes: WorkflowNode[]): Workflow => ({
      id: 'w1',
      name: 'W',
      nodes,
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    });

    function ValidatedHarness({ url }: { url: string }) {
      const nodes = [httpNode('n1', 0, 0, url)];
      const issues = validateWorkflow(asWorkflow(nodes));
      return (
        <Harness
          initial={{ nodes, edges: [] }}
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

  it('dropping a palette kind onto the canvas adds a node of that kind', async () => {
    const onChangeSpy = vi.fn();
    const { container } = render(
      <Harness initial={{ nodes: [], edges: [] }} onChangeSpy={onChangeSpy} />,
    );
    const surface = screen.getByRole('application', { name: 'Workflow canvas' });
    fireEvent.drop(surface, {
      clientX: 100,
      clientY: 100,
      dataTransfer: { getData: () => 'delay' },
    });
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledTimes(1));
    const [next] = onChangeSpy.mock.calls[0] as [WorkflowGraph];
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0]!.kind).toBe('delay');
    await waitFor(() => expect(container.querySelectorAll('[data-node-id]')).toHaveLength(1));
  });

  it('a drop is ignored in read-only mode', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initial={{ nodes: [], edges: [] }} onChangeSpy={onChangeSpy} readOnly />);
    fireEvent.drop(screen.getByRole('application', { name: 'Workflow canvas' }), {
      clientX: 100,
      clientY: 100,
      dataTransfer: { getData: () => 'delay' },
    });
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('Auto layout commits new positions for a connected chain', async () => {
    const onChangeSpy = vi.fn();
    render(
      <Harness
        initial={{
          nodes: [httpNode('a', 0, 0), httpNode('b', 0, 0)],
          edges: [{ id: 'e1', from: 'a', to: 'b' }],
        }}
        onChangeSpy={onChangeSpy}
      />,
    );
    fireEvent.click(screen.getByLabelText('Auto layout'));
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledTimes(1));
    const [next] = onChangeSpy.mock.calls[0] as [WorkflowGraph];
    const a = next.nodes.find((n) => n.id === 'a')!;
    const b = next.nodes.find((n) => n.id === 'b')!;
    expect(a.x).toBeLessThan(b.x);
  });
});
