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
 * The dependency graph's overall look (Phase 75 Theme D) — the canvas with
 * a real dependency chain and its legend, light and dark. A first shot of a
 * brand-new surface, so "after" only — there is no "before" to diff against.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/p75-d-canvas';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const MAIN = '/tmp/midnite-studio';

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const EMPTY_DEPS = { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false };

const issue = (n: number, title: string, blockedBy: { number: number; repo?: string }[] = []) => ({
  id: `PVTI_${n}`,
  content: {
    type: 'issue' as const,
    id: `I_${n}`,
    number: 40 + n,
    title,
    url: `https://github.com/bilo-io/midnite-studio/issues/${40 + n}`,
    state: 'OPEN' as const,
    assignees: n === 1 ? ['octocat'] : [],
    body: '',
    labels: [],
    dependencies: {
      ...EMPTY_DEPS,
      blockedBy: blockedBy.map((b) => ({ number: b.number, title: '', state: 'OPEN' as const, repo: b.repo ?? '' })),
    },
  },
  fieldValues: {},
});

const A = issue(1, 'Land the write path');
const B = issue(2, 'Build the settings page on top of it', [{ number: A.content.number }]);
const C = issue(3, 'Waits on a cross-repo issue', [{ number: 12, repo: 'bilo-io/midnite' }]);

const base: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  refs: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [] },
    items: { [BOARD.id]: [A, B, C] },
  },
};

async function openGraph(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  if (mode === 'dark') await setTheme(page, 'dark');
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByTestId('project-graph-view')).toBeVisible();
  await page.waitForTimeout(300);
}

for (const mode of ['light', 'dark'] as const) {
  test(`the canvas, with a real dependency and its legend (${mode})`, async ({ page }) => {
    await openGraph(page, mode);
    await page.screenshot({ path: shotPath(OUT, `canvas-${mode}`) });
  });
}

test('the all-drafts-or-PRs empty state', async ({ page }) => {
  await installMockBridge(page, {
    ...base,
    forgeProject: {
      projects: [BOARD],
      fields: { [BOARD.id]: [] },
      items: {
        [BOARD.id]: [
          { id: 'd1', content: { type: 'draft', id: 'DI_1', title: 'A draft with no dependencies', assignees: [], body: '' } },
        ],
      },
    },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByText('Dependencies live on issues. This board has none.')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(OUT, 'empty-all-drafts') });
});
