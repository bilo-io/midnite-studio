import { useRef } from 'react';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import type { KnowledgeFilterState } from './knowledge-filters';
import { useSigmaGraph } from './use-sigma-graph';

/**
 * The sigma canvas mount point (Theme D). Genuinely un-unit-testable under
 * jsdom (no WebGL) — see `use-sigma-graph.ts`'s own docblock for how the
 * decisions it makes are pulled out into plain, vitest-covered functions
 * instead. This component itself stays a thin `<div>` + one hook call so
 * there is nothing here FOR a test to reach anyway.
 */
export function KnowledgeCanvas({
  payload,
  filters,
  focusNodeId,
  selectedNodeId,
  collapsedCommunities,
  onNodeClick,
  onNodeDoubleClick,
  paused,
}: {
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
  const containerRef = useRef<HTMLDivElement>(null);

  useSigmaGraph({
    containerRef,
    payload,
    filters,
    focusNodeId,
    selectedNodeId,
    collapsedCommunities,
    onNodeClick,
    onNodeDoubleClick,
    paused,
  });

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-canvas"
      className="h-full min-h-0 w-full flex-1 bg-background"
    />
  );
}
