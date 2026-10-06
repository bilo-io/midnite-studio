// @ts-check
/**
 * Midnite game kit — loading a Midnite Studio terrain pack.
 *
 * `loadTerrain(manifestUrl, { scene, physics })` reads `terrain.manifest.json`
 * (version 1, validated by `kit/core/terrain-manifest.js`) and builds:
 *
 * - **chunks with LOD**: the pack's `chunks/lod<n>.glb` files each hold one
 *   node per chunk (`chunk_<cx>_<cz>`); `terrain.update(cameraPosition)`
 *   shows each chunk at the level `selectLod` picks, loading a LOD file the
 *   first time any chunk needs it. A pack without chunk files gets one mesh
 *   built from the heightfield instead.
 * - **the collider** from the 16-bit `heightfield.png` (exact samples, not the
 *   render mesh) as a Rapier heightfield
 * - **foliage** as one `InstancedMesh` per asset, **buildings** extruded from
 *   their footprints (with convex colliders), and **road** ribbons
 * - `terrain.roads` (`{ nodes, edges }`) and `terrain.heightAt(x, z)` for game code
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createHeightfield, toRapierHeights } from '../core/heightfield.js';
import { chunkCentre, chunkWorldSize, parseChunkName, selectLod } from '../core/lod.js';
import { decodePng16 } from '../core/png16.js';
import { roadAdjacency, roadRibbon } from '../core/road-ribbon.js';
import { parseHeightfieldInfo, parseTerrainManifest, resolveTerrainPath } from '../core/terrain-manifest.js';
import { loadModel } from './gltf.js';

/** @param {string} url */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.json();
}

/**
 * @param {string} manifestUrl
 * @param {{
 *   scene?: THREE.Object3D,
 *   physics?: import('./physics.js').Physics,
 *   foliage?: boolean,
 *   buildings?: boolean,
 *   roads?: boolean,
 *   fallbackStep?: number,
 * }} [options]
 */
export async function loadTerrain(manifestUrl, options = {}) {
  const parsed = parseTerrainManifest(await fetchJson(manifestUrl));
  if (!parsed.ok) throw new Error(parsed.message);
  const manifest = parsed.value;
  const url = (/** @type {string} */ path) => resolveTerrainPath(manifestUrl, path);

  const info = parseHeightfieldInfo(await fetchJson(url(manifest.heightfield.json)));
  if (!info.ok) throw new Error(info.message);
  const png = await decodePng16(await (await fetch(url(manifest.heightfield.png))).arrayBuffer());
  if (png.bitDepth !== 16 || png.width !== info.value.resolution || png.height !== info.value.resolution) {
    throw new Error('heightfield.png does not match heightfield.json (expected a 16-bit square image).');
  }
  const heightfield = createHeightfield(/** @type {Uint16Array} */ (png.data), info.value);
  const { resolution, worldSize } = heightfield;

  const group = new THREE.Group();
  group.name = `terrain:${manifest.name}`;
  options.scene?.add(group);

  // --- collider ---------------------------------------------------------------
  let collider = null;
  if (options.physics) {
    const { RAPIER, world } = options.physics;
    collider = world.createCollider(
      RAPIER.ColliderDesc.heightfield(resolution - 1, resolution - 1, toRapierHeights(heightfield.heights, resolution), {
        x: worldSize,
        y: 1,
        z: worldSize,
      }),
    );
  }

  // --- material ---------------------------------------------------------------
  const textureLoader = new THREE.TextureLoader();
  /** @type {THREE.MeshStandardMaterial} */
  let groundMaterial;
  if (manifest.maps.drape) {
    const drape = await textureLoader.loadAsync(url(manifest.maps.drape));
    drape.colorSpace = THREE.SRGBColorSpace;
    groundMaterial = new THREE.MeshStandardMaterial({ map: drape, roughness: 0.95 });
  } else {
    groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  }

  // --- chunks -----------------------------------------------------------------
  const size = chunkWorldSize(resolution, worldSize);
  /** @type {Map<string, { cx: number, cz: number, lods: (THREE.Object3D | null)[], shown: number }>} */
  const chunks = new Map();
  /** @type {Map<number, Promise<void>>} */
  const lodLoads = new Map();
  const lodFiles = new Map(manifest.chunks.lods.map((l) => [l.lod, l.glb]));

  /** @param {number} lod */
  const loadLod = (lod) => {
    const file = lodFiles.get(lod);
    if (!file) return Promise.resolve();
    let pending = lodLoads.get(lod);
    if (!pending) {
      pending = loadModel(url(file)).then(({ scene }) => {
        for (const node of [...scene.children]) {
          const at = parseChunkName(node.name);
          if (!at) continue;
          const key = `${at.cx},${at.cz}`;
          const chunk = chunks.get(key) ?? { ...at, lods: [null, null, null, null], shown: -1 };
          node.visible = false;
          node.traverse((o) => {
            const mesh = /** @type {THREE.Mesh} */ (o);
            if (mesh.isMesh) {
              mesh.receiveShadow = true;
              mesh.castShadow = false;
              if (!manifest.maps.drape && !(/** @type {THREE.MeshStandardMaterial} */ (mesh.material).map)) mesh.material = groundMaterial;
            }
          });
          chunk.lods[lod] = node;
          chunks.set(key, chunk);
          group.add(node);
        }
      });
      lodLoads.set(lod, pending);
    }
    return pending;
  };

  let fallback = /** @type {THREE.Mesh | null} */ (null);
  if (lodFiles.size === 0) {
    fallback = heightfieldMesh(heightfield, groundMaterial, options.fallbackStep);
    group.add(fallback);
  } else {
    // The coarsest level first, so something is on screen at once.
    const coarsest = Math.max(...lodFiles.keys());
    await loadLod(coarsest).catch(() => {
      fallback = heightfieldMesh(heightfield, groundMaterial, options.fallbackStep);
      group.add(fallback);
    });
  }

  // --- foliage, buildings, roads ---------------------------------------------
  if (manifest.foliage && options.foliage !== false) {
    group.add(await buildFoliage(await fetchJson(url(manifest.foliage)), manifest, url));
  }
  if (manifest.buildings && options.buildings !== false) {
    const buildings = /** @type {{ buildings: { polygon: number[][], baseY: number, height: number }[] }} */ (
      await fetchJson(url(manifest.buildings))
    );
    const mesh = buildBuildings(buildings.buildings);
    if (mesh) group.add(mesh);
    if (options.physics) {
      const { RAPIER, world } = options.physics;
      for (const b of buildings.buildings) {
        const points = new Float32Array(b.polygon.flatMap(([x = 0, z = 0]) => [x, b.baseY, z, x, b.baseY + b.height, z]));
        const desc = RAPIER.ColliderDesc.convexHull(points);
        if (desc) world.createCollider(desc);
      }
    }
  }
  /** @type {{ nodes: { id: number, p: number[], degree: number }[], edges: { id: number, a: number, b: number, points: number[][], widthM: number, kind: string, lengthM: number }[] }} */
  let roads = { nodes: [], edges: [] };
  if (manifest.roads) {
    roads = await fetchJson(url(manifest.roads));
    if (options.roads !== false) {
      const mesh = buildRoads(roads.edges);
      if (mesh) group.add(mesh);
    }
  }
  const adjacency = roadAdjacency(roads);

  return {
    manifest,
    group,
    heightfield,
    collider,
    /** The road graph exactly as exported, plus node id → touching edge ids. */
    roads: { ...roads, adjacency },
    /** Ground height in metres at world `(x, z)`. */
    heightAt: (/** @type {number} */ x, /** @type {number} */ z) => heightfield.heightAt(x, z),
    bounds: manifest.bounds,
    /**
     * Pick each chunk's LOD from the camera position; call once per frame.
     * @param {{ x: number, y: number, z: number }} cameraPosition
     */
    update(cameraPosition) {
      if (fallback || chunks.size === 0) return;
      for (const chunk of chunks.values()) {
        const [x, z] = chunkCentre(chunk.cx, chunk.cz, resolution, worldSize);
        const y = heightfield.heightAt(x, z);
        const want = selectLod(Math.hypot(cameraPosition.x - x, cameraPosition.y - y, cameraPosition.z - z), size);
        // Show the wanted level if loaded, else the nearest loaded coarser or finer one.
        let lod = want;
        if (!chunk.lods[lod]) {
          void loadLod(want).catch(() => {});
          const loaded = chunk.lods.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
          if (loaded.length === 0) continue;
          lod = loaded.reduce((best, i) => (Math.abs(i - want) < Math.abs(best - want) ? i : best));
        }
        if (lod === chunk.shown) continue;
        chunk.lods.forEach((node, i) => {
          if (node) node.visible = i === lod;
        });
        chunk.shown = lod;
      }
    },
  };
}

/**
 * One mesh straight from the heightfield, for packs without chunk files.
 * @param {ReturnType<typeof createHeightfield>} heightfield
 * @param {THREE.Material} material
 * @param {number} [step] sample every `step`-th vertex (default: at most 256 quads a side)
 */
export function heightfieldMesh(heightfield, material, step) {
  const { resolution, worldSize, heights } = heightfield;
  const stride = Math.max(1, step ?? Math.ceil((resolution - 1) / 256));
  const verts = Math.floor((resolution - 1) / stride) + 1;
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, verts - 1, verts - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const [min, max] = heightfield.heightRange;
  const colors = new Float32Array(position.count * 3);
  const low = new THREE.Color('#4f7a3a');
  const high = new THREE.Color('#9a8f7a');
  const color = new THREE.Color();
  for (let j = 0; j < verts; j += 1) {
    for (let i = 0; i < verts; i += 1) {
      const index = j * verts + i;
      const h = heights[Math.min(resolution - 1, j * stride) * resolution + Math.min(resolution - 1, i * stride)] ?? 0;
      position.setY(index, h);
      color.copy(low).lerp(high, max > min ? (h - min) / (max - min) : 0);
      colors.set([color.r, color.g, color.b], index * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain-heightfield';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * @param {{ assets: string[], instances: number[][] }} foliage
 * @param {import('../core/terrain-manifest.js').TerrainManifest} manifest
 * @param {(path: string) => string} url
 */
async function buildFoliage(foliage, manifest, url) {
  const group = new THREE.Group();
  group.name = 'foliage';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let assetIndex = 0; assetIndex < foliage.assets.length; assetIndex += 1) {
    const name = foliage.assets[assetIndex] ?? '';
    const instances = foliage.instances.filter((row) => row[0] === assetIndex);
    if (instances.length === 0) continue;
    const parts = await foliageParts(name, manifest, url);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, instances.length);
      mesh.name = `foliage:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      instances.forEach((row, i) => {
        const [, x = 0, y = 0, z = 0, yaw = 0, scale = 1] = row;
        quaternion.setFromAxisAngle(up, yaw);
        matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(i, matrix.multiply(part.matrix));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}

/**
 * The meshes one foliage asset is drawn with: its exported glb when the pack
 * has one, else a simple stand-in (a cone tree, or a low bush for grass).
 * @param {string} name
 * @param {import('../core/terrain-manifest.js').TerrainManifest} manifest
 * @param {(path: string) => string} url
 * @returns {Promise<{ geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4 }[]>}
 */
async function foliageParts(name, manifest, url) {
  const asset = manifest.foliageAssets?.find((a) => a.name === name);
  if (asset) {
    try {
      const { scene } = await loadModel(url(asset.glb));
      scene.updateMatrixWorld(true);
      /** @type {{ geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4 }[]} */
      const parts = [];
      scene.traverse((o) => {
        const mesh = /** @type {THREE.Mesh} */ (o);
        if (mesh.isMesh) {
          parts.push({ geometry: mesh.geometry, material: /** @type {THREE.Material} */ (mesh.material), matrix: mesh.matrixWorld.clone() });
        }
      });
      if (parts.length > 0) return parts;
    } catch {
      // fall through to the stand-in
    }
  }
  const grass = /grass|bush|shrub|flower/i.test(name);
  const geometry = grass ? new THREE.IcosahedronGeometry(0.35, 0) : new THREE.ConeGeometry(1.1, 4, 7);
  geometry.translate(0, grass ? 0.2 : 2, 0);
  const material = new THREE.MeshStandardMaterial({ color: grass ? '#6f9a3c' : '#2f5f2a', roughness: 1, flatShading: true });
  return [{ geometry, material, matrix: new THREE.Matrix4() }];
}

/**
 * Every building as one merged mesh: each footprint extruded from its base.
 * @param {{ polygon: number[][], baseY: number, height: number }[]} buildings
 */
export function buildBuildings(buildings) {
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  for (const b of buildings) {
    if (b.polygon.length < 3) continue;
    // Shape in (x, −z) so that rotating −90° about x lays it on the ground with +y up.
    const shape = new THREE.Shape(b.polygon.map(([x = 0, z = 0]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, b.baseY, 0);
    geometries.push(geometry.index ? geometry.toNonIndexed() : geometry);
  }
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  if (!merged) return null;
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: '#c9c2b6', roughness: 0.85 }));
  mesh.name = 'buildings';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Every road edge as one merged ribbon mesh.
 * @param {{ points: number[][], widthM: number }[]} edges
 */
export function buildRoads(edges) {
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  for (const edge of edges) {
    const { positions, indices } = roadRibbon(edge.points, edge.widthM);
    if (indices.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometries.push(geometry.toNonIndexed());
  }
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  if (!merged) return null;
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.name = 'roads';
  mesh.receiveShadow = true;
  return mesh;
}
