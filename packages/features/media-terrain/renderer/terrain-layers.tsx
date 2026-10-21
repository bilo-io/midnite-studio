import { BUSH_DESIGN, buildingsMesh, builtInFoliageDesign, foliageGeometry, roadMeshes, type Heightfield } from '@midnite/studio-shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

import { bucketInRange, groupFoliageByChunk, loadLayers, type TerrainLayersData } from './terrain-layers-data';

/**
 * Roads, buildings and foliage over the terrain (Phase 105 Themes G + H). Meshed here from the build's
 * JSON files with the shared kernels — the build writes data, never meshes (Decision 3), so the viewer
 * and Phase 107's runtime build the same geometry from the same file.
 */
const ROAD_COLOUR = '#3a3d42';

function geometryOf(mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array; colors?: Float32Array }): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  if (mesh.colors) geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Every ribbon and junction patch in one geometry: one draw call for the whole network. */
function roadsGeometry(data: TerrainLayersData, field: Heightfield): BufferGeometry | null {
  if (!data.roads || data.roads.edges.length === 0) return null;
  const parts = roadMeshes(data.roads, field);
  let vertices = 0;
  let indices = 0;
  for (const part of parts) {
    vertices += part.positions.length / 3;
    indices += part.indices.length;
  }
  if (indices === 0) return null;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const index = new Uint32Array(indices);
  let v = 0;
  let i = 0;
  for (const part of parts) {
    positions.set(part.positions, v * 3);
    normals.set(part.normals, v * 3);
    for (let k = 0; k < part.indices.length; k++) index[i + k] = part.indices[k]! + v;
    v += part.positions.length / 3;
    i += part.indices.length;
  }
  return geometryOf({ positions, normals, indices: index });
}

function foliageMeshes(data: TerrainLayersData, worldSize: number, chunksPerSide: number, material: MeshStandardMaterial) {
  if (!data.foliage || data.foliage.instances.length === 0) return { meshes: [] as InstancedMesh[], geometries: [] as BufferGeometry[], cell: worldSize };
  // One geometry per asset, built once with the Models kernel and shared by every chunk's mesh.
  const geometries = data.foliage.assets.map((asset) => geometryOf(foliageGeometry(builtInFoliageDesign(asset) ?? BUSH_DESIGN)));
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const meshes = groupFoliageByChunk(data.foliage, worldSize, chunksPerSide).map((bucket) => {
    const count = bucket.instances.length / 5;
    const mesh = new InstancedMesh(geometries[bucket.asset] ?? geometries[0]!, material, count);
    for (let k = 0; k < count; k++) {
      const [x, y, z, yaw, s] = bucket.instances.slice(k * 5, k * 5 + 5) as [number, number, number, number, number];
      matrix.compose(position.set(x, y, z), rotation.setFromAxisAngle(up, yaw), scale.set(s, s, s));
      mesh.setMatrixAt(k, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // A per-chunk bounding sphere is what lets three's frustum culling skip a whole chunk at once.
    mesh.computeBoundingSphere();
    mesh.userData = { bucket };
    return mesh;
  });
  return { meshes, geometries, cell: worldSize / Math.max(1, chunksPerSide) };
}

export function TerrainLayers({
  base,
  version,
  field,
  chunksPerSide,
  show,
}: {
  base: string;
  version: string;
  field: Heightfield;
  chunksPerSide: number;
  /** Which layers to draw: everything in the shaded modes, the road network alone over the road mask. */
  show: { roads: boolean; buildings: boolean; foliage: boolean };
}) {
  const [data, setData] = useState<TerrainLayersData | null>(null);
  useEffect(() => {
    let live = true;
    void loadLayers(base, version).then((next) => {
      if (live) setData(next);
    });
    return () => {
      live = false;
    };
  }, [base, version]);

  const roads = useMemo(() => (data ? roadsGeometry(data, field) : null), [data, field]);
  const buildings = useMemo(() => (data?.buildings && data.buildings.buildings.length > 0 ? geometryOf(buildingsMesh(data.buildings.buildings)) : null), [data]);
  const roadMaterial = useMemo(
    () => new MeshStandardMaterial({ color: ROAD_COLOUR, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    [],
  );
  const vertexMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide }), []);
  const foliage = useMemo(
    () => (data ? foliageMeshes(data, field.worldSize, chunksPerSide, vertexMaterial) : null),
    [data, field.worldSize, chunksPerSide, vertexMaterial],
  );

  useEffect(() => () => roads?.dispose(), [roads]);
  useEffect(() => () => buildings?.dispose(), [buildings]);
  useEffect(
    () => () => {
      for (const geometry of foliage?.geometries ?? []) geometry.dispose();
      for (const mesh of foliage?.meshes ?? []) mesh.dispose();
    },
    [foliage],
  );
  useEffect(
    () => () => {
      roadMaterial.dispose();
      vertexMaterial.dispose();
    },
    [roadMaterial, vertexMaterial],
  );

  // A fixed draw distance per chunk; the frustum test itself is three's, per mesh.
  const lastCheck = useRef(0);
  useFrame(({ camera, clock }) => {
    if (!foliage || foliage.meshes.length === 0 || clock.elapsedTime - lastCheck.current < 0.1) return;
    lastCheck.current = clock.elapsedTime;
    for (const mesh of foliage.meshes) {
      mesh.visible = bucketInRange(mesh.userData.bucket, foliage.cell, camera.position.x, camera.position.z);
    }
  });

  return (
    <group name="terrain-layers">
      {show.roads && roads ? <mesh geometry={roads} material={roadMaterial} renderOrder={1} /> : null}
      {show.buildings && buildings ? <mesh geometry={buildings} material={vertexMaterial} /> : null}
      {show.foliage && foliage ? foliage.meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} />) : null}
    </group>
  );
}
