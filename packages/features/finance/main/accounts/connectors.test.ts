// @vitest-environment node
import type { AccountConnectorId } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { Fetcher } from '../markets/http';
import { alpacaConnector } from './alpaca';
import {
  createReadOnlyRequester,
  ReadOnlyViolationError,
  type ConnectorContext,
} from './connector';
import { krakenConnector, krakenSignature, normaliseKrakenAsset } from './kraken';
import { CONNECTORS } from './registry';

/** A recorded answer per `METHOD path`; every call is logged, and an unrecorded one fails the test. */
function recorded(answers: Record<string, unknown>, status = 200) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const u = new URL(url);
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, ...(init?.body ? { body: init.body } : {}) });
    const key = `${init?.method ?? 'GET'} ${u.pathname}`;
    if (!(key in answers)) throw new Error(`unrecorded request: ${key}`);
    return { ok: status < 400, status, text: async () => JSON.stringify(answers[key]) };
  };
  return { fetcher, calls };
}

const ctxFor = (
  connector: typeof alpacaConnector,
  fetcher: Fetcher,
  credentials: Record<string, string>,
  environment: 'paper' | 'live' = 'paper',
): ConnectorContext => ({
  credentials,
  environment,
  now: () => 1_700_000_000_000,
  request: createReadOnlyRequester(connector, connector.baseUrl(environment), fetcher),
});

const ALPACA_CREDS = { apiKeyId: 'PKTESTKEYID123', apiSecret: 'alpaca-secret-value-xyz' };
const ALPACA_FIXTURES = {
  'GET /v2/account': { id: 'a1', currency: 'USD', cash: '10000.50', buying_power: '20000', equity: '12000.50' },
  'GET /v2/positions': [
    { symbol: 'AAPL', qty: '10', market_value: '1800.5', cost_basis: '1500', unrealized_pl: '300.5' },
    { symbol: 'TSLA', qty: '2', market_value: '200', cost_basis: '250', unrealized_pl: '-50' },
  ],
  'GET /v2/account/portfolio/history': {
    timestamp: [1_699_000_000, 1_699_086_400, 1_699_172_800],
    equity: [11_000, null, 12_000.5],
    timeframe: '1D',
  },
};

describe('alpaca connector (recorded fixtures)', () => {
  it('normalises the account, positions and equity history', async () => {
    const { fetcher, calls } = recorded(ALPACA_FIXTURES);
    const ctx = ctxFor(alpacaConnector, fetcher, ALPACA_CREDS);
    expect(await alpacaConnector.balances(ctx)).toEqual([{ currency: 'USD', total: 10000.5, available: 10000.5, usd: 10000.5 }]);
    expect(await alpacaConnector.positions(ctx)).toEqual([
      { symbol: 'AAPL', quantity: 10, marketValueUsd: 1800.5, costBasisUsd: 1500, unrealizedPnlUsd: 300.5 },
      { symbol: 'TSLA', quantity: 2, marketValueUsd: 200, costBasisUsd: 250, unrealizedPnlUsd: -50 },
    ]);
    // The null day is a gap, not a zero.
    expect(await alpacaConnector.history(ctx)).toEqual([
      { t: 1_699_000_000_000, equityUsd: 11_000 },
      { t: 1_699_172_800_000, equityUsd: 12_000.5 },
    ]);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls[0]?.headers).toMatchObject({ 'APCA-API-KEY-ID': 'PKTESTKEYID123', 'APCA-API-SECRET-KEY': 'alpaca-secret-value-xyz' });
  });

  it('uses the paper host for paper and the live host for live', async () => {
    const { fetcher, calls } = recorded(ALPACA_FIXTURES);
    await alpacaConnector.balances(ctxFor(alpacaConnector, fetcher, ALPACA_CREDS, 'paper'));
    await alpacaConnector.balances(ctxFor(alpacaConnector, fetcher, ALPACA_CREDS, 'live'));
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['paper-api.alpaca.markets', 'api.alpaca.markets']);
  });

  it('turns a 403 into a message that carries no credential', async () => {
    const { fetcher } = recorded(ALPACA_FIXTURES, 403);
    const error = await alpacaConnector.balances(ctxFor(alpacaConnector, fetcher, ALPACA_CREDS)).catch((e: Error) => e);
    expect(String((error as Error).message)).toMatch(/rejected the credentials/);
    expect(String((error as Error).message)).not.toContain('alpaca-secret-value-xyz');
  });
});

// Kraken's documented example (docs.kraken.com ▸ REST ▸ Authentication).
const KRAKEN_SECRET =
  'kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==';

describe('kraken signing', () => {
  it('matches the documented known-answer vector', () => {
    const nonce = '1616492376594';
    const body = `nonce=${nonce}&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25`;
    expect(krakenSignature('/0/private/AddOrder', nonce, body, KRAKEN_SECRET)).toBe(
      '4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==',
    );
  });

  it('changes with the path, the nonce and the body', () => {
    const base = krakenSignature('/0/private/Balance', '1', 'nonce=1', KRAKEN_SECRET);
    expect(krakenSignature('/0/private/TradeBalance', '1', 'nonce=1', KRAKEN_SECRET)).not.toBe(base);
    expect(krakenSignature('/0/private/Balance', '2', 'nonce=2', KRAKEN_SECRET)).not.toBe(base);
  });

  it('maps legacy asset codes', () => {
    expect(['XXBT', 'XBT', 'XETH', 'ZUSD', 'ZEUR', 'SOL', 'ETH2.S', 'XXDG', 'USDT'].map(normaliseKrakenAsset)).toEqual([
      'BTC', 'BTC', 'ETH', 'USD', 'EUR', 'SOL', 'ETH2', 'DOGE', 'USDT',
    ]);
  });
});

const KRAKEN_CREDS = { apiKey: 'kraken-api-key-abc', apiSecret: KRAKEN_SECRET };
const KRAKEN_FIXTURES = {
  'POST /0/private/Balance': { error: [], result: { XXBT: '0.5', XETH: '2.0', ZUSD: '100.25', ZEUR: '10' } },
  'POST /0/private/TradeBalance': { error: [], result: { eb: '31600.25', tb: '100.25' } },
  'GET /0/public/Ticker': {
    error: [],
    result: { XXBTZUSD: { c: ['60000.0', '1'] }, XETHZUSD: { c: ['3000.0', '1'] } },
  },
};

describe('kraken connector (recorded fixtures)', () => {
  it('signs private calls and prices holdings from the public ticker', async () => {
    const { fetcher, calls } = recorded(KRAKEN_FIXTURES);
    const ctx = ctxFor(krakenConnector as typeof alpacaConnector, fetcher, KRAKEN_CREDS);
    const balances = await krakenConnector.balances(ctx);
    expect(balances).toEqual([
      { currency: 'BTC', total: 0.5, available: 0.5, usd: 30000 },
      { currency: 'ETH', total: 2, available: 2, usd: 6000 },
      { currency: 'USD', total: 100.25, available: 100.25, usd: 100.25 },
      { currency: 'EUR', total: 10, available: 10, usd: null },
    ]);
    const priv = calls.find((c) => c.method === 'POST');
    expect(priv?.headers['API-Key']).toBe('kraken-api-key-abc');
    expect(priv?.headers['API-Sign']).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // The secret itself is never put on the wire — only its signature is.
    expect(JSON.stringify(calls)).not.toContain(KRAKEN_SECRET);
  });

  it('lists non-fiat holdings as positions and gives one equity point', async () => {
    const { fetcher } = recorded(KRAKEN_FIXTURES);
    const ctx = ctxFor(krakenConnector as typeof alpacaConnector, fetcher, KRAKEN_CREDS);
    expect((await krakenConnector.positions(ctx)).map((p) => [p.symbol, p.marketValueUsd])).toEqual([
      ['BTC', 30000],
      ['ETH', 6000],
      ['EUR', null],
    ]);
    expect(await krakenConnector.history(ctx)).toEqual([{ t: 1_700_000_000_000, equityUsd: 31600.25 }]);
  });

  it('surfaces Kraken error text without the credential', async () => {
    const { fetcher } = recorded({ 'POST /0/private/Balance': { error: ['EAPI:Invalid key'], result: {} } });
    const ctx = ctxFor(krakenConnector as typeof alpacaConnector, fetcher, KRAKEN_CREDS);
    await expect(krakenConnector.balances(ctx)).rejects.toThrow('kraken: Invalid key');
  });
});

describe('read-only enforcement', () => {
  const FORBIDDEN: [AccountConnectorId, 'GET' | 'POST', string][] = [
    ['alpaca', 'POST', '/v2/orders'],
    ['alpaca', 'GET', '/v2/orders'],
    ['alpaca', 'GET', '/v2/orders/123'],
    ['alpaca', 'POST', '/v2/account/transfers'],
    ['alpaca', 'GET', '/v2/positions/AAPL/close'],
    ['alpaca', 'POST', '/v2/account/withdrawals'],
    ['kraken', 'POST', '/0/private/AddOrder'],
    ['kraken', 'POST', '/0/private/CancelOrder'],
    ['kraken', 'POST', '/0/private/CancelAll'],
    ['kraken', 'POST', '/0/private/WithdrawFunds'],
    ['kraken', 'POST', '/0/private/Withdraw'],
    ['kraken', 'POST', '/0/private/WalletTransfer'],
    ['kraken', 'POST', '/0/private/EditOrder'],
    ['kraken', 'POST', '/0/private/AddOrderBatch'],
    ['kraken', 'POST', '/0/private/Earn/Allocate'],
    ['kraken', 'POST', '/0/private/DepositAddresses'],
  ];

  it.each(FORBIDDEN)('%s cannot build %s %s, and the transport is never touched', async (id, method, path) => {
    const connector = CONNECTORS[id];
    const fetcher = vi.fn() as unknown as Fetcher;
    const requester = createReadOnlyRequester(connector, connector.baseUrl('live'), fetcher);
    await expect(requester.json(method, path)).rejects.toBeInstanceOf(ReadOnlyViolationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses a forbidden path even when a connector wrongly allowlists it', async () => {
    const sloppy = { id: 'alpaca', allowedEndpoints: [{ method: 'POST', path: '/v2/orders' }] } as const;
    const fetcher = vi.fn() as unknown as Fetcher;
    const requester = createReadOnlyRequester(sloppy, 'https://x.invalid', fetcher);
    await expect(requester.json('POST', '/v2/orders')).rejects.toBeInstanceOf(ReadOnlyViolationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses the right path with the wrong verb', async () => {
    const fetcher = vi.fn() as unknown as Fetcher;
    const requester = createReadOnlyRequester(alpacaConnector, 'https://x.invalid', fetcher);
    await expect(requester.json('POST', '/v2/account')).rejects.toBeInstanceOf(ReadOnlyViolationError);
  });

  it('every allowlisted endpoint of every connector passes the word guard', async () => {
    for (const connector of Object.values(CONNECTORS)) {
      for (const rule of connector.allowedEndpoints) {
        const fetcher: Fetcher = async () => ({ ok: true, status: 200, text: async () => '{}' });
        const requester = createReadOnlyRequester(connector, 'https://x.invalid', fetcher);
        await expect(requester.json(rule.method, rule.path as string)).resolves.toEqual({});
      }
    }
  });

  it('a connector exposes only read verbs', () => {
    for (const connector of Object.values(CONNECTORS)) {
      const verbs = Object.keys(connector).filter((k) => typeof (connector as unknown as Record<string, unknown>)[k] === 'function');
      expect(verbs.sort()).toEqual(['balances', 'baseUrl', 'history', 'positions']);
    }
  });
});
