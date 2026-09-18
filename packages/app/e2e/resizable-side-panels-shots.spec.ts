import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  REPRODUCIBLE_REMOTE,
  setReducedMotion,
  settle,
  shotPath,
  type MockFixtures,
} from './shots-helper';

/**
 * Ad hoc: the same `ResizeHandle`/`useResizable` splitter every other side
 * panel already uses, extended to the three fixed-width panels the audit
 * found — GitHub Projects' Board-mode task-detail panel (the named gap:
 * Graph mode already had it, Table mode has no side panel to begin with),
 * the Database view's connections list, and Settings' inner page nav. One
 * "default" and one "dragged wider" shot per surface, proving the handle is
 * there and actually moves the panel — not a full light/dark matrix, since
 * these are the same splitter component every other `*-shots.spec.ts`
 * already covers pixel-for-pixel.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-resizable-side-panels';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const STATUS_FIELD = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [
    { id: 'todo', name: 'Todo', color: 'GRAY' },
    { id: 'doing', name: 'In Progress', color: 'BLUE' },
  ],
};

const EMPTY_DEPS = { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false };

const issue = (n: number, title: string, optionId: string) => ({
  id: `PVTI_${n}`,
  content: {
    type: 'issue' as const,
    id: `I_${n}`,
    number: 40 + n,
    title,
    url: `https://github.com/bilo-io/midnite-studio/issues/${40 + n}`,
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
    dependencies: EMPTY_DEPS,
  },
  fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select' as const, optionId, name: 'Todo' } },
});

const boardFixtures: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  refs: [],
  statusEntries: [],
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [STATUS_FIELD] },
    items: { [BOARD.id]: [issue(1, 'Wire up the resizable splitter', 'todo')] },
  },
};

test('Board mode: the task-detail panel default width, then dragged wider', async ({ page }) => {
  await installMockBridge(page, boardFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await page.getByText('Wire up the resizable splitter').click();

  const handle = page.getByRole('separator', { name: 'Resize task details' });
  await expect(handle).toBeVisible();
  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'board-panel-default') });

  // Nudge wider with the keyboard — same interaction Graph mode's own
  // resize test already exercises, just now reachable from Board mode too.
  await handle.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowLeft'); // edge: 'end' — grows toward the left
  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'board-panel-resized') });
});

const SEEDED_CONNECTION = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres' as const,
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

test('Database view: the connections list default width, then dragged wider', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, dbConnections: [SEEDED_CONNECTION] });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setReducedMotion(page);
  await clickRailLink(page, 'Database');
  await settle(page, 300);

  const handle = page.getByRole('separator', { name: 'Resize connections list' });
  await expect(handle).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'database-list-default') });

  await handle.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight');
  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'database-list-resized') });
});

test('Settings: the inner page nav default width, then dragged wider', async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('navigation', { name: 'Settings pages' })).toBeVisible();

  const handle = page.getByRole('separator', { name: 'Resize settings pages' });
  await expect(handle).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'settings-nav-default') });

  await handle.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight');
  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'settings-nav-resized') });
});
