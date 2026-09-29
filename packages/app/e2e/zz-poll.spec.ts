import { test } from '@playwright/test';
import { ciFixtures, openCiGraph } from './graph-ci-fixture';
test.setTimeout(120_000);
test('poll gate', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __ciCalls: number }).__ciCalls = 0;
    const iv = setInterval(() => {
      const w = window as unknown as { midniteStudio?: { forge?: { commitRuns?: (r: unknown) => unknown } }; __wrapped?: boolean; __ciCalls: number };
      const f = w.midniteStudio?.forge;
      if (f?.commitRuns && !w.__wrapped) {
        const orig = f.commitRuns;
        f.commitRuns = (r: unknown) => { w.__ciCalls += 1; return orig(r); };
        w.__wrapped = true;
        clearInterval(iv);
      }
    }, 1);
  });
  await openCiGraph(page, ciFixtures);
  const calls = () => page.evaluate(() => (window as unknown as { __ciCalls: number }).__ciCalls);
  await page.waitForTimeout(2000);
  console.log('RESULT after load', await calls());
  await page.waitForTimeout(32_000);
  console.log('RESULT focused +32s', await calls());
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const atBlur = await calls();
  await page.waitForTimeout(32_000);
  console.log('RESULT blurred +32s', atBlur, '->', await calls());
  console.log('RESULT attr', await page.evaluate(() => document.documentElement.dataset['windowFocused']));
});
