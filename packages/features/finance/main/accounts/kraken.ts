import { createHash, createHmac } from 'node:crypto';

import type { Balance, PerformancePoint, Position } from '@midnite/studio-shared';

import { ConnectorError, type AccountConnector, type ConnectorContext } from './connector';

/**
 * Kraken (crypto) — read-only. `Balance` and `TradeBalance` are the private reads;
 * `Ticker` is the public price list. `AddOrder`, `CancelOrder`, `WithdrawFunds` and
 * every other private endpoint are absent from the allowlist. (`TradeBalance` is a
 * *read* of margin equity despite the name; `connector.ts`'s word guard lets that
 * one name through and nothing else containing "trade".)
 *
 * Kraken itself lets the user mint a key with only "Query funds" — the add form
 * tells them to, and that is the real second lock behind this allowlist.
 */
const BASE = 'https://api.kraken.com';

/**
 * `API-Sign` = base64(HMAC-SHA512(path + SHA256(nonce + body), base64-decoded secret)).
 * Pure, so a known-answer vector pins it (`kraken.test.ts`).
 */
export function krakenSignature(path: string, nonce: string, body: string, secretBase64: string): string {
  const digest = createHash('sha256').update(nonce + body).digest();
  return createHmac('sha512', Buffer.from(secretBase64, 'base64'))
    .update(Buffer.concat([Buffer.from(path, 'utf8'), digest]))
    .digest('base64');
}

let lastNonce = 0;
/** Strictly increasing across calls — Kraken rejects a nonce that does not exceed the last one it saw. */
const nextNonce = (now: number): string => {
  lastNonce = Math.max(now, lastNonce + 1);
  return String(lastNonce);
};

/** Kraken's legacy asset codes (`XXBT`, `ZUSD`, `XETH`) to the symbols people use. */
export function normaliseKrakenAsset(code: string): string {
  const bare = code.replace(/\.(S|M|F|B|P)$/i, '');
  // The legacy four-letter form prefixes `X` (crypto) or `Z` (fiat) to the symbol.
  const stripped = bare.length === 4 && /^[XZ]/.test(bare) ? bare.slice(1) : bare;
  return stripped === 'XBT' ? 'BTC' : stripped === 'XDG' ? 'DOGE' : stripped;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The `result` of a Kraken answer, or a {@link ConnectorError} carrying Kraken's own message. */
function result(raw: unknown): Record<string, unknown> {
  const body = record(raw);
  const errors = Array.isArray(body['error']) ? body['error'].filter((e): e is string => typeof e === 'string') : [];
  if (errors.length > 0) {
    const first = errors[0] ?? '';
    // `EAPI:Invalid key` / `EGeneral:Permission denied` — Kraken's text, never our credential.
    throw new ConnectorError(`kraken: ${first.replace(/^E[A-Za-z]+:/, '')}`);
  }
  return record(body['result']);
}

async function privateCall(ctx: ConnectorContext, path: string): Promise<Record<string, unknown>> {
  const key = ctx.credentials['apiKey'];
  const secret = ctx.credentials['apiSecret'];
  if (!key || !secret) throw new ConnectorError('kraken needs both an API key and a private key');
  const nonce = nextNonce(ctx.now());
  const body = `nonce=${nonce}`;
  return result(
    await ctx.request.json('POST', path, {
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'API-Key': key,
        'API-Sign': krakenSignature(path, nonce, body, secret),
      },
    }),
  );
}

type Holding = { asset: string; code: string; total: number };

async function holdings(ctx: ConnectorContext): Promise<Holding[]> {
  const raw = await privateCall(ctx, '/0/private/Balance');
  return Object.entries(raw).flatMap(([code, value]): Holding[] => {
    const total = num(value);
    return total !== null && total > 0 ? [{ asset: normaliseKrakenAsset(code), code, total }] : [];
  });
}

const USD_LIKE = new Set(['USD']);

/** Last USD price per normalised asset symbol, from the public ticker. Unpriced assets are absent. */
async function usdPrices(ctx: ConnectorContext, assets: string[]): Promise<Record<string, number>> {
  const priced = assets.filter((a) => !USD_LIKE.has(a));
  const out: Record<string, number> = { USD: 1 };
  if (priced.length === 0) return out;
  const pairs = priced.map((a) => `${a === 'BTC' ? 'XBT' : a === 'DOGE' ? 'XDG' : a}USD`).join(',');
  let raw: Record<string, unknown>;
  try {
    raw = result(await ctx.request.json('GET', '/0/public/Ticker', { query: { pair: pairs } }));
  } catch {
    // One unknown pair makes Kraken reject the whole list; the balance is still real, just unpriced.
    return out;
  }
  for (const [pair, row] of Object.entries(raw)) {
    const last = Array.isArray(record(row)['c']) ? num((record(row)['c'] as unknown[])[0]) : null;
    if (last === null) continue;
    // `XXBTZUSD` / `ETHUSD` -> the base asset's symbol.
    out[normaliseKrakenAsset(pair.replace(/Z?USD$/, ''))] = last;
  }
  return out;
}

export const krakenConnector: AccountConnector = {
  id: 'kraken',
  label: 'Kraken',
  assetClass: 'crypto',
  fields: [
    { name: 'apiKey', label: 'API key' },
    { name: 'apiSecret', label: 'Private key' },
  ],
  supportsEnvironment: false,
  readOnlyHint:
    'In Kraken, create a key with only "Query funds" ticked — no trading, no withdrawals. Midnite only ever reads balances and prices.',
  allowedEndpoints: [
    { method: 'POST', path: '/0/private/Balance' },
    { method: 'POST', path: '/0/private/TradeBalance' },
    { method: 'GET', path: '/0/public/Ticker' },
  ],
  baseUrl: () => BASE,

  async balances(ctx): Promise<Balance[]> {
    const held = await holdings(ctx);
    const prices = await usdPrices(ctx, held.map((h) => h.asset));
    return held.map((h) => ({
      currency: h.asset,
      total: h.total,
      available: h.total,
      usd: prices[h.asset] === undefined ? null : h.total * (prices[h.asset] as number),
    }));
  },

  async positions(ctx): Promise<Position[]> {
    const held = (await holdings(ctx)).filter((h) => !USD_LIKE.has(h.asset));
    const prices = await usdPrices(ctx, held.map((h) => h.asset));
    return held.map((h) => ({
      symbol: h.asset,
      quantity: h.total,
      marketValueUsd: prices[h.asset] === undefined ? null : h.total * (prices[h.asset] as number),
      costBasisUsd: null,
      unrealizedPnlUsd: null,
    }));
  },

  async history(ctx): Promise<PerformancePoint[]> {
    // Kraken has no equity curve without paging the ledger; the current trade-balance equity is
    // the one honest point it can give, and `performance` stays null until there are two.
    const raw = await privateCall(ctx, '/0/private/TradeBalance');
    const equity = num(raw['eb']);
    return equity === null ? [] : [{ t: ctx.now(), equityUsd: equity }];
  },
};
