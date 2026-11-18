// vitest/jsdom: pure maths, no browser capability needed.
import { describe, expect, it } from 'vitest';
import { seedFleetCatalog, type FleetCatalog, type FleetNode, type FleetProjection } from '@midnite/studio-shared';
import { computeFleetProjection, type FleetProjectionResult } from './fleet-model';

// The built-in USD catalog (minor units = cents): dual-4090 is $6,500 / 1,200 W, the Pro tier $499 /mo.
const CATALOG: FleetCatalog = seedFleetCatalog('USD');
const compute = (p: FleetProjection) => computeFleetProjection(p, CATALOG);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function node(over: Partial<FleetNode> = {}): FleetNode {
  return {
    id: ID(1),
    name: 'Node 1',
    enabled: true,
    hardwareId: 'dual-4090',
    apiTierId: 'pro',
    quantity: 1,
    utilisationPct: 70,
    pricePerHourMinor: 2_500,
    ...over,
  };
}

function projection(over: { globals?: Partial<FleetProjection['globals']>; nodes?: FleetNode[] } = {}): FleetProjection {
  return {
    id: ID(99),
    name: 'Fixture',
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
    globals: { scalePct: 100, electricityRateMinor: 320, demandGrowthPct: 0, horizonMonths: 12, energyScalesWithUtilisation: false, ...over.globals },
    template: { hardwareId: 'dual-4090', apiTierId: 'starter', quantity: 1, utilisationPct: 70, pricePerHourMinor: 2_500 },
    nodes: over.nodes ?? [node()],
  };
}

function month(r: FleetProjectionResult, i: number) {
  const m = r.series[i];
  if (!m) throw new Error(`no month ${i}`);
  return m;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('computeFleetProjection: hand-worked fixture', () => {
  const r = compute(projection());
  it('matches every figure to the unit', () => {
    expect(r.capexMinor).toBe(650_000);
    expect(r.energyMonthlyMinor).toBe(280_320);
    expect(r.apiMonthlyMinor).toBe(49_900);
    expect(r.opexMonthlyMinor).toBe(330_220);
    expect(r.revenueMonthlyMinor).toBe(1_277_500);
    expect(r.netMarginMonthlyMinor).toBe(947_280);
    expect(r.marginPct).toBeCloseTo((947_280 / 1_277_500) * 100, 9);
  });
  it('pays back in month 1 (net 947,280 against CapEx 650,000)', () => {
    expect(r.paybackMonths).toBe(1);
  });
  it('has no payback when the price per hour is too low to cover OpEx', () => {
    const cheap = compute(projection({ nodes: [node({ pricePerHourMinor: 100 })] }));
    expect(cheap.paybackMonths).toBeNull();
    expect(compute(projection({ globals: { horizonMonths: 36 }, nodes: [node({ pricePerHourMinor: 100 })] })).paybackMonths).toBeNull();
  });
  it('emits a series of horizonMonths with a cumulative start of -CapEx + net', () => {
    expect(r.series).toHaveLength(12);
    expect(month(r, 0)).toMatchObject({ month: 0, energy: 280_320, api: 49_900, revenue: 1_277_500, net: 947_280 });
    expect(month(r, 0).cumulative).toBe(-650_000 + 947_280);
  });
  it('reports per-node figures at month 0', () => {
    expect(r.perNode[ID(1)]).toEqual({ capex: 650_000, opex: 330_220, revenue: 1_277_500, net: 947_280 });
  });
});

describe('computeFleetProjection: $100/h', () => {
  const r = compute(projection({ nodes: [node({ pricePerHourMinor: 10_000 })] }));
  it('hits revenue, net and the cumulative series to the cent', () => {
    expect(r.revenueMonthlyMinor).toBe(5_110_000);
    expect(r.netMarginMonthlyMinor).toBe(4_779_780);
    expect(month(r, 0).cumulative).toBe(4_129_780);
    expect(month(r, 1).cumulative).toBe(8_909_560);
  });
  it('pays back in month 1', () => {
    expect(r.paybackMonths).toBe(1);
  });
});

describe('computeFleetProjection: variations', () => {
  it('scale 200% doubles CapEx, OpEx and revenue', () => {
    const r = compute(projection({ globals: { scalePct: 200 } }));
    expect(r.capexMinor).toBe(1_300_000);
    expect(r.opexMonthlyMinor).toBe(660_440);
    expect(r.revenueMonthlyMinor).toBe(2_555_000);
  });
  it('growth 50% caps utilisation at 100% from month 1 (70 -> 100)', () => {
    const r = compute(projection({ globals: { demandGrowthPct: 50 } }));
    expect(month(r, 0).revenue).toBe(1_277_500);
    expect(month(r, 1).revenue).toBe(2_500 * 730 * 1); // 105% clamped to 100%
    expect(month(r, 5).revenue).toBe(2_500 * 730);
  });
  it('growth -20% decays utilisation each month', () => {
    const r = compute(projection({ globals: { demandGrowthPct: -20 } }));
    expect(month(r, 1).revenue).toBeCloseTo(1_277_500 * 0.8, 4);
    expect(month(r, 2).revenue).toBeCloseTo(1_277_500 * 0.64, 4);
    expect(month(r, 2).revenue).toBeLessThan(month(r, 1).revenue);
  });
  it('energy is full draw by default, independent of utilisation (Decision 6)', () => {
    const lo = compute(projection({ nodes: [node({ utilisationPct: 0 })] }));
    const hi = compute(projection({ nodes: [node({ utilisationPct: 100 })] }));
    expect(lo.energyMonthlyMinor).toBe(280_320);
    expect(hi.energyMonthlyMinor).toBe(280_320);
    expect(lo.marginPct).toBeNull();
  });
  it('with the energy switch on, energy follows utilisation (70 % -> x 0.7)', () => {
    const on = compute(projection({ globals: { energyScalesWithUtilisation: true } }));
    expect(on.energyMonthlyMinor).toBeCloseTo(280_320 * 0.7, 6);
    expect(on.opexMonthlyMinor).toBeCloseTo(280_320 * 0.7 + 49_900, 6);
    expect(on.perNode[ID(1)]?.opex).toBeCloseTo(280_320 * 0.7 + 49_900, 6);
    expect(on.revenueMonthlyMinor).toBe(1_277_500);
    expect(compute(projection({ globals: { energyScalesWithUtilisation: true }, nodes: [node({ utilisationPct: 0 })] })).energyMonthlyMinor).toBe(0);
  });
  it('with the switch on and demand growth, energy follows the grown utilisation, capped at 100 %', () => {
    const r = compute(projection({ globals: { energyScalesWithUtilisation: true, demandGrowthPct: 50 } }));
    expect(month(r, 0).energy).toBeCloseTo(280_320 * 0.7, 6);
    expect(month(r, 1).energy).toBe(280_320);
  });
  it('a missing hardware id prices that node at zero and is reported', () => {
    const r = compute(projection({ nodes: [node({ hardwareId: 'gone' })] }));
    expect(r.missing).toEqual([ID(1)]);
    expect(r.capexMinor).toBe(0);
    expect(r.energyMonthlyMinor).toBe(0);
    expect(r.apiMonthlyMinor).toBe(49_900);
  });
  it('a disabled node contributes zero but keeps a perNode entry', () => {
    const r = compute(
      projection({ nodes: [node(), node({ id: ID(2), name: 'Node 2', enabled: false })] }),
    );
    expect(r.perNode[ID(2)]).toEqual({ capex: 0, opex: 0, revenue: 0, net: 0 });
    expect(r.capexMinor).toBe(650_000);
    expect(r.revenueMonthlyMinor).toBe(1_277_500);
  });
  it('sums several nodes', () => {
    const r = compute(projection({ nodes: [node(), node({ id: ID(2), name: 'Node 2' })] }));
    expect(r.capexMinor).toBe(1_300_000);
    expect(r.revenueMonthlyMinor).toBe(2_555_000);
  });
  it('no nodes -> all zeros, null margin and payback, zero series', () => {
    for (const nodes of [[], [node({ enabled: false })]]) {
      const r = compute(projection({ nodes }));
      expect(r).toMatchObject({
        capexMinor: 0,
        energyMonthlyMinor: 0,
        apiMonthlyMinor: 0,
        opexMonthlyMinor: 0,
        revenueMonthlyMinor: 0,
        netMarginMonthlyMinor: 0,
        marginPct: null,
        paybackMonths: null,
      });
      expect(r.series).toHaveLength(12);
      expect(r.series.every((m) => m.cumulative === 0 && m.net === 0)).toBe(true);
    }
  });
  it('pays back in 1 month when month-0 net already covers CapEx', () => {
    const r = compute(
      projection({ globals: { horizonMonths: 12 }, nodes: [node({ pricePerHourMinor: 1_000_000 })] }),
    );
    expect(r.paybackMonths).toBe(1);
  });
  it('does not mutate or depend on anything outside its input', () => {
    const p = deepFreeze(projection({ nodes: [node(), node({ id: ID(2), enabled: false })] }));
    const a = compute(p);
    const b = compute(p);
    expect(b).toEqual(a);
  });
});

describe('missing catalog entries', () => {
  it('count as zero and are reported, not thrown', () => {
    const r = compute(projection({ nodes: [node({ hardwareId: 'gone' })] }));
    expect(r.missing).toEqual([ID(1)]);
    expect(r.capexMinor).toBe(0);
  });
});
