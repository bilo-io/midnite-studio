// @ts-check
/**
 * Midnite game kit — building a three.js scene from `levels/<scene>.tmj` (Phase 132).
 *
 * A 3D level is a plan-view map of object layers (see `core/level.js`). `buildLevel3d` turns each
 * entity into scene content: a `prop` or `trigger` rectangle becomes a box (footprint × `sizeY`,
 * 3 m by default) with a static collider unless `collider: 'none'`; with a `model` property the
 * glTF loads by asset name and gets a box collider of its bounds; a `light` becomes a point light;
 * a `path` returns its world XZ points. `spawn`, `exit` and the rest come back as `entities`.
 */

import * as THREE from 'three';

import { levelEntities, levelProps, metresPerTile, toWorld3d } from '../core/level.js';

/**
 * @typedef {{
 *   scene: import('three').Scene,
 *   physics?: { addBox: (position: readonly number[], half: readonly number[], rotationY?: number) => unknown },
 *   materials?: { get: (key: string, options?: Record<string, unknown>) => import('three').Material },
 *   loadModel?: (name: string) => Promise<{ scene: import('three').Object3D } | import('three').Object3D>,
 *   heightAt?: (x: number, z: number) => number,
 * }} Level3dContext
 */

/**
 * @param {Level3dContext} context
 * @param {any} map a parsed `.tmj`
 * @param {{ layer?: string }} [options]
 */
export async function buildLevel3d(context, map, options = {}) {
  const { scene, physics, materials, loadModel, heightAt } = context;
  const groundY = Number(levelProps(map)['midnite.groundY']) || 0;
  const ground = (/** @type {number} */ x, /** @type {number} */ z) => (heightAt ? heightAt(x, z) : groundY);
  const entities = levelEntities(map, options.layer ?? 'objects');
  /** @type {{ entity: import('../core/level.js').LevelEntity, world: ReturnType<typeof toWorld3d>, object: import('three').Object3D | null }[]} */
  const placed = [];
  /** @type {{ entity: import('../core/level.js').LevelEntity, points: [number, number][] }[]} */
  const paths = [];

  for (const entity of entities) {
    const world = toWorld3d(entity, map);
    const [x, elevation, z] = world.position;
    const base = elevation ?? ground(x, z);
    const none = entity.properties.collider === 'none';

    if (entity.type === 'path' && entity.polyline) {
      // A path's points are relative to its origin, in pixels: x → metres along X, y → metres along Z.
      const tw = Number(map?.tilewidth) || 1;
      const th = Number(map?.tileheight) || 1;
      const mpt = metresPerTile(map);
      paths.push({ entity, points: entity.polyline.map((p) => [((entity.x + p.x) / tw) * mpt, ((entity.y + p.y) / th) * mpt]) });
      placed.push({ entity, world, object: null });
      continue;
    }

    if (entity.type === 'light') {
      const light = new THREE.PointLight(
        typeof entity.properties.color === 'string' ? entity.properties.color : 0xffffff,
        Number(entity.properties.intensity) || 10,
        Number(entity.properties.range) || 0,
      );
      light.position.set(x, base + 1, z);
      scene.add(light);
      placed.push({ entity, world, object: light });
      continue;
    }

    const model = typeof entity.properties.model === 'string' ? entity.properties.model : '';
    const isVolume = (entity.type === 'prop' || entity.type === 'trigger') && entity.width > 0 && entity.height > 0;
    if (model && loadModel && entity.type === 'prop') {
      const loaded = await loadModel(model);
      const object = /** @type {import('three').Object3D} */ ('scene' in loaded ? loaded.scene : loaded);
      object.position.set(x, base, z);
      object.rotation.set(world.pitch, world.yaw, world.roll);
      object.scale.setScalar(world.scale);
      scene.add(object);
      if (!none && physics) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        physics.addBox([centre.x, centre.y, centre.z], [size.x / 2, size.y / 2, size.z / 2], world.yaw);
      }
      placed.push({ entity, world, object });
      continue;
    }
    if (isVolume) {
      const [w, h, d] = world.size;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        materials?.get(String(entity.properties.material || entity.name || 'stone')) ?? new THREE.MeshStandardMaterial({ color: 0x9aa0a6 }),
      );
      mesh.position.set(x, base + h / 2, z);
      mesh.rotation.set(world.pitch, world.yaw, world.roll);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = entity.type !== 'trigger';
      scene.add(mesh);
      if (!none && physics && entity.type === 'prop') physics.addBox([x, base + h / 2, z], [w / 2, h / 2, d / 2], world.yaw);
      placed.push({ entity, world, object: mesh });
      continue;
    }
    placed.push({ entity, world, object: null });
  }

  return {
    spawns: placed.filter((p) => p.entity.type === 'spawn').map((p) => ({ ...p, position: /** @type {[number, number, number]} */ ([p.world.position[0], p.world.position[1] ?? ground(p.world.position[0], p.world.position[2]), p.world.position[2]]) })),
    entities: placed,
    paths,
  };
}
