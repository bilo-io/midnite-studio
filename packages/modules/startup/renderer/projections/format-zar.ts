// ZAR formatting for the fleet projections. Money is integer cents. Hand-rolled on purpose: no `Intl`
// currency or locale formatting, so the output is identical under any LANG (it always prints `R `).

const MINUS = '−';
const DASH = '—';

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

export function formatZar(cents: number, opts?: { decimals?: 0 | 2 }): string {
  if (!Number.isFinite(cents)) return DASH;
  const decimals = opts?.decimals ?? 0;
  const abs = Math.abs(cents);
  if (decimals === 0) {
    const rands = roundHalfUp(abs / 100);
    return `${sign(cents < 0 && rands !== 0)}R ${group(rands)}`;
  }
  const rounded = roundHalfUp(abs); // whole cents
  const whole = Math.floor(rounded / 100);
  const frac = String(rounded % 100).padStart(2, '0');
  return `${sign(cents < 0 && rounded !== 0)}R ${group(whole)}.${frac}`;
}

export function formatCompactZar(cents: number): string {
  if (!Number.isFinite(cents)) return DASH;
  const rands = Math.abs(cents) / 100;
  const whole = roundHalfUp(rands);
  const neg = cents < 0 && whole !== 0;
  const one = (x: number) => String(roundHalfUp(x * 10) / 10);
  if (whole < 1_000) return `${sign(neg)}R ${whole}`;
  if (rands < 1_000_000) {
    const k = rands < 10_000 ? roundHalfUp((rands / 1_000) * 10) / 10 : roundHalfUp(rands / 1_000);
    if (k < 1_000) return `${sign(neg)}R ${k}k`;
  }
  return `${sign(neg)}R ${one(rands / 1_000_000)}m`;
}
