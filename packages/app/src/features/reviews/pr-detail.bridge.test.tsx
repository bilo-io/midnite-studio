import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { createTestQueryClient, renderView } from '../../../test-support/render';
import { keys } from '../../services/queries';
import { useReviewsStore } from '../../store/reviews-store';
import { useUiStore } from '../../store/ui-store';
import { ReviewsPage } from '../settings/settings-pages/reviews-page';
import { PrDetail } from './pr-detail';
import { ReviewsList } from './reviews-list';

/**
 * Migrated from `e2e/review-writes.spec.ts` (Phase 82 Theme C, wave 3) — the
 * review write path's guards: that the controls are dead until consent is
 * given, that the merge dialog states a real number and refuses to submit
 * without a method, that a refusal shows `gh`'s own words, that free-text
 * reviewers split on commas and spaces, and that re-run offers "failed only"
 * only on a run that failed. **All 13 of the original assertions are covered
 * here.** 12 of the 13 e2e tests are deleted outright, their assertions
 * ported one-for-one; the 13th ("approving submits APPROVE with the body
 * that was typed") is ALSO ported here for parity, but its e2e original is
 * kept — the theme's one required browser smoke test per view, proving the
 * assembled action bar and its bridge calls survive a real render, not only
 * jsdom's. So this is a zero-straggler wave in the sense that every original
 * assertion is proven here; one of the thirteen just isn't deleted from
 * Playwright.
 *
 * Driven through `PrDetail` directly (`repoId`/`number` props, exactly like
 * `pr-detail.test.tsx`'s own existing `renderPr` for the unrelated
 * Open-preview suite), never through `ReviewsView`/`ReviewsList`: every one of
 * these tests is about the action bar and its dialogs once a PR is open, not
 * about finding the PR in a list. That also means the e2e spec's `tab` option
 * (which switched `ReviewsList`'s Open/Draft/Merged filter so a stored
 * selection would still resolve) has nothing to do here — a draft or merged
 * fixture is simply handed to `PrDetail` directly.
 *
 * **"the Settings switch is what turns the actions on" is a substitution, not
 * a straight port.** The e2e version clicks the rail's Settings button, then
 * the Reviews settings page, then back to the PR row — three steps that only
 * exist because Settings is a separate *view* in the real app. Mounting
 * `<ReviewsPage>` beside `<PrDetail>` in one small harness exercises the
 * identical code path (the same checkbox, writing the same
 * `forgeWritesEnabled` field `ReviewActionBar` reads) without needing the
 * rail/routing shell — the same kind of substitution Phase 81's own
 * verification pass accepted for `companion-panel.spec.ts`'s `app.lock`
 * standing in for `sync.push`.
 *
 * `PrDetail`'s only import is a *static* `react-markdown`/`remark-gfm` (the
 * Overview tab), never a `React.lazy` boundary — so, unlike
 * `commit-detail.bridge.test.tsx`, there is no chunk to warm up here.
 */

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const OPEN_PULL = {
  number: 201,
  title: 'Teach the app to review',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/writes',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  url: 'https://github.com/bilo-io/midnite-studio/pull/201',
};

/** Fourteen commits, of which the wire carries five — see `PULL_COMMIT_SAMPLE`. */
const DETAIL = {
  body: 'The write half.',
  headSha: 'c'.repeat(40),
  baseBranch: 'main',
  additions: 40,
  deletions: 4,
  changedFiles: 3,
  mergeable: 'MERGEABLE',
  commitCount: 14,
  commits: [
    { sha: 'f'.repeat(40), subject: 'wire the action bar' },
    { sha: 'e'.repeat(40), subject: 'add gh-write' },
  ],
  reviewRequests: ['ana'],
};

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  forge: {
    cli: { reason: 'ready' },
    pulls: [OPEN_PULL],
    pullDetail: { '201': DETAIL },
    pullComments: { '201': [] },
  },
};

type WriteCall = { channel: string; request: Record<string, unknown> };

/**
 * Every write the app has sent, in order — `mock-bridge.ts`'s `recordWrite`
 * puts each one on `window.__mstudioWrites`. Read directly (no `page.evaluate`
 * needed under jsdom): reading the request rather than the rendered result is
 * the point — an approval and a comment look the same on screen until you
 * look at which verb was sent.
 */
const recorded = (): WriteCall[] =>
  (window as unknown as { __mstudioWrites?: WriteCall[] }).__mstudioWrites ?? [];

/** Mount `PrDetail` on #201 and wait for its landmark to appear. */
async function openPull(
  data: MockFixtures = base,
  options: { writes?: boolean } = {},
): Promise<void> {
  renderView(<PrDetail repoId="repo-1" number={201} />, {
    fixtures: data,
    uiState: { forgeWritesEnabled: options.writes ?? false },
  });
  await screen.findByRole('region', { name: 'Pull request #201' });
}

/** The Settings-page harness for the one test that proves the switch reaches the bar. */
function SettingsAndPull() {
  return (
    <>
      <ReviewsPage />
      <PrDetail repoId="repo-1" number={201} />
    </>
  );
}

beforeEach(() => {
  useUiStore.setState({ forgeWritesEnabled: false });
});

afterEach(cleanup);

describe('PrDetail — the review write path, assembled through the real bridge', () => {
  it('every review action is disabled until the setting is turned on', async () => {
    await openPull();

    // The default. A user who never opens Settings cannot change anything on
    // GitHub from this app, which is the whole point of the switch.
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Request changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Merge' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Review actions are off/)).toBeTruthy();
  });

  it('the Settings switch is what turns the actions on', async () => {
    renderView(<SettingsAndPull />, { fixtures: base });
    await screen.findByRole('region', { name: 'Pull request #201' });

    const consent = screen.getByRole('checkbox', {
      name: /Allow Midnite Studio to act on pull requests/,
    });
    expect((consent as HTMLInputElement).checked).toBe(false);
    fireEvent.click(consent);

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect((screen.getByRole('button', { name: 'Merge' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.queryByText(/Review actions are off/)).toBeNull();
  });

  it('approving submits APPROVE with the body that was typed', async () => {
    await openPull(base, { writes: true });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Approve/ }), {
      target: { value: 'reads well' },
    });
    // The submit button restates the verb, so it is never ambiguous what will
    // be published — see the action bar's own doc comment on the one-composer
    // model. `[1]`: the toggle button that opened the composer shares the name.
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[1]!);

    await waitFor(() => expect(recorded().map((call) => call.channel)).toContain('pullReview'));
    const call = recorded().find((entry) => entry.channel === 'pullReview');
    expect(call?.request).toMatchObject({ number: 201, event: 'APPROVE', body: 'reads well' });

    // The composer closes on success, and the body is not left behind to be
    // resubmitted by a second click.
    expect(screen.queryByRole('textbox', { name: /Approve/ })).toBeNull();
  });

  it('requesting changes cannot be submitted without a body', async () => {
    await openPull(base, { writes: true });

    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    const submit = screen.getAllByRole('button', { name: 'Request changes' })[1]!;
    // GitHub's own rule, encoded in the contract too — see ForgePullReviewRequest.
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: /Request changes/ }), {
      target: { value: 'needs a test' },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(recorded().map((call) => call.channel)).toContain('pullReview'));
    expect(recorded().at(-1)?.request).toMatchObject({ event: 'REQUEST_CHANGES' });
  });

  it('a comment review needs a body too, and only Approve does not', async () => {
    await openPull(base, { writes: true });

    // GitHub documents `body` as required for COMMENT as well as
    // REQUEST_CHANGES, and refuses either without one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Comment' })[0]!);
    const submit = screen.getAllByRole('button', { name: 'Comment' })[1]!;
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: /Comment/ }), {
      target: { value: 'one note' },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    // Approve is the one verb that may be submitted empty.
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(
      (screen.getAllByRole('button', { name: 'Approve' })[1] as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('a refused write shows gh’s own words and keeps the body', async () => {
    await openPull(
      {
        ...base,
        forge: { ...base.forge, writeError: 'GraphQL: Can not approve your own pull request' },
      },
      { writes: true },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Approve/ }), {
      target: { value: 'lgtm' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[1]!);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Can not approve your own pull request',
      ),
    );
    // Still open, still holding what was typed: a refused review whose body
    // was discarded would have to be retyped to find out what was wrong.
    expect((screen.getByRole('textbox', { name: /Approve/ }) as HTMLTextAreaElement).value).toBe(
      'lgtm',
    );
  });

  it('the merge dialog states the real commit count and needs a method', async () => {
    await openPull(base, { writes: true });

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    const dialog = await screen.findByRole('dialog', { name: /Merge pull request #201/ });

    // Fourteen, from `gh pr view --json commits` — not the two the sample
    // carries, and not the zero a local `rev-list` would report.
    expect(within(dialog).getByTestId('merge-blast-radius').textContent).toContain('14 commits');
    expect(within(dialog).getByTestId('merge-blast-radius').textContent).toContain('main');
    expect(within(dialog).getByText('…and 12 more')).toBeTruthy();
    expect(within(dialog).getByText('wire the action bar')).toBeTruthy();

    const merge = within(dialog).getByRole('button', { name: 'Merge' });
    expect((merge as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole('radio', { name: /Squash and merge/ }));
    expect((merge as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(merge);

    await waitFor(() => expect(recorded().at(-1)?.channel).toBe('pullMerge'));
    expect(recorded().at(-1)?.request).toMatchObject({ number: 201, method: 'squash' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a refused merge keeps the dialog open with the reason', async () => {
    await openPull(
      { ...base, forge: { ...base.forge, writeError: 'Pull request is not mergeable' } },
      { writes: true },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    const dialog = await screen.findByRole('dialog', { name: /Merge pull request #201/ });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Merge commit/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain(
        'Pull request is not mergeable',
      ),
    );
  });

  it('Ready for review shows only on a draft', async () => {
    await openPull(base, { writes: true });
    // A dead toggle on a PR that is already ready would be a control with no
    // effect; the button simply is not there.
    expect(screen.queryByRole('button', { name: 'Ready for review' })).toBeNull();
    cleanup();

    await openPull(
      { ...base, forge: { ...base.forge, pulls: [{ ...OPEN_PULL, isDraft: true }] } },
      { writes: true },
    );
    const ready = screen.getByRole('button', { name: 'Ready for review' });
    expect(ready).toBeTruthy();
    fireEvent.click(ready);
    await waitFor(() => expect(recorded().at(-1)?.channel).toBe('pullReady'));
  });

  it('a requested reviewer can be re-requested in one click', async () => {
    await openPull(base, { writes: true });

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    // `ana` comes off the PR detail's `reviewRequests` — no extra API call.
    fireEvent.click(screen.getByRole('button', { name: 'Re-request a review from ana' }));

    await waitFor(() => expect(recorded().at(-1)?.channel).toBe('pullRequestReview'));
    expect(recorded().at(-1)?.request).toMatchObject({ reviewers: ['ana'] });
  });

  it('free-text reviewers are split on commas and spaces', async () => {
    await openPull(base, { writes: true });

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'GitHub usernames to request a review from' }),
      { target: { value: 'octo-cat, hubot' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request' }));

    await waitFor(() => expect(recorded().at(-1)?.channel).toBe('pullRequestReview'));
    expect(recorded().at(-1)?.request).toMatchObject({ reviewers: ['octo-cat', 'hubot'] });
  });

  it('a merged pull request offers nothing to review', async () => {
    await openPull({
      ...base,
      forge: {
        ...base.forge,
        pulls: [{ ...OPEN_PULL, state: 'merged', mergedAt: '2026-08-20T10:00:00Z' }],
      },
    });

    // No enabling needed — the bar is absent on a closed PR whatever the
    // setting says, because approving a merged PR is not a permission problem
    // but an action that stopped making sense.
    expect(await screen.findByText(/there is nothing left to review/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('re-run offers failed-only only on a run that failed', async () => {
    const checksRun = (over: Record<string, unknown>) => ({
      id: '9001',
      name: 'CI',
      workflowName: 'CI',
      workflowId: '1',
      status: 'completed',
      conclusion: 'failure',
      headBranch: 'feature/writes',
      headSha: 'c'.repeat(40),
      createdAt: '2026-08-27T09:00:00Z',
      updatedAt: '2026-08-27T09:05:00Z',
      url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9001',
      event: 'pull_request',
      ...over,
    });

    await openPull({ ...base, forge: { ...base.forge, runs: [checksRun({})] } }, { writes: true });
    fireEvent.click(screen.getByRole('tab', { name: /Checks/ }));

    const rerunAll = await screen.findByRole('button', { name: 'Re-run all jobs' });
    expect((rerunAll as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Re-run failed jobs' }));
    await waitFor(() => expect(recorded().at(-1)?.channel).toBe('runRerun'));
    expect(recorded().at(-1)?.request).toMatchObject({ runId: '9001', failedOnly: true });

    // A green run has nothing to re-run failed, and GitHub's API refuses it —
    // so the narrower button is absent rather than live and doomed.
    cleanup();
    await openPull(
      { ...base, forge: { ...base.forge, runs: [checksRun({ conclusion: 'success' })] } },
      { writes: true },
    );
    fireEvent.click(screen.getByRole('tab', { name: /Checks/ }));
    expect(await screen.findByRole('button', { name: 'Re-run all jobs' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Re-run failed jobs' })).toBeNull();
  });
});

/**
 * Migrated from `e2e/reviews-loading.spec.ts` (Phase 82 Theme C, wave 5) — the
 * Reviews view's loading states: the mock bridge answers in the same tick it
 * is asked, so without an artificial hold none of these skeletons ever
 * render. `forgeLatencyMs` (`mock-bridge.ts`) wraps every forge call in a
 * real `setTimeout`, so a synchronous assertion made right after the render
 * or the click that triggers the fetch — before any `await` yields the event
 * loop — sees the pending state deterministically, with no need to actually
 * wait out the delay (`forgeLatencyMs` is set high on purpose, so a stray
 * `await` elsewhere in the harness can never accidentally let one resolve
 * mid-test). All 7 of the original assertions are ported; the "Files tab in
 * dark" test is the one straggler — see its note below.
 *
 * **The header-already-rendered tests pre-seed the query cache rather than
 * mounting `checks-verdict.tsx`.** The e2e original's own comment explains
 * why a PR's header (and its Checks pill) can render immediately while the
 * Overview/Files/Conversation/Checks body is still loading: `PrDetail`'s own
 * `useForgePulls(repoId, true)` call (defaults: `state: 'open'`, `scope:
 * 'all'`) shares its query key with the status bar's `checks-verdict`
 * widget, which is always mounted and queries that exact key on load, well
 * before any PR is ever opened. This harness does not mount that widget, so
 * the equivalent cache entry is seeded directly via `queryClient.setQueryData
 * (keys.forgePulls(...))` before rendering — the jsdom-side stand-in for
 * "a sibling widget already asked this question."
 */
const LOADING_REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

/* Real, but generous — nothing here ever awaits past it. */
const LOADING_LATENCY = 5000;

const LOADING_PULL = {
  number: 128,
  title: 'Spinners and loading skeletons for the Reviews view',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'passing',
  headBranch: 'feature/reviews-loading',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/128',
};

const SECOND_LOADING_PULL = {
  ...LOADING_PULL,
  number: 131,
  title: 'Skeletons for the Checks tab',
  headBranch: 'feature/checks-loading',
  checks: 'pending',
};

const loadingData: MockFixtures = {
  ...fixtures,
  forgeLatencyMs: LOADING_LATENCY,
  remotes: LOADING_REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-studio': [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [LOADING_PULL, SECOND_LOADING_PULL],
    runs: [],
    pullDetail: {
      '128': {
        body: 'The Reviews view now draws the shape of what it is fetching.',
        headSha: 'c'.repeat(40),
        baseBranch: 'main',
        additions: 412,
        deletions: 38,
        changedFiles: 9,
        mergeable: 'MERGEABLE',
      },
      '131': {
        body: 'The Checks tab gets the job tree and log pane in outline.',
        headSha: 'c'.repeat(40),
        baseBranch: 'main',
        additions: 96,
        deletions: 12,
        changedFiles: 3,
        mergeable: 'MERGEABLE',
      },
    },
  },
};

/**
 * Pre-seeds the `checks-verdict`-equivalent cache entry (`PrDetail`'s own
 * header/listing query) for one or both pulls, and — only when `ReviewsList`
 * is the thing being mounted — the list pane's own scoped "All Pull
 * Requests" query too, so its rows render without this file also having to
 * prove that group's own fetch (covered by "the pull request list,
 * mid-fetch" above).
 */
function seedListingCache(
  pulls: (typeof LOADING_PULL)[],
  options: { forList?: boolean } = {},
) {
  const client = createTestQueryClient();
  const page = { pulls, cli: { reason: 'ready' } };
  client.setQueryData(keys.forgePulls('repo-1', 20, 'open', 'all'), page);
  if (options.forList) {
    client.setQueryData(keys.forgePulls('repo-1', 20, 'all', 'all'), page);
  }
  return client;
}

/** Opens the "All Pull Requests" group in `ReviewsList`. */
async function openAllPullsGroup(): Promise<void> {
  await fireEvent.click(
    within(screen.getByTestId('reviews-groups')).getByRole('button', {
      name: 'All Pull Requests',
    }),
  );
}

function loadingRow(title: string) {
  const list = within(screen.getByTestId('reviews-groups')).getByRole('list', {
    name: 'All Pull Requests',
  });
  return within(list).getByRole('button', { name: new RegExp(title) });
}

describe('ReviewsList/PrDetail loading states, assembled through the real bridge', () => {
  beforeEach(() => {
    useReviewsStore.setState({ selectedPull: {}, openGroups: {} });
  });

  afterEach(cleanup);

  it('the pull request list, mid-fetch', async () => {
    renderView(<ReviewsList repoId="repo-1" />, { fixtures: loadingData });
    await openAllPullsGroup();

    // Nothing pre-seeded here: both the list pane's own scoped fetch and the
    // (nothing-selected) detail column's own skeleton are genuinely pending.
    expect(screen.getByText('Loading pull requests…')).toBeTruthy();
    expect(screen.getByText('Loading the pull request…')).toBeTruthy();
  });

  it('a pull request opening, with nothing cached', async () => {
    const queryClient = seedListingCache([LOADING_PULL, SECOND_LOADING_PULL], { forList: true });
    renderView(<ReviewsList repoId="repo-1" />, { fixtures: loadingData, queryClient });
    await openAllPullsGroup();

    fireEvent.click(loadingRow(LOADING_PULL.title));
    expect(
      await screen.findByRole('region', { name: `Pull request #${LOADING_PULL.number}` }),
    ).toBeTruthy();
    // The header renders immediately from the seeded listing cache; only the
    // detail proper (additions/deletions, mergeable state, description) is
    // still out, which is the Overview skeleton's job, not the whole pane's.
    expect(screen.getByText('Loading the description…')).toBeTruthy();
  });

  it('switching pull requests, with the listing already cached', async () => {
    const queryClient = seedListingCache([LOADING_PULL, SECOND_LOADING_PULL], { forList: true });
    renderView(<ReviewsList repoId="repo-1" />, { fixtures: loadingData, queryClient });
    await openAllPullsGroup();

    fireEvent.click(loadingRow(LOADING_PULL.title));
    await screen.findByRole('region', { name: `Pull request #${LOADING_PULL.number}` });

    // Now the listing is cached, so #131's header renders immediately from it
    // and only the detail is outstanding.
    fireEvent.click(loadingRow(SECOND_LOADING_PULL.title));
    expect(
      await screen.findByRole('region', { name: `Pull request #${SECOND_LOADING_PULL.number}` }),
    ).toBeTruthy();
    expect(screen.getByText('Loading the description…')).toBeTruthy();
  });

  it('the Files tab, mid-fetch', async () => {
    const queryClient = seedListingCache([LOADING_PULL]);
    renderView(<PrDetail repoId="repo-1" number={LOADING_PULL.number} />, {
      fixtures: loadingData,
      queryClient,
    });
    await screen.findByRole('region', { name: `Pull request #${LOADING_PULL.number}` });

    const files = screen.getByRole('tab', { name: 'Files' });
    fireEvent.click(files);
    // The strip and the panel read the same state, and the shot is only worth
    // keeping if it shows them agreeing.
    expect(files.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Loading the diff…')).toBeTruthy();
  });

  /**
   * **Straggler — stays in `e2e/reviews-loading.spec.ts`.** "The Files tab in
   * dark, mid-fetch" asserts nothing functional beyond the light-theme Files
   * test above: `setTheme` only flips `document.documentElement`'s `dark`
   * class and the OS colour-scheme emulation, and the assertion it adds over
   * the light-mode test is purely visual ("the bars are `bg-muted`, so they
   * follow the theme") — the e2e original itself only *photographs* that
   * distinction (`shoot`, gated on `MSTUDIO_SHOTS`); the non-visual
   * assertions it makes unconditionally (`aria-selected`, the loading text)
   * are identical to the light-theme test and prove nothing new under jsdom,
   * which has no computed style/paint to tell `bg-muted` apart from anything
   * else.
   */

  it('the Conversation tab, mid-fetch', async () => {
    const queryClient = seedListingCache([LOADING_PULL]);
    renderView(<PrDetail repoId="repo-1" number={LOADING_PULL.number} />, {
      fixtures: loadingData,
      queryClient,
    });
    await screen.findByRole('region', { name: `Pull request #${LOADING_PULL.number}` });

    const conversation = screen.getByRole('tab', { name: 'Conversation' });
    fireEvent.click(conversation);
    expect(conversation.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Loading the conversation…')).toBeTruthy();
  });

  it('the Checks tab, mid-fetch', async () => {
    const queryClient = seedListingCache([LOADING_PULL]);
    renderView(<PrDetail repoId="repo-1" number={LOADING_PULL.number} />, {
      fixtures: loadingData,
      queryClient,
    });
    await screen.findByRole('region', { name: `Pull request #${LOADING_PULL.number}` });

    // Not `exact`: the tab carries the checks pill from the already-cached
    // header pull (`checks: 'passing'`), so its accessible name is "Checks
    // Checks passing" — anchoring the front of it is enough to tell it from
    // every other tab, matching Playwright's own substring default here
    // rather than Testing Library's whole-string one.
    fireEvent.click(screen.getByRole('tab', { name: /^Checks/ }));
    expect(screen.getByText('Loading the checks…')).toBeTruthy();
  });
});
