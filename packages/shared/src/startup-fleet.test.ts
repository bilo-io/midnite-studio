import { describe, expect, it } from 'vitest';

import {
  buildFleetStarter,
  BUILT_IN_API_TIERS,
  BUILT_IN_HARDWARE,
  DEFAULT_MONEY_CURRENCY,
  FleetCatalogSchema,
  minorExponent,
  moneyCurrency,
  seedFleetCatalog,
  FLEET_STARTERS,
  FleetProjectionSchema,
  MAX_FLEET_NODES,
} from './startup-fleet';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-11-17T10:00:00.000Z';
const make = (starter: Parameters<typeof buildFleetStarter>[0] = 'gpu-cluster') => {
  let n = 100;
  return buildFleetStarter(starter, { projectionId: u(1), nodeId: () => u(n++) }, NOW, 'Plan');
};

describe('FleetProjectionSchema', () => {
  const base = make();
  const bad = (over: object) => FleetProjectionSchema.safeParse({ ...base, ...over }).success;
  it('accepts a starter and rejects out-of-range values', () => {
    expect(FleetProjectionSchema.safeParse(base).success).toBe(true);
    expect(bad({ template: { ...base.template, quantity: 0 } })).toBe(false);
    expect(bad({ template: { ...base.template, utilisationPct: 101 } })).toBe(false);
    expect(bad({ globals: { ...base.globals, scalePct: 5 } })).toBe(false);
    expect(bad({ globals: { ...base.globals, horizonMonths: 18 } })).toBe(false);
    expect(bad({ template: { ...base.template, hardwareId: '' } })).toBe(false);
    expect(bad({ name: '   ' })).toBe(false);
  });
  it('rejects more than the node cap', () => {
    const node = base.nodes[0]!;
    const nodes = Array.from({ length: MAX_FLEET_NODES + 1 }, (_, i) => ({ ...node, id: u(1000 + i) }));
    expect(bad({ nodes })).toBe(false);
    expect(bad({ nodes: nodes.slice(0, MAX_FLEET_NODES) })).toBe(true);
  });
});

describe('buildFleetStarter', () => {
  it('produces a valid projection for every starter', () => {
    for (const s of FLEET_STARTERS) expect(FleetProjectionSchema.safeParse(make(s.id)).success).toBe(true);
  });
  it('gpu-cluster has 4 enabled nodes with ids from nodeId()', () => {
    const p = make('gpu-cluster');
    expect(p.nodes.map((n) => n.id)).toEqual([u(100), u(101), u(102), u(103)]);
    expect(p.nodes.every((n) => n.enabled)).toBe(true);
    expect(p.nodes.map((n) => n.name)).toEqual(['Node 1', 'Node 2', 'Node 3', 'Node 4']);
    expect(p.template).toMatchObject({ hardwareId: 'dual-4090', apiTierId: 'pro', utilisationPct: 70, pricePerHourMinor: 150 });
  });
  it('blank has no nodes; api-only has two on the CPU template', () => {
    expect(make('blank').nodes).toEqual([]);
    const p = make('api-only');
    expect(p.nodes).toHaveLength(2);
    expect(p.template).toMatchObject({ hardwareId: 'cpu-1u', apiTierId: 'enterprise', utilisationPct: 50, pricePerHourMinor: 50 });
  });
  it('stamps both timestamps from the supplied clock', () => {
    expect(make()).toMatchObject({ id: u(1), createdAt: NOW, updatedAt: NOW });
  });
});

describe('seedFleetCatalog', () => {
  const price = (c: string, id: string) => seedFleetCatalog(c).hardware.find((h) => h.id === id)?.priceMinor;
  it('scales major units by the currency exponent', () => {
    expect(price('USD', 'dual-4090')).toBe(650_000);
    expect(price('JPY', 'dual-4090')).toBe(6_500);
    expect(minorExponent('JPY')).toBe(0);
  });
  it('seeds every built-in, visible, and parses', () => {
    const c = seedFleetCatalog('GBP');
    expect(FleetCatalogSchema.safeParse(c).success).toBe(true);
    expect(c.hardware.map((h) => h.id)).toEqual(BUILT_IN_HARDWARE.map((h) => h.id));
    expect(c.apiTiers.map((t) => t.id)).toEqual(BUILT_IN_API_TIERS.map((t) => t.id));
    expect([...c.hardware, ...c.apiTiers].every((e) => e.builtIn && !e.hidden)).toBe(true);
  });
});

describe('moneyCurrency', () => {
  it('is USD without a company, else the company currency', () => {
    expect(moneyCurrency(null)).toBe('USD');
    expect(DEFAULT_MONEY_CURRENCY).toBe('USD');
    expect(moneyCurrency({ currency: 'GBP' })).toBe('GBP');
  });
});
