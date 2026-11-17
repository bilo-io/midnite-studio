import { describe, expect, it } from 'vitest';

import {
  API_TIERS,
  API_TIER_IDS,
  buildFleetStarter,
  FLEET_STARTERS,
  FleetProjectionSchema,
  HARDWARE_CATALOG,
  HARDWARE_IDS,
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
    expect(bad({ template: { ...base.template, hardwareId: 'nope' } })).toBe(false);
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
    expect(p.template).toMatchObject({ hardwareId: 'dual-4090', apiTierId: 'pro', utilisationPct: 70, pricePerHourCents: 2500 });
  });
  it('blank has no nodes; api-only has two on the CPU template', () => {
    expect(make('blank').nodes).toEqual([]);
    const p = make('api-only');
    expect(p.nodes).toHaveLength(2);
    expect(p.template).toMatchObject({ hardwareId: 'cpu-1u', apiTierId: 'enterprise', utilisationPct: 50, pricePerHourCents: 800 });
  });
  it('stamps both timestamps from the supplied clock', () => {
    expect(make()).toMatchObject({ id: u(1), createdAt: NOW, updatedAt: NOW });
  });
});

describe('catalog ids', () => {
  it('match the id tuples', () => {
    expect([...HARDWARE_IDS]).toEqual(HARDWARE_CATALOG.map((h) => h.id));
    expect([...API_TIER_IDS]).toEqual(API_TIERS.map((t) => t.id));
  });
});
