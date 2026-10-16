/**
 * The Knowledge view's react-query keys (Phase 113 Theme M) - declared beside the hooks that use them, in the
 * frame, so an app composing Knowledge needs no key table of its own. Studio's `services/queries.ts` spreads
 * these into its `keys` as `knowledgeStatus` / `knowledgeGraph`.
 */
export const knowledgeKeys = {
  /**
   * Theme F's cheap existence check — the rail row's own "should I grey
   * myself out" question. Deliberately NOT nested under {@link
   * knowledgeGraph}: it is answered by a `stat` (`knowledgeCheckGraph`), not
   * the `knowledgeGetGraph` read/layout, so the two must never share a key —
   * invalidating one must never imply the other was ever fetched.
   */
  knowledgeStatus: (repoId: string) => ['repos', repoId, 'knowledge', 'status'] as const,
  /**
   * The active repo's lean, laid-out graph (Phase 87 Themes A/B/D/E/F) —
   * `staleTime: Infinity` means this fires the cold layout pass at most once
   * per repo per session for the INITIAL load, which is exactly why nothing
   * calls it outside the Knowledge view itself. Deliberately NOT keyed on
   * `layoutId` (Phase 89 Theme E): a layout switch after the view is already
   * open goes through `use-knowledge-layout-switch.ts`, which writes the new
   * positions into this SAME cache entry via `setQueryData` rather than
   * fetching under a new key — the point being that switching layouts must
   * never present as this query going back to `isLoading`, which would tear
   * down and rebuild the whole ready-state view (filters panel, canvas,
   * detail panel) for what is, underneath, a coordinate change on an
   * unchanged graph.
   */
  knowledgeGraph: (repoId: string) => ['repos', repoId, 'knowledge', 'graph'] as const,
};
