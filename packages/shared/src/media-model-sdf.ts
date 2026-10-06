import { z } from 'zod';

/**
 * Signed-distance modelling (Phase 104 Theme C): an organic form described as a tree of named
 * primitives, blended by operators and bent by modifiers — the way an LLM can say "a head is a sphere
 * smoothly joined to a neck capsule, with a nose subtracted". The kernel (`model-geometry/sdf/`) bakes a
 * tree into a watertight mesh that becomes a `sculpt` part, and the tree stays on that part so it can be
 * edited and re-baked until the first brush stroke.
 *
 * Conventions match the part kernel: metres, right-handed, **Y up**; `rotation` is Euler degrees applied
 * X → Y → Z; a node is built at its origin, scaled, rotated, then moved to `position` in its parent's
 * space. `scale` is uniform so distances stay exact. Every container — operator or modifier — holds its
 * operands in `children`; a modifier has exactly one. The tree's `nodes` are unioned (smoothly, by
 * `blend`).
 *
 * Kept free of `media-model.ts` so that file can embed the tree in its `sculpt` part without a cycle.
 */

export const SDF_MAX_NODES = 128;
export const SDF_MAX_DEPTH = 12;
export const SDF_MAX_DIMENSION = 100;
export const SDF_NAME_MAX = 60;
/** Grid resolution: grid nodes − 1 along the longest side of the shape's bounds. */
export const SDF_RESOLUTION_MIN = 16;
export const SDF_RESOLUTION_MAX = 256;
/** What a bake over MCP, and the editor's "New SDF shape", default to. */
export const SDF_RESOLUTION_DEFAULT = 96;
/** The editor's live preview while a slider is dragged. */
export const SDF_RESOLUTION_PREVIEW = 40;

const len = z.number().finite().positive().max(SDF_MAX_DIMENSION);
const nonneg = z.number().finite().min(0).max(SDF_MAX_DIMENSION);
const coord = z.number().finite().min(-SDF_MAX_DIMENSION).max(SDF_MAX_DIMENSION);
const vec3 = z.tuple([coord, coord, coord]);
const angle = z.number().finite().min(-3600).max(3600);
const color = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'must be a #rrggbb hex colour');

export const SdfNameSchema = z.string().trim().min(1).max(SDF_NAME_MAX);

const base = {
  /** Unique within the tree — what `model_sdf_patch` and the editor address it by. */
  name: SdfNameSchema,
  /** Where this node's origin sits in its parent's space (default the origin). */
  position: vec3.optional(),
  /** Euler degrees, X → Y → Z (default none). */
  rotation: vec3.optional(),
  /** Uniform scale (default 1) — uniform so the field stays a true distance. */
  scale: z.number().finite().min(0.001).max(SDF_MAX_DIMENSION).optional(),
  /** Colour of the vertex group this node's surface becomes; children inherit it. */
  color: color.optional(),
};

/** Smooth-blend radius of an operator: 0 (or absent) is a sharp seam, larger values a wider fillet. */
const blendK = z.number().finite().min(0).max(SDF_MAX_DIMENSION).optional();

export const SDF_PRIMITIVE_KINDS = ['sphere', 'ellipsoid', 'capsule', 'box', 'torus', 'cone', 'cylinder'] as const;
export const SDF_OPERATOR_KINDS = ['union', 'subtract', 'intersect'] as const;
export const SDF_MODIFIER_KINDS = ['displace', 'twist', 'bend', 'round', 'shell', 'mirror'] as const;
export type SdfPrimitiveKind = (typeof SDF_PRIMITIVE_KINDS)[number];
export type SdfOperatorKind = (typeof SDF_OPERATOR_KINDS)[number];
export type SdfModifierKind = (typeof SDF_MODIFIER_KINDS)[number];
export type SdfKind = SdfPrimitiveKind | SdfOperatorKind | SdfModifierKind;
export const SDF_KINDS: readonly SdfKind[] = [...SDF_PRIMITIVE_KINDS, ...SDF_OPERATOR_KINDS, ...SDF_MODIFIER_KINDS];

type Base = { name: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; color?: string };
type Vec3 = [number, number, number];

export type SdfPrimitive =
  | (Base & { kind: 'sphere'; radius: number })
  | (Base & { kind: 'ellipsoid'; radii: Vec3 })
  | (Base & { kind: 'capsule'; radius: number; height: number })
  | (Base & { kind: 'box'; size: Vec3; radius?: number })
  | (Base & { kind: 'torus'; radius: number; tube: number })
  | (Base & { kind: 'cone'; radius: number; height: number })
  | (Base & { kind: 'cylinder'; radius: number; height: number });
export type SdfOperator = Base & { kind: SdfOperatorKind; k?: number; children: SdfNode[] };
export type SdfModifier =
  | (Base & { kind: 'displace'; amplitude: number; frequency: number; octaves?: number; seed?: number; children: SdfNode[] })
  | (Base & { kind: 'twist'; angle: number; children: SdfNode[] })
  | (Base & { kind: 'bend'; angle: number; children: SdfNode[] })
  | (Base & { kind: 'round'; radius: number; children: SdfNode[] })
  | (Base & { kind: 'shell'; thickness: number; children: SdfNode[] })
  | (Base & { kind: 'mirror'; axis: 'x' | 'y' | 'z'; children: SdfNode[] });
export type SdfNode = SdfPrimitive | SdfOperator | SdfModifier;

const vec3Len = z.tuple([len, len, len]);
const children = z.lazy(() => z.array(SdfNodeSchema).min(1, 'an operator needs at least 1 child; remove the operator instead').max(32));
const child = z.lazy(() => z.array(SdfNodeSchema).length(1, 'a modifier wraps exactly one node'));

export const SdfNodeSchema: z.ZodType<SdfNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('sphere'), radius: len }),
    z.object({ ...base, kind: z.literal('ellipsoid'), radii: vec3Len }),
    /** A cylinder with hemispherical ends along Y: `height` is the straight middle section. */
    z.object({ ...base, kind: z.literal('capsule'), radius: len, height: nonneg }),
    /** `size` is the full extent; `radius` rounds every edge and corner (default 0). */
    z.object({ ...base, kind: z.literal('box'), size: vec3Len, radius: nonneg.optional() }),
    /** A ring round Y in the XZ plane: `radius` to the tube's centre, `tube` its thickness. */
    z.object({ ...base, kind: z.literal('torus'), radius: len, tube: len }),
    /** Base of `radius` at −height/2, apex at +height/2. */
    z.object({ ...base, kind: z.literal('cone'), radius: len, height: len }),
    /** Centred on the origin along Y. */
    z.object({ ...base, kind: z.literal('cylinder'), radius: len, height: len }),
    z.object({ ...base, kind: z.literal('union'), k: blendK, children }),
    /** The first child with every later child carved out of it. */
    z.object({ ...base, kind: z.literal('subtract'), k: blendK, children }),
    z.object({ ...base, kind: z.literal('intersect'), k: blendK, children }),
    /** Adds `amplitude` × fractal noise at `frequency` (cycles per metre) to the surface. */
    z.object({
      ...base,
      kind: z.literal('displace'),
      amplitude: z.number().finite().min(-10).max(10),
      frequency: z.number().finite().positive().max(1000),
      octaves: z.number().int().min(1).max(5).optional(),
      seed: z.number().int().min(0).max(1_000_000).optional(),
      children: child,
    }),
    /** Turns the child about Y by `angle` degrees per metre of height. */
    z.object({ ...base, kind: z.literal('twist'), angle, children: child }),
    /** Bends the child in the XY plane by `angle` degrees per metre along X. */
    z.object({ ...base, kind: z.literal('bend'), angle, children: child }),
    /** Inflates the surface by `radius`, rounding every edge. */
    z.object({ ...base, kind: z.literal('round'), radius: nonneg, children: child }),
    /** Hollows the child into a skin `thickness` thick (an onion shell). */
    z.object({ ...base, kind: z.literal('shell'), thickness: len, children: child }),
    /** Reflects the child's positive side across the plane `axis = 0`. */
    z.object({ ...base, kind: z.literal('mirror'), axis: z.enum(['x', 'y', 'z']), children: child }),
  ]),
) as z.ZodType<SdfNode>;

export const isSdfContainer = (node: SdfNode): node is SdfOperator | SdfModifier => 'children' in node;
export const isSdfModifier = (node: SdfNode): node is SdfModifier => (SDF_MODIFIER_KINDS as readonly string[]).includes(node.kind);
export const isSdfOperator = (node: SdfNode): node is SdfOperator => (SDF_OPERATOR_KINDS as readonly string[]).includes(node.kind);

/** Depth-first visit; `depth` 0 is a root node. Stops early when `visit` returns `false`. */
export function walkSdf(nodes: readonly SdfNode[], visit: (node: SdfNode, depth: number, parent: SdfNode | null) => void | false, depth = 0, parent: SdfNode | null = null): boolean {
  for (const node of nodes) {
    if (visit(node, depth, parent) === false) return false;
    if (isSdfContainer(node) && !walkSdf(node.children, visit, depth + 1, node)) return false;
  }
  return true;
}

export const SdfTreeSchema = z
  .object({
    /** The roots, unioned. */
    nodes: z.array(SdfNodeSchema).min(1).max(32),
    /** Smooth-union radius between the roots (default 0, a sharp seam). */
    blend: blendK,
  })
  .superRefine((tree, ctx) => {
    const names = new Set<string>();
    let count = 0;
    let deepest = 0;
    walkSdf(tree.nodes, (node, depth) => {
      count += 1;
      deepest = Math.max(deepest, depth);
      if (names.has(node.name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `Two nodes are named "${node.name}"; names must be unique.` });
      names.add(node.name);
    });
    if (count > SDF_MAX_NODES) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `A tree holds at most ${SDF_MAX_NODES} nodes (this one has ${count}).` });
    if (deepest >= SDF_MAX_DEPTH) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: `A tree nests at most ${SDF_MAX_DEPTH} levels deep.` });
  });
export type SdfTree = z.infer<typeof SdfTreeSchema>;

export const SdfResolutionSchema = z.number().int().min(SDF_RESOLUTION_MIN).max(SDF_RESOLUTION_MAX);

/** What a `sculpt` part keeps of the tree it was baked from — present until the first brush stroke. */
export const ModelSculptSdfSchema = z.object({
  tree: SdfTreeSchema,
  /** The resolution of the bake the part's file holds. */
  resolution: SdfResolutionSchema,
});
export type ModelSculptSdf = z.infer<typeof ModelSculptSdfSchema>;

// --- edits by name ------------------------------------------------------------------------------

export const SdfOpSchema = z.discriminatedUnion('op', [
  /** Adds `node` under the container `parent` (default: the roots), at `index` (default: last). */
  z.object({ op: z.literal('add'), node: SdfNodeSchema, parent: SdfNameSchema.optional(), index: z.number().int().min(0).optional() }),
  /** Merges `set` into the named node's own fields (not `kind` or `children`). */
  z.object({ op: z.literal('update'), name: SdfNameSchema, set: z.record(z.unknown()) }),
  /** Removes the named node and everything under it. */
  z.object({ op: z.literal('remove'), name: SdfNameSchema }),
  /** Moves the named node under `parent` (absent: the roots) at `index` (default: last). */
  z.object({ op: z.literal('move'), name: SdfNameSchema, parent: SdfNameSchema.optional(), index: z.number().int().min(0).optional() }),
  /** Wraps the named node in a new operator or modifier: `node` is that container, given without `children`. */
  z.object({ op: z.literal('wrap'), name: SdfNameSchema, node: z.object({ kind: z.enum([...SDF_OPERATOR_KINDS, ...SDF_MODIFIER_KINDS]), name: SdfNameSchema }).passthrough() }),
  /** Sets the smooth-union radius between the roots. */
  z.object({ op: z.literal('blend'), k: z.number().finite().min(0).max(SDF_MAX_DIMENSION) }),
]);
export type SdfOp = z.infer<typeof SdfOpSchema>;

export type SdfOpsResult = { ok: true; tree: SdfTree } | { ok: false; errors: { path: string; message: string }[] };

type Slot = { list: SdfNode[]; index: number };

function locate(nodes: SdfNode[], name: string): Slot | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (node.name === name) return { list: nodes, index: i };
    if (isSdfContainer(node)) {
      const found = locate(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

const contains = (node: SdfNode, name: string): boolean => node.name === name || (isSdfContainer(node) && node.children.some((c) => contains(c, name)));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Applies edits by name, in order; the result must still be a valid tree. Never mutates `input`. */
export function applySdfOps(input: SdfTree, ops: readonly SdfOp[]): SdfOpsResult {
  const tree = clone(input);
  const errors: { path: string; message: string }[] = [];
  const childList = (parent: string | undefined, path: string): SdfNode[] | null => {
    if (parent === undefined) return tree.nodes;
    const slot = locate(tree.nodes, parent);
    const node = slot ? slot.list[slot.index]! : null;
    if (!node) return errors.push({ path, message: `No node is named "${parent}".` }), null;
    if (!isSdfContainer(node)) return errors.push({ path, message: `"${parent}" is a ${node.kind}, which holds no children; wrap it in an operator first.` }), null;
    if (isSdfModifier(node) && node.children.length >= 1) return errors.push({ path, message: `"${parent}" is a ${node.kind} modifier and already wraps a node.` }), null;
    return node.children;
  };
  ops.forEach((op, i) => {
    const path = `ops.${i}`;
    switch (op.op) {
      case 'add': {
        if (locate(tree.nodes, op.node.name)) return void errors.push({ path, message: `A node is already named "${op.node.name}".` });
        const list = childList(op.parent, path);
        if (list) list.splice(Math.min(op.index ?? list.length, list.length), 0, clone(op.node));
        return;
      }
      case 'update': {
        const slot = locate(tree.nodes, op.name);
        if (!slot) return void errors.push({ path, message: `No node is named "${op.name}".` });
        const { kind: _kind, children: _children, ...set } = op.set;
        const next = { ...slot.list[slot.index]!, ...set } as SdfNode;
        for (const [key, value] of Object.entries(set)) if (value === null) delete (next as Record<string, unknown>)[key];
        if (typeof set.name === 'string' && set.name !== op.name && locate(tree.nodes, set.name)) return void errors.push({ path, message: `A node is already named "${set.name}".` });
        slot.list[slot.index] = next;
        return;
      }
      case 'remove': {
        const slot = locate(tree.nodes, op.name);
        if (!slot) return void errors.push({ path, message: `No node is named "${op.name}".` });
        slot.list.splice(slot.index, 1);
        return;
      }
      case 'move': {
        const slot = locate(tree.nodes, op.name);
        if (!slot) return void errors.push({ path, message: `No node is named "${op.name}".` });
        const node = slot.list[slot.index]!;
        if (op.parent !== undefined && contains(node, op.parent)) return void errors.push({ path, message: `"${op.name}" cannot move inside itself.` });
        slot.list.splice(slot.index, 1);
        const list = childList(op.parent, path);
        if (!list) return void slot.list.splice(slot.index, 0, node);
        list.splice(Math.min(op.index ?? list.length, list.length), 0, node);
        return;
      }
      case 'wrap': {
        const slot = locate(tree.nodes, op.name);
        if (!slot) return void errors.push({ path, message: `No node is named "${op.name}".` });
        if (op.node.name !== op.name && locate(tree.nodes, op.node.name)) return void errors.push({ path, message: `A node is already named "${op.node.name}".` });
        const { children: _children, ...fields } = op.node as Record<string, unknown>;
        slot.list[slot.index] = { ...fields, children: [slot.list[slot.index]!] } as SdfNode;
        return;
      }
      case 'blend':
        if (op.k > 0) tree.blend = op.k;
        else delete tree.blend;
        return;
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  const parsed = SdfTreeSchema.safeParse(tree);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => ({ path: ['tree', ...issue.path].join('.'), message: issue.message })) };
  return { ok: true, tree: parsed.data };
}

/** Every node name in the tree, depth first. */
export const sdfNodeNames = (tree: SdfTree): string[] => {
  const names: string[] = [];
  walkSdf(tree.nodes, (node) => void names.push(node.name));
  return names;
};

/** The node called `name`, or `null`. */
export function findSdfNode(tree: SdfTree, name: string): SdfNode | null {
  const slot = locate(tree.nodes as SdfNode[], name);
  return slot ? slot.list[slot.index]! : null;
}

/** A starting tree: one sphere — what "New SDF shape" bakes. */
export const DEFAULT_SDF_TREE: SdfTree = { nodes: [{ kind: 'sphere', name: 'body', radius: 0.5 }] };
