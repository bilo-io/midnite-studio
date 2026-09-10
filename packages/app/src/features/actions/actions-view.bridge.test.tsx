import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useActionsStore } from '../../store/actions-store';
import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';
import { ActionsView } from './actions-view';

/**
 * Migrated from `e2e/actions-view.spec.ts` (Phase 82 Theme C, wave 3) — the
 * run-list grouping/folding, the auto-pick of the failed run, the job tree's
 * failed-expanded default, the log pane's ANSI colour/group-fold/truncation
 * behaviour and the pending/no-log states. 13 of the original 15 tests moved
 * here; 2 stay in Playwright, below.
 *
 * `ActionsView` has no internal `React.lazy` boundary of its own (only the
 * outer `view-registry.tsx` lazy-loads the *view*, which mounting the
 * component directly bypasses entirely — the same non-issue wave 2 found for
 * `search-view`) — so no `beforeAll(async () => import(...))` warm-up is
 * needed here, unlike `commit-detail`/`diff-view`'s `CommitMessage` chunk.
 *
 * **2 of the original 15 stay in Playwright**, and for the same reason in
 * both cases: they are not about `ActionsView` at all, they are about the
 * *sidebar's* `ActionsSection` row (`forge-sections.tsx`) selecting a repo and
 * a run and then switching the active view — a genuine cross-component flow
 * (category C), not a jsdom-portable unit of this view. "a sidebar run row
 * opens the view rather than a Changes tab" and "the run row opens the view
 * on the run it names" both stay in `e2e/actions-view.spec.ts` unchanged.
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

/** The truncation marker, in the shape `isLogGapMarker` recognises. */
const GAP_MARKER = '··· 4,211 lines omitted — open the run on GitHub for the full log ···';

/** A real log row: job, step, stamp, message. */
const line = (jobName: string, text: string) =>
  `${jobName}\tRun tests\t2026-08-26T10:00:39.7297973Z ${text}`;

function step(number: number, name: string, conclusion: string) {
  return { number, name, status: 'completed', conclusion, startedAt: null, completedAt: null };
}

/** Two workflows, three runs, and one of them red — see the e2e spec's own comment. */
const base: MockFixtures = {
  commitDetails: {},
  revisions: {},
  diffs: {},
  graphRows: [],
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
    runLogs: {
      '2': {
        lines: [
          line('test (ubuntu-latest)', '##[group]Run actions/checkout@v4'),
          line('test (ubuntu-latest)', 'cloning'),
          line('test (ubuntu-latest)', '##[endgroup]'),
          GAP_MARKER,
          line('test (ubuntu-latest)', `${String.fromCharCode(27)}[31mFAIL src/a.test.ts`),
          line('typecheck', 'tsc --noEmit'),
        ],
        truncated: true,
        omittedLines: 4_211,
        totalBytes: 9_400_000,
        full: [
          line('test (ubuntu-latest)', 'the whole thing'),
          line('test (ubuntu-latest)', 'every last line'),
        ],
      },
    },
  },
};

const runList = () => screen.getByRole('list', { name: 'Workflow runs' });
const jobs = () => screen.getByRole('list', { name: 'Jobs' });
const log = () => screen.getByRole('region', { name: 'Job log' });
const detail = () => screen.getByRole('region', { name: 'Run detail' });

/**
 * Mount the Actions view and wait for it to land on the auto-picked run.
 *
 * The run list and the run's own job/log detail are two SEPARATE queries
 * (`useForgeRuns` and `useForgeRunDetail`), so waiting only for the list —
 * which is all the run list itself needs — races the detail pane on every
 * fixture this helper is given a run with jobs for. Waiting for the Jobs
 * list too (present once `useForgeRunDetail` resolves) is enough for every
 * caller here; a test that reads the log pane's own content waits for that
 * separately, right where it first reads it.
 */
async function open(data: MockFixtures = base): Promise<void> {
  renderView(<ActionsView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
  await screen.findByRole('list', { name: 'Workflow runs' });
  await screen.findByRole('list', { name: 'Jobs' });
}

/** Mount the Actions view without waiting for a run list — the signed-out case has none. */
function goToActions(data: MockFixtures = base): void {
  renderView(<ActionsView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
}

beforeEach(() => {
  useActionsStore.setState({ selectedRun: {}, selectedJob: {}, collapsedWorkflows: {} });
  useBrowserStore.setState({ tabs: [], activeTabId: null });
});

afterEach(cleanup);

describe('ActionsView, assembled through the real bridge', () => {
  it('runs are sectioned by workflow, newest section first', async () => {
    await open();

    const sections = within(runList()).getAllByRole('button', { expanded: true });
    expect(sections[0]?.textContent).toContain('CI');
    expect(sections).toHaveLength(2);

    expect(within(runList()).getByRole('button', { name: /#130/ })).toBeTruthy();
    expect(within(runList()).getByRole('button', { name: /#129/ })).toBeTruthy();
    expect(within(runList()).getByRole('button', { name: /#12 / })).toBeTruthy();
  });

  it('a workflow section folds away and comes back', async () => {
    await open();

    const release = within(runList()).getByRole('button', { name: 'Release 1' });

    expect(within(runList()).getByRole('button', { name: /#12 / })).toBeTruthy();
    fireEvent.click(release);
    expect(within(runList()).queryByRole('button', { name: /#12 / })).toBeNull();
    // CI is untouched — folding is per workflow, not a global collapse.
    expect(within(runList()).getByRole('button', { name: /#130/ })).toBeTruthy();

    fireEvent.click(release);
    expect(within(runList()).getByRole('button', { name: /#12 / })).toBeTruthy();
  });

  it('the view opens on the run that failed, not the newest one', async () => {
    await open();

    // #130 is newer and green; #129 is why anyone opened this view.
    expect(within(detail()).getByRole('heading', { level: 3 }).textContent).toContain('CI');
    expect(within(detail()).getAllByRole('img', { name: 'Failed', exact: true })[0]).toBeTruthy();
    expect(
      within(jobs()).getByRole('button', { name: 'test (ubuntu-latest)', exact: true }),
    ).toBeTruthy();
    expect(
      within(runList()).getByRole('button', { name: /#129/ }).getAttribute('aria-current'),
    ).toBe('true');
  });

  it('the failed job is expanded and the passing one is not', async () => {
    await open();

    expect(
      within(jobs())
        .getByRole('button', { name: 'Steps in test (ubuntu-latest)' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      within(jobs()).getByRole('button', { name: 'Steps in typecheck' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(within(jobs()).getByText('Run vitest')).toBeTruthy();
    expect(within(jobs()).queryByText('Run tsc')).toBeNull();
  });

  it('the log shows the selected job, folds its groups, and keeps its colour', async () => {
    await open();

    // The log defaults to the failed job, so this is its output, not typecheck's.
    // The log pane is its own query, separate from the jobs list `open()`
    // already waited for — this is the first read of its content.
    await within(log()).findByText('FAIL src/a.test.ts');
    expect(within(log()).queryByText('tsc --noEmit')).toBeNull();

    // ANSI resolved to a theme-aware class rather than stripped or printed raw.
    expect(within(log()).getByText('FAIL src/a.test.ts').className).toMatch(/text-red-600/);

    // `##[group]` — the runner's own syntax, not just the documented `::group::`.
    const group = within(log()).getByRole('button', { name: /Run actions\/checkout@v4/ });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(within(log()).getByText('cloning')).toBeTruthy();
    fireEvent.click(group);
    expect(within(log()).queryByText('cloning')).toBeNull();

    // Switching jobs switches the log — one fetch served both.
    fireEvent.click(within(jobs()).getByRole('button', { name: 'typecheck', exact: true }));
    await waitFor(() => expect(within(log()).getByText('tsc --noEmit')).toBeTruthy());
    expect(within(log()).queryByText('FAIL src/a.test.ts')).toBeNull();
  });

  it('a truncated log says so before you scroll, and can be widened', async () => {
    await open();

    // Said twice on purpose: the banner up front, and a row at the splice.
    // First read of the log pane's own (separately-fetched) content.
    await within(log()).findByText(/^Log truncated — 4,211 lines omitted/);
    expect(within(log()).getByText(/^··· 4,211 lines omitted/)).toBeTruthy();
    expect(within(log()).getByText(/9\.0 MB/)).toBeTruthy();

    fireEvent.click(within(log()).getByRole('button', { name: 'Load the full log' }));
    await waitFor(() => expect(within(log()).getByText('every last line')).toBeTruthy());
    // Nothing left to ask for once the un-capped answer is the one showing.
    expect(within(log()).queryByText(/lines omitted/)).toBeNull();
  });

  it('every stateful verb links out instead of being reimplemented', async () => {
    await open();

    /*
      Phase 71 Theme B: each of these routes through `openInMidnite`, which
      opens a browser tab under the default in-app preference rather than
      reaching `shell.openExternal` directly. Read the store rather than a
      rendered tab strip — this view does not mount `BrowserPane`, so the
      store is the thing to assert on, exactly as `commit-detail.bridge.test.tsx`
      does for the same class of link.
    */
    fireEvent.click(within(detail()).getByRole('button', { name: 'Open this run on GitHub' }));
    fireEvent.click(
      within(jobs()).getByRole('button', { name: 'Open test (ubuntu-latest) on GitHub' }),
    );
    fireEvent.click(within(detail()).getByRole('button', { name: '.github/workflows/ci.yml' }));

    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(3));
    expect(
      (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
    ).toEqual([]);
  });

  it('an unfinished run is pending, not broken', async () => {
    await open({
      ...base,
      forge: {
        ...base.forge,
        runs: [run({ id: '77', status: 'in_progress', conclusion: '', number: 131 })],
        // No log fixture for 77 — which is what GitHub does for a run in flight.
        runLogs: {},
        runDetail: {
          '77': { jobs: [job({ id: '20', name: 'build', status: 'in_progress', conclusion: '' })] },
        },
      },
    });

    expect(
      within(detail()).getAllByRole('img', { name: 'Running', exact: true })[0],
    ).toBeTruthy();
    expect(within(detail()).getByText(/has not finished, so GitHub has no log/)).toBeTruthy();
  });

  it('a signed-out gh says what to run, and lists nothing', async () => {
    // `goToActions`, not `open`: there is no run list to wait for, which is the
    // point — the view replaces itself with the one thing the user can act on.
    goToActions({
      ...base,
      forge: { cli: { reason: 'not-authenticated', hint: 'Run `gh auth login` in a terminal.' } },
    });

    expect(await screen.findByText('Run `gh auth login` in a terminal.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Workflow runs' })).toBeNull();
  });

  it('the fold state does not follow you to another job', async () => {
    await open();
    // First read of the log pane's own (separately-fetched) content.
    await within(log()).findByText('cloning');

    // Collapse the failed job's only group, then look at typecheck.
    fireEvent.click(within(log()).getByRole('button', { name: /Run actions\/checkout@v4/ }));
    expect(within(log()).queryByText('cloning')).toBeNull();

    fireEvent.click(within(jobs()).getByRole('button', { name: 'typecheck', exact: true }));
    await waitFor(() => expect(within(log()).getByText('tsc --noEmit')).toBeTruthy());

    // Back again: `collapsed` holds ordinals, so carrying it across jobs folds
    // unrelated groups.
    fireEvent.click(within(jobs()).getByRole('button', { name: 'test (ubuntu-latest)', exact: true }));
    await waitFor(() => expect(within(log()).getByText('cloning')).toBeTruthy());
  });

  it('loading the full log keeps the log on screen while it arrives', async () => {
    await open();

    await within(log()).findByText('FAIL src/a.test.ts');
    fireEvent.click(within(log()).getByRole('button', { name: 'Load the full log' }));

    // The pane never blanks to "Reading the log…" while the un-capped payload
    // is in flight.
    expect(log()).toBeTruthy();
    await waitFor(() => expect(within(log()).getByText('every last line')).toBeTruthy());
  });

  it('the truncation marker is rendered where the splice actually is', async () => {
    await open();

    // Main splices this line in with no job prefix, so it used to be filed as
    // preamble and never drawn.
    await within(log()).findByText(/^··· 4,211 lines omitted/);
  });

  it('a running run is not reported as having taken any time', async () => {
    await open({
      ...base,
      forge: {
        ...base.forge,
        runs: [
          run({
            id: '77',
            status: 'in_progress',
            conclusion: '',
            number: 131,
            updatedAt: '2026-08-26T10:04:00Z',
          }),
        ],
        runLogs: {},
        runDetail: {
          '77': { jobs: [job({ id: '20', name: 'build', status: 'in_progress', conclusion: '' })] },
        },
      },
    });

    // `updatedAt` is the last state change, and it is non-null for a run still
    // going — so a duration computed from it would claim the run has finished.
    expect(within(detail()).queryByText('Took')).toBeNull();
    expect(within(runList()).getByRole('button', { name: /#131/ }).textContent).not.toContain(
      'Took',
    );
  });
});
