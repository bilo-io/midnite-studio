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
 * A running graph node's own glow — before/after shots, following
 * `kanban-glow-shots.spec.ts` exactly (Phase 75 Theme F's own fourth
 * deferred item, closed here now that Theme D gives it a canvas to shoot).
 *
 * Reduced motion, so the ramp rests at the same registered `0deg` in both
 * runs rather than at whatever frame the 4s rotation happened to be on.
 * Running state is a seeded `terminalSessions` fixture with `surface:
 * 'kanban'` and the node's own `taskRef` — not a launched agent, matching
 * `useGraphAgentStates`' own read of that same session shape.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-project-graph-glow';
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

const EMPTY_DEPS = { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false };

const issue = (n: number, title: string, blockedByNumber?: number) => ({
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
    dependencies:
      blockedByNumber === undefined
        ? EMPTY_DEPS
        : { ...EMPTY_DEPS, blockedBy: [{ number: blockedByNumber, title: '', state: 'OPEN', repo: '' }] },
  },
  fieldValues: {},
});

const RUNNING = issue(1, 'Wire the write path');
const WAITING = issue(2, 'Waiting on a question', 40 + 1);
const IDLE = issue(3, 'Nobody has touched this one', 40 + 1);

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
    items: { [BOARD.id]: [RUNNING, WAITING, IDLE] },
  },
  terminalSessions: [
    {
      session: {
        id: 'graph-session-running',
        kind: 'agent' as const,
        agentId: 'claude',
        title: 'node',
        cwd: MAIN,
        repoId: 'repo:midnite-studio',
        createdAt: 1,
        surface: 'kanban' as const,
        taskRef: { projectId: BOARD.id, itemId: RUNNING.id },
      },
      live: { ptyId: 'pty-graph-running', pid: 991, cols: 80, rows: 24 },
    },
    {
      session: {
        id: 'graph-session-waiting',
        kind: 'agent' as const,
        agentId: 'claude',
        title: 'node',
        cwd: MAIN,
        repoId: 'repo:midnite-studio',
        createdAt: 1,
        surface: 'kanban' as const,
        taskRef: { projectId: BOARD.id, itemId: WAITING.id },
      },
      live: { ptyId: 'pty-graph-waiting', pid: 992, cols: 80, rows: 24 },
    },
  ],
};

async function openGraph(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  if (mode === 'dark') await setTheme(page, 'dark');
  // The ramp must be at rest for two runs to be comparable — see the note above.
  await setReducedMotion(page);
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByTestId('project-graph-view')).toBeVisible();
  await expect(page.getByText('Wire the write path')).toBeVisible();

  // The mock bridge has no fixture field for "waiting" — it is main's own
  // activity detector's guess, reported over the same seam a spec pokes at
  // directly. Same mechanism `fab-halo-shots.spec.ts` uses.
  await page.evaluate(() => {
    (window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean }).__mstudioPtyActivity(
      'pty-graph-waiting',
      'waiting',
    );
  });
}

/** The node's own box, padded so the bloom's -10px bleed is in frame. */
async function shotNode(page: Page, title: string, name: string): Promise<void> {
  const node = page.locator('[data-graph-node]', { hasText: title });
  const box = (await node.boundingBox())!;
  const pad = 20;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: shotPath(OUT, `${name}-${VARIANT}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`a running node's glow (${mode})`, async ({ page }) => {
    await openGraph(page, mode);
    await shotNode(page, 'Wire the write path', `running-${mode}`);
  });

  test(`a waiting node's steady amber ring (${mode})`, async ({ page }) => {
    await openGraph(page, mode);
    await shotNode(page, 'Waiting on a question', `waiting-${mode}`);
  });

  test(`an idle blocked node carries no glow at all (${mode})`, async ({ page }) => {
    await openGraph(page, mode);
    await shotNode(page, 'Nobody has touched this one', `idle-${mode}`);
  });
}
