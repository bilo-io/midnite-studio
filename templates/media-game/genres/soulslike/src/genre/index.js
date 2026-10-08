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
 *
 * Game feel (`./fx.js`, `./moments.js`, `./curtain.js`): weighty hit-stop and a slashing arc on
 * every blow, a staggered enemy, a blue parry flash when a roll's invulnerable frames swallow an
 * attack, a whoosh and a tuck on the dodge roll, a flickering bonfire that bursts into embers
 * when you rest, the "YOU DIED" fade, a stamina-out gasp, and a sound for every action.
 */

import * as THREE from 'three';

import { bossAttackPhase, bossChooseAttack, bossPhase, bossSpeed } from 'kit/core/genre/soulslike/boss.js';
import { canAct, createStamina, rollInvulnerable, spendStamina, STAMINA, tickStamina } from 'kit/core/genre/soulslike/stamina.js';
import { rng } from 'kit/core/rng.js';
import { createInput } from 'kit/three/input.js';

import { createCurtain } from './curtain.js';
import { flicker, rollLean } from './moments.js';

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
 *   fx: ReturnType<typeof import('./fx.js').createFx>,
 *   avatar: import('three').Object3D,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { character, rig, hud, input, fx, avatar } = ctx;
  const { juice, moment } = fx;
  const curtain = createCurtain(fx);
  const extra = createInput(SOULS_BINDINGS);
  let numbersSpawned = 0;
  /** Floating text through the juice object, counted for `getState`. */
  const number = (/** @type {number[]} */ at, /** @type {number | string} */ value, /** @type {'hit' | 'crit'} */ kind = 'hit') => {
    numbersSpawned += 1;
    juice.text(at, value, kind);
  };
  /** Positional cue: where the player is, one metre up. */
  const here = () => [character.position[0] ?? 0, (character.position[1] ?? 0) + 1, character.position[2] ?? 0];
  hud.hint('WASD move · SPACE roll · J light · K heavy · Q lock-on · E rest · C camera');

  // --- the bonfire: logs, a stuck sword, three flickering flames, a ground glow and a point light --------
  const bonfire = new THREE.Group();
  const logMaterial = fx.materials.get('wood', { repeat: [1, 1], tint: 0x6b4a2f, normalScale: 1.2 });
  for (let i = 0; i < 4; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8), logMaterial);
    log.rotation.set(Math.PI / 2.6, (i / 4) * Math.PI * 2, 0);
    log.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.28, 0.22, Math.sin((i / 4) * Math.PI * 2) * 0.28);
    log.castShadow = true;
    bonfire.add(log);
  }
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [0, 1, 2].map((i) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.04, 0.9 - i * 0.18, 8), flameMaterial);
    flame.position.set((i - 1) * 0.12, 0.65, (i - 1) * -0.05);
    bonfire.add(flame);
    return flame;
  });
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.18), fx.materials.get('metal', { repeat: [1, 2], tint: 0xb5bfd0 }));
  sword.position.y = 0.9;
  sword.rotation.z = 0.15;
  sword.castShadow = true;
  bonfire.add(sword);
  for (let i = 0; i < 8; i += 1) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.3), fx.materials.get('stone', { repeat: [1, 1], tint: 0x6f7690 }));
    stone.position.set(Math.cos((i / 8) * Math.PI * 2) * 0.85, 0.1, Math.sin((i / 8) * Math.PI * 2) * 0.85);
    stone.rotation.y = i;
    bonfire.add(stone);
  }
  // The ground glow is a soft disc drawn into a canvas, additive, that swells when you rest.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gg = /** @type {CanvasRenderingContext2D} */ (glowCanvas.getContext('2d'));
  const gradient = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,170,80,0.9)');
  gradient.addColorStop(0.5, 'rgba(255,110,30,0.35)');
  gradient.addColorStop(1, 'rgba(255,90,0,0)');
  gg.fillStyle = gradient;
  gg.fillRect(0, 0, 64, 64);
  const glowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  bonfire.add(glow);
  bonfire.position.set(BONFIRE[0], 0, BONFIRE[2]);
  const fireLight = new THREE.PointLight(0xff8a3d, 6, 11);
  fireLight.position.set(BONFIRE[0], 1.2, BONFIRE[2]);
  scene.add(bonfire, fireLight);
  let glowBoost = 0;
  let clock = 0;
  let emberIn = 0;

  // --- the sword's arc, the lock-on marker and a tumble for the body -------------------------------------
  const arcMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const arc = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.3, 28, 1, -Math.PI / 2.2, Math.PI / 1.1), arcMaterial);
  // Lying flat at hip height, centred on the player and facing forward (-z of the body).
  arc.rotation.x = -Math.PI / 2;
  arc.rotation.z = Math.PI / 2;
  arc.position.y = 1.0;
  arc.visible = false;
  avatar.add(arc);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), markerMaterial);
  marker.renderOrder = 12;
  marker.visible = false;
  scene.add(marker);
  let lockWas = false;
  let lastParryAt = -9;
  let staminaWas = STAMINA.max;
  let deniedAt = -9;

  // --- player state ----------------------------------------------------------------
  const stamina = createStamina();
  const player = { hp: PLAYER_HP, deaths: 0, rests: 0 };
  /** True from the killing blow until the screen is black and the player is set down at the bonfire. */
  let dead = false;
  /** @type {{ kind: 'roll', t: number, dir: [number, number] } | { kind: 'light' | 'heavy', t: number, landed: boolean } | null} */
  let action = null;
  let checkpoint = /** @type {[number, number, number]} */ ([...PLAYER_SPAWN]);
  /** The base's last movement wish, `[x, z]`: a roll goes that way. */
  let lastWish = /** @type {[number, number]} */ ([0, 0]);

  // --- hollows (regular enemies) -----------------------------------------------------
  const hollowGeometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 10);
  const hollowMaterial = fx.materials.get('dirt', { repeat: [1, 2], tint: 0x9a8f78, normalScale: 1.4, roughness: 1 });
  /**
   * @typedef {{ mesh: THREE.Mesh, hp: number, position: [number, number, number], home: [number, number, number],
   *   attack: number, struck: boolean, stagger: number, windupCued: boolean }} Hollow
   */
  /** @type {Hollow[]} */
  const hollows = HOLLOW_SPAWNS.map(([x, z]) => {
    const mesh = new THREE.Mesh(hollowGeometry, hollowMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, hp: HOLLOW.hp, position: [x, 0, z], home: [x, 0, z], attack: -1, struck: false, stagger: 0, windupCued: false };
  });

  // --- the boss --------------------------------------------------------------------------
  const bossMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.2, 6, 14), fx.materials.get('stone', { repeat: [2, 3], tint: 0x7a5aa0, normalScale: 1.6, roughness: 0.9 }));
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
    cued: false,
    yaw: 0,
  };
  const bossColors = { 1: 0x7a5aa0, 2: 0xa84a78, 3: 0xd0453b };

  const resetEnemies = (/** @type {{ boss: boolean }} */ opts) => {
    for (const h of hollows) {
      h.hp = HOLLOW.hp;
      h.position = [...h.home];
      h.attack = -1;
      h.stagger = 0;
      h.mesh.rotation.z = 0;
      h.mesh.scale.setScalar(1);
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

  /** What the body does when a blow lands: it rocks back (the avatar's lean springs to zero). */
  let hitLean = 0;
  const damagePlayer = (/** @type {number} */ amount) => {
    if (dead) return false;
    if (action?.kind === 'roll' && rollInvulnerable(action.t)) {
      // The roll's invulnerable frames swallowed the blow: a blue flash, a slow beat and a ring of sparks.
      if (clock - lastParryAt > 0.7) {
        lastParryAt = clock;
        moment('parry', { position: here() });
        number([here()[0] ?? 0, 2.4, here()[2] ?? 0], 'DODGED', 'heal');
      }
      return false;
    }
    player.hp -= amount;
    const heavy = amount >= 20;
    moment(heavy ? 'player-hit-heavy' : 'player-hit', { object: avatar, position: here() });
    hitLean = heavy ? 0.7 : 0.4;
    const [x, y, z] = character.position;
    number([x ?? 0, (y ?? 0) + 2, z ?? 0], amount, 'crit');
    if (player.hp <= 0) {
      player.hp = 0;
      player.deaths += 1;
      dead = true;
      action = null;
      moment('you-died', { position: here() });
      // The screen goes black, the player is set down at the bonfire behind it, and the world returns.
      curtain.show({
        text: 'YOU DIED',
        color: '#b3261e',
        veil: 0.85,
        in: 0.9,
        hold: 1.5,
        out: 0.9,
        size: 72,
        onBlack: () => {
          player.hp = PLAYER_HP;
          stamina.value = STAMINA.max;
          character.teleport(checkpoint);
          resetEnemies({ boss: true });
          dead = false;
          hitLean = 0;
        },
      });
    }
    return true;
  };

  /** A felled hollow slumps and sinks out of the scene. */
  const slump = (/** @type {Hollow} */ h) => {
    const mesh = h.mesh;
    juice.tween({ duration: 0.5, ease: 'inQuad', onUpdate: (v) => (mesh.rotation.z = v * (Math.PI / 2.1)) });
    juice.tween({ duration: 0.5, delay: 0.9, onUpdate: (v) => mesh.scale.setScalar(1 - v * 0.9), onComplete: () => scene.remove(mesh) });
  };

  const strike = (/** @type {'light' | 'heavy'} */ kind) => {
    const a = ATTACKS[kind];
    const facing = facingOf(character.yaw);
    const at = character.position;
    const dir = [facing[0] ?? 0, 0.2, facing[1] ?? 0];
    for (const h of hollows) {
      if (h.hp > 0 && inArc(at, facing, h.position, a.reach, a.arcDeg)) {
        h.hp -= a.damage;
        const spot = [h.position[0], 1.2, h.position[2]];
        moment(kind === 'heavy' ? 'hit-heavy' : 'hit-light', { object: h.mesh, position: spot, dir, text: a.damage, textKind: kind === 'heavy' ? 'crit' : 'hit' });
        numbersSpawned += 1;
        if (h.hp <= 0) {
          moment('enemy-death', { position: spot });
          slump(h);
        } else if (kind === 'heavy' || (h.attack >= 0 && h.attack < HOLLOW.windup)) {
          // Hit through its wind-up (or with a heavy): the swing is broken and it reels backwards.
          h.attack = -1;
          h.stagger = 0.5;
          moment('stagger', { position: spot, object: h.mesh });
          h.position[0] += (facing[0] ?? 0) * 0.7;
          h.position[2] += (facing[1] ?? 0) * 0.7;
        }
      }
    }
    if (boss.hp > 0 && inArc(at, facing, boss.position, a.reach + 0.8, a.arcDeg)) {
      boss.hp = Math.max(0, boss.hp - a.damage);
      boss.flash = 0.16;
      boss.awake = true;
      const spot = [boss.position[0], 2.6, boss.position[2]];
      moment(kind === 'heavy' ? 'hit-heavy' : 'hit-light', { object: bossMesh, position: spot, dir, text: a.damage, textKind: kind === 'heavy' ? 'crit' : 'hit' });
      numbersSpawned += 1;
      const phase = bossPhase(boss.hp / BOSS.hp);
      if (phase !== boss.phase) {
        boss.phase = phase;
        moment('boss-roar', { position: spot });
        fx.pop(phase === 2 ? 'The Warden grows restless' : 'The Warden is enraged', { y: 22, size: 26, color: '#e0584a' });
      }
      if (boss.hp === 0) {
        moment('boss-felled', { position: spot });
        juice.tween({ duration: 1.2, ease: 'inQuad', onUpdate: (v) => bossMesh.scale.setScalar(1 - v * 0.35), onComplete: () => scene.remove(bossMesh) });
        rig.clearLock();
        curtain.show({ text: 'Enemy felled', color: '#e8c96a', veil: 0.15, in: 0.7, hold: 2.2, out: 1.2, size: 58 });
      }
    }
  };

  const lockCandidates = () => [...hollows.filter((h) => h.hp > 0), ...(boss.hp > 0 ? [boss] : [])];

  const stepHollow = (/** @type {Hollow} */ h, /** @type {number} */ dt) => {
    const [px, , pz] = character.position;
    const dx = px - h.position[0];
    const dz = pz - h.position[2];
    const d = Math.hypot(dx, dz);
    h.stagger = Math.max(0, h.stagger - dt);
    if (h.stagger > 0) {
      // Reeling: no action, a slow lurch back upright.
      h.mesh.position.set(h.position[0], 0.9, h.position[2]);
      h.mesh.rotation.x = -0.5 * (h.stagger / 0.5);
      return;
    }
    if (h.attack >= 0) {
      if (h.attack === 0) moment('hollow-windup', { position: [h.position[0], 1, h.position[2]] });
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
        if (stage === 'active' && !boss.cued) {
          boss.cued = true;
          const big = boss.attack.name === 'nova' || boss.attack.name === 'overhead' || boss.attack.name === 'sweep';
          const heard = Math.max(0.25, 1 - d / 22);
          if (big) moment('boss-slam', { position: [boss.position[0], 0.2, boss.position[2]], strength: heard });
          else juice.shake(0.2 * heard);
        }
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
        if (boss.flash <= 0) material.emissive.setHex(stage === 'windup' ? 0x803000 : stage === 'active' ? 0xff4000 : 0x000000);
        if (stage === 'done') boss.attack = null;
      } else {
        boss.yaw = Math.atan2(-dx, -dz);
        const next = bossChooseAttack(boss.phase, d, () => rng.next());
        if (next && rng.next() < 0.04 * bossSpeed(boss.phase)) {
          boss.attack = next;
          boss.attackT = 0;
          boss.struck = false;
          boss.cued = false;
          moment('boss-windup', { position: [boss.position[0], 2, boss.position[2]] });
        } else if (d > 2.6) {
          const speed = BOSS.speed * bossSpeed(boss.phase);
          boss.position[0] += (dx / d) * speed * dt;
          boss.position[2] += (dz / d) * speed * dt;
        }
        if (boss.flash <= 0) material.emissive.setHex(0x000000);
      }
    }
    boss.flash = Math.max(0, boss.flash - dt);
    bossMesh.position.set(boss.position[0], 2, boss.position[2]);
    bossMesh.rotation.y = boss.yaw;
  };

  /** The sword's arc sweeps across the front of the body and fades. */
  const swingArc = (/** @type {'light' | 'heavy'} */ kind) => {
    if (!fx.settings.resolved().enabled) return;
    const heavy = kind === 'heavy';
    arc.visible = true;
    arc.scale.setScalar(heavy ? 1.25 : 1);
    arcMaterial.color.setHex(heavy ? 0xffc27a : 0xdfe8ff);
    const side = heavy ? 1 : (player.rests + shotsSwung) % 2 === 0 ? 1 : -1;
    shotsSwung += 1;
    juice.tween({
      duration: heavy ? 0.28 : 0.2,
      ease: 'outCubic',
      onUpdate: (e, t) => {
        arc.rotation.z = Math.PI / 2 + side * (0.95 - 1.9 * e);
        arcMaterial.opacity = 0.75 * (1 - t);
      },
      onComplete: () => {
        arc.visible = false;
      },
    });
  };
  let shotsSwung = 0;

  return {
    /**
     * The base's movement for this step, reshaped: a roll drives the body
     * along its direction at run speed; an attack roots it; the jump button
     * is the roll, so the base never jumps.
     * @param {{ direction: readonly number[], run?: boolean, jump?: boolean, face?: boolean }} wish
     */
    intent(wish) {
      lastWish = [wish.direction[0] ?? 0, wish.direction[1] ?? 0];
      if (dead) return { direction: [0, 0], run: false, jump: false, face: false };
      if (action?.kind === 'roll') return { direction: action.dir, run: true, jump: false, face: true };
      if (action) return { direction: [0, 0], run: false, jump: false, face: false };
      return { ...wish, jump: false };
    },
    update(/** @type {number} */ dt) {
      extra.update();
      clock += dt;
      tickStamina(stamina, action ? 0 : dt);
      // Out of stamina: a gasp the first time it empties.
      if (staminaWas > 0.5 && stamina.value <= 0.5 && !dead) {
        moment('stamina-out', { position: here() });
        fx.pop('NO STAMINA', { y: 78, size: 18, color: '#d96a5f', seconds: 0.8 });
      }
      staminaWas = stamina.value;

      // A button pressed with an empty bar gets a dull click rather than silence.
      const wantsAct = input.justPressed('jump') || input.justPressed('attack') || extra.justPressed('heavy');
      if (wantsAct && !action && !canAct(stamina) && clock - deniedAt > 0.35 && !dead) {
        deniedAt = clock;
        moment('stamina-denied');
      }

      if (action) {
        action.t += dt;
        if (action.kind === 'roll') {
          if (action.t >= STAMINA.rollSeconds) {
            action = null;
            moment('roll-end', { position: [character.position[0] ?? 0, 0.1, character.position[2] ?? 0] });
          }
        } else {
          const a = ATTACKS[action.kind];
          if (!action.landed && action.t >= a.hitAt) {
            action.landed = true;
            swingArc(action.kind);
            strike(action.kind);
          }
          if (action.t >= a.duration) action = null;
        }
      } else if (dead) {
        // Down: no actions until the curtain has covered the screen.
      } else if (input.justPressed('jump') && canAct(stamina)) {
        spendStamina(stamina, 'roll');
        // Roll the way the stick points, or straight ahead when it is idle.
        const [mx = 0, mz = 0] = Math.hypot(lastWish[0], lastWish[1]) > 0.1 ? lastWish : facingOf(character.yaw);
        action = { kind: 'roll', t: 0, dir: [mx, mz] };
        moment('roll', { object: avatar, position: [character.position[0] ?? 0, 0.15, character.position[2] ?? 0], dir: [-mx, 0.3, -mz] });
      } else if (input.justPressed('attack') && canAct(stamina)) {
        spendStamina(stamina, 'light');
        action = { kind: 'light', t: 0, landed: false };
        moment('swing-light', { position: here() });
      } else if (extra.justPressed('heavy') && canAct(stamina)) {
        spendStamina(stamina, 'heavy');
        action = { kind: 'heavy', t: 0, landed: false };
        moment('swing-heavy', { position: here() });
      }

      // The body: a forward tuck through a roll, a rock-back when hit, a lean into a swing.
      hitLean = Math.max(0, hitLean - dt * 2.4);
      const calm = fx.settings.resolved().reducedMotion;
      const windup = action && action.kind !== 'roll' ? (action.t < ATTACKS[action.kind].hitAt ? -0.25 * (action.t / ATTACKS[action.kind].hitAt) : 0.35 * Math.max(0, 1 - (action.t - ATTACKS[action.kind].hitAt) * 4)) : 0;
      avatar.rotation.x = calm ? 0 : (action?.kind === 'roll' ? rollLean(action.t, STAMINA.rollSeconds) : windup) + hitLean * 0.6;

      if (input.justPressed('lock-on') && !dead) rig.toggleLock(character.position, lockCandidates());
      const locked = rig.lockTarget;
      if (locked && (/** @type {{ hp: number }} */ (/** @type {unknown} */ (locked))).hp <= 0) rig.clearLock();
      else if (locked && action?.kind !== 'roll') {
        // Locked on, the body squares up to the target.
        const [px, , pz] = character.position;
        character.yaw = Math.atan2(-((locked.position[0] ?? 0) - px), -((locked.position[2] ?? 0) - pz));
      }
      const isLocked = rig.lockTarget !== null;
      if (isLocked !== lockWas) {
        lockWas = isLocked;
        moment(isLocked ? 'lock-on' : 'lock-off');
      }
      marker.visible = isLocked;
      if (locked) {
        const lt = /** @type {{ position: number[] }} */ (/** @type {unknown} */ (locked));
        marker.position.set(lt.position[0] ?? 0, locked === /** @type {unknown} */ (boss) ? 4.4 : 2.5, lt.position[2] ?? 0);
        marker.quaternion.copy(rig.camera.quaternion);
        marker.scale.setScalar(1 + Math.sin(clock * 6) * 0.08);
      }

      if (!dead && input.justPressed('interact') && Math.hypot(character.position[0] - BONFIRE[0], character.position[2] - BONFIRE[2]) < 2.2) {
        player.hp = PLAYER_HP;
        player.rests += 1;
        stamina.value = STAMINA.max;
        checkpoint = [BONFIRE[0] + 1.5, 0.1, BONFIRE[2]];
        resetEnemies({ boss: false });
        glowBoost = 1;
        moment('bonfire-rest', { position: [BONFIRE[0], 1.1, BONFIRE[2]], dir: [0, 1, 0] });
        curtain.show({ text: 'Bonfire lit', color: '#f1c26b', veil: 0, in: 0.5, hold: 1.1, out: 0.9, size: 52 });
      }

      // The bonfire is never still: flames, light and a thin stream of embers.
      glowBoost = Math.max(0, glowBoost - dt * 0.7);
      const f = flicker(clock);
      fireLight.intensity = (6 + f * 3.2 + glowBoost * 10) * (calm ? 0.85 : 1);
      flames.forEach((flame, i) => {
        const k = flicker(clock, i * 1.7);
        flame.scale.set(0.8 + k * 0.5, 0.75 + k * 0.7 + glowBoost * 0.6, 0.8 + k * 0.5);
        flame.rotation.y = clock * (1.2 + i * 0.3);
      });
      glow.scale.setScalar(3.4 + f * 0.9 + glowBoost * 3.2);
      glowMaterial.opacity = 0.65 + f * 0.25 + glowBoost * 0.4;
      emberIn -= dt;
      if (emberIn <= 0) {
        emberIn = 0.22 + (1 - f) * 0.3;
        juice.burst('spark', [BONFIRE[0], 1.1, BONFIRE[2]], { dir: [0, 1, 0], count: 2, scale: 0.35, colors: [0xffd9a0, 0xff9a3c, 0xffb347] });
      }

      for (const h of hollows) if (h.hp > 0) stepHollow(h, dt);
      if (boss.hp > 0) stepBoss(dt);

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
          dead,
          fx: { moments: fx.moments, last: fx.lastMoment, numbers: numbersSpawned, curtain: curtain.active },
        },
      };
    },
  };
}
