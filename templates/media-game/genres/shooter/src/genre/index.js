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
 *
 * Game feel (`./fx.js`, `./moments.js`, `./effects.js`): muzzle flash and a flash of light,
 * tracers, bullet-hole decals and impact sparks on the surface that was hit, recoil kick on
 * the camera and the viewmodel, ejected shell casings, hit markers, a kill confirm with a
 * short slow motion, rocket trails and a shockwave, and a sound for every action.
 */

import * as THREE from 'three';

import { coverPointsAround, hasLineOfSight, pickCover } from 'kit/core/genre/shooter/cover.js';
import { spreadCone, spreadDirection } from 'kit/core/genre/shooter/spread.js';
import { createArsenal, currentWeapon, startReload, switchTo, tickArsenal, tryFire } from 'kit/core/genre/shooter/weapons.js';
import { needsNav } from 'kit/core/nav-policy.js';
import { rng } from 'kit/core/rng.js';
import { createInput } from 'kit/three/input.js';

import config from '../game.config.js';
import { createShooterEffects } from './effects.js';

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
 *   fx: ReturnType<typeof import('./fx.js').createFx>,
 *   avatar: THREE.Object3D | null,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { physics, character, rig, hud, input, fx } = ctx;
  const { juice, moment, pop } = fx;
  const extra = createInput(SHOOTER_BINDINGS);
  let numbersSpawned = 0;
  hud.crosshair(true);
  hud.hint('WASD move · click/J fire · R reload · X or 1-3 weapon · SHIFT sprint' + (rig.mode === 'third-person' ? ' · C camera' : ''));

  // --- cover: crates, plus every tall box already in the arena -----------------
  const crateMaterial = fx.materials.get('wood', { repeat: [1, 1], tint: 0xc8b48a, normalScale: 1 });
  const crateTrim = fx.materials.get('metal', { repeat: [1, 1], tint: 0x8f9bb0 });
  for (const [x, z, half] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(half * 2, half * 2, half * 2), crateMaterial);
    crate.position.set(x, half, z);
    crate.castShadow = crate.receiveShadow = true;
    scene.add(crate);
    // Metal straps: a thin band round the middle, so a crate reads as a crate and not a cube.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(half * 2.06, half * 0.22, half * 2.06), crateTrim);
    strap.position.y = 0;
    crate.add(strap);
    physics.addBox([x, half, z], [half, half, half]);
  }
  scene.updateMatrixWorld(true);
  /** @type {THREE.Mesh[]} */
  const solids = [];
  /** @type {THREE.Mesh | null} */
  let floor = null;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.parent !== scene) return;
    if (o.geometry instanceof THREE.PlaneGeometry) floor = o;
    else if (o.geometry instanceof THREE.BoxGeometry) solids.push(o);
  });
  /** @type {import('kit/core/genre/shooter/cover.js').Rect[]} */
  const occluders = solids
    .map((m) => new THREE.Box3().setFromObject(m))
    .filter((b) => b.max.y - b.min.y >= 1 && b.min.y < 1.2 && b.max.x - b.min.x < 10)
    .map((b) => ({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }));
  const coverPoints = coverPointsAround(occluders, 0.9);
  const effects = createShooterEffects({ scene, camera: rig.camera, avatar: ctx.avatar, fx, solids });

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
  const enemyBody = new THREE.CapsuleGeometry(ENEMY.radius, ENEMY.height - ENEMY.radius * 2, 4, 10);
  const enemyArmour = fx.materials.get('tiles', { repeat: [1, 2], tint: 0xe0645f, normalScale: 0.7, roughness: 0.8 });
  const visorGeometry = new THREE.BoxGeometry(0.46, 0.1, 0.12);
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a3c, emissiveIntensity: 2 });  /**
   * @typedef {{
   *   mesh: THREE.Mesh, hp: number, position: [number, number, number], path: [number, number, number][],
   *   replanIn: number, shotIn: number, hurtAt: number, mode: 'advance' | 'cover' | 'hold',
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
      const mesh = new THREE.Mesh(enemyBody, enemyArmour);
      mesh.castShadow = true;
      // A glowing visor on the front (-z), so an enemy shows which way it is looking.
      const visor = new THREE.Mesh(visorGeometry, visorMaterial);
      visor.position.set(0, 0.42, -ENEMY.radius + 0.02);
      mesh.add(visor);
      scene.add(mesh);
      enemies.push({ mesh, hp: ENEMY.hp, position: [x, 0, z], path: [], replanIn: rng.range(0, 0.5), shotIn: rng.range(0.5, 1.5), hurtAt: -99, mode: 'advance' });
    }
    if (wave > 1) {
      moment('wave-start');
      pop(`WAVE ${wave}`, { y: 24, size: 34, color: '#9ec5ff' });
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
  const rocketGeometry = new THREE.CapsuleGeometry(0.07, 0.3, 3, 8).rotateX(Math.PI / 2);
  const rocketMaterial = new THREE.MeshBasicMaterial({ color: 0xffa94d });
  let killStreak = 0;
  let lastKillAt = -99;
  let wasReloading = false;
  let lastWeapon = arsenal.current;
  effects.equip(arsenal.current);

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

  /** The kill streak's call-out: a second kill within 2.5 s is a DOUBLE, and so on. */
  const STREAK = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'RAMPAGE'];

  /** A killed enemy keels over and sinks before it leaves the scene (it is already out of `enemies`). */
  const topple = (/** @type {Enemy} */ e) => {
    const mesh = e.mesh;
    const side = rng.next() < 0.5 ? 1 : -1;
    juice.tween({
      duration: 0.55,
      ease: 'inQuad',
      onUpdate: (v) => {
        mesh.rotation.z = side * v * (Math.PI / 2);
        mesh.position.y = ENEMY.height / 2 - v * (ENEMY.height / 2 - ENEMY.radius);
      },
    });
    juice.tween({ duration: 0.4, delay: 1.2, onUpdate: (v) => mesh.scale.setScalar(1 - v * 0.9), onComplete: () => scene.remove(mesh) });
  };

  const damageEnemy = (/** @type {Enemy} */ e, /** @type {number} */ amount, /** @type {THREE.Vector3} */ at, /** @type {readonly number[]} */ [dx = 0, dy = 0, dz = 0] = []) => {
    if (e.hp <= 0) return;
    e.hp -= amount;
    e.hurtAt = time;
    e.replanIn = 0;
    hits += 1;
    const crit = amount >= 40;
    const kill = e.hp <= 0;
    const spot = [at.x, at.y, at.z];
    moment(crit ? 'enemy-crit' : 'enemy-hit', { object: e.mesh, position: spot, dir: [-dx, -dy + 0.4, -dz], text: amount, textKind: crit ? 'crit' : 'hit' });
    numbersSpawned += 1;
    effects.hitMarker(kill ? 'kill' : crit ? 'crit' : 'hit');
    moment('hit-marker');
    if (kill) {
      player.kills += 1;
      killStreak = time - lastKillAt < 2.5 ? killStreak + 1 : 1;
      lastKillAt = time;
      moment('kill-confirm', { position: centre(e).toArray() });
      pop(killStreak > 1 ? (STREAK[Math.min(killStreak, STREAK.length - 1)] ?? 'RAMPAGE') : 'KILL', { y: 58, size: killStreak > 1 ? 32 : 22, color: killStreak > 1 ? '#ffd37a' : '#ff6b6b', seconds: 1 });
      topple(e);
    }
  };

  const explode = (/** @type {THREE.Vector3} */ at, /** @type {number} */ damage, /** @type {number} */ radius) => {
    for (const e of enemies) {
      const d = centre(e).distanceTo(at);
      if (d <= radius) damageEnemy(e, Math.round(damage * (1 - (d / radius) * 0.6)), centre(e), [0, 0, 0]);
    }
    const [px, py, pz] = character.position;
    const away = Math.hypot(px - at.x, (py ?? 0) - at.y, pz - at.z);
    moment('explosion', { position: at.toArray(), strength: Math.max(0.3, Math.min(1, 1 - away / 30)) });
    effects.light(at.toArray(), 70, 0xffa04d);
    effects.shockwave(at.toArray(), radius);
    effects.decal([at.x, Math.max(0.02, at.y), at.z], [0, 1, 0]);
  };

  const fireWeapon = () => {
    const result = tryFire(arsenal, { held: triggerHeld });
    if (!result.fired) return;
    shots += 1;
    const w = result.weapon;
    const gunPoint = effects.muzzlePosition();
    effects.kick(w.id === 'launcher' ? 1.5 : w.id === 'pistol' ? 0.9 : 0.55);
    moment(`fire-${w.id}`, { position: gunPoint.toArray(), dir: rig.camera.getWorldDirection(new THREE.Vector3()).toArray() });
    effects.light(gunPoint.toArray(), w.id === 'launcher' ? 40 : 18);
    if (w.kind === 'hitscan') effects.eject();
    const origin = rig.camera.getWorldPosition(new THREE.Vector3());
    const aim = rig.camera.getWorldDirection(new THREE.Vector3());
    const cone = spreadCone(w.spreadDeg, arsenal.recoil, character.speed > 0.5);
    const dir = new THREE.Vector3(...spreadDirection([aim.x, aim.y, aim.z], cone, () => rng.next()));
    if (w.kind === 'projectile') {
      const mesh = new THREE.Mesh(rocketGeometry, rocketMaterial);
      const start = origin.clone().addScaledVector(dir, 1.2);
      mesh.lookAt(start.clone().add(dir));
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
    effects.tracer(gunPoint.toArray(), end.toArray());
    if (target) damageEnemy(target, w.damage, end, dir.toArray());
    else if (wall !== null) {
      // A bullet hole and sparks that fly out along the surface normal.
      const normal = effects.decal(end.toArray(), dir.clone().negate().toArray());
      moment(end.y < 0.06 ? 'impact-floor' : 'impact-wall', { position: end.toArray(), dir: normal });
    }
  };

  const respawnPlayer = () => {
    moment('player-down');
    player.hp = PLAYER_HP;
    player.deaths += 1;
    character.teleport([0, 0.1, 6]);
    moment('respawn');
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

    e.shotIn -= dt;
    if (sees && dist < ENEMY.range && e.mode !== 'cover' && e.shotIn <= 0) {
      e.shotIn = ENEMY.shotEvery + rng.range(0, 0.6);
      const aimAt = new THREE.Vector3(target[0], target[1] - 0.2, target[2]);
      const from = new THREE.Vector3(me[0], 1.3, me[2]);
      const heading = aimAt.clone().sub(from).normalize();
      const muzzlePoint = from.clone().addScaledVector(heading, 0.6);
      moment('enemy-fire', { position: muzzlePoint.toArray(), dir: heading.toArray() });
      if (rng.next() < ENEMY.accuracy) {
        effects.tracer(muzzlePoint.toArray(), aimAt.toArray(), 0xff9a5c, 0.09);
        player.hp -= ENEMY.damage;
        player.hitsTaken += 1;
        moment('player-hurt');
        if (player.hp <= 0) respawnPlayer();
      } else {
        // A miss streaks past: the tracer overshoots and the bullet whizzes.
        const wide = aimAt.clone().addScaledVector(new THREE.Vector3(-heading.z, 0.2, heading.x), (rng.next() - 0.5) * 3).addScaledVector(heading, 3);
        effects.tracer(muzzlePoint.toArray(), wide.toArray(), 0xff9a5c, 0.09);
        moment('bullet-whiz', { position: wide.toArray() });
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
      if (input.justPressed('attack') && arsenal.reloading <= 0 && (arsenal.ammo[arsenal.current]?.mag ?? 1) === 0) moment('dry-fire');
      if (input.isDown('attack')) {
        fireWeapon();
        triggerHeld = true;
      } else triggerHeld = false;

      // Reloads and weapon swaps are heard and seen: the viewmodel dips through a reload.
      if (arsenal.current !== lastWeapon) {
        lastWeapon = arsenal.current;
        effects.equip(arsenal.current);
        moment('weapon-switch');
      }
      const reloadingNow = arsenal.reloading > 0;
      if (reloadingNow && !wasReloading) moment('reload-start');
      if (!reloadingNow && wasReloading) moment('reload-done');
      wasReloading = reloadingNow;
      effects.reloading(reloadingNow ? 1 - arsenal.reloading / currentWeapon(arsenal).reloadMs : -1);

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
        // A smoking, glowing trail, and the rocket lights what it passes.
        juice.burst('spark', r.at.toArray(), { count: 2, scale: 0.4, colors: [0xffc27a, 0xff8a3d], dir: [-dir.x, -dir.y, -dir.z] });
        juice.burst('dust', r.at.toArray(), { count: 1, scale: 0.5, dir: [-dir.x, -dir.y, -dir.z] });
        effects.light(r.at.toArray(), 9, 0xff9a4d);
      }

      for (const e of enemies) if (e.hp > 0) enemyStep(e, dt);
      for (let i = enemies.length - 1; i >= 0; i -= 1) if ((enemies[i]?.hp ?? 0) <= 0) enemies.splice(i, 1);
      if (enemies.length === 0) spawnWave();
      effects.update(dt, character.speed);

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
          damageNumbers: numbersSpawned,
          fx: { moments: fx.moments, last: fx.lastMoment, killStreak, ...effects.counts },
        },
      };
    },
  };
}
