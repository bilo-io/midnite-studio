import type { ComponentType } from 'react';

import { LuBoxes, LuNetwork, LuOrbit, LuSparkles } from 'react-icons/lu';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import type { IconComponent } from '../../components/icon-button';
import type { KnowledgeFilterState } from './knowledge-filters';

/**
 * The variant seam (Phase 89 Theme A).
 *
 * Every prior Knowledge PR hard-coded sigma: `KnowledgeCanvas` called
 * `useSigmaGraph` and nothing else, so sigma's own choices (WebGL,
 * ForceAtlas2 coordinates, its edge/node reducers) were the only ones
 * available. This file names the seam a renderer sits behind, so switching
 * libraries later (Themes F–I) is a new module and one registry entry, not a
 * rewrite of `KnowledgeCanvas` or `knowledge-view.tsx`.
 *
 * `KnowledgeRenderer` is deliberately an IMPERATIVE interface, not a React
 * component — `use-sigma-graph.ts`'s own four effects are exactly this
 * shape already (build once per payload, push filter/selection updates,
 * fly the camera, mutate on collapse), and the libraries later themes add
 * (force-graph, cytoscape, vis-network) are themselves imperative APIs with
 * their own mount/update/destroy lifecycle — wrapping each in a class that
 * satisfies this interface is a much smaller adaptation than forcing them
 * through a declarative React tree. A thin per-variant React component (the
 * `load()` below resolves to one) owns the container `<div>` and drives a
 * `KnowledgeRenderer` instance through `use-knowledge-renderer.ts`, the one
 * generic hook that replaces four bespoke effects per variant with one.
 */
export type KnowledgeRendererCallbacks = {
  onNodeClick: (nodeId: string) => void;
  /** A double-click collapses an ordinary node's community, or expands a meta-node — the caller decides which. */
  onNodeDoubleClick: (nodeId: string) => void;
};

export interface KnowledgeRenderer {
  /**
   * Build and mount once per payload identity (`use-sigma-graph.ts`'s effect
   * (1), `:176`) — a fresh `builtAtCommit` or a repo switch, never a
   * filter/search keystroke.
   */
  mount(container: HTMLDivElement, payload: KnowledgeGraphPayload, callbacks: KnowledgeRendererCallbacks): void;
  /** Tear down everything `mount` created — the effect (1) cleanup, `:481`. */
  dispose(): void;
  /**
   * Which nodes/edges are visible — relation/weight/confidence and hidden
   * communities. Half of effect (2) (`:499`): the half that does not depend
   * on search or selection.
   */
  applyFilters(filters: KnowledgeFilterState): void;
  /**
   * Which nodes are lit vs. dimmed — driven by the search query (part of
   * `filters`, folded in here because `computeHighlightSets` combines both)
   * and the selected node. The other half of effect (2).
   */
  applyHighlight(selectedNodeId: string | null): void;
  /** Fly the camera to a node, or do nothing for `null` — effect (3), `:537`. */
  focusNode(nodeId: string | null): void;
  /** Collapse/expand communities into meta-nodes — effect (4), `:561`. */
  setCollapsed(collapsedCommunities: ReadonlySet<string>): void;
  /**
   * The container resized. sigma today owns its own internal
   * `ResizeObserver` (Theme G's finding, `:461-479`) and this stays a no-op
   * passthrough to it for Theme A's no-behaviour-change bar; a library that
   * does not self-observe (a later theme) implements it for real.
   */
  resize(): void;
  /**
   * Phase 84's visibility gate: the window is blurred, skip animation.
   * Mirrors `liveRef.current.paused` (`:165`) — read at call time by
   * `focusNode`'s camera choice and by pulses, never as a per-call
   * parameter, so a blur that lands between prop updates still snaps the
   * next thing that animates.
   */
  setPaused(paused: boolean): void;
  /**
   * The expand-from-a-core intro burst (Theme B). On the contract from
   * Theme A (Decision 4 — every variant implements it or does not get a
   * pill) so Theme B has a real seam to fill; sigma's own Theme A
   * implementation is a no-op, since sigma already renders nodes at their
   * final position with no burst.
   */
  playIntro(): void;
  /**
   * The SAME graph (`builtAtCommit` unchanged) under a newly requested
   * worker layout (Phase 89 Theme E) — tweens every node from wherever it
   * currently sits to `positions[id]`, rather than the hard rebuild `mount`
   * does. `use-knowledge-renderer.ts`'s own effect (1b) is what tells this
   * apart from a genuine new payload and calls it instead of `mount`+`dispose`.
   * Offered only for a variant whose engine consumes worker coordinates in
   * the first place (Decision 9 — `KnowledgeVariant.consumesWorkerLayout`);
   * a variant that is never offered a layout pill may leave this a no-op,
   * the same allowance `resize()` gets above.
   */
  retarget(positions: KnowledgeGraphPayload['positions']): void;
}

/** Props every variant's mounted component receives — identical to `KnowledgeCanvas`'s own today, so swapping variants is invisible to `knowledge-view.tsx`. */
export type KnowledgeVariantProps = {
  payload: KnowledgeGraphPayload;
  filters: KnowledgeFilterState;
  focusNodeId: string | null;
  selectedNodeId: string | null;
  collapsedCommunities: ReadonlySet<string>;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  paused: boolean;
};

/** A variant id, as persisted in `ui-store.ts`. Not a literal union — see `resolveVariant`'s fallback for why. */
export type KnowledgeVariantId = string;

export type KnowledgeVariant = {
  id: KnowledgeVariantId;
  label: string;
  icon: IconComponent;
  /** Which underlying library this variant draws with — distinct from `id`: Theme D's four sigma "looks" all share `engine: 'sigma'`. */
  engine: string;
  /**
   * Whether this variant's canvas is driven by worker-computed `positions`
   * (Phase 89 Theme E, Decision 9) — true for sigma and for every one of
   * Themes F–H's planned engines (force-graph/cytoscape/vis-network all
   * "consume `payload.positions` directly", per the phase doc), false for
   * Theme I's live d3-force simulation, which computes its own layout and
   * would render a layout pill that does nothing. `knowledge-view.tsx` reads
   * this to decide whether the layout pill row has anything to control for
   * the active variant, rather than showing one permanently and disabling it
   * — Decision 9's own recommendation: "let the bar shrink rather than
   * showing controls that do nothing."
   */
  consumesWorkerLayout: boolean;
  /**
   * The variant's own dynamic `import()`, resolving to a component that
   * accepts `KnowledgeVariantProps`. Per-variant rather than one static
   * import per engine, so opening Knowledge never pays for a library the
   * user did not pick (Decision 2) — sigma included, so later themes'
   * engines never share a chunk with it either.
   */
  load: () => Promise<{ default: ComponentType<KnowledgeVariantProps> }>;
};

/**
 * Every sigma-engine variant resolves to the SAME module — Theme D's four
 * "looks" are one mounted component that reads which look is active off
 * `knowledge-filters-store.ts`'s `rendererVariant` (the same field this
 * registry entry's own `id` ends up in) rather than four separate lazy
 * chunks. That is what lets `knowledge-canvas.tsx` key its `React.lazy`
 * memo on `engine` instead of `id`: switching Atlas ⇄ Constellation ⇄ Orbit
 * ⇄ Clusters never unmounts the sigma instance, which is the phase doc's
 * own requirement ("switching between the four sigma looks does not tear
 * down and rebuild the renderer"). A literal shared function reference
 * (not four separate `() => import(...)` closures with identical bodies)
 * is what makes `load` itself referentially stable across the four entries.
 */
const loadSigma = () => import('./use-sigma-graph');

/**
 * Four sigma looks (Theme D) plus F–I (one entry per library) extend this
 * list; the pill bar and the overflow menu already treat it as flat — one
 * id, one persisted value, one thing to test (Decision 1) — so growing this
 * array is the whole diff those themes need here.
 *
 * Theme A shipped one entry, `id: 'sigma'`. Theme D RENAMES it to `'atlas'`
 * rather than keeping `'sigma'` as one of the four look ids: `engine:
 * 'sigma'` now names the shared library across all four entries, so a look
 * ID of `'sigma'` sitting beside `'constellation'`/`'orbit'`/`'clusters'`
 * would read as "the engine" rather than "a look", and the verification
 * line ("opening Knowledge with no stored preference renders Atlas") only
 * holds if `'atlas'` is `VARIANTS[0]` (`DEFAULT_VARIANT_ID` derives from
 * it) — `resolveVariant`'s existing fallback (Decision 1) means a
 * stale-persisted `'sigma'` value from before this PR still resolves to
 * `VARIANTS[0]` (now Atlas) rather than rendering nothing, so no migration
 * step is needed. `ui-store.ts`'s `DEFAULT_KNOWLEDGE_VARIANT` moves from
 * `'sigma'` to `'atlas'` alongside this for the same reason.
 */
export const VARIANTS: readonly KnowledgeVariant[] = [
  {
    id: 'atlas',
    label: 'Atlas',
    icon: LuNetwork,
    engine: 'sigma',
    consumesWorkerLayout: true,
    load: loadSigma,
  },
  {
    id: 'constellation',
    label: 'Constellation',
    icon: LuSparkles,
    engine: 'sigma',
    consumesWorkerLayout: true,
    load: loadSigma,
  },
  {
    id: 'orbit',
    label: 'Orbit',
    icon: LuOrbit,
    engine: 'sigma',
    // Positions come from `computeOrbitPositions` (knowledge-orbit-layout.ts) — a pure
    // client-side ring layout keyed on community, not from worker-computed `payload.positions`.
    // A worker-layout pill would offer a control that does nothing here (Decision 9).
    consumesWorkerLayout: false,
    load: loadSigma,
  },
  {
    id: 'clusters',
    label: 'Clusters',
    icon: LuBoxes,
    engine: 'sigma',
    consumesWorkerLayout: true,
    load: loadSigma,
  },
];

export const DEFAULT_VARIANT_ID: KnowledgeVariantId = VARIANTS[0]!.id;

/** An unknown or removed id (a stale localStorage value from a build that dropped a variant) falls back to the default rather than rendering nothing — Decision 1. */
export function resolveVariant(id: KnowledgeVariantId): KnowledgeVariant {
  return VARIANTS.find((variant) => variant.id === id) ?? VARIANTS[0]!;
}
