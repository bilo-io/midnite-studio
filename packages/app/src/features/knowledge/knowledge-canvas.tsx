import { Suspense, lazy, useMemo } from 'react';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import type { KnowledgeFilterState } from './knowledge-filters';
import { resolveVariant, type KnowledgeVariantId } from './renderer-contract';

/**
 * The variant seam's mount point (Phase 89 Theme A). Before this theme, this
 * component WAS the sigma canvas — a thin `<div>` + one `useSigmaGraph` call.
 * It is now a thinner dispatcher: resolve which variant is active, lazy-load
 * its module, and pass the same props through unchanged, so
 * `knowledge-view.tsx` never has to know a variant exists. With sigma as the
 * only registered variant (Theme A's own bar — see the phase doc's
 * verification line), this renders exactly what it always rendered.
 *
 * `React.lazy` (not each variant importing eagerly) is what keeps a variant
 * a per-variant dynamic `import()` (Decision 2) — later themes' libraries
 * never share a chunk with sigma or with each other. The `Suspense` boundary
 * has no visible fallback: the active variant is already resolved
 * synchronously (`resolveVariant`), so there is nothing to show while its
 * chunk loads but the same background the canvas paints over anyway.
 */
export function KnowledgeCanvas({
  rendererVariant,
  payload,
  filters,
  focusNodeId,
  selectedNodeId,
  collapsedCommunities,
  onNodeClick,
  onNodeDoubleClick,
  paused,
}: {
  /** The persisted variant preference — `ui-store.ts`'s `rendererVariant`, mirrored per `knowledge-filters-store.ts`. */
  rendererVariant: KnowledgeVariantId;
  payload: KnowledgeGraphPayload;
  filters: KnowledgeFilterState;
  focusNodeId: string | null;
  selectedNodeId: string | null;
  collapsedCommunities: ReadonlySet<string>;
  onNodeClick: (nodeId: string) => void;
  /** A double-click collapses an ordinary node's community, or expands a meta-node — the caller decides which. */
  onNodeDoubleClick: (nodeId: string) => void;
  /** Phase 84's visibility gate — the window is blurred; skip the camera-fly and bounce animations. */
  paused: boolean;
}) {
  const variant = resolveVariant(rendererVariant);
  // Keyed on `variant.load` — NOT the whole `variant` object, and NOT
  // `variant.id` — so switching between two variants that share the same
  // `load()` (Theme D's four sigma looks all resolve to `loadSigma`,
  // `renderer-contract.ts`) reuses the same `React.lazy` component and
  // therefore the same mounted instance underneath it: the phase doc's own
  // requirement that switching sigma looks "does not tear down and rebuild
  // the renderer." Switching to a variant with a genuinely different
  // `load()` (a different engine, Themes F–I) still creates a fresh `lazy`
  // wrapper and remounts, exactly as before.
  const Variant = useMemo(() => lazy(variant.load), [variant.load]);

  return (
    <Suspense fallback={null}>
      <Variant
        payload={payload}
        filters={filters}
        focusNodeId={focusNodeId}
        selectedNodeId={selectedNodeId}
        collapsedCommunities={collapsedCommunities}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        paused={paused}
      />
    </Suspense>
  );
}
