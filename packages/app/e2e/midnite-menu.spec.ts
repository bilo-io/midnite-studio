import { expect, test, type Page } from '@playwright/test';

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

const REPO = 'midnite-git';

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
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
          __mgitPty: { creates: { sessionId: string; initialInput?: string }[] };
        }
      ).__mgitPty.creates.map((create) => create.initialInput),
  );

async function openMidniteMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).click();
  // Exact: "Loop: Backlog Task" also contains "Backlog Task" as a substring.
  await expect(page.getByRole('menuitem', { name: 'Backlog Task', exact: true })).toBeVisible();
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

test('the menu offers the fifteen agent verbs, each with its own glyph, with loops in a submenu', async ({
  page,
}) => {
  await open(page);
  await openMidniteMenu(page);

  const topItems = page.getByRole('menu').first().getByRole('menuitem');
  // The top level menu offers 9 standard actions plus the Loops submenu item
  await expect(topItems).toHaveText([
    'Backlog Task',
    'Adhoc Task',
    'Address Issue',
    'Brainstorm',
    'Refine Plan',
    'PR Review',
    'PR Feedback',
    'Release Prep',
    'Release Complete',
    'Loops',
  ]);

  // Hover over 'Loops' to open its submenu
  await page.getByRole('menuitem', { name: 'Loops' }).hover();
  const subMenu = page.getByRole('menu').nth(1);
  await expect(subMenu.getByRole('menuitem')).toHaveText([
    'Loop: PR Review',
    'Loop: PR Feedback',
    'Loop: Backlog Task',
    'Loop: Adhoc Task',
    'Loop: Address Issue',
    'Loop: Brainstorm',
  ]);

  // Iconed throughout - 9 flat-item icons, the Loops row's own icon *and* its
  // chevron (it is both an entry and a submenu opener), and 6 submenu icons.
  await expect(page.getByRole('menuitem').locator('svg')).toHaveCount(17);
  // Four categories, so three dividers on top level menu: execute | pr | release | loops.
  await expect(page.getByRole('menu').first().locator('hr')).toHaveCount(3);
});

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
