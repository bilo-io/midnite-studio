/**
 * Money amounts (Phase 129 Theme B) — integer minor units plus an ISO-4217 code. Never a float: a sum of
 * amounts must be exact, and `number` survives JSON, IPC and zod without a decimal library.
 *
 * Imports `zod` and `./markets` only: this is the wire contract.
 */
import { z } from 'zod';
import { MARKET_CURRENCIES, MarketCurrencyCodeSchema } from './markets';

/** One ISO regex in the repo: the markets one, re-exported. */
export const CurrencyCodeSchema = MarketCurrencyCodeSchema;

/** `z.int()` is the safe-integer check, so `minor` is always within ±2^53. */
export const MoneyAmountSchema = z.object({ minor: z.int(), currency: CurrencyCodeSchema });
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

const THREE_DECIMALS = ['BHD', 'KWD', 'OMR', 'TND'];
const NO_DECIMALS = ['JPY', 'KRW'];

/** Decimal places of each currency's minor unit; everything in `MARKET_CURRENCIES` not listed is 2. */
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, 0 | 2 | 3>> = Object.freeze({
  ...Object.fromEntries(MARKET_CURRENCIES.map((c) => [c.code, 2 as const])),
  ...Object.fromEntries(NO_DECIMALS.map((c) => [c, 0 as const])),
  ...Object.fromEntries(THREE_DECIMALS.map((c) => [c, 3 as const])),
});

export const minorUnitsOf = (code: string): 0 | 2 | 3 => CURRENCY_MINOR_UNITS[code] ?? 2;

export type ParseAmountResult =
  | { ok: true; minor: number }
  | { ok: false; reason: 'empty' | 'not-a-number' | 'too-many-decimals' | 'too-large' };

/** Parses `1,234.56` into minor units by splitting the decimal point as a string; never multiplies a float. */
export function parseAmount(text: string, currency: string): ParseAmountResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const negative = trimmed.startsWith('-');
  const body = (negative ? trimmed.slice(1) : trimmed).replace(/,/g, '').trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(body)) return { ok: false, reason: 'not-a-number' };
  const places = minorUnitsOf(currency);
  const [whole = '', fraction = ''] = body.split('.');
  if (fraction.length > places) return { ok: false, reason: 'too-many-decimals' };
  const digits = `${whole === '' ? '0' : whole}${fraction.padEnd(places, '0')}`.replace(/^0+(?=\d)/, '');
  const value = BigInt(digits);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'too-large' };
  const minor = Number(value);
  return { ok: true, minor: negative && minor !== 0 ? -minor : minor };
}

/** `£1,234.56` — `Intl.NumberFormat` with the currency's exact fraction digits. */
export function formatAmount(amount: MoneyAmount, locale?: string): string {
  const places = minorUnitsOf(amount.currency);
  const sign = amount.minor < 0 ? -1n : 1n;
  const abs = amount.minor < 0 ? -BigInt(amount.minor) : BigInt(amount.minor);
  const scale = 10n ** BigInt(places);
  const whole = abs / scale;
  const frac = abs % scale;
  // Format via a decimal string so a large amount never passes through float division.
  const text = places === 0 ? `${whole}` : `${whole}.${frac.toString().padStart(places, '0')}`;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: amount.currency,
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  // `format` accepts a decimal string (ES2023 NumberFormat v3), keeping full precision.
  return formatter.format((sign < 0n ? `-${text}` : text) as unknown as number);
}

/** `minor × basisPoints / 10000` (both integers),, BigInt intermediate, rounded half away from zero. */
export function percentOfMinor(minor: number, basisPoints: number): number {
  const product = BigInt(minor) * BigInt(basisPoints);
  const denom = 10000n;
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const quotient = (abs * 2n + denom) / (denom * 2n);
  return Number(negative ? -quotient : quotient);
}

/** Largest-remainder split over non-negative integer weights: the parts sum to `minor` exactly. A zero weight total returns all zeros. */
export function allocateMinor(minor: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (total <= 0) return weights.map(() => 0);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const base = weights.map((w) => Number((BigInt(abs) * BigInt(w)) / BigInt(total)));
  const remainders = weights.map((w, i) => ({ i, r: Number((BigInt(abs) * BigInt(w)) % BigInt(total)) }));
  let left = abs - base.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (left <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    left -= 1;
  }
  return negative ? base.map((v) => (v === 0 ? 0 : -v)) : base;
}
