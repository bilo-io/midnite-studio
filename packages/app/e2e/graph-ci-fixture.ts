import { expect, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { REPRODUCIBLE_REMOTE } from './shots-helper';

/**
 * A short two-lane history whose commits carry every state the graph's CI
 * column draws — running, failed, passed, queued, cancelled, skipped, neutral,
 * and one with no CI at all — with branch refs on three of them so the lane
 * connector has to cross the column. Shared by `graph-ci-column.spec.ts` and
 * `adhoc-graph-ci-shots.spec.ts`.
 */
const AUTHORS = [
  { name: 'Ada Lovelace', email: 'ada@example.com' },
  { name: 'Grace Hopper', email: 'grace@example.com' },
];

export const ciSha = (i: number) => `${i}`.padStart(40, 'c');

const SUBJECTS = [
  'feat(graph): the CI column',
  'fix(forge): batch commit runs by sha',
  'feat(actions): lift the run detail into a panel',
  'chore(ci): queue behind the macOS cap',
  'refactor(graph): connector through the column',
  'docs: the column in Settings',
  'test(graph): neutral runs stay grey',
  'chore: initial commit',
];

const commit = (i: number, parents: string[]) => {
  const author = AUTHORS[i % AUTHORS.length]!;
  return {
    sha: ciSha(i),
    parents,
    authorName: author.name,
    authorEmail: author.email,
    authorDate: 1_787_000_000 - i * 3600,
    committerDate: 1_787_000_000 - i * 3600,
    subject: SUBJECTS[i]!,
    refs: [],
  };
};

const straight = (lanes: number) =>
  Array.from({ length: lanes }, (_, lane) => ({ fromLane: lane, toLane: lane, type: 'straight', colorIdx: lane }));

export const CI_GRAPH_ROWS = SUBJECTS.map((_, i) => {
  const lane = i === 1 || i === 2 ? 1 : 0;
  const last = i === SUBJECTS.length - 1;
  return {
    row: i,
    lane,
    colorIdx: lane,
    laneCount: i <= 3 ? 2 : 1,
    edges: last ? [] : [...straight(i <= 3 ? 2 : 1), { fromLane: lane, toLane: lane, type: 'branch', colorIdx: lane }],
    commit: commit(i, last ? [] : [ciSha(i + 1)]),
  };
});

const ref = (name: string, i: number, isHead = false) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: ciSha(i),
  upstream: null,
  isHead,
  worktreePath: null,
});

export const CI_REFS = [ref('main', 0, true), ref('feat/forge-batch', 1), ref('chore/queue', 3)];

const url = (id: string) => `https://github.com/bilo-io/midnite-studio/actions/runs/${id}`;
const run = (id: string, i: number, workflow: string, status: string, conclusion: string | null, minute = 0) => ({
  id,
  name: workflow,
  workflowName: workflow,
  workflowId: workflow === 'CI' ? '900' : '901',
  status,
  conclusion,
  headBranch: i === 1 ? 'feat/forge-batch' : 'main',
  headSha: ciSha(i),
  createdAt: `2026-08-26T1${i}:${String(minute).padStart(2, '0')}:00Z`,
  startedAt: status === 'queued' ? null : `2026-08-26T1${i}:${String(minute).padStart(2, '0')}:10Z`,
  updatedAt: status === 'completed' ? `2026-08-26T1${i}:${String(minute + 4).padStart(2, '0')}:12Z` : null,
  event: 'push',
  displayTitle: SUBJECTS[i],
  number: 100 + Number(id),
  attempt: 1,
  url: url(id),
});

export const CI_RUNS = [
  run('1', 0, 'CI', 'in_progress', null),
  run('2', 0, 'Release', 'completed', 'success'),
  run('3', 1, 'CI', 'completed', 'failure'),
  run('4', 1, 'Release', 'completed', 'success', 5),
  run('5', 2, 'CI', 'completed', 'success'),
  run('6', 3, 'CI', 'queued', null),
  run('7', 4, 'CI', 'completed', 'cancelled'),
  run('8', 5, 'CI', 'completed', 'skipped'),
  run('9', 6, 'CI', 'completed', 'neutral'),
];

const step = (n: number, name: string, status: string, conclusion: string | null) => ({
  number: n,
  name,
  status,
  conclusion,
  startedAt: '2026-08-26T10:00:10Z',
  completedAt: status === 'completed' ? '2026-08-26T10:01:40Z' : null,
});
const job = (runId: string, id: string, name: string, status: string, conclusion: string | null, steps: unknown[]) => ({
  id,
  name,
  status,
  conclusion,
  startedAt: '2026-08-26T10:00:10Z',
  completedAt: status === 'completed' ? '2026-08-26T10:03:50Z' : null,
  steps,
  url: `${url(runId)}/job/${id}`,
});

const line = (j: string, t: string) => `${j}\tRun vitest\t2026-08-26T11:00:39.7297973Z ${t}`;

export const ciFixtures: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  graphRows: CI_GRAPH_ROWS as MockFixtures['graphRows'],
  refs: CI_REFS as MockFixtures['refs'],
  forge: {
    cli: { reason: 'ready' },
    runs: CI_RUNS,
    workflows: [
      { id: '900', name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
      { id: '901', name: 'Release', path: '.github/workflows/release.yml', state: 'active' },
    ],
    runDetail: {
      '1': {
        jobs: [
          job('1', '10', 'typecheck', 'completed', 'success', [step(1, 'Set up job', 'completed', 'success'), step(2, 'Run tsc', 'completed', 'success')]),
          job('1', '11', 'test (macos-14)', 'in_progress', null, [
            step(1, 'Set up job', 'completed', 'success'),
            step(2, 'pnpm install', 'completed', 'success'),
            step(3, 'Run vitest', 'in_progress', null),
            step(4, 'Upload coverage', 'queued', null),
          ]),
          job('1', '12', 'e2e (shard 1/4)', 'queued', null, []),
        ],
      },
      '3': {
        jobs: [
          job('3', '20', 'typecheck', 'completed', 'success', [step(1, 'Run tsc', 'completed', 'success')]),
          job('3', '21', 'test (macos-14)', 'completed', 'failure', [
            step(1, 'Set up job', 'completed', 'success'),
            step(2, 'pnpm install', 'completed', 'success'),
            step(3, 'Run vitest', 'completed', 'failure'),
            step(4, 'Post job cleanup', 'completed', 'success'),
          ]),
          job('3', '22', 'deploy', 'completed', 'skipped', []),
        ],
      },
    },
    runLogs: {
      '3': {
        lines: [
          line('test (macos-14)', '##[group]Run pnpm vitest run'),
          line('test (macos-14)', ' ✓ src/features/graph/commit-ci.test.ts (15 tests)'),
          line('test (macos-14)', ' ✗ src/main/forge/commit-runs.test.ts > caches a settled answer'),
          line('test (macos-14)', '##[endgroup]'),
          line('test (macos-14)', 'AssertionError: expected 2 to be 1'),
        ],
        truncated: false,
        omittedLines: 0,
        totalBytes: 600,
      },
    },
  },
};

/** Open the graph on the CI fixture and wait for the column to fill. */
export async function openCiGraph(page: Page, data: MockFixtures = ciFixtures): Promise<void> {
  await page.route('**gravatar.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  await installMockBridge(page, data);
  await page.goto('/graph');
  const repoButton = page
    .locator('aside[aria-label="Repositories"]')
    .getByRole('button', { name: 'midnite-studio', exact: true });
  if (await repoButton.isVisible()) await repoButton.click();
  await expect(page.getByRole('columnheader', { name: 'CI' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'CI: failed — open run' })).toBeVisible();
}
