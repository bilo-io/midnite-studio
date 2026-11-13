import { z } from 'zod';

/**
 * Which parts of the commit graph a composition shows (Phase 133 Theme B).
 *
 * Every flag defaults to `true`: Studio's graph is the full one. A lighter composition (ekko-studio)
 * passes `false` for the ones it leaves out. Plain data, so the frame reads it through its host port
 * without importing any composition code.
 */
export const GraphFeaturesSchema = z.object({
  /** Shimmer, pulse and glow animations on rows, lanes and ref badges. */
  effects: z.boolean(),
  /** The Diff chart column and its numstat fetch. */
  diffChart: z.boolean(),
  /** The Diff (+/-) column and its numstat fetch. */
  diffColumns: z.boolean(),
  /** The columns dropdown in the graph header. */
  columnPicker: z.boolean(),
  /** A commit expanding to its file list inside its row. Off, it opens the side inspector instead. */
  inlineExpansion: z.boolean(),
});
export type GraphFeatures = z.infer<typeof GraphFeaturesSchema>;

export const DEFAULT_GRAPH_FEATURES: GraphFeatures = {
  effects: true,
  diffChart: true,
  diffColumns: true,
  columnPicker: true,
  inlineExpansion: true,
};

/** Fill in whatever a partial profile leaves out with the Studio default. */
export function resolveGraphFeatures(partial?: Partial<GraphFeatures>): GraphFeatures {
  return { ...DEFAULT_GRAPH_FEATURES, ...partial };
}
