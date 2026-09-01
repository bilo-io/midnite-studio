import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

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
    await page.getByRole('link', { name: 'Councils' }).click();
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

  await expect(page.getByRole('button', { name: /^Optimist/ })).toBeVisible();
  await page.getByRole('button', { name: 'Synthesis' }).click();
  await expect(page.getByText(/Synthesis of the panel's views on/)).toBeVisible();

  await page.getByRole('button', { name: /^Optimist/ }).click();
  await expect(page.getByText(/Optimist's answer to/)).toBeVisible();
});
