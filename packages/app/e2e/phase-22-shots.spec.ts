import { test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 22 (Stash, the reflog, and writes you can take back) screenshots —
 * Themes B, E, F and G, the phase's visual surfaces.
 *
 * Not assertions — the themes' own specs (`repos-panel.test.tsx`,
 * `changes-panel.spec.ts`, `history.spec.ts`) own those. These exist to
 * produce the PNGs the PR embeds, from the same mocked bridge the rest of
 * the suite uses.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, so the normal suite stays
 * fast and does not rewrite committed images on every run.
 */
const OUT = '../../docs/screenshots/phase-22-stash-and-safety-net';
const SETTLE_MS = 300;

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

test.describe('Phase 22 screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('Theme B — Stashes in the sidebar', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        {
          selector: 'stash@{0}',
          sha: SHA_A,
          parents: [SHA_B],
          message: 'WIP on main: 1a2b3c4 refactor the sidebar tree',
          authoredAt: Math.floor(Date.now() / 1000) - 3600,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
        {
          selector: 'stash@{1}',
          sha: SHA_B,
          parents: [SHA_A, SHA_A, SHA_A],
          message: 'On feature/x: try a different layout',
          authoredAt: Math.floor(Date.now() / 1000) - 86400,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
      ],
    };
    await installMockBridge(page, data);
    await page.goto('/');
    await page.getByRole('heading', { name: 'Stashes' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/theme-b-sidebar-stashes.png` });
  });

  test('Theme E — Stash prompt from the Changes view', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      statusEntries: [
        { path: 'src/a.ts', origPath: null, staged: 'unmodified', unstaged: 'modified', conflicted: false, similarity: null },
        { path: 'src/b.ts', origPath: null, staged: 'unmodified', unstaged: 'modified', conflicted: false, similarity: null },
      ],
    };
    await installMockBridge(page, data);
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Changes' });
    await link.hover();
    await link.click();
    await page.getByRole('button', { name: 'Stash changes' }).click();
    await page.getByRole('dialog', { name: 'Stash changes' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/theme-e-changes-stash-prompt.png` });
  });

  test('Theme F — Git Safety settings page', async ({ page }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Git Safety' }).click();
    await page.getByText('Allow force-push (with lease)').first().waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/theme-f-git-safety-settings.png` });
  });

  test('Theme G — the Reflog tab', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      refs: [
        { name: 'main', fullName: 'refs/heads/main', kind: 'localBranch', sha: SHA_B, upstream: null, isHead: true, worktreePath: null },
      ],
      reflog: [
        {
          selector: `HEAD@{${Math.floor(Date.now() / 1000) - 60}}`,
          fullSelector: `HEAD@{${Math.floor(Date.now() / 1000) - 60}}`,
          sha: SHA_B,
          oldSha: SHA_A,
          subject: 'commit: tighten the reflog row layout',
          action: 'commit',
          at: Math.floor(Date.now() / 1000) - 60,
          author: 'Ada Lovelace',
        },
        {
          selector: `HEAD@{${Math.floor(Date.now() / 1000) - 3600}}`,
          fullSelector: `HEAD@{${Math.floor(Date.now() / 1000) - 3600}}`,
          sha: SHA_A,
          oldSha: null,
          subject: 'checkout: moving from feature/x to main',
          action: 'checkout',
          at: Math.floor(Date.now() / 1000) - 3600,
          author: 'Ada Lovelace',
        },
      ],
    };
    await installMockBridge(page, data);
    await page.goto('/');
    await page.getByRole('link', { name: 'History' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('tab', { name: 'Reflog' }).click();
    await page.getByRole('list', { name: 'Reflog' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/theme-g-reflog-tab.png` });
  });
});
