// vitest/jsdom: DOM text/roles, no canvas involved.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeCommunityPanel } from './knowledge-community-panel';

afterEach(cleanup);

const members = [
  { id: 'a', label: 'useNow' },
  { id: 'b', label: 'useNowTick' },
  { id: 'c', label: 'useNowReset' },
];
const degrees = new Map([
  ['a', 1],
  ['b', 7],
  ['c', 3],
]);

function renderPanel(overrides: Partial<Parameters<typeof KnowledgeCommunityPanel>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onExpand: vi.fn(),
    onToggleHidden: vi.fn(),
    onSelectNode: vi.fn(),
  };
  render(
    <KnowledgeCommunityPanel
      communityName="core"
      members={members}
      degrees={degrees}
      hidden={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('KnowledgeCommunityPanel', () => {
  it('names the community and counts its members', () => {
    renderPanel();
    expect(screen.getByText('core')).toBeDefined();
    expect(screen.getByText(/3 nodes, collapsed into one/)).toBeDefined();
  });

  it('lists members hubs-first (by degree)', () => {
    renderPanel();
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const memberOrder = labels.filter((t) => t.startsWith('useNow'));
    expect(memberOrder.map((t) => t.replace(/\d+$/, ''))).toEqual(['useNowTick', 'useNowReset', 'useNow']);
  });

  it('a member click selects that node', () => {
    const { onSelectNode } = renderPanel();
    fireEvent.click(screen.getByText('useNowTick'));
    expect(onSelectNode).toHaveBeenCalledWith('b');
  });

  it('Expand, Hide/Show and Close each reach their handler', () => {
    const { onExpand, onToggleHidden, onClose } = renderPanel();
    fireEvent.click(screen.getByText('Expand on canvas'));
    expect(onExpand).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Hide community'));
    expect(onToggleHidden).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('reads "Show community" when the community is hidden', () => {
    renderPanel({ hidden: true });
    expect(screen.getByText('Show community').getAttribute('aria-pressed')).toBe('true');
  });

  it('caps the roster and says how many more there are', () => {
    const many = Array.from({ length: 75 }, (_, i) => ({ id: `n${i}`, label: `node${i}` }));
    renderPanel({ members: many });
    expect(screen.getByText(/and 15 more/)).toBeDefined();
  });
});
