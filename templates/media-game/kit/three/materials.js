// @ts-check
/**
 * Midnite game kit — procedural PBR materials for three.js games.
 *
 * `createMaterials()` returns a cache of `MeshStandardMaterial` presets wired with
 * generated `map`, `normalMap`, `roughnessMap` and `bumpMap` (see
 * `kit/core/procedural-textures.js`): `stone`, `brick`, `wood`, `metal`, `grass`,
 * `dirt`, `tiles`. No image files. A material is cached per key, so asking for the
 * same preset twice returns the same object; textures are shared per
 * (preset, seed, size) and cloned only to change `repeat`.
 *
 *   const mats = createMaterials({ renderer });
 *   mesh.material = mats.get('brick', { repeat: [4, 2] });
 *   floor.material = mats.get('stone', { repeat: [20, 20], tint: 0x8899aa });
 *
 * Meshes need a `uv` attribute (every three primitive has one). For a box, `repeat`
 * counts tiles across a face; use `repeatFor(width, height, tileMetres)` to keep texel
 * density even between a big floor and a small crate.
 */

import * as THREE from 'three';

import { generateCanvases, TEXTURE_KINDS } from '../core/procedural-textures.js';

/**
 * @typedef {{
 *   seed?: number, size?: number, repeat?: [number, number], tint?: number,
 *   normalScale?: number, bumpScale?: number, roughness?: number, metalness?: number,
 *   envMapIntensity?: number,
 * }} MaterialOptions
 */

/** Per-preset physical defaults: metalness and the normal / bump strength that reads well. */
const PRESET_PHYSICS = /** @type {Record<string, { metalness: number, normalScale: number, bumpScale: number }>} */ ({
  stone: { metalness: 0, normalScale: 1, bumpScale: 0.6 },
  brick: { metalness: 0, normalScale: 1.1, bumpScale: 0.8 },
  wood: { metalness: 0, normalScale: 0.7, bumpScale: 0.4 },
  metal: { metalness: 0.85, normalScale: 0.5, bumpScale: 0.3 },
  grass: { metalness: 0, normalScale: 0.9, bumpScale: 0.5 },
  dirt: { metalness: 0, normalScale: 1, bumpScale: 0.6 },
  tiles: { metalness: 0.05, normalScale: 0.9, bumpScale: 0.5 },
});

/**
 * Tiles needed to cover `width` × `height` metres with a texture that spans `tileMetres`.
 * @param {number} width
 * @param {number} height
 * @param {number} [tileMetres]
 * @returns {[number, number]}
 */
export const repeatFor = (width, height, tileMetres = 2) => [Math.max(1, width / tileMetres), Math.max(1, height / tileMetres)];

/**
 * @param {{ renderer?: THREE.WebGLRenderer, maxAnisotropy?: number }} [options]
 */
export function createMaterials(options = {}) {
  const anisotropy = Math.min(options.maxAnisotropy ?? 8, options.renderer?.capabilities.getMaxAnisotropy() ?? 8);
  /** @type {Map<string, { map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture }>} */
  const textureSets = new Map();
  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  const materials = new Map();

  const texture = (/** @type {HTMLCanvasElement} */ canvas, /** @type {boolean} */ color) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };

  const textureSet = (/** @type {string} */ preset, /** @type {number} */ seed, /** @type {number} */ size) => {
    const key = `${preset}:${seed}:${size}`;
    let set = textureSets.get(key);
    if (!set) {
      const c = generateCanvases(/** @type {any} */ (preset), { seed, size });
      set = { map: texture(c.albedo, true), normalMap: texture(c.normal, false), roughnessMap: texture(c.roughness, false), bumpMap: texture(c.bump, false) };
      textureSets.set(key, set);
    }
    return set;
  };

  return {
    presets: TEXTURE_KINDS,
    /**
     * A cached material. The same `(preset, options)` returns the same instance.
     * @param {typeof TEXTURE_KINDS[number]} preset
     * @param {MaterialOptions} [o]
     */
    get(preset, o = {}) {
      const seed = o.seed ?? 1;
      const size = o.size ?? 256;
      const repeat = o.repeat ?? [1, 1];
      const key = JSON.stringify([preset, seed, size, repeat, o.tint ?? null, o.normalScale ?? null, o.bumpScale ?? null, o.roughness ?? null, o.metalness ?? null, o.envMapIntensity ?? null]);
      let material = materials.get(key);
      if (!material) {
        const physics = PRESET_PHYSICS[preset] ?? { metalness: 0, normalScale: 1, bumpScale: 0.5 };
        const base = textureSet(preset, seed, size);
        // Share the base textures when tiling once; clone (cheap, shares the image) to change repeat.
        const place = (/** @type {THREE.CanvasTexture} */ t) => {
          if (repeat[0] === 1 && repeat[1] === 1) return t;
          const c = t.clone();
          c.repeat.set(repeat[0], repeat[1]);
          c.needsUpdate = true;
          return c;
        };
        material = new THREE.MeshStandardMaterial({
          color: o.tint ?? 0xffffff,
          map: place(base.map),
          normalMap: place(base.normalMap),
          normalScale: new THREE.Vector2(1, 1).multiplyScalar(o.normalScale ?? physics.normalScale),
          roughnessMap: place(base.roughnessMap),
          roughness: o.roughness ?? 1,
          metalness: o.metalness ?? physics.metalness,
          bumpMap: place(base.bumpMap),
          bumpScale: o.bumpScale ?? physics.bumpScale,
          envMapIntensity: o.envMapIntensity ?? 1,
        });
        material.name = `kit:${preset}`;
        materials.set(key, material);
      }
      return material;
    },
    /** Free every texture and material. */
    dispose() {
      for (const m of materials.values()) {
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.bumpMap]) t?.dispose();
        m.dispose();
      }
      for (const set of textureSets.values()) for (const t of Object.values(set)) t.dispose();
      materials.clear();
      textureSets.clear();
    },
  };
}
