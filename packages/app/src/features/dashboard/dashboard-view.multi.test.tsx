import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderView } from '../../../test-support/render';
import { DEFAULT_TABS, GIT_DASHBOARD_ID, useDashboardStore } from '../../store/dashboard-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { DashboardView } from './dashboard-view';

/**
 * Multiple dashboards, assembled through the mock bridge: the strip of tabs, the
 * Agents defaults, and adding/removing panels through the picker. jsdom is
 * enough — nothing here needs real layout; the drag-to-reorder gesture is the
 * store's `reorderDashboards` (tested there) plus the screenshot pass.
 */
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const tile = (name: string) => screen.getByRole('region', { name });

const open = () => {
  renderView(<DashboardView />, { uiState: { selectedRepoId: 'repo-1' } });
};

beforeEach(() => {
  useDashboardStore.setState({ boards: {}, tabs: DEFAULT_TABS, activeId: GIT_DASHBOARD_ID });
  useTerminalStore.setState({ sessions: [] });
});
afterEach(cleanup);

describe('the dashboard strip', () => {
  it('lists Git and Agents, Git selected', () => {
    open();
    expect(tab('Git').getAttribute('aria-selected')).toBe('true');
    expect(tab('Agents').getAttribute('aria-selected')).toBe('false');
  });

  it('switches to the Agents dashboard and shows its seeded cards', async () => {
    open();
    fireEvent.click(tab('Agents'));
    for (const name of [
      'Agent roster',
      'Live sessions',
      'Recent sessions',
      'Per-agent activity',
      'Loop runs',
    ]) {
      expect(await screen.findByRole('region', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('region', { name: 'Commit calendar' })).toBeNull();
    // No repository-derived card, so no stats controls.
    expect(screen.queryByRole('combobox', { name: 'Statistics window' })).toBeNull();
  });

  it('lists the built-in agents on the roster card', async () => {
    open();
    fireEvent.click(tab('Agents'));
    expect(
      await within(await screen.findByRole('region', { name: 'Agent roster' })).findByText(
        'Claude',
      ),
    ).toBeTruthy();
  });

  it('shows a live session on the Live sessions card', async () => {
    useTerminalStore.setState({
      sessions: [
        {
          id: 's1',
          kind: 'agent',
          agentId: 'claude',
          title: 'repo',
          cwd: '/tmp',
          repoId: 'repo-1',
          createdAt: 1,
        } as never,
      ],
      states: { s1: 'open' },
    });
    open();
    fireEvent.click(tab('Agents'));
    expect(
      await within(await screen.findByRole('region', { name: 'Live sessions' })).findByText(
        'Claude',
      ),
    ).toBeTruthy();
  });

  it('adds a dashboard, activates it, and seeds clock and date', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add dashboard' }));
    expect(tab('Dashboard 3').getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('region', { name: 'Clock' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Date' })).toBeTruthy();
  });

  it('adds and removes panels on a custom dashboard via the picker', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add dashboard' }));
    await screen.findByRole('region', { name: 'Clock' });

    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add widget' });
    // Already on the board: shown, but not addable twice.
    expect(
      (within(dialog).getByRole('button', { name: /^Clock/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Git panels are on offer on any dashboard; search narrows the catalogue.
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search widgets' }), {
      target: { value: 'scratch' },
    });
    expect(within(dialog).queryByRole('button', { name: /Commit calendar/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /Scratchpad/ }));
    expect(await screen.findByRole('region', { name: 'Scratchpad' })).toBeTruthy();

    fireEvent.click(within(tile('Clock')).getByRole('button', { name: 'Clock options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    expect(screen.queryByRole('region', { name: 'Clock' })).toBeNull();
  });

  it('offers git panels on a custom dashboard', async () => {
    open();
    fireEvent.click(tab('Agents'));
    await screen.findByRole('region', { name: 'Agent roster' });
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add widget' });
    expect(within(dialog).getByRole('button', { name: /Commit calendar/ })).toBeTruthy();
  });

  it('keeps the Git board when switching away and back', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Repo health options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    fireEvent.click(tab('Agents'));
    fireEvent.click(tab('Git'));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Commit calendar' })).toBeTruthy(),
    );
    expect(screen.queryByRole('region', { name: 'Repo health' })).toBeNull();
  });

  it('closes a dashboard from its tab, never Git', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Close Git' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Agents' }));
    expect(screen.queryByRole('tab', { name: /^Agents/ })).toBeNull();
    expect(tab('Git').getAttribute('aria-selected')).toBe('true');
  });

  it('renames on double-click and pins from the tab', async () => {
    open();
    fireEvent.doubleClick(tab('Agents'));
    const input = screen.getByRole('textbox', { name: 'Rename dashboard Agents' });
    fireEvent.change(input, { target: { value: 'Fleet' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(tab('Fleet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pin Fleet' }));
    expect(screen.getByRole('button', { name: 'Unpin Fleet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close Fleet' })).toBeNull();
  });
});
