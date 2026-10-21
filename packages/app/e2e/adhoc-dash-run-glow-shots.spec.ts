import { test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_REMOTE,
  setTheme,
  shotPath,
  stubGravatars,
} from './shots-helper';

/**
 * Status glow on the Dashboard's Latest workflow runs rows (ad hoc) — PR-body
 * screenshots only, one row per run state. Run once with
 * `MSTUDIO_SHOT_VARIANT=before` against main, once on the branch.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-dash-run-glow';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';
const MAIN = '/tmp/midnite-studio';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const run = (id: number, name: string, status: string, conclusion: string | null, headBranch: string) => ({
  id: String(id),
  name,
  status,
  conclusion,
  headBranch,
  headSha: 'a'.repeat(40),
  createdAt: `2026-08-26T0${id % 10}:00:00Z`,
  url: `https://github.com/bilo-io/midnite-studio/actions/runs/${id}`,
});

const shots: MockFixtures = {
  ...fixtures,
  refs: [
    {
      name: 'main',
      fullName: 'refs/heads/main',
      kind: 'localBranch',
      sha: 'a'.repeat(40),
      upstream: null,
      isHead: true,
      worktreePath: MAIN,
    },
  ],
  remotes: [REPRODUCIBLE_REMOTE],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [],
    issues: [],
    runs: [
      run(1, 'CI', 'in_progress', null, 'feature/run-glow'),
      run(2, 'CI', 'queued', null, 'feature/queued'),
      run(3, 'CI', 'completed', 'success', 'main'),
      run(4, 'CI', 'completed', 'failure', 'fix/flaky'),
      run(5, 'CI', 'completed', 'cancelled', 'chore/old'),
      run(6, 'Release', 'waiting', null, 'main'),
      run(7, 'Release', 'completed', 'skipped', 'main'),
    ],
  },
};

async function shoot(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await stubGravatars(page);
  await installMockBridge(page, shots);
  await page.goto('/');
  await setTheme(page, theme);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const region = page.getByRole('region', { name: 'Latest workflow runs' });
  await region.getByRole('button', { name: 'Open run' }).first().waitFor();
  await page.waitForTimeout(700);
  await region.screenshot({ path: shotPath(OUT, `${VARIANT}-${theme}.png`) });
}

test.describe('dashboard run glow screenshots', () => {
  test.use({ viewport: { width: 1600, height: 1100 } });
  test('light', async ({ page }) => shoot(page, 'light'));
  test('dark', async ({ page }) => shoot(page, 'dark'));
});
