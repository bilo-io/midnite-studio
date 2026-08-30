import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Phase 27 Theme C: the status bar as a three-column grid, not `ml-auto`/
 * `mr-auto` flex siblings.
 *
 * The regression this guards against is a wrapper element around a segment
 * that renders `null` — it would still occupy a `gap-3` slot, so the left
 * zone's own footprint must not depend on what the right zone has to show.
 * `toHaveCount(0)` on the absent segments would pass even with that bug, so
 * this asserts the left zone's actual measured width instead.
 */
test('the left zone footprint is unaffected by what the right zone renders', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  const leftZone = page.getByTestId('status-bar-left');
  await expect(leftZone).toBeVisible();
  const emptyRightZoneWidth = (await leftZone.boundingBox())!.width;

  // Now give the right zone something to render: a failing diagnostics
  // candidate and a live metrics sample, so both of its segments mount.
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
    metricsSamples: [{ at: Date.now(), cpu: 42, memory: 55, gpu: 30, disk: 72 }],
  });
  await page.goto('/');
  await expect(page.getByTestId('monitor-cluster')).toBeVisible();
  const populatedRightZoneWidth = (await leftZone.boundingBox())!.width;

  expect(populatedRightZoneWidth).toBeCloseTo(emptyRightZoneWidth, 0);
});

const GITHUB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
  pushUrl: 'git@github.com:bilo-io/midnite-git.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
};

/** A checks-verdict segment for the checked-out branch (`main`, per the fixture). */
const FAILING_PR = {
  number: 7,
  title: 'x',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: 'failing',
  headBranch: 'main',
  author: 'me',
  url: 'https://example.com/pr/7',
  mergedAt: null,
  closedAt: null,
};

/**
 * Phase 27 Theme A: the bar is now a sibling of the content row, not the
 * column — its left edge must sit at the row's own left edge regardless of
 * the repositories panel's presence, state or width. Before the move this
 * would have drifted with the panel; after it, the row's edge does not move
 * at all, so the bar's left edge is provably constant across all three panel
 * states, not merely close to the aside's in one of them.
 */
test('the bar\'s left edge does not move with the repositories panel', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');

  const bar = page.getByTestId('status-bar');
  const aside = page.locator('aside[aria-label="Repositories"]');
  await expect(bar).toBeVisible();
  await expect(aside).toBeVisible();
  await page.waitForTimeout(250); // settle past the initial paint before measuring

  const openBox = (await bar.boundingBox())!;
  const asideBox = (await aside.boundingBox())!;
  expect(openBox.x).toBeLessThanOrEqual(asideBox.x + 1);

  // Shut the panel — the aside unmounts entirely, but the bar spans the row
  // regardless of what the row's other child is doing.
  await page.getByRole('button', { name: 'Toggle Repositories' }).click();
  await expect(aside).toHaveCount(0);
  await page.waitForTimeout(250); // the panel's 200ms reveal transition
  const shutBox = (await bar.boundingBox())!;
  expect(shutBox.x).toBeCloseTo(openBox.x, 0);

  // Re-open and drag the splitter to its widest — "mid-slide" is the same
  // invariant at any width in between, and the max is the sharpest case.
  await page.getByRole('button', { name: 'Toggle Repositories' }).click();
  await expect(aside).toBeVisible();
  await page.waitForTimeout(250);
  await page.getByRole('separator', { name: 'Resize repositories sidebar' }).focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(250);
  const resizedBox = (await bar.boundingBox())!;
  expect(resizedBox.x).toBeCloseTo(openBox.x, 0);
});

/**
 * Phase 27 Theme E: narrowing the bar itself (not the window) drives
 * `full → compact → collapsed`, and every segment that moved into the
 * overflow popover keeps its click behaviour — collapsing must not turn an
 * action into a label.
 *
 * Six segments (three toggles, diagnostics, monitor, checks-verdict) push the
 * `compact → collapsed` threshold up to ~790px of viewport width — safely
 * above `@bilo-io/shell`'s own `md:` (768px) breakpoint, so this never
 * contends with the shell's mobile chrome the way a narrower window would.
 */
test('narrowing drives compact then collapsed, and a collapsed segment still acts', async ({
  page,
}) => {
  await installMockBridge(page, {
    ...fixtures,
    remotes: [GITHUB_REMOTE],
    diagnostics: {
      candidates: [{ id: 'eslint', label: 'ESLint' }],
      trust: { state: 'trusted', command: null, trustedAt: Date.now() },
      result: { total: 3 },
    },
    metricsSamples: [{ at: Date.now(), cpu: 42, memory: 55, gpu: 30, disk: 72 }],
    forge: { pulls: [FAILING_PR] },
  });
  await page.goto('/');

  const bar = page.getByTestId('status-bar');
  await expect(bar).toHaveAttribute('data-density', 'full');
  await expect(page.getByTestId('status-segment-checks-verdict')).toBeVisible();

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(bar).toHaveAttribute('data-density', 'compact');
  // Icon-only: the toggles' trailing labels are hidden, not removed.
  await expect(page.getByRole('button', { name: 'Toggle Repositories' })).toBeVisible();

  await page.setViewportSize({ width: 780, height: 800 });
  await expect(bar).toHaveAttribute('data-density', 'collapsed');
  await expect(page.getByTestId('status-segment-checks-verdict')).toHaveCount(0);

  const trigger = page.getByTestId('status-overflow');
  await expect(trigger).toBeVisible();
  // `collapseFor` moves every STATUS_SEGMENTS entry into the popover at
  // `collapsed` density, not only the ones with something to say right now —
  // 12 today (three toggles, active-worktree, reattached-note, op-progress, in-progress,
  // agent-count, diagnostics, monitor, test-verdict, checks-verdict), even
  // though only seven of those render visible content in this fixture.
  await expect(trigger).toHaveAccessibleName('12 more');
  await trigger.click();

  const panel = page.getByTestId('status-overflow-panel');
  await expect(panel).toBeVisible();
  for (const name of ['Toggle Repositories', 'Toggle Terminal', 'Toggle Browser']) {
    await expect(panel.getByRole('button', { name })).toBeVisible();
  }
  await expect(panel.getByTestId('status-segment-checks-verdict')).toBeVisible();

  // Click-through: a segment collapsed into the popover keeps its own click
  // behaviour rather than becoming an inert label.
  await panel.getByRole('button', { name: 'Toggle Terminal' }).click();
  await expect(page.locator('[data-terminal-frame]')).toBeVisible();
});
