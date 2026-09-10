import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Tests view and its sidebar section, assembled.
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tests to
 * `src/features/tests/tests-view.bridge.test.tsx`, mounting `ReposPanel`
 * (the sidebar grouping) and `TestsView` (the package tree, the selected
 * suite's command, and trusting/running a suite rendering the streamed
 * result) directly. The one test kept here is a smoke test that the sidebar
 * Tests section is reachable and groups suites through the real,
 * assembled app.
 */

const MAIN = '/tmp/midnite-studio';

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

// The sidebar nests Tests under Forge alongside Actions/Reviews/Issues
// (Phase 28 Theme F), and `RepoTree` gates the whole Forge parent — Tests
// included — behind a GitHub remote (`hasGithubForge`), same as its three
// siblings. Test discovery itself has nothing to do with GitHub, but the
// sidebar section it renders in does, so the fixture needs one to show it.
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  tests: {
    packages: [
      { path: 'packages/app', name: '@midnite/studio-app', suites: [unitSuite, e2eSuite] },
    ],
  },
};

test('the sidebar Tests section groups discovered suites by kind', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: /^Tests\b/ }).click();
  await expect(page.getByText('unit · 1')).toBeVisible();
  await expect(page.getByText('e2e · 1')).toBeVisible();
});
