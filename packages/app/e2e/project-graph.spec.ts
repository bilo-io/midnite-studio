import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { fixtures } from '../test-support/fixtures';

/**
 * The dependency graph (Phase 75 Theme D) — nodes and edges render, the
 * canvas is keyboard-navigable, and `Home` re-fits. Follows `kanban.spec.ts`'s
 * own `openBoard` sequence.
 *
 * **Does not assert a node opening the card detail panel.** That mount —
 * `CardPanelStack` alongside the graph — is explicitly Theme G's own
 * checklist item ("The graph mounts `CardPanelStack` on the same terms
 * `board-view.tsx:411–421` does"), not built here: `ProjectGraphView`'s
 * `selectedItemId`/`onSelectItem` are controlled props a caller can already
 * wire a panel to, but `ProjectsView` itself doesn't mount one yet. Once
 * Theme G lands, this spec is the place to add that assertion.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const EMPTY_DEPS = { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false };

const BLOCKER = {
  id: 'PVTI_1',
  content: {
    type: 'issue' as const,
    id: 'I_1',
    number: 40,
    title: 'Land the write path',
    url: 'https://github.com/bilo-io/midnite-studio/issues/40',
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
    dependencies: EMPTY_DEPS,
  },
  fieldValues: {},
};

const DEPENDENT = {
  id: 'PVTI_2',
  content: {
    type: 'issue' as const,
    id: 'I_2',
    number: 41,
    title: 'Build the settings page on top of it',
    url: 'https://github.com/bilo-io/midnite-studio/issues/41',
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
    dependencies: { ...EMPTY_DEPS, blockedBy: [{ number: 40, title: 'Land the write path', state: 'OPEN', repo: '' }] },
  },
  fieldValues: {},
};

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [] },
    items: { [BOARD.id]: [BLOCKER, DEPENDENT] },
  },
};

/**
 * The pty traffic that crossed the bridge — mirrors `kanban.spec.ts`'s own
 * `ptyCalls` helper (itself mirroring `terminal.spec.ts`'s). `initialInput`
 * is what a `useCardPlay` (Phase 92 Theme D) launch actually typed into the
 * fresh session.
 */
const ptyCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {
        __mstudioPty: { creates: { ptyId: string; sessionId: string; initialInput?: string }[] };
      }).__mstudioPty,
  );

async function openGraph(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByTestId('project-graph-view')).toBeVisible();
}

test.describe('the dependency graph (Theme D)', () => {
  test('renders one node per item and the real blocks edge between them', async ({ page }) => {
    await openGraph(page);

    await expect(page.locator('[data-graph-node]')).toHaveCount(2);
    await expect(page.getByText('Land the write path')).toBeVisible();
    await expect(page.getByText('Build the settings page on top of it')).toBeVisible();
    await expect(page.locator('[data-edge-kind="blocks"]')).toHaveCount(1);
  });

  test('clicking a node visually selects it', async ({ page }) => {
    await openGraph(page);

    const node = page.locator('[data-graph-node]', { hasText: 'Land the write path' });
    await node.click();
    await expect(node).toHaveAttribute('aria-pressed', 'true');
  });

  test('arrow keys walk an edge from the dependent to its blocker', async ({ page }) => {
    await openGraph(page);

    const dependent = page.locator('[data-graph-node]', { hasText: 'Build the settings page on top of it' });
    await dependent.click();
    await page.keyboard.press('ArrowLeft');

    const blocker = page.locator('[data-graph-node][data-node-key="#40"]');
    await expect(blocker).toBeFocused();
  });

  test('Home re-fits the canvas after a zoom', async ({ page }) => {
    await openGraph(page);

    const canvas = page.getByRole('application', { name: 'Dependency graph' });
    await canvas.hover();
    await page.mouse.wheel(0, 300); // pans, not zooms (no ctrl held) — just moves the viewport
    await canvas.press('Home');

    // No throw, and the nodes are still on screen — `Home` recovered the view.
    await expect(page.locator('[data-graph-node]').first()).toBeVisible();
  });
});

/**
 * Phase 92 Theme D's fork, on this graph-node surface — `ProjectGraphNode`
 * shares the identical `useCardPlay` hook `TaskCard` does (Theme A), and
 * Phase 75 Theme G mounted the same `CardPanelStack`/`DialogHost` tree
 * alongside the canvas, so the fork's own menu and launch reach this surface
 * with no second implementation. `kanban.spec.ts` proves the board half.
 */
test.describe('Play button — skill fork (Phase 92 Theme D/E)', () => {
  test('an unset node: Play opens the fallback menu, and one click on an entry both launches and closes it', async ({
    page,
  }) => {
    await openGraph(page);

    const node = page.locator('[data-graph-node]', { hasText: 'Land the write path' });
    await node.getByTestId('graph-node-play-agent').click();

    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem')).toHaveText(['Exec', 'Ideate', 'Refine']);

    await page.getByRole('menuitem', { name: 'Refine' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);

    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    const create = (await ptyCalls(page)).creates[0]!;
    expect(create.initialInput).toContain('/midnite-refine https://github.com/bilo-io/midnite-studio/issues/40');
    expect(create.initialInput).not.toContain('Land the write path');

    // The node was never selected by that click — `onPlay`'s own
    // `stopPropagation` keeps it from also opening the detail pane.
    await expect(node).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('a node with a skill already set in the detail pane: Play never shows a menu', async ({ page }) => {
    // `cardSkillByTask` (Phase 92 Theme C) keyed by `${projectId}:${itemId}`
    // — seeded here the way `CardDetail`'s own picker (or a previous trip
    // through the fallback menu) would have persisted it, mirroring
    // `kanban.spec.ts`'s own `cardSkillByTask` seed.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { cardSkillByTask: { 'PVT_1:PVTI_2': 'execAdhoc' } }, version: 20 }),
      );
    });
    await openGraph(page);

    const dependent = page.locator('[data-graph-node]', { hasText: 'Build the settings page on top of it' });
    await dependent.getByTestId('graph-node-play-agent').click();

    expect(await page.getByRole('menu').count()).toBe(0);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    const create = (await ptyCalls(page)).creates[0]!;
    expect(create.initialInput).toContain('/midnite-create-adhoc https://github.com/bilo-io/midnite-studio/issues/41');
  });
});
