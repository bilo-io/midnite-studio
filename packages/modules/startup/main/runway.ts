import type { PlanLine, RunwayScenario } from '@midnite/studio-shared';

export type RunwayMonth = { month: string; revenueMinor: number; costMinor: number; netMinor: number; cashMinor: number };

export type RunwayProjection = {
  months: RunwayMonth[];
  /** Mean net of the first three months; negative means the company is burning cash. */
  burnMinor: number;
  /** Months of cash left; `null` when cash never goes below zero inside the horizon. */
  runwayMonths: number | null;
  /** The first month whose closing cash is below zero. */
  zeroCashMonth: string | null;
  /** Net turns non-negative in some month before cash runs out. */
  defaultAlive: boolean;
};

export type RunwayInput = {
  openingCashMinor: number;
  startMonth: string;
  lines: readonly PlanLine[];
  scenario: RunwayScenario;
  months: 12 | 24 | 36;
};

/** `YYYY-MM` as a month count, so ranges and cadences are integer arithmetic. */
const ordinal = (month: string): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};
const label = (index: number): string => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
const CADENCE_STEP = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** What one line contributes in the month at ordinal `at`: growth compounds monthly from its start, rounding each month. */
function contribution(line: PlanLine, at: number): number {
  const start = ordinal(line.start);
  if (at < start) return 0;
  if (line.end !== undefined && at > ordinal(line.end)) return 0;
  const elapsed = at - start;
  if (line.cadence === 'one-off') return elapsed === 0 ? line.minor : 0;
  if (elapsed % CADENCE_STEP[line.cadence] !== 0) return 0;
  let amount = line.minor;
  for (let i = 0; i < elapsed; i += 1) amount = Math.round((amount * (10000 + line.growthBpPerMonth)) / 10000);
  return amount;
}

const scale = (minor: number, bp: number): number => Math.round((minor * bp) / 10000);

/** Pure monthly cash projection; main runs it so the actuals from the books can feed it, the renderer only draws. */
export function projectRunway(input: RunwayInput): RunwayProjection {
  const { openingCashMinor, startMonth, scenario } = input;
  const lines = [...input.lines, ...scenario.extraLines];
  const first = ordinal(startMonth);
  const months: RunwayMonth[] = [];
  let cash = openingCashMinor;
  for (let i = 0; i < input.months; i += 1) {
    const at = first + i;
    let revenue = 0;
    let cost = 0;
    for (const line of lines) {
      const amount = contribution(line, at);
      if (line.kind === 'revenue') revenue += amount;
      else cost += amount;
    }
    revenue = scale(revenue, scenario.revenueMultiplierBp);
    cost = scale(cost, scenario.costMultiplierBp);
    const net = revenue - cost;
    cash += net;
    months.push({ month: label(at), revenueMinor: revenue, costMinor: cost, netMinor: net, cashMinor: cash });
  }
  const broke = months.findIndex((m) => m.cashMinor < 0);
  const lastSolvent = broke === -1 ? months.length : broke;
  const head = months.slice(0, 3);
  const burnMinor = head.length === 0 ? 0 : Math.round(head.reduce((sum, m) => sum + m.netMinor, 0) / head.length);
  return {
    months,
    burnMinor,
    runwayMonths: broke === -1 ? null : broke,
    zeroCashMonth: broke === -1 ? null : months[broke]!.month,
    defaultAlive: months.slice(0, lastSolvent).some((m) => m.netMinor >= 0),
  };
}
