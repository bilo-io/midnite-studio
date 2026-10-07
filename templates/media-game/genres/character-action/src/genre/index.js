// @ts-check
/**
 * Character action genre (Phase 107 Theme J), third person: combo strings
 * with cancel windows, a launcher into air combos, a style meter from D to
 * SSS, and enemy waves in a ring that seals when you walk in.
 *
 * The combo state machine, the style meter and the wave reducer are
 * engine-free (`kit/core/genre/character-action/`); this file is the
 * three.js glue. It ships its own `src/scenes/level.js` (an empty
 * colosseum floor) and drives the player through the base's `intent` seam:
 * a move roots the body (and lunges it forward during startup), and the
 * launcher's `rise` jumps with the enemy so the air string can follow.
 *
 * J light · K heavy · L launch · SPACE jump · Q lock-on.
 */

import * as THREE from 'three';

import { COMBO_MOVES, comboNow, comboStep, createComboState } from 'kit/core/genre/character-action/combos.js';
import { createStyle, rankFill, styleDamaged, styleHit, styleRank, styleTick } from 'kit/core/genre/character-action/style.js';
import { arenaReducer, arenaSealed, createArena, ringSpawns } from 'kit/core/genre/character-action/waves.js';
import { createDamageNumbers } from 'kit/three/damage-numbers.js';
import { createInput } from 'kit/three/input.js';

const ACTION_BINDINGS = {
  heavy: { keys: ['K'], gamepad: [3] },
  launch: { keys: ['L'], gamepad: [5] },
};

export const PLAYER_SPAWN = /** @type {const} */ ([0, 0.1, 13]);
const ARENA = { centre: /** @type {const} */ ([0, -4]), radius: 12, gateZ: 7.5 };
const PLAYER_HP = 100;
const REACH = 2.6;
const ARC_DEG = 110;
const GRAVITY = 18;

/** @type {Record<string, { hp: number, speed: number, windup: number, active: number, recovery: number, damage: number, reach: number, size: number, color: number }>} */
const ENEMY = {
  grunt: { hp: 45, speed: 2.6, windup: 0.75, active: 0.15, recovery: 0.7, damage: 8, reach: 1.6, size: 0.9, color: 0x6b7280 },
  brute: { hp: 130, speed: 1.7, windup: 1.1, active: 0.2, recovery: 1.0, damage: 18, reach: 2.2, size: 1.4, color: 0x7c2d12 },
};
/** @type {import('kit/core/genre/character-action/waves.js').Wave[]} */
const WAVES = [
  { groups: [{ kind: 'grunt', count: 3 }] },
  { groups: [{ kind: 'grunt', count: 4 }, { kind: 'brute', count: 1 }] },
  { groups: [{ kind: 'brute', count: 2 }, { kind: 'grunt', count: 3 }] },
];

const facingOf = (/** @type {number} */ yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   physics: import('kit/three/physics.js').Physics,
 *   character: ReturnType<typeof import('kit/three/character.js').createCharacter>,
 *   rig: ReturnType<typeof import('kit/three/cameras.js').createCameraRig>,
 *   hud: ReturnType<typeof import('kit/three/hud.js').createHud>,
 *   input: ReturnType<typeof import('kit/three/input.js').createInput>,
 *   avatar?: THREE.Object3D,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { physics, character, rig, hud, input, avatar } = ctx;
  const extra = createInput(ACTION_BINDINGS);
  const numbers = createDamageNumbers({ camera: rig.camera });
  hud.hint('WASD move · J light · K heavy · L launch · SPACE jump · Q lock-on · C camera');

  // --- the ring: a floor disc, pillars, and walls that rise when it seals ----------------
  const [cx, cz] = ARENA.centre;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(ARENA.radius, 48), new THREE.MeshStandardMaterial({ color: 0x5b4636 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(cx, 0.01, cz);
  disc.receiveShadow = true;
  scene.add(disc);
  const WALLS = 20;
  /** @type {THREE.Mesh[]} */
  const walls = [];
  /** @type {ReturnType<import('kit/three/physics.js').Physics['addBox']>[]} */
  let wallColliders = [];
  for (let i = 0; i < WALLS; i += 1) {
    const a = (i / WALLS) * Math.PI * 2;
    const x = cx + Math.cos(a) * (ARENA.radius + 0.4);
    const z = cz + Math.sin(a) * (ARENA.radius + 0.4);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8a7a68 }));
    pillar.position.set(x, 2, z);
    pillar.castShadow = true;
    scene.add(pillar);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(((Math.PI * 2 * ARENA.radius) / WALLS) * 0.95, 3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff4d2e, emissive: 0xff2d0e, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }),
    );
    wall.position.set(cx + Math.cos(a + Math.PI / WALLS) * ARENA.radius, -1.6, cz + Math.sin(a + Math.PI / WALLS) * ARENA.radius);
    wall.rotation.y = -(a + Math.PI / WALLS) + Math.PI / 2;
    scene.add(wall);
    walls.push(wall);
  }
  const seal = (/** @type {boolean} */ up) => {
    for (const c of wallColliders) physics.world.removeCollider(c, true);
    wallColliders = [];
    if (!up) return;
    for (const w of walls) wallColliders.push(physics.addBox([w.position.x, 1.5, w.position.z], [((Math.PI * 2 * ARENA.radius) / WALLS) * 0.48, 1.5, 0.15], w.rotation.y));
  };

  // --- state ------------------------------------------------------------------------------
  let combo = createComboState();
  const style = createStyle();
  let arena = createArena();
  const player = { hp: PLAYER_HP, deaths: 0, hitstun: 0 };
  /** The frame the current move's active window last connected on, so one swing hits each enemy once. */
  let hitMoveAt = -1;
  /** Enemies already struck by the current move. @type {Set<object>} */
  let struck = new Set();
  let wavesCleared = 0;
  let frameNow = 0;

  /**
   * @typedef {{ kind: string, mesh: THREE.Mesh, hp: number, max: number, p: number[], y: number, vy: number,
   *   attack: number, landed: boolean, stun: number, flash: number }} Enemy
   */
  /** @type {Enemy[]} */
  let enemies = [];
  const spawnWave = (/** @type {import('kit/core/genre/character-action/waves.js').Wave} */ wave, /** @type {number} */ index) => {
    const total = wave.groups.reduce((n, g) => n + g.count, 0);
    const spots = ringSpawns(total, ARENA.centre, ARENA.radius - 3, index * 0.7);
    let s = 0;
    for (const group of wave.groups) {
      const def = ENEMY[group.kind] ?? ENEMY.grunt;
      if (!def) continue;
      for (let i = 0; i < group.count; i += 1) {
        const [x = 0, z = 0] = spots[s++] ?? [];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.size, def.size * 1.6, def.size), new THREE.MeshStandardMaterial({ color: def.color }));
        mesh.castShadow = true;
        scene.add(mesh);
        enemies.push({ kind: group.kind, mesh, hp: def.hp, max: def.hp, p: [x, 0, z], y: 0, vy: 0, attack: -1, landed: false, stun: 0, flash: 0 });
      }
    }
  };
  const resetArena = () => {
    for (const e of enemies) scene.remove(e.mesh);
    enemies = [];
    arena = createArena();
    seal(false);
    character.teleport(PLAYER_SPAWN);
    rig.clearLock();
  };

  const hurtPlayer = (/** @type {number} */ amount) => {
    player.hp -= amount;
    player.hitstun = 0.35;
    combo = createComboState();
    styleDamaged(style);
    const [x, y, z] = character.position;
    numbers.spawn([x, y + 2, z], amount, { kind: 'crit' });
    if (player.hp <= 0) {
      player.deaths += 1;
      player.hp = PLAYER_HP;
      resetArena();
      hud.banner('DEFEATED — try again');
      setTimeout(() => hud.banner(null), 1600);
    }
  };

  /** The move's active frames: strike everything in the arc once. */
  const strike = (/** @type {import('kit/core/genre/character-action/combos.js').ComboMove} */ move) => {
    const at = character.position;
    const f = facingOf(character.yaw);
    for (const e of enemies) {
      if (e.hp <= 0 || struck.has(e)) continue;
      const dx = (e.p[0] ?? 0) - (at[0] ?? 0);
      const dz = (e.p[2] ?? 0) - (at[2] ?? 0);
      const dy = e.y - (at[1] ?? 0);
      const d = Math.hypot(dx, dz);
      if (d > REACH + (ENEMY[e.kind]?.size ?? 1) * 0.4 || Math.abs(dy) > 2.2) continue;
      if (d > 0.5 && (dx * (f[0] ?? 0) + dz * (f[1] ?? 0)) / d < Math.cos(((ARC_DEG / 2) * Math.PI) / 180)) continue;
      struck.add(e);
      e.hp -= move.damage;
      e.flash = 0.1;
      e.stun = 0.45;
      e.attack = -1;
      if (move.launcher) e.vy = 9;
      else if (e.y > 0.05) e.vy = Math.max(e.vy, 2.6); // juggle: each air hit holds them up
      if (move.knockback && d > 0) {
        e.p[0] = (e.p[0] ?? 0) + (dx / d) * move.knockback * 0.4;
        e.p[2] = (e.p[2] ?? 0) + (dz / d) * move.knockback * 0.4;
        if (move.name === 'slam') e.vy = -12;
      }
      const points = styleHit(style, { move: move.name, damage: move.damage, chain: combo.chain, air: e.y > 0.05 });
      numbers.spawn([e.p[0] ?? 0, e.y + 2, e.p[2] ?? 0], move.damage, { kind: points > move.damage * 2 ? 'crit' : 'hit' });
      if (e.hp <= 0) {
        scene.remove(e.mesh);
        if (rig.lockTarget && /** @type {unknown} */ (rig.lockTarget) === e) rig.clearLock();
      }
    }
  };

  const stepEnemy = (/** @type {Enemy} */ e, /** @type {number} */ dt) => {
    const def = ENEMY[e.kind] ?? ENEMY.grunt;
    if (!def) return;
    // Airborne enemies fall (juggles hang them a little each hit) and cannot act.
    if (e.y > 0 || e.vy > 0) {
      e.vy -= GRAVITY * dt;
      e.y = Math.max(0, e.y + e.vy * dt);
      if (e.y === 0) e.vy = 0;
    }
    e.stun = Math.max(0, e.stun - dt);
    const [px, , pz] = character.position;
    const dx = px - (e.p[0] ?? 0);
    const dz = pz - (e.p[2] ?? 0);
    const d = Math.hypot(dx, dz) || 1;
    if (e.y === 0 && e.stun === 0) {
      if (e.attack >= 0) {
        e.attack += dt;
        if (!e.landed && e.attack >= def.windup) {
          e.landed = true;
          if (d <= def.reach + 0.3 && player.hitstun === 0) hurtPlayer(def.damage);
        }
        if (e.attack >= def.windup + def.active + def.recovery) e.attack = -1;
      } else if (d <= def.reach) {
        e.attack = 0;
        e.landed = false;
      } else {
        e.p[0] = (e.p[0] ?? 0) + (dx / d) * def.speed * dt;
        e.p[2] = (e.p[2] ?? 0) + (dz / d) * def.speed * dt;
      }
    }
    // Keep them inside the ring.
    const rx = (e.p[0] ?? 0) - cx;
    const rz = (e.p[2] ?? 0) - cz;
    const r = Math.hypot(rx, rz);
    if (r > ARENA.radius - 0.8) {
      e.p[0] = cx + (rx / r) * (ARENA.radius - 0.8);
      e.p[2] = cz + (rz / r) * (ARENA.radius - 0.8);
    }
    e.mesh.position.set(e.p[0] ?? 0, e.y + def.size * 0.8, e.p[2] ?? 0);
    e.mesh.rotation.y = Math.atan2(-dx, -dz);
    e.mesh.rotation.x = e.attack >= 0 && e.attack < def.windup ? -0.3 * (e.attack / def.windup) : e.y > 0 ? 0.6 : 0;
    e.flash = Math.max(0, e.flash - dt);
    const m = /** @type {THREE.MeshStandardMaterial} */ (e.mesh.material);
    m.emissive.setHex(e.flash > 0 ? 0xffffff : e.attack >= 0 && e.attack < def.windup ? 0x802000 : 0x000000);
  };

  return {
    /**
     * During a move the body is rooted, except a forward lunge through the
     * move's startup; the launcher's `rise` jumps with the target.
     * @param {{ direction: readonly number[], run?: boolean, jump?: boolean, face?: boolean }} wish
     * @param {number} _dt
     * @param {number} frame
     */
    intent(wish, _dt, frame) {
      if (player.hitstun > 0) return { direction: [0, 0], run: false, jump: false, face: false };
      const now = comboNow(combo, frame);
      if (!now) return wish;
      const { move, n, phase } = now;
      const rise = move.rise === true && n === move.startup && character.grounded;
      if (phase === 'startup' && move.lunge) {
        const f = facingOf(character.yaw);
        return { direction: f, run: move.lunge > 1.8, jump: rise, face: false };
      }
      return { direction: [0, 0], run: false, jump: rise, face: false };
    },
    update(/** @type {number} */ dt, /** @type {number} */ frame) {
      extra.update();
      frameNow = frame;
      player.hitstun = Math.max(0, player.hitstun - dt);

      // --- the arena: walk through the south gate to seal it --------------------------------
      if (arena.status === 'idle' && character.position[2] < ARENA.gateZ && Math.hypot(character.position[0] - cx, character.position[2] - cz) < ARENA.radius) {
        const r = arenaReducer(arena, WAVES, { type: 'enter' });
        arena = r.state;
        if (r.spawn) spawnWave(r.spawn, 0);
        seal(true);
        hud.banner('WAVE 1');
        setTimeout(() => hud.banner(null), 1200);
      } else if (arena.status !== 'idle') {
        const before = arena.status;
        const r = arenaReducer(arena, WAVES, { type: 'tick', dt, alive: enemies.filter((e) => e.hp > 0).length });
        arena = r.state;
        if (r.spawn) {
          enemies = enemies.filter((e) => e.hp > 0);
          spawnWave(r.spawn, arena.wave);
          hud.banner(`WAVE ${arena.wave + 1}`);
          setTimeout(() => hud.banner(null), 1200);
        }
        if (before !== 'cleared' && arena.status === 'cleared') {
          wavesCleared += 1;
          seal(false);
          hud.banner(`ARENA CLEAR — peak ${styleRank(style.peak)}`);
          setTimeout(() => hud.banner(null), 2500);
        }
      }

      // --- combos ---------------------------------------------------------------------------
      /** @type {import('kit/core/genre/character-action/combos.js').ComboButton | null} */
      let button = null;
      if (player.hitstun === 0) {
        if (input.justPressed('attack')) button = 'light';
        else if (extra.justPressed('heavy')) button = 'heavy';
        else if (extra.justPressed('launch')) button = 'launch';
      }
      const step = comboStep(combo, button, frame, { air: !character.grounded });
      combo = step.state;
      if (step.started) {
        struck = new Set();
        hitMoveAt = frame;
      }
      const now = comboNow(combo, frame);
      if (now && now.phase === 'active') strike(now.move);
      if (avatar) avatar.rotation.x = now && now.phase === 'active' ? -0.25 : 0;

      // --- lock-on: squares the body up to the target when idle ----------------------------------
      if (input.justPressed('lock-on')) rig.toggleLock(character.position, enemies.filter((e) => e.hp > 0).map((e) => Object.assign(e, { position: e.p })));
      const locked = /** @type {Enemy | null} */ (/** @type {unknown} */ (rig.lockTarget));
      if (locked && locked.hp <= 0) rig.clearLock();
      else if (locked && !now) {
        const [px, , pz] = character.position;
        character.yaw = Math.atan2(-((locked.p[0] ?? 0) - px), -((locked.p[2] ?? 0) - pz));
      }

      for (const e of enemies) if (e.hp > 0) stepEnemy(e, dt);
      styleTick(style, dt);
      numbers.update(dt);
      for (const w of walls) w.position.y += ((arenaSealed(arena) ? 1.5 : -1.6) - w.position.y) * Math.min(1, dt * 6);

      const bar = (/** @type {number} */ v, /** @type {number} */ max) => '█'.repeat(Math.round((Math.max(0, v) / max) * 12)).padEnd(12, '░');
      hud.set('hp', `HP ${bar(player.hp, PLAYER_HP)}`);
      hud.set('style', `STYLE ${styleRank(style.score).padEnd(3)} ${bar(rankFill(style.score), 1)}`, { align: 'right' });
      hud.set('combo', combo.chain > 1 ? `${combo.chain} HIT CHAIN` : null, { align: 'right' });
      hud.set('wave', arena.status === 'idle' ? 'Walk into the ring' : arena.status === 'cleared' ? 'Cleared' : `Wave ${arena.wave + 1}/${WAVES.length} · ${enemies.filter((e) => e.hp > 0).length} left`);
    },
    state() {
      const now = comboNow(combo, frameNow);
      return {
        player: { position: character.position.map((v) => Number(v.toFixed(3))), health: player.hp },
        action: {
          move: now?.move.name ?? null,
          phase: now?.phase ?? null,
          chain: combo.chain,
          air: !character.grounded,
          style: styleRank(style.score),
          styleScore: Math.round(style.score),
          arena: arena.status,
          wave: arena.wave + 1,
          enemies: enemies.filter((e) => e.hp > 0).length,
          airborne: enemies.filter((e) => e.hp > 0 && e.y > 0.05).length,
          cleared: wavesCleared,
          deaths: player.deaths,
          moves: COMBO_MOVES.length,
          lastMoveFrame: hitMoveAt,
        },
      };
    },
  };
}
