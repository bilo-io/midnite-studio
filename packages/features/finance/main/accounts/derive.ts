import type {
  AllocationSlice,
  Balance,
  PerformancePoint,
  PerformanceSummary,
  Position,
} from '@midnite/studio-shared';

/**
 * Allocation and performance, derived — pure functions over what a connector returned (Phase 113
 * Theme P slice 2). Nothing here fetches; the table tests in `derive.test.ts` are the spec.
 */

/** Slices smaller than this share fold into one "Other" so a donut stays legible. */
export const OTHER_BELOW = 0.02;

const round = (n: number): number => Math.round(n * 1e8) / 1e8;

function toSlices(entries: { label: string; valueUsd: number }[]): AllocationSlice[] {
  // Only value that is positive and known counts: a short position or an unpriced balance has no slice.
  const merged = new Map<string, number>();
  for (const { label, valueUsd } of entries) {
    if (valueUsd > 0 && Number.isFinite(valueUsd)) merged.set(label, (merged.get(label) ?? 0) + valueUsd);
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const big = sorted.filter(([, v]) => v / total >= OTHER_BELOW);
  const small = sorted.filter(([, v]) => v / total < OTHER_BELOW);
  const slices = big.map(([label, valueUsd]) => ({ label, valueUsd: round(valueUsd), weight: round(valueUsd / total) }));
  const rest = small.reduce((a, [, v]) => a + v, 0);
  if (rest > 0) slices.push({ label: 'Other', valueUsd: round(rest), weight: round(rest / total) });
  return slices;
}

/**
 * Allocation **by asset** of one account: each position's market value, plus cash (balances that are
 * not also a position — a crypto asset appears as both a balance and a position, so counting both
 * would double it; cash is therefore only the USD-valued balances for a currency with no position).
 */
export function allocationByAsset(balances: Balance[], positions: Position[]): AllocationSlice[] {
  const held = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const entries = [
    ...positions.map((p) => ({ label: p.symbol, valueUsd: p.marketValueUsd ?? 0 })),
    ...balances
      .filter((b) => !held.has(b.currency.toUpperCase()))
      .map((b) => ({ label: b.currency, valueUsd: b.usd ?? 0 })),
  ];
  return toSlices(entries);
}

/** Allocation **by account**: one slice per account, valued at its total. Errored accounts carry 0 and drop out. */
export function allocationByAccount(accounts: { label: string; totalUsd: number }[]): AllocationSlice[] {
  return toSlices(accounts.map((a) => ({ label: a.label, valueUsd: a.totalUsd })));
}

/** The account's USD value: priced positions plus priced balances that are not positions. */
export function totalUsd(balances: Balance[], positions: Position[]): number {
  const held = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const invested = positions.reduce((sum, p) => sum + (p.marketValueUsd ?? 0), 0);
  const cash = balances
    .filter((b) => !held.has(b.currency.toUpperCase()))
    .reduce((sum, b) => sum + (b.usd ?? 0), 0);
  return round(invested + cash);
}

/** First-to-last change of an equity curve; `null` for fewer than two points. */
export function summarisePerformance(history: PerformancePoint[]): PerformanceSummary | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.t - b.t);
  const start = (sorted[0] as PerformancePoint).equityUsd;
  const end = (sorted[sorted.length - 1] as PerformancePoint).equityUsd;
  return {
    startUsd: start,
    endUsd: end,
    changeUsd: round(end - start),
    changePct: start === 0 ? null : round((end - start) / start),
  };
}
