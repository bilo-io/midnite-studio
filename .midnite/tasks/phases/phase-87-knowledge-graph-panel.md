# Phase 87 — Knowledge: the graph the repo already has

**Every graphified repo on this machine is already carrying a 14,881-node map of itself, and there is
no way to look at it from inside the app.** `graphify update .` writes
`graphify-out/graph.json` — for this repo, **14,881 nodes, 36,032 links, 600 communities, 21.1 MB** —
and today the only consumers are a CLI and a `PreToolUse` hook. The agents can see the shape of the
codebase; the human cannot.

This phase adds a **Knowledge** view: a pinned rail row beside Notes, rendering the active repo's own
graph with WebGL, switching when the repo switches.

**The one trap, measured before it cost anything.** graphify also emits
`graphify-out/graph.html`, and the obvious move is to drop it in a webview. It does not work:

- It loads `vis-network@9.1.6` **from `unpkg.com`** via a `<script src>`. In a packaged Electron app
  that is a blank pane offline, and it walks straight into [Phase 76](phase-76-the-renderer-in-a-sandbox.md)'s
  unstarted renderer CSP.
- It contains only the **600-node aggregated community view** — verified: 600 `"id":` against
  graph.json's 14,881. graphify itself refuses node-level HTML above 5,000 nodes.

So the panel renders `graph.json` directly. That file is already in the shape a renderer wants —
`nodes[]` + `links[]` with `source`/`target` — and carries exactly the fields the interactions need:

| Field | On | Buys us |
|---|---|---|
| `source_file` + `source_location` | node | click-to-open at the right line (Theme E) |
| `community` + `community_name` | node | colouring and filtering that makes the hairball legible (E) |
| `relation`, `weight`, `confidence` | link | cutting 36k edges down to the ones you asked for (E) |
| `built_at_commit` | graph | an exact cache key, and a "this graph is stale" signal (A, F) |

**What it does not carry is coordinates.** There is no `x`/`y` on any node, so a 14,881-node
force-directed layout is real compute, not a detail — which is what Theme A exists for.

**Builds on.**
- [Phase 58](phase-58-notes-and-the-menu.md) Theme E — the pinned-rail precedent. `NOTES_ITEM` in
  [`app.tsx`](../../../packages/app/src/app.tsx) sits beside `PINNED_ITEM` above the workspace
  section, and [`view.ts`](../../../packages/shared/src/domain/view.ts)'s `VIEW_IDS` array is
  *"the only place that ordering is written down"*. Knowledge is the third such row.
- [Phase 61](phase-61-database-explorer.md) — `db-engine`, which [`eslint.config.mjs`](../../../eslint.config.mjs)
  already describes as *"the same shape as `git-engine`, one dependency"*. `packages/knowledge` is
  the third instance of that pattern, not a new idea. See Decision 1.
- [Phase 60](phase-60-view-registry-and-error-boundaries.md) — [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
  which lazy-loads every view and is where a WebGL canvas that fails to acquire a context must
  degrade rather than blank the window.
- [Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) — the visibility gates. A WebGL render
  loop that keeps drawing while the view is hidden is exactly the cost that phase spent eleven
  themes removing.
- [Phase 82](phase-82-the-pyramid-righted.md) — the test-layer decision rule, which a canvas forces
  us to apply honestly (Theme G).
- [`CLAUDE.md`](../../../CLAUDE.md)'s react-icons rule — `SiGrapheneos` imports from
  `react-icons/si`, per-set, never the package root.

**Scope guardrails.**
- **The app never runs `graphify`.** No spawning, no refresh button, no watching for staleness beyond
  *reporting* it. The panel reads what is on disk. Decision 4.
- **Nothing loads over the network.** Not the library, not a font, not a tile. sigma is bundled; this
  phase must leave [Phase 76](phase-76-the-renderer-in-a-sandbox.md) strictly easier, never harder.
- **`graph.html` is never embedded**, for the two reasons measured above.
- **This is not the commit graph.** [Phase 5](phase-5-commit-graph.md)'s lane layout renders history;
  this renders code structure. They share a word and nothing else — no code, no store, no view.
- **Read-only.** No editing the graph, no writing into `graphify-out/`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — `packages/knowledge`, the electron-free engine (M) — ✅ DONE (PR #408, 2026-09-16)

- [x] New package `packages/knowledge` with its own `moon.yml`, in the shape of
      [`packages/git-engine/moon.yml`](../../../packages/git-engine/moon.yml). Plain Node/TS,
      **never imports `electron`**, so the parser and the layout stay testable under bare vitest.
- [x] Add the boundary group to [`eslint.config.mjs`](../../../eslint.config.mjs) beside the existing
      `git-engine` and `db-engine` groups, with the same explanatory message. `app` must not import it.
- [x] `readGraph(repoPath)` — resolve `<repo>/graphify-out/graph.json`, parse, and return a
      discriminated result: `{ok:true, graph}` | `{ok:false, kind:'absent'|'unreadable'|'malformed'}`.
      **Absent is not an error** — it is the common case for an un-graphified repo and Theme F renders
      it as a normal state.
- [x] **The lean projection.** Strip what the picture never reads — `_origin`, `context`,
      `confidence_score`, `_callable_class`, the long `source_location` strings — keeping `id`,
      `label`, `community`, `community_name`, `file_type`, and per-link `source`/`target`/`relation`/
      `weight`. Measured against this repo's own graph: the lean projection is ~50% of the raw parsed
      size (8.34 MB vs 16.5 MB as JSON; the 21.1 MB figure is the on-disk file's own byte count,
      which includes formatting whitespace this measurement doesn't). `weight` turned out to be
      optional in the wild (113 of 36,032 links, all `dynamic_import`, carry none) — defaulted to `1`
      rather than dropped. `confidence`/`confidence_score` are dropped per this bullet's own field
      list; Theme E will want `confidence` back for its edge filter, left as a small addition for it.
- [x] Per-node detail stays retrievable by id, so a click can fetch `source_file` +
      `source_location` for one node without the projection having carried it for all 14,881.
- [x] **ForceAtlas2 layout** via `graphology-layout-forceatlas2`, run once over the full graph.
      Deterministic: same input, same coordinates, so the cache is meaningful and a visual test has
      something stable to assert. Seeded from a deterministic circular layout (nodes sorted by id).
      Measured: ~7.1s for the full 14,881-node graph at 100 iterations — confirmed real compute,
      which is why Theme B moves it off the main thread.
- [x] **Layout cache keyed on `built_at_commit`** plus a projection-format version. A repo reopened
      at the same graph is instant; a `graphify update` changes the key and invalidates exactly.
      Cache lives in the app's `userData`, **not** in `graphify-out/` — see Decision 2.
- [x] Vitest: absent/unreadable/malformed each return their kind; the projection drops the right
      fields and keeps the rest; the cache key changes with `built_at_commit` and not with anything
      else; layout is deterministic across two runs on a fixture graph. (21 cases.)

### B — The IPC contract and the main-process handler (M) — ✅ DONE (PR #408, 2026-09-16)

- [x] Channel constants in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) and zod
      payload schemas in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — `shared` is the
      wire contract and owns both, as it does for every other surface. `knowledgeGetGraph` and
      `knowledgeGetNodeDetail`, plus the `knowledgeLayoutProgress` event.
- [x] The op **never throws across the boundary**. Returns `KnowledgeResult` — its own envelope,
      shaped like `GitOpResult`/`DbOpResult` but with a 4-arm failure (`absent`/`unreadable`/
      `malformed`/`error`) since `conflict` means nothing for a file that is simply missing — so
      "this repo has no graph" is a state the UI renders rather than an exception it catches.
- [x] Main-process handler in `packages/desktop` calling into `packages/knowledge`: resolve the active
      repo, read, project, lay out, cache, respond.
- [x] Layout runs **off the main thread** — a multi-second ForceAtlas2 pass that freezes the window is
      not shippable. Decision 3 resolved unattended, per its own recommendation: `worker_threads`.
- [x] Progress is reported while a cold layout runs, so Theme D has something to show other than a
      frozen empty canvas. Sent only to the requesting window (`handleFromSender`), never to a popout
      that never asked.
- [x] Extend the preload bridge type so `window.midniteStudio` exposes it, per the existing pattern.
      `window.midniteStudio.knowledge.{getGraph, getNodeDetail, onLayoutProgress}`.
- [x] Vitest for the handler's repo resolution and envelope shape. (10 cases: not-open, absent,
      malformed, cache hit with no worker spawned, cache miss with worker spawned + cache written,
      a worker failure surfaced as `error`, node-detail found/not-found/cold-rebuild.)

### C — The rail row and view registration (S)

- [x] Add `'knowledge'` to `VIEW_IDS` in [`view.ts`](../../../packages/shared/src/domain/view.ts),
      **directly after `'notes'`** — that array position *is* the rail order.
- [x] `VIEW_ICON.knowledge = SiGrapheneos` in [`nav-icons`](../../../packages/app/src/components/nav-icons.tsx),
      imported from `react-icons/si`. Per-set import, never the root barrel.
- [x] A third pinned `NavItem` in [`app.tsx`](../../../packages/app/src/app.tsx) beside `PINNED_ITEM`
      and `NOTES_ITEM`, with a header comment saying why it is pinned rather than in
      `WORKSPACE_NAV_ITEMS` — matching what `NOTES_ITEM` already documents.
- [x] Lazy registry entry in [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
      following `loadNotesView`. **Not `global: true`** — unlike Notes, a knowledge graph is
      meaningless with no repo open.
- [x] No keyboard chord this phase — [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)
      gains no entry, so the rail row shows no bubble. Decision 5.
- [x] Vitest: the view id resolves, the rail renders the row in the right position, the icon name
      resolves to a defined export (the guard `icon-names.test.ts` already applies to `lu` — extend
      the idea to `si`).

### D — The sigma canvas (L)

- [ ] Add `sigma` + `graphology` to `packages/app` (both MIT). Raw sigma behind a thin local hook
      rather than `@react-sigma/core` — Decision 6.
- [ ] Render the full **14,881 nodes / 36,032 links** with WebGL, seeded from Theme A's cached
      coordinates. No force simulation runs in the renderer.
- [ ] **Zoom level-of-detail**: labels appear only above a zoom threshold and only for nodes above a
      degree threshold. 14,881 labels drawn at once is illegible and slow; this is the difference
      between a picture and a smear.
- [ ] Node colour from `community`, sized by degree. Edge alpha from `weight`.
- [ ] **App theme tokens, both schemes.** The canvas reads the same CSS custom properties every other
      surface does and repaints on theme change — no hardcoded palette, which is precisely what
      `graph.html` gets wrong with its baked `#0f0f1a`.
- [ ] **Stop rendering when hidden.** Wire into Phase 84's visibility gates: no render loop, no
      requestAnimationFrame, when the view is not visible or the window is blurred.
- [ ] Graceful failure when WebGL context acquisition fails (a real possibility under software
      rendering) — a message inside the view's error boundary, never a blank window.
- [ ] Record entry-chunk and total-JS deltas with
      [`bundle-report.mjs`](../../../scripts/perf/bundle-report.mjs) before and after. sigma +
      graphology must be in the Knowledge view's lazy chunk, **not** the entry chunk.

### E — The four interactions (M)

- [ ] **Click a node to open its file.** Fetch that node's `source_file` + `source_location` by id and
      open the Explorer preview at the line. Decision 7 records why Explorer rather than the editor.
- [ ] **Search and focus.** Type a symbol, the camera flies to it and its neighbourhood highlights,
      everything else dims. On a 15k-node graph this is the difference between a tool and a poster.
- [ ] **Community colour and filter.** Toggle communities on and off by `community_name`; the 600
      communities need their own searchable list, not 600 checkboxes.
- [ ] **Edge filter by `relation` and `weight`.** Show only `call` edges, or hide low-`confidence`
      inferred ones. Default to whatever leaves the first paint legible, and say so in the doc.
- [ ] Filter state is per-repo and survives a view switch, but is **not** persisted across restarts
      this phase.
- [ ] Vitest for the filter/search reducers as pure logic — no canvas needed to test what a filter
      selects.

### F — Repo switching, empty and stale states (M) — ✅ DONE (PR #410, 2026-09-16)

- [x] The graph follows the active repo: switch repo, switch graph, with the previous graph's GPU
      resources released rather than leaked. The data layer's half of this is real and tested —
      `useKnowledgeGraph`/`useKnowledgeGraphExists` key their react-query cache entries on `repoId`
      (`keys.knowledgeGraph`/`keys.knowledgeStatus`), so a repo switch subscribes the view to a
      brand-new cache entry immediately rather than showing the previous repo's data (see
      `use-knowledge-graph.test.ts`'s repo-switch race test). The **GPU** half is deliberately not
      claimed here: Theme D's sigma canvas — the thing that would hold a WebGL context to release —
      does not exist yet on this branch, so there is nothing to leak. Left as a note for Theme D:
      its canvas needs a cleanup effect keyed on the same `repoId`/query-key change this theme wires.
- [x] **The un-graphified repo.** The rail row stays visible but **disabled/greyed**
      (`app.tsx`'s pinned `KNOWLEDGE_ITEM`, dimmed via `useKnowledgeGraphExists`), exactly as the
      pinned rows already grey out when they have nothing to show. A new `knowledgeCheckGraph`
      channel (`stat`, not a read) answers this without ever paying for `knowledgeGetGraph`'s
      parse or a cold ForceAtlas2 layout just from selecting a repo.
- [x] Opening the disabled view explains what to do: what graphify is, the one-line install
      (`pip install graphifyy`), and `graphify update .`. Copy is instructions, not an error
      (`KnowledgeInstructions` in `knowledge-view.tsx`).
- [x] **Staleness, reported only.** `KnowledgeGraphPayloadSchema.commitsBehind` — computed in the
      desktop handler via `rev-list --count builtAtCommit..HEAD` — compares `built_at_commit`
      against the repo's `HEAD` and the view shows "N commits behind" when it is positive. `null`
      (not a guessed `0`) when the commit cannot be resolved. It is a label; nothing re-runs
      graphify (guardrail above).
- [x] A graph that fails to parse (`malformed`) says so distinctly from one that is absent, and
      from one that exists but can't be read (`unreadable`) — three different messages in
      `knowledge-view.tsx`.
- [x] Vitest for the state machine: absent / present / stale / malformed each resolve to one state
      (`knowledge-state.test.ts`), and a repo switch mid-load cannot land the previous repo's graph
      (`use-knowledge-graph.test.ts`, an integration test against a real `QueryClient` with two
      repos' promises resolving out of order).

### G — Tests and the numbers (M)

- [ ] Per [Phase 82](phase-82-the-pyramid-righted.md)'s decision rule, **name the layer in each
      spec's header comment.** Everything in A, B, E, F is vitest — parsers, reducers, state
      machines, envelope shapes.
- [ ] **Playwright is for the canvas only**, and the header comment says which capability forces it:
      real WebGL context, real `getBoundingClientRect` for hit-testing, real pointer drag for pan and
      zoom. None of that is assertable under jsdom.
- [ ] One visual-regression baseline, locator-cropped, against the ~100-baseline / 3 MB cap
      `scripts/e2e-budget.mjs` enforces. A deterministic layout (Theme A) is what makes this stable.
- [ ] **No wall-clock assertions in unit tests** (`expect(elapsed).toBeLessThan(...)`), per the
      standing rule. Timing claims belong to the perf scripts.
- [ ] Record the real numbers in the PR: cold layout time for 14,881 nodes, warm cache open time,
      lean-projection bytes vs 21.1 MB, entry-chunk delta, and idle CPU with the view open but the
      window blurred (`idle-cpu.mjs --blurred`).

---

## Files this phase touches

| File | What |
|---|---|
| `packages/knowledge/**` | **new** — reader, lean projection, ForceAtlas2, layout cache (A) |
| `packages/knowledge/moon.yml` | **new** — in the shape of git-engine's (A) |
| [`eslint.config.mjs`](../../../eslint.config.mjs) | third boundary group beside `git-engine` and `db-engine` (A) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) | channel constants and zod payloads (B) |
| [`packages/shared/src/domain/view.ts`](../../../packages/shared/src/domain/view.ts) | `'knowledge'` into `VIEW_IDS`, directly after `'notes'` (C) |
| `packages/desktop/src/main/**` | the handler, off-thread layout, progress reporting (B) |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | the third pinned `NavItem` (C) |
| [`packages/app/src/components/nav-icons.tsx`](../../../packages/app/src/components/nav-icons.tsx) | `VIEW_ICON.knowledge`, `SiGrapheneos` from `react-icons/si` (C) |
| [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) | lazy entry, **not** `global: true` (C) |
| `packages/app/src/features/knowledge/**` | **new** — the view, canvas, filters, empty states (D, E, F) |
| `packages/app/package.json` | `sigma` + `graphology` (D) |
| [`scripts/perf/bundle-report.mjs`](../../../scripts/perf/bundle-report.mjs) | (**unchanged**) — run it for the before/after (D, G) |
| [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) | (**unchanged**) — no chord this phase (C, Decision 5) |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `moon run root:tracker-check` exits 0.
- [ ] The eslint boundary actually bites: an `import` of `packages/knowledge` from `packages/app`
      fails the build, and an `import 'electron'` inside `packages/knowledge` fails it too.
- [ ] **Nothing is fetched over the network** while the view is open — verified from the packaged
      app's devtools network panel, not from source reading. This is the `graph.html` trap.
- [ ] Opening Knowledge on this repo renders **14,881 nodes**, not 600. A panel showing the aggregate
      would look plausible and be the exact bug this phase exists to avoid.
- [ ] Second open of the same repo at the same `built_at_commit` uses the cache — measurably faster,
      and no layout progress shown.
- [ ] `graphify update .` then reopen: the cache key changes and the layout recomputes.
- [ ] A repo with no `graphify-out/` shows a greyed rail row and the instructional panel — **no error
      toast, no empty canvas, no crash.**
- [ ] Switching repos with the view open swaps the graph, and repeated switching does not grow GPU
      memory (the leak shape [Phase 45](phase-45-the-leak-audit.md) went looking for).
- [ ] Clicking a node opens the right file at the right line.
- [ ] Search finds a symbol by name and the camera lands on it.
- [ ] Theme switch repaints the canvas in both light and dark; no hardcoded colour survives.
- [ ] With the view open and the window blurred, `idle-cpu.mjs --blurred` is indistinguishable from
      the same measurement with the view closed.
- [ ] Entry chunk is **unchanged** — sigma and graphology are in the lazy chunk only.
- [ ] **Open, for a human:** open Knowledge on a repo you know well and see whether the communities
      match your mental model of it. A graph that renders correctly and reads as nonsense is a
      failure this phase cannot assert against.

---

## Not in this phase

- **Running or refreshing graphify from the app.** No spawn, no progress UI, no "rebuild" button. It
  is the obvious next phase and it needs its own thinking about where a long-running child process
  lives and what happens when you switch repos mid-build. Staleness is *reported* here; acting on it
  is not.
- **The `query` / `explain` / `path` surface.** graphify's most useful commands are textual, and a
  panel that answers "what calls this?" may well be worth more than the picture. Deliberately
  separate: it is a different interaction model that happens to read the same file.
- **Cross-repo merged graphs** (`graphify merge-graphs`). One repo, one graph.
- **3D, Obsidian export, GraphML, Neo4j push.** graphify does all of them; none belongs in a panel.
- **Semantic community labels.** Names today come from AST extraction (`schemas.ts`, `useNow`).
  Real names need `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` and `graphify label` — a graphify-side
  concern, and it improves this panel for free whenever it happens.
- **Persisting filter state across restarts.** Per-repo and per-session only.

---

## Decisions / open questions

1. **Resolved — a new `packages/knowledge`, not git-engine and not desktop.** git-engine is the right
   *shape* (electron-free, vitest-testable) and the wrong *name*: `CLAUDE.md` defines it as
   "everything that touches git", and this touches none. Putting it in desktop would land a
   force-layout in the Electron process where bare vitest cannot reach it. `eslint.config.mjs`
   already describes `db-engine` as "the same shape as git-engine, one dependency" — the pattern
   exists and this is its third use.

2. **Resolved — the layout cache lives in the app's `userData`, not `graphify-out/`.** Writing into
   graphify's own output directory means our file is deleted by `graphify uninstall --purge`,
   appears in whatever ignore rules that directory has, and risks confusing graphify's own
   incremental update. The cache is ours; it belongs with our state.

3. **Resolved (PR #408) — `worker_threads`, per this decision's own recommendation.** A multi-second
   ForceAtlas2 pass must not block main. A `worker_threads` worker is lighter and keeps the code
   inside `packages/knowledge`, so its own vitest suite keeps testing the layout directly; Electron's
   `utilityProcess` would have moved it out of the electron-free package for no benefit this phase
   needed. Revisit if startup cost surprises in practice.

4. **Resolved — the app never runs graphify.** The moment the app can spawn it, it owns a child
   process's lifetime across repo switches, window closes and quits, plus the question of which
   binary and which version. That is a phase, not a checkbox. Reading a file that is either there or
   not is the whole reason this phase fits in one.

5. **Open — should Knowledge get a keyboard chord?** Every pinned row so far has one. But
   `CLAUDE.md` is emphatic that a chord is a scarce resource and the obvious letters are taken
   (`Mod+k` palette, `Mod+l` FAB menu). *Recommendation:* **no chord this phase.** Ship it, find out
   whether it is a daily surface, and spend a chord on it then — removing one is worse than never
   having given it.

6. **Resolved — raw `sigma` + a thin local hook, not `@react-sigma/core`.** The wrapper is MIT and
   fine, but it is a third dependency for lifecycle management we need roughly forty lines of. The
   canvas already has to integrate with Phase 84's visibility gates and the theme tokens, neither of
   which the wrapper knows about.

7. **Open — does clicking a node open the Explorer preview or the editor?** Explorer preview is
   lighter and reversible; the editor is what you actually want if you are about to change the code.
   *Recommendation:* **Explorer preview**, matching what other "jump to a file" affordances in the
   app already do, with the editor one keystroke further. Worth revisiting once it is in hands.

8. **Open — what is the default edge filter on first paint?** All 36,032 edges at once is a grey
   disc. *Recommendation:* start with `call` edges plus anything above a confidence threshold, show
   the count that is hidden, and make the full set one click away. The number matters more than the
   rule: whatever is chosen, first paint has to be legible or nobody reaches the filters.
