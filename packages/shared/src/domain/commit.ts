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

/** How an edge leaves a commit row on its way to a parent. */
export const GraphEdgeTypeSchema = z.enum([
  /** Continues straight down the same lane. */
  'straight',
  /** The parent lives in a lane to the left/right — the edge slants across. */
  'merge',
  /** A lane ends here (this commit's parent is already drawn in another lane). */
  'branch',
]);
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
