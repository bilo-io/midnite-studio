import { describe, expect, it } from 'vitest';

import { cleanCandles, downsample, trimToTimescale } from './candles';
import { MAX_BODY_CHARS, RateLimitedError, getJson, isPublicHttpUrl } from './http';
import {
  parseBinanceKlines,
  parseCnbcChart,
  parseCoingeckoOhlc,
  parseCoingeckoSearch,
  parseNasdaqSearch,
  parseRates,
  parseYahooChart,
} from './parsers';

const DAY = 86_400_000;
const bar = (i: number, c = 100 + i) => ({ t: i * DAY, o: c - 1, h: c + 2, l: c - 2, c, v: 10 });

describe('provider parsers', () => {
  it('reads CNBC bars with string prices', () => {
    const out = parseCnbcChart({
      barData: {
        priceBars: [
          { open: '254.6650', high: '259.24', low: '253.95', close: '258.02', volume: 49155614, tradeTimeinMills: 1759464000000 },
          { open: '257.99', high: '259.07', low: '255.05', close: '256.69', volume: 1, tradeTimeinMills: 1759723200000 },
        ],
      },
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ t: 1759464000000, o: 254.665, h: 259.24, l: 253.95, c: 258.02, v: 49155614 });
  });

  it('reads Yahoo parallel arrays, skipping null bars', () => {
    const out = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [1000, 2000, 3000],
            indicators: {
              quote: [
                {
                  open: [1, null, 3],
                  high: [2, null, 4],
                  low: [0.5, null, 2.5],
                  close: [1.5, null, 3.5],
                  volume: [10, null, 30],
                },
              ],
            },
          },
        ],
      },
    });
    expect(out.map((c) => c.t)).toEqual([1_000_000, 3_000_000]);
    expect(out[1]).toMatchObject({ o: 3, h: 4, l: 2.5, c: 3.5, v: 30 });
  });

  it('reads Binance klines', () => {
    const out = parseBinanceKlines([[1790812800000, '83623.59', '85273.65', '83186.00', '84880.05', '16766.05', 1790899199999]]);
    expect(out).toEqual([{ t: 1790812800000, o: 83623.59, h: 85273.65, l: 83186, c: 84880.05, v: 16766.05 }]);
  });

  it('reads CoinGecko OHLC rows, which carry no volume', () => {
    expect(parseCoingeckoOhlc([[1, 10, 12, 9, 11]])).toEqual([{ t: 1, o: 10, h: 12, l: 9, c: 11 }]);
  });

  it.each([null, undefined, 'x', {}, { chart: {} }, { barData: { priceBars: 'no' } }, []])(
    'returns nothing for the malformed payload %j',
    (raw) => {
      expect(parseCnbcChart(raw)).toEqual([]);
      expect(parseYahooChart(raw)).toEqual([]);
      expect(parseBinanceKlines(raw)).toEqual([]);
      expect(parseCoingeckoOhlc(raw)).toEqual([]);
    },
  );

  it('reads an FX table, always including USD, and rejects a stub', () => {
    const rates = parseRates({ rates: { USD: 1, EUR: 0.89, ZAR: 17.4, GBP: 0.76, bad: 3, XXX: -1 } });
    expect(rates).toEqual({ USD: 1, EUR: 0.89, ZAR: 17.4, GBP: 0.76 });
    expect(parseRates({ rates: { EUR: 0.9 } })).toBeNull();
    expect(parseRates('nope')).toBeNull();
  });

  it('keeps only equities and ETFs from the Nasdaq lookup, tidying the name', () => {
    const out = parseNasdaqSearch({
      data: [
        { symbol: 'TSLA', name: 'Tesla, Inc. Common Stock', asset: 'STOCKS', exchange: 'NASDAQ-GS' },
        { symbol: 'BMBVGXX', name: 'Some Note', asset: 'STOCKS' },
        { symbol: 'SPY', name: 'SPDR S&P 500', asset: 'ETF' },
        { symbol: 'XYZ', name: 'Index', asset: 'INDEX' },
      ],
    });
    expect(out).toEqual([
      { symbol: 'TSLA', name: 'Tesla, Inc.', kind: 'stock', exchange: 'NASDAQ-GS' },
      { symbol: 'SPY', name: 'SPDR S&P 500', kind: 'etf' },
    ]);
  });

  it('upper-cases CoinGecko coin symbols', () => {
    expect(parseCoingeckoSearch({ coins: [{ id: 'solana', name: 'Solana', symbol: 'sol' }] })).toEqual([
      { symbol: 'SOL', name: 'Solana', kind: 'crypto', coingeckoId: 'solana' },
    ]);
  });
});

describe('candle utilities', () => {
  it('cleans: sorted, one bar per timestamp, no junk prices', () => {
    const out = cleanCandles([bar(3), bar(1), { ...bar(2), c: Number.NaN }, { ...bar(4), o: 0 }, bar(1, 500)]);
    expect(out.map((c) => c.t)).toEqual([1 * DAY, 3 * DAY]);
    expect(out[0]?.c).toBe(500);
  });

  it('windows to the timescale from the newest bar, not the wall clock', () => {
    const candles = Array.from({ length: 100 }, (_, i) => bar(i));
    expect(trimToTimescale(candles, '1W')).toHaveLength(8);
    expect(trimToTimescale(candles, 'ALL')).toHaveLength(100);
    expect(trimToTimescale([], '1M')).toEqual([]);
  });

  it('thins by merging neighbours into one OHLC bar', () => {
    const candles = Array.from({ length: 10 }, (_, i) => bar(i));
    const out = downsample(candles, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ t: 0, o: candles[0]?.o, h: Math.max(candles[0]!.h, candles[1]!.h), l: Math.min(candles[0]!.l, candles[1]!.l), c: candles[1]?.c, v: 20 });
    expect(downsample(candles, 50)).toBe(candles);
  });
});

describe('isPublicHttpUrl', () => {
  it.each(['https://cointelegraph.com/rss', 'http://feeds.example.org/a.xml'])('allows %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/feed',
    'http://localhost:3000/feed',
    'http://127.0.0.1/feed',
    'http://10.0.0.5/feed',
    'http://192.168.1.1/feed',
    'http://172.20.0.1/feed',
    'http://169.254.169.254/latest',
    'http://printer.local/feed',
    'http://[::1]/feed',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});

describe('http seam', () => {
  const reply = (status: number, body: string) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });

  it('turns a 429 into a RateLimitedError the service can back off on', async () => {
    await expect(getJson(reply(429, ''), 'Yahoo', 'https://x.example')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('refuses an oversized body and a non-JSON one, with the provider named', async () => {
    await expect(getJson(reply(200, 'x'.repeat(MAX_BODY_CHARS + 1)), 'CNBC', 'https://x.example')).rejects.toThrow(/CNBC sent an oversized/);
    await expect(getJson(reply(200, '<html>'), 'CNBC', 'https://x.example')).rejects.toThrow(/CNBC sent something that was not JSON/);
    await expect(getJson(reply(503, ''), 'CNBC', 'https://x.example')).rejects.toThrow(/CNBC answered 503/);
  });
});
