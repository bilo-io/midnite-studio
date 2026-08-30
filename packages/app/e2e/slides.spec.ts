import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 29: a fullscreen slide deck, one press away, over markdown a surface
 * already has — Files preview and a PR description here (comment threads are
 * the same button, unexercised separately since the wiring is identical).
 */

const README = [
  '# Midnite Slides',
  '',
  'A short deck to present.',
  '',
  '## First point',
  '',
  '- alpha',
  '- beta',
  '',
  '## Second point',
  '',
  'Some closing text.',
].join('\n');

const slidesFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [{ name: 'README.md', kind: 'file', size: README.length, isIgnored: false }],
  },
  fsFiles: {
    'repo:README.md': { kind: 'text', content: README, size: README.length },
  },
};

async function openReadmeDeck(page: Page) {
  await installMockBridge(page, slidesFixtures);
  await page.goto('/');
  await page.getByRole('link', { name: 'Files' }).click();
  await page.getByRole('treeitem', { name: /README\.md/ }).click();
  await expect(page.getByText('A short deck to present.')).toBeVisible();
  await page.getByRole('button', { name: 'Present as slides' }).click();
  const deck = page.getByTestId('slides-deck');
  await expect(deck).toBeVisible();
  return deck;
}

test('presenting from Files: cover slide, step reveal, and slide navigation', async ({ page }) => {
  const deck = await openReadmeDeck(page);

  // Cover slide (the h1), title fully typed before we assert it. Scoped to
  // the deck: the file preview underneath still renders the same "# Midnite
  // Slides" heading, covered by the overlay but present in the DOM.
  await expect(deck.getByRole('heading', { name: 'Midnite Slides' })).toBeVisible();
  await expect(deck.getByText('1 / 3')).toBeVisible();

  // Advance into the cover's one step, then to the next slide.
  await page.keyboard.press('ArrowRight');
  await expect(deck.getByText('A short deck to present.')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(deck.getByRole('heading', { name: 'First point' })).toBeVisible();
  await expect(deck.getByText('2 / 3')).toBeVisible();

  // Steps reveal one at a time.
  await expect(deck.getByText('alpha')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(deck.getByText('alpha')).toBeVisible();
  await expect(deck.getByText('beta')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(deck.getByText('beta')).toBeVisible();

  // Backward navigation un-reveals before moving to the previous slide.
  await page.keyboard.press('ArrowLeft');
  await expect(deck.getByText('beta')).toHaveCount(0);
  await expect(deck.getByText('alpha')).toBeVisible();

  // Home/End jump straight to the first/last slide.
  await page.keyboard.press('End');
  await expect(deck.getByRole('heading', { name: 'Second point' })).toBeVisible();
  await expect(deck.getByText('Some closing text.')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(deck.getByRole('heading', { name: 'Midnite Slides' })).toBeVisible();

  // The slide-position rail jumps directly to a slide.
  await deck.getByRole('button', { name: 'Slide 3 of 3' }).click();
  await expect(deck.getByRole('heading', { name: 'Second point' })).toBeVisible();
});

test('the help overlay toggles with ? and Escape, without closing the deck', async ({ page }) => {
  await openReadmeDeck(page);

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toHaveCount(0);
  await expect(page.getByTestId('slides-deck')).toBeVisible();
});

test('Escape closes the deck and returns to the file preview', async ({ page }) => {
  await openReadmeDeck(page);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('slides-deck')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Present as slides' })).toBeVisible();
});

const PR_BODY = ['# Reviews page', '', '## Why', '', 'Reading a PR should not need a browser.'].join(
  '\n',
);

const reviewsFixtures: MockFixtures = {
  ...fixtures,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
      pushUrl: 'git@github.com:bilo-io/midnite-git.git',
      forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
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
        url: 'https://github.com/bilo-io/midnite-git/pull/42',
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
