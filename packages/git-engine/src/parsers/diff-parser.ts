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

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function parseUnifiedDiff(patch: string, opts: ParseDiffOptions): FileDiff {
  const maxLines = opts.maxLines ?? DIFF_LINE_CAP;
  const lines = patch.length === 0 ? [] : patch.split('\n');

  const result: FileDiff = {
    path: opts.fallbackPath,
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    hunks: [],
    insertions: 0,
    deletions: 0,
    contextLines: opts.contextLines,
    truncated: false,
    droppedLines: 0,
  };

  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let bodyLines = 0;
  // Set when a rename header named the pre-image; `--- a/...` would otherwise
  // overwrite it with the same value and a `deleted` classification.
  let sawRenameHeader = false;
  // Whether any header actually named the post-image path. Tracked explicitly
  // rather than comparing `result.path` to the fallback, because a `rename to`
  // header legitimately sets it to the very path the caller asked for.
  let sawNewPath = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    // --- headers, which only appear before the first hunk -------------------
    if (hunk === null || !line.startsWith(' ')) {
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
      const oldStart = Number(header[1]);
      const newStart = Number(header[3]);
      hunk = {
        oldStart,
        // git omits the count when it is 1 — `@@ -5 +5 @@` means one line each.
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        heading: header[5] ?? '',
        lines: [],
      };
      oldNo = oldStart;
      newNo = newStart;
      continue;
    }

    if (!hunk) continue;

    // A trailing empty element from the final `\n` is not a context line.
    if (line === '' && i === lines.length - 1) continue;

    if (line.startsWith('\\')) {
      // "\ No newline at end of file" annotates the line just emitted.
      const last = hunk.lines[hunk.lines.length - 1];
      if (last) last.noNewline = true;
      continue;
    }

    if (bodyLines >= maxLines) {
      result.truncated = true;
      result.droppedLines += 1;
      continue;
    }

    const marker = line[0];
    const text = line.slice(1);

    if (marker === '+') {
      hunk.lines.push({ kind: 'add', oldNo: null, newNo, text, ranges: [], noNewline: false });
      newNo += 1;
      result.insertions += 1;
    } else if (marker === '-') {
      hunk.lines.push({ kind: 'del', oldNo, newNo: null, text, ranges: [], noNewline: false });
      oldNo += 1;
      result.deletions += 1;
    } else if (marker === ' ' || marker === undefined) {
      // `marker === undefined` is a genuinely empty context line: git writes a
      // lone space, but some tools trim trailing whitespace off the patch.
      hunk.lines.push({ kind: 'ctx', oldNo, newNo, text, ranges: [], noNewline: false });
      oldNo += 1;
      newNo += 1;
    } else {
      // Anything else this deep is not diff body — skip rather than mis-count.
      continue;
    }
    bodyLines += 1;
  }

  if (hunk) result.hunks.push(hunk);
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

/** Total body lines across every hunk — what the renderer virtualises over. */
export function countDiffLines(diff: FileDiff): number {
  return diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
}

/** Human-facing summary for a diff with no hunks to show. */
export function describeEmptyDiff(diff: FileDiff): string | null {
  if (diff.binary) return 'Binary file — no textual diff.';
  if (diff.hunks.length > 0) return null;
  if (diff.oldMode && diff.newMode && diff.oldMode !== diff.newMode) {
    return `Mode changed from ${diff.oldMode} to ${diff.newMode}.`;
  }
  if (diff.change === 'renamed') return `Renamed from ${diff.oldPath ?? '?'} with no content change.`;
  if (diff.change === 'copied') return `Copied from ${diff.oldPath ?? '?'} with no content change.`;
  return 'No changes to show for this file.';
}

export type { FileChangeKind };
