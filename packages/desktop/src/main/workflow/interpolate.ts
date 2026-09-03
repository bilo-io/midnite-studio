/**
 * `{{nodeId.dotted.path}}` substitution — the whole expression language a
 * workflow gets, written down once and tested without the engine.
 *
 * **Deliberately not Turing-complete.** No function calls, no arithmetic, no
 * filters, no nested braces, no conditionals. The grammar is:
 *
 *     {{ <nodeId> . <dotted.path> }}
 *
 * The path is split on `.` and walked with plain property access; a numeric
 * segment indexes an array (`items.0.id`). `{{{{` is a literal `{{`, which is
 * the one escape and what makes a JSON body containing braces expressible.
 *
 * **An unresolved reference is a failure, not an empty string.** Silent empty
 * substitution is how an `http` node quietly POSTs `undefined` into a real API
 * and nobody notices for a week.
 *
 * Pure and engine-free by design: this is string arithmetic, and string
 * arithmetic that can be wrong should be testable without spawning anything.
 */

export type InterpolateResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Matches either the `{{{{` escape or one reference. Ordered so the escape wins
 * — otherwise `{{{{a.b}}` would be read as a reference to a node named `{{a`.
 */
const TOKEN = /\{\{\{\{|\{\{([^{}]*)\}\}/g;

function walk(root: unknown, segments: string[]): { found: true; value: unknown } | { found: false } {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return { found: false };
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return { found: false };
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return { found: false };
    current = record[segment];
  }
  return { found: true, value: current };
}

/**
 * How a resolved value becomes text.
 *
 * A string substitutes as itself — quoting it would break every `"{{a.b}}"`
 * already inside a JSON body. Everything else is `JSON.stringify`'d, so an
 * object or array interpolated into a body is valid JSON rather than
 * `[object Object]`.
 */
function render(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return JSON.stringify(value) ?? '';
}

export function interpolate(
  template: string,
  upstream: Record<string, unknown>,
): InterpolateResult {
  let error: string | null = null;

  const value = template.replace(TOKEN, (match, reference?: string) => {
    if (reference === undefined) return '{{'; // the `{{{{` escape
    if (error !== null) return match;

    const path = reference.trim();
    if (path === '') {
      error = 'Cannot resolve {{}} — a reference needs a node id.';
      return match;
    }

    const [nodeId, ...segments] = path.split('.');
    if (nodeId === undefined || nodeId === '') {
      error = `Cannot resolve {{${path}}} — a reference needs a node id.`;
      return match;
    }
    if (!(nodeId in upstream)) {
      error = `Cannot resolve {{${path}}} — node "${nodeId}" is not upstream of this one.`;
      return match;
    }

    const found = walk(upstream[nodeId], segments);
    if (!found.found || found.value === undefined) {
      error =
        segments.length === 0
          ? `Cannot resolve {{${path}}} — node "${nodeId}" produced no output.`
          : `Cannot resolve {{${path}}} — node "${nodeId}" has no field "${segments.join('.')}".`;
      return match;
    }

    return render(found.value);
  });

  return error === null ? { ok: true, value } : { ok: false, error };
}

/**
 * Interpolate every value of a `Record<string, string>` — headers and query
 * params — failing on the first that cannot resolve.
 */
export function interpolateRecord(
  record: Record<string, string>,
  upstream: Record<string, unknown>,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const result = interpolate(raw, upstream);
    if (!result.ok) return result;
    out[key] = result.value;
  }
  return { ok: true, value: out };
}
