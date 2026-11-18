// @ts-check
/**
 * Midnite game kit — three.js debug draw (Phase 140 Theme G).
 *
 * `__midnite.debug({ colliders, triggers, nav })` outlines the level's collider and trigger volumes as box wireframes
 * (amber and blue) and draws the navmesh's polygons (green) as line segments, one `LineSegments` each, so a debug
 * view costs three draw calls. The nav-mesh is read from `__midnite.navMesh()` each time it is switched on, so a
 * navmesh that finished building later is picked up. `buildLevel3d` installs it.
 */

import * as THREE from 'three';

import { registerDebug } from '../core/hook.js';
import { debugBoxes3d } from '../core/debug-shapes.js';

const COLLIDER = 0xf59e0b;
const TRIGGER = 0x3b82f6;
const NAV = 0x22c55e;

/** The 12 edges of a unit cube centred on the origin, as 24 `[x, y, z]` end points. */
const UNIT_EDGES = (() => {
  /** @type {[number, number, number][]} */
  const out = [];
  const corner = (/** @type {number} */ i) => /** @type {[number, number, number]} */ ([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]);
  for (let i = 0; i < 8; i += 1) for (const bit of [1, 2, 4]) if (!(i & bit)) out.push(corner(i), corner(i | bit));
  return out;
})();

/**
 * Every box's 12 edges as one position buffer (plain maths, so it needs no three.js object to build).
 * @param {import('../core/debug-shapes.js').Box3d[]} boxes
 * @param {(x: number, z: number) => number} ground
 */
function boxLines(boxes, ground) {
  const out = new Float32Array(boxes.length * UNIT_EDGES.length * 3);
  let at = 0;
  for (const b of boxes) {
    const base = b.position[1] ?? ground(b.position[0], b.position[2]);
    const cos = Math.cos(b.yaw), sin = Math.sin(b.yaw);
    for (const [ux, uy, uz] of UNIT_EDGES) {
      const x = ux * b.size[0], z = uz * b.size[2];
      // three's rotation.y: x' = x cos + z sin, z' = -x sin + z cos.
      out[at++] = b.position[0] + x * cos + z * sin;
      out[at++] = base + b.size[1] / 2 + uy * b.size[1];
      out[at++] = b.position[2] - x * sin + z * cos;
    }
  }
  return out;
}

/**
 * Every polygon's edges as one position buffer, at height `y`.
 * @param {[number, number][][]} polygons
 * @param {number} y
 */
function polygonLines(polygons, y) {
  const pts = [];
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = /** @type {[number, number]} */ (poly[i]), b = /** @type {[number, number]} */ (poly[(i + 1) % poly.length]);
      pts.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return new Float32Array(pts);
}

/**
 * @param {import('three').Scene} scene
 * @param {any} map the parsed `.tmj`
 * @param {{ ground?: (x: number, z: number) => number, groundY?: number }} [options]
 * @returns {() => void} dispose
 */
export function installDebugDraw3d(scene, map, options = {}) {
  const groundY = options.groundY ?? 0;
  const ground = options.ground ?? (() => groundY);
  const boxes = debugBoxes3d(map);
  /** @type {Record<string, import('three').LineSegments | null>} */
  const lines = { colliders: null, triggers: null, nav: null };

  /** @param {string} key @param {Float32Array | null} positions @param {number} colour */
  const show = (key, positions, colour) => {
    let mesh = lines[key];
    if (!positions || positions.length === 0) {
      if (mesh) mesh.visible = false;
      return;
    }
    if (!mesh) {
      mesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true }));
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      scene.add(mesh);
      lines[key] = mesh;
    }
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.geometry.computeBoundingSphere();
    mesh.visible = true;
  };

  const unregister = registerDebug((o) => {
    show('colliders', o.colliders ? boxLines(boxes.colliders, ground) : null, COLLIDER);
    show('triggers', o.triggers ? boxLines(boxes.triggers, ground) : null, TRIGGER);
    const hook = typeof window === 'undefined' ? null : /** @type {any} */ (window).__midnite;
    const polygons = o.nav && typeof hook?.navMesh === 'function' ? hook.navMesh().polygons : null;
    show('nav', polygons ? polygonLines(polygons, groundY + 0.05) : null, NAV);
  }, 'level-3d');

  return () => {
    unregister();
    for (const mesh of Object.values(lines)) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
      /** @type {import('three').Material} */ (mesh.material).dispose();
    }
  };
}
