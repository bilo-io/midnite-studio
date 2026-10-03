import { marketCurrency, usdToCurrency, type MarketRates } from '@midnite/studio-shared';

/**
 * Number formatting for the Finance dashboard. Everything is stored in USD;
 * these turn a USD figure (or an amount already in a currency) into text.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, maxFraction: number, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${maxFraction}|${compact}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: compact ? 0 : Math.min(2, maxFraction),
        maximumFractionDigits: compact ? 1 : maxFraction,
        ...(compact ? { notation: 'compact' as const } : {}),
      });
    } catch {
      // An unknown ISO code: fall back to a plain number with the code as a prefix.
      fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: maxFraction });
    }
    formatters.set(key, fmt);
  }
  return fmt;
}

/** Sub-unit prices need more digits (a $0.1234 coin, a 0.0000x pair) — big ones need none. */
const fractionDigits = (amount: number): number => {
  const abs = Math.abs(amount);
  return abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
};

/** An amount already denominated in `currency`. */
export function formatMoney(amount: number, currency: string, options: { compact?: boolean } = {}): string {
  if (!Number.isFinite(amount)) return '—';
  const formatted = currencyFormatter(currency, fractionDigits(amount), options.compact ?? false).format(amount);
  // The fallback formatter has no currency symbol; add the code.
  return /[A-Z]{3}|[^\d.,\s-−]/.test(formatted) ? formatted : `${currency} ${formatted}`;
}

/** A USD figure shown in the display currency. */
export const formatUsd = (usd: number | null, currency: string, rates: MarketRates, options: { compact?: boolean } = {}): string =>
  usd === null ? '—' : formatMoney(usdToCurrency(usd, currency, rates), currency, options);

export const formatPct = (value: number, digits = 2): string =>
  Number.isFinite(value) ? `${Math.abs(value).toFixed(digits)}%` : '—';

/** `+1.20%` / `−0.40%` — with a real minus sign, so it lines up in a tabular column. */
export const formatSignedPct = (value: number, digits = 2): string =>
  Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%` : '—';

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '—';
  const digits = quantity >= 1000 ? 2 : quantity >= 1 ? 4 : 8;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(quantity);
}

/** `just now`, `4m ago`, `3h ago`, `2d ago`. */
export function formatAge(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null) return 'unknown';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const currencyLabel = (code: string): string => `${code} — ${marketCurrency(code).name}`;

/** `4821` → `•••• 4821`. */
export const maskedCard = (lastFour: string): string => `•••• ${lastFour}`;
