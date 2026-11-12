import { z } from 'zod';

import { ELEMENTARY_MAX_WIDTH, ELEMENTARY_MIN_WIDTH, type ElementaryParams, type ElementaryState } from './elementary';
import { LIFE_MAX, LIFE_MIN, parseRule, type LifeParams, type LifeState } from './life';
import { MAX_BODIES, type NBodyParams, type NBodyState } from './nbody';

/**
 * Scenario files carry `params` and `state` as opaque JSON (Phase 127 Theme F.1); these are the per-kind
 * schemas a load checks them against. `Uint8Array`s travel as base64, so a 1024x1024 Life grid is ~1.4 MB.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const num = z.number().finite();

const LifeParamsSchema = z.object({
  width: int(LIFE_MIN, LIFE_MAX),
  height: int(LIFE_MIN, LIFE_MAX),
  rule: z.string().refine((r) => parseRule(r) !== null),
  density: z.number().min(0).max(1),
});
const ElementaryParamsSchema = z.object({
  rule: int(0, 255),
  width: int(ELEMENTARY_MIN_WIDTH, ELEMENTARY_MAX_WIDTH),
  height: int(32, 1024),
  start: z.enum(['single', 'random']),
});
const BodySchema = z.object({
  name: z.string().max(200),
  mass: num,
  x: num,
  y: num,
  z: num,
  vx: num,
  vy: num,
  vz: num,
  color: z.string().max(32),
  radius: num,
});
const NBodyParamsSchema = z.object({
  bodies: z.array(BodySchema).max(MAX_BODIES),
  G: num,
  dt: num.refine((n) => n > 0),
  softening: num.refine((n) => n >= 0),
});

const b64 = z.string().max(12 * 1024 * 1024);

export type AutomataKind = 'life' | 'elementary';
export type ScenarioKind = AutomataKind | 'nbody';

const result = <T>(r: { success: true; data: T } | { success: false }): T | null => (r.success ? r.data : null);

/** The params a scenario stored, or `null` when they do not fit this version of the sandbox. */
export function parseLifeParams(raw: unknown): LifeParams | null {
  return result(LifeParamsSchema.safeParse(raw));
}
export function parseElementaryParams(raw: unknown): ElementaryParams | null {
  return result(ElementaryParamsSchema.safeParse(raw));
}
export function parseNBodyParams(raw: unknown): NBodyParams | null {
  return result(NBodyParamsSchema.safeParse(raw));
}

export function encodeLifeState(s: LifeState): unknown {
  return { width: s.width, height: s.height, cells: bytesToBase64(s.cells), generation: s.generation };
}
export function decodeLifeState(raw: unknown, params: LifeParams): LifeState | null {
  const p = z.object({ width: int(1, LIFE_MAX), height: int(1, LIFE_MAX), cells: b64, generation: int(0, Number.MAX_SAFE_INTEGER) }).safeParse(raw);
  if (!p.success || p.data.width !== params.width || p.data.height !== params.height) return null;
  const cells = base64ToBytes(p.data.cells);
  return cells.length === p.data.width * p.data.height ? { width: p.data.width, height: p.data.height, cells, generation: p.data.generation } : null;
}

export function encodeElementaryState(s: ElementaryState): unknown {
  return { rows: bytesToBase64(s.rows), row: s.row, generation: s.generation };
}
export function decodeElementaryState(raw: unknown, params: ElementaryParams): ElementaryState | null {
  const p = z.object({ rows: b64, row: int(0, 1024), generation: int(0, Number.MAX_SAFE_INTEGER) }).safeParse(raw);
  if (!p.success) return null;
  const rows = base64ToBytes(p.data.rows);
  return rows.length === params.width * params.height ? { rows, row: p.data.row, generation: p.data.generation } : null;
}

export function decodeNBodyState(raw: unknown, params: NBodyParams): NBodyState | null {
  const p = z.object({ pos: z.array(num), vel: z.array(num), e0: num, tick: int(0, Number.MAX_SAFE_INTEGER) }).safeParse(raw);
  const n = 3 * params.bodies.length;
  return p.success && p.data.pos.length === n && p.data.vel.length === n ? p.data : null;
}
