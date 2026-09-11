import { expect, test, type Page } from '@playwright/test';

import type { MockFixtures } from '../test-support/mock-bridge';
import { clickRailLink, fixtures, installMockBridge, waitForFonts } from './shots-helper';

/**
 * Phase 84 Theme K.8: under reduced motion, a cascading list's first frame
 * must be pixel-identical to its settled one — there is no animation to
 * skip partway through, only one that never starts at all.
 *
 * This is a same-run comparison, not a baseline diff against a committed
 * PNG: `toHaveScreenshot` (`e2e/visual/`) bakes in whatever font-rendering
 * quirks the machine that recorded the baseline had, which is exactly the
 * kind of flake a "does this differ *over time*" question does not need to
 * risk. Two captures of the same locator, taken a few hundred milliseconds
 * apart in the SAME page load, are either byte-identical or they are not —
 * no baseline, no drift.
 *
 * The Actions run list, not the repos sidebar: the sidebar's filter input
 * wears `@bilo-io/ui`'s `.gradient-border`, whose conic gradient spins on a
 * CSS custom-property animation upstream keeps running regardless of
 * `prefers-reduced-motion` (a pre-existing, out-of-scope upstream behaviour,
 * confirmed by hand while building this spec — not anything Theme K touches)
 * — a moving target this test would otherwise be measuring by accident. The
 * run list has no such decoration, and Theme K.2 wires its cascade the same
 * way every other list here does.
 *
 * `emulateMedia` runs BEFORE `page.goto`, not after: `useResolvedMotion`
 * (`store/appearance-store.ts`) reads `matchMedia('(prefers-reduced-motion:
 * reduce)')` synchronously on its very first render when the stored
 * preference is the default `'system'`, so the emulation has to be in place
 * before the app's first paint rather than racing a `change` event against
 * whatever the cascade already started doing.
 */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' as const },
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

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-studio': [] },
  forge: {
    cli: { reason: 'ready' },
    runs: [
      run({ id: '3', conclusion: 'success', createdAt: '2026-08-26T12:00:00Z', number: 130 }),
      run({ id: '2', conclusion: 'failure', createdAt: '2026-08-26T11:00:00Z', number: 129 }),
      run({ id: '1', conclusion: 'success', createdAt: '2026-08-26T10:00:00Z', number: 128 }),
    ],
    workflows: [{ id: '900', name: 'CI', path: '.github/workflows/ci.yml', state: 'active' }],
  },
};

async function openActions(page: Page, reducedMotion: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await installMockBridge(page, base);
  // Tall enough that the nav rail's Git group (Actions among it) is not
  // clipped below the fold — `clickRailLink` still finds and clicks an
  // off-screen link, but the app's own overflow at a cramped viewport isn't
  // this spec's concern.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Actions');
  await waitForFonts(page);
}

test('the Actions run list is pixel-identical immediately and after settling, under reduced motion', async ({
  page,
}) => {
  await openActions(page, true);

  const runList = page.getByRole('list', { name: 'Workflow runs' });
  await expect(runList).toBeVisible();
  // One short settle for the mocked bridge's own async data to land — this
  // test is about animation, not about the data arriving, and those two are
  // independent races under a mocked bridge.
  await page.waitForTimeout(300);

  const immediate = await runList.screenshot();
  // Comfortably past a full cascade's settle window (K.7's ~400ms budget)
  // even before accounting for reduced motion turning it off outright.
  await page.waitForTimeout(500);
  const settled = await runList.screenshot();

  expect(immediate.equals(settled)).toBe(true);
});

/**
 * The contrapositive, and not a redundant belt-and-braces check: without it,
 * a cascade that silently never armed in ANY mode (a broken `useCascadeReveal`
 * wiring, say) would make the reduced-motion test above pass for the wrong
 * reason — two identical screenshots because nothing ever animates, not
 * because reduced motion correctly turned an animation off. Proving full
 * motion actually DOES change the frame over time is what makes the reduced
 * case above a meaningful claim rather than a vacuous one.
 */
test('the same list visibly settles under full motion — the cascade this proves reduced motion turns off', async ({
  page,
}) => {
  await openActions(page, false);

  const runList = page.getByRole('list', { name: 'Workflow runs' });
  await expect(runList).toBeVisible();

  // Captured as early as possible, mid-cascade — the whole set arms on
  // reveal (K.1) and stays mid-flight for `(steps + 1) * stepMs + 250ms`.
  const midCascade = await runList.screenshot();
  await page.waitForTimeout(600); // past the ~484ms window for this list's row count.
  const settled = await runList.screenshot();

  expect(midCascade.equals(settled)).toBe(false);
});
