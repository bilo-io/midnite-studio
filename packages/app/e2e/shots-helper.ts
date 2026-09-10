import { type Locator, type Page, type Route } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Shared fixture constants and helpers for the screenshot (shots) e2e suite.
 *
 * Provides reproducible commit history, author sets, date seeds, theme and motion toggles,
 * standard viewports, and standardized screenshot helpers to eliminate duplication across
 * all `*-shots.spec.ts` files.
 */

/* ─── Reproducible Seeds & Constants ───────────────────────────────────── */

export const REPRODUCIBLE_ISO_DATE = '2026-08-26T12:00:00Z';
export const REPRODUCIBLE_NOW_MS = Date.parse(REPRODUCIBLE_ISO_DATE);
export const REPRODUCIBLE_NOW_S = Math.floor(REPRODUCIBLE_NOW_MS / 1000);
export const DAY_S = 86_400;

export const REPRODUCIBLE_AUTHORS = [
  { name: 'Ada Lovelace', email: 'ada@example.com' },
  { name: 'Grace Hopper', email: 'grace@example.com' },
  { name: 'Bo Diddley', email: 'bo@example.com' },
] as const;

export const REPRODUCIBLE_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' as const },
};

export const REPRODUCIBLE_SUBJECTS = [
  'feat(phase-19): the dashboard becomes a board',
  'fix(graph): lane ink against a CVD-safe palette',
  'refactor(stats): one traversal, many aggregations',
  'chore(todo): claim Phase 19 Theme D',
  'feat(forge): gh issue list, behind the existing wrapper',
  'test(dashboard): the author filter scopes every widget',
] as const;

export const SHOT_VIEWPORTS = {
  default: { width: 1280, height: 800 },
  wide: { width: 1600, height: 1000 },
  ultraWide: { width: 1680, height: 1000 },
  board: { width: 1400, height: 900 },
  compact: { width: 1080, height: 800 },
  collapsed: { width: 900, height: 800 },
  tallPopover: { width: 780, height: 950 },
} as const;

export type ShotViewportName = keyof typeof SHOT_VIEWPORTS;

/* ─── History & Mock Generators ────────────────────────────────────────── */

export function mockSha(seed: string | number, char = 'a'): string {
  const prefix = String(seed);
  return prefix.padEnd(40, char);
}

export function buildReproducibleHistory(options?: {
  todayS?: number;
  daysBack?: number;
  maxActivity?: number;
}): {
  calendar: { date: string; count: number }[];
  activity: Array<{
    sha: string;
    at: number;
    authorName: string;
    authorEmail: string;
    subject: string;
  }>;
} {
  const today = options?.todayS ?? REPRODUCIBLE_NOW_S;
  const daysBack = options?.daysBack ?? 364;
  const maxActivity = options?.maxActivity ?? 60;

  const calendar: { date: string; count: number }[] = [];
  const activity: Array<{
    sha: string;
    at: number;
    authorName: string;
    authorEmail: string;
    subject: string;
  }> = [];

  for (let back = 0; back <= daysBack; back += 1) {
    const at = today - back * DAY_S;
    const date = new Date(at * 1000).toLocaleDateString('en-CA');
    const weekday = new Date(at * 1000).getUTCDay();

    const seasonal = Math.round(((daysBack - back) / daysBack) * 3);
    const weekly = weekday === 0 || weekday === 6 ? 0 : back % 5 === 0 ? 3 : 1;
    const count = Math.max(0, weekly + seasonal - (back % 11 === 0 ? 2 : 0));

    calendar.push({ date, count });
    for (let i = 0; i < count && activity.length < maxActivity; i += 1) {
      const person = REPRODUCIBLE_AUTHORS[(back + i) % REPRODUCIBLE_AUTHORS.length]!;
      activity.push({
        sha: `${back}${i}`.padStart(40, 'e'),
        at: at - i * 900,
        authorName: person.name,
        authorEmail: person.email,
        subject: REPRODUCIBLE_SUBJECTS[(back + i) % REPRODUCIBLE_SUBJECTS.length] ?? 'chore: tidy',
      });
    }
  }

  calendar.reverse();
  return { calendar, activity };
}

/* ─── Bridge Installation ──────────────────────────────────────────────── */

export async function installShotsBridge(
  page: Page,
  overrides?: Partial<MockFixtures>,
): Promise<void> {
  const data: MockFixtures = {
    ...fixtures,
    remotes: [REPRODUCIBLE_REMOTE],
    ...overrides,
  };
  await installMockBridge(page, data);
}

/* ─── Page State & Theme Helpers ───────────────────────────────────────── */

export async function setTheme(
  page: Page,
  theme: 'light' | 'dark',
  options: { settleMs?: number } = {},
): Promise<void> {
  if (theme === 'dark') {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
  } else {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
  if (options.settleMs) {
    await page.waitForTimeout(options.settleMs);
  }
}

export async function setReducedMotion(page: Page, reduced = true): Promise<void> {
  await page.evaluate(
    (m) => document.documentElement.setAttribute('data-motion', m),
    reduced ? 'reduced' : 'full',
  );
  /*
   * Phase 82 Theme D: `data-motion` is this app's OWN opt-out (every
   * `animate-…` Tailwind class and hand-rolled transition in `styles.css`
   * checks it), but 42 `@keyframes` blocks in that file are also gated
   * directly on the OS-level `@media (prefers-reduced-motion: reduce)`
   * query — CSS that never reads `data-motion` at all. Setting only the
   * attribute (as this helper did before Theme D) leaves every one of those
   * still animating during a screenshot, which is a live race against
   * whatever frame happens to be on screen when `.screenshot()` fires. The
   * two calls are complementary, not redundant, and a pixel-diff layer needs
   * both closed to be deterministic; the pre-existing `*-shots` specs only
   * ever needed the attribute because they mostly diff a single settled
   * frame by eye rather than a byte-exact baseline.
   */
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
}

/**
 * `document.fonts.ready` before any capture — closes the `font-display: swap`
 * race on `styles.css`'s `Quick Kiss` `@font-face`.
 *
 * `swap` means the very first frame renders in the fallback (`sans-serif`)
 * and swaps to the brand face the instant it finishes downloading — which,
 * on a cold Vite dev server or a cold CI cache, can land *during* the
 * `waitForTimeout` settle a shots spec already does, or after it. Either way
 * a screenshot taken before the swap and one taken after it differ in glyph
 * metrics for every element that uses `--font-brand` (the wordmark, `brand.tsx`),
 * which is real pixel drift with nothing wrong in the app. Awaiting the
 * fonts-ready promise (resolves once every `@font-face` the page requested has
 * either loaded or failed) makes the swap happen before capture rather than
 * during it, on every run.
 */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Freezes `Date.now()`/`new Date()` to the suite's one reproducible instant.
 *
 * Uses Playwright's `page.clock` API rather than an `addInitScript` `Date`
 * monkey-patch (the shape `seedRandom` below uses for `Math.random`) because
 * `clock.setFixedTime` freezes only the wall clock — `setTimeout`/
 * `setInterval` keep running normally, which matters here: several visual
 * surfaces (the typed screensaver word, toast auto-dismiss) rely on real
 * timers to reach the state being screenshotted, and a full fake-timer
 * install (`page.clock.install`) would require the spec to also drive those
 * timers forward by hand just to get a static frame.
 */
export async function freezeClock(page: Page, iso: string = REPRODUCIBLE_ISO_DATE): Promise<void> {
  await page.clock.setFixedTime(new Date(iso));
}

/**
 * Replaces `Math.random` with a seeded, deterministic generator (xorshift32)
 * before any page script runs.
 *
 * Two call sites read real randomness: `screensaver-stage.tsx`'s
 * `useTypedWord` picks its initial word index with `Math.random()` (and again
 * on every mode change), and `screensaver-words.ts`'s `nextRandomIndex` picks
 * the next word in the same way. Both are unseeded today, so two runs of a
 * screensaver capture show two different words — a real (if cosmetic) source
 * of visual-diff flake, not a bug in the component. Rather than thread a seed
 * parameter through production code (which the screensaver's callers have no
 * other reason to accept), the test-only fix overrides the one primitive both
 * call sites already share, via `page.addInitScript` — the same mechanism
 * `installMockBridge` uses to stand up `window.midniteStudio` before the
 * app's own scripts run, so it is in place before React's first render reads
 * it.
 *
 * `addInitScript` re-serialises this function with `toString()`, so — like
 * `buildMockBridge` (Phase 82 Theme B) — it must close over nothing but its
 * own parameter.
 */
export async function seedRandom(page: Page, seed = 42): Promise<void> {
  await page.addInitScript((s: number) => {
    let state = (s >>> 0) || 1;
    Math.random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    };
  }, seed);
}

/**
 * Bundles the three capture-time determinism fixes above — fonts settled,
 * OS-level reduced motion honoured, and the clock frozen — behind one call so
 * a visual spec cannot land while forgetting one of them. `seedRandom` is
 * deliberately NOT included: it must run via `addInitScript` before
 * `page.goto`, i.e. before `installMockBridge` if a spec needs both, while
 * this bundle is meant to run once navigation has settled, right before the
 * capture itself.
 */
export async function prepareForVisualCapture(page: Page): Promise<void> {
  await waitForFonts(page);
  await setReducedMotion(page);
  await freezeClock(page);
}

export async function setShotViewport(
  page: Page,
  viewport: ShotViewportName | { width: number; height: number },
): Promise<void> {
  const size = typeof viewport === 'string' ? SHOT_VIEWPORTS[viewport] : viewport;
  await page.setViewportSize(size);
}

export async function settle(page: Page, ms = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

export async function stubGravatars(page: Page): Promise<void> {
  await page.route('**/gravatar.com/**', (route: Route) => route.abort());
}

export async function mockWeatherApi(page: Page, location = 'London', temp = 18.4): Promise<void> {
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', (route: Route) =>
    route.fulfill({
      json: { results: [{ name: location, latitude: 51.5, longitude: -0.13, country: 'United Kingdom' }] },
    }),
  );
  await page.route('https://api.open-meteo.com/v1/forecast**', (route: Route) =>
    route.fulfill({ json: { current: { temperature_2m: temp, weather_code: 0 } } }),
  );
}

export async function seedForgeWritesConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { forgeWritesEnabled: true }, version: 2 }),
    );
  });
}

/* ─── Screenshot Path & Capture Helpers ────────────────────────────────── */

export function shotPath(outDir: string, filename: string): string {
  const cleanDir = outDir.replace(/\/+$/, '');
  const cleanFile = filename.endsWith('.png') ? filename : `${filename}.png`;
  return `${cleanDir}/${cleanFile}`;
}

export function createShotTaker(outDir: string, defaultOptions?: Parameters<Page['screenshot']>[0]) {
  return async function shoot(
    target: Page | Locator,
    filename: string,
    options?: Parameters<Page['screenshot']>[0],
  ): Promise<void> {
    const path = shotPath(outDir, filename);
    await target.screenshot({ path, ...defaultOptions, ...options });
  };
}

export { clickRailLink, fixtures, installMockBridge, type MockFixtures };
