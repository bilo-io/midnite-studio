// @ts-check
/**
 * Shooter genre (Phase 107 Theme I), on the first- or third-person base: a
 * rifle, a pistol and a rocket launcher (hitscan and projectile), recoil and
 * spread, magazines and reloads, enemies that path on the navmesh and break
 * line of sight behind crates when hurt, and floating damage numbers.
 *
 * The weapon table, spread cone and cover choice are engine-free
 * (`kit/core/genre/shooter/`); this file is the three.js glue. The base owns
 * the arena, the player and the camera; this module adds crates, enemies and
 * the weapons, and reports itself under `getState().shooter`.
 */

import * as THREE from 'three';

import { coverPointsAround, hasLineOfSight, pickCover } from 'kit/core/genre/shooter/cover.js';
import { spreadCone, spreadDirection } from 'kit/core/genre/shooter/spread.js';
import { createArsenal, currentWeapon, startReload, switchTo, tickArsenal, tryFire } from 'kit/core/genre/shooter/weapons.js';
import { needsNav } from 'kit/core/nav-policy.js';
import { rng } from 'kit/core/rng.js';
import { createDamageNumbers } from 'kit/three/damage-numbers.js';
import { createInput } from 'kit/three/input.js';

import config from '../game.config.js';

/** Extra actions on top of the base's (`attack` is the trigger). */
const SHOOTER_BINDINGS = {
  reload: { keys: ['R'], gamepad: [3] },
  'weapon-next': { keys: ['X'], gamepad: [5] },
  'weapon-1': { keys: ['1'] },
  'weapon-2': { keys: ['2'] },
  'weapon-3': { keys: ['3'] },
};

const PLAYER_HP = 100;
const ENEMY = { hp: 60, speed: 2.4, radius: 0.45, height: 1.8, range: 22, keepAway: 7, shotEvery: 1.1, damage: 6, accuracy: 0.35, hurtMemory: 3 };
const SPAWNS = /** @type {const} */ ([[-12, -20], [12, -20], [0, -24], [-16, -8], [16, -8]]);
/** Extra crates for cover, on top of the base arena's three boxes. */
const CRATES = /** @type {const} */ ([[-9, -14, 1.2], [9, -14, 1.2], [-3, -18, 1], [4, -21, 1], [0, -15, 0.8]]);

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
  const { physics, character, rig, hud, input } = ctx;
  const extra = createInput(SHOOTER_BINDINGS);
  const numbers = createDamageNumbers({ camera: rig.camera });
  hud.crosshair(true);
  hud.hint('WASD move · click/J fire · R reload · X or 1-3 weapon · SHIFT sprint' + (rig.mode === 'third-person' ? ' · C camera' : ''));

  // --- cover: crates, plus every tall box already in the arena -----------------
  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a3a });
  for (const [x, z, half] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(half * 2, half * 2, half * 2), crateMaterial);
    crate.position.set(x, half, z);
    crate.castShadow = crate.receiveShadow = true;
    scene.add(crate);
    physics.addBox([x, half, z], [half, half, half]);
  }
  scene.updateMatrixWorld(true);
  /** @type {THREE.Mesh[]} */
  const solids = [];
  /** @type {THREE.Mesh | null} */
  let floor = null;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.geometry instanceof THREE.PlaneGeometry) floor = o;
    else if (o.geometry instanceof THREE.BoxGeometry) solids.push(o);
  });
  /** @type {import('kit/core/genre/shooter/cover.js').Rect[]} */
  const occluders = solids
    .map((m) => new THREE.Box3().setFromObject(m))
    .filter((b) => b.max.y - b.min.y >= 1 && b.min.y < 1.2 && b.max.x - b.min.x < 10)
    .map((b) => ({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }));
  const coverPoints = coverPointsAround(occluders, 0.9);

  // --- navigation: the navmesh when it builds, straight-line steering if not ---
  /** @type {{ findPath: (a: readonly number[], b: readonly number[]) => [number, number, number][] } | null} */
  let nav = null;
  if (needsNav(config.genre) && floor) {
    const walkable = [/** @type {THREE.Mesh} */ (floor), ...solids];
    import('kit/three/nav.js')
      .then(({ createNavMesh }) => createNavMesh(walkable))
      .then((mesh) => {
        nav = mesh;
      })
      .catch((error) => console.warn('shooter: navmesh unavailable, enemies steer directly', error));
  }

  // --- enemies -----------------------------------------------------------------
  const enemyBody = new THREE.CapsuleGeometry(ENEMY.radius, ENEMY.height - ENEMY.radius * 2, 4, 8);
  /**
   * @typedef {{
   *   mesh: THREE.Mesh, hp: number, position: [number, number, number], path: [number, number, number][],
   *   replanIn: number, shotIn: number, hurtAt: number, mode: 'advance' | 'cover' | 'hold', flash: number,
   * }} Enemy
   */
  /** @type {Enemy[]} */
  const enemies = [];
  let wave = 0;
  let time = 0;
  const spawnWave = () => {
    wave += 1;
    const count = Math.min(SPAWNS.length, 2 + wave);
    for (let i = 0; i < count; i += 1) {
      const [x, z] = /** @type {readonly [number, number]} */ (SPAWNS[i]);
      const mesh = new THREE.Mesh(enemyBody, new THREE.MeshStandardMaterial({ color: 0xd9534f }));
      mesh.castShadow = true;
      scene.add(mesh);
      enemies.push({ mesh, hp: ENEMY.hp, position: [x, 0, z], path: [], replanIn: rng.range(0, 0.5), shotIn: rng.range(0.5, 1.5), hurtAt: -99, mode: 'advance', flash: 0 });
    }
  };
  spawnWave();

  const player = { hp: PLAYER_HP, kills: 0, deaths: 0, hitsTaken: 0 };
  const arsenal = createArsenal({ owned: ['rifle', 'pistol', 'launcher'], reserve: { rifle: 120, pistol: 48, launcher: 4 } });
  let triggerHeld = false;
  let shots = 0;
  let hits = 0;
  /** @type {{ mesh: THREE.Mesh, at: THREE.Vector3, velocity: THREE.Vector3, life: number }[]} */
  const rockets = [];
  const rocketGeometry = new THREE.SphereGeometry(0.15, 8, 6);
  const rocketMaterial = new THREE.MeshBasicMaterial({ color: 0xffa94d });
  /** @type {{ line: THREE.Line, life: number }[]} */
  const tracers = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.8 });

  const centre = (/** @type {Enemy} */ e) => new THREE.Vector3(e.position[0], ENEMY.height / 2, e.position[2]);
  const eye = () => {
    const [x, y, z] = character.position;
    return /** @type {[number, number, number]} */ ([x, y + 1.6, z]);
  };

  /** Ray against an enemy's bounding sphere; distance or null. */
  const raySphere = (/** @type {THREE.Vector3} */ origin, /** @type {THREE.Vector3} */ dir, /** @type {THREE.Vector3} */ c, /** @type {number} */ r) => {
    const oc = origin.clone().sub(c);
    const b = oc.dot(dir);
    const disc = b * b - (oc.lengthSq() - r * r);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : null;
  };

  const damageEnemy = (/** @type {Enemy} */ e, /** @type {number} */ amount, /** @type {THREE.Vector3} */ at) => {
    if (e.hp <= 0) return;
    e.hp -= amount;
    e.hurtAt = time;
    e.flash = 0.12;
    e.replanIn = 0;
    hits += 1;
    numbers.spawn([at.x, at.y + 0.4, at.z], amount, { kind: amount >= 40 ? 'crit' : 'hit' });
    if (e.hp <= 0) {
      player.kills += 1;
      scene.remove(e.mesh);
    }
  };

  const explode = (/** @type {THREE.Vector3} */ at, /** @type {number} */ damage, /** @type {number} */ radius) => {
    for (const e of enemies) {
      const d = centre(e).distanceTo(at);
      if (d <= radius) damageEnemy(e, Math.round(damage * (1 - (d / radius) * 0.6)), centre(e));
    }
  };

  const fireWeapon = () => {
    const result = tryFire(arsenal, { held: triggerHeld });
    if (!result.fired) return;
    shots += 1;
    const w = result.weapon;
    const origin = rig.camera.getWorldPosition(new THREE.Vector3());
    const aim = rig.camera.getWorldDirection(new THREE.Vector3());
    const cone = spreadCone(w.spreadDeg, arsenal.recoil, character.speed > 0.5);
    const dir = new THREE.Vector3(...spreadDirection([aim.x, aim.y, aim.z], cone, () => rng.next()));
    if (w.kind === 'projectile') {
      const mesh = new THREE.Mesh(rocketGeometry, rocketMaterial);
      const start = origin.clone().addScaledVector(dir, 1.2);
      mesh.position.copy(start);
      scene.add(mesh);
      rockets.push({ mesh, at: start, velocity: dir.clone().multiplyScalar(w.speed ?? 20), life: 4 });
      return;
    }
    const wall = physics.castRay([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], w.range, character.collider) ?? w.range;
    /** @type {Enemy | null} */
    let target = null;
    let nearest = wall;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const t = raySphere(origin, dir, centre(e), ENEMY.radius + 0.15);
      if (t !== null && t < nearest) {
        nearest = t;
        target = e;
      }
    }
    const end = origin.clone().addScaledVector(dir, nearest);
    const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin.clone().addScaledVector(dir, 0.6), end]), tracerMaterial);
    scene.add(tracer);
    tracers.push({ line: tracer, life: 0.05 });
    if (target) damageEnemy(target, w.damage, end);
  };

  const respawnPlayer = () => {
    player.hp = PLAYER_HP;
    player.deaths += 1;
    character.teleport([0, 0.1, 6]);
    hud.banner('You died — respawned');
    setTimeout(() => hud.banner(null), 1500);
  };

  const enemyStep = (/** @type {Enemy} */ e, /** @type {number} */ dt) => {
    const me = /** @type {[number, number, number]} */ ([e.position[0], 1.6, e.position[2]]);
    const target = eye();
    const sees = hasLineOfSight(me, target, occluders);
    const dist = Math.hypot(target[0] - me[0], target[2] - me[2]);
    e.replanIn -= dt;
    if (e.replanIn <= 0) {
      e.replanIn = 0.6;
      const hurt = time - e.hurtAt < ENEMY.hurtMemory;
      /** @type {readonly number[] | null} */
      let goal = null;
      if (hurt || e.hp < ENEMY.hp / 2) {
        // Cover-lite: the nearest point the player cannot see.
        goal = pickCover(e.position, target, coverPoints, occluders);
        e.mode = goal ? 'cover' : 'advance';
      }
      if (!goal) {
        e.mode = sees && dist < ENEMY.keepAway ? 'hold' : 'advance';
        goal = e.mode === 'hold' ? null : [target[0], 0, target[2]];
      }
      const to = goal ? [goal[0] ?? 0, 0, goal.length >= 3 ? goal[2] ?? 0 : goal[1] ?? 0] : null;
      e.path = !to ? [] : nav ? nav.findPath(e.position, to).slice(1) : [/** @type {[number, number, number]} */ (to)];
    }
    const next = e.path[0];
    if (next) {
      const dx = next[0] - e.position[0];
      const dz = next[2] - e.position[2];
      const d = Math.hypot(dx, dz);
      const step = ENEMY.speed * dt;
      if (d <= step) e.path.shift();
      else {
        e.position[0] += (dx / d) * step;
        e.position[2] += (dz / d) * step;
      }
    }
    e.mesh.position.set(e.position[0], ENEMY.height / 2, e.position[2]);
    e.mesh.rotation.y = Math.atan2(-(target[0] - e.position[0]), -(target[2] - e.position[2]));
    e.flash = Math.max(0, e.flash - dt);
    /** @type {THREE.MeshStandardMaterial} */ (e.mesh.material).emissive.setHex(e.flash > 0 ? 0xffffff : 0x000000);

    e.shotIn -= dt;
    if (sees && dist < ENEMY.range && e.mode !== 'cover' && e.shotIn <= 0) {
      e.shotIn = ENEMY.shotEvery + rng.range(0, 0.6);
      if (rng.next() < ENEMY.accuracy) {
        player.hp -= ENEMY.damage;
        player.hitsTaken += 1;
        if (player.hp <= 0) respawnPlayer();
      }
    }
  };

  return {
    update(/** @type {number} */ dt) {
      time += dt;
      extra.update();
      tickArsenal(arsenal, dt * 1000);

      if (extra.justPressed('reload')) startReload(arsenal);
      if (extra.justPressed('weapon-next')) switchTo(arsenal, 1);
      for (const [action, id] of /** @type {const} */ ([['weapon-1', 'rifle'], ['weapon-2', 'pistol'], ['weapon-3', 'launcher']])) {
        if (extra.justPressed(action)) switchTo(arsenal, id);
      }
      if (input.isDown('attack')) {
        fireWeapon();
        triggerHeld = true;
      } else triggerHeld = false;

      // Recoil climbs the view; the rig re-aims every step, so this is a pure kick.
      rig.camera.rotation.x += (arsenal.recoil * Math.PI) / 180 / 3;

      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const r = /** @type {(typeof rockets)[number]} */ (rockets[i]);
        const travel = r.velocity.length() * dt;
        const dir = r.velocity.clone().normalize();
        const wall = physics.castRay([r.at.x, r.at.y, r.at.z], [dir.x, dir.y, dir.z], travel, character.collider);
        const enemyHit = enemies.some((e) => e.hp > 0 && centre(e).distanceTo(r.at) < ENEMY.radius + 0.4);
        r.life -= dt;
        if (wall !== null || enemyHit || r.life <= 0 || r.at.y < 0) {
          if (wall !== null) r.at.addScaledVector(dir, wall);
          const w = /** @type {import('kit/core/genre/shooter/weapons.js').ShooterWeapon} */ (arsenal.table['launcher']);
          explode(r.at, w.damage, w.splash ?? 3);
          scene.remove(r.mesh);
          rockets.splice(i, 1);
          continue;
        }
        r.at.addScaledVector(dir, travel);
        r.mesh.position.copy(r.at);
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        const t = /** @type {(typeof tracers)[number]} */ (tracers[i]);
        t.life -= dt;
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }

      for (const e of enemies) if (e.hp > 0) enemyStep(e, dt);
      for (let i = enemies.length - 1; i >= 0; i -= 1) if ((enemies[i]?.hp ?? 0) <= 0) enemies.splice(i, 1);
      if (enemies.length === 0) spawnWave();
      numbers.update(dt);

      const w = currentWeapon(arsenal);
      const slot = arsenal.ammo[arsenal.current] ?? { mag: 0, reserve: 0 };
      hud.set('health', `HP ${Math.max(0, player.hp)}`);
      hud.set('weapon', `${w.id.toUpperCase()}  ${slot.mag} / ${slot.reserve}${arsenal.reloading > 0 ? '  reloading…' : ''}`, { align: 'right' });
      hud.set('wave', `Wave ${wave} · ${enemies.length} left · ${player.kills} kills`, { align: 'right' });
    },
    state() {
      const slot = arsenal.ammo[arsenal.current] ?? { mag: 0, reserve: 0 };
      return {
        player: { position: character.position.map((v) => Number(v.toFixed(3))), health: player.hp },
        shooter: {
          weapon: arsenal.current,
          mag: slot.mag,
          reserve: slot.reserve,
          reloading: arsenal.reloading > 0,
          recoil: Number(arsenal.recoil.toFixed(3)),
          shots,
          hits,
          kills: player.kills,
          deaths: player.deaths,
          wave,
          enemies: enemies.map((e) => ({ hp: e.hp, mode: e.mode, position: e.position.map((v) => Number(v.toFixed(2))) })),
          nav: nav !== null,
          view: { yaw: Number(rig.yaw.toFixed(4)), pitch: Number(rig.pitch.toFixed(4)) },
          damageNumbers: numbers.count,
        },
      };
    },
  };
}
