import { bakeSdf, SculptDocument, voxelRemesh } from '@midnite/studio-shared';

import type { SculptLoaded, SculptRequest, SculptResponse } from './sculpt-protocol';

/**
 * The sculpt worker's body, as a plain function of its messages so vitest drives it without a Worker
 * (Phase 104 Themes A and D). `sculpt.worker.ts` binds it to `self`.
 *
 * Why a renderer Web Worker rather than a desktop utility process: a brush dab must answer in a frame,
 * and a hop through main's IPC per dab would cost more than the dab. The worker keeps the editor's
 * thread free while it moves up to ~1M vertices; only saves cross to main, through `mediaModelMesh`.
 * The brushes, symmetry, multires and history are the kernel's `SculptDocument`; this file only moves
 * its results across the boundary.
 */
export type Post = (message: SculptResponse, transfer?: Transferable[]) => void;

/** Copies of the document's current level, plus their buffers to transfer. */
function loadedOf(doc: SculptDocument): { mesh: SculptLoaded; transfer: Transferable[] } {
  const arrays = doc.displayArrays();
  const { levels, current } = doc.levels();
  return {
    mesh: { vertices: doc.mesh.vertexCount, triangles: doc.mesh.faceCount, multiresLevel: current, levels, revision: doc.revision, ...arrays },
    transfer: [arrays.positions.buffer, arrays.normals.buffer, arrays.indices.buffer, arrays.mask.buffer],
  };
}

export function createSculptHost(post: Post): (message: SculptRequest) => void {
  let doc: SculptDocument | null = null;

  const fail = (id: number, message: string): void => post({ type: 'error', id, message });

  /** Posts the changed ranges since the last post, as an `edit` reply. */
  const postEdit = (id: number, live: SculptDocument, extra: { hit?: { point: [number, number, number]; normal: [number, number, number] } | null; summary?: ReturnType<SculptDocument['endStroke']>; changed?: boolean } = {}) => {
    const { delta, mask } = live.takeDelta();
    const transfer: Transferable[] = [];
    if (delta) transfer.push(delta.positions.buffer, delta.normals.buffer);
    if (mask) transfer.push(mask.values.buffer);
    post(
      {
        type: 'edit',
        id,
        revision: live.revision,
        delta,
        mask,
        hit: extra.hit ?? null,
        ...(extra.summary !== undefined ? { summary: extra.summary } : {}),
        ...(extra.changed !== undefined ? { changed: extra.changed } : {}),
      },
      transfer,
    );
  };

  const postTopology = (id: number, live: SculptDocument, info: { voxelSize?: number; coarsened?: boolean } = {}) => {
    live.takeDelta();
    const { mesh, transfer } = loadedOf(live);
    post({ type: 'topology', id, revision: live.revision, mesh, ...info }, transfer);
  };

  return (message) => {
    try {
      switch (message.type) {
        case 'load': {
          doc = SculptDocument.fromMeshBin(new Uint8Array(message.bytes), message.revision ?? 0);
          const { mesh, transfer } = loadedOf(doc);
          post({ type: 'loaded', id: message.id, mesh }, transfer);
          return;
        }
        case 'strokeBegin': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          doc.beginStroke(message.brush, { symmetry: message.symmetry, ...(message.toWorld ? { toWorld: message.toWorld } : {}) });
          post({ type: 'ok', id: message.id });
          return;
        }
        case 'strokeTo': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          if (!doc.stroking) return fail(message.id, 'No stroke is in progress.');
          const hit = doc.strokeTo({ origin: message.origin, dir: message.dir, ...(message.pressure !== undefined ? { pressure: message.pressure } : {}) });
          postEdit(message.id, doc, { hit });
          return;
        }
        case 'strokeEnd': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          const summary = doc.endStroke();
          postEdit(message.id, doc, { summary });
          return;
        }
        case 'raycast': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          post({ type: 'hit', id: message.id, hit: doc.raycast(message.origin, message.dir) });
          return;
        }
        case 'mask': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          const changed = doc.maskOp(message.op);
          postEdit(message.id, doc, { changed });
          return;
        }
        case 'subdivide': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          doc.subdivide();
          postTopology(message.id, doc);
          return;
        }
        case 'level': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          doc.setLevel(message.level);
          postTopology(message.id, doc);
          return;
        }
        case 'voxelRemesh': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          const info = doc.remesh(message.options);
          postTopology(message.id, doc, info);
          return;
        }
        case 'seek': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          const epoch = doc.topologyEpoch;
          const ok = doc.seek(message.revision);
          if (ok && doc.topologyEpoch !== epoch) {
            doc.takeDelta();
            const { mesh, transfer } = loadedOf(doc);
            post({ type: 'sought', id: message.id, ok, revision: doc.revision, delta: null, mask: null, mesh }, transfer);
            return;
          }
          const { delta, mask } = doc.takeDelta();
          const transfer: Transferable[] = [];
          if (delta) transfer.push(delta.positions.buffer, delta.normals.buffer);
          if (mask) transfer.push(mask.values.buffer);
          post({ type: 'sought', id: message.id, ok, revision: doc.revision, delta, mask }, transfer);
          return;
        }
        case 'serialize': {
          if (!doc) return fail(message.id, 'No sculpt mesh is loaded.');
          const bytes = doc.serialize();
          post(
            { type: 'serialized', id: message.id, bytes: bytes.buffer as ArrayBuffer, vertices: doc.mesh.vertexCount, triangles: doc.mesh.faceCount, multiresLevel: doc.levels().current, revision: doc.revision },
            [bytes.buffer as ArrayBuffer],
          );
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
          doc = null;
          post({ type: 'disposed', id: message.id });
          return;
      }
    } catch (error) {
      fail(message.id, error instanceof Error ? error.message : String(error));
    }
  };
}
