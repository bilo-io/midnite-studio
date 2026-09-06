# Phase 75 — What blocks what, and the agent you point at it

**Refined: x1** · 2026-09-06 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

[Phase 40](phase-40-github-projects.md) brought a GitHub ProjectV2 board into the app.
[Phase 41](phase-41-agentic-kanban.md) let an agent run a card. [Phase 52](phase-52-projects-board-workflows-navigable.md)
and [Phase 54](phase-54-an-issues-view.md) gave every mode one filter toolbar. Nothing in any of them
can say **what has to finish first**.

A board is a set. A backlog is a graph. The columns tell you where a task *is*; they cannot tell you
that #212 cannot start until #199 lands, that #204 has been startable for a week, or that the three
cards a human keeps reaching for are the only three that are actually blocked. This phase draws that
graph, greys out what is blocked, animates each edge according to the state of its two ends, and puts
an agent one click closer to the node that is ready for it.

The model is [`~/Dev/midnite`](https://github.com/bilo-io/midnite)'s task graph — `packages/shared/src/task-graph.ts`,
`packages/web/lib/task-graph-layout.ts`, `packages/web/components/task-graph/`. That implementation is
the design brief: the same `ready` / `unmetBlockerCount` / `foreign` node vocabulary, the same
left-to-right ranking with blockers upstream, and the same five-state edge appearance. Everything
underneath differs, because that app owns its own database and this one is reading somebody else's
board over `gh api graphql`.

> **Five findings from the grounding audits changed this doc. Read them before Theme A.**
>
> **1. The kanban card already wears the rainbow. It has since Phase 37.**
> [`styles.css:2094–2107`](../../../packages/app/src/styles.css) defines `.card-run-glow` as
> `conic-gradient(from var(--loop-glow-angle, 0deg), var(--rainbow-ramp))` over a transparent border,
> spun by `loop-glow-spin 4s linear infinite` and breathed by `card-glow-pulse 2s`, applied by
> [`task-card.tsx:106`](../../../packages/app/src/features/projects/board/task-card.tsx) as
> `` glow === 'idle' ? '' : `card-run-glow is-${glow}` `` off
> [`glow-state.ts`](../../../packages/app/src/features/projects/board/glow-state.ts)'s four-state
> derivation, focus-gated at `:2132` and reduced-motion-guarded at `:2143`. **So "the kanban should
> rainbow while an agent works it" is already true**, and Theme F generalises rather than builds.
>
> **2. `workflow-canvas.tsx` paints its nodes in raw SVG, and `.card-run-glow` cannot survive that.**
> [`workflow-canvas.tsx:502–600`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx)
> is one viewBox'd `<svg>` of `<rect>`, `<text>` and `<circle>` — no `<foreignObject>`. `.card-run-glow`'s
> technique is `background-image` + `background-origin: border-box` + `background-clip: padding-box,
> border-box`: a CSS box-model trick. An SVG `<rect>` has no border box and no background image, and
> SVG has no conic gradient at all. So the canvas is a **hybrid**: HTML nodes absolutely positioned in
> a transformed container, over an SVG layer carrying only edges. This is still "extend the workflow
> canvas" in the sense that matters — [`workflow-geometry.ts`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)'s
> constants and [`workflow-path.ts`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)'s
> `edgePath`, `clientToGraph`, `panBy`, `zoomAtPointer`, `rectsIntersect` and `viewportRect` are reused
> verbatim — but the node layer is DOM, and it is DOM specifically so the ramp works.
>
> **3. There is no reusable "start an agent on a card" function.** The x1 audit found the original
> doc's Theme G premise false. The Start button is
> [`card-composer.tsx:285`](../../../packages/app/src/features/projects/board/card-composer.tsx)
> (`data-testid="card-start"`), and `launch(autoSend)` at `card-composer.tsx:139` is a
> **component-local closure** over `agents`, `agentId`, `modelArgs`, `prompt`, `worktreePath`,
> `repoId` and `taskRef`. The only exported entry point is
> [`startAgent(...)`](../../../packages/app/src/features/terminal/start-agent.ts) at `:34`, which
> requires a non-optional `repoId: string` and `cwd: string`. `task-card.tsx` only ever *reveals* an
> existing session (`:124`, via [`revealSession`](../../../packages/app/src/features/terminal/reveal-session.ts) `:25`).
> **So the graph node does not start an agent — it opens the card's composer, which does.**
>
> **4. The card detail panel cannot be opened from outside `board-view.tsx`.** `selectedItemId` is a
> plain `useState` at [`board-view.tsx:78`](../../../packages/app/src/features/projects/board/board-view.tsx);
> [`CardPanelStack`](../../../packages/app/src/features/projects/board/card-panel-stack.tsx) has no
> store, no route, no context and no exported open action, and its only render site is
> `board-view.tsx:412`. Theme G therefore **lifts that selection into
> [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx)** so board mode
> and graph mode share one panel rather than owning two that can disagree.
>
> **5. This repo has no `--status-*` CSS variables.** `grep -rn -- '--status-' packages/app/src`
> returns nothing; `--status-done` / `--status-wip` are the *crib's* tokens, and the original doc's
> edge table cited them. Theme E defines its own `--dep-done` / `--dep-active` / `--dep-idle` instead.

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

**Builds on.** Phase 40 (`gh-project.ts`, `forge-project.ts`, `forge-project-handlers.ts`), Phase 41
(`glow-state.ts`, `use-card-status.ts`, `task-card.tsx`, `card-composer.tsx`, `start-agent.ts`),
Phase 43 (`workflow-geometry.ts`, `workflow-path.ts`, the canvas idiom), Phase 37 (`--rainbow-ramp`,
`--loop-glow-angle`, `loop-glow-spin`), Phase 46 (the motion policy and
`styles-motion-guards.test.ts`), Phase 52 + Phase 54 (`filter.ts`, `ItemFilterToolbar`), Phase 36
(`useWindowFocusGate`, the bundle budget).

**Scope guardrails.** **No new IPC channel.** The one data change is four fields inside an existing
query; everything else is pure derivation over `ForgeProjectItem[]` the renderer already holds.
**No new runtime dependency** — no `@xyflow/react`, no `dagre`. `bundle-report.mjs` should show the
entry chunk unmoved. **Read-only.** This phase never writes a dependency back to GitHub; there is no
drag-to-connect and no edge deletion. **`packages/app` never imports `electron`; `packages/shared`
imports zod and nothing else; `packages/git-engine` is untouched** — nothing here is git.
**The card must not regress.** Theme F changes where the glow is defined, never how it looks.

**Naming hazard, stated once.** [`features/graph/`](../../../packages/app/src/features/graph/) is
already the **git commit graph**, and `GRAPH_COLUMN_BOUNDS` at
[`ui-store.ts:442`](../../../packages/app/src/store/ui-store.ts) belongs to it. Everything this phase
adds is namespaced `features/projects/graph/` and prefixed `FORGE_GRAPH_` / `ForgeGraph`. A bare
`GraphNode` or `graph-layout` in the app's root namespace is a bug waiting to be grepped into.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Sequencing.** The hard chain is **A → B → C → D**; E, F, G and H all need D on screen. A+B landing
alone is invisible but harmless (four fields fetched, a resolver nothing calls). D without E is a
readable but monochrome graph. **Theme F is the exception: it is a pure refactor of
`styles.css` + `task-card.tsx` that can land first, alone, before any graph exists** — and it should,
because `styles.css` is a file several live phases edit and a small early diff there is cheaper to
rebase than a large late one.

## Deliverables

### A — Four fields, one query (M)

Lands first; every other theme reads what it produces. Nothing in this theme renders anything.

- [x] Extend `PROJECT_ITEMS_QUERY`'s `... on Issue{…}` fragment at
      [`gh-project.ts:125`](../../../packages/desktop/src/main/forge/gh-project.ts) with, in one edit:
      `blockedBy(first:${DEPS_PAGE}){totalCount nodes{number title state repository{nameWithOwner}}}`,
      `parent{number title state repository{nameWithOwner}}` and
      `subIssues(first:${DEPS_PAGE}){totalCount nodes{number title state repository{nameWithOwner}}}`.
  - `const DEPS_PAGE = 20;` beside `ASSIGNEES_PAGE`/`LABELS_PAGE` (`gh-project.ts:47` neighbourhood).
  - `totalCount` on every connection so a task with more blockers than the page can say so. An
    under-reported blocker set is the one failure a dependency view must never have.
  - `repository{nameWithOwner}` on every node: GitHub dependencies are cross-repo, and a bare `#12` is
    ambiguous the moment a board spans two repos.
  - **Not** added to `... on PullRequest{…}` (`:126`) or `... on DraftIssue{…}` (`:127`) — those types
    do not have these fields and asking would fail the *whole* query, not that one item.
  - *Acceptance:* `runInShell.mock.calls[0][0]` contains `blockedBy(first:20)` and does **not** contain
    `blockedBy` inside the `PullRequest` or `DraftIssue` fragment.
- [x] `ForgeIssueLinkSchema` and `ForgeIssueLinkSetSchema` in
      [`forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts), above
      `ForgeProjectItemContentSchema`:
  ```ts
  export const ForgeIssueLinkSchema = z.object({
    number: z.number().int().positive(),
    title: z.string().default(''),
    state: ForgeIssueStateSchema.nullable().default(null),
    repo: z.string().default(''), // `owner/name`; '' means "same repo as the board"
  });
  export const ForgeIssueLinkSetSchema = z.object({
    blockedBy: z.array(ForgeIssueLinkSchema).default([]),
    parent: ForgeIssueLinkSchema.nullable().default(null),
    subIssues: z.array(ForgeIssueLinkSchema).default([]),
    blockedByTruncated: z.boolean().default(false),
    subIssuesTruncated: z.boolean().default(false),
  });
  ```
  - `.default(…)` on every field, per this file's existing convention, so a board fetched by an older
    build parses rather than throws.
- [x] Add `dependencies: ForgeIssueLinkSetSchema.default({})` to the **issue** variant of
      `ForgeProjectItemContentSchema` (`forge-project.ts:120–135`) and to **neither** the `pull`
      (`:136`) nor `draft` (`:147`) variant.
  - A `dependencies` field that is always empty on two of three variants is a lie the type system
    would then help spread. Theme B narrows on `content.type === 'issue'` before reading it.
- [x] Map the three connections in `gh-project.ts`'s `parseItemsPage` item mapper, each tolerant of
      `null` (an issue with no parent), an absent key (an older response), and a node missing
      `repository`. `blockedByTruncated = totalCount > nodes.length`.
  - `repo` is `''` when `nameWithOwner` equals the board's own `owner/repo`, so the renderer can show
    `#12` locally and `owner/repo#12` for a foreign one without re-deriving it.
- [x] Extend the `parseItemsPage` suite in
      [`gh-project.test.ts`](../../../packages/desktop/src/main/forge/gh-project.test.ts) (`:159`)
      against the existing `runInShell` seam — `vi.hoisted` mock at `:19–35`, responses fed as
      `runInShell.mockResolvedValueOnce(okShell(JSON.stringify({ data: { node: { items: {…} } } })))`
      using the helper at `:42`.
  - Cases: two same-repo blockers · one cross-repo blocker (asserting `repo === 'other/repo'`) · an
    issue with a parent · five sub-issues · `totalCount: 30` with 20 nodes (asserting
    `blockedByTruncated === true`) · an issue with none of the three keys present · a `PullRequest`
    item and a `DraftIssue` item (asserting `content` has no `dependencies` key).
- [x] Transport assertion in the existing `listProjects / projectFields / projectItems — transport`
      suite (`gh-project.test.ts:374`): the command string carries the new fragment and the existing
      `-f projectId=` / cursor assertions still pass unchanged.

### B — The ladder, as a pure function (L)

The heart of the phase, and the part with no UI in it. Lives in `packages/shared` because it is
derivation over the wire contract, needs zod and nothing else, and has to be testable without
mounting a canvas — the argument [`workflow-path.ts:5–14`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)
already makes for its own arithmetic.

- [x] `packages/shared/src/domain/forge-graph.ts` — the graph's vocabulary:
  ```ts
  export const ForgeGraphEdgeKindSchema = z.enum(['blocks', 'contains']);
  export const ForgeGraphEdgeSourceSchema = z.enum(['api', 'field', 'body']);

  export const ForgeGraphNodeSchema = z.object({
    itemId: z.string(),            // ProjectV2 item node id; '' for a foreign node
    number: z.number().int().nullable(),
    repo: z.string().default(''),
    title: z.string(),
    kind: z.enum(['issue', 'pull', 'draft']),
    state: ForgeIssueStateSchema.nullable().default(null),
    blocked: z.boolean(),
    ready: z.boolean(),
    unmetBlockerCount: z.number().int().nonnegative(),
    foreign: z.boolean().default(false),
    truncated: z.boolean().default(false),
  });

  export const ForgeGraphEdgeSchema = z.object({
    from: z.string(),  // the DEPENDENT's node key
    to: z.string(),    // the BLOCKER's node key
    kind: ForgeGraphEdgeKindSchema,
    source: ForgeGraphEdgeSourceSchema,
  });

  export const ForgeGraphSchema = z.object({
    nodes: z.array(ForgeGraphNodeSchema),
    edges: z.array(ForgeGraphEdgeSchema),
    truncated: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    kind: ForgeProjectReadKindSchema.default('ok'),
  });
  ```
  - **Edge direction: `from` is the dependent, `to` is the blocker.** Written here because it is the
    one thing every other theme gets wrong if it guesses, and because Theme C ranks `to` upstream.
  - **Node key** is `` `${repo}#${number}` `` for anything with a number, and the ProjectV2 `itemId`
    for a draft. Two board items cannot collide, and an `api` blocker and a `body` blocker naming the
    same issue resolve to the same node rather than two.
  - `kind` on the graph mirrors `ForgeProjectReadKind` so a scope failure travels with the data
    instead of being inferred from an empty node list (Theme D renders it).
- [x] `resolveForgeGraph(items, fields, options): ForgeGraph` — the ladder, in precedence order:
  1. **`api`** — `content.dependencies.blockedBy` from Theme A. Authoritative; nothing overrides it.
  2. **`field`** — a project field whose `name` equals `options.blockedByFieldName` (default
     `'Blocked by'`, case-insensitive), read via the existing `ForgeProjectFieldValue` union and
     parsed by `parseBlockerRefs`. Skipped entirely when no such field is on the board — the common
     case, and it must cost nothing.
  3. **`body`** — `parseBlockerRefs(content.body)`, consulted **only** for a node the two layers above
     produced no `blocks` edge for.
  - `options: { blockedByFieldName?: string; nodeCap?: number; boardRepo: string }` — `boardRepo` is
    what makes `repo: ''` resolvable back to a real `owner/name` for display.
  - `parent`/`subIssues` are **not** in this ladder. They are the `contains` layer, derived
    unconditionally and independently, and they never contribute to `blocked` or `unmetBlockerCount`.
    A parent issue is not blocked by its children; treating containment as blocking would grey out
    every epic on the board and be read as a bug.
- [x] `parseBlockerRefs(body: string): ForgeIssueRef[]` where `ForgeIssueRef = { repo: string; number: number }`
      — its own exported, exhaustively tested function, never a regex inline in the resolver.
  - Matches, case-insensitively: `Blocked by`, `blocked-by:`, `Depends on`, `Requires`, each followed
    by `#12` or `owner/repo#12`, and each accepting a comma- or `and`-separated list
    (`Blocked by #12, #13 and owner/repo#14`).
  - **Ignores `Blocks #12`** — that is the inverse relation, and inferring an edge on a *different*
    node from this node's prose produces an edge nobody can find the source of.
  - Strips fenced code blocks (```` ``` ````), inline code spans (`` ` ``) and markdown link targets
    (`](…)`) **before** matching. A body pasting a diff or a URL containing `#12` is common.
  - Returns `[]` for an empty or whitespace body. This is the lowest-confidence layer and its failure
    mode must be "no edge", never "wrong edge" and never "throw".
- [x] Readiness, computed once and only here:
  - `unmetBlockerCount` = blockers whose `state` is neither `'closed'` nor `'merged'`. **Closed is the
    only satisfaction rule** — see Decisions; a Status-column rule cannot be evaluated for a foreign
    blocker at all, because a blocker in another repo has no field values on this board.
  - A blocker with `state: null` (known only by number, from the `field` or `body` layers) counts as
    **unmet**. An unknown blocker is not a satisfied one.
  - `blocked = unmetBlockerCount > 0`.
  - `ready` = an open node with `unmetBlockerCount === 0` **and at least one blocker**. A node with no
    blockers is not "ready", it is unconstrained — flagging every isolated card as ready would make
    the badge meaningless on a board with no dependencies.
- [x] Foreign nodes: a blocker referenced by an in-scope node but not itself a board item becomes a
      node with `foreign: true`, `itemId: ''`, built from the `title`/`state`/`repo` Theme A's query
      already returned. A blocker known only by number gets `title: ''` and `state: null` — visible,
      honestly incomplete, never dropped.
- [x] Hygiene, each its own assertion: self-edges dropped · duplicate edges for one pair collapsed to
      the highest-precedence `source` · a mutual `blockedBy` pair (GitHub permits it) keeps **both**
      edges, with Theme C responsible for not looping on it.
- [x] `FORGE_GRAPH_NODE_CAP = 300` with `truncated` / `totalCount`. Lower than the crib's 500: that is
      a browser tab, this is an Electron renderer that may also hold a pty and a Monaco. Truncation is
      by board order and is **always** surfaced (Theme D), never silent.
- [x] `describeGraphSources(graph): { api: number; field: number; body: number; contains: number }` —
      an exported counter over `edges`, so Theme D's zero-edge empty state can say *which* layer came
      up empty instead of only that the graph is empty.
- [ ] `packages/app/src/features/projects/__fixtures__/project-item.ts` — **the repo's first shared
      `ForgeProjectItem` factory**. Three local ones exist today
      ([`filter.test.ts:19/39/59`](../../../packages/app/src/features/projects/filter.test.ts),
      [`sort.test.ts:6`](../../../packages/app/src/features/projects/sort.test.ts),
      [`board-view.test.tsx:118`](../../../packages/app/src/features/projects/board/board-view.test.tsx))
      and this phase adds four more suites; a fifth hand-rolled factory is the point at which one
      shared factory is cheaper.
  - `issueItem(id, overrides?)`, `pullItem(id, overrides?)`, `draftItem(id, overrides?)`, each
    `(id: string, overrides?: Partial<…>) => ForgeProjectItem`, defaulting `body: ''`, `labels: []`,
    `assignees: []`, `fieldValues: {}` — the four keys the mock bridge returns verbatim without a zod
    parse and which several call sites read unguarded.
  - Existing suites are **not** migrated in this phase. A factory nobody is forced to adopt is a
    smaller diff than five rewritten test files.
  - **Deferred to Theme C/D.** This file lives in `packages/app`, and the test suites that would
    actually consume it (`graph-layout.test.ts`, `project-graph-view.test.tsx`,
    `project-graph-node.test.tsx`) are Theme C/D's own deliverables — Theme B's own
    `forge-graph.test.ts` lives in `packages/shared`, which cannot import an app-level fixture
    (the dependency direction runs the other way), and built its literals locally instead.
    Building this factory here would be `packages/app` work under a `packages/shared`-scoped
    theme, and risks colliding with whichever of C/D adds it first. Left for that theme to add
    when it writes the suite that needs it.
- [x] `forge-graph.test.ts` — the ladder's precedence (an item carrying all three sources yields
      exactly one `blocks` edge with `source: 'api'`; removing api promotes `field`; removing both
      promotes `body`) · the field layer skipped when the field is absent · containment never touching
      `blocked`/`ready`/`unmetBlockerCount` · a cross-repo blocker not collapsing with a same-numbered
      local issue · a `state: null` blocker counting as unmet · a foreign node from each of the three
      sources · a mutual pair · a self-reference · the 300 cap setting `truncated` with a true
      `totalCount` · `describeGraphSources` · and `parseBlockerRefs` across its full keyword × format
      matrix including the code-fence, inline-code and link-target negatives and the `Blocks #12`
      negative.

### C — Ranked left-to-right layout, pure (M) ✅ DONE (PR #207, 2026-09-06)

- [x] `packages/app/src/features/projects/graph/graph-layout.ts` —
      `layoutForgeGraph(graph: ForgeGraph, geometry?: ForgeGraphGeometry): { nodes: PositionedNode[]; edges: PositionedEdge[]; bounds: Rect }`
      where `PositionedNode = ForgeGraphNode & { key: string; x: number; y: number; rank: number }`.
  - **Longest-path ranking** over `blocks` edges only: a node's rank is one past its deepest blocker,
    so reading left→right follows completion order and every blocking arrow points rightward. This is
    the crib's `rankdir: 'LR'` with `dagre` replaced by ~40 lines — the reason the dependency was
    declined.
  - `contains` edges do **not** influence rank. A sub-issue is not downstream of its parent in time.
  - **Cycle rule, stated precisely:** ranking runs over a DAG built by dropping, from each mutual
    pair, the edge whose `source` is lower-precedence (`body` < `field` < `api`); on a tie, the edge
    whose `from` key sorts later. Both edges still render. This is deterministic, so two runs over one
    board produce identical layouts.
- [x] Within-rank ordering: **barycentre** over two forward/backward sweeps, ties broken by the node's
      index in `graph.nodes` — which is the board's own API order, since
      [`board-derive.ts:36`](../../../packages/app/src/features/projects/board/board-derive.ts)'s
      `deriveColumns` shows there is no persisted per-card ordering anywhere to inherit.
  - Two sweeps, not to convergence: crossing reduction is a heuristic either way, and an unbounded
    loop on a 300-node graph is a frame budget nobody agreed to spend.
- [x] `topAlignedViewport(bounds: Rect, width: number, zoom: number, padding: number): Viewport` —
      ported from the crib for its stated reason: a fit that *centres* a graph taller than the canvas
      wastes a band at the top and clips the bottom. Top-align, centre horizontally when it fits,
      left-align when it does not. Returns `workflow-geometry.ts`'s `Viewport` shape so
      `panBy`/`zoomAtPointer` consume it unchanged.
- [x] `FORGE_GRAPH_GEOMETRY = { width: 200, height: 64, rankGap: 96, nodeGap: 20 } as const` beside it
      — as data, the move [`workflow-geometry.ts:1–12`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)
      makes for the same reason: numbers that have to move together, out of JSX and out of the
      arithmetic, so both stay testable against one source.
- [x] `graph-layout.test.ts` — a three-rank chain (ranks 0/1/2) · a diamond · two disconnected
      components whose bounding boxes do not overlap · an isolated node · a mutual pair terminating ·
      a `contains`-only pair sharing a rank · an empty graph returning `{x:0,y:0,width:0,height:0}`
      rather than `NaN`.
  - *Acceptance for the cycle case:* `layoutForgeGraph` returns within one tick and both edges appear
    in `edges`.
- [x] `topAlignedViewport` unit cases: fits-horizontally (centred) · overflows-horizontally
      (left-aligned at `padding`) · taller-than-canvas (top pinned at `padding`, not centred).

### D — The canvas (L)

HTML nodes over an SVG edge layer, for the reason in finding 2. Everything that is *not* the node
layer is reused rather than rewritten.

- [x] `packages/app/src/features/projects/graph/project-graph-view.tsx` —
      `ProjectGraphView({ graph, items, fields, projectId, selectedItemId, onSelectItem, agentStates })`.
      One `<div>` establishing the transform, containing an absolutely-positioned `<svg>` edge layer
      and, above it, absolutely-positioned HTML nodes.
  - Pan, zoom and pointer→graph conversion come from `workflow-path.ts`'s `panBy`, `zoomAtPointer`,
    `clientToGraph` and `dragDeltaToGraph` **unchanged** — they take a `Viewport` and return one, and
    know nothing about SVG.
  - Zoom clamped by `WORKFLOW_ZOOM_BOUNDS` (`[0.25, 2]`).
  - **Adapted:** `outPort`/`inPort` are declared locally in `project-graph-view.tsx` rather than reused
    from `workflow-path.ts` — that module's own versions bake in `WORKFLOW_NODE_GEOMETRY` (160×56),
    not this graph's `FORGE_GRAPH_GEOMETRY` (200×64), so reusing them verbatim would place every port
    at the wrong offset. `edgePath`/`panBy`/`zoomAtPointer`/`clientToGraph`/`rectsIntersect`/
    `viewportRect` are node-geometry-agnostic and are reused verbatim as planned.
  - **Adapted:** `onSelectItem` is typed `(itemId: string | null) => void`, not `(itemId: string) =>
    void` — `null` is what `Escape` passes to clear the selection. `CardPanelStack`'s own `onClose`
    stays a separate callback; a future caller (Theme G) wires `onSelectItem={(id) => id &&
    setSelectedItemId(id)}` and `onClose={() => setSelectedItemId(null)}` onto one piece of state.
  - **Scope note:** this component does not mount `CardPanelStack` — that mount is Theme G's own
    checklist item ("The graph mounts `CardPanelStack` on the same terms `board-view.tsx:411–421`
    does"). `selectedItemId`/`onSelectItem` are wired all the way through (`ProjectsView` owns a local
    `graphSelectedItemId` for now) so a node visually selects and is keyboard-focusable, but no detail
    panel opens yet — Theme G plugs one in without touching this component's contract.
- [x] **Wheel handling is a non-passive native listener**, registered in a `useEffect` with
      `{ passive: false }` — mirroring [`workflow-canvas.tsx:139–151`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx),
      which does exactly this because React's synthetic `onWheel` is passive and cannot
      `preventDefault()`. An `onWheel` prop here would scroll the page instead of zooming the graph.
- [x] **Culling is graph-space, and it is the only culling.** `viewportRect(viewport, w, h, WORKFLOW_CULL_MARGIN)`
      + `rectsIntersect` decide which nodes mount.
      [`useCardVisible`](../../../packages/app/src/features/projects/board/use-card-visible.ts) is
      **not** used here: it observes with the browser viewport as root, no `rootMargin` and threshold
      0 (`:23`), so inside a transformed container it would answer a different question from the one
      the canvas is asking. Two culling mechanisms disagreeing about one node is the bug this rules out.
  - *Acceptance:* with a 300-node fixture at default zoom, `document.querySelectorAll('[data-graph-node]').length < 60`. ✅ `project-graph-view.test.tsx`.
- [x] **Viewport is component-local `useState`, re-fit on mount** — exactly what `workflow-canvas.tsx`
      does, and nothing is persisted. Opening the graph always shows the whole graph top-aligned,
      which is the useful default. `Home` re-fits.
  - Deliberately not on `ProjectViewState`: that record is **project**-keyed while `projectsMode` is
    **repo**-keyed, so a persisted viewport would be shared across every repo reaching the same board.
- [x] `project-graph-node.tsx` — `ProjectGraphNode({ node, item, fields, glow, selected, onSelect })`,
      a pure component taking `glow: CardGlowState` **as a prop** (Theme F supplies it). Carries
      `data-graph-node`, `data-node-key`, `role="button"`, `tabIndex`.
  - **Adapted:** `tabIndex` is its own explicit prop (default `-1`), not derived from `selected` —
    `selected` is "this node's pane is open" (a visual ring, mirroring `TaskCard`'s `isOpen`);
    `tabIndex` is the roving DOM tab stop (mirroring `board-view.tsx`'s own separate
    `focusedItemId`). Conflating the two would make every selected node also a Tab stop, which is not
    what the board's own pattern does.
- [x] `card-chrome.tsx` — extract from
      [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx), naming
      exactly what moves:
  - `CONTENT_ICON` (`task-card.tsx:208–212`) — **duplicated verbatim** at
    [`card-detail.tsx:104–108`](../../../packages/app/src/features/projects/board/card-detail.tsx);
    both import it after this, which is a free correctness win.
  - `CardTitleRow` (icon + truncated title, `task-card.tsx:109–111`), `CardNumberRow` (number +
    `ExternalLink`, `:137–153`), `CardAssignees` (`:154–166`), `CardFieldChips` (`:170–181` — these
    are **field-value chips** via `formatFieldValue`, not labels; the card has never rendered labels).
  - **Does not move:** `data-card-id` (`:97`) and `tabIndex` (`:96`) — `board-view.tsx:254`'s
    `moveFocusTo` queries `[data-card-id]` and they are that contract. dnd is already outside
    `task-card.tsx` entirely, in `DraggableCard` (`board-view.tsx:610–704`), so a read-only graph
    inherits none of it.
- [x] Widen `projectsMode` at **all three sites**, none of which is optional:
  - `projectsMode: Record<string, 'table' | 'board' | 'graph'>` and
    `setProjectsMode: (repoId: string, mode: 'table' | 'board' | 'graph') => void` —
    landed at `ui-store.ts:1018–1019` (this doc's own `:994–995` citation was stale; audited against
    the tree before editing, per this phase's own file-map-precision rule).
  - A third entry in the literal mode array at
    [`projects-view.tsx:213–236`](../../../packages/app/src/features/projects/projects-view.tsx):
    `{ id: 'graph', icon: LuWorkflow, label: 'Graph view' }`, inside the existing
    `role="group" aria-label="View mode"` and `data-testid="projects-view-mode-slot"`.
  - The read default at `projects-view.tsx:72` (this line number held) — coerces an unrecognised
    persisted value to `'table'` via a small `coerceProjectsMode` helper, rather than passing it
    through.
  - **No persist version bump.** `projectsMode` is already in `partialize` and already merged on
    rehydrate, and a persisted `'table'`/`'board'` stays valid. Verified [PR #200](https://github.com/bilo-io/midnite-studio/pull/200)'s
    `version: 10` bump had already landed on `main`; this theme does not touch `version` at all.
- [x] A third branch in the mode switch at `projects-view.tsx:295`, receiving `filteredItems` exactly
      as `BoardView` does at `:300` — the toolbar at `:239–282` is rendered **above** the branch and is
      already mode-agnostic, so the graph inherits filtering with **zero toolbar edit**.
  - The Group-by `<select>` gated `mode === 'board'` at `:265` stays board-only; the graph does not
    group.
  - **Placement, precisely:** the branch sits *after* the generic "No items"/"No items match" empty
    states (which `mode === 'board'` sits *before*, since `BoardView` renders its own empty columns) —
    so a board with zero items, or zero items after filtering, shows the same generic empty state in
    graph mode it shows in table mode, and `ProjectGraphView`'s own zero-edges/all-drafts states only
    ever fire once there is at least one real item to lay out.
- [x] Four empty and degenerate states, each with literal copy, because a generic "nothing here" makes
      three of them look like a bug:
  - **No board selected** → the existing board picker, unchanged. **Inherited for free**: this check
    sits above the mode switch entirely, so graph mode never needed its own copy of it.
  - **`kind !== 'ok'`** → **inherited for free**, the same way: `scopeMissing` (the `MissingScopeState`)
    and the generic `itemsQuery.data?.error` branch both sit above the mode switch already, exactly
    like the "no board" case. Reusing `ScopeFixCommand`'s vocabulary literally meant *not building a
    second copy of it* — the existing early return already is that vocabulary.
  - **Items but zero edges** → the nodes laid out in board order, plus one line built inline (matching
    `describeGraphSources`'s three-source breakdown by naming whether the `Blocked by` field exists on
    this board): *"No dependencies found. Checked GitHub's blocked-by field, a project field named
    "Blocked by" (not on this board), and issue descriptions."*
  - **All items are drafts or PRs** → *"Dependencies live on issues. This board has none."* — GitHub
    does not expose `blockedBy` on `PullRequest` or `DraftIssue`, and an all-drafts board would
    otherwise look broken.
  - **`truncated`** → a persistent banner: *"Showing the first N of M items."* Never silent.
- [x] A collapsible legend, expanded on first open then remembered per project (via `localStorage`,
      keyed by `projectId` — the same pattern `wallpaper.ts`/`use-weather.ts` already use for a
      lightweight per-viewer preference, not a `ui-store.ts` field): the five blocking-edge states, the
      containment edge, blocked and ready node treatments, the foreign node, and the reduced-confidence
      `body` edge. **Adapted:** since Theme E has not landed, the legend's swatches are neutral
      placeholders (solid/dashed borders) describing what each concept *will* look like once Theme E
      supplies the real `--dep-*` treatment, rather than guessing at colours that theme owns.
- [x] Level of detail below `scale < 0.5`: nodes render title only, chips and avatars dropped. Node
      text at 0.25 is illegible, so this is a level of detail, not a scrollbar.
      *Acceptance:* at `scale: 0.4`, a node contains no `[data-card-chip]` element. ✅ `project-graph-view.test.tsx`.
- [x] `packages/app/src/features/projects/graph/graph-keyboard.ts` — pure, **edge-following**, and
      new: [`board-keyboard.ts`](../../../packages/app/src/features/projects/board/board-keyboard.ts)'s
      six exports are typed against `BoardColumn`, a 2-D column/row model that cannot describe
      free-positioned nodes.
  - `moveAlongEdge(nodes, edges, fromKey, direction: 'left' | 'right'): string | null` — Left goes to
    a blocker (`to` of a `blocks` edge whose `from` is this node), Right to a dependent. Ties broken
    by the target's rank index, so it is deterministic.
  - `moveWithinRank(nodes, fromKey, delta: 1 | -1): string | null` — Up/Down among same-rank siblings.
  - Walking the graph *is* the view's purpose; this is the only scheme where the keyboard teaches you
    the dependency structure.
- [x] Focus follows the board's proven pattern: roving `tabIndex` (`0` on the focused node, `-1`
      elsewhere) **plus** real DOM focus via a `[data-node-key]` query, mirroring `moveFocusTo` at
      `board-view.tsx:251–255`. `Enter`/`Space` on the node selects (Theme G); `Escape` clears
      selection; `Home` re-fits.
  - **Adapted:** "selects" here calls the controlled `onSelectItem(node.itemId)` — the plumbing Theme G
    needs is in place, but no panel opens on that call yet (see this theme's own scope note above);
    "Escape clears selection" calls `onSelectItem(null)`.
  - jsdom has no `CSS` global, so the unit suite stubs `CSS.escape` exactly as
    `board-view.test.tsx:14–16` already does.

### E — Edge states, and what blocked looks like (L) ✅ DONE (PR #210, 2026-09-06)

- [x] Three CSS variables in [`styles.css`](../../../packages/app/src/styles.css), defined in **both**
      the light `:root` block and the dark block, beside the existing `--health-*` group (`:37–40`):
      `--dep-done`, `--dep-active`, `--dep-idle`.
  - Deliberately **not** `--health-ok`/`--health-warn`/`--health-fail`: those mean repo health, and a
    future change to what "warn" looks like should not silently restyle a dependency graph. Three new
    tokens in two blocks is the cost of that independence.
  - Deliberately **not** raw hex: the graph is a themed surface and Phase 64 built the engine that
    themes it.
  - `--dep-done` borrows `var(--success)` and `--dep-idle` borrows `var(--muted-foreground)` — both
    already lift themselves for `.dark`; `--dep-active` has no existing token to borrow (no other
    surface means "work is happening right now") and is declared literally in both blocks.
- [x] `packages/app/src/features/projects/graph/edge-appearance.ts` —
      `edgeAppearance(edge: ForgeGraphEdge, source: ForgeGraphNode, target: ForgeGraphNode): { className: string; strokeWidth: number }`,
      pure, keyed off the two endpoints. The crib's five blocking states, kept intact because they are
      correct (source = the blocker, target = the dependent it feeds):
  | blocker | dependent | appearance |
  |---|---|---|
  | closed | closed | solid `--dep-done`, 2.5px — the chain is complete |
  | closed | `ready` | animated dash, `--dep-done` **+ bloom** — this blocker cleared the path |
  | closed | still blocked | animated dash, `--dep-done` — done, but other blockers remain |
  | open, agent running | blocked | animated dash, `--dep-active` — work is happening upstream |
  | otherwise | — | static `--dep-idle`, 1.5px — a quiet, not-yet-started dependency |
  - **Adapted:** "agent running" is not a `ForgeGraphNode` field — it lives in `useGraphAgentStates`'
    `CardGlowState` map, one level above this module. Rather than leave the fourth row undecidable
    under the doc's literal two-node signature, the function takes a fourth, defaulted
    `sourceGlow: CardGlowState = 'idle'` parameter: still pure, and a foreign blocker (never a board
    item, never in the glow map) resolves to `'idle'` by the same default, which is correct — a node
    nobody can start an agent on is never "agent running". `project-graph-view.tsx` looks the blocker
    up at `edge.to` and passes its glow from the same `agentStates` map the nodes read.
- [x] `contains` edges: one appearance, never animated — `--dep-idle` at 0.4 opacity on a **wider dash
      period** than any blocking dash, so the two separate at a glance without relying on colour. Off
      by default (Theme H).
- [x] A `source: 'body'` edge renders **dotted rather than dashed** and at 0.7 opacity, with the legend
      saying why: *"inferred from the issue description — may be incomplete."* An edge the app guessed
      at must not look as certain as one GitHub asserted. This is the same distinction Theme G uses to
      decide whether an edge may disable a Start button.
- [x] The dash animation is `stroke-dashoffset` on a **CSS keyframe**, never a React-driven `animated`
      prop. One keyframe, one class, N edges — 300 edges animating through React state is the frame
      budget gone.
- [x] Blocked nodes: `opacity: 0.55` plus `filter: saturate(0.4)`. Applied to the **node body**, never
      to the glow layer — a blocked node whose agent is somehow running must still read as running, so
      Theme F's ring wins over Theme E's dimming. Stated as an explicit precedence, not left to
      cascade order.
- [x] `ready` nodes get an affirmative badge, not merely the absence of dimming. The graph's whole
      argument is "here is what you can start now"; making that state legible only by *not* being grey
      wastes it.
- [x] **Motion policy — the rule, not the goal.**
      [`styles-motion-guards.test.ts:110–128`](../../../packages/app/src/styles-motion-guards.test.ts)
      requires, for every `@keyframes` in `styles.css`: (i) it is referenced by at least one
      `animation:`/`animation-name:` declaration, and (ii) for at least one such usage, the
      **enclosing selector's class names** intersect the class names appearing inside a
      `@media (prefers-reduced-motion: reduce) { … }` block. So each new keyframe's `animation:` must
      sit on a class that is itself named in a reduced-motion block. The escape hatch is `ALLOWLIST`
      at `:40–42`, whose value is a human-written reason and whose addition is therefore reviewed.
- [x] Reduced motion keeps every colour and drops every animation — so **the five states must already
      separate with the animation frozen**, by dash pattern and stroke width alone. A state
      distinction carried only by movement is unavailable to a reader who turned movement off.
- [x] Focus gating: the canvas calls `useWindowFocusGate` the way
      [`BoardView`](../../../packages/app/src/features/projects/board/board-view.tsx) already does, and
      a blurred window pays for no edge animation.

### F — One rainbow, two surfaces (M)

**Changes where the treatment is defined, never how it looks.** Can land first, alone, before any
graph exists — and should, because `styles.css` is a contended file.

- [x] Generalise `.card-run-glow` (`styles.css:2094–2147`) into `.agent-run-glow`, carrying the same
      `--loop-glow-angle` conic ramp, the same `loop-glow-spin 4s` + `card-glow-pulse 2s` pair, the
      same `is-running` / `is-waiting` / `is-open` states, the same focus gate at `:2132` and the same
      reduced-motion guard at `:2143`. ✅ PR #205. Also generalised `workflows-view.tsx`'s run-history
      button, which the x1 audit had missed — it wore `.card-run-glow is-running` before this theme
      even touched the graph.
- [x] ⚠️ **`.card-run-glow` must survive as a real class, not be deleted.**
      [`kanban.spec.ts:265–314`](../../../packages/app/e2e/kanban.spec.ts) asserts the **literal
      string**: `await expect(card).toHaveClass(/card-run-glow/)`, `toHaveClass(/is-running/)`,
      `await expect(otherCard).not.toHaveClass(/card-run-glow/)`, and
      `expect(await card.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('conic-gradient')`.
      Either keep `.card-run-glow` permanently as a co-applied alias on the card, **or** update those
      four assertions in the same commit. Pick one and say which in the code — a rename that leaves
      the spec red is how this theme gets reverted. **Decided: renamed, not aliased** — the doc's own
      "Open" decision recommended this (a permanent alias is a second name for one visual, and this
      doc's own argument against two definitions applies to two names too), and `_INDEX.md`'s Theme F
      summary already committed to it. `kanban.spec.ts`'s four assertions moved to `agent-run-glow` in
      the same commit.
- [x] `useGraphAgentStates(projectId: string): Map<string, CardGlowState>` in
      `features/projects/graph/use-graph-agent-states.ts` — **one subscription for the whole canvas**,
      not one per node.
  - Why: [`useCardStatus`](../../../packages/app/src/features/projects/board/use-card-status.ts) takes
    three whole-slice selectors (`s.sessions`, `s.states`, `s.activity`, `:32–34`) and calls
    `findAnyCardSession`, a **linear scan** (`terminal-store.ts:756`). Per node at 300 nodes that is
    300 subscriptions × O(sessions) on every store tick.
  - This hook takes the same three slices **once**, walks `sessions` in a single pass building
    `Map<itemId, CardGlowState>` via the existing `deriveCardGlowState`, and each node receives its
    state as a plain prop — making `ProjectGraphNode` pure and memoizable.
  - The board is **not** migrated onto it. `TaskCard` keeps `useCardStatus`; a column holds tens of
    cards, not hundreds, and rewriting a working surface is not this phase's business.
  - *Acceptance:* a render-count test — with 300 nodes and one session transitioning
    `idle → open`, `ProjectGraphNode` renders at most twice for the affected node and zero times for
    the other 299. **Adapted:** `ProjectGraphNode` does not exist yet (Theme D). The render-count test
    in `use-graph-agent-states.test.tsx` uses a memoized stand-in consumer instead, locking in the
    property the acceptance criterion actually needs — unaffected map entries keep the same string
    reference across renders, which is what lets a real memoized node bail out later. Re-verify against
    the real `ProjectGraphNode` once Theme D lands.
- [x] **Closed by Theme D** — the graph node consumes `CardGlowState` through the same
      `deriveCardGlowState` the card uses, so an agent started from the composer lights the node and
      the card simultaneously, by construction rather than by coincidence. `ProjectGraphNode` takes
      `glow` as a plain prop fed by `useGraphAgentStates`, wearing the identical `agent-run-glow
      is-${glow}` class the card does.
  - **Found wiring this up:** `useGraphAgentStates` read an always-empty terminal store, because
    nothing reachable from graph mode ever called `hydrate()` — the exact trap `board-view.tsx`'s own
    comment names for its surface ("a fresh boot leaves the glow inert" — only `TerminalPanel` and the
    FAB called it before this). Fixed by hydrating inside the hook itself, so any future consumer gets
    it for free without needing to know the trap exists.
- [x] **Closed by Theme D** — `waiting`, `open` and `idle` keep their existing distinct treatments on
      both surfaces. Proven directly on `ProjectGraphNode` (`project-graph-node.test.tsx`) now that a
      real node exists to assert it against, and visually in
      `project-graph-glow-shots.spec.ts` (running/waiting/idle, light and dark).
- [x] **Closed by Theme D** — the bloom is **graph-only**: a blurred copy behind the node (the
      crib's `::after`). `.project-graph-node.agent-run-glow.is-running::after` /
      `.is-waiting::after` in `styles.css`, scoped to the graph node's own class so the card never
      grows one; the node's `overflow-hidden` was removed (it isn't load-bearing — title truncation is
      the inner span's own `truncate`) since it would otherwise clip the bloom's −10px bleed.
- [x] **Closed by Theme D** — `project-graph-glow-shots.spec.ts` following
      [`kanban-glow-shots.spec.ts`](../../../packages/app/e2e/kanban-glow-shots.spec.ts) exactly:
      gated on `MSTUDIO_SHOTS`, `setReducedMotion(page)` before shooting, running/waiting state faked
      by a seeded `terminalSessions` fixture with `surface: 'kanban'` and the node's `taskRef` (waiting
      via the same `window.__mstudioPtyActivity` seam `fab-halo-shots.spec.ts` already uses — the mock
      bridge has no static fixture field for it), `shotPath(OUT, …)` with a 20px clip pad. Six shots
      (running/waiting/idle × light/dark) confirmed the ramp, the amber ring and the bloom all render
      correctly once the hydrate fix above landed.

### G — Point an agent at a node (M)

The node does not start an agent. It selects the item, which opens the composer that already does —
one start UI in the whole app, and `startAgent` keeps exactly one caller.

- [ ] **Lift card selection out of `BoardView`.** `selectedItemId` moves from
      [`board-view.tsx:78`](../../../packages/app/src/features/projects/board/board-view.tsx)'s local
      `useState` up to [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx),
      which passes `selectedItemId` and `onSelectItem` down to `BoardView` and to `ProjectGraphView`.
  - `BoardView` gains two props and loses one `useState`; its `focusedItemId` roving-focus state stays
    local, because that is about the DOM, not about which card is open.
  - One selection for the whole view: a card opened in board mode and a node opened in graph mode are
    the same panel, and switching modes keeps it open on the same item.
  - `CardPanelStack` itself is **unchanged** — it already takes `selectedItemId`/`onSelectItem`/
    `onClose` as plain props (`card-panel-stack.tsx:30–55`).
  - *Acceptance:* an RTL test selecting an item in board mode, switching to graph mode, and asserting
    `card-detail` is still mounted for the same item.
- [ ] The graph mounts `CardPanelStack` on the same terms `board-view.tsx:411–421` does — same
      `projectId`/`repoId`/`worktreePath`/`items`/`fields`, same `w-80 shrink-0 border-l` sibling
      position — so there is one panel component with two mount sites, not two panels.
- [ ] **Start is disabled on a blocked item**, in
      [`card-composer.tsx`](../../../packages/app/src/features/projects/board/card-composer.tsx)
      beside the existing `data-testid="card-start"` button at `:285`:
  - Disabled when the item has ≥1 unmet blocker **from an `api`- or `field`-sourced edge only**.
  - **A `body`-sourced edge never disables Start.** It is the layer the app inferred from prose and
    the likeliest to be wrong, and a wrong prose parse must not lock a user out of their own card.
  - The disabled button's `title` names the blockers — `Blocked by #199, #204` — not a count. The
    numbers are the actionable part and the graph already knows them.
  - `CardComposer` takes one new optional prop, `blockers?: readonly ForgeIssueRef[]`, defaulting
    `undefined` so every existing call site compiles unchanged and board mode is unaffected until the
    graph supplies it.
- [ ] Selecting a node opens the existing detail panel unchanged. The graph is a way of *finding* a
      card; inventing a second detail surface would double the cost of every field the panel grows.
- [ ] The running node's terminal stays on the card. See **Not in this phase**.
- [ ] RTL: opening a blocked node's panel renders a disabled `card-start` whose `title` contains both
      blocker numbers; opening a `body`-blocked node's panel renders an **enabled** `card-start`.

### H — Filters, and the graph's own facets (M)

- [ ] The graph reads the existing shared toolbar with **no toolbar edit at all**.
      [`ItemFilterToolbar`](../../../packages/app/src/components/item-filter-toolbar.tsx) (`:32`,
      lifted out in **Phase 54 Theme E** — not Phase 52, which had the in-view original) is rendered
      once above the mode branch at `projects-view.tsx:239–282` and hands every mode an
      already-filtered array via `filterProjectItems(allItems, view.filter)` (`:148`). Query,
      assignees, labels, states and types all apply for free.
- [ ] Filtering narrows the node set **before** layout, and an edge renders only when *both* endpoints
      survive — the crib's rule, and why a filtered-out node's dependencies vanish cleanly rather than
      dangling into empty space.
- [ ] Graph-only facets as one nested object on `ProjectViewState`
      ([`ui-store.ts:458`](../../../packages/app/src/store/ui-store.ts)), added to
      `DEFAULT_PROJECT_VIEW` (`:466`):
  ```ts
  graph: {
    showContains: boolean;        // default false
    only: 'all' | 'blocked' | 'ready';  // default 'all'
    depth: 0 | 1 | 2;             // 0 = off; hops from the selected node
    hideIsolated: boolean;        // default false
  }
  ```
  - ⚠️ `setProjectView` **shallow-merges** (`ui-store.ts:1812–1821`), so a facet change must pass the
    whole `graph` object: `setProjectView(id, { graph: { ...view.graph, showContains: true } })`.
    Passing a partial silently drops the other three.
  - `projectViewByProject` is **project**-keyed while `projectsMode` is **repo**-keyed, so these
    facets follow the board across every repo that reaches it. That is correct for a facet describing
    the board's own shape, and it is why the *viewport* deliberately is not stored here (Theme D).
  - No persist version bump: `projectViewByProject` is already in `partialize` (`:1874`) and a
    rehydrated record without `graph` falls back through `DEFAULT_PROJECT_VIEW`.
  - `PROJECT_VIEW_LRU_CAP = 20` ([`project-view-lru.ts:11`](../../../packages/app/src/features/projects/project-view-lru.ts))
    already bounds this record; nothing new to evict.
- [ ] **Show sub-issue hierarchy** — the `contains` layer, off by default.
- [ ] **Blocked only / Ready only** — a three-way `only` rather than two booleans, because "blocked and
      ready" is empty by construction and two checkboxes would advertise a state that cannot exist.
- [ ] **Depth from selection** — `off | 1 | 2` hops along `blocks` edges from the selected node. The
      answer to "why can't I start this", on a board too big to read whole. Disabled with a tooltip
      when nothing is selected.
- [ ] **Hide isolated nodes** — a board where six items have dependencies and ninety do not is ninety
      boxes of noise. Off by default, and it must not be able to produce the empty state: with it on
      and zero edges, the zero-edge copy still renders.
- [ ] The graph's facets feed the same filter-active indicator the toolbar already shows, extending
      `isProjectItemFilterEmpty`'s result with `graph` being non-default. A graph silently hiding half
      its nodes is worse than no graph.
      *Acceptance:* turning on `hideIsolated` alone flips the indicator on.
- [ ] `blockedByFieldName` (default `'Blocked by'`) on
      [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx)
      as a fourth `Accordion`, using `TextField` wrapped in `Field` — both re-exported by
      [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) (a
      6-line barrel over `components/form/field.tsx`; `Field` requires both `label` and `hint`).
  - Help text explains the three-source ladder and states that leaving it blank disables the field
    layer entirely.
  - This does not contradict `projects-page.tsx:17–21`'s argument against a board picker here: that
    reasoning is about *which board is open*, which is per-repo navigation state. A field **name** is
    a stable preference about how every board is read.

## Files this phase touches

**New — shared**
- `packages/shared/src/domain/forge-graph.ts` + `.test.ts` — the graph vocabulary, `resolveForgeGraph`,
  `parseBlockerRefs`, readiness, foreign nodes, `describeGraphSources`, the 300 cap.

**New — app (renderer)**
- `packages/app/src/features/projects/graph/graph-layout.ts` + `.test.ts` — ranking, barycentre
  ordering, `topAlignedViewport`, `FORGE_GRAPH_GEOMETRY`.
- `packages/app/src/features/projects/graph/edge-appearance.ts` + `.test.ts` — the five blocking
  states, containment, `source`-derived confidence.
- `packages/app/src/features/projects/graph/graph-keyboard.ts` + `.test.ts` — `moveAlongEdge`,
  `moveWithinRank`.
- `packages/app/src/features/projects/graph/use-graph-agent-states.ts` + `.test.ts` — one subscription
  for the canvas.
- `packages/app/src/features/projects/graph/project-graph-view.tsx` + `.test.tsx` — the canvas.
- `packages/app/src/features/projects/graph/project-graph-node.tsx` + `.test.tsx` — the node.
- `packages/app/src/features/projects/board/card-chrome.tsx` + `.test.tsx` — `CONTENT_ICON`,
  `CardTitleRow`, `CardNumberRow`, `CardAssignees`, `CardFieldChips`.
- `packages/app/src/features/projects/__fixtures__/project-item.ts` — the first shared
  `ForgeProjectItem` factory.
- `packages/app/e2e/project-graph.spec.ts`, `packages/app/e2e/project-graph-shots.spec.ts`,
  `packages/app/e2e/project-graph-glow-shots.spec.ts`.

**Edited — shared**
- [`packages/shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts)
  — `ForgeIssueLinkSchema`, `ForgeIssueLinkSetSchema`, and `dependencies` on the **issue** variant of
  `ForgeProjectItemContentSchema` (`:120–135`). The `pull` (`:136`) and `draft` (`:147`) variants are
  unchanged.

**Edited — desktop (main)**
- [`packages/desktop/src/main/forge/gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts)
  — four fields into `PROJECT_ITEMS_QUERY`'s Issue fragment (`:125`), `DEPS_PAGE`, the item mapper.
- [`packages/desktop/src/main/forge/gh-project.test.ts`](../../../packages/desktop/src/main/forge/gh-project.test.ts)
  — the `parseItemsPage` cases (`:159`) and one transport assertion (`:374`).

**Edited — app (renderer)**
- [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `'graph'` on `projectsMode`
  (`:994–995`), the `graph` facet object on `ProjectViewState` (`:458`) and `DEFAULT_PROJECT_VIEW`
  (`:466`). **No persist version bump.**
- [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx) — the third
  mode button (`:213–236`), the third branch (`:295`), the coerced read default (`:72`), and the
  lifted `selectedItemId`/`onSelectItem`.
- [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx) — two new props
  replacing the local `selectedItemId` `useState` (`:78`).
- [`card-composer.tsx`](../../../packages/app/src/features/projects/board/card-composer.tsx) — the
  optional `blockers` prop and the Start gate at `:285`.
- [`styles.css`](../../../packages/app/src/styles.css) — `--dep-done`/`--dep-active`/`--dep-idle` in
  both theme blocks; `.card-run-glow` (`:2094–2147`) generalised to `.agent-run-glow`; the
  edge-state keyframes, each reduced-motion-guarded.
- [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx) — onto
  `card-chrome.tsx` and the renamed class (`:106`).
- [`card-detail.tsx`](../../../packages/app/src/features/projects/board/card-detail.tsx) — onto
  `card-chrome.tsx`'s `CONTENT_ICON`, deleting its duplicate at `:104–108`.
- [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx)
  — the `blockedByFieldName` accordion.
- [`kanban.spec.ts`](../../../packages/app/e2e/kanban.spec.ts) — ✅ Theme F renamed rather than
  aliased; the four class assertions at `:265–314` moved to `agent-run-glow` in the same commit.

**Unchanged and load-bearing**
- [`glow-state.ts`](../../../packages/app/src/features/projects/board/glow-state.ts) (**unchanged**) —
  both surfaces derive through it, which is why they cannot disagree.
- [`use-card-status.ts`](../../../packages/app/src/features/projects/board/use-card-status.ts)
  (**unchanged**) — the board keeps it; the graph deliberately does not.
- [`card-panel-stack.tsx`](../../../packages/app/src/features/projects/board/card-panel-stack.tsx) and
  [`card-detail.tsx`](../../../packages/app/src/features/projects/board/card-detail.tsx)'s props
  (**unchanged**) — they already take selection as plain props; only the mount sites multiply.
- [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) (**unchanged**) — it
  keeps exactly one caller. If this phase adds a second, the design went wrong.
- [`workflow-geometry.ts`](../../../packages/app/src/features/workflows/canvas/workflow-geometry.ts)
  and [`workflow-path.ts`](../../../packages/app/src/features/workflows/canvas/workflow-path.ts)
  (**unchanged**) — reused verbatim. If either needs editing, the edit belongs in a new module.
- [`item-filter-toolbar.tsx`](../../../packages/app/src/components/item-filter-toolbar.tsx) and
  [`filter.ts`](../../../packages/app/src/features/projects/filter.ts) (**unchanged**) — Phase 54
  generalised them for a second consumer, and this is that consumer.
- [`board-keyboard.ts`](../../../packages/app/src/features/projects/board/board-keyboard.ts)
  (**unchanged**) — its `BoardColumn` model cannot describe free-positioned nodes; the graph gets its
  own module rather than a widened one.
- [`board-dnd.ts`](../../../packages/app/src/features/projects/board/board-dnd.ts) and dnd-kit
  (**unchanged**) — a read-only graph needs none of it, and `task-card.tsx` never imported it anyway.
- [`use-card-visible.ts`](../../../packages/app/src/features/projects/board/use-card-visible.ts)
  (**unchanged**) — deliberately unused by the canvas; see Theme D's culling ruling.
- `packages/git-engine` (**unchanged**) — nothing in this phase is git.
- `packages/app/package.json` (**unchanged**) — no `@xyflow/react`, no `dagre`, no new dependency.

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [ ] Unit: `parseBlockerRefs` across the keyword × format matrix — `Blocked by`, `blocked-by:`,
      `Depends on`, `Requires`, each with `#12` and `owner/repo#12`; a comma/`and` list;
      `Blocks #12` → `[]`; `#12` inside a fenced block, an inline-code span and a link target → `[]`;
      an empty body → `[]`.
- [ ] Unit: ladder precedence — an item carrying all three sources yields exactly one `blocks` edge
      with `source: 'api'`; removing api promotes `field`; removing both promotes `body`.
- [ ] Unit: `parent`/`subIssues` never change `blocked`, `ready` or `unmetBlockerCount`.
- [ ] Unit: a blocker with `state: null` counts as **unmet**; a `closed` and a `merged` blocker both
      count as met.
- [ ] Unit: `ready` is false for a node with zero blockers and true for an open node whose one blocker
      is closed.
- [ ] Unit: a cross-repo blocker keeps its `repo` and does not collapse with a same-numbered local
      issue.
- [ ] Unit: foreign nodes from each of the three sources; a field/body-derived foreign node has
      `title: ''` and `state: null`.
- [x] Unit: a mutual `blockedBy` pair renders both edges and `layoutForgeGraph` terminates.
- [ ] Unit: the 300 cap sets `truncated` and reports the true `totalCount`.
- [ ] Unit: `describeGraphSources` counts each layer separately.
- [x] Unit: `layoutForgeGraph` — a three-rank chain, a diamond, two non-overlapping disconnected
      components, an isolated node, a `contains`-only pair sharing a rank, an empty graph returning
      zeroed bounds rather than `NaN`.
- [x] Unit: `layoutForgeGraph` is deterministic — two runs over one graph produce identical positions.
- [x] Unit: `topAlignedViewport` for fits-horizontally, overflows-horizontally, taller-than-canvas.
- [x] Unit: `edgeAppearance` for all five blocking states, containment, and a `body`-sourced edge.
- [x] Unit: `moveAlongEdge` left/right across a diamond (deterministic tie-break) and returning `null`
      at a source/sink; `moveWithinRank` wrapping behaviour at both ends.
- [ ] Unit: `gh-project.ts`'s mapper against the new fixtures — two blockers, a cross-repo blocker, a
      parent, an over-page sub-issue set (`blockedByTruncated`), an issue with none of the keys, a PR
      item and a draft item growing no `dependencies` field.
- [ ] Unit: the transport command string contains `blockedBy(first:20)` and the existing `-f
      projectId=` / cursor assertions still pass.
- [x] Unit: `styles-motion-guards.test.ts` passes with the new keyframes — each one's `animation:`
      sits on a class named inside a `prefers-reduced-motion: reduce` block, or is allowlisted with a
      written reason.
- [x] Unit: `useGraphAgentStates` render-count — 300 nodes, one session going `idle → open`; the
      affected node renders ≤2 times, the other 299 render zero times. Still the memoized stand-in
      consumer (`use-graph-agent-states.test.tsx`) rather than the real `ProjectGraphNode` — the
      property it locks in (unaffected map entries keep the same string reference) is what a real
      memoized node needs to bail out on, and `project-graph-node.test.tsx` separately proves the real
      node re-renders correctly off a changed `glow` prop.
- [ ] RTL: filtering out one endpoint removes the edge; `only: 'blocked'` and `only: 'ready'` are
      mutually exclusive by construction; `depth: 1` and `depth: 2`; `hideIsolated` with zero edges
      still renders the zero-edge copy rather than the empty state.
- [ ] RTL: turning on `hideIsolated` alone flips the filter-active indicator.
- [ ] RTL: a facet change made via `setProjectView` preserves the other three facets (the
      shallow-merge trap).
- [ ] RTL: selecting an item in board mode, switching to graph mode, and `card-detail` is still
      mounted for the same item.
- [ ] RTL: a blocked node's panel renders a disabled `card-start` whose `title` contains both blocker
      numbers; a **`body`-blocked** node's panel renders an enabled `card-start`.
- [x] RTL: at `scale: 0.4` a node contains no `[data-card-chip]`; at `scale: 1` it does.
- [x] RTL: with a 300-node fixture at default zoom, fewer than 60 `[data-graph-node]` elements are in
      the DOM.
- [x] RTL: each of the four empty states renders its own literal copy — no board and `kind:
      'insufficient-scope'` inherited for free (the mode-agnostic early returns already above the mode
      switch; both already had coverage before this theme), zero edges (naming whether the field
      exists on this board) and all-drafts newly covered in `project-graph-view.test.tsx`/
      `projects-view.test.tsx`.
- [x] RTL: an unrecognised persisted `projectsMode` value coerces to `'table'`.
- [x] e2e: `project-graph.spec.ts` — seeded through `installMockBridge` with
      `MockFixtures['forgeProject']` and the `openBoard` sequence, remembering that `content.body: ''`
      and `content.labels: []` are **required** in e2e fixtures because the mock bridge returns them
      verbatim with no zod parse (this theme's own `dependencies: {…}` joins that list — see the mutual
      `EMPTY_DEPS` constant every new fixture literal now carries). Switch to graph mode, assert nodes
      and edges, click-select a node, `Home` re-fits, arrow keys walk an edge.
  - **Adapted:** does not assert a node opening `card-detail` — that mount is explicitly Theme G's own
    checklist item, not built here (see this theme's own scope note on `ProjectGraphView`). The spec
    says so in its own doc comment, as the place Theme G adds that assertion.
- [x] e2e: `kanban.spec.ts`'s four glow assertions at `:265–314` pass — updated to `agent-run-glow`
      in the same commit as the rename; also ran `kanban-glow-shots.spec.ts` under `MSTUDIO_SHOTS=1` —
      both green, no pixel change.
- [x] e2e: `project-graph-glow-shots.spec.ts` — the node in `running`, `waiting` and `idle`, light and
      dark, under `setReducedMotion` so the ramp rests at `0deg`. (`open` is not shot: it needs a
      lifted selection this theme deliberately doesn't wire yet — see the scope note above — so there
      is no way to put a node in that state without Theme G.)
- [ ] `moon run app:build desktop:bundle && node scripts/perf/bundle-report.mjs` — entry chunk within
      noise of its pre-phase value. A dependency graph that costs the app's startup is a bad trade.
- [ ] `node scripts/perf/idle-cpu.mjs --blurred` on a board with running agents and a 200-node graph
      open — the blurred figure matches a closed graph.
- [ ] **Open, for a human:** a real board using GitHub's dependency feature. Confirm the edges match
      what GitHub's own issue pages say, in both directions, including a cross-repo blocker.
- [ ] **Open, for a human:** a real board using **none** of the three sources. Confirm the zero-edge
      copy names all three and reads as "nothing to draw yet", not as a failure.
- [ ] **Open, for a human:** start an agent from a node's composer; confirm the card in board mode
      lights with the same ramp at the same time, and that stopping it clears both.
- [ ] **Open, for a human:** at 0.5 zoom, confirm the running node's ring and bloom still read as the
      same treatment the card wears at 1×. This is the phase's one visual requirement and no assertion
      can judge it.
- [ ] **Open, for a human:** a board over the cap. Confirm the banner, and that panning stays
      responsive.

## Not in this phase

- **Writing dependencies back to GitHub.** No drag-to-connect, no edge deletion, no `addSubIssue`.
  The graph reads. `wouldCycle` already sits in
  [`workflow.ts:416`](../../../packages/shared/src/workflow.ts) for whenever this is picked up, and
  `source` already distinguishes an edge the app could write from one it merely inferred.
- **Promoting a body-inferred edge to a real dependency.** The app knows it inferred `Blocked by #12`
  from prose and knows GitHub has a field for it. Offering "make this real" is genuinely useful and is
  precisely the write path above.
- **A terminal inside a graph node.** [`card-terminal.tsx`](../../../packages/app/src/features/projects/board/card-terminal.tsx)
  works on a card, where the layout is a fixed-width column and the gate is one `IntersectionObserver`.
  Inside a pannable canvas it is a WebGL-budget and hit-testing problem of its own, and Theme G already
  makes the card one click away.
- **A one-click Start on the node itself.** `launch()` is a closure over agent, model, prompt and
  worktree; reproducing it on a node means either duplicating that state or shipping a second start
  path that drifts. The composer is one click away and already correct.
- **Migrating the board onto `useGraphAgentStates`.** A column holds tens of cards; `useCardStatus` is
  fine there, and rewriting a working surface is not this phase's business.
- **Migrating the three existing local `ForgeProjectItem` factories** onto the new shared one. The
  factory exists for this phase's four new suites; a factory nobody is forced to adopt is a smaller
  diff than five rewritten test files.
- **Visual nesting for sub-issues.** Drawing children inside a parent's box changes ranking, culling
  and the node cap at once. It stays a faint edge until someone has used the view on a real board.
- **Cross-board or org-wide graphs.** Scoped to the selected board. A blocker elsewhere appears as a
  foreign node with its real title — 90% of the value at 10% of the fetch.
- **Milestones and roadmap lanes.** The crib's Phase 58 D/F. Not modelled here.
- **Dependencies on PRs and draft items.** GitHub does not have them; `blockedBy` and `parent` are
  `Issue` fields. A draft can still acquire edges through the field and body layers, and Theme D's
  all-drafts empty state says so out loud.
- **`blocking` (the inverse) as a source.** Theme A fetches it; Theme B ignores it. Every `A blocks B`
  is a `B blockedBy A` the dependent's own record already carries, so consuming both doubles every
  edge. It is fetched only so a later phase can answer "what does finishing this unblock?" with no
  query change.
- **Persisting the graph viewport.** `ProjectViewState` is project-keyed and `projectsMode` is
  repo-keyed; a stored viewport would follow a board across repos. Re-fitting on mount is both cheaper
  and more useful.
- **Replacing the board.** Graph is a third mode beside table and board, not above them.
- **A dependency graph for anything but GitHub Projects.** Not the commit graph, not workflows, not
  `.midnite/tasks/` phases — three other graphs with three other data models.

## Decisions / open questions

- **Resolved — the kanban rainbow already exists; Theme F generalises rather than builds.**
  `.card-run-glow` has carried the `--rainbow-ramp` conic border and `loop-glow-spin` since Phase 37.
  The requirement is met on the board today; what is missing is the graph node. Found in the
  2026-09-06 grounding audit, after the theme had been scoped as new work.
- **Resolved — nodes are DOM, edges are SVG, and the reason is the ramp.** `workflow-canvas.tsx` paints
  nodes as SVG `<rect>`s, and `.card-run-glow` is a `background-clip` technique no SVG element can
  wear; SVG has no conic gradient either. The alternatives were a faked rotating `<linearGradient>`
  (visibly different from the card, defeating the point) or `<foreignObject>` per node (CSS works, but
  hit-testing and pan/zoom with hundreds do not). A DOM node layer over an SVG edge layer keeps
  `workflow-geometry.ts` and `workflow-path.ts` reused verbatim.
- **Resolved — the node does not start an agent; it opens the composer.** *(x1)* There is no reusable
  card start path — `launch()` is a component-local closure and `startAgent` is the only export.
  Routing through the composer keeps one start UI, preserves the agent/model choice, and leaves
  `startAgent` with exactly one caller.
- **Resolved — card selection lifts into `ProjectsView`.** *(x1)* `CardPanelStack` has no exported
  open action and `selectedItemId` was local to `BoardView`. Lifting it gives both modes one panel;
  a second `CardPanelStack` instance would have been cheaper but creates two selections that can
  disagree across a mode switch.
- **Resolved — Start is disabled on a blocked item, but only for `api`/`field` edges.** *(x1)* The
  gate is the phase's own argument made enforceable. The risk — a stale or wrong edge locking a user
  out of their own card — is defused by exempting the `body` layer, which is the one the app inferred
  and the one most likely to be wrong.
- **Resolved — one `useGraphAgentStates` subscription, not 300 `useCardStatus` calls.** *(x1)*
  `useCardStatus` takes three whole-slice selectors and does a linear session scan; per node at 300
  nodes that is 300 × O(sessions) per store tick. One hook building a `Map` in a single pass makes the
  node pure and memoizable. The board keeps `useCardStatus`.
- **Resolved — `--dep-done`/`--dep-active`/`--dep-idle`, not `--health-*` and not raw hex.** *(x1)*
  This repo has no `--status-*` vars; the original edge table cited the crib's. `--health-*` exists
  but means repo health, and a future change to "warn" should not restyle a dependency graph.
- **Resolved — arrow keys follow edges.** *(x1)* `board-keyboard.ts` is a 2-D `BoardColumn` model and
  cannot describe free-positioned nodes. Edge-following is the only scheme where the keyboard teaches
  the dependency structure, which is the view's purpose.
- **Resolved — culling is graph-space only.** *(x1)* `useCardVisible` observes with the browser
  viewport as root and no `rootMargin`, so inside a transformed container it answers a different
  question. `viewportRect`/`rectsIntersect` govern; two mechanisms disagreeing about one node is the
  bug this rules out.
- **Resolved — the viewport is component-local and re-fits on mount.** *(x1)* Matches
  `workflow-canvas.tsx`, and avoids storing repo-crossing state on a project-keyed record.
- **Resolved — `ready` requires blockers that are closed or merged.** *(x1)* It is the only thing
  GitHub knows about every blocker, and a Status-column rule cannot be evaluated at all for a foreign
  blocker in another repo. A `state: null` blocker counts as unmet: an unknown blocker is not a
  satisfied one.
- **Resolved — the node cap is 300.** *(x1)* The crib uses 500 in a browser tab; this is an Electron
  renderer that may also hold a pty and a Monaco. Truncation is always surfaced.
- **Resolved — sub-issues stay a faint edge, off by default.** *(x1)* Nesting would change ranking,
  culling and the cap simultaneously, and nobody has used this view on a real board yet. The data is
  fetched either way, so a later phase can draw it with no query change.
- **Resolved — all four dependency sources, as a precedence ladder.** `blockedBy` leads because it is
  semantically exact and verified available with no preview header; the project field is the explicit
  opt-in; the body parse makes the view useful on day one. `parent`/`subIssues` is a *separate*
  containment layer, because merging it would grey out every epic.
- **Resolved — no new IPC channel and no new dependency.** The data is four fields inside a query that
  already runs; the resolver, layout and appearance are pure functions. `dagre` was offered and
  declined at ~90KB for ~40 lines of ranking.
- **Resolved — the graph is a third `projectsMode`, not a rail view.** It inherits the shared filter
  toolbar, the board picker and the detail panel. A top-level view would duplicate all three.
- **Resolved — the default field name is `Blocked by`.** It is what GitHub's own dependency UI calls
  the relation, so a board that adopted a field before the API existed most likely already uses it.
  Configurable; blank disables the layer.
- **Resolved — this phase adds the repo's first shared `ForgeProjectItem` factory.** *(x1)* Three
  local ones exist and this phase adds four suites; the fifth is where one shared factory gets
  cheaper. Existing suites are not migrated.
- **Resolved — `.card-run-glow` is renamed to `.agent-run-glow`, not aliased.** *(x1)* Followed the
  doc's own recommendation: a permanent alias is a second name for one visual, and this doc's own
  argument against two definitions applies to two names too. `kanban.spec.ts:265–314`'s four literal
  class assertions moved to `agent-run-glow` in the same commit as the rename (PR #205).
