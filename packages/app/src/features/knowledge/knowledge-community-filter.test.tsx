// vitest/jsdom: DOM text/roles and a virtualized list under the app's global
// ResizeObserver stub (vitest-setup.ts) — no canvas involved.
//
// `FiringResizeObserver` (`vitest-setup.ts`) fires its callback from a
// `queueMicrotask`, not synchronously — `palette.bridge.test.tsx` names this
// same trap for `@tanstack/react-virtual`. A synchronous `getByText` right
// after `render`/`fireEvent` races that microtask and finds nothing, so every
// assertion here that reads a rendered row uses `findByText`/`waitFor`.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeCommunityFilter } from './knowledge-community-filter';

describe('KnowledgeCommunityFilter', () => {
  afterEach(cleanup);

  const names = ['core', 'graph', 'zzz-rare'];
  const nodesByCommunity = new Map([
    ['core', [{ id: 'a', label: 'useNow' }, { id: 'b', label: 'useNowTick' }]],
    ['graph', [{ id: 'c', label: 'layoutRows' }]],
    ['zzz-rare', [{ id: 'd', label: 'rareThing' }]],
  ]);

  function renderFilter(overrides: Partial<Parameters<typeof KnowledgeCommunityFilter>[0]> = {}) {
    const handlers = {
      onModeChange: vi.fn(),
      onToggle: vi.fn(),
      onShowAll: vi.fn(),
      onHideAll: vi.fn(),
      onToggleCollapsed: vi.fn(),
      onCollapseAll: vi.fn(),
      onExpandAll: vi.fn(),
      onSelectNode: vi.fn(),
    };
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        nodesByCommunity={nodesByCommunity}
        hidden={new Set()}
        collapsed={new Set()}
        mode="list"
        {...handlers}
        {...overrides}
      />,
    );
    return handlers;
  }

  it('renders every community as a checked-by-default row', async () => {
    renderFilter();
    for (const name of names) {
      const checkbox = (await screen.findByText(name)).closest('label')?.querySelector('input');
      expect(checkbox).not.toBeNull();
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    }
  });

  it('unchecks a hidden community', async () => {
    renderFilter({ hidden: new Set(['graph']) });
    const checkbox = (await screen.findByText('graph')).closest('label')?.querySelector('input');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('filters the list by the search box', async () => {
    renderFilter();
    await screen.findByText('core'); // let the initial virtualized render settle
    fireEvent.change(screen.getByLabelText('Search communities'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('zzz-rare')).toBeDefined());
    expect(screen.queryByText('core')).toBeNull();
  });

  it('calls onToggle with the clicked community name', async () => {
    const { onToggle } = renderFilter();
    const row = (await screen.findByText('core')).closest('label');
    const checkbox = row?.querySelector('input');
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox as HTMLInputElement);
    expect(onToggle).toHaveBeenCalledWith('core');
  });

  it('"Hide all" passes the full name list, "Show all" needs no argument', () => {
    const { onHideAll, onShowAll } = renderFilter();
    fireEvent.click(screen.getByText('Hide all'));
    expect(onHideAll).toHaveBeenCalledWith(names);
    fireEvent.click(screen.getByText('Show all'));
    expect(onShowAll).toHaveBeenCalled();
  });

  it('"Collapse all" passes the full name list; "Expand all" is disabled until something is collapsed', () => {
    const { onCollapseAll, onExpandAll } = renderFilter();
    expect((screen.getByText('Expand all') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Collapse all'));
    expect(onCollapseAll).toHaveBeenCalledWith(names);
    expect(onExpandAll).not.toHaveBeenCalled();
  });

  it('"Expand all" works once a community is collapsed, and "Collapse all" goes dead once all are', () => {
    const { onExpandAll } = renderFilter({ collapsed: new Set(names) });
    expect((screen.getByText('Collapse all') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Expand all'));
    expect(onExpandAll).toHaveBeenCalled();
  });

  it('the list/tree toggle reports the chosen mode and marks the active one pressed', () => {
    const { onModeChange } = renderFilter();
    const list = screen.getByRole('button', { name: 'List' });
    const tree = screen.getByRole('button', { name: 'Tree' });
    expect(list.getAttribute('aria-pressed')).toBe('true');
    expect(tree.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tree);
    expect(onModeChange).toHaveBeenCalledWith('tree');
  });

  it('list mode shows the per-community member count and no member rows', async () => {
    renderFilter();
    const row = (await screen.findByText('core')).closest('[data-testid="knowledge-community-row"]');
    expect(row?.textContent).toContain('2');
    expect(screen.queryByText('useNow')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand core' })).toBeNull();
  });

  it('tree mode expands a community into its member rows, and a member click selects that node', async () => {
    const { onSelectNode } = renderFilter({ mode: 'tree' });
    await screen.findByText('core');
    expect(screen.queryByText('useNow')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand core' }));
    await waitFor(() => expect(screen.getByText('useNowTick')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Collapse core' })).toBeDefined();
    // Only `core` was expanded — `graph`'s member stays out of the DOM.
    expect(screen.queryByText('layoutRows')).toBeNull();

    fireEvent.click(screen.getByText('useNowTick'));
    expect(onSelectNode).toHaveBeenCalledWith('b');
  });

  it('tree mode search finds a node under its community and force-expands it', async () => {
    renderFilter({ mode: 'tree' });
    await screen.findByText('core');
    fireEvent.change(screen.getByLabelText('Search communities'), { target: { value: 'layoutR' } });
    await waitFor(() => expect(screen.getByText('layoutRows')).toBeDefined());
    expect(screen.getByText('graph')).toBeDefined();
    expect(screen.queryByText('core')).toBeNull();
  });

  it('the per-community collapse toggle reports the community, and reads pressed once collapsed', async () => {
    const { onToggleCollapsed } = renderFilter({ collapsed: new Set(['graph']) });
    await screen.findByText('core');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse core into one node' }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('core');
    const expand = screen.getByRole('button', { name: 'Expand graph on the canvas' });
    expect(expand.getAttribute('aria-pressed')).toBe('true');
  });
});
