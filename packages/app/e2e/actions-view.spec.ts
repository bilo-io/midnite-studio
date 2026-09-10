import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Actions view, assembled.
 *
 * Phase 82 Theme C wave 3 moved 13 of this file's original 15 tests to
 * `src/features/actions/actions-view.bridge.test.tsx`, mounting `ActionsView`
 * directly through the same `MockFixtures`/`buildMockBridge` fake under
 * vitest. **The 2 tests left here are not about `ActionsView` at all** —
 * they are about the sidebar's `ActionsSection` row (`forge-sections.tsx`)
 * selecting a repo and a run and then switching the active view, which is a
 * genuine cross-component flow (category C in the phase doc's taxonomy), not
 * a unit of this view alone.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const run = (over: Record<string, unknown>) => ({
  name: 'CI',
  status: 'completed',
  conclusion: 'success',
  headBranch: 'main',
  headSha: 'a'.repeat(40),
  createdAt: '2026-08-26T10:00:00Z',
  startedAt: '2026-08-26T10:00:00Z',
  updatedAt: '2026-08-26T10:04:00Z',
  event: 'push',
  workflowId: '900',
  workflowName: 'CI',
  ...over,
  url: `https://github.com/bilo-io/midnite-studio/actions/runs/${String(over['id'])}`,
});

const job = (over: Record<string, unknown>) => ({
  status: 'completed',
  conclusion: 'success',
  startedAt: '2026-08-26T10:00:10Z',
  completedAt: '2026-08-26T10:01:00Z',
  steps: [],
  ...over,
  url: `https://github.com/bilo-io/midnite-studio/actions/runs/1/job/${String(over['id'])}`,
});

/**
 * Two workflows, three runs, and one of them red.
 *
 * The asymmetry is the point: a fixture where everything passed could not show
 * that the view opens on the failure, and one with a single workflow could not
 * show that the list groups.
 */
const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    runs: [
      run({ id: '3', conclusion: 'success', createdAt: '2026-08-26T12:00:00Z', number: 130 }),
      run({ id: '2', conclusion: 'failure', createdAt: '2026-08-26T11:00:00Z', number: 129 }),
      run({
        id: '9',
        workflowId: '901',
        workflowName: 'Release',
        name: 'Release',
        event: 'workflow_dispatch',
        createdAt: '2026-08-25T10:00:00Z',
        number: 12,
      }),
    ],
    workflows: [
      { id: '900', name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
      { id: '901', name: 'Release', path: '.github/workflows/release.yml', state: 'active' },
    ],
    runDetail: {
      '2': {
        jobs: [
          job({ id: '10', name: 'typecheck', steps: [step(1, 'Run tsc', 'success')] }),
          job({
            id: '11',
            name: 'test (ubuntu-latest)',
            conclusion: 'failure',
            steps: [step(1, 'Set up job', 'success'), step(2, 'Run vitest', 'failure')],
          }),
        ],
      },
    },
  },
};

function step(number: number, name: string, conclusion: string) {
  return { number, name, status: 'completed', conclusion, startedAt: null, completedAt: null };
}

/*
  Every pane in this view renders buttons carrying run and job names, so a bare
  `getByRole('button', {name: 'CI'})` is ambiguous by construction. Locators are
  scoped to the landmark that owns them — which is also the reason those
  landmarks exist.
*/
const runList = (page: Page) => page.getByRole('list', { name: 'Workflow runs' });
const detail = (page: Page) => page.getByRole('region', { name: 'Run detail' });

test('a sidebar run row opens the view rather than a Changes tab', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  // The row itself, not the chevron beside it: the chevron peeks at the jobs
  // in place and is explicitly NOT the thing that navigates.
  await page.getByRole('button', { name: /^Passed Release/ }).click();

  // Phase 17 opened a workbench tab here. Two places rendering the same run
  // differently depending on how you arrived is one place too many.
  await expect(runList(page)).toBeVisible();
  await expect(detail(page).getByRole('heading', { level: 3 })).toContainText('Release');
  await expect(page.getByRole('tab', { name: /Release/ })).toHaveCount(0);
});

test('the run row opens the view on the run it names', async ({ page }) => {
  /*
    The row calls `selectRepo` before `selectActions`, because the view follows
    `selectedRepoId` rather than the row — every repo card is expanded by
    default, so this row is reachable while a DIFFERENT repo is selected, and a
    row that set only the run opened on the wrong repository's runs (or, if that
    repo had no GitHub remote, bounced to Graph).

    That two-repo case is NOT covered here: `mock-bridge.ts` serves a single
    hard-coded repository, so the divergence cannot be staged without widening
    the double for every existing spec. What this covers is the half that is
    reachable — the row lands on the view, showing the run it names.
  */
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: /^Passed Release/ }).click();

  await expect(runList(page)).toBeVisible();
  await expect(detail(page).getByRole('heading', { level: 3 })).toContainText('Release');
  await expect(runList(page).getByRole('button', { name: /#12 / })).toHaveAttribute(
    'aria-current',
    'true',
  );
});
