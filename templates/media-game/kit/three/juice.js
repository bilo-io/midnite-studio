// @ts-check
/**
 * Midnite game kit — juice (game feel) for three.js games.
 *
 * One object per scene: camera shake (trauma model), hit-stop and slow motion, hit
 * flash and emissive pulses, squash and stretch, tweens, particle bursts (spark, dust,
 * debris, muzzle, impact), floating text, a screen flash, and `trigger(name)` which
 * fans a named moment (`jump`, `land`, `hit`, `hurt`, `pickup`, `explosion`, ...) out to all
 * of them plus a sound. Everything follows the juice settings (`kit/core/juice-settings.js`)
 * and runs on the loop's `dt` and the kit rng, so a play-test replays it exactly.
 *
 * Wire it into the loop in three places:
 *
 *   update(dt) {
 *     const sdt = juice.update(dt);       // FIRST: undoes last frame's shake, returns dt scaled by hit-stop
 *     ... simulate with sdt ...
 *     juice.trigger('land', { object: avatar, position: character.position });
 *   },
 *   render() { juice.applyCamera(); },     // after the rig has moved the camera
 *
 * See `common/CLAUDE.md` ("Fidelity and juice kit") for the full API.
 */

import * as THREE from 'three';

import { createTimeScale, createTrauma, flashLevel, spawnParticles, TRIGGERS } from '../core/juice-core.js';
import { createRng } from '../core/rng.js';
import { createTweens } from '../core/tween.js';
import { createDamageNumbers } from './damage-numbers.js';

const POINT_VERT = `
  attribute float aSize; attribute float aAlpha; attribute float aSoft; attribute vec3 aColor;
  varying float vAlpha; varying float vSoft; varying vec3 vColor; uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z));
    vAlpha = aAlpha; vSoft = aSoft; vColor = aColor;
  }`;
const POINT_FRAG = `
  varying float vAlpha; varying float vSoft; varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float round = smoothstep(0.5, 0.0, length(p));
    float chip = step(max(abs(p.x), abs(p.y)), 0.46);
    gl_FragColor = vec4(vColor, vAlpha * mix(chip, round * round * 1.6, vSoft));
  }`;

/** A fixed-capacity pool of point sprites sharing one blend mode. */
function createPool(/** @type {THREE.Scene} */ scene, /** @type {number} */ capacity, /** @type {'add' | 'normal'} */ blend) {
  const position = new Float32Array(capacity * 3);
  const color = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  const soft = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geometry.setAttribute('aSoft', new THREE.BufferAttribute(soft, 1));
  const uniforms = { uScale: { value: 600 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);
  /** @type {{ p: [number, number, number], v: [number, number, number], age: number, life: number, size: number, color: THREE.Color, gravity: number, drag: number, soft: number, bounce: number }[]} */
  let live = [];
  return {
    get count() {
      return live.length;
    },
    uniforms,
    /** @param {typeof live[number]} particle */
    add(particle) {
      if (live.length >= capacity) live.shift();
      live.push(particle);
    },
    /** @param {number} dt @param {number} floorY */
    update(dt, floorY) {
      live = live.filter((q) => (q.age += dt) < q.life);
      live.forEach((q, i) => {
        q.v[1] -= q.gravity * dt;
        const drag = Math.max(0, 1 - q.drag * dt);
        q.v[0] *= drag; q.v[1] *= drag; q.v[2] *= drag;
        q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
        if (q.bounce > 0 && q.p[1] < floorY && q.v[1] < 0) {
          q.p[1] = floorY;
          q.v[1] *= -q.bounce; q.v[0] *= 0.7; q.v[2] *= 0.7;
        }
        const t = q.age / q.life;
        position.set(q.p, i * 3);
        color.set([q.color.r, q.color.g, q.color.b], i * 3);
        size[i] = q.size * (blend === 'add' ? 1 - t * 0.6 : 1 + t * 0.5);
        alpha[i] = (1 - t) * (1 - t);
        soft[i] = q.soft;
      });
      geometry.setDrawRange(0, live.length);
      for (const name of ['position', 'aColor', 'aSize', 'aAlpha', 'aSoft']) /** @type {THREE.BufferAttribute} */ (geometry.getAttribute(name)).needsUpdate = true;
    },
    clear() {
      live = [];
      geometry.setDrawRange(0, 0);
    },
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera | (() => THREE.PerspectiveCamera),
 *   renderer?: THREE.WebGLRenderer,
 *   settings?: { resolved(): import('../core/juice-settings.js').ResolvedJuice },
 *   sfx?: { play(name: string, opts?: Record<string, unknown>): unknown } | null,
 *   postfx?: { hit(amount?: number): void } | null,
 *   damageNumbers?: ReturnType<typeof createDamageNumbers> | null,
 *   seed?: number,
 *   floorY?: number,
 *   maxShake?: { translate?: number, roll?: number },
 * }} options
 */
export function createJuice(options) {
  const cameraOf = () => (typeof options.camera === 'function' ? options.camera() : options.camera);
  const rng = createRng(options.seed ?? 0x1ce);
  const trauma = createTrauma();
  const time = createTimeScale();
  const tweens = createTweens();
  const maxTranslate = options.maxShake?.translate ?? 0.18;
  const maxRoll = options.maxShake?.roll ?? 0.035;
  const addPool = createPool(options.scene, 384, 'add');
  const normalPool = createPool(options.scene, 384, 'normal');
  /** @type {ReturnType<typeof createDamageNumbers> | null} */
  let numbers = options.damageNumbers ?? null;
  /** @type {{ mat: THREE.MeshStandardMaterial, base: THREE.Color, baseIntensity: number, color: THREE.Color, age: number, duration: number, power: number }[]} */
  let flashes = [];
  /** @type {HTMLDivElement | null} */
  let overlay = null;
  const overlayState = { age: 1, duration: 0.2, alpha: 0 };
  /** @type {{ position: THREE.Vector3, quaternion: THREE.Quaternion, camera: THREE.Camera } | null} */
  let applied = null;
  let elapsed = 0;
  let triggers = 0;

  const resolved = () => options.settings?.resolved() ?? /** @type {import('../core/juice-settings.js').ResolvedJuice} */ ({ enabled: true, reducedMotion: false, intensity: 1, shake: 1, flash: 1, particles: 1, postfx: true, volume: 1 });

  const undoCamera = () => {
    if (!applied) return;
    applied.camera.position.copy(applied.position);
    applied.camera.quaternion.copy(applied.quaternion);
    applied = null;
  };

  const api = {
    time,
    tweens,
    /** Simulation speed now (0 in a hit-stop). */
    get timeScale() {
      return time.value;
    },
    get frozen() {
      return time.frozen;
    },
    /** Trauma 0..1, for `getState`. */
    get trauma() {
      return trauma.trauma;
    },
    /**
     * Advance every effect by the REAL `dt`. Returns the dt to simulate with: 0 during a hit-stop,
     * reduced during slow motion. Call it first in `update`, before the camera rig moves.
     * @param {number} dt
     */
    update(dt) {
      undoCamera();
      elapsed += dt;
      const sdt = time.scale(dt);
      trauma.update(dt);
      tweens.update(dt);
      const fl = resolved();
      flashes = flashes.filter((f) => {
        f.age += dt;
        const level = flashLevel(f.age, f.duration) * f.power;
        if (f.age >= f.duration) {
          f.mat.emissive.copy(f.base);
          f.mat.emissiveIntensity = f.baseIntensity;
          return false;
        }
        f.mat.emissive.copy(f.base).lerp(f.color, Math.min(1, level));
        f.mat.emissiveIntensity = f.baseIntensity + level * 1.4;
        return true;
      });
      if (overlay) {
        overlayState.age += dt;
        overlay.style.opacity = String(overlayState.age >= overlayState.duration ? 0 : flashLevel(overlayState.age, overlayState.duration) * overlayState.alpha * (fl.flash > 0 ? 1 : 0));
      }
      const cam = cameraOf();
      const scale = options.renderer ? options.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)) : 600;
      addPool.uniforms.uScale.value = normalPool.uniforms.uScale.value = scale;
      addPool.update(sdt || 0, options.floorY ?? 0);
      normalPool.update(sdt || 0, options.floorY ?? 0);
      numbers?.update(dt);
      return sdt;
    },
    /** Offset the camera by the current shake; call after the rig has positioned it, before drawing. Undone by the next `update`. */
    applyCamera() {
      const cam = cameraOf();
      undoCamera();
      const s = trauma.sample();
      if (s.amount <= 1e-5) return;
      applied = { camera: cam, position: cam.position.clone(), quaternion: cam.quaternion.clone() };
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, s.x * maxTranslate).addScaledVector(up, s.y * maxTranslate);
      cam.rotateZ(s.roll * maxRoll);
    },
    /** Add camera trauma (0..1); scaled by the shake setting. @param {number} amount */
    shake(amount) {
      trauma.add(amount * resolved().shake);
    },
    /** Freeze the simulation for `ms` (and halve it under reduced motion). @param {number} ms */
    hitStop(ms) {
      const r = resolved();
      if (!r.enabled || !r.shake) return;
      time.hitStop(ms * Math.min(1, r.shake));
    },
    /** @param {number} scale @param {number} seconds real seconds */
    slowMo(scale, seconds) {
      if (resolved().shake > 0) time.slowMo(scale, seconds);
    },
    /**
     * Flash an object's emissive (a hit flash). The first flash gives the object's materials
     * their own copy, so shared preset materials are not flashed along with it.
     * @param {THREE.Object3D} object
     * @param {{ color?: number, duration?: number, power?: number }} [o]
     */
    flash(object, o = {}) {
      const power = o.power ?? 1;
      const strength = resolved().flash * power;
      if (strength <= 0) return;
      object.traverse((child) => {
        const mesh = /** @type {THREE.Mesh} */ (child);
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const owned = mats.map((m) => {
          const std = /** @type {THREE.MeshStandardMaterial} */ (m);
          if (!std.emissive) return null;
          if (!std.userData['juiceOwned']) {
            const copy = std.clone();
            copy.userData['juiceOwned'] = true;
            if (Array.isArray(mesh.material)) mesh.material[mats.indexOf(m)] = copy;
            else mesh.material = copy;
            return copy;
          }
          return std;
        });
        for (const mat of owned) {
          if (!mat) continue;
          const existing = flashes.find((f) => f.mat === mat);
          if (existing) {
            existing.age = 0;
            existing.power = Math.max(existing.power, strength);
            continue;
          }
          flashes.push({ mat, base: mat.emissive.clone(), baseIntensity: mat.emissiveIntensity, color: new THREE.Color(o.color ?? 0xffffff), age: 0, duration: o.duration ?? 0.2, power: strength });
        }
      });
    },
    /**
     * Squash and stretch: pulse `object.scale` by `sx` across x and z and `sy` on y, then spring back.
     * `[0.8, 1.25]` is a jump stretch; `[1.25, 0.8]` is a landing squash.
     * @param {THREE.Object3D} object
     * @param {readonly [number, number]} factors
     * @param {{ duration?: number, ease?: string }} [o]
     */
    squash(object, factors, o = {}) {
      const k = Math.min(1.5, resolved().shake);
      if (k <= 0) return;
      const base = /** @type {THREE.Vector3} */ (object.userData['juiceBaseScale'] ??= object.scale.clone());
      const sx = 1 + (factors[0] - 1) * k;
      const sy = 1 + (factors[1] - 1) * k;
      tweens.tween({
        duration: o.duration ?? 0.32,
        ease: o.ease ?? 'outElastic',
        onUpdate: (e) => {
          object.scale.set(base.x * (sx + (1 - sx) * e), base.y * (sy + (1 - sy) * e), base.z * (sx + (1 - sx) * e));
        },
        onComplete: () => object.scale.copy(base),
      });
    },
    /** @param {import('../core/tween.js').TweenOptions} o */
    tween: (o) => tweens.tween(o),
    /**
     * A particle burst at a world position.
     * @param {string} kind `spark`, `dust`, `debris`, `muzzle` or `impact`
     * @param {readonly number[]} position
     * @param {{ dir?: readonly number[], scale?: number, count?: number, colors?: number[] }} [o]
     */
    burst(kind, position, o = {}) {
      const scale = (o.scale ?? 1) * resolved().particles;
      for (const q of spawnParticles(kind, rng, { ...o, scale })) {
        const pool = q.blend === 'add' ? addPool : normalPool;
        pool.add({ p: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0], v: [q.vx, q.vy, q.vz], age: 0, life: q.life, size: q.size, color: new THREE.Color(q.color), gravity: q.gravity, drag: q.drag, soft: q.soft, bounce: q.bounce });
      }
    },
    /**
     * Floating text (damage numbers, "+1"). Reuses `kit/three/damage-numbers.js`.
     * @param {readonly number[]} position
     * @param {number | string} text
     * @param {'hit' | 'crit' | 'heal'} [kind]
     */
    text(position, text, kind = 'hit') {
      numbers ??= createDamageNumbers({ camera: cameraOf() });
      numbers.spawn(position, text, { kind });
    },
    /** A full-screen colour flash. @param {number} [color] @param {number} [alpha] @param {number} [duration] */
    screenFlash(color = 0xffffff, alpha = 0.3, duration = 0.18) {
      const scale = resolved().flash;
      if (scale <= 0 || typeof document === 'undefined') return;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5';
        document.body.append(overlay);
      }
      overlay.style.background = `#${color.toString(16).padStart(6, '0')}`;
      overlayState.age = 0;
      overlayState.duration = duration;
      overlayState.alpha = Math.min(0.85, alpha * scale);
    },
    /**
     * Fire a named moment (`TRIGGERS` in `kit/core/juice-core.js`): jump, land, footstep, hit, hurt,
     * pickup, shoot, explosion, death, win. Does the shake, hit-stop, flash, squash, particles and sound it lists.
     * @param {string} name
     * @param {{ object?: THREE.Object3D, position?: readonly number[], dir?: readonly number[], strength?: number, text?: number | string, textKind?: 'hit' | 'crit' | 'heal' }} [o]
     */
    trigger(name, o = {}) {
      const t = TRIGGERS[name];
      if (!t) throw new Error(`unknown juice trigger: ${name}`);
      triggers += 1;
      const strength = o.strength ?? 1;
      if (t.shake) api.shake(t.shake * strength);
      if (t.hitStop) api.hitStop(t.hitStop * strength);
      if (t.flash) api.screenFlash(t.flashColor ?? 0xffffff, t.flash * strength);
      if (t.aberration) options.postfx?.hit(t.aberration * strength);
      if (t.squash && o.object) api.squash(o.object, t.squash);
      if (o.object && (name === 'hit' || name === 'hurt')) api.flash(o.object, { color: name === 'hurt' ? 0xff4040 : 0xffffff });
      if (t.particles && o.position) api.burst(t.particles, o.position, { dir: o.dir, scale: strength, ...(t.count ? { count: t.count } : {}) });
      if (t.sfx) options.sfx?.play(t.sfx, { power: Math.min(1.5, 0.7 + strength * 0.3), ...(o.position ? { position: o.position } : {}) });
      if (o.text !== undefined && o.position) api.text(o.position, o.text, o.textKind ?? 'hit');
    },
    /** Plain-JSON summary for `getState()`. */
    state() {
      return { trauma: Number(trauma.trauma.toFixed(3)), frozen: time.frozen, particles: addPool.count + normalPool.count, triggers, flashing: flashes.length };
    },
    dispose() {
      undoCamera();
      addPool.dispose();
      normalPool.dispose();
      overlay?.remove();
      numbers?.dispose();
      tweens.clear();
    },
  };
  return api;
}
