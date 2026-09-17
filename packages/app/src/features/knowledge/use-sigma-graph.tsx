import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MultiDirectedGraph } from 'graphology';
import Sigma from 'sigma';
import type { EdgeProgramType } from 'sigma/rendering';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { resolveSystemMotion, useAppearanceStore } from '../../store/appearance-store';
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
  communityNameFromNodeId,
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
import { useKnowledgeFiltersStore } from './knowledge-filters-store';
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
import { LayoutTransition } from './knowledge-layout-transition';
import type {
  KnowledgeRenderer,
  KnowledgeRendererCallbacks,
  KnowledgeVariantProps,
} from './renderer-contract';
import { useKnowledgeRenderer } from './use-knowledge-renderer';
import EdgeCurveProgram from './variants/knowledge-edge-curve-program';
import { computeOrbitPositions, type OrbitPosition } from './variants/knowledge-orbit-layout';

/**
 * Raw `sigma` + a thin renderer around it, per the phase doc's Decision 6 —
 * not `@react-sigma/core`, which is one more dependency for lifecycle
 * management this needs roughly forty lines of, and which knows nothing
 * about Phase 84's visibility gates or the app's own theme tokens either
 * way.
 *
 * Phase 89 Theme A moved this from a bespoke hook (`useSigmaGraph`, driving
 * sigma directly off four `useEffect`s in `knowledge-canvas.tsx`) behind the
 * `KnowledgeRenderer` contract (`renderer-contract.ts`) — an imperative
 * `mount`/`applyFilters`/`applyHighlight`/`focusNode`/`setCollapsed`/
 * `resize`/`setPaused`/`playIntro` object, driven now by the generic
 * `use-knowledge-renderer.ts` adapter instead of bespoke wiring per variant.
 * `SigmaKnowledgeRenderer` below is that object; every DECISION it still
 * makes (who's visible, what colour, when a label shows, what is lit, how
 * far a pulse overshoots, which edges a collapsed community folds into) is
 * still a plain function imported from its own `knowledge-*.ts` module, each
 * covered by its own vitest suite with no canvas involved — none of that
 * moved.
 *
 * Performance shape, for a 15k-node / 36k-edge graph, is unchanged from
 * before this move:
 *   - the graph is built ONCE per payload; filters, selection, search and
 *     collapse all flow through `this.live` and a `refresh()`, never a
 *     rebuild;
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
/** How long a layout switch's tween takes end to end (Phase 89 Theme E) — long enough to read as "the graph reorganised," short enough that switching twice in a row doesn't feel laggy. */
const LAYOUT_TRANSITION_MS = 600;

/**
 * Phase 89 Theme D — the four sigma "looks". `KnowledgeVariantProps` carries
 * no `look` field (the registry's four entries all resolve to this same
 * module, `renderer-contract.ts`'s own docblock explains why), so the
 * mounted component reads it directly off the store `rendererVariant` is
 * persisted through — the same field the pill bar itself writes.
 */
type LookId = 'atlas' | 'constellation' | 'orbit' | 'clusters';
const DEFAULT_LOOK: LookId = 'atlas';
function normalizeLook(id: string): LookId {
  return id === 'constellation' || id === 'orbit' || id === 'clusters' ? id : 'atlas';
}

/** sigma's own defaults, named so Constellation's own values below read as a deliberate departure from them, not magic numbers. */
const DEFAULT_LABEL_DENSITY = 0.6;
const DEFAULT_LABEL_GRID_CELL_SIZE = 90;

/** Constellation: "tighter label density" — fewer candidate cells, and a higher degree floor, so a dark, busy graph doesn't drown in text. */
const CONSTELLATION_LABEL_DENSITY = 0.3;
const CONSTELLATION_LABEL_GRID_CELL_SIZE = 150;
const CONSTELLATION_LABEL_DEGREE_THRESHOLD = 6;
/** Constellation: "lower ambient edge alpha" — a flat multiplier on the same `alphaForWeight` curve every look shares, preserving the premultiplied-alpha invariant (the scalar is scaled before `withAlpha` premultiplies it, never after). */
const CONSTELLATION_EDGE_ALPHA_SCALE = 0.6;
/**
 * Constellation: "a glow pass on high-degree nodes" — reducer-only (settings
 * + reducers, no graph mutation, per the phase doc's "only Orbit and
 * Clusters touch the graph's own attributes"): a hub is rendered through the
 * same brightening path a focused node already uses (`nodeColorForState`'s
 * `isFocus`), plus a size boost, rather than a second WebGL draw pass per
 * node — there is no bloom shader here, only "the brightest, biggest paint
 * this file already has, unconditionally, for the graph's own top slice of
 * hubs."
 */
const CONSTELLATION_GLOW_PERCENTILE = 0.95;
const CONSTELLATION_GLOW_SIZE_SCALE = 1.18;

/** Orbit's entrance tween, in ms — short enough to read as a transition, not a wait. */
const ORBIT_TWEEN_MS = 500;

function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Phase 46's rule: reduced motion means skip entirely, not shorten — mirrors `use-title-typewriter.ts`'s own local check (no shared helper for this one call site either). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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

type LiveState = {
  filters: KnowledgeFilterState;
  selectedNodeId: string | null;
  collapsed: ReadonlySet<string>;
  paused: boolean;
  searchMatchIds: ReadonlySet<string>;
  /** Search + selection: dims everything outside it. Recomputed by `recomputeHighlight`. */
  highlight: HighlightSets;
  /** Hover: lights a neighbourhood WITHOUT dimming the rest, so it can be a partial repaint. */
  hoveredNodeId: string | null;
  hoverLitIds: ReadonlySet<string>;
  hoveredEdgeId: string | null;
  /** Repainted in place on a theme change — see the `MutationObserver` in `mount`. */
  theme: ThemeColors;
  pulses: PulseTracker;
  pulseScales: ReadonlyMap<string, number>;
  /** Theme B — the expand-from-a-core intro. Resolved fresh at the top of every `mount()`, so a mid-session motion-preference change is picked up by the next fresh payload without becoming a class field written from outside `mount`. */
  reducedMotion: boolean;
  intro: IntroTracker;
  /** 1 outside an intro; ramps 0→1 while edges fade in behind the bursting nodes. */
  introEdgeAlpha: number;
  introStartedAt: number;
  /** Theme D's four looks — `atlas` reproduces Theme A's own rendering unchanged. */
  look: LookId;
  /** Constellation's glow threshold — the payload's own 95th-percentile degree, recomputed per `mount`. */
  glowDegreeThreshold: number;
};

/** Mirrors `useResolvedMotion()` (`appearance-store.ts`) without the hook machinery — `mount()` is called imperatively, outside React's render, so it reads the store directly instead of subscribing to it. */
function resolveReducedMotion(): boolean {
  const motion = useAppearanceStore.getState().motion;
  return motion === 'system' ? resolveSystemMotion() === 'reduced' : motion === 'reduced';
}

function initialLiveState(): LiveState {
  return {
    filters: {
      query: '',
      relations: new Set(),
      minWeight: 0,
      minConfidence: 0,
      hiddenCommunities: new Set(),
    },
    selectedNodeId: null,
    collapsed: new Set(),
    paused: false,
    searchMatchIds: new Set(),
    highlight: EMPTY_HIGHLIGHT,
    hoveredNodeId: null,
    hoverLitIds: new Set(),
    hoveredEdgeId: null,
    theme: {
      edgeBase: 'rgb(136, 136, 136)',
      accent: 'rgb(99, 102, 241)',
      label: 'rgb(230, 230, 230)',
      hoverBox: 'rgb(20, 20, 24)',
      hoverBorder: 'rgb(60, 60, 68)',
    },
    pulses: new PulseTracker(),
    pulseScales: new Map(),
    reducedMotion: false,
    intro: new IntroTracker(),
    introEdgeAlpha: 1,
    introStartedAt: 0,
    look: DEFAULT_LOOK,
    glowDegreeThreshold: Number.POSITIVE_INFINITY,
  };
}

/**
 * The sigma `KnowledgeRenderer`. One instance per mounted `<KnowledgeCanvas>`
 * (created once by `SigmaKnowledgeCanvas`, below, and reused across
 * `mount`/`dispose` pairs for the lifetime of that component) — `mount`
 * rebuilds the graph and sigma instance from scratch on every new payload
 * identity, exactly as the effect it replaces did.
 */
export class SigmaKnowledgeRenderer implements KnowledgeRenderer {
  private sigma: Sigma<NodeAttrs, EdgeAttrs> | null = null;
  private graph: MultiDirectedGraph<NodeAttrs, EdgeAttrs> | null = null;
  private container: HTMLDivElement | null = null;
  private payload: KnowledgeGraphPayload | null = null;
  private callbacks: KnowledgeRendererCallbacks | null = null;
  private live: LiveState = initialLiveState();
  private pulseFrame: number | null = null;
  /** Theme B — the intro burst's own rAF loop, cancelled in `dispose()` exactly like `pulseFrame`. */
  private introFrame: number | null = null;
  /** All edge ids at mount time, cached once (not recomputed per intro frame) — `introTick` needs the whole set once the edge fade crosses its threshold. */
  private introEdgeIds: string[] = [];
  private pendingClick: ReturnType<typeof setTimeout> | null = null;
  private repaintObserver: MutationObserver | undefined;
  private containerResizeObserver: ResizeObserver | undefined;
  /** Phase 89 Theme E's layout-switch tween — one instance reused across every `retarget()` call for this mount. */
  private layoutTransition = new LayoutTransition();
  private layoutFrame: number | null = null;
  /** Orbit's "home" to tween back to — the payload's own ForceAtlas2 coordinates, captured once at `mount`. */
  private homePositions: Map<string, OrbitPosition> | null = null;
  /** Orbit's own layout, computed once per payload and cached — `computeOrbitPositions` is pure and deterministic, so recomputing on every look switch would be wasted work, not a different answer. */
  private orbitPositionsCache: Map<string, OrbitPosition> | null = null;
  private posTweenFrame: number | null = null;

  mount(
    container: HTMLDivElement,
    payload: KnowledgeGraphPayload,
    callbacks: KnowledgeRendererCallbacks,
  ): void {
    // A payload change always follows a `dispose()` from `use-knowledge-renderer.ts`'s
    // own effect cleanup, but guard anyway — a stray double-mount should
    // never leak a second sigma instance onto the same container.
    if (this.sigma) this.dispose();

    this.container = container;
    this.payload = payload;
    this.callbacks = callbacks;

    const graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();
    const degrees = computeDegrees(payload.links);
    this.live = initialLiveState();
    const live = this.live;
    live.theme = readThemeColors();
    live.reducedMotion = resolveReducedMotion();

    // Constellation's glow threshold — the payload's own 95th-percentile
    // degree, so "high-degree" scales with the repo instead of a fixed
    // absolute count that means nothing on a 200-node repo and everything
    // on a 15k-node one.
    const degreeValues = [...degrees.values()].sort((a, b) => a - b);
    live.glowDegreeThreshold =
      degreeValues.length > 0
        ? (degreeValues[Math.min(degreeValues.length - 1, Math.floor(degreeValues.length * CONSTELLATION_GLOW_PERCENTILE))] ??
          Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;

    // Orbit's "home" — captured from the payload directly (not read back off
    // the graph later, which Orbit's own tween mutates) so leaving Orbit
    // always has an exact Atlas coordinate to return to.
    this.homePositions = new Map(
      payload.nodes.map((node) => [node.id, payload.positions[node.id] ?? { x: 0, y: 0 }]),
    );
    this.orbitPositionsCache = null;

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
        labelDensity: DEFAULT_LABEL_DENSITY,
        labelGridCellSize: DEFAULT_LABEL_GRID_CELL_SIZE,
        // Registered ALONGSIDE the default `line` program (sigma's own
        // `EdgeRectangleProgram`, merged in automatically), never in place
        // of it — Atlas/Orbit/Clusters never route an edge through `curve`,
        // so this costs them nothing. Constellation's own edge reducer
        // (below) is the only thing that ever sets `type: 'curve'`; see
        // `knowledge-edge-curve-program.ts`'s own docblock for why a `type`
        // switch, not a settings swap, is what lets a look change without
        // tearing down this `Sigma` instance.
        //
        // The cast is the same shape sigma's own `DEFAULT_EDGE_PROGRAM_CLASSES`
        // sidesteps internally: `EdgeCurveProgram` is deliberately NOT
        // parameterized over `NodeAttrs`/`EdgeAttrs` (its own docblock says
        // why), so its constructor's `renderer: Sigma<Attributes, ...>`
        // parameter is structurally wider than, not narrower than, what
        // `Settings<NodeAttrs, EdgeAttrs>` asks for — safe to widen back,
        // not a real type hole (every method the two classes need to agree
        // on — `getDefinition`/`processVisibleItem`/`setUniforms` — takes no
        // N/E/G-typed parameter at all; only the unused `renderer` field's
        // declared type differs).
        edgeProgramClasses: { curve: EdgeCurveProgram as unknown as EdgeProgramType<NodeAttrs, EdgeAttrs> },
        labelFont: getComputedStyle(document.body).fontFamily || 'sans-serif',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: live.theme.label },
        edgeLabelColor: { color: live.theme.label },
        edgeLabelFont: getComputedStyle(document.body).fontFamily || 'sans-serif',
        edgeLabelSize: 10,
        defaultDrawNodeHover: (context, data, settings) =>
          drawThemedNodeHover(context, data, settings, {
            box: this.live.theme.hoverBox,
            border: this.live.theme.hoverBorder,
          }),
        nodeReducer: (node, data) => {
          const live = this.live;
          const collapsedMember = data.kind === 'node' && live.collapsed.has(data.communityName);
          const visible = !collapsedMember && isCommunityVisible(data.communityName, live.filters);
          const paint = nodePaint(node, live.highlight, live.selectedNodeId);
          const hoverLit = live.hoverLitIds.has(node);
          const dimmed = paint.dimmed && !hoverLit;
          const lit = paint.forceLabel || hoverLit;
          // Constellation's glow: the payload's own top slice of hubs paint
          // through the SAME brightening path a focused node already uses
          // (Decision: reducer-only, no second draw pass — see the constant's
          // own docblock) — never while dimmed, so a search/selection focus
          // elsewhere still wins.
          const constellationGlow =
            live.look === 'constellation' &&
            data.kind === 'node' &&
            data.degree >= live.glowDegreeThreshold &&
            !dimmed;
          const isFocus = live.highlight.focusIds.has(node) || hoverLit || constellationGlow;
          const isNeighbor = live.highlight.neighborIds.has(node);
          const color = nodeColorForState(data.color, { dimmed, isFocus, isNeighbor });
          const labelDegreeThreshold =
            live.look === 'constellation' ? CONSTELLATION_LABEL_DEGREE_THRESHOLD : LABEL_DEGREE_THRESHOLD;
          const eligibleForLabel = data.kind === 'community' || data.degree >= labelDegreeThreshold;
          const scale = (live.pulseScales.get(node) ?? 1) * (constellationGlow ? CONSTELLATION_GLOW_SIZE_SCALE : 1);
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
          const live = this.live;
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
          const isConstellation = live.look === 'constellation';
          // The scalar is scaled BEFORE `withAlpha` premultiplies it — never
          // the premultiplied string after — preserving the invariant
          // `knowledge-canvas-colors.ts` documents.
          const restAlpha = alphaForWeight(data.weight) * (isConstellation ? CONSTELLATION_EDGE_ALPHA_SCALE : 1);
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
              : withAlpha(theme.edgeBase, restAlpha * introFade);
          return {
            ...data,
            hidden: !visible,
            size: baseSize * (emphasised ? EMPHASISED_EDGE_SCALE : 1) * scale,
            color,
            // Constellation's curved edges — see `knowledge-edge-curve-program.ts`
            // for why a per-item `type` switch, not a settings change, is
            // what lets this happen without rebuilding the `Sigma` instance.
            type: isConstellation ? 'curve' : 'line',
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
    this.sigma = sigma;
    this.graph = graph;
    // Theme B: the whole edge id set, cached once at mount rather than
    // recomputed every intro frame — `introTick` needs it only once the
    // edge fade crosses `INTRO_TIMING.edgeFadeMs`.
    this.introEdgeIds = graph.edges();
    if (shouldAnimateIntro) this.introFrame = requestAnimationFrame(this.introTick);

    sigma.on('enterNode', ({ node }) => {
      this.setHoveredNode(node);
      this.pulse(node, PULSES.nodeHoverIn);
    });
    sigma.on('leaveNode', ({ node }) => {
      this.setHoveredNode(null);
      this.pulse(node, PULSES.nodeHoverOut);
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
    sigma.on('clickNode', ({ node }) => {
      this.pulse(node, PULSES.nodeClick);
      if (this.pendingClick !== null) clearTimeout(this.pendingClick);
      this.pendingClick = setTimeout(() => {
        this.pendingClick = null;
        this.callbacks?.onNodeClick(node);
      }, sigma.getSetting('doubleClickTimeout'));
    });
    sigma.on('doubleClickNode', ({ node, preventSigmaDefault }) => {
      // sigma's own double-click zooms the camera; ours collapses/expands.
      preventSigmaDefault();
      if (this.pendingClick !== null) {
        clearTimeout(this.pendingClick);
        this.pendingClick = null;
      }
      this.callbacks?.onNodeDoubleClick(node);
    });
    sigma.on('enterEdge', ({ edge }) => {
      this.live.hoveredEdgeId = edge;
      this.pulse(edge, PULSES.edgeHoverIn);
      container.style.cursor = 'pointer';
    });
    sigma.on('leaveEdge', ({ edge }) => {
      if (this.live.hoveredEdgeId === edge) this.live.hoveredEdgeId = null;
      this.pulse(edge, PULSES.edgeHoverOut);
      container.style.cursor = '';
    });
    sigma.on('clickEdge', ({ edge }) => {
      this.pulse(edge, PULSES.edgeClick);
    });

    // Theme D: "reads the same CSS custom properties every other surface
    // does and repaints on theme change — no hardcoded palette." Node colour
    // is baked into each node's own attributes (not recomputed every frame,
    // unlike the edge reducer's `live.theme`), so a theme flip has to walk
    // the graph and rewrite it — the same `MutationObserver` on `<html
    // class>` `app.tsx`'s `useWindowBackgroundSync` already uses for the
    // window-chrome colour, there being no theme-change event to listen for
    // instead. Label colour is a sigma setting, swapped in place.
    if (typeof MutationObserver !== 'undefined') {
      this.repaintObserver = new MutationObserver(() => {
        // O(1) per node — `community` lives on the node's own attributes
        // (set when it was added, above), not a re-scan of `payload.nodes`.
        graph.forEachNode((nodeId, attrs) => {
          graph.setNodeAttribute(nodeId, 'color', communityColor(attrs.community, resolveToken));
        });
        const theme = readThemeColors();
        this.live.theme = theme;
        sigma.setSetting('labelColor', { color: theme.label });
        sigma.setSetting('edgeLabelColor', { color: theme.label });
        sigma.refresh();
      });
      this.repaintObserver.observe(document.documentElement, {
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
    // regardless of what caused it. Kept internal to the sigma renderer
    // (rather than driven by `resize()` from the generic adapter) — the
    // contract's own `resize()` stays a no-op passthrough for this variant.
    if (typeof ResizeObserver !== 'undefined') {
      this.containerResizeObserver = new ResizeObserver(() => {
        sigma.refresh();
      });
      this.containerResizeObserver.observe(container);
    }
  }

  dispose(): void {
    if (this.pendingClick !== null) clearTimeout(this.pendingClick);
    if (this.pulseFrame !== null) cancelAnimationFrame(this.pulseFrame);
    if (this.introFrame !== null) cancelAnimationFrame(this.introFrame);
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutTransition.clear();
    if (this.posTweenFrame !== null) cancelAnimationFrame(this.posTweenFrame);
    this.containerResizeObserver?.disconnect();
    this.repaintObserver?.disconnect();
    if (this.container) this.container.style.cursor = '';
    this.sigma?.kill();
    this.sigma = null;
    this.graph = null;
    this.container = null;
    this.payload = null;
    this.callbacks = null;
    this.pulseFrame = null;
    this.introFrame = null;
    this.pendingClick = null;
    this.layoutFrame = null;
    this.repaintObserver = undefined;
    this.containerResizeObserver = undefined;
    this.posTweenFrame = null;
    this.homePositions = null;
    this.orbitPositionsCache = null;
  }

  applyFilters(filters: KnowledgeFilterState): void {
    this.live.filters = filters;
    this.live.searchMatchIds =
      this.payload && filters.query ? searchMatches(this.payload.nodes, filters.query) : new Set();
    this.recomputeHighlight();
    this.sigma?.refresh();
  }

  applyHighlight(selectedNodeId: string | null): void {
    this.live.selectedNodeId = selectedNodeId;
    this.recomputeHighlight();
    this.sigma?.refresh();
  }

  /**
   * Switch which of the four sigma looks is active — NOT part of the
   * `KnowledgeRenderer` contract (`renderer-contract.ts` is unchanged by
   * this theme, per its own docblock's invitation to grow only the registry
   * array), so this is called directly by `SigmaKnowledgeCanvas` below, the
   * one place that already holds a concrete `SigmaKnowledgeRenderer`
   * instance rather than the interface. A no-op if the look hasn't actually
   * changed (a render that reads the same store value twice is routine).
   *
   * `labelDensity`/`labelGridCellSize` are ordinary sigma *settings* —
   * `setSetting` already repaints `labelColor` on a theme flip elsewhere in
   * this file, so mutating them here at runtime is the same supported path,
   * not a new one. `edgeProgramClasses` is deliberately NOT touched here:
   * it is fixed at construction (`mount`, above) and switched per-ITEM by
   * the edge reducer's own `type` field instead — see
   * `knowledge-edge-curve-program.ts` for why.
   */
  setLook(nextLook: string): void {
    const next = normalizeLook(nextLook);
    const previous = this.live.look;
    if (previous === next) return;
    this.live.look = next;

    const sigma = this.sigma;
    sigma?.setSetting('labelDensity', next === 'constellation' ? CONSTELLATION_LABEL_DENSITY : DEFAULT_LABEL_DENSITY);
    sigma?.setSetting(
      'labelGridCellSize',
      next === 'constellation' ? CONSTELLATION_LABEL_GRID_CELL_SIZE : DEFAULT_LABEL_GRID_CELL_SIZE,
    );

    // Orbit only ever touches the graph's own x/y attributes (Decision:
    // "only Orbit and Clusters touch the graph's own attributes") — entering
    // tweens from the Atlas coordinates captured at `mount`; leaving tweens
    // straight back to them, so a user bouncing between looks always lands
    // on the same Atlas layout Atlas itself renders.
    if (next === 'orbit') {
      this.beginPositionTween(this.resolveOrbitPositions());
    } else if (previous === 'orbit') {
      this.beginPositionTween(this.homePositions ?? new Map());
    }

    // A full (non-partial) refresh: the reducers' own output (curve `type`,
    // glow, label density) depends on `live.look` and needs every item
    // reprocessed, not just the handful a partial `repaint` would touch.
    sigma?.refresh();
  }

  /** Orbit's own layout, computed once per payload and cached (`computeOrbitPositions` is pure). */
  private resolveOrbitPositions(): Map<string, OrbitPosition> {
    if (this.orbitPositionsCache) return this.orbitPositionsCache;
    const payload = this.payload;
    if (!payload) return new Map();
    const positions = computeOrbitPositions(payload.nodes, payload.positions);
    this.orbitPositionsCache = positions;
    return positions;
  }

  /**
   * Tweens every named node from its CURRENT graph position to `target`,
   * mutating graphology's own `x`/`y` attributes and re-indexing once per
   * frame via a plain `sigma.refresh()` (positions changed, so — unlike the
   * pulse loop's `repaint` — this cannot pass `skipIndexation: true`).
   * `paused` (Phase 84) and `prefers-reduced-motion` (Phase 46) both snap
   * straight to `target` instead of animating — motion is skipped, not
   * shortened.
   */
  private beginPositionTween(target: ReadonlyMap<string, OrbitPosition>): void {
    const graph = this.graph;
    if (!graph) return;
    if (this.posTweenFrame !== null) {
      cancelAnimationFrame(this.posTweenFrame);
      this.posTweenFrame = null;
    }

    if (this.live.paused || prefersReducedMotion()) {
      for (const [id, pos] of target) {
        if (graph.hasNode(id)) {
          graph.setNodeAttribute(id, 'x', pos.x);
          graph.setNodeAttribute(id, 'y', pos.y);
        }
      }
      this.sigma?.refresh();
      return;
    }

    const from = new Map<string, OrbitPosition>();
    graph.forEachNode((id, attrs) => {
      if (target.has(id)) from.set(id, { x: attrs.x, y: attrs.y });
    });
    const start = performance.now();
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / ORBIT_TWEEN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const [id, to] of target) {
        if (!graph.hasNode(id)) continue;
        const source = from.get(id) ?? to;
        graph.setNodeAttribute(id, 'x', source.x + (to.x - source.x) * eased);
        graph.setNodeAttribute(id, 'y', source.y + (to.y - source.y) * eased);
      }
      this.sigma?.refresh();
      this.posTweenFrame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.posTweenFrame = requestAnimationFrame(tick);
  }

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
  focusNode(nodeId: string | null): void {
    const sigma = this.sigma;
    const graph = this.graph;
    if (!sigma || !graph || !nodeId || !graph.hasNode(nodeId)) return;

    const displayData = sigma.getNodeDisplayData(nodeId);
    if (!displayData) return;
    const { x, y } = displayData;
    if (this.live.paused) {
      sigma.getCamera().setState({ x, y, ratio: FOCUS_CAMERA_RATIO });
    } else {
      void sigma
        .getCamera()
        .animate({ x, y, ratio: FOCUS_CAMERA_RATIO }, { duration: FOCUS_ANIMATION_MS });
    }
  }

  // Meta-nodes and their aggregated edges are the ONE thing that mutates the
  // graph after build — added for every collapsed community, dropped for
  // every expanded one — and they are rebuilt wholesale from
  // `aggregateCommunityEdges` on each change rather than diffed (see that
  // function's docblock for why). Member nodes and their raw edges are never
  // removed: the reducers hide them while their community is collapsed, so
  // expanding is instant and loses nothing.
  setCollapsed(collapsedCommunities: ReadonlySet<string>): void {
    const graph = this.graph;
    const sigma = this.sigma;
    const payload = this.payload;
    this.live.collapsed = collapsedCommunities;
    if (!graph || !sigma || !payload) return;

    // Drop every existing meta-node (its aggregated edges go with it).
    const stale: string[] = [];
    graph.forEachNode((nodeId, attrs) => {
      if (attrs.kind === 'community') stale.push(nodeId);
    });
    for (const nodeId of stale) graph.dropNode(nodeId);

    if (collapsedCommunities.size > 0) {
      const centroids = communityCentroids(payload.nodes, payload.positions);
      const communityByNodeId = new Map<string, string>();
      for (const node of payload.nodes) communityByNodeId.set(node.id, node.communityName);

      for (const name of collapsedCommunities) {
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
        collapsedCommunities,
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
    this.recomputeHighlight();
    sigma.refresh();
  }

  /** No-op passthrough — sigma owns its own `ResizeObserver` (`mount`, above). */
  resize(): void {
    this.sigma?.refresh();
  }

  setPaused(paused: boolean): void {
    this.live.paused = paused;
  }

  /**
   * Theme A ships sigma with no intro — nodes render at their final position
   * on first paint, same as before this seam existed. Theme B implements
   * this for real; every variant declares it (Decision 4) so the pill bar
   * never has to special-case one that does not.
   */
  playIntro(): void {
    // Intentionally empty.
  }

  /**
   * A layout switch under the SAME graph (Phase 89 Theme E) — tweens every
   * node from its current `x`/`y` to `positions[id]`, then updates `payload`
   * in place so a later `setCollapsed` (which reads `payload.positions` for
   * its meta-node centroids) sees the new layout too, not the one this
   * mount started with.
   *
   * `paused` (Phase 84: snap, don't animate) and `prefers-reduced-motion`
   * (Phase 46: skip entirely) both write positions straight through with no
   * rAF loop at all, exactly like `pulse()`'s own `durationMs: 0` path for
   * `paused` — the one difference is `prefers-reduced-motion` is checked
   * here rather than baked into a preset, since it is a global media query,
   * not a per-call preset field.
   */
  retarget(positions: Readonly<Record<string, { x: number; y: number }>>): void {
    const graph = this.graph;
    const sigma = this.sigma;
    if (!graph || !sigma) return;

    if (this.payload) this.payload = { ...this.payload, positions };

    if (this.live.paused || prefersReducedMotion()) {
      graph.forEachNode((id) => {
        const to = positions[id];
        if (!to) return;
        graph.setNodeAttribute(id, 'x', to.x);
        graph.setNodeAttribute(id, 'y', to.y);
      });
      sigma.refresh();
      return;
    }

    const from = new Map<string, { x: number; y: number }>();
    graph.forEachNode((id, attrs) => from.set(id, { x: attrs.x, y: attrs.y }));
    this.layoutTransition.start(from, positions, performance.now(), LAYOUT_TRANSITION_MS);
    if (this.layoutFrame === null) this.layoutFrame = requestAnimationFrame(this.layoutTick);
  }

  // --- Partial repaint helpers -------------------------------------------
  // Everything below repaints only the items it names, through sigma's
  // `partialGraph` refresh (`skipIndexation`: x/y untouched). The full
  // `refresh()` calls above are reserved for the things that genuinely
  // change every item: a filter, the selection's dimming, a collapse, a
  // theme flip.
  private repaint(nodes: Iterable<string>, edges: Iterable<string>): void {
    const graph = this.graph;
    const sigma = this.sigma;
    if (!graph || !sigma) return;
    const nodeList = [...nodes].filter((id) => graph.hasNode(id));
    const edgeList = [...edges].filter((id) => graph.hasEdge(id));
    if (nodeList.length === 0 && edgeList.length === 0) return;
    try {
      sigma.refresh({ partialGraph: { nodes: nodeList, edges: edgeList }, skipIndexation: true });
    } catch {
      sigma.refresh();
    }
  }

  private incidentEdges(nodeId: string): string[] {
    const graph = this.graph;
    return graph?.hasNode(nodeId) ? graph.edges(nodeId) : [];
  }

  // Theme B — the intro burst's own rAF loop, alive only while the burst or
  // the edge fade is still in flight, started once from `mount()` only when
  // that mount's payload was fresh enough to animate. Unlike `pulseTick`,
  // this one NEVER restarts mid-flight: a fresh burst only ever begins from
  // `mount()` running again on a new payload, which already tore the
  // previous renderer state down via `dispose()`.
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
  private introTick = (): void => {
    this.introFrame = null;
    const live = this.live;
    const graph = this.graph;
    const sigma = this.sigma;
    if (!graph || !sigma) return;
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
          partialGraph: { nodes, edges: edgesNeedRepaint ? this.introEdgeIds : [] },
          skipIndexation: false,
        });
      } catch {
        sigma.refresh();
      }
    }
    if (sample.animating || stillFadingEdges)
      this.introFrame = requestAnimationFrame(this.introTick);
  };

  // One rAF loop, alive only while a tween is in flight. Each frame samples
  // the tracker and repaints exactly the pulsing items. `paused` (the window
  // is blurred, Phase 84) snaps every pulse to its resting scale instead.
  private pulseTick = (): void => {
    this.pulseFrame = null;
    const live = this.live;
    const graph = this.graph;
    const sample = live.pulses.sample(performance.now());
    live.pulseScales = sample.scales;
    const touched = new Set<string>([...sample.scales.keys(), ...sample.finished]);
    const nodes: string[] = [];
    const edges: string[] = [];
    for (const id of touched) {
      if (graph?.hasNode(id)) nodes.push(id);
      else if (graph?.hasEdge(id)) edges.push(id);
    }
    this.repaint(nodes, edges);
    if (sample.animating) this.pulseFrame = requestAnimationFrame(this.pulseTick);
  };

  private pulse(id: string, preset: { to: number; durationMs: number; overshoot: number }): void {
    const live = this.live;
    live.pulses.start(id, performance.now(), live.paused ? { ...preset, durationMs: 0 } : preset);
    if (this.pulseFrame === null) this.pulseFrame = requestAnimationFrame(this.pulseTick);
  }

  // One rAF loop, alive only while a layout tween is in flight (`retarget`,
  // above). Writes x/y straight onto the graphology attributes and asks
  // sigma to reindex — `skipIndexation: false`, unlike the pulse loop's own
  // `repaint()`, because these ARE spatial coordinates the quadtree needs to
  // know moved (Theme B's own measurement: `skipIndexation: false` cost
  // 35.1ms vs 49.0ms full-refresh with ~15% of nodes moving — a partial
  // refresh that skipped reindexing would leave hit-testing pointing at
  // stale positions).
  private layoutTick = (): void => {
    this.layoutFrame = null;
    const graph = this.graph;
    const sigma = this.sigma;
    if (!graph || !sigma) return;
    const sample = this.layoutTransition.sample(performance.now());
    const touched: string[] = [];
    for (const [id, pos] of sample.positions) {
      if (!graph.hasNode(id)) continue;
      graph.setNodeAttribute(id, 'x', pos.x);
      graph.setNodeAttribute(id, 'y', pos.y);
      touched.push(id);
    }
    if (touched.length > 0) {
      try {
        sigma.refresh({ partialGraph: { nodes: touched, edges: [] }, skipIndexation: false });
      } catch {
        sigma.refresh();
      }
    }
    if (sample.animating) this.layoutFrame = requestAnimationFrame(this.layoutTick);
  };

  // A node's hover lights its one-hop neighbourhood and incident edges — a
  // repaint of a few hundred items at most, never the whole graph, which is
  // what keeps sweeping the pointer across a dense cluster smooth.
  private setHoveredNode(nodeId: string | null): void {
    const live = this.live;
    const graph = this.graph;
    if (live.hoveredNodeId === nodeId) return;
    const previous = live.hoveredNodeId;
    const previousLit = live.hoverLitIds;
    const previousEdges = previous ? this.incidentEdges(previous) : [];
    live.hoveredNodeId = nodeId;
    const lit = new Set<string>();
    if (nodeId && graph?.hasNode(nodeId)) {
      lit.add(nodeId);
      for (const neighbor of graph.neighbors(nodeId)) lit.add(neighbor);
    }
    live.hoverLitIds = lit;
    this.repaint(new Set([...previousLit, ...lit]), [
      ...previousEdges,
      ...(nodeId ? this.incidentEdges(nodeId) : []),
    ]);
  }

  /** Search + selection: dims everything outside it. Hover is deliberately excluded — `hoveredNodeId: null` — so it can be a partial repaint (`repaint`, above) instead of folding into this full-graph dimming pass. */
  private recomputeHighlight(): void {
    const live = this.live;
    const graph = this.graph;
    live.highlight = computeHighlightSets({
      searchMatchIds: live.searchMatchIds,
      selectedNodeId: live.selectedNodeId,
      hoveredNodeId: null,
      neighborsOf: (id) => (graph?.hasNode(id) ? graph.neighbors(id) : []),
    });
  }
}

/**
 * The sigma variant's own mounted component — what EVERY entry in
 * `renderer-contract.ts`'s `VARIANTS` resolves to (Theme A's own `sigma`
 * entry, and Theme D's `atlas`/`constellation`/`orbit`/`clusters`, which all
 * share `load: loadSigma`). A stable `SigmaKnowledgeRenderer` instance lives
 * for this component's whole lifetime (`useRef`'s lazy-init form, not
 * `useMemo`, since a renderer must never silently disappear under React's
 * "may re-run a memo" allowance); `use-knowledge-renderer.ts` drives it
 * through the four effects it generalises from this file's own four, before
 * this move. Theme D adds a fifth: `look`, read directly off the store
 * `KnowledgeVariantProps` carries no field for (`renderer-contract.ts`'s own
 * docblock explains why), pushed to the renderer via `setLook` — a method
 * outside the `KnowledgeRenderer` contract, called here because this is the
 * one place already holding the concrete class rather than the interface.
 */
export default function SigmaKnowledgeCanvas({
  payload,
  filters,
  focusNodeId,
  selectedNodeId,
  collapsedCommunities,
  onNodeClick,
  onNodeDoubleClick,
  paused,
}: KnowledgeVariantProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SigmaKnowledgeRenderer | null>(null);
  if (rendererRef.current === null) rendererRef.current = new SigmaKnowledgeRenderer();

  const look = normalizeLook(useKnowledgeFiltersStore((s) => s.rendererVariant));

  // Clusters' own default-collapsed state — LOCAL to this component, not
  // written through to `knowledge-filters-store.ts`'s shared
  // `collapsedCommunities` (Decision: the phase doc's "communities collapsed
  // by default" describes Clusters' own rendering, not a side effect that
  // would leak into Atlas/Constellation/Orbit reading the same global set
  // the next time the user switches back to them). Reset per payload
  // identity, same trigger `use-knowledge-renderer.ts` mounts the renderer
  // on.
  const [clustersExpanded, setClustersExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setClustersExpanded(new Set());
  }, [payload]);

  const communityByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of payload.nodes) map.set(node.id, node.communityName);
    return map;
  }, [payload]);
  const communityNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of payload.nodes) names.add(node.communityName);
    return [...names];
  }, [payload]);

  const effectiveCollapsedCommunities = useMemo(() => {
    if (look !== 'clusters') return collapsedCommunities;
    return new Set(communityNames.filter((name) => !clustersExpanded.has(name)));
  }, [look, collapsedCommunities, communityNames, clustersExpanded]);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      if (look === 'clusters') {
        const collapsedName = communityNameFromNodeId(nodeId);
        if (collapsedName !== null) {
          setClustersExpanded((prev) => new Set(prev).add(collapsedName));
        } else {
          const communityName = communityByNodeId.get(nodeId);
          if (communityName !== undefined) {
            setClustersExpanded((prev) => {
              if (!prev.has(communityName)) return prev;
              const next = new Set(prev);
              next.delete(communityName);
              return next;
            });
          }
        }
      }
      onNodeDoubleClick(nodeId);
    },
    [look, communityByNodeId, onNodeDoubleClick],
  );

  useKnowledgeRenderer({
    containerRef,
    renderer: rendererRef.current,
    payload,
    filters,
    focusNodeId,
    selectedNodeId,
    collapsedCommunities: effectiveCollapsedCommunities,
    onNodeClick,
    onNodeDoubleClick: handleNodeDoubleClick,
    paused,
  });

  // Runs AFTER `useKnowledgeRenderer`'s own mount effect above (React fires
  // effects in the order their hooks were called), so on a fresh mount or a
  // payload/repo switch the renderer is always built at Atlas defaults
  // first, then transitioned to whatever look is actually persisted —
  // including Orbit's entrance tween, which is meant to play on every
  // mount, not only a live pill click.
  useEffect(() => {
    rendererRef.current?.setLook(look);
  }, [look, payload]);

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-canvas"
      className="h-full min-h-0 min-w-0 w-full flex-1 bg-background"
    />
  );
}
