import {
  buildScene,
  MODEL_MAX_PARTS,
  ModelPartSchema,
  ModelSpecSchema,
  semanticIssues,
  type ModelPart,
  type ModelPatchOp,
  type ModelSpec,
  sceneBounds,
  type ModelToolIssue,
} from '@midnite/studio-shared';
import type { ZodIssue } from 'zod';

import { normalizeSpec } from './spec-parse';

/**
 * Edits to a design as an agent makes them through MCP (`model_set_spec`,
 * `model_patch_parts`). Pure: validate against the live shared schema, change
 * a copy, hand back either the new design or structured issues — never throw,
 * never half-apply.
 *
 * Nothing here knows a part's fields. `update` merges open fields over the old
 * part and re-validates the result with `ModelPartSchema`, so whatever the
 * schema accepts tomorrow (new kinds, material fields) patches today.
 */

export type EditOutcome = { ok: true; spec: ModelSpec } | { ok: false; errors: ModelToolIssue[] };

const issuePath = (issue: ZodIssue, prefix = ''): string => {
  const path = issue.path.join('.');
  return [prefix, path].filter(Boolean).join('.') || '(root)';
};

export const issuesFrom = (issues: readonly ZodIssue[], prefix = '', opIndex?: number): ModelToolIssue[] =>
  issues.map((issue) => ({
    ...(opIndex === undefined ? {} : { opIndex }),
    path: issuePath(issue, prefix),
    message: issue.message,
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Smallest unused `p<N>` id. */
function freshId(used: ReadonlySet<string>): string {
  let n = used.size + 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

/** Give every part a unique id — a missing or repeated one (an editor "duplicate" copies it) is replaced. */
export function ensurePartIds(spec: ModelSpec): ModelSpec {
  const used = new Set<string>();
  const parts = spec.parts.map((part) => {
    if (part.id && !used.has(part.id)) {
      used.add(part.id);
      return part;
    }
    const id = freshId(used);
    used.add(id);
    return { ...part, id };
  });
  return { ...spec, parts };
}

/** Parent / target / instance-source references must resolve — the one cross-part check the schema cannot make. */
function checkLinks(spec: ModelSpec): EditOutcome {
  const links = semanticIssues(spec);
  return links.length > 0 ? { ok: false, errors: links } : { ok: true, spec };
}

/** A whole design from an agent's open object: aliases forgiven, then the schema judges. */
export function validateDesign(raw: unknown): EditOutcome {
  if (!isRecord(raw)) return { ok: false, errors: [{ path: '(root)', message: 'The design must be a JSON object with a "parts" array.' }] };
  const parsed = ModelSpecSchema.safeParse(normalizeSpec(raw));
  if (!parsed.success) return { ok: false, errors: issuesFrom(parsed.error.issues) };
  return checkLinks(ensurePartIds(parsed.data));
}

/** Apply `ops` in order to a copy of `spec`; any failing op rejects the whole call. */
export function applyPatchOps(spec: ModelSpec, ops: readonly ModelPatchOp[]): EditOutcome {
  const errors: ModelToolIssue[] = [];
  let parts: ModelPart[] = ensurePartIds(spec).parts;
  const indexOf = (id: string): number => parts.findIndex((part) => part.id === id);
  const fail = (opIndex: number, path: string, message: string): void => void errors.push({ opIndex, path, message });

  ops.forEach((op, opIndex) => {
    if (op.op === 'remove') {
      const at = indexOf(op.id);
      if (at < 0) return fail(opIndex, 'id', `No part has id "${op.id}". Ids: ${parts.map((part) => part.id).join(', ')}`);
      parts = parts.filter((_, i) => i !== at);
      return;
    }

    if (op.op === 'update') {
      const at = indexOf(op.id);
      if (at < 0) return fail(opIndex, 'id', `No part has id "${op.id}". Ids: ${parts.map((part) => part.id).join(', ')}`);
      if (typeof op.fields.id === 'string' && op.fields.id !== op.id) return fail(opIndex, 'fields.id', 'A part id cannot be changed.');
      const merged: Record<string, unknown> = { ...parts[at]! };
      for (const [key, value] of Object.entries(op.fields)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      const next = ModelPartSchema.safeParse(
        (normalizeSpec({ parts: [merged] }) as { parts: unknown[] }).parts[0],
      );
      if (!next.success) {
        errors.push(...issuesFrom(next.error.issues, `parts[${op.id}]`, opIndex));
        return;
      }
      parts = parts.map((part, i) => (i === at ? { ...next.data, id: op.id } : part));
      return;
    }

    // add
    const next = ModelPartSchema.safeParse((normalizeSpec({ parts: [op.part] }) as { parts: unknown[] }).parts[0]);
    if (!next.success) {
      errors.push(...issuesFrom(next.error.issues, 'part', opIndex));
      return;
    }
    const used = new Set(parts.map((part) => part.id!));
    if (next.data.id && used.has(next.data.id)) return fail(opIndex, 'part.id', `Id "${next.data.id}" is already used by another part.`);
    const part = { ...next.data, id: next.data.id ?? freshId(used) };
    const at = Math.min(op.index ?? parts.length, parts.length);
    parts = [...parts.slice(0, at), part, ...parts.slice(at)];
  });

  if (errors.length > 0) return { ok: false, errors };
  if (parts.length < 1) return { ok: false, errors: [{ path: 'parts', message: 'A design needs at least one part; these ops would remove them all.' }] };
  if (parts.length > MODEL_MAX_PARTS) {
    return { ok: false, errors: [{ path: 'parts', message: `A design holds at most ${MODEL_MAX_PARTS} parts; these ops would make ${parts.length}.` }] };
  }
  return checkLinks({ ...spec, parts });
}

type Vec = [number, number, number];

/** What an edit tool reports back so the agent can sanity-check scale without a render. */
export function describeEdit(spec: ModelSpec): {
  partCount: number;
  parts: { id: string; name: string; shape: string }[];
  bounds: { min: Vec; max: Vec; size: Vec };
} {
  const { min, max } = sceneBounds(buildScene(spec));
  const round = (v: Vec): Vec => v.map((n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0)) as Vec;
  const lo = round(min);
  const hi = round(max);
  return {
    partCount: spec.parts.length,
    parts: spec.parts.map((part) => ({ id: part.id ?? '', name: part.name, shape: part.shape })),
    bounds: { min: lo, max: hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map((n) => Math.round(n * 1000) / 1000) as Vec },
  };
}
