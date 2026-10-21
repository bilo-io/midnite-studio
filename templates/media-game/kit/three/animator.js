// @ts-check
/**
 * Midnite game kit — an `AnimationMixer` state machine for characters.
 *
 * Seven states — idle, walk, run, jump, attack, hit, die — matched to the
 * model's clips by name (`kit/core/clip-names.js`), with a 0.15 s crossfade
 * between them. Locomotion states loop; attack and hit play once and return
 * to locomotion; die plays once and holds its last frame.
 */

import * as THREE from 'three';

import { ANIMATOR_STATES, CROSSFADE_SECONDS, locomotionState, matchClips } from '../core/clip-names.js';

const ONE_SHOT = new Set(['attack', 'hit', 'die']);

/**
 * @param {THREE.Object3D} root the model
 * @param {THREE.AnimationClip[]} clips its animations
 * @param {{ crossfade?: number }} [options]
 */
export function createAnimator(root, clips, options = {}) {
  const fade = options.crossfade ?? CROSSFADE_SECONDS;
  const mixer = new THREE.AnimationMixer(root);
  const names = matchClips(clips.map((clip) => clip.name));
  /** @type {Map<string, THREE.AnimationAction>} */
  const actions = new Map();
  for (const state of ANIMATOR_STATES) {
    const clip = clips.find((c) => c.name === names[state]);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    if (ONE_SHOT.has(state)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions.set(state, action);
  }

  /** @type {string | null} */
  let current = null;
  /** A one-shot that is still playing; locomotion waits for it. */
  let oneShot = /** @type {string | null} */ (null);
  let dead = false;

  mixer.addEventListener('finished', (event) => {
    const finished = [...actions.entries()].find(([, action]) => action === event.action)?.[0];
    if (finished && finished === oneShot && finished !== 'die') oneShot = null;
  });

  /** @param {string} state */
  const play = (state) => {
    const target = actions.has(state) ? state : actions.has('idle') ? 'idle' : null;
    if (!target || target === current) return;
    const next = /** @type {THREE.AnimationAction} */ (actions.get(target));
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (current) actions.get(current)?.fadeOut(fade);
    current = target;
  };

  return {
    mixer,
    /** State name → the clip it plays (missing states fall back to idle). */
    clips: names,
    get state() {
      return current;
    },
    /**
     * Set the state directly. One-shots (attack, hit, die) interrupt
     * locomotion; nothing interrupts die.
     * @param {(typeof ANIMATOR_STATES)[number]} state
     */
    set(state) {
      if (dead) return;
      if (ONE_SHOT.has(state)) {
        oneShot = state;
        if (state === 'die') dead = true;
        if (current === state) actions.get(state)?.reset().play();
        else play(state);
        return;
      }
      if (!oneShot) play(state);
    },
    /**
     * Pick the locomotion state from motion and advance the mixer.
     * @param {number} dt
     * @param {{ speed: number, grounded: boolean, runSpeed?: number }} [motion]
     */
    update(dt, motion) {
      if (motion && !oneShot && !dead) play(locomotionState(motion));
      mixer.update(dt);
    },
  };
}
