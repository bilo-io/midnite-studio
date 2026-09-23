import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { issueItem } from '../__fixtures__/project-item';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import type { PositionedNode } from './graph-layout';
import { ProjectGraphNode } from './project-graph-node';

afterEach(cleanup);

/** `useCardPlay` (Theme A/D) reaches `useDialogs()` unconditionally, so
 *  every render needs the host it expects in the real app tree — passed as
 *  RTL's own `wrapper` option so `rerender` keeps it too. */
function renderNode(ui: ReactElement) {
  return render(ui, { wrapper: DialogHost });
}

function baseNode(overrides: Partial<PositionedNode> = {}): PositionedNode {
  return {
    itemId: 'item1',
    number: 42,
    repo: '',
    title: 'Fix the flaky test',
    kind: 'issue',
    state: 'open',
    blocked: false,
    ready: false,
    unmetBlockerCount: 0,
    foreign: false,
    truncated: false,
    key: '#42',
    x: 0,
    y: 0,
    rank: 0,
    ...overrides,
  };
}

describe('ProjectGraphNode', () => {
  it('renders the item title, linked number and assignees for a local item', () => {
    const item = issueItem({
      content: {
        type: 'issue',
        number: 42,
        title: 'Fix the flaky test',
        url: 'https://github.com/acme/widgets/issues/42',
        assignees: ['octocat'],
      } as never,
    });
    renderNode(
      <ProjectGraphNode node={baseNode()} item={item} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
    expect(screen.getByAltText('octocat')).toBeDefined();
  });

  it('renders a foreign node with no item — the number as its title, no chips, dashed border, no repeated number row', () => {
    const node = baseNode({ itemId: '', foreign: true, title: '', repo: 'acme/other', number: 7, key: 'acme/other#7' });
    const { container } = renderNode(
      <ProjectGraphNode node={node} item={undefined} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(screen.getAllByText('#7')).toHaveLength(1); // title only — no redundant number row
    expect(container.querySelector('[data-graph-node]')?.className).toContain('border-dashed');
    expect(container.querySelector('[data-card-chip]')).toBeNull();
  });

  it('falls back to "Unknown issue" when a foreign node has neither a title nor a number', () => {
    const node = baseNode({ itemId: '', foreign: true, title: '', number: null, key: 'x' });
    renderNode(<ProjectGraphNode node={node} item={undefined} fields={[]} glow="idle" selected={false} onSelect={() => {}} />);
    expect(screen.getByText('Unknown issue')).toBeDefined();
  });

  it('drops chips and assignees when detailed is false', () => {
    const item = issueItem({ content: { type: 'issue', assignees: ['octocat'] } as never });
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode()}
        item={item}
        fields={[{ id: 'f1', name: 'Priority', dataType: 'text' }]}
        glow="idle"
        selected={false}
        detailed={false}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelector('[data-card-chip]')).toBeNull();
    expect(screen.queryByAltText('octocat')).toBeNull();
  });

  it('applies agent-run-glow is-running only when glow is not idle', () => {
    const { container, rerender } = renderNode(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(container.querySelector('[data-graph-node]')?.className).not.toContain('agent-run-glow');

    rerender(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="running" selected={false} onSelect={() => {}} />,
    );
    const el = container.querySelector('[data-graph-node]')!;
    expect(el.className).toContain('agent-run-glow');
    expect(el.className).toContain('is-running');
  });

  it('waiting and open each get their own distinct class, same as the card (Theme F deferred item)', () => {
    const { container, rerender } = renderNode(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="waiting" selected={false} onSelect={() => {}} />,
    );
    let el = container.querySelector('[data-graph-node]')!;
    expect(el.className).toContain('agent-run-glow');
    expect(el.className).toContain('is-waiting');
    expect(el.className).not.toContain('is-running');
    expect(el.className).not.toContain('is-open');

    rerender(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="open" selected={false} onSelect={() => {}} />,
    );
    el = container.querySelector('[data-graph-node]')!;
    expect(el.className).toContain('agent-run-glow');
    expect(el.className).toContain('is-open');
    expect(el.className).not.toContain('is-running');
    expect(el.className).not.toContain('is-waiting');
  });

  it('marks selected via aria-pressed, independent of tabIndex', () => {
    const { container, rerender } = renderNode(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    let el = container.querySelector('[data-graph-node]')!;
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(el.getAttribute('tabindex')).toBe('-1'); // default

    rerender(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="idle" selected onSelect={() => {}} />,
    );
    el = container.querySelector('[data-graph-node]')!;
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.getAttribute('tabindex')).toBe('-1'); // selected does not imply the roving tab stop
  });

  it('the roving tab stop is a separate, explicit prop from selected', () => {
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode()}
        item={issueItem()}
        fields={[]}
        glow="idle"
        selected={false}
        tabIndex={0}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelector('[data-graph-node]')?.getAttribute('tabindex')).toBe('0');
  });

  it('carries data-blocked/data-ready/data-foreign only when the node says so', () => {
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode({ blocked: true, ready: false, foreign: true })}
        item={undefined}
        fields={[]}
        glow="idle"
        selected={false}
        onSelect={() => {}}
      />,
    );
    const el = container.querySelector('[data-graph-node]')!;
    expect(el.hasAttribute('data-blocked')).toBe(true);
    expect(el.hasAttribute('data-ready')).toBe(false);
    expect(el.hasAttribute('data-foreign')).toBe(true);
  });

  it('dims the inner content, not the outer glow-bearing element, when blocked', () => {
    const { container } = renderNode(
      <ProjectGraphNode node={baseNode({ blocked: true })} item={issueItem()} fields={[]} glow="running" selected={false} onSelect={() => {}} />,
    );
    const outer = container.querySelector('[data-graph-node]')!;
    expect(outer.className).not.toContain('opacity-');
    expect(outer.className).toContain('agent-run-glow'); // the ring still shows in full
    const inner = outer.querySelector('.opacity-\\[0\\.55\\]');
    expect(inner).not.toBeNull();
  });

  it('applies no dimming when not blocked', () => {
    const { container } = renderNode(
      <ProjectGraphNode node={baseNode({ blocked: false })} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(container.querySelector('.opacity-\\[0\\.55\\]')).toBeNull();
  });

  it('renders an affirmative ready badge only when the node is ready', () => {
    const { container, rerender } = renderNode(
      <ProjectGraphNode node={baseNode({ ready: false })} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(screen.queryByRole('img', { name: 'Ready to start' })).toBeNull();

    rerender(
      <ProjectGraphNode node={baseNode({ ready: true })} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(container.querySelector('[data-graph-node]')?.querySelector('[role="img"][aria-label="Ready to start"]')).not.toBeNull();
  });

  it('calls onSelect on click and on Enter/Space', () => {
    const onSelect = vi.fn();
    const { container } = renderNode(
      <ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={onSelect} />,
    );
    const el = container.querySelector('[data-graph-node]')!;
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('renders a 2.5px green border when node.state is closed', () => {
    const closedNode = baseNode({ state: 'closed' });
    const { container } = renderNode(
      <ProjectGraphNode node={closedNode} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    const el = container.querySelector('[data-graph-node]')!;
    expect(el.className).toContain('border-[2.5px]');
    expect(el.className).toContain('border-[hsl(var(--dep-done))]');
    expect(el.className).toContain('is-closed');
    expect(el.hasAttribute('data-closed')).toBe(true);
  });

  it('renders assignee avatar at the top right of the card', () => {
    const item = issueItem({
      content: {
        type: 'issue',
        number: 42,
        title: 'Task with assignee',
        assignees: ['octocat'],
      } as never,
    });
    const { container } = renderNode(
      <ProjectGraphNode node={baseNode()} item={item} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    const avatar = screen.getByAltText('octocat');
    expect(avatar).toBeDefined();
    // Verify avatar is rendered within the header row alongside the title
    const headerRow = container.querySelector('.flex.items-start.justify-between');
    expect(headerRow?.contains(avatar)).toBe(true);
  });

  it('renders play button in the bottom right corner and opens the fallback menu with no skill set (Theme D)', () => {
    const item = issueItem({
      content: {
        type: 'issue',
        number: 42,
        title: 'Task to run',
        body: 'Do some work',
        assignees: [],
      } as never,
    });
    const onSelect = vi.fn();
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode()}
        item={item}
        fields={[]}
        glow="idle"
        selected={false}
        projectId="proj-1"
        onSelect={onSelect}
      />,
    );

    const playBtn = container.querySelector('[data-testid="graph-node-play-agent"]')!;
    expect(playBtn).not.toBeNull();
    expect(playBtn.getAttribute('aria-label')).toBe('Start agent');

    fireEvent.click(playBtn);
    // Clicking the play button should stop propagation and not trigger card selection
    expect(onSelect).not.toHaveBeenCalled();
    // No skill set for this (freshly-minted) item — the pointer-anchored
    // fallback menu offers exactly Exec, Ideate, Refine, nothing launches yet.
    expect(screen.getByRole('menuitem', { name: 'Exec' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Ideate' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Refine' })).toBeDefined();
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('starts an agent directly, no menu, once a skill is set for this card (Theme D)', () => {
    const item = issueItem({
      content: {
        type: 'issue',
        number: 42,
        title: 'Task to run',
        body: 'Do some work',
        assignees: [],
      } as never,
    });
    useUiStore.setState({ cardSkillByTask: { [`proj-1:${item.id}`]: 'execAdhoc' } });
    const onSelect = vi.fn();
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode()}
        item={item}
        fields={[]}
        glow="idle"
        selected={false}
        projectId="proj-1"
        onSelect={onSelect}
      />,
    );

    const playBtn = container.querySelector('[data-testid="graph-node-play-agent"]')!;
    fireEvent.click(playBtn);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('clicking play button reveals terminal when a session is already active', () => {
    const item = issueItem({
      content: {
        type: 'issue',
        number: 42,
        title: 'Task to run',
        body: 'Do some work',
        assignees: [],
      } as never,
    });
    // Add a live session bound to this card in the terminal store
    useTerminalStore.setState({
      sessions: [
        {
          id: 'sess-active',
          repoId: 'r1',
          cwd: '/repo',
          title: 'Active Agent',
          kind: 'agent',
          surface: 'kanban',
          taskRef: { projectId: 'proj-1', itemId: item.id },
          createdAt: Date.now(),
        },
      ],
      states: { 'sess-active': 'open' },
    });

    const onSelect = vi.fn();
    const { container } = renderNode(
      <ProjectGraphNode
        node={baseNode()}
        item={item}
        fields={[]}
        glow="running"
        selected={false}
        projectId="proj-1"
        onSelect={onSelect}
      />,
    );

    const playBtn = container.querySelector('[data-testid="graph-node-play-agent"]')!;
    expect(playBtn.getAttribute('aria-label')).toBe('Open in terminal');

    fireEvent.click(playBtn);
    expect(onSelect).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().activeId).toBe('sess-active');
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });
});
