import { z } from 'zod';

/**
 * The structured form of a combined diff's raw marker text (`<<<<<<<` /
 * `|||||||` / `=======` / `>>>>>>>`), which `readFileDiff` already returns as
 * literal, unparsed line text — see `diff-conflicts.integration.test.ts`.
 *
 * Nothing in Phase 47 past Theme A renders or acts on anything until this
 * exists: `ConflictRegion` is what a resolution action (whole-file or
 * hunk-level) targets, and `ConflictedHunk` is what the parser hands back per
 * diff hunk.
 */

/** One conflicted region: both sides' lines, and the ancestor's under `diff3`. */
export const ConflictRegionSchema = z.object({
  ours: z.array(z.string()),
  theirs: z.array(z.string()),
  /** Present only when the repo's `merge.conflictStyle` is `diff3`. */
  base: z.array(z.string()).nullable(),
});
export type ConflictRegion = z.infer<typeof ConflictRegionSchema>;

/**
 * A hunk's content as an alternating sequence: unmodified lines both sides
 * agree on, and the conflicted regions between them. A hunk with no markers
 * at all parses to a single `context` segment and zero `conflict` segments —
 * not an error, since the caller (an already-resolved file queried too late,
 * or a binary path) decides what an empty result means.
 */
export const ConflictSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('context'), lines: z.array(z.string()) }),
  z.object({ kind: z.literal('conflict'), region: ConflictRegionSchema }),
]);
export type ConflictSegment = z.infer<typeof ConflictSegmentSchema>;

export const ConflictedHunkSchema = z.object({
  segments: z.array(ConflictSegmentSchema),
});
export type ConflictedHunk = z.infer<typeof ConflictedHunkSchema>;

/**
 * Which side of a conflict to accept. Maps directly onto git's own index
 * stages (`:1:` base, `:2:` ours, `:3:` theirs) — including during a rebase,
 * where git's documented behavior flips what a merge user would call "ours"
 * and "theirs" (the commit being replayed is `theirs`; the branch being
 * rebased onto is `ours`). This type does not correct for that: it names the
 * stages the way git itself does, and the caller's tests are what prove the
 * inversion rather than the type.
 */
export const ConflictSideSchema = z.enum(['ours', 'theirs', 'base']);
export type ConflictSide = z.infer<typeof ConflictSideSchema>;

/**
 * Which content a hunk-level resolution (Theme C) writes for one region.
 * No `base`: a hunk apply always replaces a region with something that
 * belongs in the final file, and the ancestor text under `diff3` is never
 * that — `ConflictSide` above is the whole-file case's own enum, not this
 * one, because `'both'` (ours-then-theirs, additive-conflict's common case)
 * has no equivalent there.
 */
export const ConflictHunkSideSchema = z.enum(['ours', 'theirs', 'both']);
export type ConflictHunkSide = z.infer<typeof ConflictHunkSideSchema>;
