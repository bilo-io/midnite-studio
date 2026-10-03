import { ModelSpecSchema, type ModelSpec } from '@midnite/studio-shared';
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
  prism: 'box',
  ball: 'sphere',
  orb: 'sphere',
  ellipsoid: 'sphere',
  tube: 'cylinder',
  pipe: 'cylinder',
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

function normalizePart(part: unknown): unknown {
  if (!isRecord(part)) return part;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(part)) out[KEY_ALIASES[key] ?? key] = value;
  if (typeof out.shape === 'string') {
    const lower = out.shape.trim().toLowerCase();
    out.shape = SHAPE_ALIASES[lower] ?? lower;
  }
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
  for (const key of ['radius', 'radiusTop', 'radiusBottom', 'height', 'tube']) out[key] = numeric(out[key]);
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
  return parsed.success ? { ok: true, spec: parsed.data } : { ok: false, error: describeIssues(parsed.error.issues) };
}
