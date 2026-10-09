import {
  applyPoint,
  buildSceneChecked,
  decompose,
  descendantIndices,
  identity,
  invert,
  multiply,
  parentIndices,
  parentWorldMatrix,
  resolveRef,
  indexParts,
  translation,
  worldMatrices,
  type Mat4,
  type ModelMaterial,
  type ModelModifier,
  type ModelPart,
  type ModelSpec,
  type Vec3,
} from '@midnite/studio-shared';

/**
 * Pure edits of a design for the 3D editor: hierarchy (group / ungroup / reparent), copies,
 * alignment, mirroring, booleans, modifiers and materials. Every function takes a spec and returns
 * a new one (or `null` when the edit does nothing or is refused) — the reducer turns that into one
 * undo step. Parts are addressed by index; **references between parts (`parent`, `target`,
 * `source`) are always written as ids**, so renaming never breaks them.
 */

export const tidy = (value: number): number => Math.round(value * 10000) / 10000;
export const tidyVec = (v: readonly number[]): Vec3 => [tidy(v[0]!), tidy(v[1]!), tidy(v[2]!)];

export type Result = { spec: ModelSpec; select?: number[] } | null;

// --- ids -----------------------------------------------------------------------------------

function freshId(used: ReadonlySet<string>, prefix = 'p'): string {
  let n = used.size + 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Gives every part a unique id (a missing or repeated one is replaced), and rewrites name-based refs to ids. */
export function ensureIds(spec: ModelSpec): ModelSpec {
  const used = new Set<string>();
  let changed = false;
  const parts = spec.parts.map((part) => {
    if (part.id && !used.has(part.id)) {
      used.add(part.id);
      return part;
    }
    changed = true;
    const id = freshId(used);
    used.add(id);
    return { ...part, id };
  });
  if (!changed && !parts.some((p) => p.parent || p.target || p.shape === 'instance')) return spec;
  const index = indexParts(parts);
  const toId = (ref: string | undefined): string | undefined => {
    if (ref === undefined) return undefined;
    const at = resolveRef(index, ref);
    return at === null ? ref : parts[at]!.id!;
  };
  const rewritten = parts.map((part) => {
    const next: Record<string, unknown> = { ...part };
    let touched = false;
    for (const key of ['parent', 'target', 'source'] as const) {
      const value = (part as Record<string, unknown>)[key] as string | undefined;
      const id = toId(value);
      if (value !== undefined && id !== value) {
        next[key] = id;
        touched = true;
      }
    }
    return touched ? (next as ModelPart) : part;
  });
  return { ...spec, parts: rewritten };
}

const idOf = (spec: ModelSpec, i: number): string => spec.parts[i]!.id!;

// --- matrices -------------------------------------------------------------------------------

/** The matrix a gizmo is placed at: the parent's world × T(position)·R·S — the part's world transform with its pivot offset left in. */
export function anchorWorld(spec: ModelSpec, i: number): Mat4 {
  const world = worldMatrices(spec.parts)[i]!;
  return multiply(world, translation(spec.parts[i]!.pivot ?? [0, 0, 0]));
}

export type TransformFields = { position: Vec3; rotation: Vec3; scale: Vec3 };

/** The local fields that put part `i` at anchor `anchor` (world), given its current parent. */
export function fieldsForAnchor(spec: ModelSpec, i: number, anchor: Mat4): TransformFields {
  const local = decompose(multiply(invert(parentWorldMatrix(spec.parts, i)), anchor));
  const nonZero = (n: number): number => (Math.abs(n) < 0.001 ? (n < 0 ? -0.001 : 0.001) : n);
  return { position: tidyVec(local.position), rotation: tidyVec(local.rotation), scale: tidyVec(local.scale.map(nonZero)) };
}

export function setAnchor(spec: ModelSpec, i: number, anchor: Mat4): ModelSpec {
  const fields = fieldsForAnchor(spec, i, anchor);
  return { ...spec, parts: spec.parts.map((p, k) => (k === i ? ({ ...p, ...fields } as ModelPart) : p)) };
}

/** The part's world-space anchor position. */
export const anchorPosition = (spec: ModelSpec, i: number): Vec3 => applyPoint(anchorWorld(spec, i), [0, 0, 0]);

// --- selection helpers ---------------------------------------------------------------------

/** Selected parts that have no selected ancestor — moving the parent already moves the rest. */
export function topMost(spec: ModelSpec, indices: readonly number[]): number[] {
  const set = new Set(indices);
  const parents = parentIndices(spec.parts);
  return indices.filter((i) => {
    let at = parents[i] ?? null;
    let guard = 0;
    while (at !== null && guard++ < spec.parts.length) {
      if (set.has(at)) return false;
      at = parents[at] ?? null;
    }
    return true;
  });
}

/** `indices` plus everything below them. */
export function withDescendants(spec: ModelSpec, indices: readonly number[]): number[] {
  const out = new Set<number>(indices);
  for (const i of indices) for (const d of descendantIndices(spec.parts, i)) out.add(d);
  return [...out].sort((a, b) => a - b);
}

// --- patching ----------------------------------------------------------------------------------

export type PartPatch = Record<string, unknown>;

/** Shallow-merges `patch` into a part; `undefined` / `null` removes a key. */
export function applyPatch(part: ModelPart, patch: PartPatch): ModelPart {
  const next: Record<string, unknown> = { ...part };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next as ModelPart;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function patchParts(spec: ModelSpec, indices: readonly number[], patch: PartPatch): Result {
  const set = new Set(indices);
  let changed = false;
  const parts = spec.parts.map((part, i) => {
    if (!set.has(i)) return part;
    const hit = Object.entries(patch).some(([key, value]) => !sameValue((part as Record<string, unknown>)[key] ?? undefined, value ?? undefined));
    if (!hit) return part;
    changed = true;
    return applyPatch(part, patch);
  });
  return changed ? { spec: { ...spec, parts } } : null;
}

export function patchMaterial(spec: ModelSpec, indices: readonly number[], patch: Partial<Record<keyof ModelMaterial, unknown>>): Result {
  const set = new Set(indices);
  let changed = false;
  const parts = spec.parts.map((part, i) => {
    if (!set.has(i)) return part;
    const merged: Record<string, unknown> = { ...(part.material ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null) delete merged[key];
      else merged[key] = value;
    }
    if (sameValue(merged, part.material ?? {})) return part;
    changed = true;
    return applyPatch(part, { material: Object.keys(merged).length > 0 ? merged : undefined });
  });
  return changed ? { spec: { ...spec, parts } } : null;
}

// --- hierarchy ---------------------------------------------------------------------------------

function isInSubtree(spec: ModelSpec, root: number, candidate: number): boolean {
  return candidate === root || descendantIndices(spec.parts, root).includes(candidate);
}

/** Moves part `child` under `newParent` (`null` = the root) keeping its world transform; refuses a cycle. */
export function reparent(spec: ModelSpec, child: number, newParent: number | null): Result {
  if (!spec.parts[child]) return null;
  if (newParent !== null && (!spec.parts[newParent] || isInSubtree(spec, child, newParent))) return null;
  const current = parentIndices(spec.parts)[child] ?? null;
  if (current === newParent) return null;
  const anchor = anchorWorld(spec, child);
  const moved: ModelSpec = {
    ...spec,
    parts: spec.parts.map((p, k) => (k === child ? applyPatch(p, { parent: newParent === null ? undefined : idOf(spec, newParent) }) : p)),
  };
  return { spec: setAnchor(moved, child, anchor), select: [child] };
}

/** Removes parts; their children move up to the nearest surviving ancestor (world transforms kept). Never empties a design. */
export function removeParts(spec: ModelSpec, indices: readonly number[]): Result {
  const gone = new Set(indices.filter((i) => spec.parts[i]));
  if (gone.size === 0 || gone.size >= spec.parts.length) return null;
  let next = spec;
  const parents = parentIndices(spec.parts);
  const nearestKept = (i: number): number | null => {
    let at = parents[i] ?? null;
    let guard = 0;
    while (at !== null && gone.has(at) && guard++ < spec.parts.length) at = parents[at] ?? null;
    return at;
  };
  spec.parts.forEach((_, i) => {
    if (gone.has(i)) return;
    const parent = parents[i] ?? null;
    if (parent === null || !gone.has(parent)) return;
    const result = reparent(next, i, nearestKept(i));
    if (result) next = result.spec;
  });
  return { spec: { ...next, parts: next.parts.filter((_, i) => !gone.has(i)) }, select: [] };
}

/** Wraps the selection in a new group at its centre; nothing moves visually. */
export function groupParts(spec: ModelSpec, indices: readonly number[]): Result {
  const tops = topMost(spec, indices);
  if (tops.length === 0) return null;
  const first = Math.min(...tops);
  const parents = parentIndices(spec.parts);
  const parent = parents[first] ?? null;
  const centre: Vec3 = [0, 0, 0];
  for (const i of tops) {
    const p = anchorPosition(spec, i);
    for (let k = 0; k < 3; k += 1) centre[k]! += p[k]! / tops.length;
  }
  const used = new Set(spec.parts.map((p) => p.id!));
  const id = freshId(used, 'g');
  const parentWorld = parent === null ? identity() : worldMatrices(spec.parts)[parent]!;
  const local = applyPoint(invert(parentWorld), centre);
  const group = {
    id,
    shape: 'group',
    name: 'Group',
    position: tidyVec(local),
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#b0b0b0',
    ...(parent === null ? {} : { parent: idOf(spec, parent) }),
  } as ModelPart;
  let next: ModelSpec = { ...spec, parts: [...spec.parts.slice(0, first), group, ...spec.parts.slice(first)] };
  // Everything at or after `first` shifted by one.
  const shifted = tops.map((i) => (i >= first ? i + 1 : i));
  for (const i of shifted) {
    const moved = reparent(next, i, first);
    if (moved) next = moved.spec;
  }
  return { spec: next, select: [first] };
}

/** Dissolves the selected groups: their children move to the group's parent keeping world transforms. */
export function ungroupParts(spec: ModelSpec, indices: readonly number[]): Result {
  const groups = indices.filter((i) => spec.parts[i]?.shape === 'group');
  if (groups.length === 0) return null;
  const parents = parentIndices(spec.parts);
  let next = spec;
  const selectIds: string[] = [];
  for (const g of groups) {
    const parent = parents[g] ?? null;
    const children = next.parts.map((_, k) => k).filter((k) => parentIndices(next.parts)[k] === g);
    for (const child of children) {
      const moved = reparent(next, child, parent);
      if (moved) next = moved.spec;
      selectIds.push(idOf(next, child));
    }
  }
  const removed = removeParts(
    next,
    groups.filter((g) => next.parts[g]),
  );
  if (!removed) return null;
  const select = removed.spec.parts.map((p, i) => (selectIds.includes(p.id!) ? i : -1)).filter((i) => i >= 0);
  return { spec: removed.spec, select };
}

// --- copies --------------------------------------------------------------------------------------

/** Deep copies of the subtrees under `roots`, with fresh ids and remapped parent / target / source refs. */
function cloneSubtrees(spec: ModelSpec, roots: readonly number[], usedIn: ReadonlySet<string>): { parts: ModelPart[]; rootIds: string[] } {
  const members = withDescendants(spec, roots);
  const used = new Set(usedIn);
  const map = new Map<string, string>();
  for (const i of members) {
    const id = freshId(used);
    used.add(id);
    map.set(idOf(spec, i), id);
  }
  const rootSet = new Set(roots.map((i) => idOf(spec, i)));
  const parts = members.map((i) => {
    const part = spec.parts[i]!;
    const next: Record<string, unknown> = { ...part, id: map.get(part.id!)! };
    for (const key of ['parent', 'target', 'source'] as const) {
      const ref = (part as Record<string, unknown>)[key] as string | undefined;
      if (ref !== undefined && map.has(ref) && !(key === 'parent' && rootSet.has(part.id!))) next[key] = map.get(ref);
    }
    return next as ModelPart;
  });
  return { parts, rootIds: roots.map((i) => map.get(idOf(spec, i))!) };
}

const offsetX = (part: ModelPart, dx: number): ModelPart => ({ ...part, position: tidyVec([part.position[0] + dx, part.position[1], part.position[2]]) }) as ModelPart;

export function duplicateParts(spec: ModelSpec, indices: readonly number[], offset = 0.2): Result {
  const roots = topMost(spec, indices);
  if (roots.length === 0) return null;
  const used = new Set(spec.parts.map((p) => p.id!));
  const { parts, rootIds } = cloneSubtrees(spec, roots, used);
  const renamed = parts.map((p) => (rootIds.includes(p.id!) ? offsetX({ ...p, name: `${p.name} copy`.slice(0, 60) } as ModelPart, offset) : p));
  const insertAt = Math.max(...withDescendants(spec, roots)) + 1;
  const next = { ...spec, parts: [...spec.parts.slice(0, insertAt), ...renamed, ...spec.parts.slice(insertAt)] };
  return { spec: next, select: next.parts.map((p, i) => (rootIds.includes(p.id!) ? i : -1)).filter((i) => i >= 0) };
}

/** What copy puts on the clipboard: the subtrees, their roots baked to world space so they paste anywhere. */
export function copyParts(spec: ModelSpec, indices: readonly number[]): ModelPart[] | null {
  const roots = topMost(spec, indices);
  if (roots.length === 0) return null;
  let baked = spec;
  for (const r of roots) {
    const anchor = anchorWorld(spec, r);
    baked = setAnchor({ ...baked, parts: baked.parts.map((p, k) => (k === r ? applyPatch(p, { parent: undefined }) : p)) }, r, anchor);
  }
  const { parts } = cloneSubtrees(baked, roots, new Set());
  return parts;
}

export function pasteParts(spec: ModelSpec, clip: readonly ModelPart[], times = 1): Result {
  if (clip.length === 0) return null;
  const tmp: ModelSpec = { ...spec, parts: [...clip] };
  const rootIdx = clip.map((_, i) => i).filter((i) => !clip[i]!.parent);
  const { parts, rootIds } = cloneSubtrees(tmp, rootIdx, new Set(spec.parts.map((p) => p.id!)));
  const moved = parts.map((p) => (rootIds.includes(p.id!) ? offsetX(p, 0.2 * times) : p));
  const next = { ...spec, parts: [...spec.parts, ...moved] };
  return { spec: next, select: next.parts.map((p, i) => (rootIds.includes(p.id!) ? i : -1)).filter((i) => i >= 0) };
}

// --- bounds, align, distribute, mirror ---------------------------------------------------------

export type Box = { min: Vec3; max: Vec3 };

/** World bounding box per part (a group's is the union of what it contains); `null` for parts with no geometry. */
export function partBoxes(spec: ModelSpec): (Box | null)[] {
  const built = buildSceneChecked(spec, { operands: true });
  const boxes: (Box | null)[] = spec.parts.map(() => null);
  const grow = (i: number, p: Vec3): void => {
    const b = (boxes[i] ??= { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    for (let k = 0; k < 3; k += 1) {
      if (p[k]! < b.min[k]!) b.min[k] = p[k]!;
      if (p[k]! > b.max[k]!) b.max[k] = p[k]!;
    }
  };
  for (const mesh of built.parts) {
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        lo[k] = Math.min(lo[k]!, mesh.positions[i + k]!);
        hi[k] = Math.max(hi[k]!, mesh.positions[i + k]!);
      }
    }
    grow(mesh.sourceIndex, lo);
    grow(mesh.sourceIndex, hi);
  }
  // Fold children into their groups.
  const parents = parentIndices(spec.parts);
  boxes.forEach((box, i) => {
    if (!box) return;
    let at = parents[i] ?? null;
    let guard = 0;
    while (at !== null && guard++ < spec.parts.length) {
      grow(at, box.min);
      grow(at, box.max);
      at = parents[at] ?? null;
    }
  });
  return boxes;
}

export const unionBox = (boxes: readonly (Box | null)[]): Box | null => {
  const real = boxes.filter((b): b is Box => b !== null);
  if (real.length === 0) return null;
  return {
    min: [0, 1, 2].map((k) => Math.min(...real.map((b) => b.min[k]!))) as Vec3,
    max: [0, 1, 2].map((k) => Math.max(...real.map((b) => b.max[k]!))) as Vec3,
  };
};

const AXIS = { x: 0, y: 1, z: 2 } as const;
export type Axis = keyof typeof AXIS;

function translateWorld(spec: ModelSpec, i: number, delta: Vec3): ModelSpec {
  return setAnchor(spec, i, multiply(translation(delta), anchorWorld(spec, i)));
}

export function nudgeParts(spec: ModelSpec, indices: readonly number[], delta: Vec3): Result {
  const tops = topMost(spec, indices);
  if (tops.length === 0) return null;
  let next = spec;
  for (const i of tops) next = translateWorld(next, i, delta);
  return { spec: next };
}

export type AlignMode = 'min' | 'center' | 'max';

export function alignParts(spec: ModelSpec, indices: readonly number[], axis: Axis, mode: AlignMode): Result {
  const tops = topMost(spec, indices);
  const boxes = partBoxes(spec);
  const live = tops.filter((i) => boxes[i]);
  if (live.length < 2) return null;
  const a = AXIS[axis];
  const total = unionBox(live.map((i) => boxes[i]!))!;
  const target = mode === 'min' ? total.min[a]! : mode === 'max' ? total.max[a]! : (total.min[a]! + total.max[a]!) / 2;
  let next = spec;
  for (const i of live) {
    const b = boxes[i]!;
    const own = mode === 'min' ? b.min[a]! : mode === 'max' ? b.max[a]! : (b.min[a]! + b.max[a]!) / 2;
    const delta: Vec3 = [0, 0, 0];
    delta[a] = target - own;
    if (Math.abs(delta[a]!) > 1e-9) next = translateWorld(next, i, delta);
  }
  return next === spec ? null : { spec: next };
}

export function distributeParts(spec: ModelSpec, indices: readonly number[], axis: Axis): Result {
  const tops = topMost(spec, indices);
  const boxes = partBoxes(spec);
  const live = tops.filter((i) => boxes[i]);
  if (live.length < 3) return null;
  const a = AXIS[axis];
  const sorted = [...live].sort((p, q) => boxes[p]!.min[a]! + boxes[p]!.max[a]! - (boxes[q]!.min[a]! + boxes[q]!.max[a]!));
  const first = boxes[sorted[0]!]!;
  const last = boxes[sorted[sorted.length - 1]!]!;
  const sizes = sorted.reduce((sum, i) => sum + (boxes[i]!.max[a]! - boxes[i]!.min[a]!), 0);
  const gap = (last.max[a]! - first.min[a]! - sizes) / (sorted.length - 1);
  let cursor = first.min[a]!;
  let next = spec;
  for (const i of sorted) {
    const b = boxes[i]!;
    const delta: Vec3 = [0, 0, 0];
    delta[a] = cursor - b.min[a]!;
    if (Math.abs(delta[a]!) > 1e-9) next = translateWorld(next, i, delta);
    cursor += b.max[a]! - b.min[a]! + gap;
  }
  return next === spec ? null : { spec: next };
}

/** Reflects the selection across the world plane `axis = centre`; `copy` mirrors a duplicate instead. */
export function mirrorParts(spec: ModelSpec, indices: readonly number[], axis: Axis, about: 'origin' | 'centre', copy: boolean): Result {
  let base = spec;
  let targets = topMost(spec, indices);
  let select: number[] | undefined;
  if (targets.length === 0) return null;
  let centre = 0;
  if (about === 'centre') {
    const boxes = partBoxes(spec);
    const box = unionBox(targets.map((i) => boxes[i] ?? null));
    if (box) centre = (box.min[AXIS[axis]]! + box.max[AXIS[axis]]!) / 2;
  }
  if (copy) {
    const dup = duplicateParts(spec, targets, 0);
    if (!dup) return null;
    base = dup.spec;
    targets = dup.select!;
    select = targets;
  }
  const m = identity();
  const a = AXIS[axis];
  m[a * 4 + a] = -1;
  m[a * 4 + 3] = 2 * centre;
  let next = base;
  for (const i of topMost(next, targets)) {
    const anchor = anchorWorld(next, i);
    next = setAnchor(next, i, multiply(m, anchor));
  }
  return { spec: next, ...(select ? { select } : {}) };
}

// --- booleans ---------------------------------------------------------------------------------------

/** The last selected part subtracts from the first. */
export function subtractSelection(spec: ModelSpec, indices: readonly number[]): Result {
  if (indices.length < 2) return null;
  const target = indices[0]!;
  const tool = indices[indices.length - 1]!;
  if (target === tool) return null;
  return patchParts(spec, [tool], { op: 'subtract', target: idOf(spec, target) });
}

// --- modifiers --------------------------------------------------------------------------------------

export const MODIFIER_LABELS: Record<ModelModifier['type'], string> = {
  bevel: 'Bevel',
  subdivide: 'Subdivide',
  mirror: 'Mirror',
  array: 'Array',
  radialArray: 'Radial array',
  twist: 'Twist',
  taper: 'Taper',
  bend: 'Bend',
};

export function defaultModifier(type: ModelModifier['type']): ModelModifier {
  switch (type) {
    case 'bevel':
      return { type, amount: 0.05 };
    case 'subdivide':
      return { type, levels: 1 };
    case 'mirror':
      return { type, axis: 'x', offset: 0 };
    case 'array':
      return { type, count: 3, offset: [1, 0, 0] };
    case 'radialArray':
      return { type, count: 6, axis: 'y', radius: 1 };
    case 'twist':
      return { type, angle: 45, axis: 'y' };
    case 'taper':
      return { type, amount: 0.5, axis: 'y' };
    case 'bend':
      return { type, angle: 45, axis: 'y' };
  }
}

export type ModifierEdit =
  | { kind: 'add'; modifier: ModelModifier }
  | { kind: 'remove'; at: number }
  | { kind: 'move'; at: number; to: number }
  | { kind: 'toggle'; at: number }
  | { kind: 'update'; at: number; patch: Record<string, unknown> };

export function editModifiers(spec: ModelSpec, index: number, edit: ModifierEdit): Result {
  const part = spec.parts[index];
  if (!part) return null;
  const list = [...(part.modifiers ?? [])];
  switch (edit.kind) {
    case 'add':
      if (list.length >= 12) return null;
      list.push(edit.modifier);
      break;
    case 'remove':
      if (!list[edit.at]) return null;
      list.splice(edit.at, 1);
      break;
    case 'move': {
      if (!list[edit.at] || edit.to < 0 || edit.to >= list.length || edit.to === edit.at) return null;
      const [item] = list.splice(edit.at, 1);
      list.splice(edit.to, 0, item!);
      break;
    }
    case 'toggle': {
      const item = list[edit.at];
      if (!item) return null;
      list[edit.at] = { ...item, enabled: item.enabled === false ? true : false };
      break;
    }
    case 'update': {
      const item = list[edit.at];
      if (!item) return null;
      list[edit.at] = { ...item, ...edit.patch } as ModelModifier;
      break;
    }
  }
  return patchParts(spec, [index], { modifiers: list.length > 0 ? list : undefined });
}

// --- order ------------------------------------------------------------------------------------------------

/** Moves part `from` so it sits at index `to` in the list (draw / boolean order). */
export function moveIndex(spec: ModelSpec, from: number, to: number): Result {
  if (!spec.parts[from] || to < 0 || to >= spec.parts.length || from === to) return null;
  const parts = [...spec.parts];
  const [item] = parts.splice(from, 1);
  parts.splice(to, 0, item!);
  return { spec: { ...spec, parts }, select: [to] };
}
