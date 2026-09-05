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
 * A Kanban card with a live agent — before/after shots for the recoloured
 * glow and the new `>_` button.
 *
 * A standalone spec, on `fab-halo-shots.spec.ts`'s own pattern: run once
 * against `main` (the grey `currentColor` ring, no button) and once against
 * the branch (the rainbow ramp, plus the button), from the same file, so the
 * two frames differ only in what the app draws. Reduced motion, so the ramp
 * rests at the same registered `0deg` in both runs rather than at whatever
 * frame the 4s rotation happened to be on — a spinning ring cannot be
 * compared across two runs at all.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays
 * fast.
 */
const OUT = '../../docs/screenshots/adhoc-kanban-rainbow-terminal';
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
    // Both required in practice — see `kanban.spec.ts`'s note on the defaults.
    body: '',
    labels: [],
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId, name: optionId === 'OPT_todo' ? 'Todo' : 'In progress' },
  },
});

const RUNNING = todo(1, 'Wire the write path', 'OPT_doing');
const IDLE = todo(2, 'A card nobody touches', 'OPT_doing');
const OTHER = todo(3, 'Backlog: rename the thing', 'OPT_todo');

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
    items: { [BOARD.id]: [RUNNING, IDLE, OTHER] },
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

async function openBoard(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  if (mode === 'dark') await setTheme(page, 'dark');
  // The ramp must be at rest for two runs to be comparable — see the note above.
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByText('Wire the write path')).toBeVisible();
}

/** The running card's own box, padded out so the glow's spread is in frame. */
async function shotCard(page: Page, name: string): Promise<void> {
  const card = page
    .getByText('Wire the write path')
    .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
  const box = (await card.boundingBox())!;
  const pad = 20;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: shotPath(OUT, `${name}-${VARIANT}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`a running card's glow (${mode})`, async ({ page }) => {
    await openBoard(page, mode);
    await shotCard(page, `card-${mode}`);
  });
}

test('the detail pane, with the session controls', async ({ page }) => {
  await openBoard(page, 'dark');
  await page.getByText('Wire the write path').click();
  await expect(page.getByTestId('card-detail')).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByTestId('card-detail').screenshot({ path: shotPath(OUT, `detail-${VARIANT}.png`) });
});
