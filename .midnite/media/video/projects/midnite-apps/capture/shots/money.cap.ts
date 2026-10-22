/**
 * money-dark — the Money app's surface, Dashboard ▸ Finance: bank cards, assets,
 * allocation, the candle chart, watchlist and markets with sparklines, news.
 *
 * Prices come from the mock's seeded series (same symbol, same chart every run).
 * Its clock is fixed in early 2027, so the series, quotes and a short history of
 * buys are shifted onto today's date in-page; holdings, watchlist and headlines
 * are written here.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, smoothScrollEl } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

const HOLDINGS = [
  { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto' as const, quantity: 0.42 },
  { symbol: 'ETH', name: 'Ethereum', kind: 'crypto' as const, quantity: 3.1 },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock' as const, quantity: 24 },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock' as const, quantity: 12 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'etf' as const, quantity: 6 },
];
const WATCHLIST = ['NVDA', 'BTC', 'ETH', 'AAPL', 'TSLA', 'SOL'];
const HOUR = 3_600_000;
const NEWS = [
  { title: 'Chipmakers extend rally as data-centre orders beat forecasts', source: 'Reuters', h: 1.2 },
  { title: 'Bitcoin holds above key level as ETF inflows pick up again', source: 'CoinDesk', h: 2.6 },
  { title: 'Apple supplier signals stronger holiday-quarter demand', source: 'Bloomberg', h: 4.1 },
  { title: 'Treasury yields ease ahead of Thursday’s inflation print', source: 'Financial Times', h: 5.3 },
  { title: 'Ether network fees fall to a six-month low after upgrade', source: 'The Block', h: 7.8 },
  { title: 'Tesla shares swing as delivery estimates are revised', source: 'CNBC', h: 9.4 },
];

/** Shift the mock's fixed clock (2027-01-15) onto now, and give the portfolio a history. */
function patchMarkets(cfg: { now: number }): void {
  const MOCK_NOW = 1_800_000_000_000;
  const shift = cfg.now - MOCK_NOW;
  const w = window as unknown as { midniteStudio?: { markets: Record<string, (...a: unknown[]) => Promise<unknown>> } };
  const go = (): void => {
    const m = w.midniteStudio?.markets;
    if (!m) return void setTimeout(go, 0);
    const series = m['series']!.bind(m);
    m['series'] = async (...a: unknown[]) => {
      const r = (await series(...a)) as { value?: { series: Record<string, { candles: { t: number }[]; fetchedAt?: number }> } };
      for (const s of Object.values(r.value?.series ?? {})) {
        s.candles = s.candles.map((c) => ({ ...c, t: c.t + shift }));
        if (typeof s.fetchedAt === 'number') s.fetchedAt += shift;
      }
      return r;
    };
    const quotes = m['quotes']!.bind(m);
    m['quotes'] = async (...a: unknown[]) => {
      const r = (await quotes(...a)) as { value?: { quotes: Record<string, { t: number }> } };
      for (const q of Object.values(r.value?.quotes ?? {})) if (typeof q.t === 'number') q.t += shift;
      return r;
    };
    const portfolio = m['portfolio']!.bind(m);
    const DAY = 86_400_000;
    const tx = [
      { d: 2, symbol: 'NVDA', assetName: 'NVIDIA', assetKind: 'stock', quantity: 8, priceUsd: 131.4 },
      { d: 5, symbol: 'BTC', assetName: 'Bitcoin', assetKind: 'crypto', quantity: 0.12, priceUsd: 57_210 },
      { d: 9, symbol: 'ETH', assetName: 'Ethereum', assetKind: 'crypto', quantity: 1.1, priceUsd: 2_690 },
      { d: 13, symbol: 'SPY', assetName: 'SPDR S&P 500 ETF', assetKind: 'etf', quantity: 6, priceUsd: 571.2 },
      { d: 18, symbol: 'AAPL', assetName: 'Apple', assetKind: 'stock', quantity: 12, priceUsd: 176.8 },
      { d: 26, symbol: 'NVDA', assetName: 'NVIDIA', assetKind: 'stock', quantity: 16, priceUsd: 118.9 },
    ].map((t, i) => ({
      id: `tx-${i}`,
      ts: cfg.now - t.d * DAY - 3.5 * 3_600_000 * (i + 1),
      type: 'buy',
      currency: 'USD',
      fiatAmount: Math.round(t.quantity * t.priceUsd * 100) / 100,
      symbol: t.symbol,
      assetName: t.assetName,
      assetKind: t.assetKind,
      quantity: t.quantity,
      priceUsd: t.priceUsd,
      valueUsd: t.quantity * t.priceUsd,
    }));
    m['portfolio'] = async (...a: unknown[]) => {
      const r = (await portfolio(...a)) as { value?: { transactions: unknown[] } };
      if (r.value && r.value.transactions.length === 0) r.value.transactions = tx;
      return r;
    };
  };
  go();
}

async function openMoney(page: Page): Promise<void> {
  const now = Date.now();
  await installMockBridge(
    page,
    roadmapFixtures({
      markets: {
        balances: { USD: 4_820.5, EUR: 1_250, ZAR: 18_400 },
        holdings: HOLDINGS,
        watchlist: WATCHLIST,
        news: NEWS.map((n, i) => ({
          title: n.title,
          link: `https://news.example/${i}`,
          source: n.source,
          origin: n.source,
          publishedAt: now - n.h * HOUR,
        })),
      },
    } as never),
    { cspGuard: false },
  );
  await page.addInitScript(patchMarkets, { now });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await gotoView(page, 'Dashboard');
  await page.getByRole('tab', { name: /^Finance/ }).click();
  await expect(page.getByRole('list', { name: 'Watchlist assets' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Watchlist assets' }).getByText('NVIDIA').first()).toBeVisible();
  await page.waitForTimeout(2500);
  // Tag the board's own scroller, so the clip can scroll it without a wheel landing on the chart (which zooms).
  const room = await page.evaluate(() => {
    let el = document.querySelector('[aria-label="Watchlist assets"]')?.parentElement ?? null;
    while (el && !(el.scrollHeight > el.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    el?.setAttribute('data-cap-scroll', '');
    return el ? el.scrollHeight - el.clientHeight : -1;
  });
  console.log(`[money] board scroll room ${room}px`);
  await placeCursor(page, 760, 420);
  await settlePage(page, 1200);
}

test('money-dark', async ({ page }) => {
  await openMoney(page);
  const rec = new Recorder(page, 'money-dark');
  await rec.start();
  await page.waitForTimeout(650);

  // 0.7 → ~3.6 s: across the cards, assets and allocation.
  await glide(page, 300, 330, 800);
  await glide(page, 760, 300, 900);
  await glide(page, 1080, 330, 800);

  // ~3.6 → ~7 s: NVIDIA from the watchlist onto the chart, then the 1Y window.
  const watch = page.getByRole('list', { name: 'Watchlist assets' });
  await glideTo(page, watch.getByRole('button', { name: /^Show NVIDIA on the chart/ }).first(), 700);
  await click(page);
  await page.waitForTimeout(900);
  await glideTo(page, page.getByRole('radiogroup', { name: 'Timescale' }).getByRole('radio', { name: '1Y', exact: true }), 700);
  await click(page);
  await page.waitForTimeout(1100);

  // ~7 → ~9.5 s: chart type Area, hover the line.
  await glideTo(page, page.getByRole('radiogroup', { name: 'Chart type' }).getByRole('radio', { name: 'Area', exact: true }), 700);
  await click(page);
  await page.waitForTimeout(400);
  await glide(page, 520, 780, 700);
  await glide(page, 820, 760, 900);

  // ~9.5 → end: scroll the board down to the markets, transactions and headlines.
  await glide(page, 1200, 470, 500);
  await smoothScrollEl(page, '[data-cap-scroll]', 720, 1900);
  await page.waitForTimeout(300);
  await glide(page, 1150, 560, 900);
  await page.waitForTimeout(1100);
  await rec.stop();
});
