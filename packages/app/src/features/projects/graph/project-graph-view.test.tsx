import { resolveForgeGraph, type ForgeProjectField, type ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { draftItem, issueItem, pullItem, resetProjectItemSeq, withBlockedBy } from '../__fixtures__/project-item';
import { DEFAULT_GRAPH_FACETS, type ProjectGraphFacets } from './graph-filter';
import { ProjectGraphView } from './project-graph-view';

/**
 * jsdom implements no `ResizeObserver`, no `CSS.escape`, and reports a fixed
 * `clientWidth`/`clientHeight` of 0 — the same three gaps
 * `workflow-canvas.test.tsx`/`board-view.test.tsx` each patch for the same
 * reason. Stubbed to a real-looking canvas size so the mount-time fit and
 * the culling test below exercise the arithmetic against numbers a real
 * container would actually report.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
});

afterEach(() => {
  cleanup();
  resetProjectItemSeq();
});

const FIELDS: ForgeProjectField[] = [];

function graphFor(items: ForgeProjectItem[]) {
  return resolveForgeGraph(items, FIELDS, { boardRepo: 'acme/widgets' });
}

function Harness({
  items,
  filteredItems,
  selectedItemId = null,
  facets,
}: {
  items: ForgeProjectItem[];
  /** Defaults to `items` itself — pass a subset to exercise the item-filter
   *  narrowing (Theme H) against a graph built over the *whole* set. */
  filteredItems?: ForgeProjectItem[];
  selectedItemId?: string | null;
  facets?: ProjectGraphFacets;
}) {
  return (
    <ProjectGraphView
      graph={graphFor(items)}
      items={filteredItems ?? items}
      fields={FIELDS}
      projectId="proj1"
      selectedItemId={selectedItemId}
      onSelectItem={() => {}}
      agentStates={new Map()}
      facets={facets}
    />
  );
}

describe('ProjectGraphView', () => {
  it('renders one [data-graph-node] per item and at least one edge for a real dependency', () => {
    const blocker = issueItem();
    const dependent = withBlockedBy(issueItem(), [{ number: blocker.content.type === 'issue' ? blocker.content.number : 0, title: '', state: 'open', repo: '' }]);
    const { container } = render(<Harness items={[blocker, dependent]} />);
    expect(container.querySelectorAll('[data-graph-node]').length).toBe(2);
    expect(container.querySelectorAll('[data-edge-kind="blocks"]').length).toBe(1);
  });

  it('renders a closed→closed edge solid dep-done, and an open, unmet edge idle', () => {
    const blocker = issueItem({ content: { type: 'issue', state: 'closed' } as never });
    const blockerNumber = blocker.content.type === 'issue' ? blocker.content.number : 0;
    const dependent = withBlockedBy(issueItem({ content: { type: 'issue', state: 'closed' } as never }), [
      { number: blockerNumber, title: '', state: 'closed', repo: '' },
    ]);
    const { container } = render(<Harness items={[blocker, dependent]} />);
    const edge = container.querySelector('[data-edge-kind="blocks"]')!;
    expect(edge.getAttribute('class')).toContain('dep-edge-done');
    expect(edge.getAttribute('class')).not.toContain('dep-edge-animated');
  });

  it('renders an open, unmet edge as static dep-idle when no agent is running', () => {
    const blocker = issueItem();
    const blockerNumber = blocker.content.type === 'issue' ? blocker.content.number : 0;
    const dependent = withBlockedBy(issueItem(), [{ number: blockerNumber, title: '', state: 'open', repo: '' }]);
    const { container } = render(<Harness items={[blocker, dependent]} />);
    const edge = container.querySelector('[data-edge-kind="blocks"]')!;
    expect(edge.getAttribute('class')).toContain('dep-edge-idle');
  });

  it('culls most of a 300-node chain — fewer than 60 mount at default zoom', () => {
    const chain: ForgeProjectItem[] = [];
    let previous: ForgeProjectItem | null = null;
    for (let i = 0; i < 300; i += 1) {
      let item = issueItem();
      if (previous && previous.content.type === 'issue') {
        item = withBlockedBy(item, [{ number: previous.content.number, title: '', state: 'open', repo: '' }]);
      }
      chain.push(item);
      previous = item;
    }
    const { container } = render(<Harness items={chain} />);
    expect(container.querySelectorAll('[data-graph-node]').length).toBeLessThan(60);
  });

  it('an isolated item (no dependencies at all) still renders as a node', () => {
    const { container } = render(<Harness items={[issueItem()]} />);
    expect(container.querySelectorAll('[data-graph-node]').length).toBe(1);
  });

  it('shows the truncated banner naming the true total when the graph says so', () => {
    render(<Harness items={[issueItem()]} />);
    // No banner for an untruncated graph.
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('all-drafts-or-PRs renders the dedicated empty state, not a canvas', () => {
    render(<Harness items={[draftItem(), pullItem()]} />);
    expect(screen.getByText('Dependencies live on issues. This board has none.')).toBeDefined();
    expect(screen.queryByTestId('project-graph-view')).toBeNull();
  });

  it('items with zero edges still render as nodes, plus the "nothing to draw yet" banner', () => {
    render(<Harness items={[issueItem(), issueItem()]} />);
    expect(screen.getByText(/No dependencies found/)).toBeDefined();
    expect(screen.getAllByText(/No dependencies found/)[0]?.textContent).toContain('not on this board');
  });

  it('drops chips at low zoom (level of detail) and restores them back at 1×', () => {
    const item = issueItem({ content: { type: 'issue', assignees: ['octocat'] } as never });
    const { container } = render(<Harness items={[item]} />);
    const canvas = screen.getByRole('application');

    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: 500, clientX: 100, clientY: 100 });
    expect(container.querySelector('[data-card-chip]')).toBeNull();
    expect(screen.queryByAltText('octocat')).toBeNull();

    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -500, clientX: 100, clientY: 100 });
    expect(screen.getByAltText('octocat')).toBeDefined();
  });

  it('Home re-fits after a zoom/pan without throwing', () => {
    render(<Harness items={[issueItem(), issueItem()]} />);
    const canvas = screen.getByRole('application');
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: 200, clientX: 50, clientY: 50 });
    fireEvent.keyDown(canvas, { key: 'Home' });
    expect(canvas).toBeDefined();
  });

  it('Escape clears the selection', () => {
    const onSelectItem = vi.fn();
    const item = issueItem();
    render(
      <ProjectGraphView
        graph={graphFor([item])}
        items={[item]}
        fields={FIELDS}
        projectId="proj1"
        selectedItemId={item.id}
        onSelectItem={onSelectItem}
        agentStates={new Map()}
      />,
    );
    fireEvent.keyDown(screen.getByRole('application'), { key: 'Escape' });
    expect(onSelectItem).toHaveBeenCalledWith(null);
  });

  it('clicking a node calls onSelectItem with its item id', () => {
    const onSelectItem = vi.fn();
    const item = issueItem();
    const { container } = render(
      <ProjectGraphView
        graph={graphFor([item])}
        items={[item]}
        fields={FIELDS}
        projectId="proj1"
        selectedItemId={null}
        onSelectItem={onSelectItem}
        agentStates={new Map()}
      />,
    );
    fireEvent.click(container.querySelector('[data-graph-node]')!);
    expect(onSelectItem).toHaveBeenCalledWith(item.id);
  });

  it('arrow-left from a dependent moves keyboard focus to its blocker', () => {
    const blocker = issueItem();
    const dependent = withBlockedBy(issueItem(), [
      { number: blocker.content.type === 'issue' ? blocker.content.number : 0, title: '', state: 'open', repo: '' },
    ]);
    render(<Harness items={[blocker, dependent]} />);
    const dependentKey = `#${dependent.content.type === 'issue' ? dependent.content.number : 0}`;
    const dependentNode = document.querySelector(`[data-node-key="${dependentKey}"]`) as HTMLElement;
    // A click both selects and records the graph's own `focusedKey` — the
    // arrow-key handler reads that React state, not raw DOM focus.
    fireEvent.click(dependentNode);
    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowLeft' });
    const blockerKey = `#${blocker.content.type === 'issue' ? blocker.content.number : 0}`;
    expect(document.activeElement?.getAttribute('data-node-key')).toBe(blockerKey);
  });
});

describe('ProjectGraphView — Theme H facets', () => {
  it('drops a node the item filter hid, and its edge with it', () => {
    const blocker = issueItem();
    const dependent = withBlockedBy(issueItem(), [
      { number: blocker.content.type === 'issue' ? blocker.content.number : 0, title: '', state: 'open', repo: '' },
    ]);
    // `items` (the full graph) carries both; `filteredItems` (what the view
    // narrows to) carries only the dependent — the blocker did not survive
    // the shared toolbar filter.
    const { container } = render(<Harness items={[blocker, dependent]} filteredItems={[dependent]} />);
    expect(container.querySelectorAll('[data-graph-node]').length).toBe(1);
    expect(container.querySelectorAll('[data-edge-kind]').length).toBe(0);
  });

  it('showContains: false (the default) hides a contains edge; true shows it', () => {
    const parent = issueItem();
    const parentNumber = parent.content.type === 'issue' ? parent.content.number : 0;
    const child = issueItem({
      content: {
        type: 'issue',
        dependencies: { blockedBy: [], parent: { number: parentNumber, title: '', state: 'open', repo: '' }, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
      } as never,
    });

    const { container: hidden } = render(<Harness items={[parent, child]} />);
    expect(hidden.querySelectorAll('[data-edge-kind="contains"]').length).toBe(0);

    cleanup();
    const { container: shown } = render(
      <Harness items={[parent, child]} facets={{ ...DEFAULT_GRAPH_FACETS, showContains: true }} />,
    );
    expect(shown.querySelectorAll('[data-edge-kind="contains"]').length).toBe(1);
  });

  it('hideIsolated with a genuinely zero-edge graph still shows the zero-edge banner, not the canvas gone blank', () => {
    render(<Harness items={[issueItem(), issueItem()]} facets={{ ...DEFAULT_GRAPH_FACETS, hideIsolated: true }} />);
    expect(screen.getByText(/No dependencies found/)).toBeDefined();
  });

  it('only: "blocked" keeps the blocked node and drops the one that is not', () => {
    const blocker = issueItem();
    const dependent = withBlockedBy(issueItem(), [
      { number: blocker.content.type === 'issue' ? blocker.content.number : 0, title: '', state: 'open', repo: '' },
    ]);
    const { container } = render(<Harness items={[blocker, dependent]} facets={{ ...DEFAULT_GRAPH_FACETS, only: 'blocked' }} />);
    expect(container.querySelectorAll('[data-graph-node][data-blocked]').length).toBe(1);
    expect(container.querySelectorAll('[data-graph-node]').length).toBe(1);
  });

  it('depth: 1 from the selected node keeps its immediate neighbour and drops a two-hop node', () => {
    const a = issueItem();
    const b = withBlockedBy(issueItem(), [{ number: a.content.type === 'issue' ? a.content.number : 0, title: '', state: 'open', repo: '' }]);
    const c = withBlockedBy(issueItem(), [{ number: b.content.type === 'issue' ? b.content.number : 0, title: '', state: 'open', repo: '' }]);
    const { container } = render(
      <Harness items={[a, b, c]} selectedItemId={b.id} facets={{ ...DEFAULT_GRAPH_FACETS, depth: 1 }} />,
    );
    expect(container.querySelectorAll('[data-graph-node]').length).toBe(3); // a, b, c all one hop from b
  });
});
