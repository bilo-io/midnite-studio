import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { useBrowserStore } from '../../store/browser-store';
import { useReviewsStore } from '../../store/reviews-store';
import { useUiStore } from '../../store/ui-store';
import { ReposPanel } from './repos-panel';

/**
 * `ReposPanel`'s workbench/rail suite. Sits beside
 * `repos-panel.bridge.test.tsx` (wave 5's `remote-links` + `journal-undo`
 * migration) rather than inside it: both waves independently created a
 * `repos-panel.bridge.test.tsx`, and their fixtures genuinely disagree —
 * wave 5's `localRef` seeds `sha: 'b'.repeat(40)` because `journal-undo`
 * asserts a branch is recreated at *its own* sha rather than `HEAD`, while
 * this file's seeds `'a'.repeat(40)`. Folding them into one file would have
 * meant reconciling two fixture sets whose values are load-bearing for
 * different assertions, so the suites stay split by concern and share only
 * the component under test — the same shape wave 4 already used for
 * `companion-panel-workbench.bridge.test.tsx` beside `companion-panel.test.tsx`.
 *
 * Migrated from `e2e/repos-workbench.spec.ts` (Phase 82 Theme C, wave 4) —
 * 10 of its 18 tests move to jsdom, mounting the real `ReposPanel` (wrapped
 * in `ToastHost`, the same pairing `settings-view.bridge.test.tsx` already
 * established — `ReposPanel`'s own action menu reaches `useToasts()` through
 * `useRepoActions`).
 *
 * **8 stay in Playwright.** One is a real-CSS assertion ("the panel heading
 * is 'Git Repos', in the Git mark and its brand orange" — `toHaveCSS`
 * against a computed colour jsdom cannot honestly produce). Four are
 * geometry: the tab bar's stats-before-close-button ordering, the section
 * headings' shared row height, a folded repo's trailing-edge alignment, and
 * the commit box's equal inset — all `boundingBox()` comparisons. Three are
 * genuine cross-component flows: "View all changes" opens a tab hosted by
 * `Workbench` (a sibling component, not something `ReposPanel` renders),
 * so its accordion counts, totals and close behaviour test `Workbench` +
 * `AllChangesView`, not this component.
 *
 * `goToChanges` (clicking the rail) is replaced by
 * `useUiStore.getState().setActiveView('changes')` directly — the same
 * substitution `search-view.bridge.test.tsx`'s `Harness` used for the rail's
 * own view switch — since mounting the rail to click it would test the rail,
 * not `ReposPanel`. The Reviews row's final "Open #42 on GitHub" click is
 * dropped: it opens `PrDetail`, which `pr-detail.bridge.test.tsx` (wave 3)
 * already covers end to end; what this file owns is that the row's own
 * click selects the right PR and switches views, asserted directly through
 * `useReviewsStore`/`useUiStore` rather than by re-mounting `PrDetail`.
 */

const MAIN = '/tmp/midnite-studio';
const FEATURE = '/tmp/midnite-studio-feature';

const entry = (path: string, unstaged = 'modified') => ({
  path,
  origPath: null,
  staged: 'unmodified',
  unstaged,
  conflicted: false,
  similarity: null,
});

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const diffFor = (path: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 1,
  deletions: 1,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

/**
 * Two checkouts that disagree: main is clean, the feature worktree has three
 * changed files. Every assertion below depends on that asymmetry.
 */
const base: MockFixtures = {
  ...fixtures,
  refs: [
    localRef('main', { isHead: true, worktreePath: MAIN }),
    localRef('feature/x', { worktreePath: FEATURE }),
    localRef('shelved'),
  ],
  remotes: REMOTES,
  diffs: {
    ...fixtures.diffs,
    'wt:src/a.ts': diffFor('src/a.ts'),
    'wt:src/b.ts': diffFor('src/b.ts'),
    'wt:README.md': diffFor('README.md'),
  },
  worktrees: [{ path: FEATURE, branch: 'feature/x' }],
  statusEntries: [],
  statusByWorktree: {
    [MAIN]: [],
    [FEATURE]: [entry('src/a.ts'), entry('src/b.ts'), entry('README.md', 'untracked')],
  },
  statusCounts: {
    'unstaged:src/a.ts': { insertions: 1, deletions: 1 },
    'unstaged:src/b.ts': { insertions: 20, deletions: 2 },
    'unstaged:README.md': { insertions: 300, deletions: 0 },
  },
};

const UI_STATE = { selectedRepoId: 'repo-1' };

// `useUiStore` is a module singleton — fold state (`collapsedRepoSections`),
// the dirty-only filter and `activeView` all leak across tests otherwise
// (a previous test's opened "Actions" section reads as already-open in the
// next one). Captured once, before any test has touched the store, and
// replaced wholesale (zustand's `setState(state, true)`) rather than merged.
const INITIAL_UI_STATE = useUiStore.getState();

function open(fx: MockFixtures = base): void {
  renderView(
    <ToastHost>
      <ReposPanel />
    </ToastHost>,
    { fixtures: fx, uiState: UI_STATE },
  );
}

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
  useReviewsStore.setState({ selectedPull: {}, openGroups: {} });
  useBrowserStore.setState({ tabs: [], activeTabId: null });
});

afterEach(cleanup);

describe('ReposPanel workbench and rail, assembled through the real bridge', () => {
  it('a change count lands on the checkout that owns it, not the repo', async () => {
    open();

    const pills = await screen.findAllByTestId('change-count');
    expect(pills).toHaveLength(2); // the worktree row and its branch row
    expect(pills[0]?.textContent).toBe('3');

    expect(screen.queryByLabelText(/^main: \d+ changed/)).toBeNull();
  });

  it('the Changes view hides the checkouts with nothing in them', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();

    useUiStore.getState().setActiveView('changes');

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Worktrees' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Actions for worktree feature\/x/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Actions for worktree main' })).toBeNull();
  });

  it('the filter is visible while on, and reversible', async () => {
    open();
    useUiStore.getState().setActiveView('changes');

    const toggle = await screen.findByRole('button', { name: 'Showing only changed checkouts' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);

    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actions for worktree main' })).toBeTruthy();
  });

  it('a worktree offers its actions on right-click and on hover', async () => {
    open();

    const row = await screen.findByRole('button', { name: 'Actions for worktree feature/x' });
    fireEvent.click(row);
    expect(await screen.findByRole('menuitem', { name: 'View all changes' })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /Remove worktree feature\/x/ }),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    // The same menu from the same row, reached the other way.
    fireEvent.contextMenu(screen.getAllByText('feature/x')[0]!);
    expect(await screen.findByRole('menuitem', { name: 'View all changes' })).toBeTruthy();
  });

  it('removing a worktree asks first, in danger colours, naming what is at stake', async () => {
    open();
    // The confirm's "N uncommitted changes" count reads off the same status
    // query the change-count pill does — wait for that pill so the dialog
    // is not opened against a still-loading `changed: 0`.
    await screen.findAllByTestId('change-count');

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for worktree feature/x' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Remove worktree feature\/x/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('3 uncommitted changes in this checkout would be lost.');
    expect(screen.getByRole('button', { name: 'Remove worktree' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('the main worktree cannot be removed', async () => {
    open();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for worktree main' }));
    const item = await screen.findByRole('menuitem', { name: /Remove worktree/ });
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });

  it('Actions lists what gh reports, and a Reviews row selects the right PR', async () => {
    open({
      ...base,
      forge: {
        cli: { reason: 'ready' },
        runs: [
          {
            id: '1',
            name: 'CI',
            status: 'completed',
            conclusion: 'failure',
            headBranch: 'feature/x',
            headSha: 'a'.repeat(40),
            createdAt: '2026-08-26T10:00:00Z',
            url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1',
          },
        ],
        pulls: [
          {
            number: 42,
            title: 'Line the table up',
            state: 'open',
            isDraft: false,
            reviewDecision: 'APPROVED',
            checks: 'failing',
            headBranch: 'feature/x',
            author: 'bilo',
            url: 'https://github.com/bilo-io/midnite-studio/pull/42',
          },
        ],
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('img', { name: 'Failed' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reviews' }));
    fireEvent.click(await screen.findByRole('button', { name: 'All Pull Requests' }));
    expect(await screen.findByText('Line the table up')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Approved' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Checks failing' })).toBeTruthy();

    // The row opens the Reviews VIEW, on the PR it names — not a workbench
    // tab, and not `PrDetail` itself (`pr-detail.bridge.test.tsx` already
    // covers that view end to end).
    fireEvent.click(screen.getByText('Line the table up'));
    expect(useUiStore.getState().activeView).toBe('reviews');
    expect(useReviewsStore.getState().selectedPull).toEqual({ 'repo-1': 42 });
    // Nothing opened a browser tab on its own — that is `PrDetail`'s own
    // "Open on GitHub" button, out of scope for this row.
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('a signed-out gh says what to run rather than failing silently', async () => {
    open({
      ...base,
      forge: { cli: { reason: 'not-authenticated', hint: 'Run `gh auth login` in a terminal.' } },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions' }));
    // `[aria-label="Actions"]` is the section's `Collapse` BODY
    // (`tree-section.tsx`), a sibling of the heading's `<header>`, not an
    // ancestor of it — scoped this way rather than via `.closest` because
    // Reviews' own "All Pull Requests" group renders the identical hint at
    // the same time (it is open by default) and an unscoped text query would
    // match both.
    await waitFor(() => {
      const section = document.querySelector('[aria-label="Actions"]');
      expect(section?.textContent).toContain('Run `gh auth login` in a terminal.');
    });
  });

  it('a repo with no GitHub remote grows no forge sections at all', async () => {
    open({ ...base, remotes: [] });

    await screen.findByRole('heading', { name: 'Worktrees' });
    expect(screen.queryByRole('heading', { name: 'Forge' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reviews' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Issues' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tests' })).toBeNull();
  });

  it('a GitHub remote nests Actions/Reviews/Issues/Tests under one Forge heading, counted', async () => {
    open();

    const forge = await screen.findByRole('heading', { name: 'Forge' });
    const header = forge.closest('header');
    expect(header?.textContent).toBe('Forge4');

    for (const title of ['Actions', 'Reviews', 'Issues', 'Tests']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
  });
});

/**
 * Migrated from `e2e/nav-shell.spec.ts` (Phase 82 Theme C, wave 4) — the
 * half of that file that is genuinely `ReposPanel`'s own business:
 * `useViewSections`' per-view narrowing, its escape hatch, and that the
 * selected checkout survives a view switch.
 *
 * **The other half stays in Playwright.** "The rail carries all sixteen
 * views", "each view is reachable", "Actions/Reviews are absent for a
 * repository gh could never answer for" and "standing in Actions when it
 * disappears lands you on the graph" all need the actual nav rail —
 * `AppFrame` from `@bilo-io/shell`, fed the `nav` array `app.tsx` builds —
 * which is a different (and much larger) surface than this component.
 * `clickRail`/rail navigation is replaced throughout by
 * `useUiStore.getState().setActiveView(...)` directly, same substitution as
 * the `activeView`-driven tests above.
 *
 * "The Changes filter still behaves as Phase 17 shipped it" is dropped
 * outright, not ported: it re-asserts exactly what "the Changes view hides
 * checkouts with nothing in them" and "the filter is visible while on, and
 * reversible" (above) already cover — aria-pressed, the dirty checkout
 * surviving, the clean one not, and the toggle reversing it.
 *
 * "Show all sections is the escape hatch, and it persists" is split: the
 * escape-hatch behaviour below is new coverage (a different label —
 * `filterFor`'s `dirtyOnly: false` case, "Show all sections" rather than
 * "Showing only changed checkouts" — and a different, non-dirty-only
 * mechanism), but its reload-persistence half stays in
 * `e2e/nav-shell.spec.ts`, trimmed to just that: `useUiStore` is a module
 * singleton hydrated once at import time, so a jsdom "reload" would need to
 * reset and re-import the module fresh, the same reason
 * `settings-view.bridge.test.tsx` left an identical reload claim behind.
 */
describe("ReposPanel's view-scoped section filtering (nav-shell)", () => {
  const withTag: MockFixtures = {
    ...base,
    refs: [
      ...base.refs!,
      {
        name: 'v0.1.0',
        fullName: 'refs/tags/v0.1.0',
        kind: 'tag',
        sha: 'a'.repeat(40),
        upstream: null,
        isHead: false,
        worktreePath: null,
      },
    ],
  };

  it('the Actions view narrows the sidebar to Actions and Worktrees', async () => {
    open();
    useUiStore.getState().setActiveView('actions');

    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Worktrees' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Remotes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tags' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reviews' })).toBeNull();

    // Unlike Changes, Actions keeps the CLEAN checkout too — having runs has
    // nothing to do with having uncommitted work.
    expect(screen.getByRole('button', { name: 'Actions for worktree main' })).toBeTruthy();
  });

  it('the view section is collapsed on arrival; Worktrees is open', async () => {
    open();
    useUiStore.getState().setActiveView('actions');

    const actionsToggle = await screen.findByRole('button', { name: /^Actions( \d+)?$/ });
    expect(actionsToggle.getAttribute('aria-expanded')).toBe('false');
    const worktreesToggle = screen.getByRole('button', { name: /^Worktrees( \d+)?$/ });
    expect(worktreesToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('"Show all sections" is the narrowed view\'s escape hatch, and it is per-view', async () => {
    open(withTag);
    useUiStore.getState().setActiveView('actions');
    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Show all sections' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);

    expect(screen.getByRole('heading', { name: 'Local' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeTruthy();

    // Per-view: it did not also unfilter Changes.
    useUiStore.getState().setActiveView('changes');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull());
  });

  it('a view with no narrowing of its own can still be filtered by hand', async () => {
    open();
    // Graph has no `filterFor` entry at all — the `dirtyOnly: false` +
    // `filtered: false` case, labelled differently from both the Changes
    // and the Actions toggles.
    useUiStore.getState().setActiveView('graph');

    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show every ref and checkout' }));

    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for worktree main' })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Actions for worktree feature\/x/ }),
    ).toBeTruthy();
  });

  it('switching views keeps the checkout you were looking at', async () => {
    open();
    await screen.findByRole('heading', { name: 'Worktrees' });
    useUiStore.getState().selectWorktree(FEATURE);
    expect(useUiStore.getState().selectedWorktreePath).toBe(FEATURE);

    // The rail changes what you are looking AT, never what you are looking
    // at it FOR — switching through several views must not drop the
    // selection.
    for (const view of ['files', 'actions', 'tests', 'dashboard', 'graph'] as const) {
      useUiStore.getState().setActiveView(view);
      expect(useUiStore.getState().selectedWorktreePath).toBe(FEATURE);
    }
  });
});
