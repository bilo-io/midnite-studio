import type { AccountEnvironment, Balance, PerformancePoint, Position } from '@midnite/studio-shared';

import { ConnectorError, type AccountConnector, type ConnectorContext } from './connector';

/**
 * Alpaca (stocks) — read-only. Three GETs and nothing else: the account, the open
 * positions and the portfolio-history equity curve. `/v2/orders`, `/v2/positions`
 * DELETE and every other verb are absent from the allowlist (and `connector.ts`
 * refuses any path with "order" in it regardless).
 *
 * Paper and live are different hosts; which one is a per-account setting, and the
 * add form tells the user to create a read-only key.
 */
const PAPER = 'https://paper-api.alpaca.markets';
const LIVE = 'https://api.alpaca.markets';

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : null;
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function authHeaders(ctx: ConnectorContext): Record<string, string> {
  const id = ctx.credentials['apiKeyId'];
  const secret = ctx.credentials['apiSecret'];
  if (!id || !secret) throw new ConnectorError('alpaca needs both a key id and a secret');
  return { 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': secret };
}

export const alpacaConnector: AccountConnector = {
  id: 'alpaca',
  label: 'Alpaca',
  assetClass: 'stocks',
  fields: [
    { name: 'apiKeyId', label: 'API key ID' },
    { name: 'apiSecret', label: 'API secret' },
  ],
  supportsEnvironment: true,
  readOnlyHint:
    'Alpaca keys cannot be limited to read-only, so use a paper-trading key where you can. Midnite only ever reads your account, positions and history — it has no way to place an order.',
  allowedEndpoints: [
    { method: 'GET', path: '/v2/account' },
    { method: 'GET', path: '/v2/positions' },
    { method: 'GET', path: '/v2/account/portfolio/history' },
  ],
  baseUrl: (environment: AccountEnvironment) => (environment === 'live' ? LIVE : PAPER),

  async balances(ctx): Promise<Balance[]> {
    const raw = record(await ctx.request.json('GET', '/v2/account', { headers: authHeaders(ctx) }));
    const cash = num(raw['cash']);
    if (cash === null) throw new ConnectorError('alpaca sent an account without a cash balance');
    const buyingPower = num(raw['buying_power']);
    const currency = typeof raw['currency'] === 'string' ? raw['currency'] : 'USD';
    return [
      {
        currency,
        total: cash,
        available: buyingPower === null ? cash : Math.min(cash, buyingPower),
        usd: currency === 'USD' ? cash : null,
      },
    ];
  },

  async positions(ctx): Promise<Position[]> {
    const raw = await ctx.request.json('GET', '/v2/positions', { headers: authHeaders(ctx) });
    if (!Array.isArray(raw)) throw new ConnectorError('alpaca sent positions in an unexpected shape');
    return raw.flatMap((row): Position[] => {
      const p = record(row);
      const symbol = typeof p['symbol'] === 'string' ? p['symbol'] : null;
      const qty = num(p['qty']);
      if (!symbol || qty === null) return [];
      // A short position carries a negative `qty`; keep its sign so allocation can treat it honestly.
      return [
        {
          symbol,
          quantity: qty,
          marketValueUsd: num(p['market_value']),
          costBasisUsd: num(p['cost_basis']),
          unrealizedPnlUsd: num(p['unrealized_pl']),
        },
      ];
    });
  },

  async history(ctx): Promise<PerformancePoint[]> {
    const raw = record(
      await ctx.request.json('GET', '/v2/account/portfolio/history', {
        headers: authHeaders(ctx),
        query: { period: '1M', timeframe: '1D' },
      }),
    );
    const stamps = Array.isArray(raw['timestamp']) ? raw['timestamp'] : [];
    const equity = Array.isArray(raw['equity']) ? raw['equity'] : [];
    const points: PerformancePoint[] = [];
    for (let i = 0; i < Math.min(stamps.length, equity.length); i += 1) {
      const t = num(stamps[i]);
      const e = num(equity[i]);
      // Alpaca pads days with no data with `null`; a gap is skipped, not drawn as zero.
      if (t !== null && e !== null) points.push({ t: t * 1000, equityUsd: e });
    }
    return points;
  },
};
