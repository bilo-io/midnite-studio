import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 76 Theme C — CSP and external navigation contract.
 *
 * Browser capability: real CSP headers (via the Vite dev-server middleware that
 * mirrors `installCsp`) and console observation. Electron's `will-navigate`
 * guard is covered in `packages/desktop/src/main/app-navigation.test.ts`; the
 * anchor case below mirrors that guard in-page because the functional e2e suite
 * does not launch Electron (Phase 55 precedent).
 */
test.describe('content security policy', () => {
  test('refuses a cross-origin injected image load', async ({ page }) => {
    await installMockBridge(page, fixtures, { cspGuard: false });
    await page.goto('/');

    await page.evaluate(() => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          event.violatedDirective,
        );
      });
    });

    await page.evaluate(() => {
      const img = document.createElement('img');
      // `img-src` allows `https:` but not plain `http:` — use the latter so CSP fires.
      img.src = 'http://example.invalid/x';
      document.body.appendChild(img);
    });

    await expect
      .poll(async () => {
        const violations = await page.evaluate(
          () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
        );
        return violations.some((directive) => directive.startsWith('img-src'));
      })
      .toBe(true);
  });

  test('external anchor click stays on the app document and delegates to openExternal', async ({
    page,
  }) => {
    await installMockBridge(page, fixtures, { cspGuard: false });
    await page.goto('/');

    await page.evaluate(() => {
      document.addEventListener(
        'click',
        (event) => {
          const anchor = (event.target as HTMLElement | null)?.closest('a');
          if (!anchor?.href) return;
          try {
            const target = new URL(anchor.href);
            if (target.origin === window.location.origin) return;
            if (target.protocol === 'http:' || target.protocol === 'https:') {
              event.preventDefault();
              void window.midniteStudio?.shell.openExternal({ url: anchor.href });
            }
          } catch {
            event.preventDefault();
          }
        },
        true,
      );

      const a = document.createElement('a');
      a.id = 'csp-ext';
      a.href = 'https://example.com';
      a.textContent = 'external';
      document.body.appendChild(a);
    });

    const before = page.url();
    await page.locator('#csp-ext').click();
    expect(page.url()).toBe(before);

    const external = await page.evaluate(
      () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
    );
    expect(external.some((url) => url.startsWith('https://example.com'))).toBe(true);
  });
});
