
import { expect, test, type Page } from '@playwright/test';

import { installSuiteBridge, STARTUP_EMPTY_ANSWERS, STARTUP_SEEDED_ANSWERS, SUITE_APP_URLS } from '../../test-support/suite-bridge';

/**
 * Midnite Startup in its own Vite server (Phase 130 Theme G).
 *
 * Browser capability: real layout. The roadmap timeline draws its dependency arrows in an SVG stretched with
 * `preserveAspectRatio="none"` over absolutely positioned bars, so whether an arrow starts on its
 * dependency's right edge and ends on the dependent's left edge is only visible through
 * `getBoundingClientRect` and the SVG's screen matrix. jsdom reports every box as 0x0. Everything else
 * about the views (ops, refusals, copy) is vitest in `packages/modules/startup`.
 */

const pageErrors: string[] = [];

async function open(page: Page, answers: Record<string, unknown>): Promise<void> {
  await installSuiteBridge(page, { frameless: true, answers });
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(SUITE_APP_URLS.startup);
  await expect(page.locator('.app-shell[data-app="startup"]')).toBeVisible();
}

const goto = (page: Page, view: string) => page.getByRole('complementary', { name: 'Views' }).locator(`a[data-view="${view}"]`).click();

test.describe('Midnite Startup', () => {
  test.beforeEach(() => {
    pageErrors.length = 0;
  });
  test.afterEach(() => {
    expect(pageErrors).toEqual([]);
  });

  test('asks to set up the company before anything else', async ({ page }) => {
    await open(page, STARTUP_EMPTY_ANSWERS);
    await expect(page.getByText('Set up your company').first()).toBeVisible();
    await goto(page, 'startup.roadmap');
    await expect(page.getByText('Set up your company').first()).toBeVisible();
  });

  test('roadmap timeline: each dependency arrow joins its two bars edge to edge', async ({ page }) => {
    await open(page, STARTUP_SEEDED_ANSWERS);
    await goto(page, 'startup.overview');
    await goto(page, 'startup.roadmap');
    await page.getByRole('button', { name: 'Timeline' }).click();
    const timeline = page.getByTestId('roadmap-timeline');
    await expect(timeline).toBeVisible();

    const edges = await timeline.locator('[data-edge]').evaluateAll((paths) =>
      paths.map((node) => {
        const path = node as unknown as SVGPathElement;
        const [from, to] = (path.getAttribute('data-edge') ?? '').split('->');
        const matrix = path.ownerSVGElement!.getScreenCTM()!;
        const point = (at: number) => {
          const p = path.getPointAtLength(at);
          return { x: p.x * matrix.a + p.y * matrix.c + matrix.e, y: p.x * matrix.b + p.y * matrix.d + matrix.f };
        };
        const box = (id: string) => document.querySelector(`[data-bar="${id}"]`)!.getBoundingClientRect();
        return { start: point(0), end: point(path.getTotalLength()), from: box(from!), to: box(to!) };
      }),
    );
    expect(edges).toHaveLength(3);
    for (const e of edges) {
      expect(Math.abs(e.start.x - e.from.right)).toBeLessThanOrEqual(2);
      expect(e.start.y).toBeGreaterThanOrEqual(e.from.top - 2);
      expect(e.start.y).toBeLessThanOrEqual(e.from.bottom + 2);
      expect(Math.abs(e.end.x - e.to.left)).toBeLessThanOrEqual(2);
      expect(e.end.y).toBeGreaterThanOrEqual(e.to.top - 2);
      expect(e.end.y).toBeLessThanOrEqual(e.to.bottom + 2);
    }
  });

  test('runway with two scenarios and an invoice draft, for the review shots', async ({ page }) => {
    await open(page, STARTUP_SEEDED_ANSWERS);
    await goto(page, 'startup.runway');
    await expect(page.getByRole('img', { name: 'Cash by month' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Lean' })).toBeVisible();
    await goto(page, 'startup.invoices');
    await expect(page.getByText('Globex').first()).toBeVisible();
  });
});
