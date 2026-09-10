import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 29: a fullscreen slide deck, one press away, over markdown a surface
 * already has — Files preview and a PR description here (comment threads are
 * the same button, unexercised separately since the wiring is identical).
 *
 * Theme F adds the two later description-level surfaces (Issue detail,
 * release notes) and the one case a comment-list button needs: that clicking
 * it never reassigns `activeMarkdown` away from whichever description-level
 * surface actually claims the slot.
 *
 * Phase 82 Theme C wave 5 moved 4 of this file's original 7 tests to
 * `src/features/slides/slides-modal.bridge.test.tsx`, mounting `PresentButton`
 * + `SlidesModal` directly (Files preview stood in for by a small harness) —
 * the deck itself (cover, step reveal, navigation, the help overlay, Escape)
 * and presenting from the release-notes panel. **The 3 left here all stay
 * for the same reason**: each is about a *specific* surface (a PR description,
 * an issue body, a conversation comment) correctly deriving its own
 * `MarkdownSource` and, for description-level bodies, claiming
 * `activeMarkdown` — not about anything inside the deck itself, and Reviews/
 * Issues are other Phase 82 Theme C wave 5 batches' territory in this same
 * worktree, so re-deriving their chrome in the jsdom file would duplicate
 * work rather than add coverage.
 */

const PR_BODY = ['# Reviews page', '', '## Why', '', 'Reading a PR should not need a browser.'].join(
  '\n',
);

const reviewsFixtures: MockFixtures = {
  ...fixtures,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
      pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
      forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
    },
  ],
  statusEntries: [],
  forge: {
    cli: { reason: 'ready' },
    pulls: [
      {
        number: 42,
        title: 'Reviews page',
        state: 'open',
        isDraft: false,
        reviewDecision: 'APPROVED',
        checks: 'passing',
        headBranch: 'feature/reviews',
        author: 'bilo',
        url: 'https://github.com/bilo-io/midnite-studio/pull/42',
      },
    ],
    pullDetail: {
      '42': {
        body: PR_BODY,
        headSha: 'a'.repeat(40),
        baseBranch: 'main',
        additions: 1,
        deletions: 1,
        changedFiles: 1,
        mergeable: 'MERGEABLE',
      },
    },
  },
};

test('presenting from a PR description opens the same deck', async ({ page }) => {
  await installMockBridge(page, reviewsFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText('Reviews page', { exact: true }).click();
  // PRs open on Overview by default — the description is right there.
  await expect(
    page.getByRole('tabpanel', { name: 'Overview' }).getByText(/Reading a PR should not need/),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Present as slides' }).click();
  const deck = page.getByTestId('slides-deck');
  await expect(deck).toBeVisible();
  await expect(deck.getByRole('heading', { name: 'Reviews page' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(deck.getByRole('heading', { name: 'Why' })).toBeVisible();
  await expect(deck.getByText('Reading a PR should not need a browser.')).toBeVisible();
});

const ISSUE_BODY = ['# Bug report', '', 'Details of the **bug**.'].join('\n');

const issuesFixtures: MockFixtures = {
  ...fixtures,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
      pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
      forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
    },
  ],
  statusEntries: [],
  forge: {
    cli: { reason: 'ready' },
    issues: [
      {
        id: '',
        number: 9,
        title: 'Bug report',
        state: 'open',
        author: 'bilo',
        labels: [],
        assignees: [],
        createdAt: '2026-08-01T09:00:00Z',
        updatedAt: '2026-08-01T09:00:00Z',
        url: 'https://github.com/bilo-io/midnite-studio/issues/9',
        milestone: null,
      },
    ],
    issueDetail: { '9': { body: ISSUE_BODY } },
    issueComments: {
      '9': [
        {
          id: 'c1',
          kind: 'comment',
          author: 'someone',
          body: 'Reproduces here too, no heading in this one.',
          createdAt: '2026-08-02T09:00:00Z',
          url: '',
          reviewState: null,
        },
      ],
    },
  },
};

test('presenting from an Issue detail opens a deck whose cover title is the body’s h1', async ({ page }) => {
  await installMockBridge(page, issuesFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Issues');

  const issueDetail = page.getByRole('region', { name: 'Issue detail' });
  await expect(issueDetail.getByRole('heading', { level: 2 })).toContainText('Bug report');

  // The issue body's own button — first in DOM order, ahead of the
  // conversation's per-comment buttons below it.
  await issueDetail.getByRole('button', { name: 'Present as slides' }).first().click();
  const deck = page.getByTestId('slides-deck');
  await expect(deck).toBeVisible();
  await expect(deck.getByRole('heading', { name: 'Bug report' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('a conversation comment’s Present button opens a deck without changing markdown.presentAsSlides’s target', async ({
  page,
}) => {
  await installMockBridge(page, issuesFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Issues');

  const issueDetail = page.getByRole('region', { name: 'Issue detail' });
  await expect(issueDetail.getByRole('heading', { level: 2 })).toContainText('Bug report');

  // The comment's button (the second and last one on the page) opens a deck
  // over the comment's own body, not the issue's.
  const deck = page.getByTestId('slides-deck');
  await issueDetail.getByRole('button', { name: 'Present as slides' }).last().click();
  await expect(deck).toBeVisible();
  // A fresh deck opens with no step revealed yet (`INITIAL.reveal === 0`),
  // matching every other deck in this file.
  await page.keyboard.press('ArrowRight');
  await expect(deck.getByText('Reproduces here too, no heading in this one.')).toBeVisible();
  // The comment has no heading, so it parses to a single "Untitled" slide —
  // never the issue's own cover.
  await expect(deck.getByRole('heading', { name: 'Bug report' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(deck).toHaveCount(0);

  // Invoking the command afterwards must still target the issue body: the
  // comment's click never claimed `activeMarkdown` out from under it.
  await page.keyboard.press('Meta+k');
  await page.getByRole('combobox', { name: 'Command palette search' }).fill('Present as Slides');
  await page.keyboard.press('Enter');
  await expect(deck).toBeVisible();
  await expect(deck.getByRole('heading', { name: 'Bug report' })).toBeVisible();
});

