import {
  applySdfBake,
  encodeSdfBake,
  registerSculptMesh,
  sdfMeshSrcFor,
  sdfOpEntry,
  sdfTargetId,
  withPartIds,
  type GitOpResult,
  type ModelMeshResult,
  type ModelOpEntry,
  type ModelSpec,
  type SdfBakeResult,
  type SdfTree,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { bridge } from '../../../../services/bridge';
import { startSculptSession, type SculptSession } from './sculpt-client';

/**
 * SDF baking for the editor (Phase 104 Theme C). The bake runs in the sculpt worker; the renderer
 * encodes the result and registers it under its content hash, so the scene draws it like any sculpt
 * part. A **preview** stops there — the design it returns is for the viewport only and nothing is
 * written. A **commit** writes the `.mesh.bin` (its op log opening with the tree) through
 * `mediaModelMesh` first, so the design the editor then adopts never points at a file that is not on
 * disk.
 */
export type SdfBakeRequest = {
  /** The design as it stands (the editor's own, not a preview). */
  spec: ModelSpec;
  tree: SdfTree;
  /** The part to re-bake, or `null` to add a new one. */
  index: number | null;
  resolution: number;
  name?: string;
};

export type SdfBakeOutcome =
  | { ok: true; spec: ModelSpec; index: number; vertices: number; triangles: number; resolution: number; evaluatedShare: number }
  | { ok: false; error: string };

export type SdfBaker = {
  preview: (request: SdfBakeRequest) => Promise<SdfBakeOutcome>;
  commit: (request: SdfBakeRequest) => Promise<SdfBakeOutcome>;
};

export type SdfBakeDeps = {
  bake: (tree: SdfTree, resolution: number) => Promise<Pick<SdfBakeResult, 'positions' | 'indices' | 'groups' | 'groupTable' | 'voxelSize' | 'resolution' | 'dims' | 'evaluated'>>;
  writeMesh: (req: { src: string; data: Uint8Array; ops: ModelOpEntry[] }) => Promise<GitOpResult<ModelMeshResult>>;
  /** The design's file stem (`fox`), which names the mesh file. */
  stem: string;
};

export async function bakeSdfDesign(deps: SdfBakeDeps, request: SdfBakeRequest, mode: 'preview' | 'commit'): Promise<SdfBakeOutcome> {
  try {
    const spec = withPartIds(request.spec);
    const bake = await deps.bake(request.tree, request.resolution);
    const encoded = encodeSdfBake(bake);
    const id = sdfTargetId(spec, request.index);
    const src = sdfMeshSrcFor(deps.stem, id, encoded.hash);
    if (mode === 'commit') {
      const wrote = await deps.writeMesh({ src, data: encoded.bytes, ops: [sdfOpEntry(request.tree, bake, encoded.hash, 'user')] });
      if (!wrote.ok) return { ok: false, error: wrote.kind === 'error' ? wrote.message : 'The SDF mesh could not be saved.' };
    }
    registerSculptMesh(encoded.hash, encoded.bytes);
    const applied = applySdfBake(spec, {
      tree: request.tree,
      bake,
      file: { src, hash: encoded.hash, vertices: encoded.vertices, triangles: encoded.triangles },
      index: request.index,
      id,
      ...(request.name ? { name: request.name } : {}),
    });
    const nodes = bake.dims[0] * bake.dims[1] * bake.dims[2];
    return {
      ok: true,
      spec: applied.spec,
      index: applied.index,
      vertices: encoded.vertices,
      triangles: encoded.triangles,
      resolution: bake.resolution,
      evaluatedShare: Math.min(1, bake.evaluated / nodes),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The real thing: one worker for the panel's lifetime, the bridge's mesh channel for the file. */
export function useSdfBaker(repoId: string, project: string | null, path: string | null): SdfBaker | undefined {
  const dirOf = path && path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
  const stem = path ? (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') : '';
  const session = useRef<Promise<SculptSession> | null>(null);
  useEffect(
    () => () => {
      void session.current?.then((s) => s.dispose());
      session.current = null;
    },
    [],
  );
  const run = useCallback(
    async (request: SdfBakeRequest, mode: 'preview' | 'commit'): Promise<SdfBakeOutcome> => {
      const api = bridge()?.media.model.mesh;
      if (!api || !project) return { ok: false, error: 'SDF modelling needs the desktop app.' };
      session.current ??= startSculptSession();
      const worker = await session.current;
      return bakeSdfDesign(
        {
          bake: (tree, resolution) => worker.sdfBake(tree, resolution),
          writeMesh: (req) => api.write({ repoId, project, dir: dirOf, ...req }),
          stem,
        },
        request,
        mode,
      );
    },
    [repoId, project, dirOf, stem],
  );
  const baker = useMemo<SdfBaker>(() => ({ preview: (r) => run(r, 'preview'), commit: (r) => run(r, 'commit') }), [run]);
  return project && path ? baker : undefined;
}
