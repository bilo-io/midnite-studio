import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Video Studio (Phase 44), assembled.
 *
 * `video-studio-pane.test.tsx` (RTL) already exercises all six centre-pane
 * states in isolation. What only the assembled app can show is that the
 * three panes actually wire together — selecting a project in the list
 * drives both the centre pane and the detail pane, and creating one round-
 * trips through `video.project.create` into the list.
 */

const PROJECT = { id: 'showreel', title: 'COP31 showreel', valid: true, composition: 'Main' };

async function open(page: import('@playwright/test').Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await expect(async () => {
    await clickRailLink(page, 'Video');
    await expect(page.getByRole('heading', { name: 'Video' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('no projects yet shows the empty state', async ({ page }) => {
  await open(page);
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByText('Select a project')).toBeVisible();
});

test('selecting a project drives the centre and detail panes', async ({ page }) => {
  await open(page, { ...fixtures, video: { projects: [PROJECT] } });

  await page.getByRole('button', { name: 'COP31 showreel' }).click();
  await expect(page.getByText("The studio isn't running.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start studio' })).toBeVisible();
});

test('a studio in a failed state shows its stderr and a retry button', async ({ page }) => {
  // The fixture seeds `studioStatus` as the outcome `studio.start` itself
  // returns, not what an initial `status` fetch would find — the app's
  // global `staleTime: Infinity` means that fetch never runs on mount, so
  // the mutation's own response, written directly to the query cache, is
  // the only real path a project reaches a non-'stopped' state through.
  await open(page, {
    ...fixtures,
    video: {
      projects: [PROJECT],
      studioStatus: { [PROJECT.id]: { state: 'failed', stderr: ['Error: EADDRINUSE'] } },
    },
  });

  await page.getByRole('button', { name: 'COP31 showreel' }).click();
  await expect(page.getByRole('button', { name: 'Start studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Start studio' }).click();

  await expect(page.getByText('The studio failed to start')).toBeVisible();
  await expect(page.getByText('Error: EADDRINUSE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('a project missing node/npx shows the toolchain warning', async ({ page }) => {
  await open(page, {
    ...fixtures,
    video: {
      projects: [PROJECT],
      toolchain: { [PROJECT.id]: { node: { found: false, reason: 'node not on PATH.' }, npx: { found: true, path: '/usr/bin/npx' } } },
    },
  });

  await page.getByRole('button', { name: 'COP31 showreel' }).click();
  await expect(page.getByText('node/npx not found')).toBeVisible();
  await expect(page.getByText('node not on PATH.')).toBeVisible();
});

test('creating a project adds it to the list and selects it', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByPlaceholder('COP31 showreel').fill('My New Video');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('button', { name: 'My New Video' })).toBeVisible();
  await expect(page.getByText("The studio isn't running.")).toBeVisible();
});
