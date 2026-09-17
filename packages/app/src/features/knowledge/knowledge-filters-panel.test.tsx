// vitest/jsdom: DOM text/roles, no canvas involved.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeFiltersPanel } from './knowledge-filters-panel';
import { defaultFilterState } from './knowledge-filters';

afterEach(cleanup);

function renderPanel(overrides: Partial<Parameters<typeof KnowledgeFiltersPanel>[0]> = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onToggleRelation: vi.fn(),
    onMinWeightChange: vi.fn(),
    onMinConfidenceChange: vi.fn(),
    onToggleCommunity: vi.fn(),
    onShowAllCommunities: vi.fn(),
    onHideAllCommunities: vi.fn(),
    onCommunityListModeChange: vi.fn(),
    onToggleCollapsedCommunity: vi.fn(),
    onCollapseAllCommunities: vi.fn(),
    onExpandAllCommunities: vi.fn(),
    onSelectNode: vi.fn(),
  };
  render(
    <KnowledgeFiltersPanel
      filters={defaultFilterState()}
      relations={['calls', 'imports']}
      communityNames={['core', 'graph']}
      nodesByCommunity={
        new Map([
          ['core', [{ id: 'a', label: 'useNow' }]],
          ['graph', [{ id: 'b', label: 'useNowTick' }]],
        ])
      }
      collapsedCommunities={new Set()}
      communityListMode="list"
      visibleLinkCount={5}
      totalLinkCount={10}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('KnowledgeFiltersPanel', () => {
  it('shows the visible/total edge count', () => {
    renderPanel();
    expect(screen.getByText('5 / 10 edges')).toBeDefined();
  });

  it('reports search query changes', () => {
    const { onQueryChange } = renderPanel();
    fireEvent.change(screen.getByLabelText('Search knowledge graph nodes'), {
      target: { value: 'useNow' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('useNow');
  });

  it('reports a relation toggle', () => {
    const { onToggleRelation } = renderPanel();
    fireEvent.click(screen.getByText('imports'));
    expect(onToggleRelation).toHaveBeenCalledWith('imports');
  });

  it('the community section stays collapsed until opened', () => {
    renderPanel();
    expect(screen.queryByLabelText('Search communities')).toBeNull();
    fireEvent.click(screen.getByText('Communities'));
    expect(screen.getByLabelText('Search communities')).toBeDefined();
  });

  it('shows the hidden-community count once any are hidden', () => {
    renderPanel({
      filters: { ...defaultFilterState(), hiddenCommunities: new Set(['graph']) },
    });
    expect(screen.getByText('1 hidden')).toBeDefined();
  });

  it('shows the collapsed-community count beside the hidden one', () => {
    renderPanel({
      filters: { ...defaultFilterState(), hiddenCommunities: new Set(['graph']) },
      collapsedCommunities: new Set(['core']),
    });
    expect(screen.getByText('1 hidden · 1 collapsed')).toBeDefined();
  });

  it('shows the collapsed count alone when nothing is hidden', () => {
    renderPanel({ collapsedCommunities: new Set(['core', 'graph']) });
    expect(screen.getByText('2 collapsed')).toBeDefined();
  });

  it('applies custom width and style props to the root element', () => {
    renderPanel({ width: 320, style: { zIndex: 10 } });
    const panel = screen.getByTestId('knowledge-filters-panel');
    expect(panel.style.width).toBe('320px');
    expect(panel.style.zIndex).toBe('10');
  });
});
