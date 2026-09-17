import { useEffect, useRef, type RefObject } from 'react';

import { MultiDirectedGraph } from 'graphology';
import Sigma from 'sigma';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { useResolvedMotion } from '../../store/appearance-store';
import { PULSES, PulseTracker } from './knowledge-bounce';
import {
  DIMMED_ALPHA,
  alphaForWeight,
  nodeColorForState,
  withAlpha,
} from './knowledge-canvas-colors';
import { drawThemedNodeHover } from './knowledge-canvas-draw';
import { hslTripleToRgbString } from './knowledge-color-math';
import {
  aggregateCommunityEdges,
  communityCentroids,
  communityNodeId,
  isAggregatedEdgeVisible,
  sizeForMemberCount,
} from './knowledge-community-collapse';
import { communityColor, parseHslTriple } from './knowledge-community-colors';
import { computeDegrees, sizeForDegree } from './knowledge-degree';
import {
  isLinkVisible,
  isCommunityVisible,
  searchMatches,
  type KnowledgeFilterState,
} from './knowledge-filters';
import {
  computeHighlightSets,
  edgePaint,
  nodePaint,
  type HighlightSets,
} from './knowledge-highlight';
import {
  INTRO_TIMING,
  IntroTracker,
  computeCentroid,
  introEdgeAlphaMultiplier,
  type IntroNodeSpec,
} from './knowledge-intro';

/**
 * Raw `sigma` + a thin local hook, per the phase doc's Decision 6 — not
 * `@react-sigma/core`, which is one more dependency for lifecycle management
 * this hook needs roughly forty lines of, and which knows nothing about
 * Phase 84's visibility gates or the app's own theme tokens either way.
 *
 * Split from `knowledge-canvas.tsx` (the mount point) so the imperative
 * sigma/graphology wiring — genuinely un-unit-testable under jsdom, which
 * has no WebGL — stays in one small file; every DECISION it makes (who's
 * visible, what colour, when a label shows, what is lit, how far a pulse
 * overshoots, which edges a collapsed community folds into) is a plain
 * function imported from its own `knowledge-*.ts` module, each covered by
 * its own vitest suite with no canvas involved.
 *
 * Performance shape, for a 15k-node / 36k-edge graph:
 *   - the graph is built ONCE per payload; filters, selection, search and
 *     collapse all flow through `liveRef` and a `refresh()`, never a rebuild;
 *   - every reducer is O(1) — degree, community and endpoint ids are baked
 *     into each item's own attributes at build time, so no `extremities()`
 *     or `getNodeAttributes()` per edge per frame;
 *   - hover and the bounce tweens repaint ONLY the items they touch, through
 *     sigma's `partialGraph` refresh — a hover never reprocesses 36k edges;
 *   - label level-of-detail is sigma's own `labelRenderedSizeThreshold`
 *     (rendered pixels, re-evaluated every camera frame) crossed with a
 *     degree floor in the reducer, so labels appear progressively as you
 *     zoom without the reducer needing to re-run on camera moves;
 *   - edges are hidden while the camera moves on graphs past
 *     `HIDE_EDGES_ON_MOVE_ABOVE` edges — panning stays smooth where it counts.
 */

type NodeAttrs = {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  community: number;
  communityName: string;
  degree: number;
  /** `community` is a collapsed community's meta-node (`knowledge-community-collapse.ts`). */
  kind: 'node' | 'community';
  memberCount: number;
};
type EdgeAttrs = {
  relation: string;
  weight: number;
  confidence: number;
  sourceId: string;
  targetId: string;
  sourceCommunity: string;
  targetCommunity: string;
  /** `aggregate` folds several raw links between a collapsed community and something else. */
  kind: 'link' | 'aggregate';
  relations: string[];
  count: number;
};

/** A node needs at least this many edges before a label is ever drawn for it, however zoomed in — unless it is lit. */
const LABEL_DEGREE_THRESHOLD = 3;
/** sigma's own LOD: a label is a candidate once the node renders at least this many pixels wide. */
const LABEL_RENDERED_SIZE_THRESHOLD = 7;
/** Past this many edges, hide them while the camera moves — the pan stays at 60fps, edges snap back on release. */
const HIDE_EDGES_ON_MOVE_ABOVE = 15_000;
const FOCUS_CAMERA_RATIO = 0.12;
const FOCUS_ANIMATION_MS = 400;
const EMPHASISED_EDGE_SCALE = 1.4;

function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A theme token as the `rgb(...)` string sigma can paint — see `knowledge-color-math.ts` for why not `hsl()`. */
function tokenRgb(name: string, fallback: string): string {
  const parsed = parseHslTriple(resolveToken(name));
  return parsed ? hslTripleToRgbString(parsed.h, parsed.s, parsed.l) : fallback;
}

type ThemeColors = {
  /** `--muted-foreground` — an edge at rest. */
  edgeBase: string;
  /** `--primary` — an edge touching a lit node. */
  accent: string;
  /** `--foreground` — every label, node and edge alike: the theme's own text colour. */
  label: string;
  /** `--background` / `--border` — the hover bubble. */
  hoverBox: string;
  hoverBorder: string;
};

function readThemeColors(): ThemeColors {
  return {
    edgeBase: tokenRgb('--muted-foreground', 'rgb(136, 136, 136)'),
    accent: tokenRgb('--primary', 'rgb(99, 102, 241)'),
    label: tokenRgb('--foreground', 'rgb(230, 230, 230)'),
    hoverBox: tokenRgb('--background', 'rgb(20, 20, 24)'),
    hoverBorder: tokenRgb('--border', 'rgb(60, 60, 68)'),
  };
}

const EMPTY_HIGHLIGHT: HighlightSets = {
  active: false,
  focusIds: new Set(),
  neighborIds: new Set(),
};

export function useSigmaGraph(options: {
  containerRef: RefObject<HTMLDivElement | null>;
  payload: KnowledgeGraphPayload | null;
  filters: KnowledgeFilterState;
  /** The node the camera flies to — search's first match, or the tree list's pick. */
  focusNodeId: string | null;
  /** The node whose panel is open — lit with its neighbourhood, everything else dimmed. */
  selectedNodeId: string | null;
  collapsedCommunities: ReadonlySet<string>;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  /** Phase 84's visibility gate — while true, skip every animation this hook runs (the camera fly, the pulses). */
  paused: boolean;
}): void {
  const rendererRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);
  const graphRef = useRef<MultiDirectedGraph<NodeAttrs, EdgeAttrs> | null>(null);
  const liveRef = useRef({
    filters: options.filters,
    focusNodeId: options.focusNodeId,
    selectedNodeId: options.selectedNodeId,
    collapsed: options.collapsedCommunities,
    paused: options.paused,
    searchMatchIds: new Set<string>() as ReadonlySet<string>,
    /** Search + selection: dims everything outside it. Recomputed in effect (2). */
    highlight: EMPTY_HIGHLIGHT,
    /** Hover: lights a neighbourhood WITHOUT dimming the rest, so it can be a partial repaint. */
    hoveredNodeId: null as string | null,
    hoverLitIds: new Set<string>() as ReadonlySet<string>,
    hoveredEdgeId: null as string | null,
    /** Repainted in place on a theme change — see the `MutationObserver` below. */
    theme: {
      edgeBase: 'rgb(136, 136, 136)',
      accent: 'rgb(99, 102, 241)',
      label: 'rgb(230, 230, 230)',
      hoverBox: 'rgb(20, 20, 24)',
      hoverBorder: 'rgb(60, 60, 68)',
    } as ThemeColors,
    pulses: new PulseTracker(),
    pulseScales: new Map<string, number>() as ReadonlyMap<string, number>,
    /** Theme B — the expand-from-a-core intro. `reducedMotion` is mirrored every render, same as `paused` below, so the mount effect (payload-only deps) reads its CURRENT value without becoming a dependency. */
    reducedMotion: false,
    intro: new IntroTracker(),
    /** 1 outside an intro; ramps 0→1 while edges fade in behind the bursting nodes. */
    introEdgeAlpha: 1,
    introStartedAt: 0,
  });
  liveRef.current.paused = options.paused;
  const reducedMotion = useResolvedMotion() === 'reduced';
  liveRef.current.reducedMotion = reducedMotion;
  const onNodeClickRef = useRef(options.onNodeClick);
  onNodeClickRef.current = options.onNodeClick;
  const onNodeDoubleClickRef = useRef(options.onNodeDoubleClick);
  onNodeDoubleClickRef.current = options.onNodeDoubleClick;

  // (1) Build the graph and mount sigma once per payload identity — a fresh
  // `builtAtCommit` or a repo switch, never a filter/search keystroke.
  // Filters/focus/selection/collapse are pushed through `liveRef` +
  // `refresh()` in effects (2) and (4) instead, so typing in the search box
  // never rebuilds 14,881 nodes.
  useEffect(() => {
    const container = options.containerRef.current;
    const payload = options.payload;
    if (!container || !payload) return;

    const graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();
    const degrees = computeDegrees(payload.links);
    const live = liveRef.current;
    live.theme = readThemeColors();
    live.pulses.clear();
    live.pulseScales = new Map();
    live.hoveredNodeId = null;
    live.hoverLitIds = new Set();
    live.hoveredEdgeId = null;

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
        degree: degrees.get(node.id) ?? 0,
        kind: 'node',
        memberCount: 1,
      });
    }
    for (const link of payload.links) {
      if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
      graph.addEdge(link.source, link.target, {
        relation: link.relation,
        weight: link.weight,
        confidence: link.confidence,
        sourceId: link.source,
        targetId: link.target,
        sourceCommunity: graph.getNodeAttribute(link.source, 'communityName'),
        targetCommunity: graph.getNodeAttribute(link.target, 'communityName'),
        kind: 'link',
        relations: [link.relation],
        count: 1,
      });
    }

    // --- Intro burst setup ---------------------------------------------------
    // Theme B: on a genuinely fresh payload (first open, repo switch, or
    // re-entry — Knowledge is deliberately not `global: true`, so this effect
    // re-runs on every one of those and never on a filter keystroke), every
    // node bursts out from the graph's centroid to its laid-out position,
    // hubs first. Skipped outright — final positions on first paint, nothing
    // to interrupt — when `prefers-reduced-motion` is set (Phase 46) or the
    // window is blurred at mount (`paused`, Phase 84's `pulse()` honours the
    // same check at start-time only, not mid-flight; see that function).
    const introOrigin = computeCentroid(payload.positions);
    live.introEdgeAlpha = 1;
    live.introStartedAt = 0;
    live.intro.clear();
    const shouldAnimateIntro = !live.reducedMotion && !live.paused && payload.nodes.length > 0;
    if (shouldAnimateIntro) {
      const introNodes: IntroNodeSpec[] = payload.nodes.map((node) => ({
        id: node.id,
        to: payload.positions[node.id] ?? { x: 0, y: 0 },
        degree: degrees.get(node.id) ?? 0,
      }));
      // Snap every node to the origin BEFORE `new Sigma` below reads these
      // attributes for its first paint — the graph already carries each
      // node's final `x`/`y` from the loop above, so this is what makes the
      // very first frame read as "everything starts at the core" rather than
      // "the final layout, then a burst on top of it".
      for (const spec of introNodes) {
        graph.setNodeAttribute(spec.id, 'x', introOrigin.x);
        graph.setNodeAttribute(spec.id, 'y', introOrigin.y);
      }
      live.introStartedAt = performance.now();
      live.intro.start(introNodes, live.introStartedAt, introOrigin, {
        durationMs: INTRO_TIMING.nodeDurationMs,
        staggerMs: INTRO_TIMING.staggerMs,
      });
      live.introEdgeAlpha = 0;
    }

    // Declared before assignment on purpose — the reducers below close over
    // this binding and are called synchronously from inside the `new Sigma`
    // constructor itself, before the assignment on the next line completes.
    let renderer: Sigma<NodeAttrs, EdgeAttrs> | undefined;
    try {
      renderer = new Sigma<NodeAttrs, EdgeAttrs>(graph, container, {
        minCameraRatio: 0.02,
        maxCameraRatio: 4,
        zIndex: true,
        enableEdgeEvents: true,
        renderEdgeLabels: true,
        hideEdgesOnMove: payload.links.length > HIDE_EDGES_ON_MOVE_ABOVE,
        labelRenderedSizeThreshold: LABEL_RENDERED_SIZE_THRESHOLD,
        labelDensity: 0.6,
        labelGridCellSize: 90,
        labelFont: getComputedStyle(document.body).fontFamily || 'sans-serif',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: live.theme.label },
        edgeLabelColor: { color: live.theme.label },
        edgeLabelFont: getComputedStyle(document.body).fontFamily || 'sans-serif',
        edgeLabelSize: 10,
        defaultDrawNodeHover: (context, data, settings) =>
          drawThemedNodeHover(context, data, settings, {
            box: liveRef.current.theme.hoverBox,
            border: liveRef.current.theme.hoverBorder,
          }),
        nodeReducer: (node, data) => {
          const live = liveRef.current;
          const collapsedMember = data.kind === 'node' && live.collapsed.has(data.communityName);
          const visible = !collapsedMember && isCommunityVisible(data.communityName, live.filters);
          const paint = nodePaint(node, live.highlight, live.selectedNodeId);
          const hoverLit = live.hoverLitIds.has(node);
          const dimmed = paint.dimmed && !hoverLit;
          const lit = paint.forceLabel || hoverLit;
          const isFocus = live.highlight.focusIds.has(node) || hoverLit;
          const isNeighbor = live.highlight.neighborIds.has(node);
          const color = nodeColorForState(data.color, { dimmed, isFocus, isNeighbor });
          const eligibleForLabel =
            data.kind === 'community' || data.degree >= LABEL_DEGREE_THRESHOLD;
          const scale = live.pulseScales.get(node) ?? 1;
          return {
            ...data,
            hidden: !visible,
            size: data.size * scale,
            label: dimmed ? null : eligibleForLabel || lit ? data.label : null,
            forceLabel: lit && !dimmed,
            color,
            highlighted: paint.highlighted,
            zIndex: hoverLit ? 4 : paint.zIndex,
          };
        },
        edgeReducer: (edge, data) => {
          const live = liveRef.current;
          const visible =
            data.kind === 'aggregate'
              ? isAggregatedEdgeVisible(
                  data,
                  data.sourceCommunity,
                  data.targetCommunity,
                  live.filters,
                )
              : !live.collapsed.has(data.sourceCommunity) &&
                !live.collapsed.has(data.targetCommunity) &&
                isLinkVisible(data, data.sourceCommunity, data.targetCommunity, live.filters);
          const paint = edgePaint(data.sourceId, data.targetId, live.highlight);
          const hoverLit =
            live.hoveredNodeId !== null &&
            (data.sourceId === live.hoveredNodeId || data.targetId === live.hoveredNodeId);
          const hovered = live.hoveredEdgeId === edge;
          const emphasised = paint.emphasised || hoverLit || hovered;
          const dimmed = paint.dimmed && !emphasised;
          const scale = live.pulseScales.get(edge) ?? 1;
          const baseSize =
            data.kind === 'aggregate'
              ? Math.min(6, 1 + Math.log2(data.count))
              : Math.max(0.5, data.weight);
          const theme = live.theme;
          // Theme B: edges fade in behind the bursting nodes rather than
          // stretching from the centroid — one multiplier for the whole edge
          // set (`live.introEdgeAlpha`, 1 outside an intro), applied to the
          // ALPHA ARGUMENT before `withAlpha` premultiplies it. That is the
          // same invariant Theme C's docblock will spell out for its own
          // ramp: interpolating the alpha scalar and premultiplying after is
          // correct, interpolating the already-premultiplied RGBA is not.
          const introFade = live.introEdgeAlpha;
          const color = dimmed
            ? withAlpha(theme.edgeBase, DIMMED_ALPHA * introFade)
            : emphasised
              ? withAlpha(theme.accent, 0.85 * introFade)
              : withAlpha(theme.edgeBase, alphaForWeight(data.weight) * introFade);
          return {
            ...data,
            hidden: !visible,
            size: baseSize * (emphasised ? EMPHASISED_EDGE_SCALE : 1) * scale,
            color,
            zIndex: emphasised ? 2 : paint.zIndex,
            label: hovered
              ? data.kind === 'aggregate'
                ? `${data.relations.join(', ')} ×${data.count}`
                : data.relation
              : null,
            forceLabel: hovered,
          };
        },
      });
    } catch (err) {
      // Theme D: "graceful failure when WebGL context acquisition fails — a
      // message inside the view's error boundary, never a blank window." The
      // per-view `ErrorBoundary` (`view-registry.tsx`) is exactly that catch.
      throw err instanceof Error ? err : new Error('Could not start the knowledge graph canvas.');
    }
    const sigma = renderer;

    // --- Partial repaint helpers -------------------------------------------
    // Everything below the fold repaints only the items it names, through
    // sigma's `partialGraph` refresh (`skipIndexation`: x/y untouched). The
    // full `refresh()` is reserved for the things that genuinely change every
    // item: a filter, the selection's dimming, a collapse, a theme flip.
    const repaint = (nodes: Iterable<string>, edges: Iterable<string>) => {
      const nodeList = [...nodes].filter((id) => graph.hasNode(id));
      const edgeList = [...edges].filter((id) => graph.hasEdge(id));
      if (nodeList.length === 0 && edgeList.length === 0) return;
      try {
        sigma.refresh({ partialGraph: { nodes: nodeList, edges: edgeList }, skipIndexation: true });
      } catch {
        sigma.refresh();
      }
    };
    const incidentEdges = (nodeId: string): string[] =>
      graph.hasNode(nodeId) ? graph.edges(nodeId) : [];

    // --- Intro burst ----------------------------------------------------------
    // One rAF loop, alive only while the burst or the edge fade is still in
    // flight — started once, immediately below, only when `shouldAnimateIntro`
    // was true. Unlike the bounce loop, this one NEVER restarts mid-flight:
    // a fresh burst only ever begins from effect (1) re-running on a new
    // payload, which already tore this closure down.
    //
    // Re-indexation, measured (the phase doc's explicit requirement): sigma's
    // own `refresh()` (`sigma.cjs.dev.js`) always ends in a full `process()`
    // pass that re-derives EVERY node's screen position, rebuilds the label
    // grid and re-uploads every node/edge to its WebGL program buffer —
    // `skipIndexation: true` is the only thing that skips it, and that is
    // exactly the "positions are not re-indexed" limitation `repaint()`
    // above has and this loop cannot inherit. So the real choice is not
    // "full refresh vs. reindex-once" (both pay that pass every frame
    // regardless); it's whether the REDUCER also re-runs for the 13,000+
    // nodes and 37,036 edges NOT moving this frame. `sigma.refresh()` with no
    // options re-applies every reducer to the whole graph before that pass
    // (its `fullRefresh` branch calls `addNode`/`addEdge` for every item);
    // `refresh({ partialGraph: { nodes, edges }, skipIndexation: false })`
    // scopes the reducer re-application to just the ids named. Measured with
    // a synthetic graph at this repo's real scale (15,292 nodes / 37,036
    // links, headless Chromium + SwiftShader, 90 sampled frames after a
    // warm-up, median of the per-`refresh()` call cost — median rather than
    // mean because SwiftShader's own jank spikes the tail on both strategies
    // alike and would wash out the comparison):
    //   ~15% of nodes moving (the realistic staggered case): 35.1ms partial
    //     vs. 49.0ms full — partial 28% faster.
    //   100% of nodes moving (every node bursting on the same frame, the
    //     worst case for "scoping" to matter less): 44.7ms partial vs.
    //     51.1ms full — partial still 12% faster.
    // Partial wins in both regimes, so it ships. (SwiftShader's absolute
    // numbers are ~25-50× slower than the real GPU path an installed build
    // gets — Theme J's packaged-app instrumentation is the source for
    // absolute frame budget — but the relative comparison, which is what
    // this decision turns on, does not depend on which GPU is under it.)
    const allEdgeIds = graph.edges();
    let introFrame: number | null = null;
    const introTick = () => {
      introFrame = null;
      const live = liveRef.current;
      const sample = live.intro.sample(performance.now());
      const nodes: string[] = [];
      for (const [id, point] of sample.positions) {
        if (!graph.hasNode(id)) continue;
        graph.setNodeAttribute(id, 'x', point.x);
        graph.setNodeAttribute(id, 'y', point.y);
        nodes.push(id);
      }
      const elapsedSinceStart = performance.now() - live.introStartedAt;
      const stillFadingEdges = elapsedSinceStart < INTRO_TIMING.edgeFadeMs;
      const previousEdgeAlpha = live.introEdgeAlpha;
      live.introEdgeAlpha = stillFadingEdges
        ? introEdgeAlphaMultiplier(elapsedSinceStart / INTRO_TIMING.edgeFadeMs)
        : 1;
      // One extra frame beyond `stillFadingEdges` — the one that crosses the
      // threshold — still needs every edge touched, or they freeze a
      // fraction short of full alpha: the same "report the landing frame
      // once" rule `IntroTracker.sample` follows for node positions.
      const edgesNeedRepaint = stillFadingEdges || previousEdgeAlpha < 1;
      if (nodes.length > 0 || edgesNeedRepaint) {
        try {
          sigma.refresh({
            partialGraph: { nodes, edges: edgesNeedRepaint ? allEdgeIds : [] },
            skipIndexation: false,
          });
        } catch {
          sigma.refresh();
        }
      }
      if (sample.animating || stillFadingEdges) introFrame = requestAnimationFrame(introTick);
    };
    if (shouldAnimateIntro) introFrame = requestAnimationFrame(introTick);

    // --- Bounce -------------------------------------------------------------
    // One rAF loop, alive only while a tween is in flight. Each frame samples
    // the tracker and repaints exactly the pulsing items. `paused` (the window
    // is blurred, Phase 84) snaps every pulse to its resting scale instead.
    let pulseFrame: number | null = null;
    const pulseTick = () => {
      pulseFrame = null;
      const live = liveRef.current;
      const sample = live.pulses.sample(performance.now());
      live.pulseScales = sample.scales;
      const touched = new Set<string>([...sample.scales.keys(), ...sample.finished]);
      const nodes: string[] = [];
      const edges: string[] = [];
      for (const id of touched) {
        if (graph.hasNode(id)) nodes.push(id);
        else if (graph.hasEdge(id)) edges.push(id);
      }
      repaint(nodes, edges);
      if (sample.animating) pulseFrame = requestAnimationFrame(pulseTick);
    };
    const pulse = (id: string, preset: { to: number; durationMs: number; overshoot: number }) => {
      const live = liveRef.current;
      live.pulses.start(id, performance.now(), live.paused ? { ...preset, durationMs: 0 } : preset);
      if (pulseFrame === null) pulseFrame = requestAnimationFrame(pulseTick);
    };

    // --- Hover ----------------------------------------------------------------
    // A node's hover lights its one-hop neighbourhood and incident edges — a
    // repaint of a few hundred items at most, never the whole graph, which is
    // what keeps sweeping the pointer across a dense cluster smooth.
    const setHoveredNode = (nodeId: string | null) => {
      const live = liveRef.current;
      if (live.hoveredNodeId === nodeId) return;
      const previous = live.hoveredNodeId;
      const previousLit = live.hoverLitIds;
      const previousEdges = previous ? incidentEdges(previous) : [];
      live.hoveredNodeId = nodeId;
      const lit = new Set<string>();
      if (nodeId && graph.hasNode(nodeId)) {
        lit.add(nodeId);
        for (const neighbor of graph.neighbors(nodeId)) lit.add(neighbor);
      }
      live.hoverLitIds = lit;
      repaint(new Set([...previousLit, ...lit]), [
        ...previousEdges,
        ...(nodeId ? incidentEdges(nodeId) : []),
      ]);
    };

    sigma.on('enterNode', ({ node }) => {
      setHoveredNode(node);
      pulse(node, PULSES.nodeHoverIn);
    });
    sigma.on('leaveNode', ({ node }) => {
      setHoveredNode(null);
      pulse(node, PULSES.nodeHoverOut);
    });
    // A click's SELECTION waits out sigma's double-click window; the bounce
    // does not. Selecting opens the side panel, which narrows the canvas and
    // re-frames the graph — so the node a user is mid-double-click on would
    // slide out from under the pointer between their first and second click,
    // and the second would land on empty stage. Deferring by exactly
    // `doubleClickTimeout` (sigma's own two-clicks-make-a-double window) and
    // cancelling when the double arrives is the standard click/dblclick
    // disambiguation; the pulse still fires on the first click so the node
    // reacts instantly.
    let pendingClick: ReturnType<typeof setTimeout> | null = null;
    sigma.on('clickNode', ({ node }) => {
      pulse(node, PULSES.nodeClick);
      if (pendingClick !== null) clearTimeout(pendingClick);
      pendingClick = setTimeout(() => {
        pendingClick = null;
        onNodeClickRef.current(node);
      }, sigma.getSetting('doubleClickTimeout'));
    });
    sigma.on('doubleClickNode', ({ node, preventSigmaDefault }) => {
      // sigma's own double-click zooms the camera; ours collapses/expands.
      preventSigmaDefault();
      if (pendingClick !== null) {
        clearTimeout(pendingClick);
        pendingClick = null;
      }
      onNodeDoubleClickRef.current(node);
    });
    sigma.on('enterEdge', ({ edge }) => {
      liveRef.current.hoveredEdgeId = edge;
      pulse(edge, PULSES.edgeHoverIn);
      container.style.cursor = 'pointer';
    });
    sigma.on('leaveEdge', ({ edge }) => {
      if (liveRef.current.hoveredEdgeId === edge) liveRef.current.hoveredEdgeId = null;
      pulse(edge, PULSES.edgeHoverOut);
      container.style.cursor = '';
    });
    sigma.on('clickEdge', ({ edge }) => {
      pulse(edge, PULSES.edgeClick);
    });

    graphRef.current = graph;
    rendererRef.current = sigma;

    // Theme D: "reads the same CSS custom properties every other surface
    // does and repaints on theme change — no hardcoded palette." Node colour
    // is baked into each node's own attributes (not recomputed every frame,
    // unlike the edge reducer's `live.theme`), so a theme flip has to walk
    // the graph and rewrite it — the same `MutationObserver` on `<html
    // class>` `app.tsx`'s `useWindowBackgroundSync` already uses for the
    // window-chrome colour, there being no theme-change event to listen for
    // instead. Label colour is a sigma setting, swapped in place.
    let repaintObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
      repaintObserver = new MutationObserver(() => {
        // O(1) per node — `community` lives on the node's own attributes
        // (set when it was added, above), not a re-scan of `payload.nodes`.
        graph.forEachNode((nodeId, attrs) => {
          graph.setNodeAttribute(nodeId, 'color', communityColor(attrs.community, resolveToken));
        });
        const theme = readThemeColors();
        liveRef.current.theme = theme;
        sigma.setSetting('labelColor', { color: theme.label });
        sigma.setSetting('edgeLabelColor', { color: theme.label });
        sigma.refresh();
      });
      repaintObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    // Theme G finding (unverified under CI at ship time — Playwright's own
    // `knowledge-canvas.spec.ts` caught it): sigma only re-measures its
    // container on `render()` (`resize()` runs first thing inside it, per
    // sigma's own source) and only *schedules* a render off a `window`
    // `resize` event. A sibling flex item mounting or unmounting — opening
    // `KnowledgeNodePanel` on a click, or the filters panel changing width —
    // resizes THIS container without ever firing a window resize, so sigma's
    // canvases kept their stale (larger) dimensions and visibly overlapped
    // the newly-opened node panel, intercepting its own clicks. A
    // `ResizeObserver` on the container is what a `window` listener can't
    // be here: it fires on exactly the resize that actually happened,
    // regardless of what caused it.
    let containerResizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      containerResizeObserver = new ResizeObserver(() => {
        sigma.refresh();
      });
      containerResizeObserver.observe(container);
    }

    return () => {
      if (pendingClick !== null) clearTimeout(pendingClick);
      if (pulseFrame !== null) cancelAnimationFrame(pulseFrame);
      if (introFrame !== null) cancelAnimationFrame(introFrame);
      containerResizeObserver?.disconnect();
      repaintObserver?.disconnect();
      container.style.cursor = '';
      sigma.kill();
      graphRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payload identity is the only intended trigger, see comment above
  }, [options.payload]);

  // (2) Push filter/search/selection updates into the live reducers without
  // rebuilding the graph, then ask sigma to re-evaluate them. These all
  // change what EVERY item looks like (a filter hides edges everywhere; a
  // selection dims everything outside its neighbourhood), so this is the
  // one place a full `refresh()` is the right tool.
  useEffect(() => {
    const live = liveRef.current;
    live.filters = options.filters;
    live.focusNodeId = options.focusNodeId;
    live.selectedNodeId = options.selectedNodeId;

    const payload = options.payload;
    const graph = graphRef.current;
    live.searchMatchIds =
      payload && options.filters.query
        ? searchMatches(payload.nodes, options.filters.query)
        : new Set();
    live.highlight = computeHighlightSets({
      searchMatchIds: live.searchMatchIds,
      selectedNodeId: options.selectedNodeId,
      hoveredNodeId: null,
      neighborsOf: (id) => (graph?.hasNode(id) ? graph.neighbors(id) : []),
    });

    rendererRef.current?.refresh();
  }, [options.filters, options.focusNodeId, options.selectedNodeId, options.payload]);

  // (3) Fly the camera to the focused node. Skipped while `paused` (Phase 84
  // — the window is blurred): `camera.animate()` runs its own short rAF
  // tween, exactly the kind of "render loop while hidden" cost that phase
  // spent eleven themes removing, so a paused focus change snaps instead.
  //
  // Theme G finding (unverified under CI at ship time): the camera's own
  // `x`/`y` are in sigma's NORMALIZED "framed graph" space — the graph's own
  // bounding box rescaled/recentred so the default `{x: 0.5, y: 0.5, ratio:
  // 1}` camera frames the whole thing (see sigma's `createNormalizationFunction`)
  // — not the raw coordinates a node was added with. `graph.getNodeAttributes`
  // returns those raw coordinates, so setting the camera to them points it at
  // a location that is only ever right by coincidence (e.g. a graph whose
  // whole extent already happens to sit inside roughly [0, 1]). `sigma`'s own
  // node display cache (`getNodeDisplayData`) is the same data ALREADY run
  // through that normalization for rendering — the standard, documented way
  // to convert a node's position into camera-space — so that is what a real
  // browser test (`knowledge-canvas.spec.ts`'s search-and-focus case) caught
  // this on, and what it asserts stays fixed.
  useEffect(() => {
    const renderer = rendererRef.current;
    const graph = graphRef.current;
    const focusNodeId = options.focusNodeId;
    if (!renderer || !graph || !focusNodeId || !graph.hasNode(focusNodeId)) return;

    const displayData = renderer.getNodeDisplayData(focusNodeId);
    if (!displayData) return;
    const { x, y } = displayData;
    if (options.paused) {
      renderer.getCamera().setState({ x, y, ratio: FOCUS_CAMERA_RATIO });
    } else {
      void renderer
        .getCamera()
        .animate({ x, y, ratio: FOCUS_CAMERA_RATIO }, { duration: FOCUS_ANIMATION_MS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paused` is read, not a trigger: a focus-node change is the only thing that should fly the camera
  }, [options.focusNodeId]);

  // (4) Collapse/expand communities. Meta-nodes and their aggregated edges
  // are the ONE thing that mutates the graph after build — added for every
  // collapsed community, dropped for every expanded one — and they are
  // rebuilt wholesale from `aggregateCommunityEdges` on each change rather
  // than diffed (see that function's docblock for why). Member nodes and
  // their raw edges are never removed: the reducers hide them while their
  // community is collapsed, so expanding is instant and loses nothing.
  useEffect(() => {
    const graph = graphRef.current;
    const renderer = rendererRef.current;
    const payload = options.payload;
    const live = liveRef.current;
    live.collapsed = options.collapsedCommunities;
    if (!graph || !renderer || !payload) return;

    // Drop every existing meta-node (its aggregated edges go with it).
    const stale: string[] = [];
    graph.forEachNode((nodeId, attrs) => {
      if (attrs.kind === 'community') stale.push(nodeId);
    });
    for (const nodeId of stale) graph.dropNode(nodeId);

    if (options.collapsedCommunities.size > 0) {
      const centroids = communityCentroids(payload.nodes, payload.positions);
      const communityByNodeId = new Map<string, string>();
      for (const node of payload.nodes) communityByNodeId.set(node.id, node.communityName);

      for (const name of options.collapsedCommunities) {
        const centroid = centroids.get(name);
        if (!centroid) continue;
        graph.addNode(communityNodeId(name), {
          x: centroid.x,
          y: centroid.y,
          size: sizeForMemberCount(centroid.count),
          label: `${name} (${centroid.count})`,
          color: communityColor(centroid.community, resolveToken),
          community: centroid.community,
          communityName: name,
          degree: Number.POSITIVE_INFINITY,
          kind: 'community',
          memberCount: centroid.count,
        });
      }

      for (const edge of aggregateCommunityEdges(
        payload.links,
        communityByNodeId,
        options.collapsedCommunities,
      )) {
        if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
        graph.addEdgeWithKey(edge.key, edge.source, edge.target, {
          relation: edge.relations[0] ?? 'aggregate',
          weight: edge.weight,
          confidence: edge.confidence,
          sourceId: edge.source,
          targetId: edge.target,
          sourceCommunity: graph.getNodeAttribute(edge.source, 'communityName'),
          targetCommunity: graph.getNodeAttribute(edge.target, 'communityName'),
          kind: 'aggregate',
          relations: edge.relations,
          count: edge.count,
        });
      }
    }

    // The highlight's neighbourhoods may now run through meta-nodes.
    live.highlight = computeHighlightSets({
      searchMatchIds: live.searchMatchIds,
      selectedNodeId: live.selectedNodeId,
      hoveredNodeId: null,
      neighborsOf: (id) => (graph.hasNode(id) ? graph.neighbors(id) : []),
    });
    renderer.refresh();
  }, [options.collapsedCommunities, options.payload]);
}
