/**
 * Azure DevOps has no `gh pr diff`/`GET .../diff` equivalent — its Git REST
 * API hands back a *change list* (path + change type) and, separately, raw
 * file content at a commit, never a unified patch. GitLab and Bitbucket both
 * hand this app a real unified diff to run through `parseMultiFileDiff`
 * (`gitlab-read.ts`'s `fetchMrDiff`, `bitbucket-reads.ts`'s `pullFiles`); this
 * module is what stands in for that on Azure — a small, pure line-diff that
 * synthesises the same unified-diff text those two adapters already produce,
 * so `azure-reads.ts`'s `pullFiles` can feed it through the identical parser
 * rather than a fourth `FileDiff` builder.
 *
 * **Not a general-purpose diff engine.** It is an O(n·m) LCS table, which is
 * exactly right for a changed file's worth of lines and wrong for a
 * regenerated lockfile — `MAX_DIFF_CELLS` below is the cap that turns the
 * second case into an honest "diff omitted" rather than a multi-second stall
 * on the main process.
 */

export type DiffLineOp = { type: 'equal' | 'add' | 'del'; line: string };

/** Roughly a few thousand lines on a side — big enough for any file a person
 *  reviews line-by-line, small enough that the O(n·m) table never approaches
 *  a second of work. */
const MAX_DIFF_CELLS = 4_000_000;

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  // A trailing newline should not synthesise a phantom empty final line —
  // `git diff` itself does not report one.
  const withoutTrailingNewline = content.endsWith('\n') ? content.slice(0, -1) : content;
  return withoutTrailingNewline.split('\n');
}

/**
 * The line-level edit script between two files, via a full LCS table.
 *
 * Returns `null` when the table would exceed {@link MAX_DIFF_CELLS} — the
 * caller's signal to fall back to a headers-only entry rather than pay the
 * O(n·m) cost.
 */
export function diffLines(oldLines: readonly string[], newLines: readonly string[]): DiffLineOp[] | null {
  const n = oldLines.length;
  const m = newLines.length;
  if (n * m > MAX_DIFF_CELLS) return null;

  // dp[i][j] = length of the LCS of oldLines[i..] and newLines[j..].
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = oldLines[i] === newLines[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: DiffLineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', line: oldLines[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'del', line: oldLines[i]! });
      i++;
    } else {
      ops.push({ type: 'add', line: newLines[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'del', line: oldLines[i++]! });
  while (j < m) ops.push({ type: 'add', line: newLines[j++]! });
  return ops;
}

/**
 * Groups an edit script into unified-diff hunks, merging changes that sit
 * within `2 * contextLines` of each other into one hunk — the same grouping
 * rule `git diff -U<n>` itself applies.
 */
export function buildUnifiedHunks(ops: readonly DiffLineOp[], contextLines: number): string[] {
  type Line = { op: DiffLineOp; oldNo: number; newNo: number };
  const lines: Line[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const op of ops) {
    lines.push({ op, oldNo, newNo });
    if (op.type !== 'add') oldNo++;
    if (op.type !== 'del') newNo++;
  }

  const changedIndexes = lines.reduce<number[]>((acc, l, idx) => {
    if (l.op.type !== 'equal') acc.push(idx);
    return acc;
  }, []);
  if (changedIndexes.length === 0) return [];

  // Merge change indexes into windows, expanding each by `contextLines` and
  // coalescing windows that overlap once expanded.
  const windows: Array<[number, number]> = [];
  for (const idx of changedIndexes) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(lines.length - 1, idx + contextLines);
    const last = windows[windows.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      windows.push([start, end]);
    }
  }

  return windows.map(([start, end]) => {
    const slice = lines.slice(start, end + 1);
    const oldStart = slice.find((l) => l.op.type !== 'add')?.oldNo ?? slice[0]!.oldNo;
    const newStart = slice.find((l) => l.op.type !== 'del')?.newNo ?? slice[0]!.newNo;
    const oldCount = slice.filter((l) => l.op.type !== 'add').length;
    const newCount = slice.filter((l) => l.op.type !== 'del').length;
    const body = slice.map((l) => {
      const prefix = l.op.type === 'add' ? '+' : l.op.type === 'del' ? '-' : ' ';
      return `${prefix}${l.op.line}`;
    });
    return [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body].join('\n');
  });
}

export type AzureChangeType = 'add' | 'edit' | 'delete' | 'rename';

/**
 * One file's unified-diff text — a `diff --git`/`---`/`+++` header plus
 * whatever hunks {@link buildUnifiedHunks} produces, in exactly the shape
 * `parseMultiFileDiff` (`git-engine`) already parses GitHub/GitLab/Bitbucket
 * patches with. `null` old/new content models `add`/`delete`: an added file
 * diffs against an empty old side, a deleted file against an empty new side.
 *
 * Returns `null` — no diffable text at all — when `diffLines` bailed out on
 * {@link MAX_DIFF_CELLS}; the caller counts that file as omitted rather than
 * silently dropping it from the patch with no trace.
 */
export function buildFileDiffText(
  oldPath: string,
  newPath: string,
  oldContent: string | null,
  newContent: string | null,
  changeType: AzureChangeType,
  contextLines: number,
): string | null {
  const oldLines = oldContent === null ? [] : splitLines(oldContent);
  const newLines = newContent === null ? [] : splitLines(newContent);
  const ops = diffLines(oldLines, newLines);
  if (ops === null) return null;

  const header = [
    `diff --git a/${oldPath} b/${newPath}`,
    ...(changeType === 'add' ? ['new file mode 100644'] : []),
    ...(changeType === 'delete' ? ['deleted file mode 100644'] : []),
    ...(changeType === 'rename' ? [`rename from ${oldPath}`, `rename to ${newPath}`] : []),
    `--- ${changeType === 'add' ? '/dev/null' : `a/${oldPath}`}`,
    `+++ ${changeType === 'delete' ? '/dev/null' : `b/${newPath}`}`,
  ];

  const hunks = buildUnifiedHunks(ops, contextLines);
  return [...header, ...hunks].join('\n');
}
