import { ModelSpecSchema, semanticIssues, type ModelSpec } from '@midnite/studio-shared';
import type { ZodIssue } from 'zod';

/**
 * Turns an LLM reply into a validated `ModelSpec`. Models wrap JSON in prose
 * and fences, call a box a "cube", say `type` for `shape`, and name colours —
 * `extractJson` + `normalizeSpec` forgive exactly those habits, then the zod
 * schema is the only judge. Whatever it still rejects goes back to the model
 * as a short list (`describeIssues`) for one repair round.
 */

export type ParseOutcome = { ok: true; spec: ModelSpec } | { ok: false; error: string };

/** The first balanced `{…}` object in `text`, string- and escape-aware. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced ? fenced[1]! : text;
  const start = source.indexOf('{');
  if (start < 0) throw new Error('The reply contained no JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error('The JSON object in the reply was cut off before it closed.');
}

const SHAPE_ALIASES: Record<string, string> = {
  cube: 'box',
  cuboid: 'box',
  rectangle: 'box',
  block: 'box',
  ball: 'sphere',
  orb: 'sphere',
  pipe: 'tube',
  pill: 'capsule',
  roundbox: 'roundedBox',
  roundedcube: 'roundedBox',
  bevelbox: 'roundedBox',
  bevelledbox: 'roundedBox',
  ramp: 'wedge',
  slope: 'wedge',
  spline: 'tube',
  empty: 'group',
  clone: 'instance',
  copy: 'instance',
  disc: 'cylinder',
  disk: 'cylinder',
  pyramid: 'cone',
  donut: 'torus',
  ring: 'torus',
  revolve: 'lathe',
  extruded: 'extrude',
  polygon: 'extrude',
};

const KEY_ALIASES: Record<string, string> = {
  type: 'shape',
  kind: 'shape',
  pos: 'position',
  translation: 'position',
  location: 'position',
  rot: 'rotation',
  dimensions: 'size',
  colour: 'color',
  points: 'outline',
  mat: 'material',
  mods: 'modifiers',
  modifier: 'modifiers',
  operation: 'op',
  boolean: 'op',
  csg: 'op',
  parentId: 'parent',
  parent_id: 'parent',
  smooth_angle: 'smoothAngle',
  detail: 'segments',
  resolution: 'segments',
  metallic: 'metalness',
};

const COLOR_NAMES: Record<string, string> = {
  red: '#cc3333',
  green: '#33aa55',
  blue: '#3366cc',
  yellow: '#ffcc00',
  orange: '#ff8800',
  purple: '#8844cc',
  pink: '#ff77aa',
  brown: '#7a4a2a',
  black: '#222222',
  white: '#f2f2f2',
  gray: '#888888',
  grey: '#888888',
  silver: '#c0c0c0',
  gold: '#d4af37',
  cyan: '#33cccc',
  beige: '#e0cfa8',
  wood: '#8b5a2b',
  metal: '#9aa0a6',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const numeric = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
};

const BOOLEAN_ALIASES: Record<string, string> = {
  difference: 'subtract',
  cut: 'subtract',
  minus: 'subtract',
  subtraction: 'subtract',
  hole: 'subtract',
  add: 'union',
  merge: 'union',
  join: 'union',
  intersection: 'intersect',
  and: 'intersect',
};

const MODIFIER_ALIASES: Record<string, string> = {
  subdivision: 'subdivide',
  subsurf: 'subdivide',
  subdivisionsurface: 'subdivide',
  smooth: 'subdivide',
  chamfer: 'bevel',
  linear: 'array',
  lineararray: 'array',
  radial: 'radialArray',
  radialarray: 'radialArray',
  circular: 'radialArray',
  polar: 'radialArray',
  symmetry: 'mirror',
};

function normalizeModifier(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };
  if (out.type === undefined && typeof out.kind === 'string') out.type = out.kind;
  if (typeof out.type === 'string') {
    const lower = out.type.trim().toLowerCase().replace(/[\s_-]+/g, '');
    out.type = MODIFIER_ALIASES[lower] ?? (lower === 'radialarray' ? 'radialArray' : lower);
  }
  if (typeof out.axis === 'string') out.axis = out.axis.trim().toLowerCase();
  for (const key of ['amount', 'angle', 'levels', 'count', 'offset', 'radius']) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(numeric);
    else out[key] = numeric(out[key]);
  }
  // A mirror/array `offset` given as one number on an array means a step along X.
  if (out.type === 'array' && typeof out.offset === 'number') out.offset = [out.offset, 0, 0];
  if (out.type === 'bevel' && out.amount === undefined) out.amount = out.size ?? out.width ?? out.radius;
  return out;
}

/** Small models write `metalness`/`roughness`/`opacity` on the part itself; the schema keeps them under `material`. */
function foldFlatMaterial(out: Record<string, unknown>): void {
  const keys = ['metalness', 'roughness', 'emissive', 'emissiveIntensity', 'opacity'] as const;
  const flat = keys.filter((key) => out[key] !== undefined);
  if (out.alpha !== undefined && out.opacity === undefined) {
    out.opacity = out.alpha;
    flat.push('opacity');
  }
  delete out.alpha;
  if (flat.length === 0) return;
  const material: Record<string, unknown> = isRecord(out.material) ? { ...out.material } : {};
  for (const key of flat) {
    const value = out[key];
    material[key] = key === 'emissive' ? value : numeric(value);
    delete out[key];
  }
  if (typeof material.emissive === 'string') {
    const lower = material.emissive.trim().toLowerCase();
    material.emissive = COLOR_NAMES[lower] ?? (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(lower) ? `#${lower}` : material.emissive.trim());
  }
  out.material = material;
}

/** Old habits that now collide with real shapes: a `tube` with a radius and height is a cylinder, an `ellipsoid` with one radius a sphere. */
function contextualShape(out: Record<string, unknown>): void {
  if (out.shape === 'tube' && out.path === undefined) {
    out.shape = 'cylinder';
    const r = numeric(out.radius);
    if (out.radiusTop === undefined) out.radiusTop = r;
    if (out.radiusBottom === undefined) out.radiusBottom = r;
  }
  if (out.shape === 'ellipsoid' && out.radii === undefined) {
    if (Array.isArray(out.size)) out.radii = (out.size as unknown[]).map((n) => Number(n) / 2);
    else {
      out.shape = 'sphere';
    }
  }
  if (out.shape === 'prism' && out.radius === undefined && Array.isArray(out.size)) out.shape = 'box';
  if (out.shape === 'capsule' && out.height === undefined) out.height = 0;
  if (out.shape !== 'prism' && out.sides !== undefined && out.segments === undefined) {
    out.segments = out.sides;
    delete out.sides;
  }
}

function normalizePart(part: unknown): unknown {
  if (!isRecord(part)) return part;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(part)) out[KEY_ALIASES[key] ?? key] = value;
  if (typeof out.shape === 'string') {
    const lower = out.shape.trim().toLowerCase().replace(/[\s_-]+/g, '');
    out.shape = SHAPE_ALIASES[lower] ?? (lower === 'roundedbox' ? 'roundedBox' : lower);
  }
  if (typeof out.op === 'string') {
    const op = out.op.trim().toLowerCase();
    out.op = BOOLEAN_ALIASES[op] ?? op;
  }
  foldFlatMaterial(out);
  if (Array.isArray(out.modifiers)) out.modifiers = out.modifiers.map(normalizeModifier);
  contextualShape(out);
  if (typeof out.color === 'string') {
    const lower = out.color.trim().toLowerCase();
    out.color = COLOR_NAMES[lower] ?? (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(lower) ? `#${lower}` : out.color.trim());
  }
  // A single number where a vector belongs (`"scale": 2`, `"size": 1`) means a uniform one.
  for (const key of ['scale', 'size']) {
    const value = numeric(out[key]);
    if (typeof value === 'number') out[key] = [value, value, value];
  }
  for (const key of ['position', 'rotation', 'scale', 'size']) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(numeric);
  }
  for (const key of ['radius', 'radiusTop', 'radiusBottom', 'height', 'tube', 'radiusEnd', 'segments', 'smoothAngle', 'sides', 'scaleEnd', 'twist']) if (out[key] !== undefined) out[key] = numeric(out[key]);
  for (const key of ['pivot', 'radii']) if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(numeric);
  if (Array.isArray(out.path)) out.path = out.path.map((pt) => (isRecord(pt) ? [numeric(pt.x), numeric(pt.y), numeric(pt.z)] : Array.isArray(pt) ? pt.map(numeric) : pt));
  // `{x, y, z}` points are accepted for lathe/extrude coordinates.
  if (Array.isArray(out.outline)) {
    out.outline = out.outline.map((pt) => (isRecord(pt) && 'x' in pt ? [numeric(pt.x), numeric(pt.z ?? pt.y)] : pt));
  }
  if (Array.isArray(out.profile)) {
    out.profile = out.profile.map((pt) => (isRecord(pt) ? [numeric(pt.r ?? pt.radius ?? pt.x), numeric(pt.y)] : pt));
  }
  // A `cone` described by `radiusBottom` is still a cone.
  if (out.shape === 'cone' && out.radius === undefined && out.radiusBottom !== undefined) out.radius = out.radiusBottom;
  if (out.shape === 'sphere' && out.radius === undefined && Array.isArray(out.size)) out.radius = Number(out.size[0]) / 2;
  return out;
}

export function normalizeSpec(raw: unknown): unknown {
  let root = raw;
  if (Array.isArray(root)) root = { parts: root };
  if (!isRecord(root)) return root;
  const out: Record<string, unknown> = { ...root };
  if (out.parts === undefined) {
    for (const key of ['objects', 'shapes', 'primitives', 'components', 'elements', 'meshes']) {
      if (Array.isArray(out[key])) {
        out.parts = out[key];
        break;
      }
    }
  }
  if (Array.isArray(out.parts)) out.parts = out.parts.map(normalizePart);
  return out;
}

const path = (issue: ZodIssue): string => issue.path.join('.') || '(root)';

/** The first few issues as one-line bullets — short enough for a small model to act on. */
export function describeIssues(issues: readonly ZodIssue[], limit = 8): string {
  const lines = issues.slice(0, limit).map((issue) => `- ${path(issue)}: ${issue.message}`);
  if (issues.length > limit) lines.push(`- …and ${issues.length - limit} more`);
  return lines.join('\n');
}

export function parseSpec(reply: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = extractJson(reply);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const parsed = ModelSpecSchema.safeParse(normalizeSpec(raw));
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error.issues) };
  // Links between parts (parent / target / instance source) are checked here so a repair round can fix them.
  const links = semanticIssues(parsed.data);
  if (links.length > 0) return { ok: false, error: links.slice(0, 8).map((issue) => `- ${issue.path}: ${issue.message}`).join('\n') };
  return { ok: true, spec: parsed.data };
}
