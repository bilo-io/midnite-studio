import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, prepareForVisualCapture } from '../shots-helper';

/**
 * The Browser address field's site badge, in its three states (Phase 117 Theme H).
 *
 * `browser-pane.test.tsx` proves the badge's `data-level` and its words for each verdict; it cannot prove
 * the quiet shield reads as quiet, or that caution is amber and danger red against the address field's own
 * background — which is what a locator crop closes. Crops the badge only, never the page.
 */
async function showVerdict(page: Page, url: string, patch: Record<string, unknown>): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill(url);
  await address.press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs().length))
    .toBeGreaterThan(0);
  await page.evaluate(
    ({ url, patch }) => {
      const w = window as unknown as {
        __mstudioBrowserTabs: () => string[];
        __mstudioBrowserEvent: (e: unknown) => void;
      };
      const tabId = w.__mstudioBrowserTabs()[0];
      const parsed = new URL(url);
      w.__mstudioBrowserEvent({ kind: 'navigated', tabId, url, canGoBack: false, canGoForward: false });
      w.__mstudioBrowserEvent({
        kind: 'verdict',
        tabId,
        verdict: {
          origin: parsed.origin,
          displayHost: parsed.hostname,
          tls: parsed.protocol === 'https:' ? 'ok' : 'none',
          bypassed: false,
          mixedContent: false,
          mixedContentUrls: [],
          lookalike: null,
          knownBad: null,
          reputation: 'unavailable',
          vulnerableLibs: [],
          insecureForm: false,
          credentialRisk: null,
          trackersBlocked: 0,
          trackerHosts: [],
          ...patch,
        },
      });
    },
    { url, patch },
  );
  await page.mouse.move(0, 0);
  await prepareForVisualCapture(page);
}

test('ok: the quiet shield', async ({ page }) => {
  await showVerdict(page, 'https://example.com/', {});
  const badge = page.getByTestId('browser-site-badge');
  await expect(badge).toHaveAttribute('data-level', 'ok');
  await expect(badge).toHaveScreenshot('site-badge-ok.png');
});

test('caution: Not secure on plain http', async ({ page }) => {
  await showVerdict(page, 'http://example.com/', {});
  const badge = page.getByTestId('browser-site-badge');
  await expect(badge).toHaveAttribute('data-level', 'caution');
  await expect(badge).toHaveScreenshot('site-badge-caution.png');
});

test('danger: Certificate error', async ({ page }) => {
  await showVerdict(page, 'https://expired.example/', { tls: 'error', tlsError: 'net::ERR_CERT_DATE_INVALID', bypassed: true });
  const badge = page.getByTestId('browser-site-badge');
  await expect(badge).toHaveAttribute('data-level', 'danger');
  await expect(badge).toHaveScreenshot('site-badge-danger.png');
});
