// @ts-check
/**
 * Fighter genre (Phase 107 Theme I): two fighters on a 3D lane — walk, guard
 * by holding back, crouch, sidestep off the line — a move list with frame data
 * (startup, active, recovery), hit and hurt boxes, strings, launchers and
 * juggles, a round and timer system, and a CPU opponent. The stage and the
 * versus camera are `../scenes/level.js`.
 *
 * Everything that decides an outcome is engine-free and frame-counted at 60 fps
 * (`kit/core/genre/fighter/`: frame data, hit boxes, rounds, the CPU), so a
 * replay plays the same fight. This file applies those rules to two bodies and
 * draws them.
 */

import * as THREE from 'three';

import { cpuDecide } from 'kit/core/genre/fighter/cpu.js';
import { inCancelWindow, matchMove, moveByName, movePhase, MOVES, scaleDamage, stunFrames } from 'kit/core/genre/fighter/frame-data.js';
import { hitbox, hurtbox, overlaps, resolveHit } from 'kit/core/genre/fighter/hitboxes.js';
import { createMatch, matchReducer } from 'kit/core/genre/fighter/rounds.js';
import { rng } from 'kit/core/rng.js';
import { createDamageNumbers } from 'kit/three/damage-numbers.js';

import { createFighterModel } from './model.js';

/** Tekken's diamond: U/I are left/right punch, J/K left/right kick. */
export const FIGHTER_BINDINGS = {
  forward: { keys: ['W', 'UP'], gamepad: [12] },
  back: { keys: ['S', 'DOWN'], gamepad: [13] },
  left: { keys: ['A', 'LEFT'], gamepad: [14] },
  right: { keys: ['D', 'RIGHT'], gamepad: [15] },
  crouch: { keys: ['C', 'CTRL'], gamepad: [6] },
  lp: { keys: ['U'], gamepad: [2] },
  rp: { keys: ['I'], gamepad: [3] },
  lk: { keys: ['J'], gamepad: [0] },
  rk: { keys: ['K'], gamepad: [1] },
  pause: { keys: ['ESC', 'P'], gamepad: [8] },
};

const BUTTONS = /** @type {const} */ (['lp', 'rp', 'lk', 'rk']);
const LIMB = /** @type {const} */ ({ lp: 'punch-l', rp: 'punch-r', lk: 'kick-l', rk: 'kick-r' });
const WALK = 2.2;
const BACKWALK = 1.6;
const SIDESTEP = 1.7;
const STAGE_RADIUS = 6.6;
const MIN_GAP = 0.75;
const GRAVITY = 22;
const LAUNCH_VY = 7.5;
const JUGGLE_VY = 3.2;
const KNOCKDOWN_FRAMES = 45;
const CPU_REACTION_FRAMES = 6;

/**
 * @typedef {{
 *   name: 'P1' | 'CPU', model: ReturnType<typeof createFighterModel>,
 *   position: [number, number, number], y: number, vy: number,
 *   move: { move: import('kit/core/genre/fighter/frame-data.js').Move, frame: number, button: string, connected: boolean, queued: string | null } | null,
 *   stun: number, down: number, launched: boolean, guarding: boolean, crouching: boolean,
 *   walk: number, combo: number, flash: number,
 * }} Fighter
 */

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   rig: ReturnType<typeof import('kit/three/cameras.js').createCameraRig>,
 *   hud: ReturnType<typeof import('kit/three/hud.js').createHud>,
 *   input: ReturnType<typeof import('kit/three/input.js').createInput>,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { rig, hud, input } = ctx;
  const numbers = createDamageNumbers({ camera: rig.camera });

  /** @returns {Fighter} */
  const fighter = (/** @type {'P1' | 'CPU'} */ name, /** @type {number} */ x, /** @type {number} */ color, /** @type {number} */ belt) => {
    const model = createFighterModel(color, belt);
    scene.add(model.root);
    return { name, model, position: [x, 0, 0], y: 0, vy: 0, move: null, stun: 0, down: 0, launched: false, guarding: false, crouching: false, walk: 0, combo: 0, flash: 0 };
  };
  const p1 = fighter('P1', -1.6, 0x2f5fd0, 0x111111);
  const p2 = fighter('CPU', 1.6, 0xc8372d, 0xf2f2f2);
  const pair = /** @type {const} */ ([p1, p2]);

  let match = createMatch();
  let lastPhase = match.phase;
  let lastRound = 0;
  let overFor = 0;
  /** @type {ReturnType<typeof cpuDecide>} */
  let cpu = { walk: 0, sidestep: 0, guard: false, crouch: false, attack: null };
  /** @type {{ attacker: string, move: string, result: string, damage: number, combo: number } | null} */
  let lastHit = null;
  let longestCombo = 0;

  const resetPositions = () => {
    p1.position = [-1.6, 0, 0];
    p2.position = [1.6, 0, 0];
    for (const f of pair) {
      f.y = 0;
      f.vy = 0;
      f.move = null;
      f.stun = 0;
      f.down = 0;
      f.launched = false;
      f.combo = 0;
    }
  };

  /** Unit `[x, z]` from `a` to `b` on the ground, and the distance. */
  const axis = (/** @type {Fighter} */ a, /** @type {Fighter} */ b) => {
    const dx = b.position[0] - a.position[0];
    const dz = b.position[2] - a.position[2];
    const d = Math.hypot(dx, dz) || 1e-6;
    return { x: dx / d, z: dz / d, d };
  };
  const airborne = (/** @type {Fighter} */ f) => f.y > 0.001 || f.launched;
  const busy = (/** @type {Fighter} */ f) => f.move !== null || f.stun > 0 || f.down > 0 || airborne(f);

  const startMove = (/** @type {Fighter} */ f, /** @type {string} */ direction, /** @type {string} */ button) => {
    const move = matchMove(MOVES, direction, button);
    if (move) f.move = { move, frame: 0, button, connected: false, queued: null };
  };

  /**
   * One frame of one fighter's control: `toward` / `side` in -1..1 (side is
   * +1 into the screen), and the button pressed this frame, if any.
   * @param {Fighter} f
   * @param {Fighter} foe
   * @param {{ toward: number, side: number, crouch: boolean, guard: boolean, button: string | null, direction: string }} c
   * @param {number} dt
   */
  const control = (f, foe, c, dt) => {
    // In hit- or blockstun a fighter keeps the stance it was caught in (a blocked
    // string stays blocked); on the ground and free it takes this frame's.
    if (f.down > 0 || f.stun > 0 || airborne(f)) return;
    f.guarding = false;
    f.crouching = false;
    if (f.move) {
      // A string's next button, pressed inside the cancel window, chains.
      if (c.button && f.move.move.next?.[c.button] && inCancelWindow(f.move.move, f.move.frame)) f.move.queued = f.move.move.next[c.button] ?? null;
      return;
    }
    f.crouching = c.crouch;
    f.guarding = c.guard;
    if (c.button) {
      startMove(f, c.direction, c.button);
      if (f.move) return;
    }
    if (f.crouching) return;
    const a = axis(f, foe);
    const speed = c.toward > 0 ? WALK : BACKWALK;
    const into = sideVector(a);
    const step = [a.x * c.toward * speed * dt + into[0] * c.side * SIDESTEP * dt, a.z * c.toward * speed * dt + into[1] * c.side * SIDESTEP * dt];
    f.position[0] += step[0] ?? 0;
    f.position[2] += step[1] ?? 0;
    f.walk += Math.hypot(step[0] ?? 0, step[1] ?? 0);
  };

  /** The ground direction "into the screen" (away from the versus camera), perpendicular to the lane. */
  const sideVector = (/** @type {{ x: number, z: number }} */ a) => {
    const forward = rig.camera.getWorldDirection(new THREE.Vector3());
    const perp = [-a.z, a.x];
    const sign = perp[0] * forward.x + perp[1] * forward.z >= 0 ? 1 : -1;
    return [(perp[0] ?? 0) * sign, (perp[1] ?? 0) * sign];
  };

  /** Advance a fighter's move by one frame; resolve its hit on an active frame. */
  const advanceMove = (/** @type {Fighter} */ f, /** @type {Fighter} */ foe) => {
    if (!f.move) return;
    f.move.frame += 1;
    const { move, frame } = f.move;
    const phase = movePhase(move, frame);
    if (phase === 'active' && !f.move.connected && foe.down === 0) {
      const a = axis(f, foe);
      const hit = hitbox({ position: [f.position[0], f.y, f.position[2]], facing: [a.x, a.z] }, move);
      if (overlaps(hit, hurtbox({ position: [foe.position[0], foe.y, foe.position[2]], crouching: foe.crouching }))) {
        f.move.connected = true;
        const result = resolveHit(move.level, { guarding: foe.guarding && foe.move === null && foe.down === 0, crouching: foe.crouching, airborne: airborne(foe) });
        if (result === 'hit') {
          const damage = scaleDamage(move.damage, foe.combo);
          foe.combo += 1;
          longestCombo = Math.max(longestCombo, foe.combo);
          foe.move = null;
          foe.guarding = false;
          foe.stun = stunFrames(move, frame, false);
          foe.flash = 6;
          const juggled = airborne(foe);
          if (move.launcher || juggled) {
            // A launcher pops a grounded fighter up; any hit on an airborne one keeps it up (a juggle).
            foe.launched = true;
            foe.vy = juggled ? Math.max(foe.vy, JUGGLE_VY) : LAUNCH_VY;
          }
          // Knock back along the lane; less in the air, so a juggle can carry on.
          const knock = juggled ? 0.08 : 0.25;
          foe.position[0] += a.x * knock;
          foe.position[2] += a.z * knock;
          match = matchReducer(match, { type: 'damage', target: foe === p1 ? 0 : 1, amount: damage });
          numbers.spawn([foe.position[0], foe.y + 1.9, foe.position[2]], foe.combo > 1 ? `${damage} ×${foe.combo}` : damage, { kind: foe.combo > 1 || move.launcher ? 'crit' : 'hit' });
          lastHit = { attacker: f.name, move: move.name, result, damage, combo: foe.combo };
        } else if (result === 'block') {
          foe.stun = stunFrames(move, frame, true);
          foe.position[0] += a.x * 0.35;
          foe.position[2] += a.z * 0.35;
          numbers.spawn([foe.position[0], foe.y + 1.9, foe.position[2]], 'BLOCK');
          lastHit = { attacker: f.name, move: move.name, result, damage: 0, combo: 0 };
        }
      }
    }
    if (f.move.queued && phase === 'recovery') {
      const next = moveByName(MOVES, f.move.queued);
      f.move = next ? { move: next, frame: 0, button: f.move.button, connected: false, queued: null } : null;
    } else if (phase === 'done') f.move = null;
  };

  /** Gravity, landing, knockdown, stun countdown and combo reset. */
  const physicsStep = (/** @type {Fighter} */ f, /** @type {number} */ dt) => {
    if (airborne(f)) {
      f.vy -= GRAVITY * dt;
      f.y = Math.max(0, f.y + f.vy * dt);
      if (f.y === 0 && f.vy < 0) {
        f.vy = 0;
        if (f.launched) {
          f.launched = false;
          f.down = KNOCKDOWN_FRAMES;
          f.stun = 0;
        }
      }
    } else if (f.down > 0) {
      f.down -= 1;
    } else if (f.stun > 0) {
      f.stun -= 1;
    }
    if (!airborne(f) && f.down === 0 && f.stun === 0) f.combo = 0;
    f.flash = Math.max(0, f.flash - 1);
  };

  /** Keep the pair apart and on the stage. */
  const constrain = () => {
    const a = axis(p1, p2);
    if (a.d < MIN_GAP) {
      const push = (MIN_GAP - a.d) / 2;
      p1.position[0] -= a.x * push;
      p1.position[2] -= a.z * push;
      p2.position[0] += a.x * push;
      p2.position[2] += a.z * push;
    }
    for (const f of pair) {
      const r = Math.hypot(f.position[0], f.position[2]);
      if (r > STAGE_RADIUS) {
        f.position[0] *= STAGE_RADIUS / r;
        f.position[2] *= STAGE_RADIUS / r;
      }
    }
  };

  /** Which way is "toward the opponent" on the screen: +1 when the CPU is to P1's right. */
  const screenToward = () => {
    const right = new THREE.Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 0);
    return (p2.position[0] - p1.position[0]) * right.x + (p2.position[2] - p1.position[2]) * right.z >= 0 ? 1 : -1;
  };

  const pose = (/** @type {Fighter} */ f, /** @type {Fighter} */ foe) => {
    const a = axis(f, foe);
    const m = f.move;
    const phase = m ? movePhase(m.move, m.frame) : null;
    const extend = !m ? 0 : phase === 'startup' ? m.frame / m.move.startup : phase === 'active' ? 1 : 1 - (m.frame - m.move.startup - m.move.active + 1) / m.move.recovery;
    f.model.pose({
      position: f.position,
      y: f.y,
      facing: Math.atan2(a.x, a.z),
      walk: f.walk,
      crouching: f.crouching,
      guarding: f.guarding,
      stunned: f.stun > 0,
      airborne: airborne(f),
      down: f.down > 0 || (match.phase === 'ko' && match.winner !== (f === p1 ? 0 : 1)),
      attack: m ? { limb: LIMB[/** @type {keyof typeof LIMB} */ (m.button)] ?? 'punch-l', extend, level: m.move.level } : null,
      flash: f.flash > 0,
    });
  };

  return {
    /** The versus rig's frame: P1 as the pivot, the CPU as the opponent. */
    cameraFrame() {
      return { pivot: [p1.position[0], p1.y, p1.position[2]], opponent: [p2.position[0], p2.y, p2.position[2]] };
    },
    update(/** @type {number} */ dt, /** @type {number} */ frame) {
      match = matchReducer(match, { type: 'tick', dt });
      if (match.phase !== lastPhase || match.round !== lastRound) {
        if (match.phase === 'intro') {
          resetPositions();
          hud.banner(`ROUND ${match.round}`);
        } else if (match.phase === 'fight') hud.banner(null);
        else if (match.phase === 'ko') hud.banner('K.O.');
        else if (match.phase === 'timeout') hud.banner(match.winner === 'draw' ? 'TIME — DRAW' : 'TIME');
        else if (match.phase === 'over') hud.banner(match.winner === 0 ? 'YOU WIN' : 'YOU LOSE');
        lastPhase = match.phase;
        lastRound = match.round;
      }
      if (match.phase === 'over') {
        overFor += dt;
        if (overFor > 4) {
          match = createMatch();
          overFor = 0;
        }
      }

      if (match.phase === 'fight') {
        // P1 from the pad/keys, relative to the screen.
        const toward = screenToward();
        const h = input.axis('left', 'right') * toward;
        const side = input.axis('back', 'forward');
        const crouch = input.isDown('crouch');
        const button = BUTTONS.find((b) => input.justPressed(b)) ?? null;
        const direction = crouch ? (h > 0 ? 'df' : h < 0 ? 'db' : 'd') : h > 0 ? 'f' : h < 0 ? 'b' : 'n';
        control(p1, p2, { toward: h, side, crouch, guard: h < 0, button, direction }, dt);

        // The CPU decides every few frames — its reaction time.
        if (frame % CPU_REACTION_FRAMES === 0) {
          const foeMove = p1.move && movePhase(p1.move.move, p1.move.frame) === 'startup' ? p1.move.move.level : null;
          cpu = cpuDecide({ distance: axis(p2, p1).d, foeAttacking: foeMove, foeAirborne: airborne(p1), foeStunned: p1.stun > 0, selfBusy: busy(p2) }, () => rng.next());
        }
        const cpuButton = cpu.attack && frame % CPU_REACTION_FRAMES === 0 ? cpu.attack.button : null;
        control(p2, p1, { toward: cpu.walk, side: cpu.sidestep, crouch: cpu.crouch, guard: cpu.guard || cpu.walk < 0, button: cpuButton, direction: cpu.attack?.direction ?? 'n' }, dt);

        advanceMove(p1, p2);
        advanceMove(p2, p1);
      }
      for (const f of pair) physicsStep(f, dt);
      constrain();
      pose(p1, p2);
      pose(p2, p1);
      numbers.update(dt);

      const bar = (/** @type {number} */ hp) => '█'.repeat(Math.round((hp / match.options.maxHp) * 14)).padEnd(14, '░');
      hud.set('p1', `P1  ${bar(match.hp[0])}  ${'●'.repeat(match.wins[0])}`);
      hud.set('p2', `${'●'.repeat(match.wins[1])}  ${bar(match.hp[1])}  CPU`, { align: 'right' });
      hud.set('timer', `ROUND ${match.round} · ${Math.ceil(match.timer)}`, { align: 'right' });
      hud.set('combo', p2.combo > 1 ? `${p2.combo} HIT COMBO` : null);
    },
    state() {
      const describe = (/** @type {Fighter} */ f) => ({
        position: f.position.map((v) => Number(v.toFixed(3))),
        move: f.move ? `${f.move.move.name}:${movePhase(f.move.move, f.move.frame)}` : null,
        stun: f.stun,
        airborne: airborne(f),
        down: f.down > 0,
        guarding: f.guarding,
        crouching: f.crouching,
        combo: f.combo,
      });
      return {
        player: { position: p1.position.map((v) => Number(v.toFixed(3))), health: match.hp[0] },
        fighter: {
          round: match.round,
          phase: match.phase,
          timer: Number(match.timer.toFixed(2)),
          hp: [...match.hp],
          wins: [...match.wins],
          winner: match.winner,
          distance: Number(axis(p1, p2).d.toFixed(3)),
          p1: describe(p1),
          cpu: describe(p2),
          lastHit,
          longestCombo,
        },
      };
    },
  };
}
