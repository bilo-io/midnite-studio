import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

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

/**
 * The pty traffic that crossed the bridge — mirrors `terminal.spec.ts`'s own
 * `ptyCalls` helper. `initialInput` is what a `useCardPlay` (Phase 92 Theme
 * D) launch actually typed into the fresh session; xterm's canvas cannot be
 * queried for it, so this is the only place a spec can read it.
 */
const ptyCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {
        __mstudioPty: { creates: { ptyId: string; sessionId: string; initialInput?: string }[] };
      }).__mstudioPty,
  );

/** Land on the Projects view, in Board mode, with the one seeded board picked. */
async function openBoard(page: Page, data: MockFixtures, options: { writes?: boolean } = {}): Promise<void> {
  if (options.writes === true) {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { forgeWritesEnabled: true }, version: 6 }),
      );
    });
  }
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();
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

  /** Phase 50 Theme C — "No status" is now a real drop target. */
  test('dragging a card onto "No status" clears the field through the real mutation, not setField', async ({
    page,
  }) => {
    await openBoard(page, base, { writes: true });

    const card = page.getByText('Wire the write path');
    const noStatusColumn = page.getByRole('button', { name: 'Collapse No status' });
    await dragOnto(page, card, noStatusColumn);

    await expect
      .poll(async () => (await recorded(page)).map((call) => call.channel))
      .toContain('forgeProjectClearField');
    const call = (await recorded(page)).find((entry) => entry.channel === 'forgeProjectClearField');
    expect(call?.request).toMatchObject({
      projectId: BOARD.id,
      itemId: ITEM.id,
      fieldId: STATUS_FIELD.id,
    });
    expect((await recorded(page)).map((c) => c.channel)).not.toContain('forgeProjectSetField');

    const noStatusPanel = noStatusColumn.locator('xpath=..');
    await expect(noStatusPanel.getByText('Wire the write path')).toBeVisible();
  });
});

/**
 * Drag-to-skill (Phase 95 Theme G) — a real pointer drag is the only way to
 * exercise this: `pointer drag` is on `docs/TESTING.md`'s own list of things
 * that need a genuine browser, so `decideColumnSkillAction`'s own decision
 * logic (unmapped/mapped/existing-session/draft) is the Vitest suite
 * (`board-derive.test.ts`) and this is what only the assembled app can show
 * — a drop landing on the real `DndContext`, the real Undo toast, and the
 * real 5s timer either cancelling or reaching `startAgent`.
 */
const STATUS_FIELD_WITH_PROGRESS = {
  ...STATUS_FIELD,
  options: [
    { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
    { id: 'OPT_progress', name: 'In progress', color: 'YELLOW' },
    { id: 'OPT_done', name: 'Done', color: 'GREEN' },
  ],
};

const dragToSkillBase: MockFixtures = {
  ...base,
  forgeProject: {
    ...base.forgeProject,
    fields: { [BOARD.id]: [STATUS_FIELD_WITH_PROGRESS] },
    items: { [BOARD.id]: [structuredClone(ITEM), structuredClone(OTHER_ITEM)] },
  },
};

test.describe('drag-to-skill (Phase 95 Theme G)', () => {
  test('a drop onto a mapped column shows an Undo toast; Undo sends nothing and reverts the move', async ({
    page,
  }) => {
    await openBoard(page, dragToSkillBase, { writes: true });

    const card = page.getByText('Wire the write path');
    const progressColumn = page.getByRole('button', { name: 'Collapse In progress' });
    await dragOnto(page, card, progressColumn);

    // The card moved — today's plain status write, unconditional.
    await expect
      .poll(async () => (await recorded(page)).map((call) => call.channel))
      .toContain('forgeProjectSetField');

    // The Undo toast names the mapped skill and the card, in full.
    await expect(page.getByText('/midnite-create on #42 in 5s')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();

    // Long enough to prove the 5s timer really was cancelled, not merely
    // not-yet-fired.
    await page.waitForTimeout(5500);
    expect((await ptyCalls(page)).creates).toHaveLength(0);

    // And the move itself reverted — a second real write back to Todo, not
    // a client-only rollback.
    const setFieldCalls = (await recorded(page)).filter((call) => call.channel === 'forgeProjectSetField');
    expect(setFieldCalls.at(-1)?.request).toMatchObject({
      value: { fieldId: STATUS_FIELD.id, dataType: 'single_select', optionId: 'OPT_todo', name: 'Todo' },
    });
  });

  test('leaving the toast alone starts the mapped skill after 5s, sent — not just typed', async ({ page }) => {
    await openBoard(page, dragToSkillBase, { writes: true });

    const card = page.getByText('Wire the write path');
    const progressColumn = page.getByRole('button', { name: 'Collapse In progress' });
    await dragOnto(page, card, progressColumn);

    await expect(page.getByText('/midnite-create on #42 in 5s')).toBeVisible();

    await expect.poll(async () => (await ptyCalls(page)).creates.length, { timeout: 8000 }).toBe(1);
    const create = (await ptyCalls(page)).creates[0]!;
    expect(create.initialInput).toContain('/midnite-create https://github.com/bilo-io/midnite-studio/issues/42');
    // `autoSend: true` — the trailing `\r` is what tells a typed prompt from
    // a sent one; Play's own default composes the identical words with none.
    expect(create.initialInput?.endsWith('\r')).toBe(true);
  });

  test('a card with an existing live session reveals it — no toast, no second launch', async ({ page }) => {
    await openBoard(
      page,
      { ...dragToSkillBase, terminalSessions: [CARD_SESSION] },
      { writes: true },
    );

    const card = page.getByText('Wire the write path');
    const progressColumn = page.getByRole('button', { name: 'Collapse In progress' });
    await dragOnto(page, card, progressColumn);

    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
    await expect(page.getByText('in 5s')).toHaveCount(0);
    // Still just the one, pre-seeded session — never a second launch.
    expect((await ptyCalls(page)).creates).toHaveLength(0);
  });

  test('an unmapped column keeps today\'s plain status-only drop — no toast at all', async ({ page }) => {
    await openBoard(page, dragToSkillBase, { writes: true });

    const card = page.getByText('Wire the write path');
    const doneColumn = page.getByRole('button', { name: 'Collapse Done' });
    await dragOnto(page, card, doneColumn);

    await expect
      .poll(async () => (await recorded(page)).map((call) => call.channel))
      .toContain('forgeProjectSetField');
    await expect(page.getByText(/in 5s/)).toHaveCount(0);
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
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();

    // `TaskCard`'s own root carries `role="button"` and the glow class
    // together — searching by role rather than counting div depth is what
    // stays correct if the card's internal markup ever grows a wrapper.
    const card = page.getByText('Wire the write path').locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(card).toHaveClass(/agent-run-glow/);
    await expect(card).toHaveClass(/is-running/);

    // The other, untouched item has no session bound to it — no glow at all.
    const otherCard = page.getByText('A card nobody touches').locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(otherCard).not.toHaveClass(/agent-run-glow/);

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
 * The card's `>_` toggle and Stop (Phase 95 Theme G split the old single
 * Play-or-reveal button into three: Start, Stop, `>_`) — the answer to "I
 * started a session and I have no idea where its terminal is" now lives
 * inline on the card itself by default (the embedded `CardTerminal` Theme E
 * already built, `>_` merely shows/hides it), with its own "pop out to
 * Terminal view" button still reaching the main dock panel for whoever wants
 * that instead.
 *
 * Two halves, both needed: the panel had to start LISTING `'kanban'`
 * sessions (`inMainPanel`) before there was anywhere to send anyone, and the
 * button had to leave the card's `taskRef` intact — the pre-existing route,
 * `rehomeSession`, reached the terminal by unbinding the card, which took
 * the glow and the Stop with it.
 */
test.describe('revealing a card session in the terminal', () => {
  test('a running card shows Stop and `>_` (never Start), and the embedded terminal pops out to the main panel', async ({
    page,
  }) => {
    await installMockBridge(page, { ...base, terminalSessions: [CARD_SESSION] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();

    const card = page
      .getByText('Wire the write path')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(card).toHaveClass(/is-running/);
    await expect(card.getByTestId('card-play-agent')).toHaveCount(0);
    await expect(card.getByTestId('card-stop-agent')).toBeVisible();
    await expect(card.getByTestId('card-terminal-toggle')).toHaveAttribute('aria-pressed', 'true');

    // The untouched card has no active session, so its button is "Start agent"
    const otherCard = page
      .getByText('A card nobody touches')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(otherCard.getByTestId('card-play-agent')).toHaveAttribute('title', 'Start agent');

    // The embedded terminal is open by default (Theme G's `>_` starts
    // `true`, matching what this card looked like before this theme) — its
    // own pop-out button is what reaches the main dock panel.
    await card.getByLabel('Pop out to Terminal view').click();

    // The panel is open, and the card's own session is the one showing —
    // named in the session list, which is what "go to that session" means.
    // Scoped to the panel itself (not `.xterm-screen` page-wide): Theme E's
    // own in-card terminal is legitimately still mounted on the board behind
    // it, the same session rendered a second time.
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
    await expect(page.locator('[data-terminal-panel] .xterm-screen')).toHaveCount(1);

    // And the card is still bound: same glow, still running.
    await expect(card).toHaveClass(/is-running/);
  });

  test('the `>_` toggle hides and re-shows the card\'s embedded terminal (Theme G)', async ({ page }) => {
    await installMockBridge(page, { ...base, terminalSessions: [CARD_SESSION] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();

    const card = page
      .getByText('Wire the write path')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await expect(card.locator('.xterm-screen')).toBeVisible();

    await card.getByTestId('card-terminal-toggle').click();
    await expect(card.getByTestId('card-terminal-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(card.locator('.xterm-screen')).toHaveCount(0);

    await card.getByTestId('card-terminal-toggle').click();
    await expect(card.locator('.xterm-screen')).toBeVisible();
  });

  test('the detail pane offers the same jump beside Stop', async ({ page }) => {
    await installMockBridge(page, { ...base, terminalSessions: [CARD_SESSION] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await clickRailLink(page, 'Projects');
    await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
    await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Board view' }).click();

    await page.getByText('Wire the write path').click();
    await expect(page.getByTestId('card-detail')).toBeVisible();

    const composer = page.getByTestId('card-composer');
    await expect(composer.getByText('Running')).toBeVisible();
    await composer.getByTestId('composer-reveal-terminal').click();

    // Scoped to the panel itself — see the sibling test's note above.
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
    await expect(page.locator('[data-terminal-panel] .xterm-screen')).toHaveCount(1);
  });
});

/**
 * The card-detail pane's `panel-stack` instance (Phase 50 Theme D) — opening
 * a second card pushes a history entry rather than just swapping content, so
 * Back returns to the first card without leaving the board.
 */
test.describe('card-detail panel history (Theme D)', () => {
  test('opening a second card, then Back, returns to the first', async ({ page }) => {
    await openBoard(page, base);

    // `.last()` throughout: `panel-stack` briefly mounts both the outgoing
    // and incoming pane during its slide transition, and both carry this
    // same `data-testid` — the incoming (current) one is always the later
    // sibling (`panel-stack.tsx`'s own render order).
    await page.getByText('Wire the write path').click();
    await expect(page.getByTestId('card-detail').last()).toBeVisible();
    await expect(page.getByTestId('card-detail').last()).toContainText('Wire the write path');

    await page.getByText('A card nobody touches').click();
    await expect(page.getByTestId('card-detail').last()).toContainText('A card nobody touches');

    await page.getByTestId('board-view').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByTestId('card-detail').last()).toContainText('Wire the write path');
  });
});

/**
 * Phase 92 Theme D's fork, proved against the real assembled app rather than
 * the isolated `use-card-play.test.tsx` hook — `board-view.tsx` mounts the
 * one `DialogHost` this menu actually opens through, and only the assembled
 * app can show a click landing on it and the session that follows.
 */
test.describe('Play button — skill fork (Phase 92 Theme D/E)', () => {
  test('an unset card: Play opens the fallback menu, and one click on an entry both launches and closes it', async ({
    page,
  }) => {
    await openBoard(page, base);

    const card = page
      .getByText('Wire the write path')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await card.getByTestId('card-play-agent').click();

    // Exactly three entries — never the full six-entry `tasks` category.
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem')).toHaveText(['Exec', 'Ideate', 'Refine']);

    // One click: no second confirm, no second click needed.
    await page.getByRole('menuitem', { name: 'Exec' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);

    // It launched — a fresh pty came up with the shrunk skill+link prompt,
    // never the title/assignees/labels/body `composeCardPrompt` would send.
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    const create = (await ptyCalls(page)).creates[0]!;
    expect(create.initialInput).toContain('/midnite-create-adhoc https://github.com/bilo-io/midnite-studio/issues/42');
    expect(create.initialInput).not.toContain('Wire the write path');

    // And the terminal panel opened on it — `revealSession`'s own job.
    await expect(page.locator('[data-terminal-panel]')).toBeVisible();
  });

  test('a card with a skill already set in the detail pane: Play never shows a menu', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { cardSkillByTask: { 'PVT_1:PVTI_2': 'brainstorm' } }, version: 20 }),
      );
    });
    await openBoard(page, base);

    const otherCard = page
      .getByText('A card nobody touches')
      .locator('xpath=ancestor::*[contains(@class, "hover:border-foreground")]');
    await otherCard.getByTestId('card-play-agent').click();

    expect(await page.getByRole('menu').count()).toBe(0);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    const create = (await ptyCalls(page)).creates[0]!;
    expect(create.initialInput).toContain('/midnite-ideate https://github.com/bilo-io/midnite-studio/issues/43');
  });
});
