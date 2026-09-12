import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { ReposPanel } from '../repos/repos-panel';
import { SettingsView } from './settings-view';

/**
 * Migrated from `e2e/settings-pages.spec.ts` (Phase 82 Theme C, wave 1) —
 * navigation between pages, the collapsible category headers' `inert`
 * marking, the Sidebar page's view-filter rows, and the Agent page's version
 * card + `~/.claude` tree.
 *
 * **Four of the original eight tests stay in Playwright.** "Settings is one
 * bottom entry, not a workspace nav item" needs the app's outer rail, not
 * this view. "A folded category stays folded across a reload" tests actual
 * `zustand/persist` rehydration across a real page reload — `useUiStore` is a
 * module singleton hydrated once at import time (`test-support/render.tsx`'s
 * own comment), so a jsdom "reload" would need to reset and re-import the
 * module fresh, which is more machinery than the claim is worth once
 * `collapsedSettingsGroups`'s toggle and its membership in `PersistedUi` are
 * already covered by `ui-store.test.ts`. "The side-navigation lock…" and "the
 * rail pin locks and unlocks…" both depend on real pointer hover expanding
 * the rail and on `getComputedStyle(...).getPropertyValue('--nav-offset')` —
 * a real-CSS read jsdom cannot honestly produce.
 */

const settingsFixtures: MockFixtures = {
  ...fixtures,
  refs: [
    {
      name: 'main',
      fullName: 'refs/heads/main',
      kind: 'localBranch',
      sha: 'a'.repeat(40),
      upstream: null,
      isHead: true,
      worktreePath: null,
    },
  ],
  fsDirs: {
    'claude:': [
      { name: 'skills', kind: 'dir', size: 0, isIgnored: false },
      { name: 'settings.json', kind: 'file', size: 88, isIgnored: false },
    ],
    'claude:skills': [{ name: 'brainstorm', kind: 'dir', size: 0, isIgnored: false }],
  },
  fsFiles: {
    'claude:settings.json': { kind: 'text', content: '{ "theme": "dark" }', size: 88 },
  },
};

const UI_STATE = { selectedRepoId: 'repo-1' };

afterEach(cleanup);

describe('SettingsView, assembled through the real bridge', () => {
  it('all four pages are reachable through the inner sidebar', async () => {
    renderView(<SettingsView />, { fixtures: settingsFixtures, uiState: UI_STATE });
    const nav = within(screen.getByRole('navigation', { name: 'Settings pages' }));

    expect(nav.getByRole('button', { name: 'Appearance' })).toBeTruthy();

    fireEvent.click(nav.getByRole('button', { name: 'Graph' }));
    expect(await screen.findByRole('heading', { name: 'Graph' })).toBeTruthy();

    fireEvent.click(nav.getByRole('button', { name: 'Terminal' }));
    expect(await screen.findByText('Agent roster')).toBeTruthy();

    fireEvent.click(nav.getByRole('button', { name: 'Appearance' }));
    expect(await screen.findByText('Interface font')).toBeTruthy();
  });

  it('the pages are grouped under collapsible category headers', () => {
    renderView(<SettingsView />, { fixtures: settingsFixtures, uiState: UI_STATE });
    const nav = within(screen.getByRole('navigation', { name: 'Settings pages' }));

    // Three categories, each a disclosure trigger over its own page list.
    expect(nav.getByRole('button', { name: 'General' }).getAttribute('aria-expanded')).toBe('true');
    const tools = nav.getByRole('button', { name: 'Tools' });
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('button', { name: 'System Info' })).toBeTruthy();

    /*
      Folded is asserted through `inert` on the clipped region rather than
      through the buttons' visibility, and that is not a workaround — it is
      the stronger claim. `<Collapse>` folds by animating a grid track to
      `0fr` over an `overflow-hidden` child, so the buttons inside keep boxes
      of their own; what actually takes them out of the tab order and the
      accessibility tree is the `inert` attribute.
    */
    const toolsBody = document.querySelector('#settings-group-tools > div') as HTMLElement;
    expect(toolsBody.hasAttribute('inert')).toBe(false);

    fireEvent.click(tools);
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    expect(toolsBody.hasAttribute('inert')).toBe(true);

    // Folding one category leaves the others alone.
    expect(
      (document.querySelector('#settings-group-general > div') as HTMLElement).hasAttribute('inert'),
    ).toBe(false);
    expect(nav.getByRole('button', { name: 'Appearance' })).toBeTruthy();

    fireEvent.click(tools);
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    expect(toolsBody.hasAttribute('inert')).toBe(false);
  });

  it("reads every view's narrowing, edits it live, and resets it", async () => {
    renderView(
      // `ReposPanel`'s own action menu reaches `useToasts()` through
      // `useRepoActions` — not something `test-support/render.tsx`'s shared
      // wrapper provides, since most callers of `renderView` never mount it.
      <ToastHost>
        <SettingsView />
        <ReposPanel />
      </ToastHost>,
      {
        fixtures: settingsFixtures,
        // `useViewSections` reads `activeView` (not `settingsPage`) to decide
        // which row's filter is "the live one" — Settings IS the active view
        // in the real app once you have navigated here, so the fixture has
        // to say so too, or every row reads as unfiltered regardless of what
        // gets clicked.
        uiState: { ...UI_STATE, settingsPage: 'sidebar', activeView: 'settings' },
      },
    );
    expect(await screen.findByRole('heading', { name: 'Sidebar' })).toBeTruthy();

    // The defaults, readable per row: Changes arrives narrowed, Graph whole.
    const changes = screen.getByRole('radiogroup', { name: 'Changes' });
    expect(
      changes.querySelector('[role="radio"][aria-checked="true"]')?.textContent,
    ).toBe('Narrowed');
    const graph = screen.getByRole('radiogroup', { name: 'Graph' });
    expect(graph.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe(
      'Everything',
    );

    // Nothing overridden yet, so there is nothing for reset to do.
    const resetButton = screen.getByRole('button', { name: 'Reset to view defaults' });
    expect((resetButton as HTMLButtonElement).disabled).toBe(true);

    /*
      The Settings row is the live one — Settings IS the active view — so
      flipping it must narrow the panel sitting beside this very page. That is
      the whole claim of the page: same store field as the panel's funnel
      button, seen from the other side.
    */
    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();
    const settingsRow = screen.getByRole('radiogroup', { name: 'Settings' });
    fireEvent.click(settingsRow.querySelector('[role="radio"]')!); // "Narrowed" is the first option
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull());

    // Reset puts the row — and the panel — back.
    expect((resetButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(resetButton);
    expect((resetButton as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();
  });

  it('the Agent page shows the version card and browses ~/.claude', async () => {
    renderView(<SettingsView />, {
      fixtures: settingsFixtures,
      uiState: { ...UI_STATE, settingsPage: 'agent' },
    });

    // Version card, from the mocked login-shell probe.
    expect(await screen.findByText('v2.1.34')).toBeTruthy();
    expect(screen.getByText('via npm')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update Claude' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Uninstall…' }).length).toBeGreaterThanOrEqual(1);

    // The ~/.claude tree is lazy like the repo one.
    expect(await screen.findByRole('treeitem', { name: 'settings.json' })).toBeTruthy();
    fireEvent.click(screen.getByRole('treeitem', { name: 'skills' }));
    expect(await screen.findByRole('treeitem', { name: 'brainstorm' })).toBeTruthy();
  });
});
