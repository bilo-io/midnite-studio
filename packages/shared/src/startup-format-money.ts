// Money formatting for the fleet projections. Amounts are integer minor units in the company currency. Hand-rolled
// on purpose: no `Intl` currency or locale formatting, so the output is identical under any LANG.
import { minorExponent } from './startup-fleet';

const MINUS = '−';
const DASH = '—';

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R ', JPY: '¥' };

/** `$`, `€`, `£`, `R `, `¥`; anything else prints its code and a space (`CHF `). */
const symbolFor = (currency: string): string => SYMBOLS[currency] ?? `${currency} `;

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Half away from zero (on a non-negative magnitude this is Math.floor(x + 0.5)). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

function sign(negative: boolean): string {
  return negative ? MINUS : '';
}

export function formatMoney(minor: number, currency: string, opts?: { decimals?: 0 | 2 }): string {
  if (!Number.isFinite(minor)) return DASH;
  const sym = symbolFor(currency);
  const exp = minorExponent(currency);
  const unit = 10 ** exp;
  const abs = Math.abs(minor);
  // A currency with no minor digits has nothing to show after the point.
  if ((opts?.decimals ?? 0) === 0 || exp === 0) {
    const whole = roundHalfUp(abs / unit);
    return `${sign(minor < 0 && whole !== 0)}${sym}${group(whole)}`;
  }
  const rounded = roundHalfUp(abs); // whole minor units
  const whole = Math.floor(rounded / unit);
  const frac = String(rounded % unit).padStart(exp, '0');
  return `${sign(minor < 0 && rounded !== 0)}${sym}${group(whole)}.${frac}`;
}

export function formatCompactMoney(minor: number, currency: string): string {
  if (!Number.isFinite(minor)) return DASH;
  const sym = symbolFor(currency);
  const major = Math.abs(minor) / 10 ** minorExponent(currency);
  const whole = roundHalfUp(major);
  const neg = minor < 0 && whole !== 0;
  const one = (x: number) => String(roundHalfUp(x * 10) / 10);
  if (whole < 1_000) return `${sign(neg)}${sym}${whole}`;
  if (major < 1_000_000) {
    const k = major < 10_000 ? roundHalfUp((major / 1_000) * 10) / 10 : roundHalfUp(major / 1_000);
    if (k < 1_000) return `${sign(neg)}${sym}${k}k`;
  }
  return `${sign(neg)}${sym}${one(major / 1_000_000)}m`;
}
