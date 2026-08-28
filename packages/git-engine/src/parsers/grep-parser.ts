export type GrepMatch = {
  /** Repo-relative path, as git reports it (already `-z`-safe, no quoting). */
  path: string;
  /** 1-based line number, matching every other line-number surface in the app. */
  line: number;
  /** The matched line's full text, no trailing newline. */
  text: string;
};

/**
 * Parse `git grep -z -n -I --no-color` output.
 *
 * `-z` only NUL-separates the fields *within* a match (path, then line number)
 * — the record itself still ends in `\n`, because the matched text is exactly
 * one source line and a real embedded newline in that text is not something
 * `-z` needs to protect against here (unlike `git log`, where every field,
 * including the last, is NUL-terminated). So this reads line by line and
 * splits each on its two NULs, rather than reusing `chunkNulRecords`.
 */
export function parseGrep(payload: string): GrepMatch[] {
  if (payload.length === 0) return [];
  const lines = payload.split('\n');
  // A trailing `\n` after the last match leaves one empty final element.
  if (lines[lines.length - 1] === '') lines.pop();

  const matches: GrepMatch[] = [];
  for (const record of lines) {
    const firstNul = record.indexOf('\0');
    if (firstNul < 0) continue;
    const secondNul = record.indexOf('\0', firstNul + 1);
    if (secondNul < 0) continue;

    const path = record.slice(0, firstNul);
    const line = Number(record.slice(firstNul + 1, secondNul));
    const text = record.slice(secondNul + 1);
    if (!Number.isFinite(line)) continue;
    matches.push({ path, line, text });
  }
  return matches;
}
