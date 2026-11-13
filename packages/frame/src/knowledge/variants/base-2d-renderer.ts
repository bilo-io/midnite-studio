import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { communityNameFromNodeId } from '../knowledge-community-collapse';
import { communityColor } from '../knowledge-community-colors';
import type { KnowledgeFilterState } from '../knowledge-filters';
import { INTRO_TIMING, IntroTracker, introEdgeAlphaMultiplier, type IntroPoint } from '../knowledge-intro';
import { LayoutTransition } from '../knowledge-layout-transition';
import type {
  KnowledgeMountOptions,
  KnowledgeRenderer,
  KnowledgeRendererCallbacks,
} from '../renderer-contract';
import { buildModel2D, computePaint2D, type Model2D, type Node2D, type Paint2D } from './knowledge-2d-model';

/** How long a layout switch tween takes — the same figure sigma uses (`use-sigma-graph.tsx`'s `LAYOUT_TRANSITION_MS`). */
const LAYOUT_TRANSITION_MS = 600;

/** What the host hands a renderer — every browser global injected so the shared logic runs under bare vitest. */
export type Engine2DEnv = {
  prefersReducedMotion: () => boolean;
  /** `communityColor` bound to the live CSS tokens, so a theme flip is a re-read and not a rebuild. */
  colorFor: (community: number) => string;
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
};

/** Reads a `styles.css` token off `:root`, like `use-sigma-graph.tsx`'s own `resolveToken`. */
export function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The colour of a community from the host's tokens — one function, so every variant paints a community identically. */
export function liveCommunityColor(community: number): string {
  return communityColor(community, cssToken);
}

/**
 * The lifecycle every non-sigma 2D variant shares (Phase 89 Themes F-I): model building, the
 * filter/highlight paint, the expand-from-a-core intro (Theme B's `IntroTracker`), the layout
 * switch tween (Theme E's `LayoutTransition`), the Phase 84 `paused` snap and the reduced-motion
 * rule. A subclass owns ONLY its library: create it, push positions + paint into it, fly its
 * camera. That is what keeps "a variant is the same graph drawn by a different engine" true.
 */
export abstract class Base2DRenderer implements KnowledgeRenderer {
  protected container: HTMLDivElement | null = null;
  protected payload: KnowledgeGraphPayload | null = null;
  protected callbacks: KnowledgeRendererCallbacks | null = null;
  protected model: Model2D | null = null;
  protected paint: Paint2D | null = null;
  /** Where each node is drawn THIS frame — final coordinates at rest, tweened during an intro or layout switch. */
  protected positions = new Map<string, IntroPoint>();
  /** 0 at the intro's start, 1 once edges are fully faded in. */
  protected edgeScale = 1;
  protected filters: KnowledgeFilterState = {
    query: '',
    relations: new Set(),
    minWeight: 0,
    minConfidence: 0,
    hiddenCommunities: new Set(),
  };
  protected selectedNodeId: string | null = null;
  protected collapsed: ReadonlySet<string> = new Set();
  protected paused = false;
  private maxNodes = Infinity;
  private readonly intro = new IntroTracker();
  private readonly layout = new LayoutTransition();
  private introStartedAt = 0;
  private frame: number | null = null;
  private themeObserver: MutationObserver | null = null;

  constructor(protected readonly env: Engine2DEnv) {}

  // --- The library half: a subclass fills these -----------------------------------------------
  /** Create the library inside `this.container` from `this.model`. */
  protected abstract mountEngine(): void;
  protected abstract unmountEngine(): void;
  /** `this.model` was replaced (collapse change, layout switch) — re-feed the library. */
  protected abstract modelChanged(): void;
  /** Push `this.positions`, `this.paint` and `this.edgeScale` into the library and ask it to repaint. */
  protected abstract draw(): void;
  protected abstract flyTo(node: Node2D, animate: boolean): void;
  protected onResize(): void {}

  // --- KnowledgeRenderer ------------------------------------------------------------------------
  mount(
    container: HTMLDivElement,
    payload: KnowledgeGraphPayload,
    callbacks: KnowledgeRendererCallbacks,
    options: KnowledgeMountOptions,
  ): void {
    this.dispose();
    this.container = container;
    this.payload = payload;
    this.callbacks = callbacks;
    this.maxNodes = options.maxNodes;
    this.rebuildModel();
    this.mountEngine();
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      // Same trigger set as sigma's theme repaint: a theme flip changes the tokens colours resolve from.
      this.themeObserver = new MutationObserver(() => this.recolor());
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style'],
      });
    }
    this.playIntro();
  }

  dispose(): void {
    this.cancelFrame();
    this.intro.clear();
    this.layout.clear();
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    if (this.container) this.unmountEngine();
    this.container = null;
    this.model = null;
    this.paint = null;
    this.positions = new Map();
    this.edgeScale = 1;
  }

  applyFilters(filters: KnowledgeFilterState): void {
    this.filters = filters;
    this.recomputePaint();
    this.draw();
  }

  applyHighlight(selectedNodeId: string | null): void {
    this.selectedNodeId = selectedNodeId;
    this.recomputePaint();
    this.draw();
  }

  focusNode(nodeId: string | null): void {
    if (!nodeId || !this.model) return;
    const node = this.model.nodeById.get(nodeId);
    if (!node) return;
    this.flyTo(node, !this.motionOff());
  }

  setCollapsed(collapsedCommunities: ReadonlySet<string>): void {
    if (sameSet(this.collapsed, collapsedCommunities)) return;
    this.collapsed = collapsedCommunities;
    if (!this.container) return;
    this.rebuildModel();
    this.modelChanged();
    this.draw();
  }

  resize(): void {
    this.onResize();
    this.draw();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused && this.isAnimating()) this.land();
  }

  playIntro(): void {
    const model = this.model;
    if (!model) return;
    if (this.motionOff() || model.nodes.length === 0) {
      this.land();
      return;
    }
    this.layout.clear();
    const now = this.now();
    this.introStartedAt = now;
    this.edgeScale = 0;
    this.intro.start(
      model.nodes.map((node) => ({ id: node.id, to: { x: node.x, y: node.y }, degree: node.degree })),
      now,
      model.centroid,
      { durationMs: INTRO_TIMING.nodeDurationMs, staggerMs: INTRO_TIMING.staggerMs },
    );
    for (const node of model.nodes) this.positions.set(node.id, model.centroid);
    this.draw();
    this.schedule();
  }

  retarget(positions: KnowledgeGraphPayload['positions']): void {
    if (!this.payload || !this.container) return;
    const from = new Map(this.positions);
    this.payload = { ...this.payload, positions };
    this.rebuildModel();
    this.modelChanged();
    if (this.motionOff()) {
      this.draw();
      return;
    }
    this.intro.clear();
    this.edgeScale = 1;
    const target: Record<string, IntroPoint> = {};
    for (const node of this.model!.nodes) {
      target[node.id] = { x: node.x, y: node.y };
      this.positions.set(node.id, from.get(node.id) ?? target[node.id]!);
    }
    this.layout.start(from, target, this.now(), LAYOUT_TRANSITION_MS);
    this.draw();
    this.schedule();
  }

  // --- Shared plumbing --------------------------------------------------------------------------
  protected motionOff(): boolean {
    return this.paused || this.env.prefersReducedMotion();
  }

  protected now(): number {
    return this.env.now ? this.env.now() : performance.now();
  }

  /** An in-flight intro or layout tween. */
  protected isAnimating(): boolean {
    return this.intro.animating || this.layout.animating;
  }

  /** Snap every node to its final coordinates and stop animating. */
  protected land(): void {
    this.cancelFrame();
    this.intro.clear();
    this.layout.clear();
    this.edgeScale = 1;
    if (this.model) {
      for (const node of this.model.nodes) this.positions.set(node.id, { x: node.x, y: node.y });
    }
    this.draw();
  }

  /** Is `nodeId` a collapsed community's meta-node — a double-click on it expands rather than collapses. */
  protected isMetaNode(nodeId: string): boolean {
    return communityNameFromNodeId(nodeId) !== null;
  }

  private rebuildModel(): void {
    if (!this.payload) return;
    this.model = buildModel2D(this.payload, {
      maxNodes: this.maxNodes,
      collapsedCommunities: this.collapsed,
      colorFor: this.env.colorFor,
    });
    this.positions = new Map(this.model.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    this.recomputePaint();
  }

  private recomputePaint(): void {
    this.paint = this.model ? computePaint2D(this.model, this.filters, this.selectedNodeId) : null;
  }

  private recolor(): void {
    if (!this.model) return;
    for (const node of this.model.nodes) node.color = this.env.colorFor(node.community);
    this.draw();
  }

  private schedule(): void {
    if (this.frame !== null) return;
    const request = this.env.requestFrame ?? ((cb: () => void) => requestAnimationFrame(cb));
    this.frame = request(this.tick);
  }

  private cancelFrame(): void {
    if (this.frame === null) return;
    const cancel = this.env.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));
    cancel(this.frame);
    this.frame = null;
  }

  private readonly tick = (): void => {
    this.frame = null;
    const now = this.now();
    let animating = false;
    if (this.intro.animating) {
      const sample = this.intro.sample(now);
      for (const [id, point] of sample.positions) this.positions.set(id, point);
      this.edgeScale = introEdgeAlphaMultiplier((now - this.introStartedAt) / INTRO_TIMING.edgeFadeMs);
      animating = sample.animating;
      if (!animating) this.edgeScale = 1;
    } else if (this.layout.animating) {
      const sample = this.layout.sample(now);
      for (const [id, point] of sample.positions) this.positions.set(id, point);
      animating = sample.animating;
    }
    this.draw();
    if (animating) this.schedule();
  };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Single vs double click for engines with no native double-click event (sigma's own
 * `pendingClick`): a click waits `delayMs` for a second one on the same node, so a double-click
 * collapses a community without first selecting it.
 */
export class ClickGate {
  private pending: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private readonly onClick: (id: string) => void,
    private readonly onDoubleClick: (id: string) => void,
    private readonly delayMs = 250,
  ) {}

  click(id: string): void {
    if (this.pending && this.pending.id === id) {
      clearTimeout(this.pending.timer);
      this.pending = null;
      this.onDoubleClick(id);
      return;
    }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.onClick(this.pending.id);
    }
    const timer = setTimeout(() => {
      this.pending = null;
      this.onClick(id);
    }, this.delayMs);
    this.pending = { id, timer };
  }

  cancel(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
