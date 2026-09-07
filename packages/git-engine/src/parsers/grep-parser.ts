export type GrepMatch = {
  /** Repo-relative path, as git reports it (already `-z`-safe, no quoting). */
  path: string;
  /** 1-based line number, matching every other line-number surface in the app. */
  line: number;
  /** Kind of hit: match or context. */
  kind: 'match' | 'context';
  /** The matched line's full text, no trailing newline. */
  text: string;
};

/** Re-derives whether a parsed line is a genuine hit — see `parseGrep`'s doc comment. */
export type GrepTextMatcher = (text: string) => boolean;

/**
 * Parse `git grep -z -n -I --no-color` output.
 *
 * `-z` only NUL-separates the fields *within* a match (path, then line number)
 * — the record itself still ends in `\n`, because the matched text is exactly
 * one source line and a real embedded newline in that text is not something
 * `-z` needs to protect against here (unlike `git log`, where every field,
 * including the last, is NUL-terminated). So this reads line by line and
 * splits each on its two NULs, rather than reusing `chunkNulRecords`.
 *
 * `-z` gives a matched line (`path:line:text`) and a `-C` context line
 * (`path-line-text`) the exact same bytes: `path\0line\0text`. Confirmed
 * against real git (2.39.5) — it replaces *both* separator occurrences in a
 * record with NUL, not only the one right after the path, so the `:` vs `-`
 * that would normally mark a line as matched or context never reaches this
 * parser. There is no signal left in `payload` to recover it from.
 *
 * So `kind` is re-derived, not parsed: when the caller passes `isMatch`, each
 * record's `text` is tested against it, same approximation
 * `search-panel.tsx`'s `highlightedText` makes for the identical problem —
 * cheap, case/whole-word-aware, and skipped (every line reports as `'match'`)
 * for `regex` mode, where "the query" is not literal text to re-test against.
 * Omitted, every record reports `kind: 'match'`, which is correct whenever
 * context was never requested (`-C` omitted) in the first place — the only
 * way `readGrep`/`streamGrep` call this today.
 */
export function parseGrep(payload: string, isMatch?: GrepTextMatcher): GrepMatch[] {
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
    let text = record.slice(secondNul + 1);
    if (text.endsWith('\r')) {
      text = text.slice(0, -1);
    }
    if (!Number.isFinite(line)) continue;
    const kind: GrepMatch['kind'] = isMatch === undefined || isMatch(text) ? 'match' : 'context';
    matches.push({ path, line, kind, text });
  }
  return matches;
}

