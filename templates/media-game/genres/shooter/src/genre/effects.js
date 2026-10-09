// @ts-check
/**
 * The shooter's three.js effect pools: the viewmodel and its recoil, tracers, bullet-hole
 * decals, ejected shell casings, the explosion shockwave and the hit marker. Each is a
 * small fixed pool advanced by the (hit-stop scaled) `dt`, so a replay draws the same frame.
 * Decorative randomness comes from this module's own rng stream, never the gameplay one.
 */

import * as THREE from 'three';

import { createRng } from 'kit/core/rng.js';

import { casingEject, faceNormal, markerScale } from './moments.js';

const DECALS = 32;
const CASINGS = 20;

/** A bullet hole drawn into a canvas: soft scorch, dark core, a bright chipped rim. No image file. */
function holeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const scorch = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  scorch.addColorStop(0, 'rgba(10,8,6,0.95)');
  scorch.addColorStop(0.35, 'rgba(18,14,10,0.7)');
  scorch.addColorStop(1, 'rgba(18,14,10,0)');
  g.fillStyle = scorch;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(210,190,160,0.55)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(32, 32, 7, 0, Math.PI * 2);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * @param {{
 *   scene: THREE.Scene, camera: THREE.PerspectiveCamera, avatar: THREE.Object3D | null,
 *   fx: ReturnType<typeof import('./fx.js').createFx>, floorY?: number,
 *   solids: THREE.Mesh[],
 * }} options
 */
export function createShooterEffects(options) {
  const { scene, camera, avatar, fx, solids } = options;
  const { juice, materials } = fx;
  const rng = createRng(0x5107);
  const firstPerson = avatar === null;

  // --- the gun: a viewmodel on the camera, or a prop on the third-person body ---------------------
  const metal = materials.get('metal', { repeat: [1, 1], tint: 0x9aa4b4, normalScale: 0.8 });
  const wood = materials.get('wood', { repeat: [1, 1], tint: 0xb89a78 });
  const gun = new THREE.Group();
  /** @type {Record<string, THREE.Group>} */
  const models = {};
  const part = (/** @type {THREE.Group} */ g, /** @type {number[]} */ size, /** @type {THREE.Material} */ m, /** @type {number[]} */ at) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    mesh.position.set(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const barrel = (/** @type {THREE.Group} */ g, /** @type {number} */ radius, /** @type {number} */ length, /** @type {number} */ z) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), metal);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0, 0.015, z);
    mesh.castShadow = true;
    g.add(mesh);
  };
  const rifle = new THREE.Group();
  part(rifle, [0.05, 0.08, 0.34], metal, [0, 0, -0.1]);
  part(rifle, [0.045, 0.1, 0.12], wood, [0, -0.02, 0.1]);
  part(rifle, [0.04, 0.12, 0.05], wood, [0, -0.09, -0.02]);
  part(rifle, [0.02, 0.03, 0.04], metal, [0, 0.055, -0.2]);
  barrel(rifle, 0.012, 0.3, -0.38);
  const pistol = new THREE.Group();
  part(pistol, [0.045, 0.06, 0.2], metal, [0, 0, -0.05]);
  part(pistol, [0.04, 0.12, 0.05], wood, [0, -0.08, 0.04]);
  barrel(pistol, 0.011, 0.1, -0.17);
  const launcher = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 14), metal);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0, -0.2);
  tube.castShadow = true;
  launcher.add(tube);
  part(launcher, [0.05, 0.1, 0.06], wood, [0, -0.09, 0.0]);
  part(launcher, [0.03, 0.04, 0.12], metal, [0, 0.08, -0.1]);
  Object.assign(models, { rifle, pistol, launcher });
  for (const m of Object.values(models)) {
    m.visible = false;
    gun.add(m);
  }
  /** Where the muzzle is, in gun space, per weapon. */
  const MUZZLE = { rifle: -0.54, pistol: -0.22, launcher: -0.58 };
  const muzzle = new THREE.Object3D();
  gun.add(muzzle);

  const rest = firstPerson ? new THREE.Vector3(0.24, -0.23, -0.5) : new THREE.Vector3(0.38, 1.05, -0.35);
  gun.position.copy(rest);
  if (firstPerson) {
    // The camera's children draw only when the camera is in the scene graph.
    scene.add(camera);
    camera.add(gun);
  } else {
    /** @type {THREE.Object3D} */ (avatar).add(gun);
    gun.scale.setScalar(1.6);
  }

  let kick = 0;
  let bob = 0;
  let reload = 0;

  // --- tracers: a thin additive streak from the muzzle to the end of the shot ----------------------
  const streakGeometry = new THREE.BoxGeometry(1, 1, 1);
  /** @type {{ mesh: THREE.Mesh, life: number, max: number }[]} */
  let tracers = [];
  const tracerMaterials = new Map();
  const tracerMaterial = (/** @type {number} */ color) => {
    let m = tracerMaterials.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      tracerMaterials.set(color, m);
    }
    return m;
  };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  // --- decals --------------------------------------------------------------------------------------
  const holeMap = holeTexture();
  const decalMaterial = new THREE.MeshBasicMaterial({ map: holeMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const decalGeometry = new THREE.PlaneGeometry(0.28, 0.28);
  /** @type {{ mesh: THREE.Mesh, life: number }[]} */
  const decals = [];

  // --- casings -------------------------------------------------------------------------------------
  const casingGeometry = new THREE.CylinderGeometry(0.011, 0.011, 0.05, 6);
  const casingMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });
  /** @type {{ mesh: THREE.Mesh, v: THREE.Vector3, spin: THREE.Vector3, life: number, bounced: boolean }[]} */
  let casings = [];

  // --- muzzle / explosion light: one point light, lit by whichever fired last ----------------------
  const flashLight = new THREE.PointLight(0xffb866, 0, 14, 2);
  scene.add(flashLight);

  // --- shockwave ring ------------------------------------------------------------------------------
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // --- hit marker: four ticks round the crosshair --------------------------------------------------
  /** @type {HTMLDivElement | null} */
  let marker = null;
  /** @type {{ cancel: () => void } | null} */
  let markerTween = null;
  if (typeof document !== 'undefined') {
    marker = document.createElement('div');
    marker.style.cssText = 'position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;z-index:6;opacity:0';
    marker.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 3l6 6M23 3l-6 6M3 23l6-6M23 23l-6-6"/></svg>';
    document.body.append(marker);
  }

  return {
    /** Show the model for a weapon id. @param {string} id */
    equip(id) {
      for (const [name, m] of Object.entries(models)) m.visible = name === id;
      muzzle.position.set(0, 0.015, MUZZLE[/** @type {keyof typeof MUZZLE} */ (id)] ?? -0.5);
    },
    /** The muzzle in world space. */
    muzzlePosition() {
      camera.updateMatrixWorld(true);
      gun.updateWorldMatrix(true, true);
      return muzzle.getWorldPosition(new THREE.Vector3());
    },
    /** Push the gun back and up. @param {number} amount */
    kick(amount) {
      kick = Math.min(1.6, kick + amount);
    },
    /** @param {number} progress 0..1 through a reload, or -1 when not reloading */
    reloading(progress) {
      reload = progress;
    },
    /** @param {readonly number[]} from @param {readonly number[]} to @param {number} [color] @param {number} [seconds] */
    tracer(from, to, color = 0xfff0b0, seconds = 0.07) {
      tmpA.set(from[0] ?? 0, from[1] ?? 0, from[2] ?? 0);
      tmpB.set(to[0] ?? 0, to[1] ?? 0, to[2] ?? 0);
      const length = tmpA.distanceTo(tmpB);
      if (length < 0.2) return;
      const mesh = new THREE.Mesh(streakGeometry, tracerMaterial(color));
      mesh.position.copy(tmpA).lerp(tmpB, 0.5);
      mesh.scale.set(0.022, 0.022, length);
      mesh.lookAt(tmpB);
      scene.add(mesh);
      tracers.push({ mesh, life: seconds, max: seconds });
    },
    /**
     * A bullet hole on whatever surface `point` is on: the face of a crate, or the ground.
     * @param {readonly number[]} point
     * @param {readonly number[]} [fallback] the direction to face when no surface is found (back along the shot)
     * @returns {[number, number, number]} the surface normal, for the spark burst
     */
    decal(point, fallback = [0, 1, 0]) {
      /** @type {[number, number, number]} */
      let normal = [fallback[0] ?? 0, fallback[1] ?? 1, fallback[2] ?? 0];
      if ((point[1] ?? 1) < 0.06) normal = [0, 1, 0];
      else {
        for (const solid of solids) {
          const box = new THREE.Box3().setFromObject(solid).expandByScalar(0.08);
          if (box.containsPoint(tmpA.set(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0))) {
            normal = faceNormal({ min: box.min.toArray(), max: box.max.toArray() }, point);
            break;
          }
        }
      }
      if (!fx.settings.resolved().enabled) return normal;
      /** @type {{ mesh: THREE.Mesh, life: number } | undefined} */
      let slot = decals.length >= DECALS ? decals.shift() : undefined;
      if (!slot) {
        const mesh = new THREE.Mesh(decalGeometry, decalMaterial);
        scene.add(mesh);
        slot = { mesh, life: 0 };
      }
      slot.life = 12;
      slot.mesh.position.set(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0).addScaledVector(tmpB.set(...normal), 0.012);
      slot.mesh.quaternion.setFromUnitVectors(tmpA.set(0, 0, 1), tmpB.set(...normal));
      slot.mesh.rotateZ(rng.next() * Math.PI * 2);
      slot.mesh.scale.setScalar(0.8 + rng.next() * 0.6);
      decals.push(slot);
      return normal;
    },
    /** Eject a casing from the gun. */
    eject() {
      if (!fx.settings.resolved().enabled) return;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const { velocity, spin } = casingEject(rng, right.toArray(), forward.toArray());
      const mesh = new THREE.Mesh(casingGeometry, casingMaterial);
      mesh.position.copy(this.muzzlePosition()).addScaledVector(forward, 0.28).addScaledVector(right, 0.03);
      mesh.castShadow = true;
      scene.add(mesh);
      if (casings.length >= CASINGS) {
        const old = /** @type {(typeof casings)[number]} */ (casings.shift());
        scene.remove(old.mesh);
      }
      casings.push({ mesh, v: new THREE.Vector3(...velocity), spin: new THREE.Vector3(...spin), life: 1.8, bounced: false });
    },
    /** A flash of light at a point (muzzle or blast). @param {readonly number[]} at @param {number} intensity @param {number} [color] */
    light(at, intensity, color = 0xffb866) {
      flashLight.position.set(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0);
      flashLight.color.setHex(color);
      flashLight.intensity = Math.max(flashLight.intensity, intensity);
    },
    /** An expanding ring on the ground. @param {readonly number[]} at @param {number} radius */
    shockwave(at, radius) {
      if (!fx.settings.resolved().enabled) return;
      ring.visible = true;
      ring.position.set(at[0] ?? 0, 0.06, at[2] ?? 0);
      juice.tween({
        duration: 0.35,
        ease: 'outCubic',
        onUpdate: (e, t) => {
          ring.scale.setScalar(Math.max(0.2, radius * e));
          ringMaterial.opacity = 0.7 * (1 - t);
        },
        onComplete: () => {
          ring.visible = false;
        },
      });
    },
    /** @param {'hit' | 'crit' | 'kill'} kind */
    hitMarker(kind) {
      if (!marker) return;
      const el = marker;
      markerTween?.cancel();
      el.style.color = kind === 'kill' ? '#ff4d4d' : kind === 'crit' ? '#ffd37a' : '#ffffff';
      const size = markerScale(kind);
      markerTween = juice.tween({
        duration: kind === 'kill' ? 0.36 : 0.2,
        ease: 'outCubic',
        onUpdate: (e, t) => {
          el.style.opacity = String(1 - t * t);
          el.style.transform = `scale(${size * (0.8 + 0.5 * e)})`;
        },
        onComplete: () => {
          el.style.opacity = '0';
        },
      });
    },
    /** Advance every pool. @param {number} dt @param {number} speed the player's ground speed, for the viewmodel bob */
    update(dt, speed) {
      kick = Math.max(0, kick - dt * 9);
      bob += dt * Math.min(speed, 8) * 1.4;
      const calm = fx.settings.resolved().reducedMotion;
      const sway = calm ? 0 : Math.min(1, speed / 6);
      const reloadDip = reload >= 0 ? Math.sin(Math.PI * reload) : 0;
      gun.position.set(rest.x + Math.sin(bob) * 0.006 * sway, rest.y + Math.abs(Math.sin(bob)) * 0.008 * sway - reloadDip * 0.12, rest.z + kick * 0.07);
      gun.rotation.set(kick * 0.1 - reloadDip * 0.7, 0, reloadDip * 0.25);

      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 120);
      tracers = tracers.filter((t) => {
        t.life -= dt;
        if (t.life <= 0) {
          scene.remove(t.mesh);
          return false;
        }
        t.mesh.scale.x = t.mesh.scale.y = 0.022 * (t.life / t.max + 0.2);
        return true;
      });
      for (let i = decals.length - 1; i >= 0; i -= 1) {
        const d = /** @type {(typeof decals)[number]} */ (decals[i]);
        d.life -= dt;
        if (d.life <= 0) {
          scene.remove(d.mesh);
          decals.splice(i, 1);
        }
      }
      casings = casings.filter((c) => {
        c.life -= dt;
        if (c.life <= 0) {
          scene.remove(c.mesh);
          return false;
        }
        c.v.y -= 16 * dt;
        c.mesh.position.addScaledVector(c.v, dt);
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        if (c.mesh.position.y < 0.02 && c.v.y < 0) {
          c.mesh.position.y = 0.02;
          c.v.y *= -0.35;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
          c.spin.multiplyScalar(0.5);
          if (!c.bounced) {
            c.bounced = true;
            fx.moment('casing-land', { position: c.mesh.position.toArray() });
          }
        }
        return true;
      });
    },
    get counts() {
      return { decals: decals.length, casings: casings.length, tracers: tracers.length };
    },
  };
}
