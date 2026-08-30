import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The committed screenshots for Phase 20 Theme C.
 *
 * A spec rather than a one-off script, following `actions-shots.spec.ts`, so
 * the images can be regenerated when the view changes instead of going quietly
 * stale — and so the fixture that produces them is reviewable.
 */

/* Playwright runs with `packages/app` as its cwd, so the repo-root docs tree is
   two levels up. */
const OUT = '../../docs/screenshots/phase-20-pr-detail';

const HEAD_SHA = 'c0ffee'.padEnd(40, '0');

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

const pull = {
  number: 128,
  title: 'PR detail: files, conversation and checks',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'failing',
  headBranch: 'feature/phase-20-pr-detail',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-git/pull/128',
};

const line = (
  kind: 'add' | 'del' | 'ctx',
  text: string,
  oldNo: number | null,
  newNo: number | null,
): Record<string, unknown> => ({ kind, oldNo, newNo, text, ranges: [], noNewline: false });

const file = (
  path: string,
  change: string,
  hunk: { heading: string; oldStart: number; newStart: number; lines: Record<string, unknown>[] },
): Record<string, unknown> => ({
  path,
  oldPath: null,
  change,
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: hunk.oldStart,
      oldLines: hunk.lines.length,
      newStart: hunk.newStart,
      newLines: hunk.lines.length,
      heading: hunk.heading,
      lines: hunk.lines,
    },
  ],
  insertions: hunk.lines.filter((l) => l['kind'] === 'add').length,
  deletions: hunk.lines.filter((l) => l['kind'] === 'del').length,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const run = {
  id: '4211',
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: 'feature/phase-20-pr-detail',
  headSha: HEAD_SHA,
  createdAt: '2026-08-27T09:40:00Z',
  startedAt: '2026-08-27T09:40:05Z',
  updatedAt: '2026-08-27T09:44:18Z',
  url: 'https://github.com/bilo-io/midnite-git/actions/runs/4211',
  event: 'pull_request',
  workflowId: '900',
  workflowName: 'CI',
  number: 412,
  displayTitle: 'PR detail: files, conversation and checks',
};

const step = (n: number, name: string, conclusion: string): Record<string, unknown> => ({
  number: n,
  name,
  status: 'completed',
  conclusion,
  startedAt: '2026-08-27T09:40:10Z',
  completedAt: '2026-08-27T09:41:40Z',
});

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-git': [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    runs: [run],
    pullDetail: {
      '128': {
        body: 'Phase 17 shipped the Reviews tab as a summary and a link out. This is the parked half: the diff, the discussion and the CI verdict, one click apart.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 486,
        deletions: 41,
        changedFiles: 12,
        mergeable: 'MERGEABLE',
      },
    },
    pullFiles: {
      '128': {
        files: [
          file('packages/shared/src/domain/forge.ts', 'modified', {
            heading: 'export const ForgePullSchema',
            oldStart: 396,
            newStart: 396,
            lines: [
              line('ctx', 'export type ForgeWorkflowsResult = z.infer<typeof ForgeWorkflowsResultSchema>;', 396, 396),
              line('ctx', '', 397, 397),
              line('add', "/** One entry in a pull request's top-level conversation. */", null, 398),
              line('add', 'export const ForgeCommentSchema = z.object({', null, 399),
              line('add', '  id: z.string(),', null, 400),
              line('add', '  kind: ForgeCommentKindSchema,', null, 401),
              line('add', "  author: z.string().default(''),", null, 402),
              line('add', "  body: z.string().default(''),", null, 403),
              line('add', '  createdAt: z.string(),', null, 404),
              line('add', '});', null, 405),
            ],
          }),
          file('packages/app/src/features/forge/forge-detail.tsx', 'modified', {
            heading: 'export function ReviewView',
            oldStart: 86,
            newStart: 86,
            lines: [
              line('ctx', 'export function ReviewView({ repoId, number }: { repoId: string; number: number }) {', 86, 86),
              line('del', '  const { data, isLoading } = useForgePulls(repoId, true);', 87, null),
              line('del', '  const pull = data?.pulls.find((candidate) => candidate.number === number);', 88, null),
              line('add', '  return <PrDetail repoId={repoId} number={number} />;', null, 87),
              line('ctx', '}', 89, 88),
            ],
          }),
          file('packages/app/src/features/reviews/pr-detail.tsx', 'added', {
            heading: '',
            oldStart: 0,
            newStart: 1,
            lines: [
              line('add', "export type PrTab = 'files' | 'conversation' | 'checks';", null, 1),
              line('add', '', null, 2),
              line('add', 'export function PrDetail({ repoId, number }: Props) {', null, 3),
              line('add', "  const [tab, setTab] = useState<PrTab>('files');", null, 4),
              line('add', '}', null, 5),
            ],
          }),
        ],
      },
    },
    pullComments: {
      '128': [
        {
          id: '1',
          kind: 'comment',
          author: 'reviewer',
          body: 'Does the Checks tab cost a third `gh` call, or does it reuse the run listing?',
          createdAt: '2026-08-27T09:12:00Z',
          url: '',
          reviewState: null,
        },
        {
          id: '2',
          kind: 'comment',
          author: 'bilo',
          body: 'It reuses it — the runs are matched by `headSha` against the listing the sidebar already cached.',
          createdAt: '2026-08-27T09:20:00Z',
          url: '',
          reviewState: null,
        },
        {
          id: '3',
          kind: 'review',
          author: 'maintainer',
          body: 'Good. One thing left: say what the byte cap dropped rather than showing a short diff.',
          createdAt: '2026-08-27T09:31:00Z',
          url: '',
          reviewState: 'CHANGES_REQUESTED',
        },
      ],
    },
    runDetail: {
      '4211': {
        jobs: [
          {
            id: '10',
            name: 'typecheck',
            status: 'completed',
            conclusion: 'success',
            startedAt: '2026-08-27T09:40:10Z',
            completedAt: '2026-08-27T09:41:40Z',
            url: 'https://github.com/bilo-io/midnite-git/actions/runs/4211/job/10',
            steps: [step(1, 'Set up job', 'success'), step(2, 'moon run :typecheck', 'success')],
          },
          {
            id: '11',
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            startedAt: '2026-08-27T09:40:10Z',
            completedAt: '2026-08-27T09:44:12Z',
            url: 'https://github.com/bilo-io/midnite-git/actions/runs/4211/job/11',
            steps: [
              step(1, 'Set up job', 'success'),
              step(2, 'pnpm install', 'success'),
              step(3, 'moon run :test', 'failure'),
            ],
          },
        ],
      },
    },
    runLogs: {
      '4211': {
        lines: [
          'test\tmoon run :test\t2026-08-27T09:44:01Z FAIL src/ipc/ipc.test.ts > forge schemas',
          'test\tmoon run :test\t2026-08-27T09:44:01Z AssertionError: expected 9 forge channels to equal 6',
          'test\tmoon run :test\t2026-08-27T09:44:02Z   Tests  1 failed | 134 passed (135)',
        ],
      },
    },
  },
};

async function openPull(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  // The section is a heading over three lazy scopes now — the rows live under
  // one of them, and nothing is fetched until that one is opened.
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText(pull.title, { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #128' })).toBeVisible();
  await page.waitForTimeout(900);
}

test('files light', async ({ page }) => {
  await openPull(page);
  await page.screenshot({ path: `${OUT}/pr-files-light.png` });
});

test('files dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openPull(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/pr-files-dark.png` });
});

test('conversation', async ({ page }) => {
  await openPull(page);
  await page.getByRole('tab', { name: 'Conversation', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/pr-conversation.png` });
});

test('checks', async ({ page }) => {
  await openPull(page);
  await page.getByRole('tab', { name: /Checks/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/pr-checks.png` });
});
