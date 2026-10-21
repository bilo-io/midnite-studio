// @ts-check
/**
 * Midnite game kit — a simple scripted RTS opponent (engine-free).
 *
 * A fixed build order, then waves: `aiStep` reads a snapshot and returns the
 * commands to run (`train`, `attack`). Deterministic: no randomness, so a
 * replay with the same inputs plays the same match.
 */

export const AI_SCRIPT = /** @type {const} */ ([
  { type: 'worker' }, { type: 'worker' }, { type: 'soldier' }, { type: 'soldier' }, { type: 'soldier' },
]);

export function createAi(waveSize = 3, waveEveryMs = 30000) {
  return { step: 0, soldiers: 0, nextWaveAt: waveEveryMs, waveEveryMs, waveSize, waves: 0 };
}

/**
 * @param {ReturnType<typeof createAi>} ai
 * @param {{ time: number, minerals: number, queueLength: number, soldierIds: readonly number[] }} view
 * @param {{ unitCost: (type: string) => number }} rules
 * @returns {({ kind: 'train', type: string } | { kind: 'attack', ids: number[] })[]}
 */
export function aiStep(ai, view, rules) {
  /** @type {({ kind: 'train', type: string } | { kind: 'attack', ids: number[] })[]} */
  const commands = [];
  const next = AI_SCRIPT[ai.step % AI_SCRIPT.length];
  if (next && view.queueLength === 0 && view.minerals >= rules.unitCost(next.type)) {
    commands.push({ kind: 'train', type: next.type });
    ai.step += 1;
  }
  if (view.time >= ai.nextWaveAt && view.soldierIds.length >= ai.waveSize) {
    commands.push({ kind: 'attack', ids: view.soldierIds.slice(0, ai.waveSize * 2) });
    ai.waves += 1;
    ai.nextWaveAt += ai.waveEveryMs;
  }
  return commands;
}
