import { WORKFLOW_STATE_MAX_BYTES, type JsonValue, type WorkflowStateOp } from '@midnite/studio-shared';

/**
 * A run's own durable per-run state (Phase 97 Theme G) — the read-modify-write
 * half of the `state` node. The interpolate-and-parse half lives in
 * `executors/state.ts`; this half is called from `workflow-engine.ts`'s
 * `settleNode`, inside the SAME run lock every other settle already holds, so
 * two `state` nodes racing in parallel (Theme B's ordinary fan-out) can never
 * interleave a read-modify-write and lose one write to the other — "writes go
 * through the engine, one at a time per run" (the phase doc's own wording).
 */

export type StateWriteResult =
  | { ok: true; state: Record<string, JsonValue>; output: { op: WorkflowStateOp; key: string; value: JsonValue } }
  | { ok: false; error: string };

/**
 * `'set'` replaces the key outright. `'merge'` shallow-merges `value` into
 * the key's current value, treating a non-object current value (or none) as
 * `{}` and a non-object `value` as `{}` too — a `merge` with a scalar value
 * is a mistake worth ignoring rather than crashing the node over. `'append'`
 * pushes `value` onto the key's current array, the identical non-array →
 * `[]` coercion.
 *
 * Capped by {@link WORKFLOW_STATE_MAX_BYTES} — the WHOLE state's
 * `JSON.stringify`d length, not a per-key limit, checked against the value
 * this write would produce. A breach fails only the writing node and leaves
 * `current` untouched: one node's bad write does not corrupt every other
 * key another node already wrote this run.
 */
export function applyStateNodeWrite(
  current: Record<string, JsonValue>,
  op: WorkflowStateOp,
  key: string,
  value: JsonValue,
): StateWriteResult {
  if (key.trim() === '') return { ok: false, error: 'This state write has no key.' };

  const isPlainObject = (v: JsonValue): v is { [k: string]: JsonValue } =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  let nextValue: JsonValue;
  if (op === 'set') {
    nextValue = value;
  } else if (op === 'merge') {
    const existing = current[key];
    const base = existing !== undefined && isPlainObject(existing) ? existing : {};
    const patch = isPlainObject(value) ? value : {};
    nextValue = { ...base, ...patch };
  } else {
    const existing = current[key];
    const base = Array.isArray(existing) ? existing : [];
    nextValue = [...base, value];
  }

  const next = { ...current, [key]: nextValue };
  const bytes = JSON.stringify(next).length;
  if (bytes > WORKFLOW_STATE_MAX_BYTES) {
    return {
      ok: false,
      error: `Writing "${key}" would push this run's state past its ${WORKFLOW_STATE_MAX_BYTES}-byte cap (would be ${bytes}).`,
    };
  }
  return { ok: true, state: next, output: { op, key, value: nextValue } };
}

/**
 * Best-effort JSON parse of an interpolated `state` value — a string that
 * parses as JSON becomes that value (`"42"` → the number `42`, `'{"a":1}'` →
 * an object); anything that does not parse is kept as the literal string, so
 * a plain word never needs to be hand-quoted to round-trip through `state`.
 */
export function parseStateValue(raw: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}
