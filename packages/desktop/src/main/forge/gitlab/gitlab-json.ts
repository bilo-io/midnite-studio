/** Defensive readers over an untyped GitLab JSON row — the same posture
 *  `gh-parse.ts`'s `asString`/`asId` take with `gh`'s own JSON: a field this
 *  app does not recognise or that arrives the wrong shape is skipped, never
 *  thrown on. */

export function row(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Like {@link asString} but empty-string is a legal answer — a body/name
 *  the forge left blank, as opposed to a field it withheld outright. */
export function asStringLoose(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** GitLab's numeric ids, coerced to the string this contract stores every
 *  forge id as (the 2^53 caution `forge.ts` states for GitHub's own ids). */
export function asId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === 'string');
}
