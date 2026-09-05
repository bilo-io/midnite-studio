import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  REPRODUCIBLE_REMOTE,
  setTheme,
  shotPath,
  type MockFixtures,
} from './shots-helper';

/**
 * The renderer-side half of page detachment: each of the five detachable
 * pages rendered standalone through `DetachedRoot` (the mocked bridge reports
 * that `windowRole`, exactly as `main.tsx` reads it from `additionalArguments`
 * in the real app), and the main layout STILL rendering the same page while a
 * popout of it is open.
 *
 * That second half is the whole difference from `detached-panels-shots.spec.ts`,
 * which asserts the opposite for panels: a detached panel's docked slot
 * collapses to nothing, whereas a detached page leaves the main window
 * untouched — it duplicates rather than moves.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-page-detach';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

/*
  The five original page roles plus Theme J's eight. Not read from
  `PAGE_WINDOW_ROLES` directly: each entry below needs a rail label, a route
  and its own fixture, so the list has to be spelled out anyway — and a role
  added to the shared tuple without a row here should be a visible omission
  rather than a silently-skipped shot.
*/
const PAGE_ROLES = [
  'graph',
  'actions',
  'changes',
  'files',
  'database',
  'dashboard',
  'search',
  'tests',
  'projects',
  'reviews',
  'issues',
  'history',
  'optimizer',
] as const;

type PageRole = (typeof PAGE_ROLES)[number];

/** The name the mark's own tooltip and label use, per `PAGE_ROLE_TITLE`. */
const TITLE: Record<PageRole, string> = {
  graph: 'Graph',
  actions: 'Actions',
  changes: 'Changes',
  files: 'File Explorer',
  database: 'DB Explorer',
  dashboard: 'Dashboard',
  search: 'Search',
  tests: 'Tests',
  projects: 'Projects',
  reviews: 'Reviews',
  issues: 'Issues',
  history: 'History',
  optimizer: 'Workspace Optimizer',
};

/** The rail row each page is reached by in the main window. */
const RAIL_LABEL: Record<PageRole, string> = {
  graph: 'Graph',
  actions: 'Actions',
  changes: 'Changes',
  files: 'Explorer',
  database: 'Database',
  dashboard: 'Dashboard',
  search: 'Search',
  tests: 'Tests',
  projects: 'Projects',
  reviews: 'Reviews',
  issues: 'Issues',
  history: 'History',
  optimizer: 'Optimizer',
};

/** The route a popout of that page loads directly — it has no rail. */
const PATH: Record<PageRole, string> = {
  graph: '/graph',
  actions: '/actions',
  changes: '/changes',
  files: '/files',
  database: '/database',
  dashboard: '/dashboard',
  search: '/search',
  tests: '/tests',
  projects: '/projects',
  reviews: '/reviews',
  issues: '/issues',
  history: '/history',
  optimizer: '/optimizer',
};

/*
  Just enough data per page for its header row — and so the mark on it — to
  render at all. Three of the five answer an empty payload with a full-pane
  `EmptyState` that has no header, so a bare `fixtures` would shoot the empty
  state rather than the control this spec is about.
*/
const run = (id: string, title: string, conclusion: string) => ({
  id,
  name: 'CI',
  status: 'completed',
  conclusion,
  headBranch: 'main',
  headSha: 'a'.repeat(40),
  createdAt: '2026-08-26T10:00:00Z',
  startedAt: '2026-08-26T10:00:00Z',
  updatedAt: '2026-08-26T10:04:12Z',
  event: 'push',
  workflowId: '900',
  workflowName: 'CI',
  displayTitle: title,
  number: Number(id),
  url: `https://github.com/bilo-io/midnite-studio/actions/runs/${id}`,
});

const EXTRA: Record<PageRole, Partial<MockFixtures>> = {
  graph: {},
  changes: {},
  /*
    Theme J's eight. Four of them (`reviews`, `issues`, `projects`, `tests`)
    read the forge, and three of those answer an empty payload with a
    full-pane `EmptyState` that has NO header — so a bare `fixtures` would
    shoot the empty state rather than the control this spec is about. The
    forge payload below is the minimum that gets each header on screen.
  */
  dashboard: { remotes: [REPRODUCIBLE_REMOTE] },
  search: {},
  history: {},
  optimizer: {},
  tests: {},
  projects: {
    remotes: [REPRODUCIBLE_REMOTE],
    forge: { cli: { reason: 'ready' } } as MockFixtures['forge'],
  },
  reviews: {
    remotes: [REPRODUCIBLE_REMOTE],
    forge: { cli: { reason: 'ready' } } as MockFixtures['forge'],
  },
  issues: {
    remotes: [REPRODUCIBLE_REMOTE],
    forge: { cli: { reason: 'ready' } } as MockFixtures['forge'],
  },
  actions: {
    remotes: [REPRODUCIBLE_REMOTE],
    forge: {
      cli: { reason: 'ready' },
      runs: [
        run('3', 'feat(windows): pages detach into their own window', 'success'),
        run('2', 'fix(graph): lane ink against a CVD-safe palette', 'failure'),
      ],
    } as MockFixtures['forge'],
  },
  files: {
    fsDirs: {
      'repo:': [
        { name: 'packages', kind: 'dir', size: 0, isIgnored: false },
        { name: 'docs', kind: 'dir', size: 0, isIgnored: false },
        { name: 'README.md', kind: 'file', size: 120, isIgnored: false },
      ],
    },
  },
  database: {
    dbConnections: [
      {
        id: 'c1',
        name: 'Local Postgres',
        provider: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'app',
        username: 'app_user',
      },
    ],
  },
};

/*
  Which roles each shot can actually reach, and why the two lists differ.

  Every one of the thirteen marks is unit-tested (`page-detach-mark.test.tsx`);
  these lists are about what a SCREENSHOT can get on screen under the shared
  fixtures, which is a narrower question.

  `tests` and `projects` are absent from both: their headers sit behind a data
  guard — `TestsView` early-returns an `EmptyState` until discovery finds at
  least one package, `ProjectsView` until the forge returns at least one board
  — so with no fixture there is no header to shoot, only the empty state. That
  is the same behaviour `files` and `actions` already have and is not a defect;
  it just means a shot of the mark needs a whole bespoke fixture set, which is
  not worth carrying for an image.

  `optimizer` is absent from the rail-walked shots only: its nav row is gated
  behind the default-off `Settings ▸ Workspace Optimizer` switch, so
  `clickRailLink` cannot reach it and `/optimizer` redirects to the graph. Its
  popout renders standalone, so it keeps its `DetachedRoot` shot.
*/
const STANDALONE_ROLES = PAGE_ROLES.filter(
  (role) => role !== 'tests' && role !== 'projects',
);
const RAIL_ROLES = STANDALONE_ROLES.filter((role) => role !== 'optimizer');

for (const role of STANDALONE_ROLES) {
  test(`DetachedRoot(${role})`, async ({ page }) => {
    await setTheme(page, 'dark');
    await installMockBridge(page, {
      ...fixtures,
      ...EXTRA[role],
      windowRole: role,
    } as MockFixtures);
    await page.goto(PATH[role]);
    await setTheme(page, 'dark');

    await expect(page.locator('body')).toBeVisible();
    // The mark the page's own header carries, which in a popout of that same
    // page offers "close" rather than "detach".
    await expect(page.locator(`[data-page-detach-mark="${role}"]`)).toHaveCount(1);
    await page.waitForTimeout(250);
    await page.screenshot({ path: shotPath(OUT, `detached-page-${role}.png`) });
  });

}

for (const role of RAIL_ROLES) {
  test(`${role} — the mark morphs to detach on hover`, async ({ page }) => {
    await setTheme(page, 'dark');
    await installMockBridge(page, { ...fixtures, ...EXTRA[role] } as MockFixtures);
    await page.goto('/');
    await clickRailLink(page, RAIL_LABEL[role]);
    await setTheme(page, 'dark');

    const mark = page.locator(`[data-page-detach-mark="${role}"]`);
    await mark.hover();
    // At rest the mark is the view's own rail glyph; hovering swaps it for the
    // action, so the control costs no width the header was not already
    // spending on an icon.
    await expect(
      page.getByLabel(`Detach ${TITLE[role]} into its own window`),
    ).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: shotPath(OUT, `mark-hover-${role}.png`) });
  });

  test(`${role} still renders in the main window while detached`, async ({ page }) => {
    await setTheme(page, 'dark');
    // `useWindowSync` reconciles `detachedPages` off `window.list()` and
    // nothing else — see that hook's own doc and `openPopoutRoles`'s.
    await installMockBridge(page, {
      ...fixtures,
      ...EXTRA[role],
      openPopoutRoles: [role],
    } as MockFixtures);
    // Through the rail, not straight to the route: several of these views read
    // the selected repository, which the rail walk establishes and a cold
    // deep-link does not.
    await page.goto('/');
    await clickRailLink(page, RAIL_LABEL[role]);
    await setTheme(page, 'dark');

    // Present, not collapsed: the page is still here, and its mark has
    // switched to focusing the window that already exists.
    await expect(page.locator(`[data-page-detach-mark="${role}"]`)).toHaveCount(1);
    await page.waitForTimeout(250);
    await page.screenshot({ path: shotPath(OUT, `main-while-detached-${role}.png`) });
  });
}
