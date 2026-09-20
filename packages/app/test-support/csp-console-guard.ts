import type { Page } from '@playwright/test';

const CSP_VIOLATION =
  /Refused to (?:load|connect|execute|frame|navigate|run).+Content Security Policy/i;

/** Fail the test on CSP violations — console errors and `securitypolicyviolation` events. */
export async function installCspConsoleGuard(page: Page): Promise<void> {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CSP_VIOLATION.test(text)) {
      throw new Error(`CSP violation in e2e: ${text}`);
    }
  });

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      throw new Error(
        `CSP violation in e2e: ${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });
}
