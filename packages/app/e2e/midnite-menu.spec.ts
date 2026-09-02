import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The repository row's midnite menu.
 *
 * Three things are worth a browser here, and none of them is reachable from a
 * unit test: that the row's three menus stay in the order the design settled on
 * (midnite → git → ellipsis), that an entry actually reaches a pty, and that
 * what it sends is the *configured* skill rather than the compiled-in default.
 *
 * The last one is the whole reason the setting exists, and it spans the Agent
 * settings page, the persisted store and the terminal — three files that a
 * store test could only ever check one of.
 */

const REPO = 'midnite-studio';

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** Waits only on the repo row itself — for specs that never touch the Graph. */
async function openSidebar(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('button', { name: `Git actions for ${REPO}` })).toBeVisible();
}

/**
 * The initialInput of every pty the app has asked for.
 *
 * `initialInput` is the assertable half of "typed at the prompt but not run":
 * the queued text crosses the bridge on creation, while what the shell does
 * with it afterwards is canvas pixels no DOM query can read.
 */
const ptyInputs = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mstudioPty: { creates: { sessionId: string; initialInput?: string }[] };
        }
      ).__mstudioPty.creates.map((create) => create.initialInput),
  );

/**
 * Opens the menu and hovers a group open. Every verb now lives one level down,
 * so a spec that wants to click one has to say which group it is in.
 */
async function openMidniteMenu(page: Page, group = 'Tasks'): Promise<void> {
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).click();
  await expect(page.getByRole('menuitem', { name: group, exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: group, exact: true }).hover();
  await expect(page.getByRole('menu')).toHaveCount(2);
}

test('the row carries three menus, midnite first and the ellipsis last', async ({ page }) => {
  await open(page);

  /*
    Asserted as one ordered list rather than three presence checks: the three
    controls were already all present before this change and in the wrong order,
    so a test that only looked for them would have passed then too.

    Named exactly rather than matched on the repo name — the row's fold toggle
    and the title bar's four standing lifecycle buttons carry it too — and as a
    CSS selector list, which resolves in document order.
  */
  const labels = await page
    .locator(
      [
        `button[aria-label="Run a midnite skill on ${REPO}"]`,
        `button[aria-label="Git actions for ${REPO}"]`,
        `button[aria-label="Install, build, test or launch ${REPO}"]`,
      ].join(', '),
    )
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));

  expect(labels).toEqual([
    `Run a midnite skill on ${REPO}`,
    `Git actions for ${REPO}`,
    `Install, build, test or launch ${REPO}`,
  ]);
});

/**
 * The midnite and git marks rest dimmed and come to full strength on hover —
 * so a folded repo list reads as text first, controls second, rather than six
 * bright icons per row competing with the names beside them. The git mark
 * additionally carries Git's own logo colour, since it identifies *git*
 * specifically and has to stay recognisable as that regardless of the app's
 * accent.
 */
test('the midnite and git marks rest dimmed, at full strength on hover, and git wears its own colour', async ({
  page,
}) => {
  await openSidebar(page);

  const midnite = page.getByRole('button', { name: `Run a midnite skill on ${REPO}` });
  const git = page.getByRole('button', { name: `Git actions for ${REPO}` });

  await expect(midnite).toHaveClass(/opacity-50/);
  await expect(git).toHaveClass(/opacity-50/);

  const gitColor = await git.evaluate((el) => getComputedStyle(el).color);
  expect(gitColor).toBe('rgb(240, 80, 50)'); // #F05032, Git's brand orange
});

/**
 * The selected repo's accordion header carries a moving gradient rather than
 * the flat `bg-accent/60` tint it used to — a glance at a folded list should
 * find the one row that is "open" without reading every name first.
 */
test('the selected repo row carries the gradient shimmer', async ({ page }) => {
  await openSidebar(page);

  const row = page.locator(`button[aria-label="Git actions for ${REPO}"]`).locator('..');
  await row.getByRole('button', { name: REPO, exact: true }).click();
  await expect(row).toHaveClass(/repo-row-shimmer/);
});

/**
 * The rows of one menu surface, by accessible name.
 *
 * Read off `aria-label` rather than through `toHaveText`, because a row's text
 * is now its label *and* its description — and the label alone is what every
 * `getByRole('menuitem', { name })` in this file matches on.
 */
const rowNames = (menu: Locator): Promise<(string | null)[]> =>
  menu
    .getByRole('menuitem')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));

/**
 * The top level is five groups and nothing else, and each opens onto its own
 * verbs. Asserted as the exact ordered list rather than five presence checks:
 * the previous shape had all eleven verbs on this plane, so a test that only
 * looked for "Tasks" would have passed against a menu that still showed them.
 */
test('the top level is the five groups, each opening its own verbs', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).click();

  const topMenu = page.getByRole('menu').first();
  await expect.poll(() => rowNames(topMenu)).toEqual([
    'Tasks',
    'Reviews',
    'Releases',
    'Git',
    'Loops',
  ]);
  // Groups only: no verb escaped onto the top level, and no divider is left
  // over from the flat list the groups replaced.
  await expect(topMenu.locator('hr')).toHaveCount(0);

  const submenu = page.getByRole('menu').nth(1);

  await topMenu.getByRole('menuitem', { name: 'Tasks', exact: true }).hover();
  await expect.poll(() => rowNames(submenu)).toEqual([
    'Backlog Task',
    'Adhoc Task',
    'Address Issue',
    'Brainstorm',
    'Refine Plan',
  ]);

  await topMenu.getByRole('menuitem', { name: 'Reviews', exact: true }).hover();
  await expect.poll(() => rowNames(submenu)).toEqual(['PR Review', 'PR Feedback']);

  await topMenu.getByRole('menuitem', { name: 'Releases', exact: true }).hover();
  await expect.poll(() => rowNames(submenu)).toEqual(['Release Prep', 'Release Complete']);

  await topMenu.getByRole('menuitem', { name: 'Git', exact: true }).hover();
  await expect.poll(() => rowNames(submenu)).toEqual(['Git Report', 'Git Cleanup']);

  await topMenu.getByRole('menuitem', { name: 'Loops', exact: true }).hover();
  await expect.poll(() => rowNames(submenu)).toEqual([
    'Loop: Patrol',
    'Loop: PR Review',
    'Loop: PR Feedback',
    'Loop: Backlog Task',
    'Loop: Adhoc Task',
    'Loop: Address Issue',
    'Loop: Brainstorm',
  ]);

  /*
    Iconed throughout: every group row carries its own glyph *and* a chevron,
    and every submenu row one glyph.

    Counted per row rather than over `topMenu`, which contains the open submenu
    as a descendant — the submenu is positioned against its parent row, so it
    is nested in the DOM even though it reads as a separate surface.
  */
  for (const group of ['Tasks', 'Reviews', 'Releases', 'Git', 'Loops']) {
    const row = topMenu.getByRole('menuitem', { name: group, exact: true });
    await expect(row.locator('svg')).toHaveCount(2);
  }
  // Loops is the submenu left open above: one glyph per row, seven of them.
  await expect(submenu.getByRole('menuitem').locator('svg')).toHaveCount(7);
});

/**
 * Every row explains itself in one line of smaller, lighter sub-text — the
 * group's says what the group is for, the entry's is the same string the Agent
 * settings page prints under that entry's skill field.
 *
 * The description is the row's accessible *description*, never part of its
 * name: every `getByRole('menuitem', { name })` in this file depends on that,
 * and so does a screen reader that would otherwise announce a sentence where a
 * label belongs.
 */
test('every row carries a sub-text description, without it becoming the row name', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).click();

  const tasks = page.getByRole('menuitem', { name: 'Tasks', exact: true });
  await expect(tasks).toHaveAccessibleDescription('Plan and build work in this repository.');
  await tasks.hover();

  const backlog = page.getByRole('menuitem', { name: 'Backlog Task', exact: true });
  await expect(backlog).toHaveAccessibleDescription(
    'Pick up the next unblocked backlog task and build it.',
  );

  // Smaller and lighter than the label above it, which inherits the menu's own
  // 14px foreground.
  const description = backlog.locator('span', {
    hasText: 'Pick up the next unblocked backlog task and build it.',
  });
  const [size, color] = await description
    .last()
    .evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).color]);
  const labelColor = await backlog
    .locator('span', { hasText: /^Backlog Task$/ })
    .last()
    .evaluate((el) => getComputedStyle(el).color);
  expect(size).toBe('11px');
  expect(color).not.toBe(labelColor);
});

/**
 * The gradient edge is on both surfaces, not just the top-level one. A submenu
 * floats over the app with its own shadow and its own rounded box, so a plain
 * grey border beside a gradient one read as the second one being unfinished.
 */
test('both the menu and its submenus wear the gradient border', async ({ page }) => {
  await open(page);
  await openMidniteMenu(page);

  const menus = page.getByRole('menu');
  await expect(menus).toHaveCount(2);
  for (const menu of await menus.all()) {
    await expect(menu).toHaveClass(/gradient-border--always/);
    // The class is only half of it — the conic gradient is painted by the
    // border box, which a `border-border` colour would cover over.
    const image = await menu.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toContain('conic-gradient');
  }
});

/**
 * A described submenu is several times the width of a labelled one, so the
 * window edge it used to clear is now well within reach. It stays inside the
 * window either way — the same correction the menu itself already makes for
 * its own position.
 */
for (const width of [1280, 760]) {
  test(`a submenu stays inside a ${width}px window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await open(page);
    // Loops is both the longest submenu and the one with the longest rows.
    await openMidniteMenu(page, 'Loops');

    const parent = await page.getByRole('menu').first().boundingBox();
    const box = await page.getByRole('menu').nth(1).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);

    // Where there is room, it still opens off the parent's right edge rather
    // than being clamped somewhere arbitrary.
    if (width === 1280) expect(box!.x).toBeGreaterThanOrEqual(parent!.x + parent!.width);
  });
}

test('an entry opens a Claude session with its skill typed, not run', async ({ page }) => {
  await open(page);
  await openMidniteMenu(page);
  await page.getByRole('menuitem', { name: 'Backlog Task', exact: true }).click();

  await expect(page.locator('[data-terminal-panel]')).toBeVisible();
  await expect.poll(() => ptyInputs(page)).toEqual(["claude '/midnite-exec'"]);
  // No trailing newline anywhere in this path. Pressing Return is the
  // confirmation, so a mis-clicked menu cannot set an agent loose on a repo.
  const inputs = await ptyInputs(page);
  expect(inputs[0]).not.toContain('\r');
  expect(inputs[0]).not.toContain('\n');
});

test('pointing the entry at another skill in Settings changes what it sends', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();

  const field = page.getByRole('textbox', { name: 'Skill for Backlog Task' });
  await expect(field).toHaveValue('/midnite-exec');
  await field.fill('/midnite-address-issue');

  // The reset link is the "this has drifted from the default" signal, so it
  // must appear exactly when the value has.
  const reset = page.getByRole('button', { name: 'Reset' });
  await expect(reset).toHaveCount(1);

  await page.getByRole('link', { name: 'Graph' }).click();
  await openMidniteMenu(page);
  await page.getByRole('menuitem', { name: 'Backlog Task', exact: true }).click();

  await expect.poll(() => ptyInputs(page)).toEqual(["claude '/midnite-address-issue'"]);
});

test('switching the primary agent in Settings changes which binary and prefix the menu types', async ({
  page,
}) => {
  await open(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByRole('button', { name: 'Codex' }).click();

  await page.getByRole('link', { name: 'Graph' }).click();
  await openMidniteMenu(page);
  await page.getByRole('menuitem', { name: 'Backlog Task', exact: true }).click();

  // Codex doesn't recognise `/name` for a custom skill, only `$name` — so the
  // stored `/midnite-exec` prompt gets its prefix translated on the way out.
  // It also only runs a prompt non-interactively behind `exec`.
  await expect.poll(() => ptyInputs(page)).toEqual(["codex exec '$midnite-exec'"]);
});
