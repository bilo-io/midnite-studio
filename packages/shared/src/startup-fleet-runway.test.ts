import { describe, expect, it } from 'vitest';

import { buildFleetStarter, seedFleetCatalog, type FleetNode, type FleetProjection } from './startup-fleet';
import { addYearMonths, fleetToRunwayLines } from './startup-fleet-runway';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-11-18T09:00:00.000Z';
const catalog = seedFleetCatalog('USD');
const hw = catalog.hardware[0]!;
const tier = catalog.apiTiers[0]!;
const node = (over: Partial<FleetNode> = {}): FleetNode => ({
  id: u(10), name: 'N', enabled: true, hardwareId: hw.id, apiTierId: tier.id, quantity: 2, utilisationPct: 50, pricePerHourMinor: 100, ...over,
});
function proj(over: Partial<FleetProjection['globals']> = {}, nodes: FleetNode[] = [node()]): FleetProjection {
  const base = buildFleetStarter('gpu-cluster', { projectionId: u(1), nodeId: () => u(99) }, NOW, 'Plan');
  return { ...base, name: 'Plan', nodes, globals: { ...base.globals, scalePct: 100, electricityRateMinor: 20, demandGrowthPct: 0, horizonMonths: 12, energyScalesWithUtilisation: false, ...over } };
}
const gen = () => { let n = 500; return () => u(n++); };

describe('fleetToRunwayLines', () => {
  it('writes hardware, running costs and revenue to the minor unit', () => {
    const lines = fleetToRunwayLines(proj(), catalog, '2026-12', NOW, gen());
    const energy = Math.round(((hw.watts * 730) / 1000) * 20 * 2);
    const api = tier.monthlyMinor * 2;
    expect(lines.map((l) => [l.name, l.kind, l.category, l.cadence, l.minor, l.start, l.growthBpPerMonth])).toEqual([
      ['Plan — hardware', 'cost', 'hardware', 'one-off', hw.priceMinor * 2, '2026-12', 0],
      ['Plan — running costs', 'cost', 'other', 'monthly', Math.round(energy + api), '2026-12', 0],
      ['Plan — revenue', 'revenue', 'revenue', 'monthly', Math.round(100 * 730 * 0.5 * 2), '2026-12', 0],
    ]);
    expect(lines.every((l) => l.source?.projectionId === u(1) && l.source.syncedAt === NOW)).toBe(true);
    expect(lines.map((l) => l.source?.part)).toEqual(['capex', 'opex', 'revenue']);
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });

  it('splits revenue in two when utilisation caps inside the horizon', () => {
    const p = proj({ demandGrowthPct: 10 }, [node({ utilisationPct: 70 })]);
    const lines = fleetToRunwayLines(p, catalog, '2026-12', NOW, gen()).filter((l) => l.kind === 'revenue');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ minor: Math.round(100 * 730 * 0.7 * 2), growthBpPerMonth: 1000, end: '2027-03', source: { part: 'revenue' } });
    expect(lines[1]).toMatchObject({ minor: 100 * 730 * 2, growthBpPerMonth: 0, start: '2027-04', source: { part: 'revenue-capped' } });
    expect(lines[1]!.end).toBeUndefined();
  });

  it('keeps one growing line when the cap lies beyond the horizon', () => {
    const lines = fleetToRunwayLines(proj({ demandGrowthPct: 2 }, [node({ utilisationPct: 10 })]), catalog, '2026-12', NOW, gen()).filter((l) => l.kind === 'revenue');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ growthBpPerMonth: 200 });
  });

  it('gives negative growth a single line', () => {
    const lines = fleetToRunwayLines(proj({ demandGrowthPct: -5 }, [node({ utilisationPct: 90 })]), catalog, '2026-12', NOW, gen()).filter((l) => l.kind === 'revenue');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ growthBpPerMonth: -500 });
  });

  it('omits zero OpEx and zero revenue but always writes capex', () => {
    const free = { ...catalog, hardware: catalog.hardware.map((h) => ({ ...h, watts: 0 })), apiTiers: catalog.apiTiers.map((t) => ({ ...t, monthlyMinor: 0 })) };
    const lines = fleetToRunwayLines(proj({}, [node({ pricePerHourMinor: 0 })]), free, '2026-12', NOW, gen());
    expect(lines.map((l) => l.source?.part)).toEqual(['capex']);
    expect(fleetToRunwayLines(proj({}, []), catalog, '2026-12', NOW, gen()).map((l) => [l.source?.part, l.minor])).toEqual([['capex', 0]]);
  });

  it('lets OpEx follow utilisation growth when the energy switch is on', () => {
    const p = proj({ demandGrowthPct: 2, energyScalesWithUtilisation: true }, [node({ utilisationPct: 10 })]);
    const lines = fleetToRunwayLines(p, catalog, '2026-12', NOW, gen());
    const opex = lines.find((l) => l.source?.part === 'opex')!;
    expect(opex.growthBpPerMonth).toBeGreaterThan(0);
    expect(opex.growthBpPerMonth).toBeLessThanOrEqual(200);
    const flat = fleetToRunwayLines(proj({ demandGrowthPct: 2 }, [node({ utilisationPct: 10 })]), catalog, '2026-12', NOW, gen());
    expect(flat.find((l) => l.source?.part === 'opex')!.growthBpPerMonth).toBe(0);
  });
});

describe('addYearMonths', () => {
  it('rolls over years', () => {
    expect(addYearMonths('2026-11', 3)).toBe('2027-02');
    expect(addYearMonths('2026-12', 0)).toBe('2026-12');
  });
});
