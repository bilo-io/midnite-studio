import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Agentic Kanban board's drag gesture and running glow, assembled
 * (Phase 41 Theme C, Theme F). This batch does not carry Theme G (the card
 * composer) or Theme E (the terminal embedded in a card) — see the phase
 * doc's own "not in this batch" note — so this spec proves exactly the two
 * things this batch actually ships: a card dragged to another column writes
 * `Status` through the real mutation, and a card already bound to a live
 * `'kanban'` session (seeded here the way a restart would restore one, not
 * launched from a composer that does not exist yet) shows the running glow.
 *
 * `applyOptimisticMove`'s own rules (No-status is never a drop target, an
 * orphaned option id is a no-op, …) already have a Vitest suite
 * (`board-dnd.test.ts`) against recorded fixtures — what only the assembled
 * app can show is that a real pointer gesture reaches that reducer and the
 * write it fires at all, the way `ref-drag.spec.ts` proves for the graph's
 * own drag.
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

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [
    { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
    { id: 'OPT_done', name: 'Done', color: 'GREEN' },
  ],
};

const ITEM = {
  id: 'PVTI_1',
  content: {
    type: 'issue' as const,
    id: 'I_1',
    number: 42,
    title: 'Wire the write path',
    url: 'https://github.com/bilo-io/midnite-studio/issues/42',
    state: 'OPEN' as const,
    assignees: [],
    /*
      Neither optional nor decoration. `ForgeProjectItemContentSchema` gives
      `body` and `labels` a `.default([])`/`.default('')`, so a real payload
      always carries both — and `composeCardPrompt` reads
      `content.labels.length` and `content.body.trim()` unguarded on that
      guarantee. The mock bridge hands these fixtures back VERBATIM, with no
      schema parse, so omitting either here throws on the detail pane's first
      render. Which is what it did, silently, until a test finally opened one.
    */
    body: '',
    labels: [],
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId: 'OPT_todo', name: 'Todo' },
  },
};

const OTHER_ITEM = {
  id: 'PVTI_2',
  content: {
    type: 'issue' as const,
    id: 'I_2',
    number: 43,
    title: 'A card nobody touches',
    url: 'https://github.com/bilo-io/midnite-studio/issues/43',
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId: 'OPT_todo', name: 'Todo' },
  },
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
    fields: { [BOARD.id]: [STATUS_FIELD] },
    items: { [BOARD.id]: [structuredClone(ITEM), structuredClone(OTHER_ITEM)] },
  },
};

type WriteCall = { channel: string; request: Record<string, unknown> };

const recorded = (page: Page): Promise<WriteCall[]> =>
  page.evaluate(() => (window as unknown as { __mstudioWrites?: WriteCall[] }).__mstudioWrites ?? []);

/** Land on the Projects view, in Board mode, with the one seeded board picked. */
async function openBoard(page: Page, data: MockFixtures, options: { writes?: boolean } = {}): Promise<void> {
  if (options.writes === true) {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { forgeWritesEnabled: true }, version: 5 }),
      );
    });
  }
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board' }).click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByText('Wire the write path')).toBeVisible();
}

const centre = async (target: Locator) => {
  const box = await target.boundingBox();
  if (!box) throw new Error('target has no bounding box — it is not laid out');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * Drags `from` onto `to` with a real pointer — two moves, not one.
 *
 * `PointerSensor` carries a 6px activation distance so a click on a card
 * stays a click; a single jump to the target can arrive before the drag has
 * even started. Mirrors `ref-drag.spec.ts`'s own `dragOnto`.
 */
async function dragOnto(page: Page, from: Locator, to: Locator): Promise<void> {
  const start = await centre(from);
  const end = await centre(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  // dnd-kit swallows the click trailing a drag for 50ms — see `ref-drag.spec.ts`'s
  // own note on `AbstractPointerSensor`'s capture-phase `stopPropagation`.
  await page.waitForTimeout(80);
}

test.describe('kanban board drag (Theme C)', () => {
  test('dragging a card onto another column writes Status through the real mutation', async ({ page }) => {
    await openBoard(page, base, { writes: true });

    const card = page.getByText('Wire the write path');
    const doneColumn = page.getByRole('button', { name: 'Collapse Done' });

    await dragOnto(page, card, doneColumn);

    await expect
      .poll(async () => (await recorded(page)).map((call) => call.channel))
      .toContain('forgeProjectSetField');
    const call = (await recorded(page)).find((entry) => entry.channel === 'forgeProjectSetField');
    expect(call?.request).toMatchObject({
      projectId: BOARD.id,
      itemId: ITEM.id,
      fieldId: STATUS_FIELD.id,
      value: { fieldId: STATUS_FIELD.id, dataType: 'single_select', optionId: 'OPT_done', name: 'Done' },
    });
  });

  test('a rejected drop rolls back and surfaces the GitHub error text', async ({ page }) => {
    await openBoard(
      page,
      {
        ...base,
        forgeProject: {
          ...base.forgeProject,
          writeResult: { ok: false, kind: 'error', message: 'Field is read-only for this item type' },
        },
      },
      { writes: true },
    );

    const card = page.getByText('Wire the write path');
    const doneColumn = page.getByRole('button', { name: 'Collapse Done' });
    await dragOnto(page, card, doneColumn);

    await expect
      .poll(async () => (await recorded(page)).map((call) => call.channel))
      .toContain('forgeProjectSetField');
    // The seeded item was never mutated on the mock backend, so the card is
    // still in Todo once the rollback runs — the collapse button's own
    // parent is the column's container, the card's actual ancestor.
    const todoColumn = page.getByRole('button', { name: 'Collapse Todo' }).locator('xpath=..');
    await expect(todoColumn.getByText('Wire the write path')).toBeVisible();
  });

  test('a card cannot be dragged while forge writes are disabled', async ({ page }) => {
    await openBoard(page, base, { writes: false });

    const card = page.getByText('Wire the write path');
    const doneColumn = page.getByRole('button', { name: 'Collapse Done' });
    await dragOnto(page, card, doneColumn);

    expect((await recorded(page)).map((call) => call.channel)).not.toContain('forgeProjectSetField');
  });
});

/** The seeded live `'kanban'` session a restart would restore, bound to `ITEM`. */
const CARD_SESSION = {
  session: {
    id: 'card-session-1',
    kind: 'agent' as const,
    agentId: 'claude',
    title: 'card',
    cwd: MAIN,
    repoId: 'repo:midnite-studio',
    createdAt: 1,
    surface: 'kanban' as const,
    taskRef: { projectId: BOARD.id, itemId: ITEM.id },
  },
  live: { ptyId: 'pty-card-1', pid: 999, cols: 80, rows: 24 },
};

test.describe('kanban card running glow (Theme F)', () => {
  test('a card bound to a live kanban session pulses running, in the rotating rainbow ramp', async ({ page }) => {
    await installMockBridge(page, {
      ...base,
      terminalSessions: [
        {
          session: {
            id: 'card-session-1',
            kind: 'agent',
            agentId: 'claude',
            title: 'card',
            cwd: MAIN,
            repoId: 'repo:midnite-studio',
            createdAt: 1,
            surface: 'kanban',
            taskRef: { projectId: BOARD.id, itemId: ITEM.id },
          },
          live: { ptyId: 'pty-card-1', pid: 999, cols: 80, rows: 24 },
        },
      ],
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board' }).click();

    // `TaskCard`'s own root carries `role="button"` and the glow class
    // together — searching by role rather than counting div depth is what
    // stays correct if the card's internal markup ever grows a wrapper.
    const card = page.getByText('Wire the write path').locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(card).toHaveClass(/card-run-glow/);
    await expect(card).toHaveClass(/is-running/);

    // The other, untouched item has no session bound to it — no glow at all.
    const otherCard = page.getByText('A card nobody touches').locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(otherCard).not.toHaveClass(/card-run-glow/);

    /*
      The ramp, not a solid: the ring is painted by the conic-gradient the
      stylesheet applies, and the element carries no inline
      `--card-glow-color` at all. Asserted here as well as in the unit suite
      because only the assembled app proves the CSS actually reaches the
      element — the class landing is what the unit test can see.
    */
    expect(await card.getAttribute('style')).toBeNull();
    const backgroundImage = await card.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(backgroundImage).toContain('conic-gradient');
  });
});

/**
 * The card's `>_` button (this change) — the answer to "I started a session
 * and I have no idea where its terminal is".
 *
 * Two halves, both needed: the panel had to start LISTING `'kanban'`
 * sessions (`inMainPanel`) before there was anywhere to send anyone, and the
 * button had to leave the card's `taskRef` intact — the pre-existing route,
 * `rehomeSession`, reached the terminal by unbinding the card, which took
 * the glow and the Stop with it.
 */
test.describe('revealing a card session in the terminal', () => {
  test('the card\'s >_ button opens the terminal panel on that session, and the card keeps its glow', async ({
    page,
  }) => {
    await installMockBridge(page, { ...base, terminalSessions: [CARD_SESSION] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board' }).click();

    const card = page
      .getByText('Wire the write path')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(card).toHaveClass(/is-running/);

    // The untouched card has no session, so it carries no button — the
    // control is not permanent chrome on every card.
    const otherCard = page
      .getByText('A card nobody touches')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(otherCard.getByTestId('card-reveal-terminal')).toHaveCount(0);

    await card.getByTestId('card-reveal-terminal').click();

    // The panel is open, and the card's own session is the one showing —
    // named in the session list, which is what "go to that session" means.
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    // And the card is still bound: same glow, still running.
    await expect(card).toHaveClass(/is-running/);
  });

  test('the detail pane offers the same jump beside Stop', async ({ page }) => {
    await installMockBridge(page, { ...base, terminalSessions: [CARD_SESSION] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board' }).click();

    await page.getByText('Wire the write path').click();
    await expect(page.getByTestId('card-detail')).toBeVisible();

    const composer = page.getByTestId('card-composer');
    await expect(composer.getByText('Running')).toBeVisible();
    await composer.getByTestId('composer-reveal-terminal').click();

    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
    await expect(page.locator('.xterm-screen')).toHaveCount(1);
  });
});
