import { MODEL_MAX_PARTS, MODEL_NAME_MAX, type ModelPart, type ModelSculptPart, type ModelSpec } from '../media-model';
import { modelAssetHash } from './assets';
import { EditableMesh } from './mesh/editable-mesh';
import { encodeMeshBin, MESH_GROUP_NONE } from './mesh/mesh-bin';
import type { ModelOpEntry } from './mesh/ops-log';
import { RemeshError, voxelRemesh, type RemeshOptions } from './mesh/voxel-remesh';
import { buildSceneChecked, descendantIndices, indexParts, resolveRef } from './scene';

/**
 * Converting a design's primitives into one sculptable mesh (Phase 104 Theme B).
 *
 * The kernel's own scene (booleans, modifiers and transforms applied) is merged into one triangle
 * soup in world space and voxel-remeshed into a single watertight mesh. Each source part becomes a
 * vertex group, so its colour and name survive on the result. The primitives are not deleted: they
 * stay in the design, hidden, and the new `sculpt` part lists them in `sources`, which is what
 * {@link revertSculptToParts} (and undo) bring back.
 */

export type ConvertOptions = RemeshOptions & {
  /** Part ids or names to convert (a group takes its descendants with it). Absent: every visible part. */
  parts?: readonly string[];
};

export type ConvertGroup = { name: string; color: string };

export type ConvertResult =
  | {
      ok: true;
      /** The design with an id on every converted part, which {@link applyConversion} then edits. */
      spec: ModelSpec;
      positions: Float32Array;
      indices: Uint32Array;
      /** One entry of `groupTable` per vertex. */
      groups: Uint16Array;
      groupTable: ConvertGroup[];
      /** Ids of every part the new mesh replaces (what gets hidden). */
      sourceIds: string[];
      voxelSize: number;
      coarsened: boolean;
      warnings: string[];
    }
  | { ok: false; error: string };

/** Smallest unused `p<N>` id, as the rest of the tooling assigns them. */
/** Smallest unused `p<N>` id, as the rest of the tooling assigns them. */
export function freshPartId(used: ReadonlySet<string>): string {
  return freshId(used);
}

function freshId(used: ReadonlySet<string>): string {
  let n = used.size + 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

const uniqueName = (parts: readonly ModelPart[], base: string): string => {
  const names = new Set(parts.map((part) => part.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, MODEL_NAME_MAX - 4)} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
};

export function convertToSculptMesh(input: ModelSpec, options: ConvertOptions = {}): ConvertResult {
  // Give every part an id first, so sources can be named and hidden by id.
  const used = new Set<string>();
  const parts = input.parts.map((part) => {
    if (part.id && !used.has(part.id)) {
      used.add(part.id);
      return part;
    }
    const id = freshId(used);
    used.add(id);
    return { ...part, id };
  });
  const spec: ModelSpec = { ...input, parts };

  const index = indexParts(parts);
  const selected = new Set<number>();
  if (options.parts && options.parts.length > 0) {
    for (const ref of options.parts) {
      const at = resolveRef(index, ref);
      if (at === null) return { ok: false, error: `No part has id "${ref}" or a unique name "${ref}".` };
      selected.add(at);
      for (const child of descendantIndices(parts, at)) selected.add(child);
    }
  } else parts.forEach((_, i) => selected.add(i));

  const built = buildSceneChecked(spec);
  const warnings = built.issues.map((issue) => issue.message);
  const solid = built.parts.filter((p) => p.role === 'solid' && selected.has(p.sourceIndex) && p.indices.length > 0);
  if (solid.length === 0) return { ok: false, error: 'There is nothing visible to convert — the chosen parts are hidden, empty or not loaded.' };

  // Merge into one soup; a group per source part.
  const groupOf = new Map<number, number>();
  const groupTable: ConvertGroup[] = [];
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const p of solid) {
    vertexTotal += p.positions.length;
    indexTotal += p.indices.length;
  }
  const positions = new Float64Array(vertexTotal);
  const indices = new Uint32Array(indexTotal);
  const triGroups = new Uint16Array(indexTotal / 3);
  let vAt = 0;
  let iAt = 0;
  for (const p of solid) {
    let group = groupOf.get(p.sourceIndex);
    if (group === undefined) {
      group = groupTable.length;
      groupOf.set(p.sourceIndex, group);
      const source = parts[p.sourceIndex]!;
      groupTable.push({ name: source.name, color: p.color });
    }
    const base = vAt / 3;
    positions.set(p.positions, vAt);
    for (let i = 0; i < p.indices.length; i += 1) indices[iAt + i] = base + p.indices[i]!;
    triGroups.fill(group, iAt / 3, (iAt + p.indices.length) / 3);
    vAt += p.positions.length;
    iAt += p.indices.length;
  }
  if (groupTable.length >= MESH_GROUP_NONE) return { ok: false, error: 'Too many parts to keep as vertex groups.' };

  let remeshed;
  try {
    remeshed = voxelRemesh({ positions, indices, groups: triGroups }, options);
  } catch (error) {
    if (error instanceof RemeshError) return { ok: false, error: error.message };
    throw error;
  }
  if (remeshed.coarsened) warnings.push(`The voxel size was raised to ${remeshed.voxelSize.toFixed(4)} to keep the grid within its cap; the mesh is coarser than asked.`);
  if (spec.rig && (spec.rig.bones?.length ?? 0) > 0) warnings.push('The design is rigged: the converted mesh is skinned by nearest bone, so re-check the weights (explicit `rig.bind` entries applied to the primitives).');

  // Hide every part the mesh stands in for, including boolean tools that were consumed by a selected part.
  const sourceSet = new Set([...selected].filter((i) => !parts[i]!.hidden));
  parts.forEach((part, i) => {
    if (!part.op || part.hidden) return;
    const target = part.target ? resolveRef(index, part.target) : null;
    if (target !== null && selected.has(target)) sourceSet.add(i);
  });
  const sourceIds = [...sourceSet].sort((a, b) => a - b).map((i) => parts[i]!.id!);
  return {
    ok: true,
    spec,
    positions: remeshed.positions,
    indices: remeshed.indices,
    groups: remeshed.groups,
    groupTable,
    sourceIds,
    voxelSize: remeshed.voxelSize,
    coarsened: remeshed.coarsened,
    warnings,
  };
}

export type ConvertedFile = { src: string; hash: string; vertices: number; triangles: number };

/** The part ids the sculpt parts of a design were converted from and that are still hidden by it. */
export const sculptSourceIds = (spec: ModelSpec): Set<string> => new Set(spec.parts.flatMap((p) => (p.shape === 'sculpt' ? (p.sources ?? []) : [])));

/**
 * The design after a conversion: the converted parts hidden, and one `sculpt` part, at the world origin
 * (its mesh is already in world space), appended. Its colour is the largest group's.
 */
export function applyConversion(result: Extract<ConvertResult, { ok: true }>, file: ConvertedFile, options: { name?: string; id?: string } = {}): { spec: ModelSpec; partId: string } {
  const { spec } = result;
  const hide = new Set(result.sourceIds);
  const ids = new Set(spec.parts.map((p) => p.id!));
  const partId = options.id ?? freshId(ids);
  const counts = new Array<number>(result.groupTable.length).fill(0);
  for (const g of result.groups) if (g !== MESH_GROUP_NONE) counts[g] = counts[g]! + 1;
  const largest = counts.indexOf(Math.max(...counts));
  const sculpt: ModelSculptPart = {
    shape: 'sculpt',
    id: partId,
    name: uniqueName(spec.parts, options.name ?? `${spec.name} mesh`),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: result.groupTable[largest]?.color ?? '#b0b0b0',
    src: file.src,
    hash: file.hash,
    vertices: file.vertices,
    triangles: file.triangles,
    multiresLevel: 0,
    sources: result.sourceIds,
    groups: result.groupTable,
  };
  const parts = spec.parts.map((part) => (hide.has(part.id!) ? { ...part, hidden: true } : part));
  if (parts.length >= MODEL_MAX_PARTS) throw new RemeshError(`A design holds at most ${MODEL_MAX_PARTS} parts.`);
  return { spec: { ...spec, parts: [...parts, sculpt] }, partId };
}

/** Undo of a conversion: drops the sculpt part and unhides the primitives it was made from. `null` when `id` is not a converted sculpt part. */
export function revertSculptToParts(spec: ModelSpec, id: string): ModelSpec | null {
  const at = spec.parts.findIndex((p) => p.id === id);
  const part = spec.parts[at];
  if (!part || part.shape !== 'sculpt' || !part.sources || part.sources.length === 0) return null;
  const restore = new Set(part.sources);
  const parts = spec.parts
    .filter((_, i) => i !== at)
    .map((p) => {
      if (!p.id || !restore.has(p.id)) return p;
      const { hidden: _hidden, ...rest } = p;
      return rest as ModelPart;
    });
  return { ...spec, parts };
}

/** The id the converted part will get — known before the file is named, since the file name carries it. */
export const nextSculptPartId = (result: Extract<ConvertResult, { ok: true }>): string => freshId(new Set(result.spec.parts.map((p) => p.id!)));

/** The `.mesh.bin` bytes of a conversion (normals computed, vertex groups kept) with the values its part records. */
export function encodeConverted(result: Extract<ConvertResult, { ok: true }>): { bytes: Uint8Array; file: Omit<ConvertedFile, 'src'> } {
  const mesh = new EditableMesh({ positions: result.positions, indices: result.indices });
  const bytes = encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0, groups: result.groups });
  return { bytes, file: { hash: modelAssetHash(bytes), vertices: mesh.vertexCount, triangles: mesh.faceCount } };
}

/** The op-log line a conversion leaves beside its mesh. */
export function convertOpEntry(result: Extract<ConvertResult, { ok: true }>, hash: string, by: 'user' | 'agent', at = new Date().toISOString()): ModelOpEntry {
  return {
    kind: 'convert',
    at,
    by,
    hash,
    data: { voxelSize: Number(result.voxelSize.toFixed(5)), sources: result.sourceIds, groups: result.groupTable.map((g) => g.name) },
  };
}
