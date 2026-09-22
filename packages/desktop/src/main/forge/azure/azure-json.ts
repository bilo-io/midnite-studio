/** Defensive readers over an untyped Azure DevOps JSON row — the same
 *  posture `gitlab-json.ts` takes with GitLab's own JSON: a field this app
 *  does not recognise, or one that arrives the wrong shape, is skipped,
 *  never thrown on. */

export function row(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Like {@link asString} but empty-string is a legal answer. */
export function asStringLoose(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

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

/**
 * A work item's `fields` object keys every field by its reference name
 * (`System.Title`, `System.State`, …) rather than nesting it — the one shape
 * genuinely unlike GitLab/Bitbucket's row-per-resource JSON, so every reader
 * in `azure-mappers.ts` indexes into this rather than the row directly.
 */
export function fields(raw: unknown): Record<string, unknown> {
  const outer = row(raw);
  return (outer && row(outer['fields'])) ?? {};
}
