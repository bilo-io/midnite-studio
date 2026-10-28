/**
 * review-dark — Mind ▸ Review (Studio's Notes ▸ Review tab): spaced practice
 * over the notes. Reveal a card's answer, grade it, the next card comes up.
 *
 * The e2e mock bridge has no `notes.reviewDue` / `notes.reviewGrade`, so an
 * init script adds them with a seeded deck.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { REPO_ID, roadmapFixtures } from '../fixtures/roadmap';

const PROBE = process.env['CAP_PROBE'];
const shot = async (page: Page, n: string) => {
  if (PROBE) await page.screenshot({ path: `${PROBE}/review-${n}.png` });
};

const NOW = Date.now();
const NOTES = [
  'git rebase --onto: replay only the commits after <upstream> onto a new base. Use it to lift a stacked branch off a squash-merged parent.',
  'The terminal broker’s socket name carries a build fingerprint, so a reinstall starts its own broker and the old one stays reachable as a legacy peer.',
  'All git parsing is NUL-delimited: -z plus %x00 separators. Branch names and commit subjects can contain spaces and newlines.',
  'Force-push is --force-with-lease=<ref>:<expect> only. A bare lease checks against a tracking ref a background fetch can refresh.',
  'B-tree vs LSM: B-trees update in place (fast reads), LSM trees append and compact (fast writes, read amplification).',
].map((body, i) => ({
  id: `note-${i + 1}`,
  repoId: REPO_ID,
  body,
  status: 'captured',
  done: false,
  createdAt: NOW - (i + 1) * 3_600_000 * 7,
  updatedAt: NOW - (i + 1) * 3_600_000 * 7,
  order: i,
}));

const CARDS = [
  ['What does git rebase --onto main feature-a feature-b do?', 'Replays only the commits on feature-b that are not on feature-a onto main.\nThe way to lift a stacked branch off a parent that was squash-merged.', false],
  ['Why is the terminal broker’s socket name keyed by a build fingerprint?', 'So a reinstall starts its own broker instead of attaching to the old bundle.\nThe previous broker stays reachable as a legacy peer until its sessions end.', true],
  ['Why does all git parsing here use -z and %x00?', 'Branch names and commit subjects can contain spaces and newlines.\nNUL is the one byte neither can hold.', false],
  ['Why only --force-with-lease=<ref>:<expect>, never a bare lease?', 'A bare lease compares against the local remote-tracking ref,\nwhich a background fetch can silently refresh into agreement.', false],
  ['B-tree or LSM tree for a write-heavy log?', 'LSM: writes append to a memtable and flush to sorted runs; compaction merges them.\nThe price is read and space amplification.', true],
  ['What does git reflog recover that git log cannot?', 'Commits no ref points at any more: after a reset, a rebase or a deleted branch.\nEntries expire after 90 days (30 if unreachable).', false],
  ['Big-O of a lookup in a balanced binary search tree?', 'O(log n): each comparison halves the remaining keys.', false],
  ['What does an IPC op return instead of throwing across the boundary?', 'A GitOpResult envelope: { ok: true } or { ok: false, kind: "conflict" | "error" }.\nA conflict is a normal outcome the UI renders.', true],
].map(([front, back, isNew], i) => ({ id: `card-${i + 1}`, noteId: `note-${(i % 5) + 1}`, front, back, isNew }));

function reviewInit(seed: { cards: unknown[]; total: number }): void {
  const w = window as unknown as { midniteStudio?: { notes?: Record<string, unknown> } };
  if (!w.midniteStudio?.notes) return;
  w.midniteStudio.notes['reviewDue'] = async () => ({ cards: seed.cards, total: seed.total });
  w.midniteStudio.notes['reviewGrade'] = async () => ({ ok: true });
}

async function open(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({ notes: NOTES } as never), { cspGuard: false });
  await page.addInitScript(reviewInit, { cards: CARDS, total: 46 });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Notes');
    await expect(page.getByTestId('notes-tab-review')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await expect(page.getByText(/git rebase --onto/).first()).toBeVisible({ timeout: 10_000 });
  // Open a note first, so the Notes tab is not the empty "Select a note" pane on camera.
  await page.getByText(/git rebase --onto/).first().click();
  await expect(page.getByText('Loading editor...').or(page.getByText('Loading editor…'))).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(600);
  await placeCursor(page, 900, 520);
  await settlePage(page, 900);
}

async function oneCard(page: Page, grade: 'again' | 'hard' | 'good' | 'easy', readMs: number, answerMs: number): Promise<void> {
  await page.waitForTimeout(readMs);
  await glideTo(page, page.getByTestId('review-reveal'), 380);
  await click(page);
  await expect(page.getByTestId('review-back')).toBeVisible();
  await page.waitForTimeout(answerMs);
  await glideTo(page, page.getByTestId(`review-grade-${grade}`), 380);
  await click(page);
}

test('review-dark', async ({ page }) => {
  await open(page);
  await shot(page, '0');
  const rec = PROBE ? null : new Recorder(page, 'review-dark');
  await rec?.start();
  await page.waitForTimeout(650);

  await glideTo(page, page.getByTestId('notes-tab-review'), 600);
  await click(page);
  await expect(page.getByTestId('review-front')).toBeVisible();
  await shot(page, '1');

  await oneCard(page, 'good', 700, 1300);
  await shot(page, '2');
  await oneCard(page, 'easy', 650, 1250);
  await oneCard(page, 'good', 600, 1200);
  await shot(page, '3');
  await oneCard(page, 'again', 550, 1100);
  await page.waitForTimeout(500);
  await glide(page, 820, 330, 700);
  await page.waitForTimeout(500);
  await shot(page, '4');
  await rec?.stop();
});
