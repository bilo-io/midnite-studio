import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 117 Theme H — the permission bar, beside a real `getUserMedia`.
 *
 * Browser capabilities that justify this being Playwright and not vitest: real `navigator.mediaDevices`
 * (the platform behaviour the bar exists to arbitrate — an ungranted call really rejects, a granted one
 * really yields a live track from a fake device) and real layout (the bar is pinned to the top edge of the
 * pane body, edge to edge, above the page).
 *
 * What this does NOT cover, and says so: under this setup the tab is not a `WebContentsView`, so Electron's
 * `setPermissionRequestHandler` never sees the page's call and nothing in main answers the bar. The spec
 * stands in for main on both sides: it delivers the `permission-request` event the handler would send, and
 * when the bar's Allow reaches `respondPermission` it applies the grant with `context.grantPermissions`,
 * which is what main's grant does for the page. So the chain is real at both ends (a real call denied, then
 * a real call granted) with the app's own bar in the middle, but the link between the call and the event is
 * the spec. That link — deny-all plus the prompt, the per-origin grant file, 1/min rate limiting — is
 * vitest (`browser-security.test.ts`, `permission-grant-store.test.ts`, `browser-service.test.ts`); a
 * packaged-app camera/microphone pass stays on Phase 117's manual list.
 */
test.use({
  // `channel: 'chromium'` is the full browser in its new headless mode: the default headless shell has no
  // permission machinery and answers `NotSupportedError` to every call, granted or not.
  launchOptions: { channel: 'chromium', args: ['--use-fake-device-for-media-stream'] },
});

const PROBE_PATH = '/__media-probe';

async function openBrowser(page: Page): Promise<void> {
  await page.locator('[data-testid="browser-toggle"]').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  await page.mouse.move(700, 400);
}

/** A real `getUserMedia({ audio })` on a real page; resolves to how it ended. */
async function askForMicrophone(probe: Page): Promise<{ ok: true; tracks: number } | { ok: false; name: string }> {
  return probe.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks().filter((track) => track.readyState === 'live').length;
      stream.getTracks().forEach((track) => track.stop());
      return { ok: true as const, tracks };
    } catch (error) {
      return { ok: false as const, name: (error as Error).name };
    }
  });
}

test('the bar asks first, Allow lets a real getUserMedia through, Block leaves it rejected', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const probe = await context.newPage();
  await probe.route(`${origin}${PROBE_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
  );
  await probe.goto(`${origin}${PROBE_PATH}`);

  // Nothing granted: the platform refuses the real call, which is the deny-all the bar sits in front of.
  expect(await askForMicrophone(probe)).toEqual({ ok: false, name: 'NotAllowedError' });

  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await openBrowser(page);
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://meet.example');
  await address.press('Enter');
  // The engine (mocked) has created the tab; an event sent before that would have no tab to land on.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs().length))
    .toBeGreaterThan(0);

  // Record what the bar answers, and let Allow do what main's grant does for the page.
  await page.exposeFunction('__mstudioApplyGrant', async (decision: string) => {
    if (decision === 'allow') await context.grantPermissions(['microphone'], { origin });
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      midniteStudio: { browser: { respondPermission: (r: { requestId: string; decision: string }) => void } };
      __mstudioApplyGrant: (decision: string) => Promise<void>;
      __decisions: Array<{ requestId: string; decision: string }>;
    };
    w.__decisions = [];
    const original = w.midniteStudio.browser.respondPermission;
    w.midniteStudio.browser.respondPermission = (response) => {
      w.__decisions.push(response);
      void w.__mstudioApplyGrant(response.decision);
      return original(response);
    };
  });

  const request = (requestId: string) =>
    page.evaluate((requestId) => {
      const w = window as unknown as {
        __mstudioBrowserTabs: () => string[];
        __mstudioBrowserEvent: (e: unknown) => void;
      };
      w.__mstudioBrowserEvent({
        kind: 'permission-request',
        tabId: w.__mstudioBrowserTabs()[0],
        requestId,
        origin: 'https://meet.example',
        permission: 'microphone',
        displayName: 'meet.example',
      });
    }, requestId);

  // Block first: the bar closes, the answer is `deny`, and the real call is still rejected.
  await request('req-block');
  const bar = page.getByTestId('browser-permission-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('meet.example');
  await expect(bar).toContainText('wants to use your microphone');
  await bar.getByRole('button', { name: 'Block' }).click();
  await expect(bar).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __decisions: unknown[] }).__decisions)).toEqual([
    { requestId: 'req-block', decision: 'deny' },
  ]);
  expect(await askForMicrophone(probe)).toEqual({ ok: false, name: 'NotAllowedError' });

  // Allow: real layout of the bar first, then the real call succeeds with a live track.
  await request('req-allow');
  await expect(bar).toBeVisible();
  const body = (await bar.locator('..').boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(Math.abs(barBox.y - body.y)).toBeLessThan(2);
  expect(barBox.width).toBeGreaterThan(body.width - 2);
  await bar.getByRole('button', { name: 'Allow' }).click();
  await expect(bar).toHaveCount(0);
  await expect.poll(async () => (await askForMicrophone(probe)).ok).toBe(true);
  expect(await askForMicrophone(probe)).toEqual({ ok: true, tracks: 1 });
});
