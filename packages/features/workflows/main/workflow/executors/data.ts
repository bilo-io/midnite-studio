import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate, walk } from '../interpolate';
import { parseStateValue } from '../workflow-state';

/**
 * The data kinds that shape values without touching anything outside the
 * run: `set-fields`, `json-extract` and `coalesce`. Each resolves its inputs
 * through `interpolate.ts`, so a missing reference is the same named failure
 * it is everywhere else, and none evaluates JavaScript.
 */

/** An object built from literal (interpolated, best-effort-JSON) values — `state`'s value rule, without persisting anything. */
export const setFieldsExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'set-fields') return { ok: false, error: 'Not a set-fields node.' };
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(node.config.fields)) {
    const resolved = interpolate(raw, context.upstream);
    if (!resolved.ok) return resolved;
    output[key] = parseStateValue(resolved.value);
  }
  return { ok: true, output };
};

/** Parse text as JSON, then walk one dotted path — the same walk `{{...}}` uses. */
export const jsonExtractExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'json-extract') return { ok: false, error: 'Not a json-extract node.' };
  const source = interpolate(node.config.source, context.upstream);
  if (!source.ok) return source;

  let document: unknown;
  try {
    document = JSON.parse(source.value);
  } catch {
    return { ok: false, error: 'The source is not valid JSON.' };
  }

  const path = node.config.path.trim();
  const segments = path === '' ? [] : path.split('.');
  const found = walk(document, segments);
  if (!found.found || found.value === undefined) {
    if (node.config.required) return { ok: false, error: `The JSON has no "${path}".` };
    return { ok: true, output: { value: null, found: false } };
  }
  return { ok: true, output: { value: found.value, found: true } };
};

/**
 * The first candidate that resolves and is non-empty. A reference to a
 * branch that never ran fails to interpolate (only taken edges' outputs are
 * upstream), which here simply means "try the next one".
 */
export const coalesceExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'coalesce') return { ok: false, error: 'Not a coalesce node.' };
  const misses: string[] = [];
  for (const [index, candidate] of node.config.candidates.entries()) {
    const resolved = interpolate(candidate, context.upstream);
    if (resolved.ok && resolved.value.trim() !== '') {
      return { ok: true, output: { value: parseStateValue(resolved.value), index } };
    }
    misses.push(resolved.ok ? `#${index + 1} was empty` : `#${index + 1}: ${resolved.error}`);
  }
  if (node.config.fallback !== undefined) {
    const fallback = interpolate(node.config.fallback, context.upstream);
    if (!fallback.ok) return fallback;
    return { ok: true, output: { value: parseStateValue(fallback.value), index: -1 } };
  }
  return { ok: false, error: `No candidate had a value (${misses.join('; ') || 'none configured'}).` };
};
