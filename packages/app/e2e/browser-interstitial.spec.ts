import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 117 Theme H — the certificate interstitial, against a real TLS failure.
 *
 * Browser capability that justifies this being Playwright and not vitest: real layout. The interstitial
 * must cover the whole pane (`absolute inset-0`) and sit above the address row's badge, which
 * `getBoundingClientRect` can prove and jsdom cannot. The failure it renders is also real: Chromium itself
 * refuses a self-signed `https://` server, and the spec reads that error back rather than inventing one.
 *
 * What this does NOT cover, and says so: under this setup the tab is not a `WebContentsView` (the bridge is
 * mocked, `mock-bridge.ts`'s `browser` mock), so Electron's `setCertificateVerifyProc`, the `did-fail-load`
 * mapping and `proceedSite` itself never run. The spec therefore takes Chromium's real error name and code
 * from a real failed navigation and delivers it as the `failed` event main would send. The verify proc and
 * the proceed handling are vitest (`browser-service.test.ts`, `site-verdict-state.test.ts`); a real
 * packaged-app pass through the badssl.com matrix stays on Phase 117's manual list.
 */

let server: Server;
let dir: string;
let port: number;
let opensslMissing = false;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mstudio-tls-'));
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
        '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')],
      { stdio: 'ignore' },
    );
  } catch {
    opensslMissing = true;
    return;
  }
  server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (_req, res) => {
    res.end('should never be seen');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function openBrowser(page: Page): Promise<void> {
  await page.locator('[data-testid="browser-toggle"]').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  await page.mouse.move(700, 400);
}

test('a real TLS failure becomes the interstitial, covering the pane, with no way past by default', async ({
  page,
  context,
}) => {
  test.skip(opensslMissing, 'openssl is not available to mint the self-signed certificate');
  const url = `https://localhost:${port}/`;

  // The real failure: Chromium, not the spec, rejects the certificate.
  const probe = await context.newPage();
  const failure = await probe.goto(url).then(
    () => null,
    (error: Error) => error.message,
  );
  await probe.close();
  expect(failure).toMatch(/net::ERR_CERT_[A-Z_]+/);
  const description = /net::(ERR_CERT_[A-Z_]+)/.exec(failure ?? '')![1]!;

  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await openBrowser(page);

  // The real navigation: the address bar commits the URL, the engine (mocked) answers with the failure.
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill(url);
  await address.press('Enter');
  // The engine (mocked) has created the tab; an event sent before that would have no tab to land on.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs().length))
    .toBeGreaterThan(0);
  await page.evaluate(
    ({ url, description }) => {
      const w = window as unknown as {
        __mstudioBrowserTabs: () => string[];
        __mstudioBrowserEvent: (e: unknown) => void;
      };
      const tabId = w.__mstudioBrowserTabs()[0];
      w.__mstudioBrowserEvent({ kind: 'navigated', tabId, url, canGoBack: false, canGoForward: false });
      w.__mstudioBrowserEvent({
        kind: 'failed',
        tabId,
        error: { code: -202, description, validatedUrl: url, reason: 'certificate' },
      });
    },
    { url, description },
  );

  const interstitial = page.getByTestId('browser-interstitial');
  await expect(interstitial).toBeVisible();
  await expect(interstitial).toHaveAttribute('data-reason', 'certificate');
  await expect(interstitial).toContainText('This connection is not private');
  await expect(interstitial).toContainText(description);

  // Real layout: the interstitial fills the pane body (its offset parent), edge to edge.
  const paneBox = (await interstitial.locator('..').boundingBox())!;
  const box = (await interstitial.boundingBox())!;
  expect(box.width).toBeGreaterThan(paneBox.width - 2);
  expect(box.height).toBeGreaterThan(paneBox.height - 2);
  expect(box.x).toBeGreaterThanOrEqual(paneBox.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);

  // The badge in the address field reads the same refusal as danger, above the pane, outside the interstitial.
  await expect(page.getByTestId('browser-site-badge')).toHaveAttribute('data-level', 'danger');

  // Default: no proceed button, and the page says how to turn one on.
  await expect(page.getByTestId('browser-interstitial-proceed')).toHaveCount(0);
  await expect(interstitial).toContainText('There is no way past this warning');
  await expect(page.getByTestId('browser-interstitial-back')).toBeVisible();
});
