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
 * Blocked tasks and the thicker AI glow (ad hoc) — before/after shots of the
 * Board, Graph and List (table) views, light and dark. Run once against
 * `main` with `MSTUDIO_SHOT_VARIANT=before`, once on the branch.
 *
 * Needs a real browser for real CSS: the glow's blurred bloom, the SVG status
 * strokes and their opacity are paint, which jsdom does not do. Reduced
 * motion, so the ramp and the marching dashes rest at the same frame in every
 * run.
 *
 * Three tasks are blocked (by an open blocker), one has a running agent and one
 * a waiting one — seeded `terminalSessions` with the card's own `taskRef`,
 * the same shape `project-graph-glow-shots.spec.ts` uses.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-blocked-glow';
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
    state: status.id === 'OPT_done' ? ('closed' as const) : ('open' as const),
    assignees: [],
    body: '',
    labels: [],
    dependencies: {
      ...EMPTY_DEPS,
      blockedBy: blockedBy.map((b) => ({
        number: 40 + b,
        title: '',
        state: CLOSED_ISSUES.has(b) ? ('closed' as const) : ('open' as const),
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
  issue(3, 'Wire the settings toggle (blocked)', TODO, [2]),
  issue(4, 'Build the importer (running)', DOING),
  issue(5, 'Document the importer (blocked)', TODO, [4]),
  issue(6, 'Polish the empty states (waiting)', REVIEW),
  issue(7, 'Review the importer docs (blocked)', REVIEW, [5]),
];

const session = (id: string, itemId: string, pid: number) => ({
  session: {
    id,
    kind: 'agent' as const,
    agentId: 'claude',
    title: 'card',
    cwd: MAIN,
    repoId: 'repo:midnite-studio',
    createdAt: 1,
    surface: 'kanban' as const,
    taskRef: { projectId: BOARD.id, itemId },
  },
  live: { ptyId: `pty-${id}`, pid, cols: 80, rows: 24 },
});

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
  terminalSessions: [session('running', 'PVTI_4', 991), session('waiting', 'PVTI_6', 992)],
};

type View = 'Board view' | 'Graph view' | 'Table view';

async function open(page: Page, mode: 'light' | 'dark', view: View): Promise<void> {
  await page.setViewportSize({ width: 1800, height: 620 });
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 30_000 });
  if (mode === 'dark') await setTheme(page, 'dark');
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: view }).click();
  await expect(page.getByText('Land the write path').first()).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean }).__mstudioPtyActivity(
      'pty-waiting',
      'waiting',
    );
  });
  await page.waitForTimeout(500);
}

for (const mode of ['dark', 'light'] as const) {
  test(`board (${mode})`, async ({ page }) => {
    await open(page, mode, 'Board view');
    await page.getByTestId('board-view').screenshot({ path: shotPath(OUT, `board-${mode}-${VARIANT}.png`) });
  });

  test(`graph (${mode})`, async ({ page }) => {
    await open(page, mode, 'Graph view');
    await page.getByTestId('project-graph-view').screenshot({ path: shotPath(OUT, `graph-${mode}-${VARIANT}.png`) });
  });

  test(`list (${mode})`, async ({ page }) => {
    await open(page, mode, 'Table view');
    await page.getByTestId('projects-view').screenshot({ path: shotPath(OUT, `list-${mode}-${VARIANT}.png`) });
  });
}
