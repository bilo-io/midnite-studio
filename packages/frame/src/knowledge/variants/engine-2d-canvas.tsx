import { useRef } from 'react';

import { useKnowledgeHost } from '../knowledge-host';
import type { KnowledgeVariantProps } from '../renderer-contract';
import { useKnowledgeRenderer } from '../use-knowledge-renderer';
import { liveCommunityColor, type Base2DRenderer, type Engine2DEnv } from './base-2d-renderer';

/**
 * The React half every non-sigma 2D variant shares (Phase 89 Themes F-I): one container `<div>`,
 * one renderer instance for the component's lifetime, and `useKnowledgeRenderer` driving it. A
 * variant module is `createRenderer` plus a hint line — nothing else — so a new engine cannot
 * drift from how the others mount, filter, focus or pause.
 */
export function Engine2DCanvas({
  createRenderer,
  hint,
  ...props
}: KnowledgeVariantProps & {
  createRenderer: (env: Engine2DEnv) => Base2DRenderer;
  /** The one-line interaction hint in the corner, e.g. "force-graph · Drag to pan · Scroll to zoom". */
  hint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Base2DRenderer | null>(null);
  const host = useKnowledgeHost();
  if (rendererRef.current === null) {
    rendererRef.current = createRenderer({
      prefersReducedMotion: host.prefersReducedMotion,
      colorFor: liveCommunityColor,
    });
  }

  useKnowledgeRenderer({
    containerRef,
    renderer: rendererRef.current,
    payload: props.payload,
    filters: props.filters,
    focusNodeId: props.focusNodeId,
    selectedNodeId: props.selectedNodeId,
    collapsedCommunities: props.collapsedCommunities,
    onNodeClick: props.onNodeClick,
    onNodeDoubleClick: props.onNodeDoubleClick,
    paused: props.paused,
    maxNodes: props.maxNodes,
  });

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 bg-background">
      <div
        ref={containerRef}
        data-testid="knowledge-canvas"
        className="h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden"
      />
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
        {hint}
      </div>
    </div>
  );
}
