/**
 * `graphify`'s `source_location` field is a bare `L<n>` (verified against
 * this repo's own `graph.json`: every value in the corpus matches). Parses
 * to a 1-based line number for `FilePreview`'s `targetLine`, or `null` for
 * anything that doesn't look like that shape — a format change upstream
 * should degrade to "no line highlighted", not a crash or a wrong line.
 */
export function parseSourceLocationLine(sourceLocation: string): number | null {
  const match = /^L(\d+)$/.exec(sourceLocation);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isFinite(line) && line > 0 ? line : null;
}
