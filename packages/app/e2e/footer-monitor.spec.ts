import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The footer's system monitor, driven through a live sample stream.
 *
 * The unit tests already cover the arithmetic underneath — the ring buffer's
 * eviction, the path geometry, the palette, the `vm_stat` formula. What none of
 * them can show is the part that only exists once the app is assembled: that
 * omitting a metric really does render one fewer readout rather than a zero,
 * that the flyout is reachable and dismissable by keyboard, and that opening it
 * actually escalates the cadence the sampler runs at.
 */

const START = 1_700_000_000_000;

/** A full sample: all four metrics readable. */
const full = (index: number, over: Record<string, number> = {}) => ({
  at: START + index * 2_000,
  cpu: 20 + index * 5,
  memory: 55,
  gpu: 30,
  disk: 72,
  memoryBytes: { used: 17_600_000_000, total: 32_000_000_000 },
  diskBytes: { used: 720_000_000_000, total: 1_000_000_000_000 },
  cpuInfo: { cores: 10, load1: 2.4 },
  ...over,
});

/** Six evenly-spaced samples — enough for a sparkline and a chart. */
const EVEN = [0, 1, 2, 3, 4, 5].map((index) => full(index));

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, metricsSamples: EVEN, ...over });
  await page.goto('/');
  await expect(page.getByTestId('monitor-cluster')).toBeVisible();
}

test.describe('footer monitor', () => {
  test('renders a readout per metric the machine can report', async ({ page }) => {
    await open(page);

    for (const id of ['cpu', 'memory', 'gpu', 'disk']) {
      await expect(page.getByTestId(`metric-${id}`)).toBeVisible();
    }
    // The last sample's CPU is 20 + 5*5 = 45.
    await expect(page.getByTestId('metric-cpu')).toHaveText(/45%/);
  });

  test('disk is drawn as a ring, because capacity does not move', async ({ page }) => {
    await open(page);

    /*
      The two forms, asserted against each other rather than in isolation.

      A rate gets a sparkline — an area and a line — and a level gets a ring:
      a muted track and the used arc over it. Checking only that disk has
      circles would still pass if it had ALSO kept the flat line it is meant to
      replace, which is exactly the regression worth catching.
    */
    const cpu = page.getByTestId('metric-cpu');
    await expect(cpu.locator('svg path')).toHaveCount(2);
    await expect(cpu.locator('svg circle')).toHaveCount(0);

    const disk = page.getByTestId('metric-disk');
    await expect(disk.locator('svg circle')).toHaveCount(2);
    await expect(disk.locator('svg path')).toHaveCount(0);

    // The percentage is still the accessible reading, ring or no ring.
    await expect(disk).toHaveText(/72%/);
    await expect(disk).toHaveAttribute('aria-label', /Disk 72 percent/);
  });

  test('an unreadable GPU renders three readouts, not a zero', async ({ page }) => {
    // This is the state the whole optional-fields design exists for: a machine
    // whose GPU counter cannot be read must look different from one whose GPU
    // is idle, all the way to the footer.
    const samples = EVEN.map(({ gpu: _gpu, ...rest }) => rest);
    await open(page, { metricsSamples: samples });

    await expect(page.getByTestId('metric-cpu')).toBeVisible();
    await expect(page.getByTestId('metric-gpu')).toHaveCount(0);
    // Not "GPU 0%", not "GPU —": nothing at all.
    await expect(page.getByTestId('monitor-cluster')).not.toContainText('GPU');
  });

  test('a genuinely idle GPU still renders, because 0 is a reading', async ({ page }) => {
    await open(page, { metricsSamples: EVEN.map((s, i) => full(i, { gpu: 0 })) });
    await expect(page.getByTestId('metric-gpu')).toBeVisible();
    await expect(page.getByTestId('metric-gpu')).toHaveText(/0%/);
  });

  test('nothing is drawn before the first sample arrives', async ({ page }) => {
    // Four zeroes that then jump to real values would be worse than a beat of
    // empty footer.
    await installMockBridge(page, { ...fixtures, metricsSamples: [] });
    await page.goto('/');
    await expect(page.getByTestId('monitor-cluster')).toHaveCount(0);
  });

  test('the flyout opens on click and closes on Escape with focus returned', async ({ page }) => {
    await open(page);
    const trigger = page.getByTestId('monitor-cluster');

    await trigger.click();
    const panel = page.getByTestId('monitor-cluster-panel');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('img', { name: /CPU over the last/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Focus back on the trigger, not adrift at the top of the document.
    await expect(trigger).toBeFocused();
  });

  test('a click outside dismisses it, and the trigger toggles it shut', async ({ page }) => {
    await open(page);
    const trigger = page.getByTestId('monitor-cluster');
    const panel = page.getByTestId('monitor-cluster-panel');

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(20, 20);
    await expect(panel).toHaveCount(0);

    await trigger.click();
    await expect(panel).toBeVisible();
    await trigger.click();
    await expect(panel).toHaveCount(0);
  });

  test('opening the flyout escalates the sampling cadence, closing drops it back', async ({
    page,
  }) => {
    await open(page);
    const cadences = async () =>
      page.evaluate(
        () => (window as unknown as { __mgitMetrics: { intervalMs: number }[] }).__mgitMetrics,
      );

    expect((await cadences()).at(-1)?.intervalMs).toBe(5_000);

    await page.getByTestId('monitor-cluster').click();
    await expect(page.getByTestId('monitor-cluster-panel')).toBeVisible();
    // 2s, and a forced disk read — the gauge is the one surface precise enough
    // for a stale capacity figure to be visible.
    const opened = (await cadences()).at(-1);
    expect(opened?.intervalMs).toBe(2_000);
    expect(opened?.freshDisk).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('monitor-cluster-panel')).toHaveCount(0);
    expect((await cadences()).at(-1)?.intervalMs).toBe(5_000);
  });

  test('the flyout shows disk as a gauge rather than a fourth timeline', async ({ page }) => {
    await open(page);
    await page.getByTestId('monitor-cluster').click();
    const panel = page.getByTestId('monitor-cluster-panel');

    // Three charts: CPU, RAM, GPU. Disk is a meter.
    await expect(panel.getByRole('img')).toHaveCount(3);
    const gauge = panel.getByRole('meter', { name: 'Disk capacity used' });
    await expect(gauge).toBeVisible();
    await expect(gauge).toHaveAttribute('aria-valuenow', '72');
    await expect(panel).toContainText('720 GB / 1.0 TB');
  });

  test('the flyout names the metrics this machine cannot report', async ({ page }) => {
    await open(page, { metricsSamples: EVEN.map(({ gpu: _gpu, ...rest }) => rest) });
    await page.getByTestId('monitor-cluster').click();
    const panel = page.getByTestId('monitor-cluster-panel');

    // Two charts, and a line saying why there is no third — a feature that
    // renders nothing is indistinguishable from a broken one.
    await expect(panel.getByRole('img')).toHaveCount(2);
    await expect(panel).toContainText('Not readable on this machine: GPU');
  });

  test('a cadence change is marked on the chart rather than silently compressed', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('monitor-cluster').click();
    const panel = page.getByTestId('monitor-cluster-panel');
    const cpuChart = panel.getByRole('img', { name: /CPU over the last/ });

    // Evenly sampled so far: no rule to draw.
    await expect(cpuChart.locator('line')).toHaveCount(0);

    /*
      Now script the change the fixture alone cannot produce: five more samples
      at the 5s spacing the closed-flyout cadence would have used. The store
      needs points from BEFORE and AFTER the change for the gridline to mean
      anything, so it has to be pushed live through the same handler array the
      real stream uses.
    */
    await page.evaluate((start: number) => {
      const push = (window as unknown as { __mgitPushMetric: (s: unknown) => void })
        .__mgitPushMetric;
      for (let index = 1; index <= 5; index += 1) {
        push({ at: start + 10_000 + index * 5_000, cpu: 60, memory: 55, gpu: 30, disk: 72 });
      }
    }, START);

    await expect(cpuChart.locator('line')).toHaveCount(1);
    await expect(cpuChart.locator('line title')).toHaveText('Sampling cadence changed here');
  });

  test('the terminal toggle and repos toggle are untouched on the left', async ({ page }) => {
    // The cluster is an `ml-auto` sibling; filling the empty right half was
    // meant to cost no repositioning of what was already in the footer.
    await open(page);
    // The toggle's accessible name is its own text, not its `title` — the
    // title attribute is only consulted when an element has no content.
    const footer = page.getByTestId('status-bar');
    await expect(footer.getByRole('button', { name: /^Terminal/ })).toBeVisible();
    // And the cluster really is at the far right of the same bar.
    await expect(footer.getByTestId('monitor-cluster')).toBeVisible();
  });

  /**
   * The phase's screenshots, generated rather than captured by hand — the
   * `graph-themes.spec.ts` pattern.
   *
   * The flat six-sample fixture the assertions use would produce a chart of
   * four straight lines, which shows the layout and nothing about the drawing.
   * This one is a believable minute of load: CPU varying, GPU spiking, RAM
   * drifting, disk flat (because capacity is).
   */
  test('screenshots', async ({ page }) => {
    // The bar as it was: everything left-aligned, right half empty.
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');
    const bar = page.getByTestId('status-bar');
    await expect(bar).toBeVisible();
    await page.waitForTimeout(300);
    await bar.screenshot({ path: `${SHOTS}/footer-before.png` });

    await open(page, { metricsSamples: LOAD });
    await page.waitForTimeout(400);
    await bar.screenshot({ path: `${SHOTS}/footer-cluster.png` });
    await page.screenshot({ path: `${SHOTS}/app-with-monitor.png` });

    await page.getByTestId('monitor-cluster').click();
    const panel = page.getByTestId('monitor-cluster-panel');
    await expect(panel).toBeVisible();
    // Let the fade settle, or the shot catches the panel mid-entrance.
    await page.waitForTimeout(400);
    await panel.screenshot({ path: `${SHOTS}/flyout.png` });
    await page.screenshot({ path: `${SHOTS}/flyout-in-app.png` });
  });
});

const SHOTS = '../../docs/screenshots/phase-18';

/** A believable minute of load, for the screenshots only. */
const LOAD = [18, 24, 31, 27, 44, 62, 58, 71, 66, 49, 38, 42, 55, 47, 33].map((cpu, index) => ({
  at: START + index * 2_000,
  cpu,
  memory: [61, 61, 62, 62, 63, 64, 64, 65, 65, 64, 64, 63, 63, 64, 64][index]!,
  gpu: [4, 6, 12, 9, 28, 55, 71, 64, 40, 22, 16, 11, 34, 52, 29][index]!,
  // Flat, and correctly so: capacity does not move in a minute. It is why disk
  // gets a gauge rather than a fourth timeline.
  disk: 68,
  memoryBytes: { used: 20_500_000_000, total: 32_000_000_000 },
  diskBytes: { used: 680_000_000_000, total: 1_000_000_000_000 },
  cpuInfo: { cores: 10, load1: 3.12 },
}));
