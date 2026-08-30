import { z } from 'zod';

/**
 * A parsed unified diff, as it crosses the IPC boundary.
 *
 * Parsing happens in main (git-engine/src/parsers/diff-parser.ts) for the same
 * reason lane layout does: the renderer may not import git-engine, and a 20k-line
 * lockfile diff is not something to tokenise on the render thread. The renderer
 * receives geometry it can paint directly.
 */

/** What a line is doing. `ctx` lines appear in both sides of the file. */
export const DiffLineKindSchema = z.enum(['add', 'del', 'ctx']);
export type DiffLineKind = z.infer<typeof DiffLineKindSchema>;

/**
 * A half-open `[start, end)` span of UTF-16 code units within a line's text,
 * marking the part that actually changed. Empty for context lines, and for
 * add/del lines the parser could not pair with a counterpart.
 */
export const IntralineRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type IntralineRange = z.infer<typeof IntralineRangeSchema>;

export const DiffLineSchema = z.object({
  kind: DiffLineKindSchema,
  /** Line number in the pre-image. Null on additions. */
  oldNo: z.number().int().positive().nullable(),
  /** Line number in the post-image. Null on deletions. */
  newNo: z.number().int().positive().nullable(),
  /** Line content with git's leading +/-/space marker already stripped. */
  text: z.string(),
  /** Word-level spans that differ from the paired line — see IntralineRangeSchema. */
  ranges: z.array(IntralineRangeSchema),
  /** git's "\ No newline at end of file" applied to this line. */
  noNewline: z.boolean(),
});
export type DiffLine = z.infer<typeof DiffLineSchema>;

export const SplitCellSchema = z.object({
  line: DiffLineSchema.nullable(),
  type: z.enum(['ctx', 'add', 'del', 'empty']),
});
export type SplitCell = z.infer<typeof SplitCellSchema>;

export const SplitDiffRowSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('hunk'),
    hunkIndex: z.number().int().nonnegative(),
    heading: z.string(),
    gap: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    kind: z.literal('split-line'),
    left: SplitCellSchema,
    right: SplitCellSchema,
  }),
]);
export type SplitDiffRow = z.infer<typeof SplitDiffRowSchema>;


export const DiffHunkSchema = z.object({
  oldStart: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  /** The function-context git prints after the `@@` markers. Often empty. */
  heading: z.string(),
  lines: z.array(DiffLineSchema),
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

/**
 * How the file itself changed. Distinct from the per-line kinds: a file can be
 * `renamed` with no hunks at all, and `modified` with only a mode change.
 */
export const FileChangeKindSchema = z.enum([
  'added',
  'deleted',
  'modified',
  'renamed',
  'copied',
  'type-changed',
]);
export type FileChangeKind = z.infer<typeof FileChangeKindSchema>;

export const FileDiffSchema = z.object({
  path: z.string(),
  /** The pre-image path — differs from `path` only on a rename or copy. */
  oldPath: z.string().nullable(),
  change: FileChangeKindSchema,
  /**
   * True when git refused to produce a textual diff. `hunks` is then empty and
   * the UI must say so rather than render an empty pane.
   */
  binary: z.boolean(),
  /** Set only when the file mode changed, as git's 6-digit octal. */
  oldMode: z.string().nullable(),
  newMode: z.string().nullable(),
  hunks: z.array(DiffHunkSchema),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /**
   * The `-U` value this diff was produced with. The renderer echoes it back,
   * incremented, to expand collapsed context — git only ever emits the context
   * it was asked for, so expansion is a refetch rather than a client-side reveal.
   */
  contextLines: z.number().int().nonnegative(),
  /**
   * True when this is a *combined* diff — git's output for an unmerged path,
   * carrying one marker column per parent.
   *
   * The UI needs to know: the old-side line numbers describe only the first
   * parent, and the content includes conflict markers rather than one side's
   * text. Rendering it as an ordinary diff would present a merge conflict as
   * though it were a finished change.
   */
  combined: z.boolean().default(false),
  /**
   * True when main stopped parsing at its line ceiling. `droppedLines` says how
   * many were left behind so the UI can offer an honest "show the rest" instead
   * of silently truncating.
   */
  truncated: z.boolean(),
  droppedLines: z.number().int().nonnegative(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

/**
 * The ceiling main applies before parsing. Chosen so a generated lockfile or a
 * vendored bundle can't stall the main process building hunk objects nobody will
 * scroll to; the renderer virtualises what it does receive.
 */
export const DIFF_LINE_CAP = 4000;

/** Context git is asked for by default — matches `git diff`'s own `-U3`. */
export const DIFF_DEFAULT_CONTEXT = 3;

/** What "expand all" asks for. Larger than any file we expect to diff. */
export const DIFF_FULL_CONTEXT = 1_000_000;
