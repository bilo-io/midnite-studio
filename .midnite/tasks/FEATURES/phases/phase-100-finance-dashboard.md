# Phase 100 — Finance dashboard

A third default dashboard beside Git and Agents: live market data, a simulated multi-currency
portfolio, and eight moveable, resizable cards. Built on the multiple-dashboards framework
(`dashboard-store.ts`, the widget registry, the add-widget picker) rather than beside it — every
Finance card is an ordinary widget, so it can be added to any dashboard.

> **Not the status-bar ticker.** `finance.*` (Phase 76 Theme D, `features/finance/`) is the
> Twelve Data–backed footer segment and needs an API key. This phase is a separate, key-free
> namespace — `markets.*` on the bridge, `mstudio:markets:*` channels, `main/finance/markets/` —
> and does not touch it.

## Headlines

**Theme A — Market data in main.** ✅ Key-free public sources, fetched only in main behind
`mstudio:markets:series|quotes|search|rates|news`, every price stored in USD. Stocks and ETFs come
from CNBC's chart service with Yahoo's chart endpoint behind it (Yahoo answers HTTP 429 to many
networks, CNBC answered everywhere it was tried); crypto from Binance's public market-data host
with CoinGecko's OHLC behind it; search merges the curated catalogue with Nasdaq's autocomplete and
CoinGecko's coin search; FX is open.er-api.com with Frankfurter behind it, cached for an hour and
refreshed on a timer in main. Series are cached on disk under `userData/finance/cache/` with
per-timescale TTLs, a provider that rate limits is skipped for a minute, and when every provider
fails the last cached answer is served flagged `stale` — an `error` reaches the card only when
there is nothing cached either. Verified live from the dev machine for 1D through ALL. Tests and the
mock bridge never reach a network: a fake fetcher serves fixtures.

**Theme B — The simulated portfolio.** ✅ Fiat balances per currency, holdings, a transaction log
of deposits / withdrawals / buys / sells, and the watchlist, persisted main-side as one JSON file
(`userData/finance/portfolio.json`, temp-and-rename writes through a serial queue). Main-side rather
than the renderer's persisted store because the log only grows, because main must be the one to
enforce "no overdraft / no selling what you do not hold" and to price a trade (the renderer is not
trusted with either), and because a file survives a cleared profile. The rules are pure functions in
`shared/markets-portfolio.ts`; the seed is built by replaying a script through the same function, so
balances, holdings and log agree by construction.

**Theme C — The dashboard framework.** ✅ `Finance` is the third default dashboard.
`midnite-studio.dashboard` persist v3 → v4 with `migrateDashboardState` appending the tab to an
existing list without touching a person's other dashboards, pins, order or active tab (idempotent;
the board itself is seeded lazily). **Resizing needed no new library**: `react-grid-layout` already
resized every tile from its south-east corner with registry minimums; this theme turns on the south-
west corner and the east, west and south edges for every dashboard (`resizeConfig.handles`). The
global timescale and display currency live in the dashboard header, shown whenever the board carries
a Finance card.

**Theme D — The cards.** ✅ Bank cards (a fanning wallet stack, deposit/withdraw modals with a number
stepper, withdrawals blocked below zero), asset cards (brand mark, price, toned sparkline, gain or
loss with a matching arrow), the allocation donut, the Watchlist and Markets lists (one component,
sortable by name, price, value and gain/loss in absolute and percent, inline area charts, star
toggle) and the sortable, searchable transaction table. Brand marks come from `react-icons/si`;
Microsoft, Amazon, Avalanche and the two ETFs are hand-drawn in `components/icons/market-marks.tsx`.

**Theme E — The chart.** ✅ A lazily loaded TradingView Lightweight Charts card (candles, line, area,
% change, OHLC bars) with an autocomplete asset search over stocks and crypto, a buy/sell modal, and a
plain-language summary derived purely from the bars on screen — `summarizeSeries` / `describeSummary`,
deterministic, unit-tested, no model anywhere. The **Insights** button (rainbow border and glow, full
rainbow fill on hover) expands the summary into a fuller breakdown; its purpose was unspecified, so
that is an assumption.

**Theme F — News.** ✅ RSS/Atom and Google News searches fetched and parsed in main (a small tolerant
parser; feed URLs refuse private and loopback hosts). Defaults cover the watchlist plus a few
publisher feeds; a settings popover edits feeds and keywords. A headline opens through the app's one
link policy, and each row also has explicit Midnite-browser and system-browser buttons.

**Theme G — Verification.** 🔄 Unit and bridge-assembled tests are green; one real-browser spec
covers the drag-resize and the Insights hover. What remains is a human pass on the packaged app with
real network access.

## A — Market data in main

- [x] `markets` zod schemas, channels and bridge namespace in `packages/shared`
- [x] Provider chain per asset kind with parsers for CNBC, Yahoo, Binance, CoinGecko
- [x] Disk cache with per-timescale TTLs, stale fallback and provider cooldown
- [x] FX table (open.er-api.com, Frankfurter fallback), hourly refresh in main
- [x] Search: catalogue, Nasdaq autocomplete, CoinGecko
- [x] Handlers return `GitOpResult` envelopes and never throw across the boundary
- [x] Network-free tests (fake fetcher) for parsers, cache, fallback, cooldown, search, rates

## B — The simulated portfolio

- [x] Pure portfolio rules in shared (deposit, withdraw, buy, sell, watch) with invariants tested
- [x] Seeded starter portfolio and watchlist, built by replaying a script
- [x] Main-side JSON store: atomic writes, serial queue, corrupt file reseeds
- [x] Trades priced in main, never by the renderer

## C — The dashboard framework

- [x] Finance dashboard seed, registry rows and Finance category in the picker
- [x] Persist v3 → v4 migration, tested
- [x] Resize from corners and edges for every dashboard
- [x] Global timescale and display-currency controls in the dashboard header

## D — The cards

- [x] Bank cards with fan-out and deposit/withdraw modals
- [x] Asset card stack
- [x] Allocation donut
- [x] Watchlist and Markets lists
- [x] Transaction history

## E — The chart

- [x] Lazy chart with five types and theme-following colours
- [x] Autocomplete asset search
- [x] Deterministic summary function, unit-tested across flat, up, down, volatile, single-point and empty series
- [x] Insights button and expanded breakdown
- [x] Trade modal

## F — News

- [x] RSS/Atom parser and Google News search sources in main
- [x] Feeds and keywords settings popover
- [x] Open in the Midnite browser or the system browser

## G — Verification

- [x] `moon run :typecheck :lint :test` green
- [x] Real-browser spec: resize and Insights hover
- [ ] Packaged-app pass with live network: every card, both themes, a provider outage
