import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  MARKET_CURRENCIES,
  MARKET_TIMESCALES,
  type MarketAsset,
  type MarketTimescale,
} from '@midnite/studio-shared';

import { nextSort, type SortDir, type SortKey } from './finance-math';

/**
 * The Finance dashboard's own preferences — what the person chose, never data.
 *
 * Prices, the portfolio and the transaction log live in main (they are fetched
 * or must be enforced there). This holds only the viewing choices: the display
 * currency and global timescale, which chart and chart type, how each list is
 * sorted, and which news feeds and keywords are followed. A separate store from
 * `dashboard-store` because these are not per-board layout, and from `ui-store`
 * so a change here never has to migrate that key.
 */

export type ChartType = 'candles' | 'line' | 'area' | 'percent' | 'bars';

export const CHART_TYPES: readonly { id: ChartType; label: string }[] = [
  { id: 'candles', label: 'Candles' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'percent', label: '% change' },
  { id: 'bars', label: 'OHLC' },
];

export type NewsFeed = { id: string; label: string; url: string; enabled: boolean };

export type NewsConfig = {
  feeds: NewsFeed[];
  keywords: string[];
  /** Follow every watchlist asset, so the defaults cover whatever is watched. */
  useWatchlist: boolean;
};

export type ListId = 'watchlist' | 'markets';

export const DEFAULT_NEWS: NewsConfig = {
  feeds: [
    { id: 'cointelegraph', label: 'Cointelegraph', url: 'https://cointelegraph.com/rss', enabled: true },
    { id: 'cnbc-markets', label: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', enabled: true },
    { id: 'yahoo-finance', label: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', enabled: true },
  ],
  keywords: [],
  useWatchlist: true,
};

export const MAX_FEEDS = 12;
export const MAX_KEYWORDS = 12;

type FinanceUiState = {
  /** Bumped by the header's Refresh button; never persisted. See `takeRefresh`. */
  refreshNonce: number;
  refresh: () => void;
  currency: string;
  timescale: MarketTimescale;
  setCurrency: (currency: string) => void;
  setTimescale: (timescale: MarketTimescale) => void;

  /** The asset the big chart shows; null falls back to the first watched one. */
  chartAsset: MarketAsset | null;
  chartType: ChartType;
  setChartAsset: (asset: MarketAsset | null) => void;
  setChartType: (type: ChartType) => void;

  sorts: Record<ListId, { key: SortKey; dir: SortDir }>;
  sortBy: (list: ListId, key: SortKey) => void;
  setSort: (list: ListId, sort: { key: SortKey; dir: SortDir }) => void;

  news: NewsConfig;
  addFeed: (url: string, label?: string) => string | null;
  removeFeed: (id: string) => void;
  toggleFeed: (id: string) => void;
  addKeyword: (keyword: string) => boolean;
  removeKeyword: (keyword: string) => void;
  setUseWatchlist: (on: boolean) => void;
  resetNews: () => void;
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const useFinanceUiStore = create<FinanceUiState>()(
  persist(
    (set, get) => ({
      refreshNonce: 0,
      refresh: () => set((state) => ({ refreshNonce: state.refreshNonce + 1 })),
      currency: 'USD',
      timescale: '1M',
      setCurrency: (currency) => set({ currency }),
      setTimescale: (timescale) => set({ timescale }),

      chartAsset: null,
      chartType: 'candles',
      setChartAsset: (chartAsset) => set({ chartAsset }),
      setChartType: (chartType) => set({ chartType }),

      sorts: {
        watchlist: { key: 'name', dir: 'asc' },
        markets: { key: 'name', dir: 'asc' },
      },
      sortBy: (list, key) =>
        set((state) => ({ sorts: { ...state.sorts, [list]: nextSort(state.sorts[list], key) } })),
      setSort: (list, sort) => set((state) => ({ sorts: { ...state.sorts, [list]: sort } })),

      news: DEFAULT_NEWS,

      addFeed: (rawUrl, label) => {
        const url = rawUrl.trim();
        const { feeds } = get().news;
        if (!isHttpUrl(url) || feeds.length >= MAX_FEEDS) return null;
        if (feeds.some((feed) => feed.url === url)) return null;
        const id = crypto.randomUUID();
        const name = label?.trim() || new URL(url).hostname.replace(/^www\./, '');
        set((state) => ({
          news: { ...state.news, feeds: [...state.news.feeds, { id, label: name, url, enabled: true }] },
        }));
        return id;
      },
      removeFeed: (id) =>
        set((state) => ({ news: { ...state.news, feeds: state.news.feeds.filter((feed) => feed.id !== id) } })),
      toggleFeed: (id) =>
        set((state) => ({
          news: {
            ...state.news,
            feeds: state.news.feeds.map((feed) => (feed.id === id ? { ...feed, enabled: !feed.enabled } : feed)),
          },
        })),

      addKeyword: (rawKeyword) => {
        const keyword = rawKeyword.trim().slice(0, 80);
        const { keywords } = get().news;
        if (!keyword || keywords.length >= MAX_KEYWORDS) return false;
        if (keywords.some((k) => k.toLowerCase() === keyword.toLowerCase())) return false;
        set((state) => ({ news: { ...state.news, keywords: [...state.news.keywords, keyword] } }));
        return true;
      },
      removeKeyword: (keyword) =>
        set((state) => ({ news: { ...state.news, keywords: state.news.keywords.filter((k) => k !== keyword) } })),
      setUseWatchlist: (useWatchlist) => set((state) => ({ news: { ...state.news, useWatchlist } })),
      resetNews: () => set({ news: DEFAULT_NEWS }),
    }),
    {
      name: 'midnite-studio.finance-ui',
      version: 1,
      /*
        Validated on the way back in rather than trusted. A hand-edited or
        half-written blob must not be able to put the dashboard in a state it
        cannot render (an unknown currency, a timescale with no window).
      */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<FinanceUiState>;
        return {
          ...current,
          currency: MARKET_CURRENCIES.some((c) => c.code === saved.currency) ? (saved.currency as string) : current.currency,
          timescale: (MARKET_TIMESCALES as readonly string[]).includes(saved.timescale as string)
            ? (saved.timescale as MarketTimescale)
            : current.timescale,
          chartAsset: saved.chartAsset ?? null,
          chartType: CHART_TYPES.some((t) => t.id === saved.chartType) ? (saved.chartType as ChartType) : current.chartType,
          sorts: { ...current.sorts, ...(saved.sorts ?? {}) },
          news:
            saved.news && Array.isArray(saved.news.feeds) && Array.isArray(saved.news.keywords)
              ? { ...DEFAULT_NEWS, ...saved.news }
              : current.news,
        };
      },
      partialize: (state) => ({
        currency: state.currency,
        timescale: state.timescale,
        chartAsset: state.chartAsset,
        chartType: state.chartType,
        sorts: state.sorts,
        news: state.news,
      }),
    },
  ),
);
