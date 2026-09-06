import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { issueItem } from '../__fixtures__/project-item';
import type { PositionedNode } from './graph-layout';
import { ProjectGraphNode } from './project-graph-node';

afterEach(cleanup);

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
    render(
      <ProjectGraphNode node={baseNode()} item={item} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
    expect(screen.getByAltText('octocat')).toBeDefined();
  });

  it('renders a foreign node with no item — the number as its title, no chips, dashed border, no repeated number row', () => {
    const node = baseNode({ itemId: '', foreign: true, title: '', repo: 'acme/other', number: 7, key: 'acme/other#7' });
    const { container } = render(
      <ProjectGraphNode node={node} item={undefined} fields={[]} glow="idle" selected={false} onSelect={() => {}} />,
    );
    expect(screen.getAllByText('#7')).toHaveLength(1); // title only — no redundant number row
    expect(container.querySelector('[data-graph-node]')?.className).toContain('border-dashed');
    expect(container.querySelector('[data-card-chip]')).toBeNull();
  });

  it('falls back to "Unknown issue" when a foreign node has neither a title nor a number', () => {
    const node = baseNode({ itemId: '', foreign: true, title: '', number: null, key: 'x' });
    render(<ProjectGraphNode node={node} item={undefined} fields={[]} glow="idle" selected={false} onSelect={() => {}} />);
    expect(screen.getByText('Unknown issue')).toBeDefined();
  });

  it('drops chips and assignees when detailed is false', () => {
    const item = issueItem({ content: { type: 'issue', assignees: ['octocat'] } as never });
    const { container } = render(
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
    const { container, rerender } = render(
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

  it('marks selected via aria-pressed, independent of tabIndex', () => {
    const { container, rerender } = render(
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
    const { container } = render(
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
    const { container } = render(
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

  it('calls onSelect on click and on Enter/Space', () => {
    const onSelect = vi.fn();
    render(<ProjectGraphNode node={baseNode()} item={issueItem()} fields={[]} glow="idle" selected={false} onSelect={onSelect} />);
    const el = screen.getByRole('button');
    fireEvent.click(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});
