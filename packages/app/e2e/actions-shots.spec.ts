import { expect, test, type Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The committed screenshots for Phase 19 Theme E.
 *
 * A spec rather than a one-off script, following `dashboard-shots.spec.ts`, so
 * the images can be regenerated when the view changes instead of going quietly
 * stale — and so the fixture that produces them is reviewable.
 */

/* Playwright runs with `packages/app` as its cwd, so the repo-root docs tree is
   two levels up. Writing a relative path without this lands the shots inside
   the package, where nothing looks for them. */
const OUT = '../../docs/screenshots/phase-19-actions';
const ESC = String.fromCharCode(27);

const REMOTES = [{ name: 'origin', fetchUrl: 'git@github.com:bilo-io/midnite-git.git', pushUrl: 'git@github.com:bilo-io/midnite-git.git', forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' } }];
const run = (o: Record<string, unknown>) => ({ name: 'CI', status: 'completed', conclusion: 'success', headBranch: 'main', headSha: 'a'.repeat(40), createdAt: '2026-08-26T10:00:00Z', startedAt: '2026-08-26T10:00:00Z', updatedAt: '2026-08-26T10:04:12Z', event: 'push', workflowId: '900', workflowName: 'CI', ...o, url: `https://github.com/bilo-io/midnite-git/actions/runs/${String(o['id'])}` });
const step = (n: number, name: string, c: string) => ({ number: n, name, status: 'completed', conclusion: c, startedAt: '2026-08-26T10:00:10Z', completedAt: '2026-08-26T10:01:40Z' });
const job = (o: Record<string, unknown>) => ({ status: 'completed', conclusion: 'success', startedAt: '2026-08-26T10:00:10Z', completedAt: '2026-08-26T10:03:50Z', steps: [], ...o, url: `https://github.com/bilo-io/midnite-git/actions/runs/2/job/${String(o['id'])}` });
const line = (j: string, t: string) => `${j}\tRun tests\t2026-08-26T10:00:39.7297973Z ${t}`;

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-git': [] },
  forge: {
    cli: { reason: 'ready' },
    runs: [
      run({ id: '3', createdAt: '2026-08-26T12:00:00Z', number: 130, displayTitle: 'feat(phase-19): the Actions view' }),
      run({ id: '2', conclusion: 'failure', createdAt: '2026-08-26T11:00:00Z', number: 129, displayTitle: 'fix(forge): ten review findings' }),
      run({ id: '4', status: 'in_progress', conclusion: '', createdAt: '2026-08-26T12:30:00Z', updatedAt: null, number: 131, displayTitle: 'chore: bump deps' }),
      run({ id: '9', workflowId: '901', workflowName: 'Release', name: 'Release', event: 'workflow_dispatch', createdAt: '2026-08-25T10:00:00Z', number: 12, displayTitle: 'v0.4.0' }),
    ],
    workflows: [
      { id: '900', name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
      { id: '901', name: 'Release', path: '.github/workflows/release.yml', state: 'active' },
    ],
    runDetail: {
      '2': { jobs: [
        job({ id: '10', name: 'typecheck', steps: [step(1, 'Set up job', 'success'), step(2, 'Run tsc --noEmit', 'success')] }),
        job({ id: '11', name: 'test (ubuntu-latest, node-22)', conclusion: 'failure', steps: [step(1, 'Set up job', 'success'), step(2, 'actions/checkout@v4', 'success'), step(3, 'pnpm install', 'success'), step(4, 'Run vitest', 'failure'), step(5, 'Post job cleanup', 'success')] }),
        job({ id: '12', name: 'deploy', conclusion: 'skipped', startedAt: null, completedAt: null, steps: [] }),
      ] },
    },
    runLogs: {
      '2': {
        lines: [
          line('test (ubuntu-latest, node-22)', '##[group]Run actions/checkout@v4'),
          line('test (ubuntu-latest, node-22)', 'Syncing repository: bilo-io/midnite-git'),
          line('test (ubuntu-latest, node-22)', '##[endgroup]'),
          line('test (ubuntu-latest, node-22)', '##[group]Run pnpm vitest run'),
          line('test (ubuntu-latest, node-22)', `${ESC}[32m ✓ ${ESC}[0msrc/features/actions/ansi.test.ts (13 tests)`),
          line('test (ubuntu-latest, node-22)', `${ESC}[32m ✓ ${ESC}[0msrc/features/actions/run-groups.test.ts (18 tests)`),
          line('test (ubuntu-latest, node-22)', `${ESC}[31m ✗ ${ESC}[0msrc/features/actions/log-model.test.ts > visibleRows`),
          line('test (ubuntu-latest, node-22)', '##[endgroup]'),
          // Where main spliced the middle out. See actions-view.spec.ts for why
          // this is written out rather than imported.
          '··· 4,211 lines omitted — open the run on GitHub for the full log ···',
          line('test (ubuntu-latest, node-22)', `${ESC}[1;31mFAIL${ESC}[0m  src/features/actions/log-model.test.ts`),
          line('test (ubuntu-latest, node-22)', `${ESC}[31mAssertionError${ESC}[0m: expected [ 'top', '[A]' ] to deeply equal [ 'top' ]`),
          line('test (ubuntu-latest, node-22)', '    at log-model.test.ts:141:46'),
          line('test (ubuntu-latest, node-22)', `${ESC}[2m  Test Files ${ESC}[0m${ESC}[31m1 failed${ESC}[0m | ${ESC}[32m2 passed${ESC}[0m (3)`),
          line('typecheck', 'tsc --noEmit -p packages/app'),
        ],
        truncated: true,
        omittedLines: 4_211,
        totalBytes: 9_400_000,
        full: [line('test (ubuntu-latest, node-22)', 'the whole thing')],
      },
    },
  },
};

async function land(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('link', { name: 'Actions' }).click();
  await expect(page.getByRole('list', { name: 'Workflow runs' })).toBeVisible();
  await page.waitForTimeout(1200);
}

test('light', async ({ page }) => {
  await land(page);
  await page.screenshot({ path: `${OUT}/actions-view-light.png` });
});

test('dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await land(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/actions-view-dark.png` });
});

test('folded', async ({ page }) => {
  await land(page);
  await page.getByRole('region', { name: 'Job log' }).getByRole('button', { name: 'Collapse all groups' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/actions-log-folded.png` });
});
