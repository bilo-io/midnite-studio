import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Agent councils (Phase 34), assembled.
 *
 * The settle-barrier orchestration is main-only and already covered by
 * `desktop/src/main/council-runner.test.ts` — what only the assembled app can
 * show is that creating a council seeds its starter members, that editing a
 * member persists through `council.updateMembers`, and that running a
 * consultation renders member tabs and a synthesis. The mock's `run.start`
 * answers with an already-`completed` run rather than choreographing a fake
 * multi-process race — see its own comment in `mock-bridge.ts`.
 */

async function open(page: import('@playwright/test').Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  /*
    Pre-existing flakiness, not introduced by this phase: the very first nav
    click right after boot can land during a nav-rail re-render (reproduces
    identically on the untouched "Workflows" link) and is silently dropped —
    no error, the view just never changes. A second click always lands
    cleanly once that re-render has settled, so retry rather than chase the
    race here.
  */
  await expect(async () => {
    await clickRailLink(page, 'Councils');
    await expect(page.getByRole('button', { name: 'New council' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('creating a council seeds it with starter members', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Architecture review');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Architecture review' })).toBeVisible();

  // Member names render as editable inputs, not plain text — read their
  // values rather than text content.
  const nameInputs = page.getByRole('textbox', { name: 'Member name' });
  await expect(nameInputs).toHaveCount(4);
  const names = await nameInputs.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(names).toEqual(['Optimist', 'Skeptic', 'Pragmatist', 'Visionary']);
});

test('running a consultation renders member answers and a synthesis', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Ship it?');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Ship it?' })).toBeVisible();

  await page.getByPlaceholder('What should the council answer?').fill('Should we ship the new onboarding flow?');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  /*
    Starting a run navigates the centre pane's panel-stack (Phase 42 Theme D)
    from the council entry to the new run entry, and both panes stay mounted
    for the length of the slide — the outgoing one marked `aria-hidden` but
    still matched by a plain `getByText`. Scoped to the one pane that isn't
    `aria-hidden` so an assertion mid-transition cannot resolve to two
    elements; a `getByRole` query would exclude it already (roles respect the
    accessibility tree), but the text/button queries below do not.
  */
  const activePane = page.locator('.panel-stack-pane:not([aria-hidden])');

  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  await activePane.getByRole('button', { name: 'Synthesis' }).click();
  await expect(activePane.getByText(/Synthesis of the panel's views on/)).toBeVisible();

  await activePane.getByRole('button', { name: /^Optimist/ }).click();
  await expect(activePane.getByText(/Optimist's answer to/)).toBeVisible();
});

test('the panel-stack navigates list → council → run, and back/forward retrace it (Theme D)', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New council' }).click();
  await page.getByRole('dialog', { name: 'New council' }).getByLabel('Name', { exact: true }).fill('Retro');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Retro' })).toBeVisible();

  const activePane = page.locator('.panel-stack-pane:not([aria-hidden])');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });

  // Creating a council landed on the council entry directly (list → council).
  await expect(nav.getByText('Retro', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back' })).toBeEnabled();
  await expect(page.getByRole('main').getByRole('button', { name: 'Forward' })).toBeDisabled();

  await page.getByPlaceholder('What should the council answer?').fill('Ship it?');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  // list → council → run: a third crumb, and the stack is now 3 deep.
  await expect(nav.getByText('Run', { exact: true })).toBeVisible();

  // Back once: run → council. Still a council selected (the config panel and
  // its member list stay put) — only the `list` entry shows the empty state.
  await page.getByRole('main').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('textbox', { name: 'Member name' }).first()).toBeVisible();
  // The breadcrumb trail still shows "Run" here — it renders the whole
  // stack, forward tail included, so a still-navigable entry stays clickable
  // rather than disappearing the moment it is no longer current.
  await expect(nav.getByText('Retro', { exact: true })).toBeVisible();

  // Back again: council → list. The config panel disappears along with it —
  // there is no council to configure.
  await page.getByRole('main').getByRole('button', { name: 'Back' }).click();
  await expect(activePane.getByText('Select a council')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New council' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back' })).toBeDisabled();

  // Forward twice retraces exactly back to the run.
  await page.getByRole('main').getByRole('button', { name: 'Forward' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Forward' }).click();
  await expect(activePane.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Forward' })).toBeDisabled();
});
