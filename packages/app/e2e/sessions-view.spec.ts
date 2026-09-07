import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Sessions view's provider filter.
 *
 * `sessions-view.test.tsx` already covers the filtering logic and the
 * multiselect wiring under bare RTL. What only the assembled app can show is
 * the real menu chrome — the trigger's summary label, the option list built
 * from the mocked agent roster (`mock-bridge.ts`'s `agent.list`), and that
 * picking a provider actually narrows the rendered list end to end.
 */

const closedSession = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  kind: 'shell',
  title: 'midnite-studio',
  cwd: '/tmp/midnite-studio',
  repoId: 'repo-1',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_100_000,
  exitCode: null,
  reason: 'closed',
  transcriptBytes: 128,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  closedSessions: [
    closedSession({
      id: 'claude-1',
      kind: 'agent',
      agentId: 'claude',
      name: 'claude-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_300_000,
    }),
    closedSession({
      id: 'codex-1',
      kind: 'agent',
      agentId: 'codex',
      name: 'codex-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_200_000,
    }),
    closedSession({
      id: 'terminal-1',
      kind: 'shell',
      name: 'terminal-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_100_000,
    }),
  ],
};

const list = (page: Page) => page.getByRole('list', { name: 'Closed sessions' });

/** Land on the Sessions view. */
async function open(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Sessions');
  await expect(list(page)).toBeVisible();
}

test('the provider filter trigger reads "All providers" until something is picked', async ({ page }) => {
  await open(page);

  await expect(list(page).getByText('claude-run')).toBeVisible();
  await expect(list(page).getByText('codex-run')).toBeVisible();
  await expect(list(page).getByText('terminal-run')).toBeVisible();

  await expect(page.getByRole('button', { name: 'All providers' })).toBeVisible();
});

test('picking a provider narrows the list, and clearing it restores every row', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'All providers' }).click();
  await page.getByRole('option', { name: /Claude/ }).click();

  await expect(list(page).getByText('claude-run')).toBeVisible();
  await expect(list(page).getByText('codex-run')).toHaveCount(0);
  await expect(list(page).getByText('terminal-run')).toHaveCount(0);
  // A single selection shows the provider's own name, not a summary count.
  await expect(page.getByRole('button', { name: 'Claude', exact: true })).toBeVisible();

  // Add Terminal alongside Claude — the menu stays open across a selection
  // (it is a multiselect, not a one-shot picker), so the next option is
  // clicked directly rather than reopening the trigger.
  await page.getByRole('option', { name: 'Terminal' }).click();

  await expect(list(page).getByText('claude-run')).toBeVisible();
  await expect(list(page).getByText('terminal-run')).toBeVisible();
  await expect(list(page).getByText('codex-run')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2 providers' })).toBeVisible();

  // Back to "All providers" clears the facet entirely — still the same open
  // menu, so the special "All providers" row is clicked directly.
  await page.getByRole('option', { name: 'All providers' }).click();

  await expect(list(page).getByText('claude-run')).toBeVisible();
  await expect(list(page).getByText('codex-run')).toBeVisible();
  await expect(list(page).getByText('terminal-run')).toBeVisible();
});

test('a provider filter that excludes every session shows the empty state, not an error', async ({ page }) => {
  // Every session in `base` closed with reason "closed" — combining the
  // provider facet with an ending no row has proves the two facets AND
  // together, and that an empty intersection renders the same empty state
  // as no history at all rather than an error.
  await open(page);

  await page.getByRole('button', { name: 'All providers' }).click();
  await page.getByRole('option', { name: /Claude/ }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'All endings' }).click();
  await page.getByRole('option', { name: 'Exited' }).click();

  await expect(page.getByText('No closed sessions')).toBeVisible();
});
