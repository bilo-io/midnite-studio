import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_REMOTE,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Status-coloured card borders and the matching blocking edges (ad hoc) —
 * before/after shots of the board and the dependency graph. Run once
 * against `main` with `MSTUDIO_SHOT_VARIANT=before`, once on the branch.
 * Reduced motion so the marching dashes rest at the same offset in every run.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-status-dash';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const MAIN = '/tmp/midnite-studio';

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const OPTIONS = [
  { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
  { id: 'OPT_doing', name: 'In Progress', color: 'YELLOW' },
  { id: 'OPT_review', name: 'In Review', color: 'PURPLE' },
  { id: 'OPT_done', name: 'Done', color: 'GREEN' },
] as const;

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [...OPTIONS],
};

/** Issue 1 is the Done one — its dependents see it as a closed blocker. */
const CLOSED_ISSUES = new Set([1]);

const EMPTY_DEPS = { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false };

const issue = (n: number, title: string, status: (typeof OPTIONS)[number], blockedBy: number[] = []) => ({
  id: `PVTI_${n}`,
  content: {
    type: 'issue' as const,
    id: `I_${n}`,
    number: 40 + n,
    title,
    url: `https://github.com/bilo-io/midnite-studio/issues/${40 + n}`,
    state: status.id === 'OPT_done' ? ('CLOSED' as const) : ('OPEN' as const),
    assignees: [],
    body: '',
    labels: [],
    dependencies: {
      ...EMPTY_DEPS,
      blockedBy: blockedBy.map((b) => ({
        number: 40 + b,
        title: '',
        state: CLOSED_ISSUES.has(b) ? ('CLOSED' as const) : ('OPEN' as const),
        repo: '',
      })),
    },
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId: status.id, name: status.name },
  },
});

const [TODO, DOING, REVIEW, DONE] = OPTIONS;
const ITEMS = [
  issue(1, 'Land the write path', DONE),
  issue(2, 'Review the settings page', REVIEW, [1]),
  issue(3, 'Wire the settings toggle', TODO, [2]),
  issue(4, 'Build the importer', DOING),
  issue(5, 'Document the importer', TODO, [4]),
  issue(6, 'Polish the empty states', REVIEW),
];

const base: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  refs: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [STATUS_FIELD] },
    items: { [BOARD.id]: ITEMS },
  },
};

async function open(page: Page, mode: 'light' | 'dark', view: 'Board view' | 'Graph view'): Promise<void> {
  // Wide enough for all five board columns side by side.
  await page.setViewportSize({ width: 1800, height: 560 });
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 30_000 });
  if (mode === 'dark') await setTheme(page, 'dark');
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: view }).click();
  await expect(page.getByText('Land the write path')).toBeVisible();
  await page.waitForTimeout(400);
}

for (const mode of ['dark', 'light'] as const) {
  test(`board cards (${mode})`, async ({ page }) => {
    await open(page, mode, 'Board view');
    await page.getByTestId('board-view').screenshot({ path: shotPath(OUT, `board-${mode}-${VARIANT}.png`) });
  });

  test(`dependency graph (${mode})`, async ({ page }) => {
    await open(page, mode, 'Graph view');
    await page.getByTestId('project-graph-view').screenshot({ path: shotPath(OUT, `graph-${mode}-${VARIANT}.png`) });
  });
}
