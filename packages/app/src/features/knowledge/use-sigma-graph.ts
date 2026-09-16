import { useEffect, useRef, type RefObject } from 'react';

import { MultiDirectedGraph } from 'graphology';
import Sigma from 'sigma';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { alphaForWeight, withAlpha } from './knowledge-canvas-colors';
import { hslTripleToRgbString } from './knowledge-color-math';
import { communityColor, parseHslTriple } from './knowledge-community-colors';
import { computeDegrees, sizeForDegree } from './knowledge-degree';
import { isLinkVisible, isCommunityVisible, searchMatches, type KnowledgeFilterState } from './knowledge-filters';

/**
 * Raw `sigma` + a thin local hook, per the phase doc's Decision 6 — not
 * `@react-sigma/core`, which is one more dependency for lifecycle management
 * this hook needs roughly forty lines of, and which knows nothing about
 * Phase 84's visibility gates or the app's own theme tokens either way.
 *
 * Split from `knowledge-canvas.tsx` (the mount point) so the imperative
 * sigma/graphology wiring — genuinely un-unit-testable under jsdom, which
 * has no WebGL — stays in one small file; every DECISION it makes (who's
 * visible, what colour, when a label shows) is a plain function imported
 * from `knowledge-filters.ts` / `knowledge-community-colors.ts` /
 * `knowledge-canvas-colors.ts` / `knowledge-degree.ts`, each covered by its
 * own vitest suite with no canvas involved.
 */

type NodeAttrs = {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  community: number;
  communityName: string;
};
type EdgeAttrs = { relation: string; weight: number; confidence: number };

/** Below this camera ratio (zoomed in enough), labels become eligible — the other half of the LOD is degree. */
const LABEL_ZOOM_RATIO = 0.4;
/** A node needs at least this many edges before a label is ever drawn for it, however zoomed in. */
const LABEL_DEGREE_THRESHOLD = 3;
const DIMMED_ALPHA = 0.12;
const FOCUS_CAMERA_RATIO = 0.12;
const FOCUS_ANIMATION_MS = 400;

function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `--muted-foreground`, converted for sigma the same way `communityColor` converts its own tokens. */
function computeEdgeBaseColor(): string {
  const parsed = parseHslTriple(resolveToken('--muted-foreground'));
  return parsed ? hslTripleToRgbString(parsed.h, parsed.s, parsed.l) : 'rgb(136, 136, 136)';
}

export function useSigmaGraph(options: {
  containerRef: RefObject<HTMLDivElement | null>;
  payload: KnowledgeGraphPayload | null;
  filters: KnowledgeFilterState;
  focusNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  /** Phase 84's visibility gate — while true, skip the one animated thing this hook does (the camera fly). */
  paused: boolean;
}): void {
  const rendererRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);
  const graphRef = useRef<MultiDirectedGraph<NodeAttrs, EdgeAttrs> | null>(null);
  const liveRef = useRef({
    filters: options.filters,
    focusNodeId: options.focusNodeId,
    searchMatchIds: new Set<string>(),
    neighborIds: new Set<string>(),
    /** Repainted in place on a theme change — see the `MutationObserver` below. */
    edgeBaseColor: 'rgb(136, 136, 136)',
  });
  const onNodeClickRef = useRef(options.onNodeClick);
  onNodeClickRef.current = options.onNodeClick;

  // (1) Build the graph and mount sigma once per payload identity — a fresh
  // `builtAtCommit` or a repo switch, never a filter/search keystroke.
  // Filters/focus are pushed through `liveRef` + `refresh()` in effect (2)
  // instead, so typing in the search box never rebuilds 14,881 nodes.
  useEffect(() => {
    const container = options.containerRef.current;
    const payload = options.payload;
    if (!container || !payload) return;

    const graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();
    const degrees = computeDegrees(payload.links);

    for (const node of payload.nodes) {
      const pos = payload.positions[node.id] ?? { x: 0, y: 0 };
      graph.addNode(node.id, {
        x: pos.x,
        y: pos.y,
        size: sizeForDegree(degrees.get(node.id) ?? 0),
        label: node.label,
        color: communityColor(node.community, resolveToken),
        community: node.community,
        communityName: node.communityName,
      });
    }
    for (const link of payload.links) {
      if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
      graph.addEdge(link.source, link.target, {
        relation: link.relation,
        weight: link.weight,
        confidence: link.confidence,
      });
    }

    liveRef.current.edgeBaseColor = computeEdgeBaseColor();

    // Declared before assignment on purpose — the reducers below close over
    // this binding and are called synchronously from inside the `new Sigma`
    // constructor itself, before the assignment on the next line completes.
    let renderer: Sigma<NodeAttrs, EdgeAttrs> | undefined;
    try {
      renderer = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
        minCameraRatio: 0.02,
        maxCameraRatio: 4,
        // The zoom-LOD is entirely reducer-driven (below); sigma's own
        // built-in size threshold would fight it.
        labelRenderedSizeThreshold: 0,
        nodeReducer: (node, data) => {
          const live = liveRef.current;
          const nodeAttrs = graph.getNodeAttributes(node);
          const visible = isCommunityVisible(nodeAttrs.communityName, live.filters);
          const searching = live.searchMatchIds.size > 0;
          const isMatch = live.searchMatchIds.has(node);
          const isNeighbor = live.neighborIds.has(node);
          const dimmed = searching && !isMatch && !isNeighbor;
          // `renderer` is still unassigned the first time sigma calls this
          // reducer — synchronously, from inside its own constructor, before
          // `renderer = new Sigma(...)` below has returned. `?? 1` (zoomed
          // out) is the safe default for that one call; every later call,
          // camera-driven or `refresh()`-driven, sees the real instance.
          const cameraRatio = renderer?.getCamera().ratio ?? 1;
          const eligibleForLabel =
            cameraRatio < LABEL_ZOOM_RATIO && (degrees.get(node) ?? 0) >= LABEL_DEGREE_THRESHOLD;
          return {
            ...data,
            hidden: !visible,
            label: eligibleForLabel || isMatch ? data.label : null,
            color: dimmed ? withAlpha(nodeAttrs.color, DIMMED_ALPHA) : nodeAttrs.color,
            highlighted: live.focusNodeId === node,
            zIndex: isMatch ? 2 : 1,
          };
        },
        edgeReducer: (edge, data) => {
          const live = liveRef.current;
          const edgeAttrs = graph.getEdgeAttributes(edge);
          const [source, target] = graph.extremities(edge);
          const sourceAttrs = graph.getNodeAttributes(source);
          const targetAttrs = graph.getNodeAttributes(target);
          const visible = isLinkVisible(
            edgeAttrs,
            sourceAttrs.communityName,
            targetAttrs.communityName,
            live.filters,
          );
          const searching = live.searchMatchIds.size > 0;
          const touchesFocus =
            live.searchMatchIds.has(source) ||
            live.searchMatchIds.has(target) ||
            live.neighborIds.has(source) ||
            live.neighborIds.has(target);
          const dimmed = searching && !touchesFocus;
          const alpha = alphaForWeight(edgeAttrs.weight);
          const baseColor = live.edgeBaseColor;
          return {
            ...data,
            hidden: !visible,
            size: Math.max(0.5, edgeAttrs.weight),
            color: dimmed ? withAlpha(baseColor, DIMMED_ALPHA) : withAlpha(baseColor, alpha),
          };
        },
      });
    } catch (err) {
      // Theme D: "graceful failure when WebGL context acquisition fails — a
      // message inside the view's error boundary, never a blank window." The
      // per-view `ErrorBoundary` (`view-registry.tsx`) is exactly that catch.
      throw err instanceof Error ? err : new Error('Could not start the knowledge graph canvas.');
    }

    renderer.on('clickNode', ({ node }) => onNodeClickRef.current(node));

    graphRef.current = graph;
    rendererRef.current = renderer;

    // Theme D: "reads the same CSS custom properties every other surface
    // does and repaints on theme change — no hardcoded palette." Node colour
    // is baked into each node's own attributes (not recomputed every frame,
    // unlike the edge reducer's `live.edgeBaseColor`), so a theme flip has to
    // walk the graph and rewrite it — the same `MutationObserver` on `<html
    // class>` `app.tsx`'s `useWindowBackgroundSync` already uses for the
    // window-chrome colour, there being no theme-change event to listen for
    // instead.
    let repaintObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
      repaintObserver = new MutationObserver(() => {
        // O(1) per node — `community` lives on the node's own attributes
        // (set when it was added, above), not a re-scan of `payload.nodes`.
        graph.forEachNode((nodeId, attrs) => {
          graph.setNodeAttribute(nodeId, 'color', communityColor(attrs.community, resolveToken));
        });
        liveRef.current.edgeBaseColor = computeEdgeBaseColor();
        renderer?.refresh();
      });
      repaintObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      repaintObserver?.disconnect();
      renderer?.kill();
      graphRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payload identity is the only intended trigger, see comment above
  }, [options.payload]);

  // (2) Push filter/search updates into the live reducers without rebuilding
  // the graph, then ask sigma to re-evaluate them.
  useEffect(() => {
    const live = liveRef.current;
    live.filters = options.filters;
    live.focusNodeId = options.focusNodeId;

    const payload = options.payload;
    const graph = graphRef.current;
    if (payload && options.filters.query) {
      const matches = searchMatches(payload.nodes, options.filters.query);
      live.searchMatchIds = matches;
      const neighbors = new Set<string>();
      if (graph) {
        for (const id of matches) {
          if (!graph.hasNode(id)) continue;
          for (const neighbor of graph.neighbors(id)) neighbors.add(neighbor);
        }
      }
      live.neighborIds = neighbors;
    } else {
      live.searchMatchIds = new Set();
      live.neighborIds = new Set();
    }

    rendererRef.current?.refresh();
  }, [options.filters, options.focusNodeId, options.payload]);

  // (3) Fly the camera to the focused node. Skipped while `paused` (Phase 84
  // — the window is blurred): `camera.animate()` runs its own short rAF
  // tween, exactly the kind of "render loop while hidden" cost that phase
  // spent eleven themes removing, so a paused focus change snaps instead.
  useEffect(() => {
    const renderer = rendererRef.current;
    const graph = graphRef.current;
    const focusNodeId = options.focusNodeId;
    if (!renderer || !graph || !focusNodeId || !graph.hasNode(focusNodeId)) return;

    const { x, y } = graph.getNodeAttributes(focusNodeId);
    if (options.paused) {
      renderer.getCamera().setState({ x, y, ratio: FOCUS_CAMERA_RATIO });
    } else {
      void renderer.getCamera().animate({ x, y, ratio: FOCUS_CAMERA_RATIO }, { duration: FOCUS_ANIMATION_MS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paused` is read, not a trigger: a focus-node change is the only thing that should fly the camera
  }, [options.focusNodeId]);
}
