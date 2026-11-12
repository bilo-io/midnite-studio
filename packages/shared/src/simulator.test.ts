import { describe, expect, it } from 'vitest';

import { migrateSimScenario, SimScenarioSchema, SimulatorRequestSchema, type SimScenario } from './simulator';

const scenario: SimScenario = {
  version: 1,
  id: 'sim-abcdefghij12',
  kind: 'life',
  title: 'Glider gun',
  seed: 42,
  params: { rule: 'B3/S23' },
  state: { width: 2, height: 2, cells: [0, 1, 1, 0], generation: 3 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('simulator schemas', () => {
  it('round-trips a valid scenario', () => {
    expect(SimScenarioSchema.parse(JSON.parse(JSON.stringify(scenario)))).toEqual(scenario);
    expect(migrateSimScenario(scenario)).toEqual(scenario);
  });

  it('rejects a path-shaped id', () => {
    expect(SimScenarioSchema.safeParse({ ...scenario, id: 'sim-../x' }).success).toBe(false);
    expect(SimulatorRequestSchema.safeParse({ op: 'read', id: 'sim-../x' }).success).toBe(false);
  });

  it('migrates an unknown version to null', () => {
    expect(migrateSimScenario({ ...scenario, version: 2 })).toBeNull();
  });

  it('accepts a save with or without an id and a filtered list', () => {
    const draft = { kind: 'nbody', title: 'Orbit', seed: 1, params: {} };
    expect(SimulatorRequestSchema.safeParse({ op: 'save', scenario: draft }).success).toBe(true);
    expect(SimulatorRequestSchema.safeParse({ op: 'save', id: scenario.id, scenario: draft }).success).toBe(true);
    expect(SimulatorRequestSchema.safeParse({ op: 'list', kind: 'boids' }).success).toBe(true);
    expect(SimulatorRequestSchema.safeParse({ op: 'list', kind: 'nope' }).success).toBe(false);
  });
});
