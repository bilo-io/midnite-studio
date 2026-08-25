import {
  DIFF_LINE_CAP,
  type DiffHunk,
  type DiffLine,
  type FileChangeKind,
  type FileDiff,
  type IntralineRange,
} from '@midnite/git-shared';

/**
 * Unified-diff parser.
 *
 * Runs in main so the renderer receives geometry rather than text (see
 * shared/src/domain/diff.ts). It parses exactly one file's diff — every caller
 * passes `-- <path>`, so a multi-file patch is a bug upstream, not a case to
 * handle.
 *
 * Notably NOT whitespace-split: hunk headers are matched with an anchored
 * regex, and line content is taken as the remainder after a single marker
 * character. A line of source code that happens to read `@@ -1 +1 @@` inside a
 * string literal is context, and the leading-space marker is what proves it.
 */

export type ParseDiffOptions = {
  /** The `-U` value git was invoked with — echoed into the result. */
  contextLines: number;
  /** Stop after this many body lines. Defaults to DIFF_LINE_CAP. */
  maxLines?: number;
  /** Path to report when the patch carries no `+++ b/...` header (e.g. binary). */
  fallbackPath: string;
};

/**
 * A hunk header, ordinary or combined.
 *
 * `git diff` on an UNMERGED path emits a *combined* diff, not a two-way one:
 *
 *   diff --cc conflicted.txt
 *   @@@ -1,3 -1,3 +1,7 @@@
 *     context
 *   ++<<<<<<< HEAD
 *    +MAIN
 *
 * One extra `@` and one extra `-` range per parent, and one marker COLUMN per
 * parent on every body line. An `^@@ -`-anchored pattern never matches it, so
 * the whole section falls through as unstructured text and the pane reports
 * "no changes" for the one file the user most needs to see mid-merge.
 *
 * Captures: [1] the `@` run (its length gives the parent count), [2] the run of
 * `-<start>[,<len>]` pre-image ranges, [3] post-image start, [4] post-image
 * length, [5] the function heading.
 */
const HUNK_HEADER = /^(@{2,}) ((?:-\d+(?:,\d+)? )+)\+(\d+)(?:,(\d+))? @{2,} ?(.*)$/;

/** First pre-image range in a (possibly combined) header's range run. */
function firstOldRange(ranges: string): { start: number; lines: number } {
  const first = /^-(\d+)(?:,(\d+))?/.exec(ranges.trim());
  return {
    start: first ? Number(first[1]) : 0,
    // git omits the count when it is 1 — `@@ -5 +5 @@` means one line each.
    lines: first?.[2] === undefined ? 1 : Number(first[2]),
  };
}

/**
 * Classify a body line from its marker columns.
 *
 * A combined diff carries one column per parent. A line that any parent lacks
 * is an addition relative to that parent, and one that any parent had but the
 * result does not is a deletion — which is exactly how conflict markers and the
 * lines around them read. `null` means the line is not diff body at all.
 */
function classifyMarkers(
  line: string,
  parents: number,
): { kind: 'add' | 'del' | 'ctx'; text: string } | null {
  const markers = line.slice(0, parents);
  if (markers.length < parents) {
    // A genuinely empty context line: git writes N spaces, but some tools trim
    // trailing whitespace off the patch.
    return markers.trim() === '' ? { kind: 'ctx', text: '' } : null;
  }
  for (const marker of markers) {
    if (marker !== ' ' && marker !== '+' && marker !== '-') return null;
  }
  const text = line.slice(parents);
  if (markers.includes('-')) return { kind: 'del', text };
  if (markers.includes('+')) return { kind: 'add', text };
  return { kind: 'ctx', text };
}

export function parseUnifiedDiff(patch: string, opts: ParseDiffOptions): FileDiff {
  const sections = splitSections(patch);
  const parsed = sections.map((section) => parseSection(section, opts));

  // With a two-path pathspec (see commands/diff.ts `pathspec`), git emits ONE
  // section when `-M` pairs the rename and TWO when it doesn't. Prefer the
  // section that actually describes the file the caller asked about; a
  // concatenation of both would carry hunks and line numbers from two files
  // under one path.
  const match =
    parsed.find((d) => d.path === opts.fallbackPath) ??
    parsed.find((d) => d.oldPath === opts.fallbackPath);

  return match ?? parsed[0] ?? emptyResult(opts);
}

/**
 * Split a patch at `diff --git` boundaries.
 *
 * Text before the first boundary is its own section so that a patch body with
 * no `diff --git` header at all — which is what `git diff` emits under some
 * configs, and what most hand-written fixtures look like — still parses.
 */
function splitSections(patch: string): string[][] {
  if (patch.length === 0) return [];
  const lines = patch.split('\n');
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git ') && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current);

  return sections;
}

function emptyResult(opts: ParseDiffOptions): FileDiff {
  return {
    path: opts.fallbackPath,
    oldPath: null,
    change: 'modified',
    binary: false,
    combined: false,
    oldMode: null,
    newMode: null,
    hunks: [],
    insertions: 0,
    deletions: 0,
    contextLines: opts.contextLines,
    truncated: false,
    droppedLines: 0,
  };
}

function parseSection(lines: readonly string[], opts: ParseDiffOptions): FileDiff {
  const maxLines = opts.maxLines ?? DIFF_LINE_CAP;
  const result = emptyResult(opts);

  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let bodyLines = 0;
  /** False once a body line has been dropped — the `\ No newline` marker that
   *  follows it must not be pinned onto some earlier, unrelated line. */
  let lastLineKept = false;
  // Marker columns on a body line — one per parent. 1 for an ordinary diff,
  // 2+ for the combined diff git emits for an unmerged path.
  let parents = 1;
  let combined = false;
  // Set when a rename header named the pre-image; `--- a/...` would otherwise
  // overwrite it with the same value and a `deleted` classification.
  let sawRenameHeader = false;
  // Whether any header actually named the post-image path. Tracked explicitly
  // rather than comparing `result.path` to the fallback, because a `rename to`
  // header legitimately sets it to the very path the caller asked for.
  let sawNewPath = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    /**
     * Headers are only headers BEFORE the first hunk of a section.
     *
     * Inside a hunk body every line begins with `+`, `-`, ` ` or `\`, and the
     * marker is the only thing that distinguishes content from structure. A
     * deleted SQL/Lua/Haskell comment reads `--- pick the newest row` in the
     * patch and a deleted email signature delimiter reads `--- `; matching
     * those as `--- a/path` headers silently drops the line from the diff,
     * under-counts the deletion, clobbers `oldPath`, and shifts every
     * subsequent old-side line number by one.
     */
    if (hunk === null) {
      if (line.startsWith('diff --git ')) continue;
      if (line.startsWith('index ')) continue;

      if (line.startsWith('old mode ')) {
        result.oldMode = line.slice('old mode '.length).trim();
        continue;
      }
      if (line.startsWith('new mode ')) {
        result.newMode = line.slice('new mode '.length).trim();
        continue;
      }
      if (line.startsWith('new file mode ')) {
        result.change = 'added';
        result.newMode = line.slice('new file mode '.length).trim();
        continue;
      }
      if (line.startsWith('deleted file mode ')) {
        result.change = 'deleted';
        result.oldMode = line.slice('deleted file mode '.length).trim();
        continue;
      }
      if (line.startsWith('rename from ')) {
        result.change = 'renamed';
        result.oldPath = line.slice('rename from '.length);
        sawRenameHeader = true;
        continue;
      }
      if (line.startsWith('rename to ')) {
        result.path = line.slice('rename to '.length);
        sawNewPath = true;
        continue;
      }
      if (line.startsWith('copy from ')) {
        result.change = 'copied';
        result.oldPath = line.slice('copy from '.length);
        sawRenameHeader = true;
        continue;
      }
      if (line.startsWith('copy to ')) {
        result.path = line.slice('copy to '.length);
        sawNewPath = true;
        continue;
      }
      // "Binary files a/x and b/x differ", and the --binary variant.
      if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
        result.binary = true;
        continue;
      }
      if (line.startsWith('--- ')) {
        if (!sawRenameHeader) result.oldPath = stripPathPrefix(line.slice(4));
        continue;
      }
      if (line.startsWith('+++ ')) {
        const path = stripPathPrefix(line.slice(4));
        if (path !== null) {
          result.path = path;
          sawNewPath = true;
        }
        continue;
      }
    }

    const header = HUNK_HEADER.exec(line);
    if (header) {
      if (hunk) result.hunks.push(hunk);
      // `@@` is two-way (one parent); each extra `@` is another parent, and
      // another marker column on every body line of this hunk.
      parents = Math.max(1, (header[1] ?? '@@').length - 1);
      combined = parents > 1;
      const old = firstOldRange(header[2] ?? '');
      const newStart = Number(header[3]);
      hunk = {
        oldStart: old.start,
        oldLines: old.lines,
        newStart,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        heading: header[5] ?? '',
        lines: [],
      };
      oldNo = old.start;
      newNo = newStart;
      lastLineKept = false;
      continue;
    }

    if (!hunk) continue;

    // A trailing empty element from the final `\n` is not a context line.
    if (line === '' && i === lines.length - 1) continue;

    // In a combined diff the marker columns come first, so the annotation is
    // indented by one column per parent.
    if (line.trimStart().startsWith('\\')) {
      // "\ No newline at end of file" annotates the line just emitted — but
      // only if that line actually made it into the output.
      if (lastLineKept) {
        const last = hunk.lines[hunk.lines.length - 1];
        if (last) last.noNewline = true;
      }
      continue;
    }

    const classified = classifyMarkers(line, parents);
    // Anything that is not diff body this deep is skipped rather than
    // mis-counted.
    if (classified === null) continue;
    const { kind, text } = classified;

    /**
     * Stat counters are incremented for EVERY body line, including the ones
     * past the cap. The header reads "+4000 / −0" over a truncated diff, and a
     * count that silently shrank to what happened to fit would contradict the
     * "N more lines not shown" notice sitting directly beneath it.
     */
    if (kind === 'add') result.insertions += 1;
    else if (kind === 'del') result.deletions += 1;

    if (bodyLines >= maxLines) {
      result.truncated = true;
      result.droppedLines += 1;
      lastLineKept = false;
      // Line numbers still have to advance, or a later "show the rest" would
      // renumber the tail of the file.
      if (kind === 'add') newNo += 1;
      else if (kind === 'del') oldNo += 1;
      else {
        oldNo += 1;
        newNo += 1;
      }
      continue;
    }

    if (kind === 'add') {
      hunk.lines.push({ kind: 'add', oldNo: null, newNo, text, ranges: [], noNewline: false });
      newNo += 1;
    } else if (kind === 'del') {
      hunk.lines.push({ kind: 'del', oldNo, newNo: null, text, ranges: [], noNewline: false });
      oldNo += 1;
    } else {
      hunk.lines.push({ kind: 'ctx', oldNo, newNo, text, ranges: [], noNewline: false });
      oldNo += 1;
      newNo += 1;
    }
    bodyLines += 1;
    lastLineKept = true;
  }

  // A combined diff's old-side numbers describe only the first parent, and its
  // add/del runs are never the balanced pairs the word-differ looks for.
  if (combined) result.combined = true;

  if (hunk) result.hunks.push(hunk);

  // A hunk whose every line fell past the cap has nothing to show, and an empty
  // one still renders a header row with a working "expand" control — which
  // refetches at wider context and truncates harder. Drop them.
  result.hunks = result.hunks.filter((h) => h.lines.length > 0);
  for (const h of result.hunks) annotateIntraline(h);

  // A deletion's post-image header is `+++ /dev/null`, so nothing ever set
  // `path` — but the file plainly has one, and it's the pre-image path.
  if (!sawNewPath && result.oldPath !== null) {
    result.path = result.oldPath;
  }

  return result;
}

/** `a/src/x.ts` → `src/x.ts`; `/dev/null` → null (the file didn't exist). */
function stripPathPrefix(raw: string): string | null {
  // git appends a tab and a timestamp under some diff.* configs.
  const path = (raw.split('\t')[0] ?? '').trim();
  if (path === '/dev/null' || path === '') return null;
  if (path.startsWith('a/') || path.startsWith('b/')) return path.slice(2);
  return path;
}

// --- intraline word diff ----------------------------------------------------

/**
 * Mark the words that actually changed within paired del/add lines.
 *
 * Only runs on a *balanced* run — n deletions immediately followed by n
 * additions — and pairs them positionally. An unbalanced run (3 lines became 5)
 * has no honest 1:1 correspondence, and inventing one produces highlighting
 * that actively misleads, so those lines keep empty ranges and render as a
 * whole-line change.
 */
function annotateIntraline(hunk: DiffHunk): void {
  let i = 0;
  while (i < hunk.lines.length) {
    if (hunk.lines[i]?.kind !== 'del') {
      i += 1;
      continue;
    }

    let delEnd = i;
    while (hunk.lines[delEnd]?.kind === 'del') delEnd += 1;
    let addEnd = delEnd;
    while (hunk.lines[addEnd]?.kind === 'add') addEnd += 1;

    const delCount = delEnd - i;
    const addCount = addEnd - delEnd;
    if (delCount > 0 && delCount === addCount) {
      for (let k = 0; k < delCount; k += 1) {
        const del = hunk.lines[i + k];
        const add = hunk.lines[delEnd + k];
        if (del && add) pairLines(del, add);
      }
    }

    i = addEnd > i ? addEnd : i + 1;
  }
}

/**
 * A whole-line rewrite gets no intraline marking. Below this ratio of shared
 * words the highlight would cover nearly the entire line, which reads as noise
 * on top of the row tint rather than as information.
 */
const MIN_SHARED_RATIO = 0.25;

const isWhitespace = (text: string): boolean => text.trim().length === 0;

function pairLines(del: DiffLine, add: DiffLine): void {
  if (del.text === add.text) return;

  const delTokens = tokenize(del.text);
  const addTokens = tokenize(add.text);
  const common = lcs(
    delTokens.map((t) => t.text),
    addTokens.map((t) => t.text),
  );

  // Whitespace is excluded from the ratio on both sides. Two lines that share
  // nothing but their spaces ("alpha beta gamma" → "zulu yankee xray") would
  // otherwise clear the threshold on indentation alone and get every word
  // highlighted — the exact whole-line-noise case this guard exists to catch.
  const substantive = (tokens: readonly Token[]): number =>
    tokens.reduce((n, t) => (isWhitespace(t.text) ? n : n + 1), 0);

  const longer = Math.max(substantive(delTokens), substantive(addTokens));
  if (longer === 0) return;

  const sharedWords = common.reduce(
    (n, [i]) => (isWhitespace(delTokens[i]?.text ?? '') ? n : n + 1),
    0,
  );
  if (sharedWords / longer < MIN_SHARED_RATIO) return;

  del.ranges = rangesOutsideCommon(delTokens, common, 0);
  add.ranges = rangesOutsideCommon(addTokens, common, 1);
}

type Token = { text: string; start: number; end: number };

/**
 * Split into word / whitespace / single-punctuation tokens.
 *
 * Punctuation is its own token so `foo(bar)` → `foo` `(` `bar` `)` and renaming
 * only `bar` highlights only `bar`. Runs of whitespace collapse into one token
 * so re-indentation doesn't mark every line as changed throughout.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[A-Za-z0-9_$]+|\s+|[^A-Za-z0-9_$\s]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/**
 * Longest common subsequence over token texts, returned as index pairs.
 *
 * Quadratic in the token count, which is fine for a line: the caller bails out
 * above LCS_TOKEN_CAP tokens rather than letting one minified line stall main.
 */
const LCS_TOKEN_CAP = 400;

function lcs(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  if (a.length > LCS_TOKEN_CAP || b.length > LCS_TOKEN_CAP) return [];

  // table[i][j] = LCS length of a[i:] and b[j:]
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = table[i];
      const next = table[i + 1];
      if (!row || !next) continue;
      row[j] =
        a[i] === b[j]
          ? (next[j + 1] ?? 0) + 1
          : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/**
 * Every token NOT in the common subsequence, merged into contiguous character
 * ranges. `side` picks which half of each LCS pair to read.
 */
function rangesOutsideCommon(
  tokens: readonly Token[],
  common: ReadonlyArray<[number, number]>,
  side: 0 | 1,
): IntralineRange[] {
  const shared = new Set(common.map((pair) => pair[side]));
  const ranges: IntralineRange[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || shared.has(i)) continue;
    // Whitespace between two changed tokens should be inside the highlight, but
    // whitespace on its own edge should not — it makes the span look ragged.
    const previous = ranges[ranges.length - 1];
    if (previous && previous.end === token.start) previous.end = token.end;
    else ranges.push({ start: token.start, end: token.end });
  }

  return ranges.filter((r) => r.end > r.start);
}

/**
 * Total body lines across every hunk.
 *
 * Used by the parser's own tests to assert truncation; the renderer counts its
 * own rows. `describeEmptyDiff` deliberately does NOT live here — `app` may not
 * import git-engine, so a copy in this package would be unreachable from the
 * only code that needs it (see app/src/features/diff/describe-empty.ts).
 */
export function countDiffLines(diff: FileDiff): number {
  return diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
}

export type { FileChangeKind };
