import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  prepareForVisualCapture,
  REPRODUCIBLE_REMOTE,
  setTheme,
} from '../shots-helper';

/**
 * A running Kanban card's glow ring, in both themes.
 *
 * The fixture shape is lifted from `kanban-glow-shots.spec.ts` (an existing
 * ad hoc, `MSTUDIO_SHOTS`-gated spec that diffs a before/after PNG pair by
 * eye for a PR body) — same board, same running-agent session, so the card
 * this crops is exercising the identical "a live agent's card glows" state.
 * Reduced motion here for the same reason that spec sets it: the ring's
 * conic-gradient rotation has to be at rest for two runs to be
 * pixel-comparable at all, not merely at the same *frame index* the way a
 * before/after eyeball diff can tolerate.
 */
const MAIN = '/tmp/midnite-studio';

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [
    { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
    { id: 'OPT_doing', name: 'In progress', color: 'YELLOW' },
  ],
};

const todo = (n: number, title: string, optionId: string) => ({
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
  },
  fieldValues: {
    FIELD_status: {
      fieldId: 'FIELD_status',
      dataType: 'single_select' as const,
      optionId,
      name: optionId === 'OPT_todo' ? 'Todo' : 'In progress',
    },
  },
});

const RUNNING = todo(1, 'Wire the write path', 'OPT_doing');
const OTHER = todo(2, 'Backlog: rename the thing', 'OPT_todo');

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
    items: { [BOARD.id]: [RUNNING, OTHER] },
  },
  terminalSessions: [
    {
      session: {
        id: 'card-session-1',
        kind: 'agent' as const,
        agentId: 'claude',
        title: 'card',
        cwd: MAIN,
        repoId: 'repo:midnite-studio',
        createdAt: 1,
        surface: 'kanban' as const,
        taskRef: { projectId: BOARD.id, itemId: RUNNING.id },
      },
      live: { ptyId: 'pty-card-1', pid: 999, cols: 80, rows: 24 },
    },
  ],
};

async function openBoard(page: Page): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByText('Wire the write path')).toBeVisible();
}

/** The running card's own box — same locator `kanban-glow-shots.spec.ts` crops by hand. */
function runningCard(page: Page) {
  return page
    .getByText('Wire the write path')
    .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
}

for (const theme of ['light', 'dark'] as const) {
  test(`a running card's glow ring (${theme})`, async ({ page }) => {
    await openBoard(page);
    if (theme === 'dark') await setTheme(page, 'dark');
    await prepareForVisualCapture(page);

    await expect(runningCard(page)).toHaveScreenshot(`kanban-running-card-${theme}.png`);
  });
}
