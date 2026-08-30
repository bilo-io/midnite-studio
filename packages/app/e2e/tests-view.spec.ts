import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Tests view and its sidebar section, assembled.
 *
 * Discovery, classification and the trust/run wiring are covered under bare
 * vitest (`git-engine/src/tests`, `desktop/src/main/testing`) — what only the
 * assembled app can show is that a discovered suite reaches the sidebar
 * grouped by kind, the Tests view's own package tree, and that trusting and
 * running one actually renders what the live stream sends back.
 */

const MAIN = '/tmp/midnite-git';

const unitSuite = {
  id: 'packages/app::test',
  package: 'packages/app',
  packageName: '@midnite/studio-app',
  name: 'test',
  kind: 'unit',
  source: 'package.json',
  sourceFile: 'packages/app/package.json',
  displayCommand: 'pnpm run test',
  run: { command: 'pnpm', args: ['run', 'test'], cwd: `${MAIN}/packages/app` },
};

const e2eSuite = {
  ...unitSuite,
  id: 'packages/app::e2e',
  name: 'e2e',
  kind: 'e2e',
  displayCommand: 'pnpm run e2e',
  run: { command: 'pnpm', args: ['run', 'e2e'], cwd: `${MAIN}/packages/app` },
};

const base: MockFixtures = {
  ...fixtures,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  tests: {
    packages: [
      { path: 'packages/app', name: '@midnite/studio-app', suites: [unitSuite, e2eSuite] },
    ],
  },
};

async function open(page: import('@playwright/test').Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

test('the sidebar Tests section groups discovered suites by kind', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: /^Tests\b/ }).click();
  await expect(page.getByText('unit · 1')).toBeVisible();
  await expect(page.getByText('e2e · 1')).toBeVisible();
});

const suites = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Suites' });
const detail = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Suite detail' });

test('the Tests view lists suites by package and shows the selected one\'s command', async ({
  page,
}) => {
  await open(page);

  await page.getByRole('link', { name: 'Tests' }).click();
  await expect(suites(page).getByText('@midnite/studio-app')).toBeVisible();
  await expect(suites(page).getByRole('button', { name: /^test/ })).toBeVisible();
  await expect(suites(page).getByRole('button', { name: /^e2e/ })).toBeVisible();

  await suites(page).getByRole('button', { name: /^test/ }).click();
  await expect(detail(page).getByText('pnpm run test')).toBeVisible();
  await expect(
    detail(page).getByText('Not trusted. Running it approves this exact command.'),
  ).toBeVisible();
});

test('trusting and running a suite renders the streamed result', async ({ page }) => {
  await open(page, {
    ...base,
    tests: {
      ...base.tests,
      runResult: {
        ok: true,
        structured: true,
        exitCode: 0,
        passed: 4,
        failed: 1,
        skipped: 0,
        failures: [{ name: 'renders', file: 'a.test.ts', message: 'boom' }],
        output: 'output',
        truncated: false,
        ranAt: 1,
        durationMs: 5,
      },
    },
  });

  await page.getByRole('link', { name: 'Tests' }).click();
  await suites(page).getByRole('button', { name: /^test/ }).click();
  await detail(page).getByRole('button', { name: 'Trust and run suite' }).click();

  await expect(detail(page).getByText('4 passed')).toBeVisible();
  await expect(detail(page).getByText('1 failed')).toBeVisible();
  await expect(detail(page).getByText('renders')).toBeVisible();
  await expect(detail(page).getByText('boom')).toBeVisible();
  // Trust persisted past the run — the button no longer offers to trust again.
  await expect(detail(page).getByRole('button', { name: 'Run suite' })).toBeVisible();
});
