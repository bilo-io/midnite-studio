import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The review write path (Phase 20 Themes F and G).
 *
 * Everything here is about the guards rather than about the happy path, because
 * the guards are what a mock can actually prove: that the controls are dead
 * until consent is given, that the merge dialog states a real number and
 * refuses to submit without a method, that a refusal shows `gh`'s own words
 * instead of a generic toast, and — via the recorded payloads — that the
 * command the app sent is the one the user chose. Whether `gh pr merge` then
 * does the right thing is the phase doc's open manual item against a disposable
 * test PR; no mock can answer it.
 */

const MAIN = '/tmp/midnite-git';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

const LOCAL_REF = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: true,
  worktreePath: MAIN,
};

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
  url: 'https://github.com/bilo-io/midnite-git/pull/201',
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
  refs: [LOCAL_REF],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [OPEN_PULL],
    pullDetail: { '201': DETAIL },
    pullComments: { '201': [] },
  },
};

type WriteCall = { channel: string; request: Record<string, unknown> };

/**
 * Every write the app has sent, in order.
 *
 * `mock-bridge.ts` records each one on `window.__mgitWrites` — see its
 * `recordWrite`. Reading the request rather than the rendered result is the
 * whole point: an approval and a comment look the same on screen until you look
 * at which verb was sent, and the verb is the thing worth asserting.
 */
const recorded = (page: Page): Promise<WriteCall[]> =>
  page.evaluate(
    () => (window as unknown as { __mgitWrites?: WriteCall[] }).__mgitWrites ?? [],
  );

/**
 * Open the Reviews view and the one pull request in it.
 *
 * Via the sidebar's Reviews *section* rather than the nav rail's link, matching
 * `reviews.spec.ts`: clicking the rail leaves it hover-expanded over the pane
 * the next click needs, and every action after that fights an overlay.
 *
 * `writes` seeds the persisted consent flag rather than walking Settings, so
 * each test exercises one thing. That the Settings switch actually flips it is
 * its own test below — asserted once, where it is the subject.
 */
async function openPull(
  page: Page,
  data: MockFixtures = base,
  options: { writes?: boolean; tab?: string } = {},
): Promise<void> {
  if (options.writes === true) {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-git.ui',
        JSON.stringify({ state: { forgeWritesEnabled: true }, version: 2 }),
      );
    });
  }
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByText('Teach the app to review', { exact: true }).click();
  /*
    The list's status tab has to agree with the PR, or nothing opens.

    `ReviewsList` honours a sidebar-stored selection only while that PR is in
    the FILTERED set, and the default tab is Open — which by design excludes
    drafts, merged and closed. So a spec about a draft or a merged pull request
    has to name the tab it lives under, exactly as a user would.
  */
  if (options.tab !== undefined) {
    await page.getByRole('tab', { name: options.tab, exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Pull request #201' })).toBeVisible();
}

test('every review action is disabled until the setting is turned on', async ({ page }) => {
  await openPull(page);

  // The default. A user who never opens Settings cannot change anything on
  // GitHub from this app, which is the whole point of the switch.
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request changes' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Merge' })).toBeDisabled();
  await expect(page.getByText(/Review actions are off/).first()).toBeVisible();
});

test('the Settings switch is what turns the actions on', async ({ page }) => {
  await openPull(page);

  // Settings is a rail BUTTON, not a link — it is pinned and does not route.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Reviews' })
    .click();
  const consent = page.getByRole('checkbox', {
    name: /Allow Midnite Git to act on pull requests/,
  });
  await expect(consent).not.toBeChecked();
  await consent.check();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByText('Teach the app to review', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Merge' })).toBeEnabled();
  await expect(page.getByText(/Review actions are off/)).toHaveCount(0);
});

test('approving submits APPROVE with the body that was typed', async ({ page }) => {
  await openPull(page, base, { writes: true });

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('textbox', { name: /Approve/ }).fill('reads well');
  // The submit button restates the verb, so it is never ambiguous what will be
  // published — see the action bar's doc comment on the one-composer model.
  await page.getByRole('button', { name: 'Approve', exact: true }).nth(1).click();

  await expect
    .poll(async () => (await recorded(page)).map((call) => call.channel))
    .toContain('pullReview');
  const call = (await recorded(page)).find((entry) => entry.channel === 'pullReview');
  expect(call?.request).toMatchObject({ number: 201, event: 'APPROVE', body: 'reads well' });

  // The composer closes on success, and the body is not left behind to be
  // resubmitted by a second click.
  await expect(page.getByRole('textbox', { name: /Approve/ })).toHaveCount(0);
});

test('requesting changes cannot be submitted without a body', async ({ page }) => {
  await openPull(page, base, { writes: true });

  await page.getByRole('button', { name: 'Request changes' }).click();
  const submit = page.getByRole('button', { name: 'Request changes', exact: true }).nth(1);
  // GitHub's own rule, encoded in the contract too — see ForgePullReviewRequest.
  await expect(submit).toBeDisabled();

  await page.getByRole('textbox', { name: /Request changes/ }).fill('needs a test');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect
    .poll(async () => (await recorded(page)).map((call) => call.channel))
    .toContain('pullReview');
  expect((await recorded(page)).at(-1)?.request).toMatchObject({ event: 'REQUEST_CHANGES' });
});

test('a comment review needs a body too, and only Approve does not', async ({ page }) => {
  await openPull(page, base, { writes: true });

  // GitHub documents `body` as required for COMMENT as well as REQUEST_CHANGES,
  // and refuses either without one — so the button agrees with the contract
  // rather than letting the user find out from a failed subprocess.
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click();
  const submit = page.getByRole('button', { name: 'Comment', exact: true }).nth(1);
  await expect(submit).toBeDisabled();
  await page.getByRole('textbox', { name: /Comment/ }).fill('one note');
  await expect(submit).toBeEnabled();

  // Approve is the one verb that may be submitted empty: a bare approval is a
  // normal thing to give.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true }).nth(1)).toBeEnabled();
});

test('a refused write shows gh’s own words and keeps the body', async ({ page }) => {
  await openPull(
    page,
    {
      ...base,
      forge: {
        ...base.forge,
        writeError: 'GraphQL: Can not approve your own pull request',
      },
    },
    { writes: true },
  );

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('textbox', { name: /Approve/ }).fill('lgtm');
  await page.getByRole('button', { name: 'Approve', exact: true }).nth(1).click();

  await expect(page.getByRole('alert')).toContainText('Can not approve your own pull request');
  // Still open, still holding what was typed: a refused review whose body was
  // discarded would have to be retyped to find out what was wrong with it.
  await expect(page.getByRole('textbox', { name: /Approve/ })).toHaveValue('lgtm');
});

test('the merge dialog states the real commit count and needs a method', async ({ page }) => {
  await openPull(page, base, { writes: true });

  await page.getByRole('button', { name: 'Merge' }).click();
  const dialog = page.getByRole('dialog', { name: /Merge pull request #201/ });
  await expect(dialog).toBeVisible();

  // Fourteen, from `gh pr view --json commits` — not the two the sample
  // carries, and not the zero a local `rev-list` would report for a head ref
  // this checkout has never fetched.
  await expect(dialog.getByTestId('merge-blast-radius')).toContainText('14 commits');
  await expect(dialog.getByTestId('merge-blast-radius')).toContainText('main');
  await expect(dialog.getByText('…and 12 more')).toBeVisible();
  await expect(dialog.getByText('wire the action bar')).toBeVisible();

  const merge = dialog.getByRole('button', { name: 'Merge' });
  await expect(merge).toBeDisabled();

  await dialog.getByRole('radio', { name: /Squash and merge/ }).check();
  await expect(merge).toBeEnabled();
  await merge.click();

  await expect.poll(async () => (await recorded(page)).at(-1)?.channel).toBe('pullMerge');
  expect((await recorded(page)).at(-1)?.request).toMatchObject({ number: 201, method: 'squash' });
  await expect(dialog).toHaveCount(0);
});

test('a refused merge keeps the dialog open with the reason', async ({ page }) => {
  await openPull(
    page,
    {
      ...base,
      forge: { ...base.forge, writeError: 'Pull request is not mergeable' },
    },
    { writes: true },
  );

  await page.getByRole('button', { name: 'Merge' }).click();
  const dialog = page.getByRole('dialog', { name: /Merge pull request #201/ });
  await dialog.getByRole('radio', { name: /Merge commit/ }).check();
  await dialog.getByRole('button', { name: 'Merge' }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Pull request is not mergeable');
});

test('Ready for review shows only on a draft', async ({ page }) => {
  await openPull(page, base, { writes: true });
  // A dead toggle on a PR that is already ready would be a control with no
  // effect; the button simply is not there.
  await expect(page.getByRole('button', { name: 'Ready for review' })).toHaveCount(0);

  await openPull(
    page,
    {
      ...base,
      forge: { ...base.forge, pulls: [{ ...OPEN_PULL, isDraft: true }] },
    },
    { writes: true, tab: 'Draft' },
  );
  const ready = page.getByRole('button', { name: 'Ready for review' });
  await expect(ready).toBeVisible();
  await ready.click();
  await expect.poll(async () => (await recorded(page)).at(-1)?.channel).toBe('pullReady');
});

test('a requested reviewer can be re-requested in one click', async ({ page }) => {
  await openPull(page, base, { writes: true });

  await page.getByRole('button', { name: 'Request review' }).click();
  // `ana` comes off the PR detail's `reviewRequests` — no extra API call, which
  // is why the picker can offer a real name at all.
  await page.getByRole('button', { name: 'Re-request a review from ana' }).click();

  await expect.poll(async () => (await recorded(page)).at(-1)?.channel).toBe('pullRequestReview');
  expect((await recorded(page)).at(-1)?.request).toMatchObject({ reviewers: ['ana'] });
});

test('free-text reviewers are split on commas and spaces', async ({ page }) => {
  await openPull(page, base, { writes: true });

  await page.getByRole('button', { name: 'Request review' }).click();
  await page
    .getByRole('textbox', { name: 'GitHub usernames to request a review from' })
    .fill('octo-cat, hubot');
  await page.getByRole('button', { name: 'Request', exact: true }).click();

  await expect.poll(async () => (await recorded(page)).at(-1)?.channel).toBe('pullRequestReview');
  expect((await recorded(page)).at(-1)?.request).toMatchObject({
    reviewers: ['octo-cat', 'hubot'],
  });
});

test('a merged pull request offers nothing to review', async ({ page }) => {
  await openPull(
    page,
    {
      ...base,
      forge: {
        ...base.forge,
        pulls: [{ ...OPEN_PULL, state: 'merged', mergedAt: '2026-08-20T10:00:00Z' }],
      },
    },
    { tab: 'Merged' },
  );
  // No enabling needed — the bar is absent on a closed PR whatever the setting
  // says, because approving a merged PR is not a permission problem but an
  // action that stopped making sense.
  await expect(page.getByText(/there is nothing left to review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('re-run offers failed-only only on a run that failed', async ({ page }) => {
  const run = (over: Record<string, unknown>) => ({
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
    url: 'https://github.com/bilo-io/midnite-git/actions/runs/9001',
    event: 'pull_request',
    ...over,
  });

  await openPull(page, { ...base, forge: { ...base.forge, runs: [run({})] } }, { writes: true });
  await page.getByRole('tab', { name: /Checks/ }).click();

  await expect(page.getByRole('button', { name: 'Re-run all jobs' })).toBeEnabled();
  await page.getByRole('button', { name: 'Re-run failed jobs' }).click();
  await expect.poll(async () => (await recorded(page)).at(-1)?.channel).toBe('runRerun');
  expect((await recorded(page)).at(-1)?.request).toMatchObject({
    runId: '9001',
    failedOnly: true,
  });

  // A green run has nothing to re-run failed, and GitHub's API refuses it — so
  // the narrower button is absent rather than live and doomed.
  await openPull(
    page,
    {
      ...base,
      forge: { ...base.forge, runs: [run({ conclusion: 'success' })] },
    },
    { writes: true },
  );
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByRole('button', { name: 'Re-run all jobs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Re-run failed jobs' })).toHaveCount(0);
});
