import { resolveForgeGraph, type ForgeProjectField, type ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { draftItem, issueItem, pullItem, resetProjectItemSeq, withBlockedBy } from '../__fixtures__/project-item';
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

function Harness({ items, selectedItemId = null }: { items: ForgeProjectItem[]; selectedItemId?: string | null }) {
  return (
    <ProjectGraphView
      graph={graphFor(items)}
      items={items}
      fields={FIELDS}
      projectId="proj1"
      selectedItemId={selectedItemId}
      onSelectItem={() => {}}
      agentStates={new Map()}
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
