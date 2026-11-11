import { describe, expect, it } from 'vitest';

import { BASE_SCENARIO_ID, type PlanLine, type RunwayScenario } from '@midnite/studio-shared';

import { projectRunway } from './runway';

const base: RunwayScenario = { id: BASE_SCENARIO_ID, name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] };
const line = (over: Partial<PlanLine>): PlanLine => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'cost',
  name: 'Line',
  category: 'other',
  minor: 0,
  cadence: 'monthly',
  start: '2026-01',
  growthBpPerMonth: 0,
  ...over,
});
const run = (over: Partial<Parameters<typeof projectRunway>[0]>) =>
  projectRunway({ openingCashMinor: 0, startMonth: '2026-01', lines: [], scenario: base, months: 12, ...over });

describe('projectRunway', () => {
  it('runs out after ten months on 100 000 cash and 10 000 a month', () => {
    const p = run({ openingCashMinor: 10_000_000, lines: [line({ minor: 1_000_000 })] });
    expect(p.runwayMonths).toBe(10);
    expect(p.zeroCashMonth).toBe('2026-11');
    expect(p.burnMinor).toBe(-1_000_000);
    expect(p.defaultAlive).toBe(false);
  });

  it('puts a yearly line in month 1 and 13 only', () => {
    const p = run({ months: 24, lines: [line({ minor: 1_200_000, cadence: 'yearly' })] });
    expect(p.months.map((m, i) => (m.costMinor > 0 ? i : -1)).filter((i) => i >= 0)).toEqual([0, 12]);
  });

  it('reports never running out as null', () => {
    expect(run({ openingCashMinor: 100, lines: [] }).runwayMonths).toBeNull();
  });

  it('finds the default-alive crossover for 10% monthly revenue growth against 5 000 cost', () => {
    const lines = [line({ minor: 500_000 }), line({ id: '22222222-2222-4222-8222-222222222222', kind: 'revenue', minor: 100_000, growthBpPerMonth: 1000 })];
    const rich = run({ months: 36, openingCashMinor: 100_000_000, lines });
    expect(rich.defaultAlive).toBe(true);
    expect(rich.months.findIndex((m) => m.netMinor >= 0)).toBe(17);
    expect(run({ months: 36, openingCashMinor: 1_000_000, lines }).defaultAlive).toBe(false);
  });

  it('treats a 0% line exactly like a flat one', () => {
    const grown = run({ lines: [line({ minor: 12_345, growthBpPerMonth: 0 })] });
    expect(grown.months.every((m) => m.costMinor === 12_345)).toBe(true);
  });

  it('honours end, one-off and the scenario multipliers and extra lines', () => {
    const scenario: RunwayScenario = { ...base, costMultiplierBp: 5000, extraLines: [line({ id: '33333333-3333-4333-8333-333333333333', minor: 10_000, cadence: 'one-off', start: '2026-03' })] };
    const p = run({ scenario, lines: [line({ minor: 1000, end: '2026-02' })] });
    expect(p.months[0]!.costMinor).toBe(500);
    expect(p.months[2]!.costMinor).toBe(5000);
    expect(p.months[3]!.costMinor).toBe(0);
  });
});
