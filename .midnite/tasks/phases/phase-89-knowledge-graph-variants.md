# Phase 89 — Knowledge graph visualisation variants

**[Phase 87](phase-87-knowledge-graph-panel.md) shipped one renderer, hard-coded.** `KnowledgeCanvas`
is 57 lines that call `useSigmaGraph` and nothing else, and every choice inside those 625 lines —
sigma, WebGL, ForceAtlas2 coordinates, a grey-disc-avoiding edge filter — is the only choice
available. This phase puts a **pill bar above the canvas** and makes the renderer a named variant you
switch between: sigma deepened first, then one alternative library per theme.

**The order is deliberate and it is the first scope guardrail.** Themes A–E extend what already
exists — the seam, the intro animation, the focus alpha, four sigma looks, the worker's layouts —
before a single new dependency lands. F–I then add one library each, behind its own dynamic
`import()`. A phase that installed four graph engines first and worked out the seam afterwards would
end with four half-integrated renderers and no shared contract; a phase that proves the contract
against sigma's own four looks has something for the libraries to fit into.

## What the grounding changed

Three premises this phase would otherwise have been written on turned out to be wrong.

**Focus alpha dimming already ships.** The ask was for
"[good alpha values when a specific node is focused](https://www.marvel-graphs.net/)", and
[`knowledge-canvas-colors.ts`](../../../packages/app/src/features/knowledge/knowledge-canvas-colors.ts)
already carries the model: `DEFAULT_NODE_ALPHA = 0.65`, `DIMMED_ALPHA = 0.1`,
`NEIGHBOR_NODE_ALPHA = 0.85`, focus at raw `1.0`, plus `alphaForWeight(weight, 0.15, 0.8)` for edges.
Its docblock records *why* the values are premultiplied — `rgba(r·a, g·a, b·a, a)` — because sigma 3
blends with `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)` and straight alpha produced **no dimming at
all** on the dark theme, a bug that shipped once. So Theme C is *animating and retuning* an existing
model, not building one. The thing genuinely missing is interpolation: today every alpha change is a
step, applied on the next `refresh()`.

**There is already a rAF loop, and it cannot carry the intro.**
[`knowledge-bounce.ts`](../../../packages/app/src/features/knowledge/knowledge-bounce.ts) has a
complete tween tracker — `easeOutBack`, `PulseTracker.start/sample/clear`, an `animating` flag that
keeps the frame loop alive only while a tween is in flight, and six presets. But it tweens **`size`
only**, and `use-sigma-graph.ts`'s `repaint()` helper repaints with
`sigma.refresh({partialGraph, skipIndexation: true})`. Positions are re-indexed on a *full* refresh
only, so an expand-from-core intro cannot ride the existing path unchanged. `PulseTracker` is the
right *shape* to copy; it is not the right object to extend.

**The graph is bigger than the code says.** `graphify-out/graph.json` on this repo is now **15,292
nodes / 37,036 links**, not the 14,881 / 36,032 quoted in
[`packages/knowledge/src/types.ts`](../../../packages/knowledge/src/types.ts),
[`layout.ts`](../../../packages/knowledge/src/layout.ts) and `use-sigma-graph.ts`. Every number this
phase measures is measured against the real file, and Theme J fixes the stale comments.

And one correction this phase must make out loud rather than by omission: **Phase 87 rejected
vis-network**, and its reason was the CDN, not the library. `graph.html` loads
`vis-network@9.1.6` from `unpkg.com` via a `<script src>`, which is a blank pane offline and walks
into [Phase 76](phase-76-the-renderer-in-a-sandbox.md)'s renderer CSP. An **npm-bundled** vis-network
has neither problem. Theme H says so in the code comment, so the next reader does not "fix" it back.

**Builds on.**
- [Phase 87](phase-87-knowledge-graph-panel.md) — everything. `packages/knowledge`, the IPC payload,
  the worker layout, the sigma canvas, the filters store, the community collapse machinery.
- [Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) — the visibility gates. `paused`
  currently does exactly two things (`use-sigma-graph.ts:360`, `:546`): tweens land instantly and the
  camera jumps instead of flying. Every animation this phase adds honours it the same way.
- [Phase 46](phase-46-lock-screen-and-motion.md) — the motion policy. `prefers-reduced-motion` must
  kill the intro, not shorten it.
- [Phase 82](phase-82-the-pyramid-righted.md) — the test-layer rule and the visual-baseline cap. Nine
  variants are nine tempting screenshots; see Decision 6.
- [Phase 60](phase-60-view-registry-and-error-boundaries.md) — `view-registry.tsx`, where a variant
  that fails to acquire a WebGL context must degrade rather than blank the window. Four more engines
  is four more ways to fail on mount.

**Scope guardrails.**
- **Sigma stays the default, and every variant is additive.** Opening Knowledge with no stored
  preference renders exactly what it renders today. A phase that changed the default would make every
  regression ambiguous.
- **One dynamic `import()` per engine.** PR #411 measured the entry chunk byte-identical (411.7 KB →
  411.7 KB) because sigma and graphology live in the lazy Knowledge chunk. Four statically imported
  engines would keep the *entry* claim true and make first-open of Knowledge pay for four renderers
  nobody picked. Decision 2.
- **Nothing loads over the network.** Same rule as Phase 87 — no CDN, no font, no tile, for any
  variant.
- **The app still never runs `graphify`.** Unchanged from Phase 87.
- **Read-only, still.** No editing the graph, no writing into `graphify-out/`.
- **No 3D.** force-graph ships a 3D sibling; it is out. One dimension of novelty at a time.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — The variant seam and the pill bar (M) ✅ DONE (PR #437, 2026-09-17)

- [x] Define `KnowledgeRenderer` in `packages/app/src/features/knowledge/renderer-contract.ts`: a
      mount/dispose lifecycle plus `applyFilters`, `applyHighlight`, `focusNode`, `setCollapsed`,
      `resize`, `setPaused`, and `playIntro`. Derive it from what
      [`use-sigma-graph.ts`](../../../packages/app/src/features/knowledge/use-sigma-graph.ts) already
      does in its four effects — build+mount (`:176`), filters/focus push (`:499`), camera fly
      (`:537`), community collapse (`:561`) — rather than inventing a shape and retrofitting sigma to
      it.
- [x] `playIntro` is on the contract from the start, not bolted on by Theme B. Every variant
      implements it or does not get a pill (Decision 4).
- [x] Declare the variant registry: `VARIANTS: readonly KnowledgeVariant[]` with `{id, label, icon,
      engine, load}`, where `load` is the per-variant dynamic `import()`. Sigma's four looks (Theme D)
      and each library (F–I) are entries in this one flat list — the pill bar has no concept of
      "renderer vs. look".
- [x] Refactor `KnowledgeCanvas`
      ([`knowledge-canvas.tsx`](../../../packages/app/src/features/knowledge/knowledge-canvas.tsx), 57
      lines) to resolve the active variant, `Suspense`-load it, and pass the same props through. The
      sigma implementation moves behind the contract **with no behaviour change** — this theme ships
      green with one variant in the list.
- [x] `KnowledgeVariantPills`: a pill row rendered **inside the canvas column**
      ([`knowledge-view.tsx:234`](../../../packages/app/src/features/knowledge/knowledge-view.tsx)), so
      the filters sidebar and the node panel keep their full height. Markup follows
      [`filter-pill.tsx`](../../../packages/app/src/features/optimizer/components/filter-pill.tsx) —
      `<button type="button" aria-pressed>`, `rounded-full border px-2.5 py-0.5 text-xs`, selected
      `border-primary/60 bg-primary/10`.
- [x] An overflow `…` menu so the bar never wraps: measure available width, show what fits, push the
      rest into the menu. Copy the disclosure/menu conventions already in the feature
      ([`knowledge-community-filter.tsx:152`](../../../packages/app/src/features/knowledge/knowledge-community-filter.tsx)),
      and keep every variant keyboard-reachable whether it is on the bar or in the menu.
- [x] `rendererVariant` into
      [`knowledge-filters-store.ts`](../../../packages/app/src/features/knowledge/knowledge-filters-store.ts)
      following `communityListMode`'s precedent exactly: the type beside it, the field, a setter, and
      **left out of `ensureScope`'s reset** (`:63-72`) — it is a UI preference, not repo-scoped state.
- [x] Persist it globally, in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) alongside `graphTheme`, including
      the `partialize` list and the persisted-key union. An unknown or removed variant id falls back
      to sigma rather than rendering nothing (Decision 1).
- [x] Every icon from `react-icons`, imported per set — never the package root.

### B — Expand from a core (L) — ✅ DONE (PR #436, 2026-09-17)

- [x] `knowledge-intro.ts`: a position-channel tween beside `PulseTracker`, same pure shape (clock
      injected, `start`/`sample`/`clear`, an `animating` flag), tweening `{x, y}` from an origin to
      each node's laid-out coordinates.
- [x] **The origin is the graph centroid**, computed from `payload.positions`, not `{0, 0}` — the
      ForceAtlas2 output is not centred on the origin and a burst from the wrong point reads as a
      slide.
- [x] Stagger by degree, hubs first: reuse
      [`knowledge-degree.ts`](../../../packages/app/src/features/knowledge/knowledge-degree.ts) rather
      than recomputing. High-degree nodes land early so the shape resolves before the leaves arrive.
- [x] Solve the re-indexation problem explicitly and write down which way it went: `repaint()`
      (`use-sigma-graph.ts:325`) passes `skipIndexation: true`, which cannot carry position changes.
      Either drive the intro through a full `refresh()` per frame, or mutate the graphology node
      attributes and re-index once per frame — **measure both on the 15,292-node graph** and keep the
      one that holds frame rate. A comment records the measurement.
- [x] Edges fade in behind the nodes rather than stretching from the centroid — 37,036 edges tweening
      endpoints is the expensive half and reads worse.
- [x] `paused` snaps: when `liveRef.current.paused` (`:165`) is set, the intro lands on frame one, the
      same contract `pulse()` already honours at `:360`.
- [x] `prefers-reduced-motion` skips the intro entirely — final positions on first paint, no
      shortened version. Assert it in a unit test against the motion policy Phase 46 established.
- [x] The intro plays on **payload change** — first mount, repo switch, and re-entry after the view
      unmounts (Knowledge is deliberately not `global: true`,
      [`view-registry.tsx:158`](../../../packages/app/src/components/view-registry.tsx)). It does not
      replay on a filter change (Decision 3).
- [x] Pure tween logic covered by vitest with an injected clock, exactly as
      [`knowledge-bounce.test.ts`](../../../packages/app/src/features/knowledge/knowledge-bounce.test.ts)
      covers `PulseTracker`.

### C — Focus alpha, animated (M)

- [ ] An alpha channel on the same tween machinery as B, so a node moving between dimmed / rest /
      neighbour / focus **ramps** rather than snapping on the next `refresh()`.
- [ ] Preserve the premultiplied-alpha invariant: every interpolated value still goes through
      `withAlpha()` (`knowledge-canvas-colors.ts:18`). Interpolating the *alpha scalar* and
      premultiplying after is correct; interpolating the premultiplied RGBA is not, and the docblock
      says why.
- [ ] Retune the at-rest alpha toward the marvel-graphs read — a graph with nothing focused should
      already look composed, not uniformly lit. Land the numbers with a before/after screenshot pair,
      not an assertion that it looks better.
- [ ] Edge alpha ramps with the nodes, keeping `alphaForWeight`'s `0.15…0.8` range and
      `EMPHASISED_EDGE_SCALE = 1.4` (`use-sigma-graph.ts:89`) intact.
- [ ] Hover stays a partial repaint. `computeHighlightSets` is deliberately passed `hoveredNodeId:
      null` (`:512`, `:619`) so hover lights a neighbourhood **without** dimming the rest — do not
      quietly fold hover into the dimming path while adding the ramp.
- [ ] `paused` snaps, `prefers-reduced-motion` snaps. Same rule as B.

### D — Four sigma looks (L)

- [ ] **Atlas** — today's rendering, registered as an explicit variant so the default is a named thing
      rather than the absence of a choice.
- [ ] **Constellation** — a dark-weighted look: curved edges, a glow pass on high-degree nodes, lower
      ambient edge alpha, tighter label density. Uses sigma's own settings and a custom edge program
      where curvature needs one; no new dependency.
- [ ] **Orbit** — concentric rings by community, positions computed client-side from the payload (not
      the worker), with nodes tweening from their Atlas coordinates via B's position channel.
- [ ] **Clusters** — communities collapsed to bubbles by default, expanding on click, over the
      existing
      [`knowledge-community-collapse.ts`](../../../packages/app/src/features/knowledge/knowledge-community-collapse.ts)
      and its meta-node/aggregated-edge machinery (`use-sigma-graph.ts:561`). This is the one look
      that makes the 15k-node graph legible at first paint.
- [ ] All four share one sigma instance and differ by settings + reducers where possible; only Orbit
      and Clusters touch the graph's own attributes. Switching between looks must not tear down and
      rebuild the renderer — that is what the seam is for.
- [ ] Each look respects the theme `MutationObserver` repaint (`:444-459`) in both light and dark. A
      look that only works on one theme does not ship.

### E — Layout variants in the worker (M)

- [ ] Add alternative layouts to [`packages/knowledge/src/layout.ts`](../../../packages/knowledge/src/layout.ts)
      beside `runForceAtlas2`: **circlepack** by community, **hierarchical** by import direction, and
      **noverlap** as a post-pass over any of them. Same deterministic guarantee ForceAtlas2 already
      has — same input, same coordinates — so the cache stays meaningful.
- [ ] The layout id joins the cache key beside `built_at_commit`
      ([`cache.ts`](../../../packages/knowledge/src/cache.ts)), so switching layouts twice is a cache
      hit, not two recomputations.
- [ ] Extend the IPC payload in
      [`shared/src/domain/knowledge.ts`](../../../packages/shared/src/domain/knowledge.ts) to request
      a layout, keeping `KnowledgeGraphPayloadSchema`'s existing `positions` record shape unchanged —
      the renderer should not be able to tell which layout produced the coordinates.
- [ ] Layout switches **tween** between coordinate sets using B's position channel, with the same
      progress reporting the first layout already has
      ([`use-knowledge-layout-progress.ts`](../../../packages/app/src/features/knowledge/use-knowledge-layout-progress.ts)).
- [ ] The layout pills sit in the same flat bar as everything else, and a layout is only offered for
      variants whose engine consumes worker coordinates (so not the d3-force live sim, which computes
      its own).
- [ ] `packages/knowledge` stays electron-free. Boundary unchanged, vitest coverage per layout.

### F — force-graph (M)

- [ ] `force-graph` behind its own dynamic `import()`, implementing `KnowledgeRenderer`. WebGL, so it
      is the one alternative with a plausible shot at 15,292 nodes.
- [ ] Consumes `payload.nodes` / `payload.links` / `payload.positions` **directly** — no graphology
      instance. The wire payload is plain arrays plus a positions record precisely so an engine can
      take it as-is.
- [ ] Node colour from the same
      [`knowledge-community-colors.ts`](../../../packages/app/src/features/knowledge/knowledge-community-colors.ts)
      tokens, so a community is the same colour in every variant. A variant that invents its own
      palette breaks the one thing the pills are supposed to make comparable.
- [ ] `playIntro`, `applyFilters`, `applyHighlight` (including the C alpha model), `focusNode`,
      `setPaused` — all of it, or the pill does not ship.
- [ ] Licence recorded in the theme's notes and checked against the repo's existing constraints.

### G — cytoscape.js (M)

- [ ] `cytoscape` behind its own dynamic `import()`, same contract, same colour tokens.
- [ ] Canvas-based, so expect it to be the first variant the Theme J gate catches. Build it honestly
      rather than tuning it into a number it cannot hold — the gate exists for exactly this.
- [ ] Map the contract onto cytoscape's own idioms (stylesheet selectors for the alpha states,
      `layout.run()` for the intro) rather than fighting the library into sigma's shape.
- [ ] Licence recorded and checked.

### H — vis-network (M)

- [ ] `vis-network` from npm, behind its own dynamic `import()`, same contract, same colour tokens.
- [ ] **A comment at the top of the variant module qualifying Phase 87's rejection**, naming the file
      and line: `graph.html` loaded `vis-network@9.1.6` from `unpkg.com` via a `<script src>`, which
      is a blank pane offline and a Phase 76 CSP violation. Bundling it from npm has neither problem.
      Without this note the next reader deletes the variant citing the phase doc that rejected it.
- [ ] Verify by network trace in the packaged app that the bundled build fetches nothing — the
      original objection deserves to be closed with evidence, not an argument.
- [ ] Licence recorded and checked.

### I — d3-force, live (M)

- [ ] A variant that runs `d3-force` **in the renderer** against our own 2D canvas draw, so you watch
      the simulation settle. Distinct from every other pill by construction: it is the only one where
      the layout is happening in front of you.
- [ ] `playIntro` is the simulation start — nodes seeded at the centroid with a small jitter, alpha
      decaying to rest. The ask's expand-from-a-core comes free here; the work is making it *stop*
      cheaply.
- [ ] A hard iteration/time ceiling and an explicit "settled" state that stops the loop. A live sim
      that never stops is precisely the idle-CPU cost Phase 84 spent eleven themes removing, and
      `paused` must halt it, not just snap it.
- [ ] Own canvas draw reusing
      [`knowledge-canvas-draw.ts`](../../../packages/app/src/features/knowledge/knowledge-canvas-draw.ts)'s
      theming helpers where they fit, and the same community colours.
- [ ] Almost certainly gated by Theme J at this node count. Ship it gated rather than not at all —
      the graph a user opens may be a tenth this size.

### J — The gate, and the bake-off (M)

- [ ] Per-variant instrumentation behind `MSTUDIO_PERF=1`, in the shape
      [`scripts/perf/`](../../../scripts/perf/) already uses: **time to first paint**, **frames per
      second while panning**, and **renderer memory**, each measured on the packaged-equivalent app
      (`moon run app:build desktop:bundle` first — dev-mode numbers are noise) against the real
      15,292-node / 37,036-link graph.
- [ ] Write the numbers into the phase doc and into `budgets.json` beside the existing perf budgets,
      with the machine and the commit behind each run. Per `CLAUDE.md`: a perf claim comes with a
      number.
- [ ] **The capability gate.** Each variant declares `maxNodes` / `maxEdges` derived from those
      measurements. Above it the pill renders disabled with a tooltip naming the reason and the
      count — following
      [`diff-toolbar.tsx`](../../../packages/app/src/features/diff/diff-toolbar.tsx)'s
      `canSplit(diff) && !tooNarrowForSplit ? pref : 'unified'` precedent, where a stored preference
      falls back when the content cannot support it.
- [ ] A gated variant never silently becomes another variant: the stored preference is kept, the pill
      stays visible and disabled, and returning to a smaller repo restores it.
- [ ] Fix the stale node counts in
      [`types.ts`](../../../packages/knowledge/src/types.ts),
      [`layout.ts`](../../../packages/knowledge/src/layout.ts) and `use-sigma-graph.ts:38` — they
      still say 14,881 / 36,032.
- [ ] A written verdict: which variants are worth their bytes at what scale, recorded here so a later
      phase deleting one has the evidence rather than an opinion.

### K — Verification and budgets (M)

- [ ] Unit tests for the pure layers: the variant registry and fallback, the intro and alpha tweens
      (injected clock), the overflow-bar fitting logic, the capability gate's threshold arithmetic,
      each new worker layout's determinism.
- [ ] `knowledge-view.test.tsx` already mocks `./knowledge-canvas` (`:14`) with a stub — extend the
      mock to the variant seam rather than mocking each engine, so adding a variant does not mean
      touching the view test.
- [ ] **One** e2e, for the seam only: pick a variant, confirm the canvas re-mounts and the preference
      survives. Per Phase 82's decision rule, the header comment names which browser capability it
      needs. The four engines are not each given an e2e.
- [ ] **Three** visual baselines, not nine: Atlas, Constellation, Clusters. Decision 6.
- [ ] `scripts/perf/bundle-report.mjs`: entry chunk still byte-identical, and the Knowledge lazy chunk
      measured **before and after** with a recorded ceiling — four engines behind four dynamic imports
      should leave the base Knowledge chunk near where it is.
- [ ] `scripts/e2e-budget.mjs` and the visual-baseline cap both still pass.
- [ ] `idle-cpu.mjs --blurred` with each animated variant open is indistinguishable from the view
      closed. The d3-force live sim is the one most likely to fail this; it is why Theme I has a
      settle ceiling.
- [ ] Licence audit of all four new dependencies recorded in one place.
- [ ] `moon run :typecheck :lint :test` green; `moon run root:tracker-check` exits 0.
- [ ] **Open, for a human:** switch through every pill on a repo you know well and say which one you
      reach for. Nine variants that all render correctly and none of which you prefer is a failure
      this phase cannot assert against.

---

## Files this phase touches

| File | What |
|---|---|
| `packages/app/src/features/knowledge/renderer-contract.ts` | **new** — the `KnowledgeRenderer` interface and variant registry (A) |
| `packages/app/src/features/knowledge/knowledge-variant-pills.tsx` | **new** — the pill bar and overflow menu (A) |
| `packages/app/src/features/knowledge/knowledge-intro.ts` | **new** — the position/alpha tween channel (B, C) |
| `packages/app/src/features/knowledge/variants/**` | **new** — one module per variant, each its own dynamic import (D, F, G, H, I) |
| [`knowledge-canvas.tsx`](../../../packages/app/src/features/knowledge/knowledge-canvas.tsx) | resolves and `Suspense`-loads the active variant (A) |
| [`knowledge-view.tsx`](../../../packages/app/src/features/knowledge/knowledge-view.tsx) | the pill row inside the canvas column at `:234` (A) |
| [`use-sigma-graph.ts`](../../../packages/app/src/features/knowledge/use-sigma-graph.ts) | moves behind the contract; intro re-indexation; alpha ramp (A, B, C, D) |
| [`knowledge-canvas-colors.ts`](../../../packages/app/src/features/knowledge/knowledge-canvas-colors.ts) | interpolated alpha, retuned rest value, invariant preserved (C) |
| [`knowledge-bounce.ts`](../../../packages/app/src/features/knowledge/knowledge-bounce.ts) | (**unchanged**) — the shape B copies, not the object it extends (B) |
| [`knowledge-filters-store.ts`](../../../packages/app/src/features/knowledge/knowledge-filters-store.ts) | `rendererVariant`, outside `ensureScope`'s reset (A) |
| [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | persisted variant preference beside `graphTheme` (A) |
| [`packages/knowledge/src/layout.ts`](../../../packages/knowledge/src/layout.ts) · [`cache.ts`](../../../packages/knowledge/src/cache.ts) | alternative layouts, layout id in the cache key (E) |
| [`packages/shared/src/domain/knowledge.ts`](../../../packages/shared/src/domain/knowledge.ts) | a layout request on the payload; `positions` shape unchanged (E) |
| `packages/app/package.json` | `force-graph`, `cytoscape`, `vis-network`, `d3-force` (F, G, H, I) |
| [`scripts/perf/bundle-report.mjs`](../../../scripts/perf/bundle-report.mjs) · [`idle-cpu.mjs`](../../../scripts/perf/idle-cpu.mjs) | (**unchanged**) — run them for the numbers (J, K) |
| [`packages/app/e2e/knowledge-canvas.spec.ts`](../../../packages/app/e2e/knowledge-canvas.spec.ts) · [`knowledge-graph-shots.spec.ts`](../../../packages/app/e2e/knowledge-graph-shots.spec.ts) | one seam e2e, three baselines (K) |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `moon run root:tracker-check` exits 0.
- [ ] **Theme A ships with sigma as the only variant and changes nothing visible.** If A alone has a
      visual diff, the seam leaked behaviour.
- [ ] Opening Knowledge with no stored preference renders Atlas — today's rendering, unchanged.
- [ ] Every pill is keyboard-reachable, on the bar or in the overflow menu, with `aria-pressed`
      correct in both places.
- [ ] Narrowing the window moves pills into the overflow menu and never wraps the bar.
- [ ] The stored variant survives a restart, and an unknown/removed id falls back to sigma rather than
      rendering nothing.
- [ ] The intro burst plays on first open and on repo switch, and **does not** replay on a filter
      change.
- [ ] With `prefers-reduced-motion` set, no variant animates its intro — final positions on first
      paint.
- [ ] With the window blurred, every animation snaps rather than plays (the `paused` contract).
- [ ] Focus dimming ramps rather than snaps, and the premultiplied-alpha invariant holds: verified in
      **dark** theme, where the original straight-alpha bug was invisible in light.
- [ ] Switching between the four sigma looks does not tear down and rebuild the renderer.
- [ ] Switching layouts twice is a cache hit, not two recomputations.
- [ ] Every variant colours a given community identically.
- [ ] A gated variant shows a disabled pill with a reason, keeps the stored preference, and returns
      when a smaller repo is opened.
- [ ] Nothing is fetched over the network with any variant active — verified from the packaged app's
      devtools network panel, including vis-network.
- [ ] Entry chunk still byte-identical; the Knowledge lazy chunk measured before/after and within its
      recorded ceiling.
- [ ] Repeated variant switching does not grow GPU memory — the Phase 45 leak shape, now with five
      engines to leak from.
- [ ] `idle-cpu.mjs --blurred` with each variant open is indistinguishable from the view closed.
- [ ] **Open, for a human:** switch through every pill on a repo you know well and say which one you
      reach for.

---

## Not in this phase

- **3D.** `force-graph` ships `3d-force-graph`; it is out. One dimension of novelty at a time.
- **Changing the default.** Atlas stays the default regardless of what the bake-off says. Promoting a
  new default is a decision with its own evidence, after these numbers exist.
- **Deleting the losers.** Theme J writes the verdict; acting on it is a later phase, if any.
- **Running or refreshing graphify from the app.** Unchanged from Phase 87.
- **The `query` / `explain` / `path` textual surface.** Still a different interaction model that
  happens to read the same file.
- **Per-variant filter semantics.** Filters mean the same thing everywhere or they are not comparable.
- **Phase 87's nine open verification lines.** They stay open there; this phase re-opens several of
  them in its own terms rather than adopting them.

---

## Decisions / open questions

1. **Resolved — one flat variant list, pills plus an overflow menu.** The pills control three
   different axes (which engine, which layout, which look), and a two-row renderer × layout control
   multiplies into combinations that mostly have never been run. A variant is therefore a *named
   preset* — one id, one persisted value, one thing to test. The overflow menu keeps the bar from
   wrapping on a narrow window without hiding anything from the keyboard.

2. **Resolved — one dynamic `import()` per engine.** Statically importing four engines beside
   `knowledge-view.tsx` would keep PR #411's byte-identical *entry* chunk true while making the first
   open of Knowledge pay for four renderers the user did not pick. Per-variant lazy loading keeps both
   properties.

3. **Resolved — the intro plays on payload change, not on every mount-like event.** Knowledge is
   deliberately not `global: true` (`view-registry.tsx:158`), so a view switch is a full unmount and
   remount; replaying the burst there is correct and cheap. Replaying it on a filter change would be
   motion punishing the user for using the filters.

4. **Resolved — every variant must implement `playIntro` or it does not get a pill.** The alternative
   was letting each library render statically with its own defaults, which would make the pills a
   comparison of four libraries' opinions rather than of four renderings of the same graph. It raises
   the bar per library theme deliberately.

5. **Resolved — variants are kept and gated by measured size, not deleted.** A variant that cannot
   hold 15,292 nodes may be the best one on a 900-node repo, and most repos are not this one. The
   gate's thresholds come from Theme J's measurements, so F–I ship gated-off until J lands — which
   makes J a blocker for the libraries' pills being usable, not for them being merged.

6. **Resolved — three visual baselines, not nine.** Phase 82 caps the suite at roughly 100 baselines /
   3 MB, and nine near-identical WebGL captures would spend a meaningful fraction of that on variants
   whose differences are motion and alpha — neither of which a still frame carries well. Atlas,
   Constellation and Clusters are the three that differ structurally. The rest are covered by unit
   tests on the pure layers plus the human pass.

7. **Open — does the intro burst survive contact with the filters?** A user who lands on Knowledge and
   immediately reaches for the community filter sees the burst, then a large hidden-set change.
   *Recommendation:* let the burst finish and apply the filter after, rather than interrupting it; it
   is under a second. Revisit if it feels sticky in hands.

8. **Open — should a gated variant be hidden rather than disabled?** A disabled pill teaches why;
   three disabled pills on a large repo is mostly noise. *Recommendation:* **disabled with a reason**
   for the first release, because the reason is the interesting part and hiding it makes the app look
   like it has fewer variants than it does. Worth revisiting once the thresholds are real numbers.

9. **Open — where does the layout choice live once there are non-sigma variants?** Theme E's layouts
   are worker-computed and meaningless to the d3-force live sim, which computes its own.
   *Recommendation:* offer layout pills only when the active variant consumes worker coordinates, and
   let the bar shrink rather than showing controls that do nothing. The alternative — a permanently
   visible layout row with disabled entries — costs height on every variant to explain one.
