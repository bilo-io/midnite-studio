import { z } from 'zod';

export const CommitSchema = z.object({
  sha: z.string(),
  /** Parent shas in git's order — parents[0] is the first parent. Empty for a root commit. */
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  /** Unix seconds (`%at`). */
  authorDate: z.number().int(),
  /** Unix seconds (`%ct`) — what `--topo-order`/`--date-order` sorts on. */
  committerDate: z.number().int(),
  subject: z.string(),
  /** Fully-qualified ref names decorating this commit, parsed from `%D`. */
  refs: z.array(z.string()),
});
export type Commit = z.infer<typeof CommitSchema>;

/**
 * Which part of a row's box an edge occupies.
 *
 * A row renders as one fixed-height SVG. The commit node sits at the vertical
 * centre of its lane, so every edge is either the full height, the half above
 * the node, or the half below it. Encoding that in the type (rather than making
 * the renderer infer it from lane indices) is what keeps the drawing code a
 * direct translation with no geometry guesswork:
 *
 *   straight  full height — `fromLane === toLane`, either a lane passing through
 *             this row untouched, or this commit's own lane arriving and
 *             continuing through the node.
 *   branch    UPPER half — enters at the top edge in `fromLane` and terminates at
 *             the node in `toLane`. A lane converging into this commit, or this
 *             commit's own lane when it is a root (arrives, doesn't continue).
 *   merge     LOWER half — leaves the node in `fromLane` (always the commit's own
 *             lane) and exits the bottom edge in `toLane`. An edge to a parent in
 *             another lane, or this commit's own lane when it is a branch tip
 *             (doesn't arrive, does continue).
 */
export const GraphEdgeTypeSchema = z.enum(['straight', 'merge', 'branch']);
export type GraphEdgeType = z.infer<typeof GraphEdgeTypeSchema>;

export const GraphEdgeSchema = z.object({
  fromLane: z.number().int().nonnegative(),
  toLane: z.number().int().nonnegative(),
  type: GraphEdgeTypeSchema,
  /** Index into the lane palette — see git-engine/src/layout/colors.ts. */
  colorIdx: z.number().int().nonnegative(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/**
 * One rendered row of the commit graph. Laid out in the main process (see
 * INITIAL_PLAN "Lane layout runs in main") so the renderer only draws.
 */
export const GraphRowSchema = z.object({
  /** 0-based index into the full stream — also the virtualizer's item index. */
  row: z.number().int().nonnegative(),
  commit: CommitSchema,
  /** Lane the commit's node sits in. */
  lane: z.number().int().nonnegative(),
  colorIdx: z.number().int().nonnegative(),
  /** Edges drawn in the vertical band *below* this row, down to the next one. */
  edges: z.array(GraphEdgeSchema),
  /** Total lanes occupied in this row's band — lets the renderer size the gutter. */
  laneCount: z.number().int().nonnegative(),
});
export type GraphRow = z.infer<typeof GraphRowSchema>;
