// vitest/jsdom: DOM roles, aria state and store transitions only.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PINNED_NAV_ITEMS, RAIL_GROUPS } from '../../../components/nav-groups';
import { RAIL_VIEW_IDS } from '../../../components/nav-visibility';
import { useUiStore } from '../../../store/ui-store';
import { SidebarPage } from './sidebar-page';

const ALL_ITEMS = [...PINNED_NAV_ITEMS, ...RAIL_GROUPS.flatMap((g) => g.items)];

afterEach(cleanup);
beforeEach(() => {
  useUiStore.setState({ collapsedAccordionSections: [], navVisibility: {} });
});

describe('rail nav definitions', () => {
  it('cover exactly the visibility list, in order, each with a description', () => {
    expect(ALL_ITEMS.map((i) => i.view)).toEqual([...RAIL_VIEW_IDS]);
    for (const item of ALL_ITEMS) expect(item.description.trim().length).toBeGreaterThan(0);
  });
});

describe('Settings > Sidebar rail destinations', () => {
  it('lists every group and item with its description and the rail icon', () => {
    const { container } = render(<SidebarPage />);
    for (const group of RAIL_GROUPS) {
      expect(screen.getByRole('button', { name: new RegExp(group.title) })).toBeTruthy();
    }
    for (const item of ALL_ITEMS) {
      const sw = screen.getByRole('switch', { name: item.label });
      const row = sw.closest('label') as HTMLElement;
      expect(within(row).getByText(item.description)).toBeTruthy();
      // The row's leading glyph is the rail's own component: same markup.
      const expected = document.createElement('div');
      render(<item.icon aria-hidden className="h-4 w-4 shrink-0" />, { container: expected });
      expect(row.querySelector('svg')?.outerHTML).toBe(expected.querySelector('svg')?.outerHTML);
    }
    expect(container).toBeTruthy();
  });

  it('folds a group with aria-expanded and persists it', () => {
    render(<SidebarPage />);
    const group = RAIL_GROUPS[2]!;
    const header = screen.getByRole('button', { name: new RegExp(group.title) });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(useUiStore.getState().collapsedAccordionSections).toContain(
      `settings-rail-groups:${group.key}`,
    );
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('still toggles visibility', () => {
    render(<SidebarPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Graph' }));
    expect(useUiStore.getState().navVisibility.graph).toBe(false);
  });
});
