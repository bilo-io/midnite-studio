import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Actions view, assembled.
 *
 * The parts most likely to be subtly wrong — the ANSI tokeniser, the group
 * folder, the fold-to-visible-rows derivation, the run grouping — are covered
 * under bare vitest, where an off-by-one localises. What only the assembled app
 * can show is that they compose: that the view opens on the run that failed,
 * that its failed job is the one expanded, that a truncated log says so before
 * you scroll, and that nothing here can change a run on the forge.
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
 * The truncation marker, in the shape `isLogGapMarker` recognises: no
 * `job<TAB>step<TAB>` prefix, opening and closing with the ellipsis run.
 */
const GAP_MARKER = '··· 4,211 lines omitted — open the run on GitHub for the full log ···';

/** A real log row: job, step, stamp, message. */
const line = (jobName: string, text: string) =>
  `${jobName}\tRun tests\t2026-08-26T10:00:39.7297973Z ${text}`;

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
    runLogs: {
      '2': {
        lines: [
          line('test (ubuntu-latest)', '##[group]Run actions/checkout@v4'),
          line('test (ubuntu-latest)', 'cloning'),
          line('test (ubuntu-latest)', '##[endgroup]'),
          // Where main spliced out the middle.
          //
          // Written out rather than imported from `@midnite/studio-shared`:
          // Playwright loads specs as ESM and the shared package resolves to
          // CJS there, so a named import fails at collection time. That the
          // real writer and the real reader agree on this shape is asserted in
          // `log-model.test.ts` under vitest, where the import works — this
          // only has to be a line the reader recognises.
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
const jobs = (page: Page) => page.getByRole('list', { name: 'Jobs' });
const log = (page: Page) => page.getByRole('region', { name: 'Job log' });
const detail = (page: Page) => page.getByRole('region', { name: 'Run detail' });

/** Land on the Actions view. Only for fixtures where it has runs to show. */
async function open(page: Page, data: MockFixtures = base): Promise<void> {
  await goToActions(page, data);
  await expect(runList(page)).toBeVisible();
}

/** Land on the Actions view whatever it ends up rendering. */
async function goToActions(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Actions');
}

test('runs are sectioned by workflow, newest section first', async ({ page }) => {
  await open(page);

  // Grouped on workflowId, labelled by name — and CI is above Release because
  // its newest run is newer, which is the question the list is usually asked.
  const sections = runList(page).getByRole('button', { expanded: true });
  await expect(sections.first()).toContainText('CI');
  await expect(sections).toHaveCount(2);

  // Two CI runs under CI, one under Release.
  await expect(runList(page).getByRole('button', { name: /#130/ })).toBeVisible();
  await expect(runList(page).getByRole('button', { name: /#129/ })).toBeVisible();
  await expect(runList(page).getByRole('button', { name: /#12 / })).toBeVisible();
});

test('a workflow section folds away and comes back', async ({ page }) => {
  await open(page);

  const release = runList(page).getByRole('button', { name: 'Release 1' });

  await expect(runList(page).getByRole('button', { name: /#12 / })).toBeVisible();
  await release.click();
  await expect(runList(page).getByRole('button', { name: /#12 / })).toHaveCount(0);
  // CI is untouched — folding is per workflow, not a global collapse.
  await expect(runList(page).getByRole('button', { name: /#130/ })).toBeVisible();

  await release.click();
  await expect(runList(page).getByRole('button', { name: /#12 / })).toBeVisible();
});

test('the view opens on the run that failed, not the newest one', async ({ page }) => {
  await open(page);

  // #130 is newer and green; #129 is why anyone opened this view.
  await expect(detail(page).getByRole('heading', { level: 3 })).toContainText('CI');
  /*
    `getByRole('img', …)`, not `getByText`: a settled status renders as a bare
    coloured glyph now, so its word survives only as the mark's accessible
    name. Asserting on the name rather than on visible text is also the stronger
    check — it fails if the pill loses the label a screen reader needs.
  */
  await expect(detail(page).getByRole('img', { name: 'Failed', exact: true }).first()).toBeVisible();
  await expect(
    jobs(page).getByRole('button', { name: 'test (ubuntu-latest)', exact: true }),
  ).toBeVisible();
  // And the selected row in the list is #129, not the newest.
  await expect(runList(page).getByRole('button', { name: /#129/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('the failed job is expanded and the passing one is not', async ({ page }) => {
  await open(page);

  // The failure is the entire reason the pane is open; thirty rows of green
  // would push it off the screen.
  await expect(
    jobs(page).getByRole('button', { name: 'Steps in test (ubuntu-latest)' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(jobs(page).getByRole('button', { name: 'Steps in typecheck' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(jobs(page).getByText('Run vitest')).toBeVisible();
  await expect(jobs(page).getByText('Run tsc')).toHaveCount(0);
});

test('the log shows the selected job, folds its groups, and keeps its colour', async ({ page }) => {
  await open(page);

  // The log defaults to the failed job, so this is its output, not typecheck's.
  await expect(log(page).getByText('FAIL src/a.test.ts')).toBeVisible();
  await expect(log(page).getByText('tsc --noEmit')).toHaveCount(0);

  // ANSI resolved to a theme-aware class rather than stripped or printed raw.
  await expect(log(page).getByText('FAIL src/a.test.ts')).toHaveClass(/text-red-600/);

  // `##[group]` — the runner's own syntax, not just the documented `::group::`.
  const group = log(page).getByRole('button', { name: /Run actions\/checkout@v4/ });
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(log(page).getByText('cloning')).toBeVisible();
  await group.click();
  await expect(log(page).getByText('cloning')).toHaveCount(0);

  // Switching jobs switches the log — one fetch served both.
  await jobs(page).getByRole('button', { name: 'typecheck', exact: true }).click();
  await expect(log(page).getByText('tsc --noEmit')).toBeVisible();
  await expect(log(page).getByText('FAIL src/a.test.ts')).toHaveCount(0);
});

test('a truncated log says so before you scroll, and can be widened', async ({ page }) => {
  await open(page);

  // Above the log, not at the splice point: a marker a thousand rows down is a
  // marker nobody sees, and a capped log reading as complete is the one
  // outcome this whole shape exists to prevent.
  // Said twice on purpose: the banner up front, and a row at the splice.
  await expect(log(page).getByText(/^Log truncated — 4,211 lines omitted/)).toBeVisible();
  await expect(log(page).getByText(/^··· 4,211 lines omitted/)).toBeVisible();
  await expect(log(page).getByText(/9\.0 MB/)).toBeVisible();

  await log(page).getByRole('button', { name: 'Load the full log' }).click();
  await expect(log(page).getByText('every last line')).toBeVisible();
  // Nothing left to ask for once the un-capped answer is the one showing — and
  // neither the banner nor the in-band row has anything left to say.
  await expect(log(page).getByText(/lines omitted/)).toHaveCount(0);
});

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

test('every stateful verb links out instead of being reimplemented', async ({ page }) => {
  await open(page);

  await detail(page).getByRole('button', { name: 'Open this run on GitHub' }).click();
  await jobs(page).getByRole('button', { name: 'Open test (ubuntu-latest) on GitHub' }).click();
  await detail(page).getByRole('button', { name: '.github/workflows/ci.yml' }).click();

  const opened = await page.evaluate(
    () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
  );
  expect(opened).toContain('https://github.com/bilo-io/midnite-studio/actions/runs/2');
  expect(opened).toContain('https://github.com/bilo-io/midnite-studio/actions/runs/1/job/11');
  // The workflow file's path comes from the lazy `gh workflow list` lookup —
  // no run-list field carries it.
  expect(opened).toContain(
    'https://github.com/bilo-io/midnite-studio/blob/main/.github/workflows/ci.yml',
  );
});

test('an unfinished run is pending, not broken', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      ...base.forge,
      runs: [run({ id: '77', status: 'in_progress', conclusion: '', number: 131 })],
      // No log fixture for 77 — which is what GitHub does for a run in flight.
      runLogs: {},
      runDetail: { '77': { jobs: [job({ id: '20', name: 'build', status: 'in_progress', conclusion: '' })] } },
    },
  });

  await expect(detail(page).getByRole('img', { name: 'Running', exact: true }).first()).toBeVisible();
  await expect(detail(page).getByText(/has not finished, so GitHub has no log/)).toBeVisible();
});

test('a signed-out gh says what to run, and lists nothing', async ({ page }) => {
  // `goToActions`, not `open`: there is no run list to wait for, which is the
  // point — the view replaces itself with the one thing the user can act on.
  await goToActions(page, {
    ...base,
    forge: {
      cli: { reason: 'not-authenticated', hint: 'Run `gh auth login` in a terminal.' },
    },
  });

  // `.first()`: the sidebar's own Actions section says the same sentence, which
  // is the point — one CLI state, stated wherever it stops something working.
  await expect(page.getByText('Run `gh auth login` in a terminal.').first()).toBeVisible();
  await expect(runList(page)).toHaveCount(0);
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

test('the fold state does not follow you to another job', async ({ page }) => {
  await open(page);

  // Collapse the failed job's only group, then look at typecheck.
  await log(page).getByRole('button', { name: /Run actions\/checkout@v4/ }).click();
  await expect(log(page).getByText('cloning')).toHaveCount(0);

  await jobs(page).getByRole('button', { name: 'typecheck', exact: true }).click();
  await expect(log(page).getByText('tsc --noEmit')).toBeVisible();

  // Back again: `collapsed` holds ordinals, so carrying it across jobs folds
  // unrelated groups and can leave "Expand all" showing over nothing folded.
  await jobs(page).getByRole('button', { name: 'test (ubuntu-latest)', exact: true }).click();
  await expect(log(page).getByText('cloning')).toBeVisible();
});

test('loading the full log keeps the log on screen while it arrives', async ({ page }) => {
  await open(page);

  await expect(log(page).getByText('FAIL src/a.test.ts')).toBeVisible();
  await log(page).getByRole('button', { name: 'Load the full log' }).click();

  // The capped payload is the placeholder for the un-capped key, so the pane
  // never blanks to "Reading the log…" — which is what a second query for the
  // capped key would have done, the moment `full` flipped.
  await expect(log(page)).toBeVisible();
  await expect(log(page).getByText('every last line')).toBeVisible();
});

test('the truncation marker is rendered where the splice actually is', async ({ page }) => {
  await open(page);

  // Main splices this line in with no job prefix, so it used to be filed as
  // preamble and never drawn — a capped log reading as a complete one.
  await expect(log(page).getByText(/^··· 4,211 lines omitted/)).toBeVisible();
});

test('a running run is not reported as having taken any time', async ({ page }) => {
  await open(page, {
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
      runDetail: { '77': { jobs: [job({ id: '20', name: 'build', status: 'in_progress', conclusion: '' })] } },
    },
  });

  // `updatedAt` is the last state change, and it is non-null for a run still
  // going — so a duration computed from it claims the run has finished.
  await expect(detail(page).getByText('Took')).toHaveCount(0);
  await expect(runList(page).getByRole('button', { name: /#131/ })).not.toContainText('Took');
});
