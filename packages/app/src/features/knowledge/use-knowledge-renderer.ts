import { useEffect, useRef, type RefObject } from 'react';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import type { KnowledgeFilterState } from './knowledge-filters';
import type { KnowledgeRenderer } from './renderer-contract';

/**
 * The generic half of the seam (Theme A) — every variant's own component
 * calls this instead of re-deriving `use-sigma-graph.ts`'s four effects.
 * Each effect below maps onto one of that hook's original four, just
 * pointed at a `KnowledgeRenderer`'s methods instead of sigma/graphology
 * directly; the sigma variant's own copy of this wiring produced byte-for-
 * byte the same runtime behaviour, so this is a mechanical extraction, not
 * a redesign.
 */
export function useKnowledgeRenderer(options: {
  containerRef: RefObject<HTMLDivElement | null>;
  renderer: KnowledgeRenderer;
  payload: KnowledgeGraphPayload | null;
  filters: KnowledgeFilterState;
  focusNodeId: string | null;
  selectedNodeId: string | null;
  collapsedCommunities: ReadonlySet<string>;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  paused: boolean;
}): void {
  const onNodeClickRef = useRef(options.onNodeClick);
  onNodeClickRef.current = options.onNodeClick;
  const onNodeDoubleClickRef = useRef(options.onNodeDoubleClick);
  onNodeDoubleClickRef.current = options.onNodeDoubleClick;

  // Mirrors `use-sigma-graph.ts:165` exactly: an unconditional assignment on
  // every render, not an effect, so every effect below — including this same
  // commit's mount/focus effects on first mount — reads the CURRENT `paused`
  // rather than whatever a dependency-array ordering happened to leave in
  // place. `setPaused` is a cheap, idempotent field write either way.
  options.renderer.setPaused(options.paused);

  // Which payload object `mount()` most recently ran with — Theme E's own
  // seam for telling a genuine graph change (below, effect 1) apart from a
  // layout switch under the SAME graph (effect 1b): a `getGraph({layoutId})`
  // refetch hands back a brand-new payload object every time, even when only
  // `positions` moved, so object identity alone can't drive `mount()` without
  // remounting — and losing the camera and every in-flight tween — on every
  // layout switch too.
  const mountedPayloadRef = useRef<KnowledgeGraphPayload | null>(null);

  // (1) Mount once per GRAPH identity — `builtAtCommit`, not object identity
  // (Theme E) — a fresh commit or a repo switch, never a filter/search
  // keystroke and never a layout switch (which keeps `builtAtCommit` and
  // reaches effect 1b instead). Mirrors `use-sigma-graph.ts`'s own effect (1),
  // `:176`.
  useEffect(() => {
    const container = options.containerRef.current;
    const payload = options.payload;
    const renderer = options.renderer;
    if (!container || !payload) return;

    renderer.mount(container, payload, {
      onNodeClick: (nodeId) => onNodeClickRef.current(nodeId),
      onNodeDoubleClick: (nodeId) => onNodeDoubleClickRef.current(nodeId),
    });
    mountedPayloadRef.current = payload;

    return () => {
      renderer.dispose();
      mountedPayloadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- builtAtCommit (and a renderer swap) are the only intended triggers, matching use-sigma-graph.ts's own effect (1)
  }, [options.renderer, options.payload?.builtAtCommit]);

  // (1b) Retarget to a newly requested layout's coordinates without
  // remounting (Theme E) — a payload whose `builtAtCommit` matches the one
  // `mount()` last ran with, but whose object identity (and therefore
  // `positions`) differs, is a layout switch. `mountedPayloadRef` (not
  // `Object.is` against a stale closure) is what tells this apart from the
  // SAME render effect (1) just mounted on — see that effect's own setup,
  // which updates the ref before this one runs.
  useEffect(() => {
    const payload = options.payload;
    const mounted = mountedPayloadRef.current;
    if (!payload || !mounted || payload === mounted) return;
    if (payload.builtAtCommit !== mounted.builtAtCommit) return;
    options.renderer.retarget(payload.positions);
    mountedPayloadRef.current = payload;
  }, [options.renderer, options.payload]);

  // (2) Push filter/search/selection updates without rebuilding — mirrors
  // effect (2), `:499`. Split into the two contract methods the filter axis
  // (visibility) and the highlight axis (dimming) name separately, called
  // together here exactly as they changed together before.
  useEffect(() => {
    options.renderer.applyFilters(options.filters);
  }, [options.renderer, options.filters, options.payload]);

  useEffect(() => {
    options.renderer.applyHighlight(options.selectedNodeId);
  }, [options.renderer, options.selectedNodeId, options.payload]);

  // (3) Fly the camera to the focused node — mirrors effect (3), `:537`.
  // `paused` is intentionally not a dependency here either: a focus-node
  // change is the only thing that should fly the camera, and the renderer
  // reads its own most recently pushed `paused` state (via `setPaused`,
  // below) at the moment it acts.
  useEffect(() => {
    options.renderer.focusNode(options.focusNodeId);
  }, [options.renderer, options.focusNodeId]);

  // (4) Collapse/expand communities — mirrors effect (4), `:561`.
  useEffect(() => {
    options.renderer.setCollapsed(options.collapsedCommunities);
  }, [options.renderer, options.collapsedCommunities, options.payload]);
}
