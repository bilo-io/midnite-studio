// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LauncherBridge } from '../../common/bridge';
import { App } from '../app';
import { createMockBridge } from '../mock-bridge';
import { resetChangelogCache } from '../use-changelog';

afterEach(() => {
  cleanup();
  resetChangelogCache();
  delete window.midniteLauncher;
  localStorage.clear();
});

describe('Changelog in Launcher', () => {
  it('switches between Launcher and Changelog tabs and shows suite changelog', async () => {
    const bridge = createMockBridge(null);
    const openLinkSpy = vi.spyOn(bridge.links, 'open');
    window.midniteLauncher = bridge as LauncherBridge;

    render(<App />);

    // Initially in Launcher view with apps grid
    expect(screen.getByRole('tab', { name: 'Launcher' })).toBeDefined();
    const changelogTab = screen.getByRole('tab', { name: 'Changelog' });
    expect(changelogTab).toBeDefined();

    // Click Changelog tab
    fireEvent.click(changelogTab);

    // Expect Changelog header and suite badge
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeDefined();
      expect(screen.getByText('Midnyte Studio Suite')).toBeDefined();
    });

    // Both Vanguard and Agents items from mock changelog should be visible
    expect(screen.getByText('Vanguard: Fleet policy dashboard')).toBeDefined();
    expect(screen.getByText('Agents: Subagent fan-out orchestration')).toBeDefined();

    // Filter by Vanguard using the app filter bar
    const filterGroup = screen.getByRole('group', { name: 'Filter by app' });
    const vanguardFilter = within(filterGroup).getByRole('button', { name: /Vanguard/ });
    fireEvent.click(vanguardFilter);

    // Vanguard should be visible, Agents should be filtered out
    expect(screen.getByText('Vanguard: Fleet policy dashboard')).toBeDefined();
    expect(screen.queryByText('Agents: Subagent fan-out orchestration')).toBeNull();

    // Click "All (Midnyte Studio)"
    const allFilter = within(filterGroup).getByRole('button', { name: /All \(Midnyte Studio\)/ });
    fireEvent.click(allFilter);

    // Both should be visible again
    expect(screen.getByText('Vanguard: Fleet policy dashboard')).toBeDefined();
    expect(screen.getByText('Agents: Subagent fan-out orchestration')).toBeDefined();

    // Click GitHub link
    const githubBtn = screen.getByRole('button', { name: /GitHub/ });
    fireEvent.click(githubBtn);
    expect(openLinkSpy).toHaveBeenCalledWith('changelog');
  });

  it('shows changelog summary in app detail sheet and allows navigation to Changelog tab', async () => {
    const bridge = createMockBridge(null);
    window.midniteLauncher = bridge as LauncherBridge;

    render(<App />);

    // Open Vanguard detail sheet
    const vanguardTile = screen.getByRole('article', { name: /Midnyte Vanguard/ });
    fireEvent.click(within(vanguardTile).getByText('Details ↗'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();

    // "What's New" section should be visible with Vanguard's item
    await waitFor(() => {
      expect(within(dialog).getByText("What's New")).toBeDefined();
      expect(within(dialog).getByText('Vanguard: Fleet policy dashboard')).toBeDefined();
    });

    // Click "View Vanguard in changelog"
    const viewInChangelogBtn = within(dialog).getByRole('button', { name: /View Vanguard in changelog/ });
    fireEvent.click(viewInChangelogBtn);

    // Detail dialog should close and Changelog tab should be active filtered to Vanguard
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Changelog' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Vanguard: Fleet policy dashboard')).toBeDefined();
    expect(screen.queryByText('Agents: Subagent fan-out orchestration')).toBeNull();
  });
});
