// @ts-check
/**
 * Soulslike genre (Phase 107 Theme I), on the third-person base: stamina,
 * lock-on, a dodge roll with invulnerability frames, light and heavy attacks,
 * a bonfire that heals you and brings the enemies back, and a boss whose
 * pattern changes at two thirds and one third of its health.
 *
 * The stamina economy and the boss's phases and attack choice are engine-free
 * (`kit/core/genre/soulslike/`); lock-on target choice is the kit's
 * `chooseLockTarget`. This file is the three.js glue. The roll replaces the
 * base's jump (same button), and the module reshapes the base's movement
 * through the `intent` seam: a roll drives the body, an attack roots it.
 */

import * as THREE from 'three';

import { bossAttackPhase, bossChooseAttack, bossPhase, bossSpeed } from 'kit/core/genre/soulslike/boss.js';
import { canAct, createStamina, rollInvulnerable, spendStamina, STAMINA, tickStamina } from 'kit/core/genre/soulslike/stamina.js';
import { rng } from 'kit/core/rng.js';
import { createDamageNumbers } from 'kit/three/damage-numbers.js';
import { createInput } from 'kit/three/input.js';

const SOULS_BINDINGS = { heavy: { keys: ['K'], gamepad: [4] } };

const PLAYER_HP = 100;
/** Seconds: when an attack's blow lands, and how long the body stays rooted. */
const ATTACKS = {
  light: { hitAt: 0.22, duration: 0.5, damage: 12, reach: 2.3, arcDeg: 70 },
  heavy: { hitAt: 0.55, duration: 0.95, damage: 28, reach: 2.7, arcDeg: 80 },
};
const HOLLOW = { hp: 40, speed: 1.9, aggro: 10, reach: 1.8, windup: 0.8, active: 0.2, recovery: 0.8, damage: 15 };
const BOSS = { hp: 300, speed: 1.6, wake: 14, home: /** @type {[number, number, number]} */ ([0, 0, -20]) };
const HOLLOW_SPAWNS = /** @type {const} */ ([[-8, -2], [8, -2], [-10, -12]]);
const BONFIRE = /** @type {const} */ ([-4, 0, 8]);
const PLAYER_SPAWN = /** @type {const} */ ([0, 0.1, 6]);

/** Unit `[x, z]` facing for a body yaw (0 looks down -z). */
const facingOf = (/** @type {number} */ yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

/**
 * Whether `target` is within `reach` and inside the `arcDeg` cone of `facing`.
 * @param {readonly number[]} from
 * @param {readonly number[]} facing `[x, z]`
 * @param {readonly number[]} target
 * @param {number} reach
 * @param {number} arcDeg
 */
const inArc = (from, facing, target, reach, arcDeg) => {
  const dx = (target[0] ?? 0) - (from[0] ?? 0);
  const dz = (target[2] ?? 0) - (from[2] ?? 0);
  const d = Math.hypot(dx, dz);
  if (d > reach) return false;
  if (d < 0.3) return true;
  const cos = (dx * (facing[0] ?? 0) + dz * (facing[1] ?? 0)) / d;
  return cos >= Math.cos(((arcDeg / 2) * Math.PI) / 180);
};

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   physics: import('kit/three/physics.js').Physics,
 *   character: ReturnType<typeof import('kit/three/character.js').createCharacter>,
 *   rig: ReturnType<typeof import('kit/three/cameras.js').createCameraRig>,
 *   hud: ReturnType<typeof import('kit/three/hud.js').createHud>,
 *   input: ReturnType<typeof import('kit/three/input.js').createInput>,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { character, rig, hud, input } = ctx;
  const extra = createInput(SOULS_BINDINGS);
  const numbers = createDamageNumbers({ camera: rig.camera });
  hud.hint('WASD move · SPACE roll · J light · K heavy · Q lock-on · E rest · C camera');

  // --- the bonfire ---------------------------------------------------------------
  const bonfire = new THREE.Group();
  const ember = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff5a00, emissiveIntensity: 1.4 }));
  ember.position.y = 0.45;
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.18), new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6 }));
  sword.position.y = 0.9;
  sword.rotation.z = 0.15;
  bonfire.add(ember, sword);
  bonfire.position.set(BONFIRE[0], 0, BONFIRE[2]);
  const fireLight = new THREE.PointLight(0xff8a3d, 6, 8);
  fireLight.position.set(BONFIRE[0], 1.2, BONFIRE[2]);
  scene.add(bonfire, fireLight);

  // --- player state ----------------------------------------------------------------
  const stamina = createStamina();
  const player = { hp: PLAYER_HP, deaths: 0, rests: 0 };
  /** @type {{ kind: 'roll', t: number, dir: [number, number] } | { kind: 'light' | 'heavy', t: number, landed: boolean } | null} */
  let action = null;
  let checkpoint = /** @type {[number, number, number]} */ ([...PLAYER_SPAWN]);
  /** The base's last movement wish, `[x, z]`: a roll goes that way. */
  let lastWish = /** @type {[number, number]} */ ([0, 0]);

  // --- hollows (regular enemies) -----------------------------------------------------
  const hollowGeometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
  /**
   * @typedef {{ mesh: THREE.Mesh, hp: number, position: [number, number, number], home: [number, number, number],
   *   attack: number, struck: boolean, flash: number }} Hollow
   */
  /** @type {Hollow[]} */
  const hollows = HOLLOW_SPAWNS.map(([x, z]) => {
    const mesh = new THREE.Mesh(hollowGeometry, new THREE.MeshStandardMaterial({ color: 0x8a7f6a }));
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, hp: HOLLOW.hp, position: [x, 0, z], home: [x, 0, z], attack: -1, struck: false, flash: 0 };
  });

  // --- the boss --------------------------------------------------------------------------
  const bossMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.2, 6, 12), new THREE.MeshStandardMaterial({ color: 0x5b3a7a }));
  bossMesh.castShadow = true;
  scene.add(bossMesh);
  const boss = {
    hp: BOSS.hp,
    position: /** @type {[number, number, number]} */ ([...BOSS.home]),
    awake: false,
    phase: /** @type {1 | 2 | 3} */ (1),
    /** @type {import('kit/core/genre/soulslike/boss.js').BossAttack | null} */
    attack: null,
    attackT: 0,
    struck: false,
    flash: 0,
    yaw: 0,
  };
  const bossColors = { 1: 0x5b3a7a, 2: 0x8a2f5a, 3: 0xb3261e };

  const resetEnemies = (/** @type {{ boss: boolean }} */ opts) => {
    for (const h of hollows) {
      h.hp = HOLLOW.hp;
      h.position = [...h.home];
      h.attack = -1;
      if (!h.mesh.parent) scene.add(h.mesh);
    }
    if (opts.boss && boss.hp > 0) {
      boss.hp = BOSS.hp;
      boss.position = [...BOSS.home];
      boss.awake = false;
      boss.attack = null;
      boss.phase = 1;
    }
    rig.clearLock();
  };

  const damagePlayer = (/** @type {number} */ amount) => {
    if (action?.kind === 'roll' && rollInvulnerable(action.t)) return false;
    player.hp -= amount;
    const [x, y, z] = character.position;
    numbers.spawn([x, y + 2, z], amount, { kind: 'crit' });
    if (player.hp <= 0) {
      player.deaths += 1;
      player.hp = PLAYER_HP;
      stamina.value = STAMINA.max;
      action = null;
      character.teleport(checkpoint);
      resetEnemies({ boss: true });
      hud.banner('YOU DIED');
      setTimeout(() => hud.banner(null), 1800);
    }
    return true;
  };

  const strike = (/** @type {'light' | 'heavy'} */ kind) => {
    const a = ATTACKS[kind];
    const facing = facingOf(character.yaw);
    const at = character.position;
    for (const h of hollows) {
      if (h.hp > 0 && inArc(at, facing, h.position, a.reach, a.arcDeg)) {
        h.hp -= a.damage;
        h.flash = 0.12;
        numbers.spawn([h.position[0], 1.9, h.position[2]], a.damage);
        if (h.hp <= 0) scene.remove(h.mesh);
      }
    }
    if (boss.hp > 0 && inArc(at, facing, boss.position, a.reach + 0.8, a.arcDeg)) {
      boss.hp = Math.max(0, boss.hp - a.damage);
      boss.flash = 0.12;
      boss.awake = true;
      numbers.spawn([boss.position[0], 3.4, boss.position[2]], a.damage, { kind: kind === 'heavy' ? 'crit' : 'hit' });
      const phase = bossPhase(boss.hp / BOSS.hp);
      if (phase !== boss.phase) {
        boss.phase = phase;
        hud.banner(phase === 2 ? 'The Warden grows restless' : 'The Warden is enraged');
        setTimeout(() => hud.banner(null), 1500);
      }
      if (boss.hp === 0) {
        scene.remove(bossMesh);
        rig.clearLock();
        hud.banner('ENEMY FELLED');
        setTimeout(() => hud.banner(null), 2500);
      }
    }
  };

  const lockCandidates = () => [...hollows.filter((h) => h.hp > 0), ...(boss.hp > 0 ? [boss] : [])];

  const stepHollow = (/** @type {Hollow} */ h, /** @type {number} */ dt) => {
    const [px, , pz] = character.position;
    const dx = px - h.position[0];
    const dz = pz - h.position[2];
    const d = Math.hypot(dx, dz);
    if (h.attack >= 0) {
      h.attack += dt;
      if (!h.struck && h.attack >= HOLLOW.windup) {
        h.struck = true;
        if (d <= HOLLOW.reach + 0.3) damagePlayer(HOLLOW.damage);
      }
      if (h.attack >= HOLLOW.windup + HOLLOW.active + HOLLOW.recovery) h.attack = -1;
    } else if (d < HOLLOW.reach) {
      h.attack = 0;
      h.struck = false;
    } else if (d < HOLLOW.aggro) {
      h.position[0] += (dx / d) * HOLLOW.speed * dt;
      h.position[2] += (dz / d) * HOLLOW.speed * dt;
    }
    h.mesh.position.set(h.position[0], 0.9, h.position[2]);
    h.mesh.rotation.y = Math.atan2(-dx, -dz);
    h.mesh.rotation.x = h.attack >= 0 && h.attack < HOLLOW.windup ? -0.35 * (h.attack / HOLLOW.windup) : 0;
    h.flash = Math.max(0, h.flash - dt);
    /** @type {THREE.MeshStandardMaterial} */ (h.mesh.material).emissive.setHex(h.flash > 0 ? 0xffffff : 0x000000);
  };

  const stepBoss = (/** @type {number} */ dt) => {
    const [px, , pz] = character.position;
    const dx = px - boss.position[0];
    const dz = pz - boss.position[2];
    const d = Math.hypot(dx, dz);
    if (!boss.awake && d < BOSS.wake) boss.awake = true;
    const material = /** @type {THREE.MeshStandardMaterial} */ (bossMesh.material);
    material.color.setHex(bossColors[boss.phase]);
    if (boss.awake) {
      if (boss.attack) {
        boss.attackT += dt;
        const stage = bossAttackPhase(boss.attack, boss.attackT, boss.phase);
        if (stage === 'active') {
          if (boss.attack.name === 'lunge') {
            const f = facingOf(boss.yaw);
            boss.position[0] += (f[0] ?? 0) * 9 * dt;
            boss.position[2] += (f[1] ?? 0) * 9 * dt;
          }
          if (!boss.struck) {
            const radial = boss.attack.name === 'nova' || boss.attack.name === 'sweep';
            const hit = radial ? d <= boss.attack.range : inArc(boss.position, facingOf(boss.yaw), character.position, boss.attack.range, 90);
            if (hit && damagePlayer(boss.attack.damage)) boss.struck = true;
          }
        }
        material.emissive.setHex(stage === 'windup' ? 0x803000 : stage === 'active' ? 0xff4000 : 0x000000);
        if (stage === 'done') boss.attack = null;
      } else {
        boss.yaw = Math.atan2(-dx, -dz);
        const next = bossChooseAttack(boss.phase, d, () => rng.next());
        if (next && rng.next() < 0.04 * bossSpeed(boss.phase)) {
          boss.attack = next;
          boss.attackT = 0;
          boss.struck = false;
        } else if (d > 2.6) {
          const speed = BOSS.speed * bossSpeed(boss.phase);
          boss.position[0] += (dx / d) * speed * dt;
          boss.position[2] += (dz / d) * speed * dt;
        }
        material.emissive.setHex(0x000000);
      }
    }
    boss.flash = Math.max(0, boss.flash - dt);
    if (boss.flash > 0) material.emissive.setHex(0xffffff);
    bossMesh.position.set(boss.position[0], 2, boss.position[2]);
    bossMesh.rotation.y = boss.yaw;
  };

  return {
    /**
     * The base's movement for this step, reshaped: a roll drives the body
     * along its direction at run speed; an attack roots it; the jump button
     * is the roll, so the base never jumps.
     * @param {{ direction: readonly number[], run?: boolean, jump?: boolean, face?: boolean }} wish
     */
    intent(wish) {
      lastWish = [wish.direction[0] ?? 0, wish.direction[1] ?? 0];
      if (action?.kind === 'roll') return { direction: action.dir, run: true, jump: false, face: true };
      if (action) return { direction: [0, 0], run: false, jump: false, face: false };
      return { ...wish, jump: false };
    },
    update(/** @type {number} */ dt) {
      extra.update();
      tickStamina(stamina, action ? 0 : dt);

      if (action) {
        action.t += dt;
        if (action.kind === 'roll') {
          if (action.t >= STAMINA.rollSeconds) action = null;
        } else {
          const a = ATTACKS[action.kind];
          if (!action.landed && action.t >= a.hitAt) {
            action.landed = true;
            strike(action.kind);
          }
          if (action.t >= a.duration) action = null;
        }
      } else if (input.justPressed('jump') && canAct(stamina)) {
        spendStamina(stamina, 'roll');
        // Roll the way the stick points, or straight ahead when it is idle.
        const [mx = 0, mz = 0] = Math.hypot(lastWish[0], lastWish[1]) > 0.1 ? lastWish : facingOf(character.yaw);
        action = { kind: 'roll', t: 0, dir: [mx, mz] };
      } else if (input.justPressed('attack') && canAct(stamina)) {
        spendStamina(stamina, 'light');
        action = { kind: 'light', t: 0, landed: false };
      } else if (extra.justPressed('heavy') && canAct(stamina)) {
        spendStamina(stamina, 'heavy');
        action = { kind: 'heavy', t: 0, landed: false };
      }

      if (input.justPressed('lock-on')) rig.toggleLock(character.position, lockCandidates());
      const locked = rig.lockTarget;
      if (locked && (/** @type {{ hp: number }} */ (/** @type {unknown} */ (locked))).hp <= 0) rig.clearLock();
      else if (locked && action?.kind !== 'roll') {
        // Locked on, the body squares up to the target.
        const [px, , pz] = character.position;
        character.yaw = Math.atan2(-((locked.position[0] ?? 0) - px), -((locked.position[2] ?? 0) - pz));
      }

      if (input.justPressed('interact') && Math.hypot(character.position[0] - BONFIRE[0], character.position[2] - BONFIRE[2]) < 2.2) {
        player.hp = PLAYER_HP;
        player.rests += 1;
        stamina.value = STAMINA.max;
        checkpoint = [BONFIRE[0] + 1.5, 0.1, BONFIRE[2]];
        resetEnemies({ boss: false });
        hud.banner('Bonfire lit — enemies return');
        setTimeout(() => hud.banner(null), 1500);
      }

      for (const h of hollows) if (h.hp > 0) stepHollow(h, dt);
      if (boss.hp > 0) stepBoss(dt);
      numbers.update(dt);

      const bar = (/** @type {number} */ v, /** @type {number} */ max) => '█'.repeat(Math.round((Math.max(0, v) / max) * 12)).padEnd(12, '░');
      hud.set('hp', `HP ${bar(player.hp, PLAYER_HP)}`);
      hud.set('stamina', `ST ${bar(stamina.value, STAMINA.max)}`);
      hud.set('boss', boss.awake && boss.hp > 0 ? `WARDEN · phase ${boss.phase}  ${bar(boss.hp, BOSS.hp)}` : null, { align: 'right' });
      hud.set('lock', rig.lockTarget ? 'LOCKED' : null, { align: 'right' });
    },
    state() {
      return {
        player: { position: character.position.map((v) => Number(v.toFixed(3))), health: player.hp },
        souls: {
          stamina: Number(stamina.value.toFixed(2)),
          action: action?.kind ?? null,
          invulnerable: action?.kind === 'roll' && rollInvulnerable(action.t),
          locked: rig.lockTarget !== null,
          deaths: player.deaths,
          rests: player.rests,
          hollows: hollows.filter((h) => h.hp > 0).length,
          boss: { hp: boss.hp, phase: boss.phase, awake: boss.awake, attack: boss.attack?.name ?? null },
        },
      };
    },
  };
}
