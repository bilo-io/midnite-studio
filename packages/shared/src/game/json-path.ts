/**
 * A restricted JSON path for play-test assertions (Phase 107 Theme O): `$`,
 * then any run of `.key`, `["key"]` and `[n]`. No filters, no wildcards, no
 * recursive descent and nothing evaluated — the value it reads is a game's
 * `getState()`, which is untrusted.
 */

export type JsonPathSegment = string | number;
export type JsonPathParse = { ok: true; segments: JsonPathSegment[] } | { ok: false; message: string };

const KEY = /^[A-Za-z_$][\w$-]*/;

/** Parse `$.player.position[0]` into `['player', 'position', 0]`. Never throws. */
export function parseJsonPath(path: string): JsonPathParse {
  if (typeof path !== 'string' || !path.startsWith('$')) return { ok: false, message: 'A path starts with `$`.' };
  if (path.length > 256) return { ok: false, message: 'That path is longer than 256 characters.' };
  const segments: JsonPathSegment[] = [];
  let i = 1;
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      const match = KEY.exec(path.slice(i + 1));
      if (!match) return { ok: false, message: `Expected a key after \`.\` at ${i}.` };
      segments.push(match[0]);
      i += 1 + match[0].length;
    } else if (ch === '[') {
      const close = path.indexOf(']', i);
      if (close < 0) return { ok: false, message: `Unclosed \`[\` at ${i}.` };
      const inner = path.slice(i + 1, close);
      if (/^\d+$/.test(inner)) segments.push(Number(inner));
      else if (/^"[^"\\]*"$/.test(inner) || /^'[^'\\]*'$/.test(inner)) segments.push(inner.slice(1, -1));
      else return { ok: false, message: `\`[${inner}]\` is not an index or a quoted key — filters and wildcards are not supported.` };
      i = close + 1;
    } else {
      return { ok: false, message: `Unexpected \`${ch}\` at ${i}.` };
    }
  }
  return { ok: true, segments };
}

export type JsonPathRead = { found: true; value: unknown } | { found: false };

/** Read a parsed path from a JSON value. Own properties only — never the prototype chain. */
export function readJsonPath(value: unknown, segments: readonly JsonPathSegment[]): JsonPathRead {
  let current: unknown = value;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false };
      current = current[segment];
    } else {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) return { found: false };
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return { found: true, value: current };
}

export const JSON_PATH_OPS = ['eq', 'ne', 'lt', 'gt', 'exists', 'approx'] as const;
export type JsonPathOp = (typeof JSON_PATH_OPS)[number];

export type StateAssertion = { path: string; op: JsonPathOp; value?: unknown; epsilon?: number };
export type StateAssertionResult = { ok: boolean; actual?: unknown; message: string };

/** Structural equality over JSON values (key order does not matter). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((item, i) => jsonEqual(item, bb[i]));
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const show = (value: unknown): string => {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
};

/** Evaluate one assertion against a state. Never throws. */
export function evaluateStateAssertion(state: unknown, assertion: StateAssertion): StateAssertionResult {
  const parsed = parseJsonPath(assertion.path);
  if (!parsed.ok) return { ok: false, message: `${assertion.path}: ${parsed.message}` };
  const read = readJsonPath(state, parsed.segments);
  const { op, path } = assertion;
  if (op === 'exists') {
    return read.found ? { ok: true, actual: read.value, message: `${path} exists` } : { ok: false, message: `${path} does not exist` };
  }
  if (!read.found) return { ok: false, message: `${path} does not exist` };
  const actual = read.value;
  const expected = assertion.value;
  const fail = (rule: string): StateAssertionResult => ({ ok: false, actual, message: `${path} is ${show(actual)}, expected ${rule}` });
  const pass = (rule: string): StateAssertionResult => ({ ok: true, actual, message: `${path} ${rule}` });
  switch (op) {
    case 'eq':
      return jsonEqual(actual, expected) ? pass(`= ${show(expected)}`) : fail(`= ${show(expected)}`);
    case 'ne':
      return jsonEqual(actual, expected) ? fail(`≠ ${show(expected)}`) : pass(`≠ ${show(expected)}`);
    case 'lt':
    case 'gt': {
      if (typeof actual !== 'number' || typeof expected !== 'number') return fail(`a number ${op === 'lt' ? '<' : '>'} ${show(expected)}`);
      const holds = op === 'lt' ? actual < expected : actual > expected;
      const rule = `${op === 'lt' ? '<' : '>'} ${expected}`;
      return holds ? { ...pass(rule), message: `${path} = ${actual} ${rule}` } : fail(rule);
    }
    case 'approx': {
      const epsilon = assertion.epsilon ?? 1e-6;
      if (typeof actual !== 'number' || typeof expected !== 'number') return fail(`≈ ${show(expected)}`);
      const rule = `≈ ${expected} ± ${epsilon}`;
      return Math.abs(actual - expected) <= epsilon ? { ...pass(rule), message: `${path} = ${actual} ${rule}` } : fail(rule);
    }
  }
}
