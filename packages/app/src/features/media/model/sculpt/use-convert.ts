import {
  applyConversion,
  convertOpEntry,
  encodeConverted,
  finishConversion,
  nextSculptPartId,
  planConversion,
  registerSculptMesh,
  sculptMeshSrcFor,
  type GitOpResult,
  type ModelMeshResult,
  type ModelOpEntry,
  type ModelSpec,
  type RemeshOptions,
} from '@midnite/studio-shared';
import { useCallback } from 'react';

import { bridge } from '../../../../services/bridge';
import { startSculptSession } from './sculpt-client';

/**
 * "Convert to sculpt mesh" for the editor (Phase 104 Theme B): the primitives of the open design
 * become one watertight `sculpt` part. The kernel merges the scene on this thread (cheap), the voxel
 * remesh runs in the sculpt worker, and the result is written through `mediaModelMesh` before the
 * design adopts it — so a part never points at a file that is not on disk. The editor then makes the
 * returned spec one undo step.
 */
export type ConvertRequest = RemeshOptions & { spec: ModelSpec; parts?: string[] };

export type ConvertOutcome =
  | { ok: true; spec: ModelSpec; partId: string; vertices: number; triangles: number; voxelSize: number; warnings: string[] }
  | { ok: false; error: string };

export type ConvertDeps = {
  remesh: (
    soup: { positions: Float64Array; indices: Uint32Array; groups: Uint16Array },
    options: RemeshOptions,
  ) => Promise<{ positions: Float32Array; indices: Uint32Array; groups: Uint16Array; voxelSize: number; coarsened: boolean }>;
  writeMesh: (req: { src: string; data: Uint8Array; ops: ModelOpEntry[] }) => Promise<GitOpResult<ModelMeshResult>>;
  /** The design's file stem (`fox`), which names the mesh file. */
  stem: string;
};

export async function convertToSculpt(deps: ConvertDeps, request: ConvertRequest): Promise<ConvertOutcome> {
  const planned = planConversion(request.spec, { parts: request.parts });
  if (!planned.ok) return planned;
  const { plan } = planned;
  const options: RemeshOptions = { voxelSize: request.voxelSize, targetVertices: request.targetVertices };
  try {
    const remeshed = await deps.remesh(plan.soup, options);
    const result = finishConversion(plan, remeshed);
    const { bytes, file } = encodeConverted(result);
    const partId = nextSculptPartId(result);
    const src = sculptMeshSrcFor(deps.stem, partId);
    const wrote = await deps.writeMesh({ src, data: bytes, ops: [convertOpEntry(result, file.hash, 'user')] });
    if (!wrote.ok) return { ok: false, error: wrote.kind === 'error' ? wrote.message : 'The sculpt mesh could not be saved.' };
    // Draw it from here on: the scene builds sculpt parts from the registry.
    registerSculptMesh(file.hash, bytes);
    const applied = applyConversion(result, { src, ...file }, { id: partId });
    return { ok: true, spec: applied.spec, partId, vertices: file.vertices, triangles: file.triangles, voxelSize: result.voxelSize, warnings: result.warnings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The real thing: a fresh worker per conversion, the bridge's mesh channel for the file. */
export function useConvertToSculpt(repoId: string, project: string | null, path: string | null): ((request: ConvertRequest) => Promise<ConvertOutcome>) | undefined {
  const dirOf = path && path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
  const stem = path ? (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') : '';
  const run = useCallback(
    async (request: ConvertRequest): Promise<ConvertOutcome> => {
      const api = bridge()?.media.model.mesh;
      if (!api || !project) return { ok: false, error: 'Converting needs the desktop app.' };
      const session = await startSculptSession();
      try {
        return await convertToSculpt(
          {
            remesh: async (soup, options) => session.remesh(soup, options),
            writeMesh: (req) => api.write({ repoId, project, dir: dirOf, ...req }),
            stem,
          },
          request,
        );
      } finally {
        session.dispose();
      }
    },
    [repoId, project, dirOf, stem],
  );
  return project && path ? run : undefined;
}
