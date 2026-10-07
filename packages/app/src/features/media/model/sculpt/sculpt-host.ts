import { bakeSdf, Bvh, decodeMeshBin, EditableMesh, encodeMeshBin, voxelRemesh } from '@midnite/studio-shared';

import type { SculptRequest, SculptResponse } from './sculpt-protocol';

/**
 * The sculpt worker's body, as a plain function of its messages so vitest drives it without a Worker
 * (Phase 104 Theme A). `sculpt.worker.ts` binds it to `self`.
 *
 * Why a renderer Web Worker rather than a desktop utility process: a brush dab must answer in a frame,
 * and a hop through main's IPC per dab would cost more than the dab. The worker keeps the editor's
 * thread free while it moves up to ~1M vertices; only saves cross to main, through `mediaModelMesh`.
 */
export type Post = (message: SculptResponse, transfer?: Transferable[]) => void;

export function createSculptHost(post: Post): (message: SculptRequest) => void {
  let mesh: EditableMesh | null = null;
  let bvh: Bvh | null = null;
  let multiresLevel = 0;
  /** Vertex groups travel with the mesh through load → serialize (brushes never change topology in Theme B). */
  let groups: Uint16Array | undefined;

  const fail = (id: number, message: string): void => post({ type: 'error', id, message });

  return (message) => {
    try {
      switch (message.type) {
        case 'load': {
          const decoded = decodeMeshBin(new Uint8Array(message.bytes));
          mesh = new EditableMesh(decoded);
          bvh = new Bvh(mesh.positions, mesh.indices);
          multiresLevel = decoded.multiresLevel;
          groups = decoded.groups;
          const positions = mesh.positions.slice();
          const normals = mesh.normals.slice();
          const indices = mesh.indices.slice();
          post(
            { type: 'loaded', id: message.id, mesh: { vertices: mesh.vertexCount, triangles: mesh.faceCount, multiresLevel, positions, normals, indices } },
            [positions.buffer, normals.buffer, indices.buffer],
          );
          return;
        }
        case 'displace': {
          if (!mesh || !bvh) return fail(message.id, 'No sculpt mesh is loaded.');
          const { center, radius, amount } = message;
          const moved = bvh.verticesInSphere(center, radius);
          for (const v of moved) {
            const at = v * 3;
            const d = Math.hypot(mesh.positions[at]! - center[0], mesh.positions[at + 1]! - center[1], mesh.positions[at + 2]! - center[2]) / radius;
            // Smoothstep falloff: 1 at the centre, 0 at the rim.
            const falloff = 1 - d * d * (3 - 2 * d);
            const k = amount * falloff;
            mesh.setPosition(v, mesh.positions[at]! + mesh.normals[at]! * k, mesh.positions[at + 1]! + mesh.normals[at + 1]! * k, mesh.positions[at + 2]! + mesh.normals[at + 2]! * k);
          }
          const delta = mesh.takeDelta();
          if (delta) bvh.refit();
          post({ type: 'delta', id: message.id, delta, moved: moved.length }, delta ? [delta.positions.buffer, delta.normals.buffer] : []);
          return;
        }
        case 'raycast': {
          if (!bvh) return fail(message.id, 'No sculpt mesh is loaded.');
          const hit = bvh.raycast(message.origin, message.dir);
          post({ type: 'hit', id: message.id, hit: hit ? { point: hit.point, triangle: hit.triangle, distance: hit.distance } : null });
          return;
        }
        case 'serialize': {
          if (!mesh) return fail(message.id, 'No sculpt mesh is loaded.');
          const bytes = encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel, ...(groups ? { groups } : {}) });
          post({ type: 'serialized', id: message.id, bytes: bytes.buffer as ArrayBuffer, vertices: mesh.vertexCount, triangles: mesh.faceCount }, [bytes.buffer as ArrayBuffer]);
          return;
        }
        case 'remesh': {
          const out = voxelRemesh({ positions: message.positions, indices: message.indices, groups: message.groups }, message.options);
          post(
            { type: 'remeshed', id: message.id, positions: out.positions, indices: out.indices, groups: out.groups, voxelSize: out.voxelSize, coarsened: out.coarsened },
            [out.positions.buffer, out.indices.buffer, out.groups.buffer],
          );
          return;
        }
        case 'sdfBake': {
          const out = bakeSdf(message.tree, { resolution: message.resolution });
          const { positions, indices, groups, ...rest } = out;
          post({ type: 'sdfBaked', id: message.id, positions, indices, groups, ...rest }, [positions.buffer, indices.buffer, groups.buffer]);
          return;
        }
        case 'dispose':
          mesh = null;
          bvh = null;
          groups = undefined;
          post({ type: 'disposed', id: message.id });
          return;
      }
    } catch (error) {
      fail(message.id, error instanceof Error ? error.message : String(error));
    }
  };
}
