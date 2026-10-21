import { render } from '@testing-library/react';
import { MARKET_CATALOGUE, MARKET_CURRENCIES, MARKET_TIMESCALES, MARKET_TIMESCALE_LABEL, MARKET_TIMESCALE_MS, type MarketTransaction } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { AssetIcon, hasBrandMark } from './asset-icon';
import { DEFAULT_NEWS, MAX_FEEDS, MAX_KEYWORDS, useFinanceUiStore } from './finance-ui-store';
import { donutArcs, sparkPath } from './finance-parts';
import { newsSources } from './news-widget';
import {
  filterTransactions,
  nextTxSort,
  signedValueUsd,
  sortTransactions,
  txAmount,
  txSubject,
} from './transactions-model';

const tx = (patch: Partial<MarketTransaction> & Pick<MarketTransaction, 'id' | 'ts' | 'type'>): MarketTransaction => ({
  currency: 'USD',
  fiatAmount: 100,
  valueUsd: 100,
  ...patch,
});

describe('catalogue invariants', () => {
  it('has unique symbols, valid colours and a mark or a deliberate fallback for each asset', () => {
    const symbols = MARKET_CATALOGUE.map((a) => a.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const asset of MARKET_CATALOGUE) {
      expect(asset.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(hasBrandMark(asset.symbol)).toBe(true);
    }
  });

  it('gives every crypto a CoinGecko id for the fallback provider', () => {
    for (const asset of MARKET_CATALOGUE.filter((a) => a.kind === 'crypto')) expect(asset.coingeckoId).toBeTruthy();
  });

  it('labels and windows every timescale', () => {
    for (const ts of MARKET_TIMESCALES) {
      expect(MARKET_TIMESCALE_LABEL[ts]).toBeTruthy();
      expect(ts in MARKET_TIMESCALE_MS).toBe(true);
    }
    expect(MARKET_TIMESCALE_MS.ALL).toBeNull();
  });

  it('offers USD, ZAR, EUR and GBP among the currencies', () => {
    const codes = MARKET_CURRENCIES.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['USD', 'ZAR', 'EUR', 'GBP']));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('AssetIcon', () => {
  it('renders a brand mark in the brand colour', () => {
    const { container } = render(<AssetIcon symbol="BTC" />);
    const chip = container.querySelector('[data-asset-icon="BTC"]') as HTMLElement;
    expect(chip.style.color).toBe('rgb(247, 147, 26)');
    expect(chip.querySelector('svg')).toBeTruthy();
  });

  it('draws the hand-made marks for the assets Simple Icons lacks', () => {
    for (const symbol of ['MSFT', 'AMZN', 'AVAX', 'SPY', 'QQQ']) {
      const { container } = render(<AssetIcon symbol={symbol} />);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });

  it('falls back to the ticker for an asset with no mark', () => {
    const { container } = render(<AssetIcon symbol="zzzz" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('ZZZ');
  });
});

describe('sparkPath and donutArcs', () => {
  it('scales a series into its box, high values near the top', () => {
    const { line } = sparkPath([0, 10], 100, 20, 0);
    expect(line).toBe('M0.0,20.0L100.0,0.0');
  });

  it('draws a flat series as a centred line and nothing for no data', () => {
    expect(sparkPath([5, 5, 5], 100, 20).line).toBe('M0.0,10.0L50.0,10.0L100.0,10.0');
    expect(sparkPath([], 100, 20)).toEqual({ line: '', area: '' });
  });

  it('closes the area path to the baseline', () => {
    expect(sparkPath([1, 2], 10, 10).area.endsWith('L10,10L0,10Z')).toBe(true);
  });

  it('draws one arc per slice, and a lone slice as a full ring', () => {
    const slice = (id: string, share: number) => ({ id, label: id, color: '#fff', valueUsd: share, share, kind: 'asset' as const });
    expect(donutArcs([slice('a', 0.6), slice('b', 0.4)], 50)).toHaveLength(2);
    const [full] = donutArcs([slice('a', 1)], 50);
    expect(full?.d.match(/A/g)).toHaveLength(2);
    expect(donutArcs([slice('a', 0)], 50)).toEqual([]);
  });
});

describe('transaction model', () => {
  const rows = [
    tx({ id: 'a', ts: 100, type: 'deposit', currency: 'ZAR', fiatAmount: 2000, valueUsd: 100 }),
    tx({ id: 'b', ts: 300, type: 'buy', symbol: 'BTC', assetName: 'Bitcoin', quantity: 0.5, priceUsd: 60000, valueUsd: 30000, fiatAmount: 30000 }),
    tx({ id: 'c', ts: 200, type: 'withdraw', fiatAmount: 40, valueUsd: 40 }),
    tx({ id: 'd', ts: 400, type: 'sell', symbol: 'AAPL', assetName: 'Apple', quantity: 2, priceUsd: 200, valueUsd: 400, fiatAmount: 400 }),
  ];
  const ids = (list: MarketTransaction[]) => list.map((t) => t.id).join('');

  it('signs value by direction: deposits and sells in, withdrawals and buys out', () => {
    expect(rows.map(signedValueUsd)).toEqual([100, -30000, -40, 400]);
  });

  it('describes the subject and the amount per kind', () => {
    expect(txSubject(rows[0]!)).toBe('ZAR card');
    expect(txSubject(rows[1]!)).toBe('Bitcoin');
    expect(txAmount(rows[0]!)).toBe(2000);
    expect(txAmount(rows[1]!)).toBe(0.5);
  });

  it('sorts every column, both ways, deterministically', () => {
    expect(ids(sortTransactions(rows, 'date', 'desc'))).toBe('dbca');
    expect(ids(sortTransactions(rows, 'date', 'asc'))).toBe('acbd');
    expect(ids(sortTransactions(rows, 'value', 'desc'))).toBe('dacb');
    expect(ids(sortTransactions(rows, 'asset', 'asc'))).toBe('dbca'); // Apple, Bitcoin, USD card, ZAR card
    expect(ids(sortTransactions(rows, 'type', 'asc'))).toBe('badc'); // buy, deposit, sell, withdraw
    expect(ids(sortTransactions(rows, 'price', 'desc'))).toBe('bdca');
    expect(ids(sortTransactions(rows, 'amount', 'desc'))).toBe('acdb'); // 2000, 40, 2, 0.5
  });

  it('searches asset, ticker, type, currency and date', () => {
    expect(ids(filterTransactions(rows, 'btc'))).toBe('b');
    expect(ids(filterTransactions(rows, 'apple'))).toBe('d');
    expect(ids(filterTransactions(rows, 'withdrawal'))).toBe('c');
    expect(ids(filterTransactions(rows, 'zar'))).toBe('a');
    expect(ids(filterTransactions(rows, '1970-01-01'))).toBe('abcd');
    expect(ids(filterTransactions(rows, '  '))).toBe('abcd');
    expect(filterTransactions(rows, 'nothing')).toEqual([]);
  });

  it('starts a text column ascending and a numeric one descending, and flips on repeat', () => {
    expect(nextTxSort({ key: 'date', dir: 'desc' }, 'asset')).toEqual({ key: 'asset', dir: 'asc' });
    expect(nextTxSort({ key: 'date', dir: 'desc' }, 'value')).toEqual({ key: 'value', dir: 'desc' });
    expect(nextTxSort({ key: 'value', dir: 'desc' }, 'value')).toEqual({ key: 'value', dir: 'asc' });
  });
});

describe('finance ui store', () => {
  beforeEach(() => useFinanceUiStore.setState({ news: DEFAULT_NEWS, sorts: { watchlist: { key: 'name', dir: 'asc' }, markets: { key: 'name', dir: 'asc' } } }));
  const state = () => useFinanceUiStore.getState();

  it('adds a feed once, only for http(s), and caps the count', () => {
    expect(state().addFeed('ftp://x.example/feed')).toBeNull();
    expect(state().addFeed('not a url')).toBeNull();
    const id = state().addFeed('https://www.example.org/rss', '  My feed  ');
    expect(id).toBeTruthy();
    expect(state().news.feeds.at(-1)).toMatchObject({ label: 'My feed', url: 'https://www.example.org/rss', enabled: true });
    expect(state().addFeed('https://www.example.org/rss')).toBeNull();
    expect(state().addFeed('https://www.example.org/other')?.length).toBeGreaterThan(0);
    for (let i = 0; i < MAX_FEEDS; i += 1) state().addFeed(`https://f${i}.example/rss`);
    expect(state().news.feeds).toHaveLength(MAX_FEEDS);
  });

  it('derives a label from the host when none is given', () => {
    state().addFeed('https://www.reuters.com/rss');
    expect(state().news.feeds.at(-1)?.label).toBe('reuters.com');
  });

  it('toggles and removes feeds', () => {
    const first = state().news.feeds[0]!;
    state().toggleFeed(first.id);
    expect(state().news.feeds[0]?.enabled).toBe(false);
    state().removeFeed(first.id);
    expect(state().news.feeds.some((f) => f.id === first.id)).toBe(false);
  });

  it('adds keywords case-insensitively unique, trimmed and capped', () => {
    expect(state().addKeyword('  Fed  ')).toBe(true);
    expect(state().addKeyword('fed')).toBe(false);
    expect(state().addKeyword('   ')).toBe(false);
    expect(state().news.keywords).toEqual(['Fed']);
    for (let i = 0; i < MAX_KEYWORDS + 3; i += 1) state().addKeyword(`kw${i}`);
    expect(state().news.keywords).toHaveLength(MAX_KEYWORDS);
    state().removeKeyword('Fed');
    expect(state().news.keywords).not.toContain('Fed');
  });

  it('resets news to the defaults, which cover the watchlist', () => {
    state().setUseWatchlist(false);
    state().addKeyword('x');
    state().resetNews();
    expect(state().news).toEqual(DEFAULT_NEWS);
    expect(DEFAULT_NEWS.useWatchlist).toBe(true);
  });

  it('remembers each list’s sort independently', () => {
    state().sortBy('watchlist', 'price');
    state().sortBy('markets', 'gainPct');
    expect(state().sorts).toEqual({ watchlist: { key: 'price', dir: 'desc' }, markets: { key: 'gainPct', dir: 'desc' } });
  });
});

describe('newsSources', () => {
  const watched = [
    { symbol: 'BTC', name: 'Bitcoin' },
    { symbol: 'AAPL', name: 'Apple' },
  ];

  it('covers enabled feeds, keywords and the watchlist', () => {
    const sources = newsSources({ ...DEFAULT_NEWS, keywords: ['rates'] }, watched);
    expect(sources.filter((s) => s.kind === 'feed')).toHaveLength(3);
    expect(sources).toContainEqual({ kind: 'keyword', query: 'rates' });
    expect(sources).toContainEqual({ kind: 'asset', symbol: 'BTC', name: 'Bitcoin' });
  });

  it('skips disabled feeds and the watchlist when it is switched off', () => {
    const feeds = DEFAULT_NEWS.feeds.map((f, i) => ({ ...f, enabled: i === 0 }));
    const sources = newsSources({ feeds, keywords: [], useWatchlist: false }, watched);
    expect(sources).toHaveLength(1);
  });

  it('is empty when there is nothing to follow', () => {
    expect(newsSources({ feeds: [], keywords: [], useWatchlist: true }, [])).toEqual([]);
  });
});
