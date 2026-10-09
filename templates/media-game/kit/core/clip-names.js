// @ts-check
/**
 * Midnite game kit — matching glTF animation clips to animator states
 * (engine-free).
 *
 * The three.js animator has seven states. Models from Midnite Studio's Models
 * tab name their clips after their kind (`idle`, `walk`, `run`, `jump`,
 * `getHit`, `die`, …); models from elsewhere say `Idle`, `Running`, `Death`,
 * `Armature|Walk` and so on. Matching is case-insensitive, ignores an
 * `Armature|`-style prefix and punctuation, and walks each state's aliases in
 * order, so the first good name wins.
 */

export const ANIMATOR_STATES = /** @type {const} */ (['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'die']);

/** @typedef {(typeof ANIMATOR_STATES)[number]} AnimatorState */

/** @type {Readonly<Record<AnimatorState, readonly string[]>>} */
export const CLIP_ALIASES = Object.freeze({
  idle: ['idle', 'stand', 'standing', 'breathe', 'tpose'],
  walk: ['walk', 'walking', 'walkforward'],
  run: ['run', 'running', 'sprint', 'jog', 'runforward'],
  jump: ['jump', 'jumping', 'jumpstart', 'doublejump', 'fall', 'falling'],
  attack: ['attack', 'punch', 'slash', 'swing', 'shoot', 'kick', 'attack1'],
  hit: ['hit', 'gethit', 'hurt', 'damage', 'hitreact', 'impact'],
  die: ['die', 'death', 'dying', 'dead', 'fallandgetup'],
});

/** Seconds every state change crossfades over. */
export const CROSSFADE_SECONDS = 0.15;

/** `Armature|Run_Fast.001` → `runfast001`; the part after the last `|` only. */
export const normaliseClipName = (/** @type {string} */ name) =>
  (name.split('|').pop() ?? name).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Pick the clip for each state from a model's clip names. An exact alias match
 * beats a prefix match (`run` beats `runfast`); a state with no match is
 * absent from the result, and the animator falls back to `idle` for it.
 * @param {readonly string[]} clipNames
 * @returns {Partial<Record<AnimatorState, string>>}
 */
export function matchClips(clipNames) {
  const normalised = clipNames.map((name) => ({ name, key: normaliseClipName(name) }));
  /** @type {Partial<Record<AnimatorState, string>>} */
  const out = {};
  for (const state of ANIMATOR_STATES) {
    const aliases = CLIP_ALIASES[state];
    const exact = aliases.map((alias) => normalised.find((clip) => clip.key === alias)).find(Boolean);
    const prefix = exact ?? aliases.map((alias) => normalised.find((clip) => clip.key.startsWith(alias))).find(Boolean);
    if (prefix) out[state] = prefix.name;
  }
  return out;
}

/**
 * Which state a moving character should show, from its speed and ground
 * contact; one-shot states (attack, hit, die) are triggered by game code.
 * @param {{ speed: number, grounded: boolean, runSpeed?: number }} motion
 * @returns {AnimatorState}
 */
export function locomotionState({ speed, grounded, runSpeed = 4 }) {
  if (!grounded) return 'jump';
  if (speed < 0.15) return 'idle';
  return speed >= runSpeed * 0.75 ? 'run' : 'walk';
}
