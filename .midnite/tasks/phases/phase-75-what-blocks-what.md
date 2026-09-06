# Phase 75 — What blocks what, and the agent you point at it

[Phase 40](phase-40-github-projects.md) brought a GitHub ProjectV2 board into the app.
[Phase 41](phase-41-agentic-kanban.md) let an agent run a card. [Phase 52](phase-52-projects-board-workflows-navigable.md)
gave both modes one filter toolbar. Nothing in any of them can say **what has to finish first**.

A board is a set. A backlog is a graph. The columns tell you where a task *is*; they cannot tell you
that #212 cannot start until #199 lands, that #204 has been startable for a week, or that the three
cards a human keeps reaching for are the only three that are actually blocked. This phase draws that
graph, greys out what is blocked, animates each edge according to the state of its two ends, and lets
an agent be pointed at a node the same way it is already pointed at a card.

The model is [`~/Dev/midnite`](https://github.com/bilo-io/midnite)'s task graph — `packages/shared/src/task-graph.ts`,
`packages/web/lib/task-graph-layout.ts`, `packages/web/components/task-graph/`. That implementation is
the design brief for this one: the same `ready` / `unmetBlockerCount` / `foreign` node vocabulary, the
same left-to-right ranking with blockers upstream, and the same five-state edge appearance. What
changes is everything underneath, because that app owns its own database and this one is reading
somebody else's board over `gh api graphql`.

**Two findings from the grounding audit change the shape of this phase. Read them before Theme A.**

**1. The kanban card already wears the rainbow. It has since Phase 37.**
[`styles.css:2094–2107`](../../../packages/app/src/styles.css) defines `.card-run-glow` as
`conic-gradient(from var(--loop-glow-angle, 0deg), var(--rainbow-ramp))` over a transparent border,
spun by `loop-glow-spin 4s linear infinite` and breathed by `card-glow-pulse 2s`, applied by
[`task-card.tsx:105–107`](../../../packages/app/src/features/projects/board/task-card.tsx) as
`` `card-run-glow is-${glow}` `` off [`glow-state.ts`](../../../packages/app/src/features/projects/board/glow-state.ts)'s
four-state derivation, focus-gated at `:2132` and reduced-motion-guarded at `:2142`. There is even a
[`kanban-glow-shots.spec.ts`](../../../packages/app/e2e/kanban-glow-shots.spec.ts) holding it in place.
**So "the kanban should rainbow while an agent works it" is already true**, and Theme F is not building
it — Theme F is *generalising* it so the graph node can wear the same thing. That is a smaller,
sharper theme than it looked, and it must not regress the card on the way.

**2. `workflow-canvas.tsx` paints its nodes in raw SVG, and `.card-run-glow` cannot survive that.**
[`workflow-canvas.tsx:502–600`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx)
is one viewBox'd `<svg>` containing `<rect>`, `<text>` and `<circle>` — no `<foreignObject>`, no HTML
nodes. `.card-run-glow`'s technique is `background-image` + `background-origin: border-box` +
`background-clip: padding-box, border-box`: a CSS box-model trick. An SVG `<rect>` has no border box
and no background image, and SVG has no conic gradient at all. **Painting graph nodes as `<rect>`
would make the one visual requirement of this phase impossible to meet with the code that already
meets it.** So the canvas is a *hybrid*: HTML nodes absolutely positioned inside a transformed
container, over an SVG layer that carries only the edges. This is still "extend the workflow canvas"
in the sense that matters — [`workflow-geometry.ts`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)'s
viewport/zoom/cull constants and [`workflow-path.ts`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)'s
`edgePath`, `clientToGraph`, `panBy`, `zoomAtPointer`, `rectsIntersect` and `viewportRect` are all
reused verbatim — but the node layer is DOM, and it is DOM specifically so the ramp works. See
**Decisions**.

**The dependency data costs one query change, not a new channel.**
[`gh-project.ts:115–130`](../../../packages/desktop/src/main/forge/gh-project.ts)'s
`PROJECT_ITEMS_QUERY` already carries an `... on Issue{…}` inline fragment for every board item.
`blockedBy`, `blocking`, `parent` and `subIssues` are all fields on GraphQL's `Issue` type — verified
live against this account on 2026-09-06 with no preview header, no extra scope and no error:

```
gh api graphql -f query='{ __type(name:"Issue"){ fields{ name } } }'
→ blockedBy · blocking · issueDependenciesSummary · parent · subIssues · subIssuesSummary
```

Asking for them inside the fragment that is already being fetched means **no second round trip, no
N+1, and no new IPC channel** — and because `blockedBy` is an `IssueConnection`, a blocker that is not
on this board arrives with its own `number`, `title`, `state` and `repository` in the same response,
which is what makes foreign nodes free.

**Builds on.** Phase 40 (`gh-project.ts`, `forge-project.ts`, `forge-project-handlers.ts`, the board
picker), Phase 41 (`glow-state.ts`, `use-card-status.ts`, `task-card.tsx`, the per-card agent session),
Phase 43 (`workflow-geometry.ts`, `workflow-path.ts`, the canvas idiom, `wouldCycle`), Phase 37
(`--rainbow-ramp`, `--loop-glow-angle`, `loop-glow-spin`), Phase 46 (the motion policy and
`styles-motion-guards.test.ts`), Phase 52 (`filter.ts`, `ItemFilterState`, the shared toolbar),
Phase 36 (`useWindowFocusGate`, the bundle budget).

**Scope guardrails.** **No new IPC channel.** The one data change is four fields inside an existing
query; everything else is pure derivation over `ForgeProjectItem[]` the renderer already holds.
**No new runtime dependency** — no `@xyflow/react`, no `dagre`. `bundle-report.mjs` should show the
entry chunk unmoved. **Read-only.** This phase never writes a dependency back to GitHub; there is no
drag-to-connect and no edge deletion. **`packages/app` never imports `electron`; `packages/shared`
imports zod and nothing else; `packages/git-engine` is untouched** — nothing here is git.
**The card must not regress.** Theme F changes where `.card-run-glow` is defined, never how it looks;
`kanban-glow-shots.spec.ts` is the proof.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Four fields, one query (M)

Lands first; every other theme reads what it produces. Nothing in this theme renders anything.

- [ ] Extend `PROJECT_ITEMS_QUERY`'s `... on Issue{…}` fragment at
      [`gh-project.ts:125`](../../../packages/desktop/src/main/forge/gh-project.ts) with, in one edit:
      `blockedBy(first:$DEPS){totalCount nodes{number title state repository{nameWithOwner}}}`,
      `parent{number title state repository{nameWithOwner}}` and
      `subIssues(first:$DEPS){totalCount nodes{number title state repository{nameWithOwner}}}`.
  - A new `DEPS_PAGE = 20` beside `ASSIGNEES_PAGE`/`LABELS_PAGE`, and `totalCount` alongside every
    connection so a task with more blockers than the page can say so rather than silently under-report.
    An under-reported blocker set is the one failure a dependency view must never have.
  - `repository{nameWithOwner}` on every one: GitHub dependencies are cross-repo, and a `#12` with no
    repo is ambiguous the moment a board spans two.
  - **Not** added to the `... on PullRequest{…}` or `... on DraftIssue{…}` fragments — those types do
    not have these fields, and asking would fail the whole query rather than that one item.
- [ ] Widen the issue variant of `ForgeProjectItemContentSchema` in
      [`forge-project.ts:120–135`](../../../packages/shared/src/domain/forge-project.ts) with a
      `dependencies: ForgeIssueLinkSetSchema` carrying `blockedBy`, `parent` and `subIssues`, each an
      array of `ForgeIssueLink` (`{ number, title, state, repo }`), plus `blockedByTruncated` and
      `subIssuesTruncated` booleans derived from `totalCount` vs the returned length.
  - `.default(…)` on every field, per this file's existing convention, so a board fetched by an older
    build or a `gh` that returns nothing for them parses rather than throws.
  - The PR and draft variants gain **nothing**. A `dependencies` field that is always empty on two of
    three variants is a lie the type system would then help spread.
- [ ] Parser coverage in [`gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts)'s
      item mapper for the three connections, each tolerant of `null` (an issue with no parent), an
      absent key (an older response), and a node missing `repository`.
- [ ] Unit tests in [`gh-project.test.ts`](../../../packages/desktop/src/main/forge/gh-project.test.ts)
      against a fixture response: an issue with two blockers in the same repo, one with a cross-repo
      blocker, one with a parent, one with five sub-issues, one with `totalCount` above the page size
      (asserting the truncation flag), a PR item and a draft item (asserting neither grows the field).

### B — The ladder, as a pure function (L)

The heart of the phase, and the part with no UI in it. Lives in `packages/shared` because it is
derivation over the wire contract, needs zod and nothing else, and has to be testable without
mounting a canvas — the argument [`workflow-path.ts:5–14`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)
already makes for its own arithmetic.

- [ ] `packages/shared/src/domain/forge-graph.ts` — the graph's own vocabulary:
      `ForgeGraphNode` (`itemId`, `number`, `repo`, `title`, `kind: 'issue'|'pull'|'draft'`,
      `state`, `blocked`, `ready`, `unmetBlockerCount`, `foreign`, `truncated`),
      `ForgeGraphEdge` (`from`, `to`, `kind: 'blocks'|'contains'`, `source: 'api'|'field'|'body'`),
      and `ForgeGraph` (`nodes`, `edges`, `truncated`, `totalCount`).
  - Edge direction follows the crib exactly: `from` is the **dependent**, `to` is the **blocker**.
    Written down here because it is the one thing every other theme gets wrong if it guesses.
  - `source` on every edge, because Theme E renders a body-derived edge differently from an
    API-derived one and the legend has to be able to admit where a line came from.
- [ ] `resolveForgeGraph(items, fields, options): ForgeGraph` — the ladder, in precedence order:
  1. **`api`** — `content.dependencies.blockedBy` from Theme A. Authoritative; nothing overrides it.
  2. **`field`** — a project field whose name matches `options.blockedByFieldName` (default
     `Blocked by`), read through the existing `ForgeProjectFieldValue` union, parsed as a
     comma/space-separated list of `#N` or `owner/repo#N`. Skipped entirely when no such field exists
     on the board, which is the common case and must cost nothing.
  3. **`body`** — `parseBlockerRefs(body)` over `content.body`. Only ever consulted for a node that
     the two layers above produced no `blocks` edge for, so an explicit source always wins over prose.
  - `parent`/`subIssues` are **not** in this ladder. They are the `contains` layer, derived
    unconditionally and independently, and they never contribute to `blocked` or `unmetBlockerCount`.
    A parent issue is not blocked by its children; treating containment as blocking would grey out
    every epic on the board and be read as a bug.
- [ ] `parseBlockerRefs(body: string): ForgeIssueRef[]` — its own exported, exhaustively-tested
      function, not a regex inline in the resolver.
  - Matches `Blocked by #12`, `blocked-by: #12`, `Depends on #12`, `Requires #12`, and the
    `owner/repo#12` form of each; accepts a comma- or `and`-separated list after one keyword
    (`Blocked by #12, #13 and #14`).
  - **Ignores** `Blocks #12` — that is the inverse relation, and inferring an edge on a *different*
    node from this node's prose is how a body-parse produces an edge nobody can find the source of.
  - Ignores anything inside a fenced code block or an inline-code span, and anything inside a
    markdown link's target — a body pasting a diff or a URL containing `#12` is common.
  - Returns `[]` for an empty body rather than throwing. This is the lowest-confidence layer and its
    failure mode must be "no edge", never "wrong edge" and never "crash".
- [ ] Readiness, computed once and only here: `unmetBlockerCount` = blockers whose `state` is not
      closed/merged; `blocked` = `unmetBlockerCount > 0`; `ready` = an open node with
      `unmetBlockerCount === 0` **and** at least one blocker (a node with no blockers at all is not
      "ready", it is simply unconstrained — flagging every isolated card as ready would make the
      badge meaningless on a board with no dependencies).
- [ ] Foreign nodes: a blocker referenced by an in-scope node but not itself a board item becomes a
      `ForgeGraphNode` with `foreign: true`, built from the `title`/`state`/`repo` that Theme A's
      query already returned. A blocker known only by number (the `field` and `body` layers) gets a
      foreign node titled `#N` with `state: null` — visible, honestly incomplete, never dropped.
- [ ] Self-edges dropped; duplicate edges (the same pair from two ladder layers) collapsed to the
      highest-precedence `source`; `wouldCycle`-style guard so a mutual `blockedBy` pair (which GitHub
      permits) renders both edges without sending Theme C's ranking into a loop.
- [ ] `FORGE_GRAPH_NODE_CAP = 300` and the `truncated`/`totalCount` pair. Lower than the crib's 500:
      that is a browser page with a virtualising canvas behind it, this is an Electron renderer that
      also holds a graph, a terminal and possibly a Monaco. Truncation is by board order and is
      **always** surfaced (Theme D), never silent.
- [ ] `forge-graph.test.ts` — the ladder's precedence (an item with all three sources yields one
      `api` edge), the field layer skipped when the field is absent, the body layer skipped when an
      api edge exists, containment never affecting `blocked`, a cross-repo blocker, a foreign node
      from each of the three sources, a mutual pair, a self-reference, the cap, and `parseBlockerRefs`
      across its full keyword × format matrix including the code-fence and link-target negatives.

### C — Ranked left-to-right layout, pure (M)

- [ ] `packages/app/src/features/projects/graph/graph-layout.ts` —
      `layoutForgeGraph(graph, geometry): { nodes: PositionedNode[]; edges: PositionedEdge[]; bounds: Rect }`.
  - **Longest-path ranking** over `blocks` edges only: a node's rank is one past its deepest blocker,
    so reading left→right follows completion order and every blocking arrow points rightward. This is
    the crib's `rankdir: 'LR'` with `dagre` replaced by ~40 lines, which is what buying the ranking
    without buying the library costs.
  - `contains` edges do **not** influence rank. A sub-issue is not downstream of its parent in time.
  - Within a rank: **barycentre ordering** over two forward/backward sweeps, then a stable sort by
    board order for ties. Two sweeps, not to convergence — crossing reduction is a heuristic either
    way and an unbounded loop on a 300-node graph is a frame budget nobody agreed to spend.
  - A cycle (Theme B permits mutual pairs) is broken for ranking purposes by ignoring the
    lower-precedence edge of the pair; both edges still render.
- [ ] `topAlignedViewport(bounds, width, zoom, padding)` — ported from the crib, and for its stated
      reason: a fit that *centres* a graph taller than the canvas wastes a band at the top and clips
      the bottom. Top-align, centre horizontally when it fits, left-align when it does not.
- [ ] `FORGE_GRAPH_GEOMETRY` beside it — `width: 200`, `height: 64`, `rankGap: 96`, `nodeGap: 20` —
      as data, the move [`workflow-geometry.ts:1–12`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)
      makes for the same reason: numbers that have to move together, out of JSX and out of the
      arithmetic, so both stay testable against one source.
- [ ] `graph-layout.test.ts` — a chain of three ranks 0/1/2; a diamond; two disconnected components
      laid out without overlapping; a node with no edges; a mutual pair; an empty graph returning
      empty bounds rather than `NaN`; `topAlignedViewport` for the fits-horizontally, overflows-
      horizontally and taller-than-canvas cases.

### D — The canvas (L)

HTML nodes over an SVG edge layer, for the reason in the framing. Everything that is *not* the node
layer is reused rather than rewritten.

- [ ] `packages/app/src/features/projects/graph/project-graph-view.tsx` — one `<div>` establishing a
      pan/zoom transform, containing an absolutely-positioned `<svg>` edge layer and, above it,
      absolutely-positioned HTML nodes.
  - Pan, zoom and pointer→graph conversion come from `workflow-path.ts`'s `panBy`, `zoomAtPointer`,
    `clientToGraph` and `dragDeltaToGraph` **unchanged** — they take a `Viewport` and return one, and
    know nothing about SVG.
  - Culling from `viewportRect` + `rectsIntersect` with `WORKFLOW_CULL_MARGIN`, so a 300-node graph
    renders only what is on screen. This is what makes HTML nodes affordable.
  - Zoom clamped by `WORKFLOW_ZOOM_BOUNDS` (`[0.25, 2]`). Node text below ~0.5 is illegible, so
    below that threshold nodes render as a bare titled block with the badges dropped — a level of
    detail, not a scrollbar.
- [ ] `project-graph-node.tsx` — the node itself. Shares its badge row and avatar stack with
      [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx) by
      extraction, not by copy: whatever the two have in common moves to a `card-chrome.tsx` both
      import, so a change to the assignee stack cannot land on one surface and miss the other.
- [ ] `'graph'` added to `projectsMode` at
      [`ui-store.ts:994–995`](../../../packages/app/src/store/ui-store.ts) (`Record<string, 'table' | 'board' | 'graph'>`,
      both on the state field and `setProjectsMode`), and a third segment in the mode switch at
      [`projects-view.tsx:186–195`](../../../packages/app/src/features/projects/projects-view.tsx)
      with `LuWorkflow` beside the existing `LuTable`.
  - `projectsMode` is already in `partialize` (`:1873`) and already merged in the migration arm
    (`:2027`), and a persisted `'table'`/`'board'` is still valid, so **this needs no persist version
    bump**. Guard the read anyway: an unrecognised persisted value falls back to `'table'`.
  - ⚠️ [Phase 71 Theme A](phase-71-links-that-open-in-place.md) bumps the persist `version` 9 → 10 and
    is in flight on `feature/p71-ab`. This theme must not also bump it. If a later item here ever
    needs one, take whatever number is current at that moment, not `10`.
- [ ] Empty and degenerate states, each with its own copy, because this view has four of them and a
      generic "nothing here" makes three of them look like a bug:
  - No board selected → the existing board picker, unchanged.
  - Board has items but **zero edges** → the nodes, laid out in board order, with a one-line
    explanation naming the three sources and the field name it looked for. This is the state a board
    that has never used dependencies lands in, and it must read as "nothing to draw yet", not "broken".
  - Board is **all drafts / all PRs** → an explicit line saying dependency data exists only on issues.
    See **Not in this phase**.
  - `truncated` → a persistent banner naming `totalCount` and the cap. Never silent.
- [ ] A legend, collapsible and off by default after first use: the five blocking-edge states, the
      containment edge, the blocked and ready node treatments, and the foreign node. An animated
      five-state edge vocabulary that is never explained is decoration.
- [ ] Keyboard: arrow keys move selection along edges (left = to a blocker, right = to a dependent,
      up/down = within rank), `Enter` opens the node's detail panel, `Escape` clears selection,
      `Home` re-fits. Selection is DOM focus on the node, so this costs no roving-tabindex machinery
      and screen readers get it for free.

### E — Edge states, and what blocked looks like (M)

- [ ] `packages/app/src/features/projects/graph/edge-appearance.ts` — pure, keyed off the two
      endpoints, the crib's five blocking states kept intact because they are correct:
  | source (blocker) | target (dependent) | appearance |
  |---|---|---|
  | closed | closed | solid green, 2.5px — the chain is complete |
  | closed | `ready` | animated green dash **+ green bloom** — this blocker cleared the path |
  | closed | still blocked | animated green dash — done, but other blockers remain |
  | open, agent running | blocked | animated amber dash — work is happening upstream |
  | otherwise | — | static neutral, 1.5px — a quiet, not-yet-started dependency |
- [ ] `contains` edges are one appearance and never animated: neutral at low opacity, and dashed on a
      wider period than any blocking dash so the two are distinguishable at a glance without colour.
      Off by default — see Theme H.
- [ ] A `source: 'body'` edge renders at reduced opacity with a dotted rather than dashed stroke, and
      the legend says why: *"inferred from the issue description — may be incomplete."* An edge the
      app guessed at should not look as certain as one GitHub asserted.
- [ ] The dash animation is `stroke-dashoffset` on a CSS keyframe, **not** an `animated` prop
      re-rendering per frame. One keyframe, one class, N edges — a 300-edge graph animating in React
      state is the frame budget gone.
- [ ] Blocked nodes: `opacity: 0.55` plus a desaturating filter, matching the crib's dimming and the
      board's own blocked-card convention. Applied to the node, not to its glow — a blocked node whose
      agent is somehow running must still read as running (Theme F wins over Theme E).
- [ ] `ready` nodes get an affirmative badge, not just the absence of dimming. The graph's entire
      argument is "here is what you can start now"; making that state legible only by *not* being grey
      wastes it.
- [ ] Motion policy, non-negotiable per [Phase 46](phase-46-lock-screen-and-motion-policy.md):
      every keyframe added here is either reduced-motion-guarded or allowlisted with a reason, and
      [`styles-motion-guards.test.ts`](../../../packages/app/src/styles-motion-guards.test.ts) is what
      proves it. Reduced motion keeps every colour and drops every animation — a state distinction
      carried *only* by movement is unavailable to a reader who has turned movement off, so the
      dash pattern and stroke width must already separate the five states with the animation frozen.
- [ ] Focus gating: the canvas calls `useWindowFocusGate` the way
      [`BoardView`](../../../packages/app/src/features/projects/board/board-view.tsx) already does, and
      a blurred window pays for no edge animation. `idle-cpu.mjs --blurred` is the check.

### F — One rainbow, two surfaces (M)

**This theme changes where the treatment is defined, never how it looks.** The card is the reference
implementation; the graph node has to match it, and the card has to come out the other side pixel-identical.

- [ ] Generalise `.card-run-glow` at [`styles.css:2094`](../../../packages/app/src/styles.css) into a
      surface-agnostic `.agent-run-glow` carrying the same `--loop-glow-angle` conic ramp, the same
      `loop-glow-spin 4s` + `card-glow-pulse 2s` pair, the same `is-running` / `is-waiting` /
      `is-open` states, the same focus gate at `:2132` and the same reduced-motion guard at `:2142`.
  - `.card-run-glow` remains, as a one-line alias of the new class, until every call site has moved
    within this theme — then it goes. A rename that leaves two live definitions of one visual is how
    the two drift.
  - The `background-clip: padding-box, border-box` technique carries over unchanged, which is exactly
    why Theme D's nodes are DOM. Nothing about this class works on an SVG `<rect>`.
- [ ] The graph node consumes it through the **same** `deriveCardGlowState` +
      [`useCardStatus`](../../../packages/app/src/features/projects/board/use-card-status.ts) pair the
      card uses, keyed by the same `{ projectId, itemId }`. Not a parallel implementation: an agent
      started from the graph must light the card, and one started from the card must light the node,
      and the only way that is true by construction is one subscription shape.
- [ ] `waiting`, `open` and `idle` keep their existing distinct treatments on both surfaces. They are
      load-bearing — `glow-state.ts`'s own docblock explains why `waiting` never decays — and turning
      all four into the rainbow would delete three states to emphasise one.
- [ ] The bloom: the card's ring has no outer halo. The graph node gets one (a blurred copy behind it,
      the crib's `::after`), because a node on an open canvas has room a card in a packed column does
      not, and because at 0.5 zoom a 2px ring alone is nearly invisible. The ring is identical on both;
      only the halo is graph-only, and the legend does not need to explain it.
- [ ] [`kanban-glow-shots.spec.ts`](../../../packages/app/e2e/kanban-glow-shots.spec.ts) must pass
      **unchanged** across this theme. If a card screenshot moves, the generalisation is wrong.
- [ ] A matching `project-graph-glow-shots.spec.ts` covering the node in all four states, light and
      dark, plus the reduced-motion rendering.

### G — Point an agent at a node (M)

- [ ] The node's primary action starts an agent through the **same path** a board card uses — the
      Phase 41 session, the same `revealSession` behaviour, the same terminal. No second launch path:
      two ways to start an agent is two ways for the session registry to disagree about what is running.
- [ ] Gated on `ready`, per the phase's own argument. A blocked node's start action is present but
      disabled, with a tooltip naming the specific blockers (`Blocked by #199, #204`) rather than a
      count — the numbers are the actionable part, and the graph already knows them.
  - A node with **no** blockers at all is not `ready` (Theme B) but is trivially startable, so the
    gate is `!blocked`, not `ready`. Written down because these differ on exactly the isolated-node
    case and the wrong one disables every card on a dependency-free board.
- [ ] Selecting a node opens the existing card detail panel, unchanged — the graph is a way of
      *finding* a card, and inventing a second detail surface for the same item would double the work
      of every future field the panel grows.
- [ ] The running node's terminal stays on the card. See **Not in this phase**.

### H — Filters, and the graph's own facets (M)

- [ ] The graph reads [Phase 52](phase-52-projects-board-workflows-navigable.md)'s existing
      `ProjectItemFilterState` from [`filter.ts`](../../../packages/app/src/features/projects/filter.ts)
      through the same toolbar the table and board already share. Query, assignees, labels, states and
      types all apply with no new toolbar code — this is most of what "with filters" asks for, and it
      arrives by not building anything.
- [ ] Filtering narrows the node set **before** layout, and an edge renders only when *both* endpoints
      survive — the crib's rule, and the reason a filtered-out node's dependencies vanish cleanly
      rather than dangling into empty space.
- [ ] Graph-only facets, persisted per project in `ProjectViewState` beside `groupFieldId` and
      `collapsedColumns` at [`ui-store.ts:461–470`](../../../packages/app/src/store/ui-store.ts):
  - [ ] **Show sub-issue hierarchy** — the `contains` layer, off by default.
  - [ ] **Blocked only** / **Ready only** — mutually exclusive; the two questions this view exists to
        answer, one click each.
  - [ ] **Depth from selection** — `off | 1 | 2`, showing only nodes within N blocking hops of the
        selected node. The answer to "why can't I start this", on a board too big to read whole.
  - [ ] **Hide isolated nodes** — a board where six items have dependencies and ninety do not is
        ninety boxes of noise around the thing you came to look at. Off by default; the empty-graph
        state must not be reachable by turning this on.
- [ ] Every facet is reflected in a filter-active indicator, matching the toolbar's existing one. A
      graph silently hiding half its nodes is worse than no graph.
- [ ] `blockedByFieldName` (default `Blocked by`) on the Projects settings page at
      [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx),
      with help text explaining the three-source ladder and that leaving it blank disables the field
      layer entirely.

## Files this phase touches

**New — shared**
- `packages/shared/src/domain/forge-graph.ts` + `.test.ts` — the graph vocabulary, the ladder,
  `parseBlockerRefs`, readiness, foreign nodes, the cap.

**New — app (renderer)**
- `packages/app/src/features/projects/graph/graph-layout.ts` + `.test.ts` — ranking, barycentre
  ordering, `topAlignedViewport`, `FORGE_GRAPH_GEOMETRY`.
- `packages/app/src/features/projects/graph/edge-appearance.ts` + `.test.ts` — the five blocking
  states, containment, `source`-derived confidence.
- `packages/app/src/features/projects/graph/project-graph-view.tsx` + `.test.tsx` — the canvas.
- `packages/app/src/features/projects/graph/project-graph-node.tsx` + `.test.tsx` — the node.
- `packages/app/src/features/projects/board/card-chrome.tsx` — badge row and avatar stack, extracted
  from `task-card.tsx` so card and node share one.
- `packages/app/e2e/project-graph.spec.ts`, `packages/app/e2e/project-graph-shots.spec.ts`,
  `packages/app/e2e/project-graph-glow-shots.spec.ts`.

**Edited — shared**
- [`packages/shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts)
  — `ForgeIssueLink`, `ForgeIssueLinkSet`, and `dependencies` on the issue variant of
  `ForgeProjectItemContentSchema` (`:120–135`). The PR and draft variants are unchanged.

**Edited — desktop (main)**
- [`packages/desktop/src/main/forge/gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts)
  — four fields into `PROJECT_ITEMS_QUERY`'s Issue fragment (`:125`), `DEPS_PAGE`, and the item
  mapper. **No handler change and no new channel** —
  [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts) and
  [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) are untouched.

**Edited — app (renderer)**
- [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `'graph'` on `projectsMode`
  (`:994–995`), the graph facets on `ProjectViewState` (`:461–470`). **No persist version bump.**
- [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx) — the third
  mode segment and its branch (`:186–195`).
- [`styles.css`](../../../packages/app/src/styles.css) — `.card-run-glow` (`:2094–2147`) generalised
  to `.agent-run-glow`; the edge-state keyframes, each reduced-motion-guarded.
- [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx) — onto the
  renamed class (`:105–107`) and onto `card-chrome.tsx`.
- [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx)
  — `blockedByFieldName`.

**Unchanged and load-bearing**
- [`glow-state.ts`](../../../packages/app/src/features/projects/board/glow-state.ts) and
  [`use-card-status.ts`](../../../packages/app/src/features/projects/board/use-card-status.ts)
  (**unchanged**) — the graph node subscribes through them exactly as the card does. That they need
  no change is the evidence the two surfaces really are one state.
- [`workflow-geometry.ts`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)
  and [`workflow-path.ts`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)
  (**unchanged**) — reused verbatim. If either needs editing to serve this phase, the edit belongs in
  a new module instead; the workflow canvas has its own tests and its own phase.
- [`filter.ts`](../../../packages/app/src/features/projects/filter.ts) (**unchanged**) — Phase 52
  generalised it for a second consumer, and this is that consumer.
- [`kanban-glow-shots.spec.ts`](../../../packages/app/e2e/kanban-glow-shots.spec.ts) (**unchanged**)
  — the proof Theme F did not regress the card.
- `packages/git-engine` (**unchanged**) — nothing in this phase is git.
- `packages/app/package.json` (**unchanged**) — no `@xyflow/react`, no `dagre`, no new dependency.

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Unit: `parseBlockerRefs` across the keyword × format matrix — `Blocked by`, `blocked-by:`,
      `Depends on`, `Requires`, each with `#12` and `owner/repo#12`; a comma/`and` list; `Blocks #12`
      producing nothing; a `#12` inside a fenced block, an inline-code span and a link target
      producing nothing; an empty body returning `[]`.
- [ ] Unit: ladder precedence — an item carrying all three sources yields exactly one `blocks` edge
      with `source: 'api'`; removing the api layer promotes `field`; removing both promotes `body`.
- [ ] Unit: `parent`/`subIssues` never change `blocked`, `ready` or `unmetBlockerCount`.
- [ ] Unit: a cross-repo blocker keeps its `repo` and is not collapsed with a same-numbered local issue.
- [ ] Unit: foreign nodes from each source; a field/body-derived foreign node titled `#N` with a null
      state; a mutual `blockedBy` pair rendering both edges without an infinite rank.
- [ ] Unit: the 300-node cap sets `truncated` and reports the true `totalCount`.
- [ ] Unit: `layoutForgeGraph` — a three-rank chain, a diamond, two disconnected components that do
      not overlap, an isolated node, an empty graph; `contains` edges not affecting rank.
- [ ] Unit: `topAlignedViewport` for fits-horizontally, overflows-horizontally, taller-than-canvas.
- [ ] Unit: `edgeAppearance` for all five blocking states plus containment plus a `body`-sourced edge.
- [ ] Unit: `gh-project.ts`'s mapper against fixtures — two blockers, a cross-repo blocker, a parent,
      an over-page sub-issue set (truncation flag), a PR item and a draft item growing no field.
- [ ] Unit: `styles-motion-guards.test.ts` passes with the new keyframes — guarded or allowlisted
      with a reason, no exceptions.
- [ ] RTL: filtering out one endpoint removes the edge; **blocked only** and **ready only** are
      mutually exclusive; **depth from selection** at 1 and 2; **hide isolated** cannot produce the
      empty state.
- [ ] RTL: a blocked node's start action is disabled and its tooltip names the blocker numbers; an
      isolated (unblocked, not `ready`) node's start action is enabled.
- [ ] e2e: `project-graph.spec.ts` — switch to graph mode, assert nodes and edges, select a node and
      assert the existing detail panel opens, `Home` re-fits, arrow keys walk an edge.
- [ ] e2e: `kanban-glow-shots.spec.ts` passes **unchanged**.
- [ ] e2e: `project-graph-glow-shots.spec.ts` — the node in `running`, `waiting`, `open` and `idle`,
      light and dark, plus reduced motion.
- [ ] `moon run app:build desktop:bundle && node scripts/perf/bundle-report.mjs` — entry chunk within
      noise of its pre-phase value. A dependency graph that costs the app's startup is a bad trade.
- [ ] `node scripts/perf/idle-cpu.mjs --blurred` on a board with running agents and a 200-node graph
      open — the blurred figure must match a closed graph. The focus gate is the whole defence.
- [ ] **Open, for a human:** a real board using GitHub's dependency feature. Confirm the edges match
      what GitHub's own issue pages say, in both directions, including a cross-repo blocker.
- [ ] **Open, for a human:** a real board using **none** of the three sources. Confirm the zero-edge
      state reads as "nothing to draw yet" and names the field it looked for — not as a failure.
- [ ] **Open, for a human:** start an agent from a graph node; confirm the card in board mode lights
      with the same ramp at the same time, and that stopping it clears both.
- [ ] **Open, for a human:** a board over the cap. Confirm the banner, and that the app stays
      responsive while panning it.

## Not in this phase

- **Writing dependencies back to GitHub.** No drag-to-connect, no edge deletion, no `addSubIssue`.
  The graph reads. `wouldCycle` already sits in
  [`workflow.ts:416`](../../../packages/shared/src/workflow.ts) for whenever this is picked up, and
  the `source` field already distinguishes an edge the app could write from one it merely inferred.
- **A terminal inside a graph node.** [`card-terminal.tsx`](../../../packages/app/src/features/projects/board/card-terminal.tsx)
  exists and works on a card, where the layout is a fixed-width column and the visibility rule is one
  `IntersectionObserver`. Inside a pannable, zoomable canvas it is a WebGL-budget and hit-testing
  problem of its own — and Theme G already makes the card one click away.
- **Cross-board or org-wide graphs.** Scoped to the selected board. A blocker elsewhere appears as a
  foreign node with its real title, which is the 90% of the value at 10% of the fetch.
- **Milestones and roadmap lanes.** The crib's Phase 58 D/F. Not modelled here.
- **Dependencies on PRs and draft items.** GitHub does not have them; `blockedBy` and `parent` are
  `Issue` fields. A draft can still acquire edges through the field and body layers, and Theme D's
  empty state says so out loud rather than letting an all-drafts board look broken.
- **`blocking` (the inverse direction) as a source.** Theme A fetches it; Theme B ignores it. Every
  `A blocks B` is a `B blockedBy A` that the dependent's own record already carries, so consuming
  both doubles every edge. It is fetched only so a later phase can offer "what does finishing this
  unblock?" without a query change.
- **Replacing the board.** Graph is a third mode beside table and board, not above them.
- **A dependency graph for anything but GitHub Projects.** Not the commit graph, not workflows, not
  `.midnite/tasks/` phases — those are three other graphs with three other data models.

## Decisions / open questions

- **Resolved — the kanban rainbow already exists; Theme F generalises rather than builds.**
  `.card-run-glow` has carried the `--rainbow-ramp` conic border and `loop-glow-spin` since Phase 37,
  applied by `task-card.tsx` off `glow-state.ts`. Found during the 2026-09-06 grounding audit, after
  the theme had been scoped as new work. The requirement is met on the board today; what is missing is
  the graph node, and the risk is regressing the card while generalising the class — which is why
  `kanban-glow-shots.spec.ts` is a verification item rather than an afterthought.
- **Resolved — nodes are DOM, edges are SVG, and the reason is the ramp.** `workflow-canvas.tsx`
  paints nodes as SVG `<rect>`s, and `.card-run-glow` is a `background-clip: padding-box, border-box`
  technique that no SVG element can wear; SVG has no conic gradient either. The alternatives were a
  faked rotating `<linearGradient>` (visibly different from the card, defeating the point) or
  `<foreignObject>` per node (CSS works, but hit-testing and pan/zoom performance with hundreds of
  them do not). A DOM node layer over an SVG edge layer is react-flow's own model, keeps
  `workflow-geometry.ts` and `workflow-path.ts` reused verbatim, and lets the node share `task-card`'s
  markup. *(Chosen on 2026-09-06 after the render-stack decision was taken; it does not reverse that
  decision — the geometry and path modules are still what is being extended.)*
- **Resolved — all four dependency sources, as a precedence ladder, not a choice.** `blockedBy` leads
  because it is semantically exact and verified available on this account with no preview header;
  the project field is the explicit opt-in; the body parse is the fallback that makes the view useful
  on day one for boards writing it in prose. `parent`/`subIssues` is a *separate* containment layer,
  because merging it would grey out every epic.
- **Resolved — no new IPC channel and no new dependency.** The data is four fields inside a query
  that already runs; the resolver, the layout and the appearance are all pure functions. `dagre` was
  offered and declined at ~90KB for ~40 lines of ranking.
- **Resolved — the graph is a third `projectsMode`, not a rail view.** It inherits Phase 52's shared
  filter toolbar, the board picker and the detail panel. A top-level view would duplicate all three.
- **Resolved — start is gated on `!blocked`, not on `ready`.** They differ only for a node with no
  blockers at all, and gating on `ready` would disable every node on a dependency-free board.
- **Recommended, not settled — the default field name is `Blocked by`.** It is what GitHub's own
  dependency UI calls the relation, so a board that adopted the field before the API existed most
  likely already uses it. Configurable, and blank disables the layer.
- **Recommended, not settled — the node cap is 300.** The crib uses 500 in a browser tab. This is an
  Electron renderer that may also be holding a terminal and a Monaco. If the human pass on a large
  board shows headroom, raise it — the constant and the truncation banner are already in place.
- **Recommended, not settled — `ready` requires blockers that are *closed*, not "in a done column".**
  Closed is the only thing GitHub actually knows; a done column is a per-board convention this
  resolver would have to guess at, and guessing wrong makes the badge lie. Revisit if a board's
  status field turns out to be the more useful signal in practice.
- **Open — how far the `contains` layer should go.** Rendered but off by default, and it does not
  affect blocked state. Whether sub-issues should instead *nest* (a parent drawn as a container
  around its children rather than an edge to them) is a real question this phase does not answer;
  nesting interacts with ranking, culling and the node cap all at once, and it deserves its own look
  once there is a real board to try it on.
- **Open — whether a body-derived edge should be offered for promotion.** The app knows it inferred
  `Blocked by #12` from prose and knows GitHub has a real field for it. Offering "make this a real
  dependency" would be genuinely useful and is precisely the write path this phase excludes. Noted
  here so the `source` field is understood as the hook for it, not as decoration.
