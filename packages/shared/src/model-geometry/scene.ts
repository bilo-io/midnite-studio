import {
  MODEL_MAX_SCENE_TRIANGLES,
  MODEL_MAX_PART_TRIANGLES,
  type ModelMaterial,
  type ModelPart,
  type ModelSpec,
} from '../media-model';
import { modelAsset } from './assets';
import { csg, CSG_MAX_TRIANGLES } from './csg';
import { composeLocal, identity, multiply, type Mat4 } from './math';
import { applyModifiers } from './modifiers';
import { buildLocalMesh } from './primitives';
import {
  bounds,
  dropDegenerate,
  smoothNormals,
  transformMesh,
  triangleCount,
  weld,
  type RawMesh,
  type Soup,
} from './raw';

/**
 * Turns a validated design into world-space triangle meshes — the one implementation behind the
 * `.obj`/`.fbx`/`.glb` writers, the PNG previews (main) and the live editor (renderer).
 *
 * Order of work per design: resolve the parent/instance graph → build each part's own mesh and
 * run its modifier stack → move it into world space → apply booleans (a part with `op` is consumed
 * by its `target`) → recompute smooth normals where geometry changed.
 */

export type ResolvedMaterial = {
  metalness: number;
  roughness: number;
  /** `#rrggbb`; black means no glow. */
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
};

export const DEFAULT_MATERIAL: ResolvedMaterial = { metalness: 0, roughness: 0.6, emissive: '#000000', emissiveIntensity: 1, opacity: 1 };

export const hexColor = (color: string): string => {
  const body = color.slice(1).toLowerCase();
  return `#${body.length === 3 ? [...body].map((ch) => ch + ch).join('') : body}`;
};

export function resolveMaterial(material: ModelMaterial | undefined): ResolvedMaterial {
  return {
    metalness: material?.metalness ?? DEFAULT_MATERIAL.metalness,
    roughness: material?.roughness ?? DEFAULT_MATERIAL.roughness,
    emissive: hexColor(material?.emissive ?? DEFAULT_MATERIAL.emissive),
    emissiveIntensity: material?.emissiveIntensity ?? DEFAULT_MATERIAL.emissiveIntensity,
    opacity: material?.opacity ?? DEFAULT_MATERIAL.opacity,
  };
}

export type MeshPart = {
  name: string;
  /** `#rrggbb`, lower-case. */
  color: string;
  material: ResolvedMaterial;
  /** xyz triples, world space. */
  positions: number[];
  /** xyz triples, unit length, one per position. */
  normals: number[];
  /** Triangle corner indices into `positions`/3. */
  indices: number[];
  /** Index of the spec part this came from (a boolean's result belongs to its target). */
  sourceIndex: number;
  /** `operand`: a boolean tool, built only when asked for (the editor shows it as a ghost). */
  role: 'solid' | 'operand';
  /** Built from an imported `asset` part: one dense mesh, skinned per vertex rather than per part. */
  imported?: boolean;
  /** uv pairs, one per position — an imported `asset` part's texture coordinates. */
  uvs?: number[];
  /** The asset hash whose registered texture this part is drawn with (`modelAsset(texture).texture`). */
  texture?: string;
};

export type BuildIssue = { path: string; message: string };
export type BuildResult = { parts: MeshPart[]; issues: BuildIssue[]; stats: { triangles: number; vertices: number } };

// --- references and the hierarchy -------------------------------------------------------------

export type PartIndex = { byId: Map<string, number>; byName: Map<string, number[]> };

export function indexParts(parts: readonly ModelPart[]): PartIndex {
  const byId = new Map<string, number>();
  const byName = new Map<string, number[]>();
  parts.forEach((part, i) => {
    if (part.id && !byId.has(part.id)) byId.set(part.id, i);
    byName.set(part.name, [...(byName.get(part.name) ?? []), i]);
  });
  return { byId, byName };
}

/** An id, or a name that only one part carries; `null` when unknown or ambiguous. */
export function resolveRef(index: PartIndex, ref: string): number | null {
  const byId = index.byId.get(ref);
  if (byId !== undefined) return byId;
  const named = index.byName.get(ref);
  return named && named.length === 1 ? named[0]! : null;
}

export const partLocalMatrix = (part: ModelPart): Mat4 => composeLocal(part.position, part.rotation, part.scale, part.pivot ?? [0, 0, 0]);

/** `parentOf[i]`: the index of part `i`'s parent, or `null` (also for a dangling reference or a cycle). */
export function parentIndices(parts: readonly ModelPart[]): (number | null)[] {
  const index = indexParts(parts);
  const raw = parts.map((part, i) => {
    if (!part.parent) return null;
    const at = resolveRef(index, part.parent);
    return at === null || at === i ? null : at;
  });
  // Break cycles: a part whose ancestry loops back to itself becomes a root.
  return raw.map((_, i) => {
    const seen = new Set<number>([i]);
    let at: number | null = raw[i] ?? null;
    while (at !== null) {
      if (seen.has(at)) return null;
      seen.add(at);
      at = raw[at] ?? null;
    }
    return raw[i] ?? null;
  });
}

export function worldMatrices(parts: readonly ModelPart[]): Mat4[] {
  const parents = parentIndices(parts);
  const cache: (Mat4 | undefined)[] = new Array(parts.length);
  const world = (i: number): Mat4 => {
    const hit = cache[i];
    if (hit) return hit;
    const parent = parents[i];
    const local = partLocalMatrix(parts[i]!);
    const out = parent === null || parent === undefined ? local : multiply(world(parent), local);
    cache[i] = out;
    return out;
  };
  return parts.map((_, i) => world(i));
}

/** The parent's world matrix (identity for a root) — what a gizmo-moved world transform is expressed against. */
export function parentWorldMatrix(parts: readonly ModelPart[], i: number): Mat4 {
  const parent = parentIndices(parts)[i];
  return parent === null || parent === undefined ? identity() : worldMatrices(parts)[parent]!;
}

/** Indices of every descendant of `i` (children, grandchildren, …), in part order. */
export function descendantIndices(parts: readonly ModelPart[], i: number): number[] {
  const parents = parentIndices(parts);
  const out: number[] = [];
  const isBelow = (k: number): boolean => {
    let at = parents[k];
    let guard = 0;
    while (at !== null && at !== undefined && guard++ < parts.length) {
      if (at === i) return true;
      at = parents[at];
    }
    return false;
  };
  parts.forEach((_, k) => {
    if (k !== i && isBelow(k)) out.push(k);
  });
  return out;
}

const isLeafShape = (part: ModelPart): boolean => part.shape !== 'group' && part.shape !== 'instance';

/** Hard problems a design cannot be built around — fed back to the LLM / reported to the agent. */
export function semanticIssues(spec: ModelSpec): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const { parts } = spec;
  const index = indexParts(parts);
  const seen = new Map<string, number>();
  parts.forEach((part, i) => {
    const at = `parts[${i}]`;
    if (part.id) {
      if (seen.has(part.id)) issues.push({ path: `${at}.id`, message: `Id "${part.id}" is already used by parts[${seen.get(part.id)}].` });
      else seen.set(part.id, i);
    }
    const check = (field: 'parent' | 'target' | 'source', ref: string | undefined): number | null => {
      if (ref === undefined) return null;
      const found = resolveRef(index, ref);
      if (found === null) {
        const ambiguous = (index.byName.get(ref)?.length ?? 0) > 1;
        issues.push({
          path: `${at}.${field}`,
          message: ambiguous ? `"${ref}" names several parts — refer to it by id.` : `No part has id or name "${ref}".`,
        });
      } else if (found === i) issues.push({ path: `${at}.${field}`, message: 'A part cannot refer to itself.' });
      return found;
    };
    check('parent', part.parent);
    const target = check('target', part.target);
    if (part.op && !isLeafShape(part)) issues.push({ path: `${at}.op`, message: `A ${part.shape} cannot be a boolean operand — give "op" to a solid part.` });
    if (part.op && part.shape === 'asset') issues.push({ path: `${at}.op`, message: 'An imported asset cannot be a boolean operand — its texture would not survive the cut.' });
    if (target !== null && target !== i) {
      const t = parts[target]!;
      if (!isLeafShape(t) || t.op) issues.push({ path: `${at}.target`, message: `"${t.name}" is not a solid part a boolean can apply to.` });
      else if (t.shape === 'asset') issues.push({ path: `${at}.target`, message: `"${t.name}" is an imported asset — booleans cannot cut it.` });
    }
    if (part.shape === 'instance') {
      const source = check('source', part.source);
      if (source !== null && source !== i && parts[source]!.shape === 'instance') {
        issues.push({ path: `${at}.source`, message: 'An instance cannot copy another instance — copy the original.' });
      }
    }
    if (part.shape === 'mesh') {
      part.faces.forEach((face, f) => {
        if (face.some((v) => v >= part.vertices.length)) {
          issues.push({ path: `${at}.faces[${f}]`, message: `Face uses vertex index ${Math.max(...face)}, but there are only ${part.vertices.length} vertices.` });
        }
      });
    }
  });
  // Parent cycles.
  const parents = parentIndices(parts);
  parts.forEach((part, i) => {
    if (!part.parent) return;
    const resolved = resolveRef(index, part.parent);
    if (resolved !== null && resolved !== i && parents[i] === null) issues.push({ path: `parts[${i}].parent`, message: 'Parent links form a loop.' });
  });
  return issues;
}

// --- building one part -----------------------------------------------------------------------

/** Shapes whose builders emit exact analytic normals (the rest are skinned soups already smoothed). */
const ANALYTIC = new Set<ModelPart['shape']>(['box', 'sphere', 'cylinder', 'cone', 'torus', 'lathe', 'extrude', 'capsule', 'roundedBox', 'wedge', 'prism', 'ellipsoid']);

/** Normal-smoothing angle of a part that was subdivided, and of one that was only deformed or copied. */
const SUBDIVIDED_ANGLE = 75;
const MODIFIED_ANGLE = 35;
const BOOLEAN_ANGLE = 30;

export type LocalPart = { mesh: RawMesh; issues: string[]; uvs?: number[]; texture?: string };

/**
 * An `asset` part's mesh from the registry, as the file has it — modifiers are not applied (they would
 * re-tessellate and lose the texture's coordinates). Unregistered: no geometry and an issue saying so.
 */
function buildAssetLocal(part: Extract<ModelPart, { shape: 'asset' }>): LocalPart {
  const asset = modelAsset(part.hash);
  if (!asset) return { mesh: { positions: [], normals: [], indices: [] }, issues: [`Imported mesh "${part.src}" is not loaded — the file is missing or has changed since it was imported.`] };
  const issues = (part.modifiers ?? []).some((m) => m.enabled !== false) ? ['Modifiers do not apply to an imported mesh; they were skipped.'] : [];
  return {
    mesh: { positions: asset.positions, normals: asset.normals, indices: asset.indices },
    issues,
    ...(asset.uvs ? { uvs: asset.uvs } : {}),
    ...(asset.texture ? { texture: part.hash } : {}),
  };
}

/** A part's own mesh in its own space: shape → modifiers → normals. `null` for group/instance. */
export function buildPartLocal(part: ModelPart): LocalPart | null {
  if (part.shape === 'asset') return buildAssetLocal(part);
  const raw = buildLocalMesh(part);
  if (!raw) return null;
  const active = (part.modifiers ?? []).filter((m) => m.enabled !== false);
  if (active.length > 0) {
    const result = applyModifiers(raw, active);
    const angle = part.smoothAngle ?? (result.subdivided ? SUBDIVIDED_ANGLE : MODIFIED_ANGLE);
    return { mesh: dropDegenerate(smoothNormals(result.soup, angle)), issues: result.issues };
  }
  if (part.smoothAngle !== undefined && ANALYTIC.has(part.shape)) {
    return { mesh: dropDegenerate(smoothNormals(weld(raw), part.smoothAngle)), issues: [] };
  }
  return { mesh: raw, issues: [] };
}

type Draw = { part: ModelPart; world: Mat4; owner: number; geometry: number };

export type BuildOptions = {
  /** Also return boolean operand parts (role `operand`) — for the editor's ghosts. */
  operands?: boolean;
};

const soupOf = (mesh: { positions: number[]; indices: number[] }): Soup => ({ positions: mesh.positions, indices: mesh.indices });

export function buildSceneChecked(spec: ModelSpec, options: BuildOptions = {}): BuildResult {
  const { parts } = spec;
  const issues: BuildIssue[] = [];
  const index = indexParts(parts);
  const parents = parentIndices(parts);
  const worlds = worldMatrices(parts);

  const hiddenEffective = parts.map((_, i) => {
    let at: number | null = i;
    let guard = 0;
    while (at !== null && guard++ <= parts.length) {
      if (parts[at]!.hidden) return true;
      at = parents[at] ?? null;
    }
    return false;
  });

  const localCache = new Map<number, LocalPart | null>();
  const localPart = (geometry: number): LocalPart | null => {
    if (!localCache.has(geometry)) {
      const built = buildPartLocal(parts[geometry]!);
      localCache.set(geometry, built);
      built?.issues.forEach((message) => issues.push({ path: `parts[${geometry}]`, message }));
    }
    return localCache.get(geometry) ?? null;
  };
  const local = (geometry: number): RawMesh | null => localPart(geometry)?.mesh ?? null;

  const draws: Draw[] = [];
  const tools: number[] = [];
  parts.forEach((part, i) => {
    if (hiddenEffective[i]) return;
    if (part.shape === 'group') return;
    if (part.shape === 'instance') {
      const at = resolveRef(index, part.source);
      if (at === null || at === i) return;
      const source = parts[at]!;
      if (source.shape === 'instance') return;
      if (source.shape !== 'group') {
        if (!source.op) draws.push({ part: source, world: worlds[i]!, owner: i, geometry: at });
        return;
      }
      // A whole group: every descendant, positioned relative to the group, under this instance's transform.
      const rel = new Map<number, Mat4>();
      const relative = (k: number): Mat4 | null => {
        if (rel.has(k)) return rel.get(k)!;
        const p = parents[k];
        if (p === null || p === undefined) return null;
        const base = p === at ? identity() : relative(p);
        if (!base) return null;
        const m = multiply(base, partLocalMatrix(parts[k]!));
        rel.set(k, m);
        return m;
      };
      for (const k of descendantIndices(parts, at)) {
        const child = parts[k]!;
        const m = relative(k);
        if (!m || !isLeafShape(child) || child.op || hiddenEffective[k]) continue;
        draws.push({ part: child, world: multiply(worlds[i]!, m), owner: i, geometry: k });
      }
      return;
    }
    if (part.op && part.shape !== 'asset') {
      tools.push(i);
      return;
    }
    draws.push({ part, world: worlds[i]!, owner: i, geometry: i });
  });

  // Booleans: tool → target, applied in part order.
  const toolsOf = new Map<number, number[]>();
  for (const t of tools) {
    const tool = parts[t]!;
    let target: number | null = tool.target ? resolveRef(index, tool.target) : null;
    if (tool.target === undefined) {
      for (let k = t - 1; k >= 0; k -= 1) {
        const candidate = parts[k]!;
        if (isLeafShape(candidate) && !candidate.op) {
          target = k;
          break;
        }
      }
    }
    if (target === null || target === t) {
      issues.push({ path: `parts[${t}].target`, message: `"${tool.name}" has no part to apply its ${tool.op} to.` });
      continue;
    }
    toolsOf.set(target, [...(toolsOf.get(target) ?? []), t]);
  }

  const out: MeshPart[] = [];
  let triangles = 0;
  let vertices = 0;
  const push = (part: MeshPart): void => {
    if (triangles + triangleCount(part) > MODEL_MAX_SCENE_TRIANGLES) {
      if (!issues.some((issue) => issue.path === 'parts' && issue.message.startsWith('Triangle limit'))) {
        issues.push({ path: 'parts', message: `Triangle limit reached (${MODEL_MAX_SCENE_TRIANGLES}) — later parts were left out.` });
      }
      return;
    }
    triangles += triangleCount(part);
    vertices += part.positions.length / 3;
    out.push(part);
  };
  const worldMesh = (draw: Draw): RawMesh | null => {
    const mesh = local(draw.geometry);
    return mesh ? transformMesh(mesh, draw.world) : null;
  };

  for (const draw of draws) {
    const mine = toolsOf.get(draw.owner);
    let mesh = worldMesh(draw);
    if (!mesh || mesh.indices.length === 0) continue;
    if (mine && draw.owner === draw.geometry && draw.part.shape !== 'asset') {
      let soup: Soup = soupOf(mesh);
      for (const t of mine) {
        const tool = parts[t]!;
        if (hiddenEffective[t]) continue;
        const toolMesh = worldMesh({ part: tool, world: worlds[t]!, owner: t, geometry: t });
        if (!toolMesh) continue;
        if (triangleCount(soup) + triangleCount(toolMesh) > CSG_MAX_TRIANGLES) {
          issues.push({ path: `parts[${t}]`, message: `${tool.op} skipped: too many triangles for a boolean (limit ${CSG_MAX_TRIANGLES}) — lower "segments".` });
          continue;
        }
        const result = csg(tool.op!, soup, soupOf(toolMesh));
        if (result.ok) soup = result.soup;
        else issues.push({ path: `parts[${t}]`, message: `${tool.op} failed: ${result.reason}` });
      }
      mesh = dropDegenerate(smoothNormals(soup, draw.part.smoothAngle ?? BOOLEAN_ANGLE));
    }
    // An imported mesh is as dense as it was made; the per-part cap guards modifier stacks, not files.
    const imported = draw.part.shape === 'asset' ? localPart(draw.geometry) : null;
    if (!imported && triangleCount(mesh) > MODEL_MAX_PART_TRIANGLES) {
      issues.push({ path: `parts[${draw.owner}]`, message: `Part has ${triangleCount(mesh)} triangles; the limit is ${MODEL_MAX_PART_TRIANGLES}.` });
    }
    push({
      name: draw.owner === draw.geometry ? draw.part.name : parts[draw.owner]!.name,
      color: hexColor(draw.part.color),
      material: resolveMaterial(draw.part.material),
      positions: mesh.positions,
      normals: mesh.normals,
      indices: mesh.indices,
      sourceIndex: draw.owner,
      role: 'solid',
      ...(imported ? { imported: true } : {}),
      // `transformMesh` keeps vertex order, so the file's uvs still line up.
      ...(imported?.uvs ? { uvs: imported.uvs } : {}),
      ...(imported?.texture ? { texture: imported.texture } : {}),
    });
  }

  if (options.operands) {
    for (const t of tools) {
      if (hiddenEffective[t]) continue;
      const mesh = worldMesh({ part: parts[t]!, world: worlds[t]!, owner: t, geometry: t });
      if (!mesh) continue;
      push({
        name: parts[t]!.name,
        color: hexColor(parts[t]!.color),
        material: resolveMaterial(parts[t]!.material),
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
        sourceIndex: t,
        role: 'operand',
      });
    }
  }
  return { parts: out, issues, stats: { triangles, vertices } };
}

/** The meshes of a design, world space — the call writers and previews make. */
export const buildScene = (spec: ModelSpec, options: BuildOptions = {}): MeshPart[] => buildSceneChecked(spec, options).parts;

/** World-space bounds of a scene, for the sidecar and the camera framing tests. */
export function sceneBounds(parts: readonly MeshPart[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const box = bounds(part.positions);
    for (let axis = 0; axis < 3; axis += 1) {
      if (box.min[axis]! < min[axis]!) min[axis] = box.min[axis]!;
      if (box.max[axis]! > max[axis]!) max[axis] = box.max[axis]!;
    }
  }
  return { min, max };
}

/** Triangle / vertex counts for the editor's stats readout. */
export function sceneStats(parts: readonly MeshPart[]): { triangles: number; vertices: number; parts: number } {
  return {
    triangles: parts.reduce((sum, p) => sum + p.indices.length / 3, 0),
    vertices: parts.reduce((sum, p) => sum + p.positions.length / 3, 0),
    parts: parts.length,
  };
}

