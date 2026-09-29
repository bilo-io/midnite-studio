import { expect, test } from '@playwright/test';

import { openCiGraph } from './graph-ci-fixture';

/**
 * The CI column's lane connector, in a real layout.
 *
 * Browser capability: real layout / `getBoundingClientRect` and real CSS
 * stacking (`docs/TESTING.md`). jsdom can say the connector segment exists and
 * which element it sits in (`graph-row-ci.test.tsx`); only a browser can say it
 * actually reaches from the ref column's rule across the CI column into the
 * gutter, and that the status mark paints ON TOP of it — the whole point of
 * "the lines pass underneath".
 */
test('the ref connector runs underneath the CI mark, unbroken from chip to gutter', async ({ page }) => {
  await openCiGraph(page);

  const row = page.locator('[role="row"]').filter({ hasText: 'fix(forge): batch commit runs by sha' }).first();
  const segments = row.locator('[data-graph-connector]');
  await expect(segments).toHaveCount(2);
  const [rule, through] = [await segments.nth(0).boundingBox(), await segments.nth(1).boundingBox()];
  const cell = await row.locator('[data-graph-ci-cell]').boundingBox();
  const gutter = await row.locator('svg[width]').last().boundingBox();
  expect(rule && through && cell && gutter).toBeTruthy();

  // The CI segment picks up where the ref column's rule ends (no gap) and runs
  // to the column's right edge, where the gutter SVG's own segment takes over.
  expect(Math.abs(through!.x - (rule!.x + rule!.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(through!.x + through!.width - (cell!.x + cell!.width))).toBeLessThanOrEqual(1);
  expect(gutter!.x).toBeGreaterThanOrEqual(cell!.x + cell!.width);
  // Same height as the rule: one line, not two.
  expect(Math.abs(through!.y - rule!.y)).toBeLessThanOrEqual(1);

  // The mark sits on the line, and paints above it.
  const button = row.getByRole('button', { name: 'CI: failed — open run' });
  const box = (await button.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(centre.y).toBeGreaterThanOrEqual(through!.y - 1);
  expect(centre.y).toBeLessThanOrEqual(through!.y + through!.height + 1);
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
    centre,
  );
  expect(topmost).toBe('CI: failed — open run');

  // Clicking it opens that commit's run, on the failed one.
  await button.click();
  const modal = page.getByTestId('ci-run-modal');
  await expect(modal.getByRole('tab', { name: 'CI: Failed' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
