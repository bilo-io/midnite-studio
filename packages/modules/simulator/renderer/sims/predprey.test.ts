import { describe, expect, it } from 'vitest';

import { AGENT_CAP, createPredPrey, PREDPREY_DEFAULTS, type PredPreyParams } from './predprey';

const run = (p: PredPreyParams, seed: number, ticks: number) => {
  const e = createPredPrey();
  e.init(p, seed);
  const history: number[][] = [];
  for (let i = 0; i < ticks; i++) {
    e.step();
    history.push([e.stats().prey!, e.stats().predators!]);
  }
  return { e, history };
};

describe('predprey', () => {
  it('replays identical counts from the same seed', () => {
    expect(run(PREDPREY_DEFAULTS, 9, 500).history).toEqual(run(PREDPREY_DEFAULTS, 9, 500).history);
  });

  it('never loses prey when there are no predators', () => {
    const { history } = run({ ...PREDPREY_DEFAULTS, predators: 0 }, 1, 300);
    let last = PREDPREY_DEFAULTS.prey;
    for (const [prey] of history) {
      expect(prey!).toBeGreaterThanOrEqual(last);
      last = prey!;
    }
  });

  it('starves predators when there is no prey', () => {
    const { e } = run({ ...PREDPREY_DEFAULTS, prey: 0, predators: 10 }, 1, 600);
    expect(e.stats().predators).toBe(0);
  });

  it('holds the 5000 agent cap and reports it', () => {
    const { e } = run({ ...PREDPREY_DEFAULTS, prey: 4990, predators: 0, preyBirth: 1, startEnergy: 90 }, 2, 10);
    const s = e.stats();
    expect(s.prey! + s.predators!).toBe(AGENT_CAP);
    expect(s.atCap).toBe(1);
    expect(e.snapshot(new Float32Array(e.capacity))).toBe(7 * AGENT_CAP);
  }, 30_000);

  it('keeps every agent in the box and round-trips its state', () => {
    const { e } = run(PREDPREY_DEFAULTS, 4, 100);
    const out = new Float32Array(e.capacity);
    const len = e.snapshot(out);
    for (let i = 0; i < len; i += 7) {
      expect(out[i]!).toBeGreaterThanOrEqual(0);
      expect(out[i]!).toBeLessThanOrEqual(100);
    }
    const b = createPredPrey();
    b.init(PREDPREY_DEFAULTS, 4);
    b.restore(e.serialise());
    e.step();
    b.step();
    expect(b.stats()).toEqual(e.stats());
    const ob = new Float32Array(b.capacity);
    const oe = new Float32Array(e.capacity);
    expect(b.snapshot(ob)).toBe(e.snapshot(oe));
    expect([...ob]).toEqual([...oe]);
  });
});
