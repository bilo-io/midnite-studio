import { MODEL_MAX_PARTS, MODEL_NAME_MAX, type ModelPart, type ModelSculptPart, type ModelSpec } from '../../media-model';
import { sdfNodeNames, type SdfTree } from '../../media-model-sdf';
import { modelAssetHash } from '../assets';
import { freshPartId } from '../convert';
import { EditableMesh } from '../mesh/editable-mesh';
import { encodeMeshBin, MESH_GROUP_NONE } from '../mesh/mesh-bin';
import { MODEL_OPS_LINE_MAX, type ModelOpEntry } from '../mesh/ops-log';
import type { SdfBakeResult } from './bake';

/**
 * An SDF bake as a design edit (Phase 104 Theme C): the `.mesh.bin` bytes, the op-log line that opens
 * the file's history with the tree, and the `sculpt` part that holds the mesh and keeps the tree.
 *
 * Each bake gets its own content-named file (`<stem>.<part>.<hash8>.mesh.bin`), so undoing past a re-bake
 * never leaves a part pointing at a file that has since been overwritten.
 */

export type SdfBakedFile = { src: string; hash: string; vertices: number; triangles: number };

export const sdfMeshSrcFor = (stem: string, partId: string, hash: string): string => `${stem}.${partId}.${hash.slice(0, 8)}.mesh.bin`;

/** `.mesh.bin` bytes (normals computed, vertex groups kept) plus the values its part records. */
export function encodeSdfBake(bake: Pick<SdfBakeResult, 'positions' | 'indices' | 'groups'>): { bytes: Uint8Array; hash: string; vertices: number; triangles: number } {
  const mesh = new EditableMesh({ positions: bake.positions, indices: bake.indices });
  const bytes = encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0, groups: bake.groups });
  return { bytes, hash: modelAssetHash(bytes), vertices: mesh.vertexCount, triangles: mesh.faceCount };
}

/** The op-log line a bake starts its file's history with: the whole tree, or its names when it would not fit a line. */
export function sdfOpEntry(tree: SdfTree, bake: Pick<SdfBakeResult, 'resolution' | 'voxelSize'>, hash: string, by: 'user' | 'agent', at = new Date().toISOString()): ModelOpEntry {
  const data: Record<string, unknown> = { resolution: bake.resolution, voxelSize: Number(bake.voxelSize.toFixed(5)), tree };
  if (JSON.stringify(data).length > MODEL_OPS_LINE_MAX - 400) {
    delete data.tree;
    data.nodes = sdfNodeNames(tree);
  }
  return { kind: 'sdf', at, by, hash, data };
}

/** A part reference (id or unique name) to the index of a sculpt part that still carries its SDF tree. */
export function findSdfPart(spec: ModelSpec, ref?: string): { ok: true; index: number } | { ok: false; error: string } {
  const sdfParts = spec.parts.map((p, i) => [p, i] as const).filter(([p]) => p.shape === 'sculpt' && p.sdf);
  if (ref === undefined) {
    if (sdfParts.length === 1) return { ok: true, index: sdfParts[0]![1] };
    return { ok: false, error: sdfParts.length === 0 ? 'The design has no SDF part yet — create one with a tree first.' : `The design has ${sdfParts.length} SDF parts; name the one to edit.` };
  }
  const byId = spec.parts.findIndex((p) => p.id === ref);
  const byName = spec.parts.flatMap((p, i) => (p.name === ref ? [i] : []));
  const at = byId >= 0 ? byId : byName.length === 1 ? byName[0]! : -1;
  if (at < 0) return { ok: false, error: `No part has id "${ref}" or a unique name "${ref}".` };
  const part = spec.parts[at]!;
  if (part.shape !== 'sculpt') return { ok: false, error: `"${ref}" is a ${part.shape} part, not an SDF shape.` };
  if (!part.sdf) return { ok: false, error: `"${ref}" has been sculpted since it was baked, so its SDF tree is gone; sculpt it directly instead.` };
  return { ok: true, index: at };
}

const uniqueName = (parts: readonly ModelPart[], base: string): string => {
  const names = new Set(parts.map((part) => part.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, MODEL_NAME_MAX - 4)} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
};

/** Gives every part an id (the tooling's `p<N>`), so a new part can be named before its file is. */
export function withPartIds(spec: ModelSpec): ModelSpec {
  const used = new Set<string>();
  const parts = spec.parts.map((part) => {
    if (part.id && !used.has(part.id)) {
      used.add(part.id);
      return part;
    }
    const id = freshPartId(used);
    used.add(id);
    return { ...part, id };
  });
  return { ...spec, parts };
}

/** The id the bake will land under: the existing part's, or the next free one for a new part. */
export function sdfTargetId(spec: ModelSpec, index: number | null): string {
  if (index !== null) return spec.parts[index]!.id!;
  return freshPartId(new Set(spec.parts.map((p) => p.id!)));
}

/**
 * The design after a bake. With `index`, that part's mesh, counts, groups and tree are replaced and its
 * transform, material and name are kept; without, a new `sculpt` part is appended at the origin. `spec`
 * must already carry ids ({@link withPartIds}).
 */
export function applySdfBake(
  spec: ModelSpec,
  input: { tree: SdfTree; bake: Pick<SdfBakeResult, 'groups' | 'groupTable' | 'resolution'>; file: SdfBakedFile; index: number | null; id: string; name?: string },
): { spec: ModelSpec; index: number } {
  const { tree, bake, file } = input;
  const groups = bake.groupTable.length > 1 ? bake.groupTable.map((g) => ({ name: g.name.slice(0, MODEL_NAME_MAX), color: g.color })) : undefined;
  const fields = {
    src: file.src,
    hash: file.hash,
    vertices: file.vertices,
    triangles: file.triangles,
    multiresLevel: 0,
    sdf: { tree, resolution: bake.resolution },
  };
  if (input.index !== null) {
    const parts = spec.parts.map((part, i) => {
      if (i !== input.index || part.shape !== 'sculpt') return part;
      const { groups: _old, ...rest } = part;
      return { ...rest, ...fields, ...(groups ? { groups } : {}) } as ModelSculptPart;
    });
    return { spec: { ...spec, parts }, index: input.index };
  }
  if (spec.parts.length >= MODEL_MAX_PARTS) throw new Error(`A design holds at most ${MODEL_MAX_PARTS} parts.`);
  const counts = new Array<number>(bake.groupTable.length).fill(0);
  for (const g of bake.groups) if (g !== MESH_GROUP_NONE && g < counts.length) counts[g] = counts[g]! + 1;
  const largest = counts.indexOf(Math.max(...counts));
  const part: ModelSculptPart = {
    shape: 'sculpt',
    id: input.id,
    name: uniqueName(spec.parts, input.name ?? 'sdf shape'),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: bake.groupTable[largest]?.color ?? '#b0b0b0',
    ...fields,
    ...(groups ? { groups } : {}),
  };
  return { spec: { ...spec, parts: [...spec.parts, part] }, index: spec.parts.length };
}
