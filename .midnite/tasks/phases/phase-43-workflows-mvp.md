# Phase 43 — Workflows

**Refined: x1** · 2026-09-02 · UI/UX & interaction, empty/loading/error states, functionality & edge cases, data model & IPC contract, concurrency & cancellation, performance & scale, testing & verification, sequencing, file-map precision, per-item acceptance criteria

`workflows` has been a registered `ViewId` since Phase 19 — it is in the union at
[`ui-store.ts:61`](../../../packages/app/src/store/ui-store.ts), in `VIEW_IDS` at
[`ui-store.ts:76`](../../../packages/app/src/store/ui-store.ts), in `AGENT_NAV_ITEMS` at
[`app.tsx:252`](../../../packages/app/src/app.tsx), it has an icon (`LuWorkflow`,
[`nav-icons.ts:50`](../../../packages/app/src/components/nav-icons.ts)) and a palette entry
(`VIEW_LABELS.workflows = 'Agent Workflows'`,
[`providers.ts:35`](../../../packages/app/src/services/palette/providers.ts)) — and it has rendered
the generic `<Placeholder>` ever since. This phase fills it, the way
[Phase 34](phase-34-agent-councils.md) filled the identically-reserved Councils slot.

A workflow is a directed graph of nodes. You build it on a canvas, run it, and watch each node
light up with its own status and output. The MVP's node vocabulary is deliberately small and its
centre of gravity is **HTTP** — because the feature note asks specifically for working demo CRUD
endpoints to build workflows *against*, and a workflow engine with nothing to call is a diagram.
So Theme D ships a real local CRUD API: a `node:http` server bound to `127.0.0.1`, started on
demand from Electron main, with an in-memory collection store answering GET, POST, PUT, PATCH,
DELETE and HEAD. It exists to make the workflow editor immediately, honestly testable on a machine
with no network.

**Builds on.** Councils is the template for how a feature domain splits across this repo's
packages, and the scan confirms the shape: contracts in
[`shared/src/council.ts`](../../../packages/shared/src/council.ts), a runner plus stores in
`packages/desktop/src/main/`, one `*-handlers.ts` in
[`ipc/`](../../../packages/desktop/src/main/ipc/), nothing in `git-engine` because nothing touches
git, and a `features/` folder in the renderer. Workflows follow it exactly.
[`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) is worth reading for its
`withRunLock` per-run mutation lock — the bug that lock fixed (concurrent settles racing on a
read-modify-write of the run object) is the *same* bug a parallel node executor will hit.
Persistence follows the `*-store.ts` convention
([`loop-runs-store.ts`](../../../packages/desktop/src/main/loop-runs-store.ts),
[`councils-store.ts`](../../../packages/desktop/src/main/councils-store.ts)) — JSON under
`userData`, not a database.

**Scope guardrails.** **Manual runs only.** No cron, no schedule, no webhook ingress, no
file-watch triggers — a workflow runs because you pressed Run. No credentials vault: the demo API
needs no auth, and a secret store is its own phase with its own security review. No template
marketplace, no versioning, no sharing. Workflows are **global**, not per-repo, matching councils.
The canvas is **hand-rolled SVG**, not a graph library — the same call Phase 5's commit graph and
Phase 18's monitor chart made, and the one that keeps Phase 36's entry-chunk budget intact.

**A note on the name collision.** `workflow` already means *GitHub Actions workflow* in this
codebase — `ForgeWorkflowSchema` at
[`domain/forge.ts:121`](../../../packages/shared/src/domain/forge.ts), `forgeWorkflows` in
[`queries.ts`](../../../packages/app/src/services/queries.ts), the whole `features/actions/` tree.
These are unrelated concepts and the code must never blur them: this phase's types live in
`shared/src/workflow.ts` and are named `Workflow*` with no `Forge` prefix, and no module imports
both without a comment saying why.

### What the x1 refinement corrected

The first draft leaned on four precedents that do not hold. They are corrected in place below; they
are listed here because each one would have cost an executor an hour of looking for something that
is not there.

1. **There is no pan/zoom anywhere in this app, and the commit graph is not a canvas.**
   [`graph-svg.tsx:18`](../../../packages/app/src/features/graph/graph-svg.tsx) documents it as
   "SVG-per-row inside a virtualized list, rather than one big canvas"; its `viewBox` is a per-row
   identity sizing box. `onWheel`, `deltaY` and `zoom` return **zero hits** across
   `packages/app/src`. Theme E defines the convention rather than inheriting it.
2. **`council-runner.ts` emits no events at all.** Councils get liveness by *polling*
   (`RUN_POLL_MS = 1200`,
   [`use-council-run.ts:13`](../../../packages/app/src/features/councils/use-council-run.ts)), because
   a member's live output rides the existing `pty:*` channels. The push precedents are
   [`tests-handlers.ts`](../../../packages/desktop/src/main/ipc/tests-handlers.ts) and
   [`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts). Theme B and G now say which.
3. **`WORK_IN_PROGRESS` is a sidebar filter preset, not a placeholder.** Councils **kept** it after
   Phase 34 ([`view-sections.ts:191`](../../../packages/app/src/features/repos/view-sections.ts)),
   so a global view needs no change there at all. Theme I said the opposite.
4. **`.loop-run-glow` is not focus-gated.** Phase 37's gate names only
   `.fab-panel-gradient::before` ([`styles.css:967`](../../../packages/app/src/styles.css)) and its
   `data-window-focused` attribute is written only while the FAB panel is mounted
   ([`fab-panel.tsx:155`](../../../packages/app/src/components/fab-panel.tsx)). Theme G now owns
   the hoist.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts (M) — ✅ DONE (PR #92, 2026-09-03)

- [x] `Workflow`, `WorkflowNode`, `WorkflowEdge`, `WorkflowRun`, `WorkflowNodeRun` zod schemas in a
      new [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts), plus
      `workflow.test.ts`, modelled on `council.ts`'s structure.
  - Follow `council.ts`'s house conventions exactly: ids are `z.string().min(1)`; timestamps are
    `z.number().int().nonnegative()`; every schema is followed immediately by
    `export type X = z.infer<typeof XSchema>`; a one-value union is `z.literal(...)`, never a
    one-member `z.enum`.
  - *Acceptance:* `workflow.test.ts` round-trips a two-node workflow through
    `WorkflowSchema.parse(JSON.parse(JSON.stringify(w)))` and gets a deep-equal object back.
- [x] `WorkflowNode` is a **discriminated union on `kind`**, and the MVP's vocabulary is exactly
      five: `http`, `transform`, `condition`, `delay`, `note`. Written as a union, not an open
      string, so adding node #6 is an honest schema change.
  - Idiom: `z.discriminatedUnion('kind', [z.object({ kind: z.literal('http'), ... }), ...])`, the
    form used at [`schemas.ts:199`](../../../packages/shared/src/ipc/schemas.ts)
    (`SearchStartRequest`). The discriminator arm is always `z.literal`.
  - Every arm carries the shared base fields — `id`, `label`, `x`, `y` — plus its own `config`
    object. Declare the base once as `WorkflowNodeBase` and `.extend()` it per arm, as
    `SearchStartRequest` does with `RepoId.extend`.
- [x] `WorkflowNodeStatus` — `pending | running | succeeded | failed | skipped` — mirroring the
      council member states the runner already models.
  - Add `timeout` as a sixth value. `council.ts:91` has it
    (`['running','succeeded','failed','timeout','skipped']`) and Theme B's per-node deadline
    produces exactly that outcome; folding it into `failed` loses the one distinction the UI most
    needs to explain.
- [x] Node position (`x`, `y`) lives on the node, so the canvas layout is data and survives a
      round-trip through the store.
  - `z.number()` — plain floats, **not** integers and not grid cells. Theme E snaps on drop for
    tidiness, but the schema must not enforce it or an imported workflow with fractional positions
    fails to parse.
- [x] Channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts):
      `mstudio:workflow:list|save|delete|run|cancel`, `mstudio:workflow-runs:list|get`, and
      `mstudio:demo-api:start|stop|status`. Push events (`workflowRunChanged`,
      `workflowNodeChanged`) grouped under `EVENT_CHANNELS`, as `loopRunsChanged` is.
  - Add them under a `// --- workflows (Phase 43) ---` banner comment, matching every other block
    in the file. Naming rule is stated in the file header: `mstudio:<domain>:<verb>`.
  - **Collapse the two events into one bare `workflowRunChanged`** carrying no payload, exactly as
    `loopRunsChanged` does — [`bridge.ts:471`](../../../packages/shared/src/ipc/bridge.ts) records
    the reasoning ("the list is capped-small, so consumers just re-fetch it"). A per-node event
    would need a payload design, an ordering guarantee and a reconciliation story in the renderer;
    a bare ping plus a re-fetch of the run needs none of the three. See Decisions.
- [x] Bridge signatures in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), returning the
      result envelope — a failed node is a normal outcome the UI renders, never a thrown error.
  - **Copy `GitOpResult`'s shape exactly** from
    [`domain/result.ts`](../../../packages/shared/src/domain/result.ts): a `z.union` of
    `z.object({ ok: z.literal(true), value })` with a *nested* `z.discriminatedUnion('kind', ...)`
    for the failures. A flat `z.discriminatedUnion('ok', [...])` with two `ok: false` arms **is a
    zod error** — the discriminator values must be distinct — and is the obvious wrong first try.
    Use the `GitOpResultOf(schema)` helper rather than rebuilding it.
- [x] Add a `'workflow'` member to the preload namespace union at
      [`preload/index.ts:103`](../../../packages/desktop/src/preload/index.ts).
  - The preload object is typed `Record<'…' | '…' | …, unknown>` over that union, so a missing
    namespace is a **compile error**, not a runtime surprise. This is the cheapest guard in the
    contract and it is free.
- [x] Add a `describe('workflow contract')` block to
      [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts) with a `CASES` table and an
      `expected` key map filtered on `key.startsWith('workflow') || key.startsWith('demoApi')`.
  - **This is not optional boilerplate.** The exhaustiveness guards in that file are *prefix-scoped
    and opt-in* — there is no council block at all, which is why a council channel can be added
    unvalidated. Without this block, the only guards a `workflow*` channel gets are the two global
    ones (no duplicate names, `mstudio:` prefix). With it, any later channel added without a row
    fails the suite.
  - *Acceptance:* deleting one channel's row from `expected` makes `ipc.test.ts` fail.

### B — The engine (L) — ✅ DONE (PR #92, 2026-09-03)

- [x] `desktop/src/main/workflow/executor-registry.ts` — `kind → executor` lookup, one place a new
      node type is registered.
  - Type it `Record<WorkflowNode['kind'], NodeExecutor>` so the union from Theme A makes the
    registry exhaustive at compile time. A `Map` with a runtime `get` would not.
  - `export type NodeExecutor = (node: WorkflowNode, inputs: Record<string, unknown>, signal: { cancelled: () => boolean }) => Promise<NodeOutcome>`, where
    `NodeOutcome = { ok: true; output: unknown } | { ok: false; error: string }`. Executors
    **never throw**; the engine treats a rejection as a bug, not as a node failure.
- [x] `node-executor.ts` — resolves a node's inputs from its incoming edges, runs its executor,
      records the result, emits a change event.
  - "Emits a change event" means `emitChanged()` — the module-level `getWindow` thunk pattern from
    [`loop-runs.ts:26,37`](../../../packages/desktop/src/main/loop-runs.ts), stashed by a
    `configureWorkflows(store, runStore, getWindow)` call at boot. **Not** the councils pattern:
    `council-runner.ts` emits nothing at all.
  - Guard the send: `const win = getWindowThunk(); if (win && !win.isDestroyed()) win.webContents.send(...)`.
    A send to a destroyed window throws.
- [x] `workflow-engine.ts` — topological order over the graph, executing independent branches in
      **parallel** and joining before a node with multiple inputs. Cycle detection **before** the
      first node runs, reported as a validation error against the offending edge, not a hang.
  - Kahn's algorithm over an in-degree map. A non-empty remainder after the queue drains **is** the
    cycle; report the edges among the remaining nodes as `{ ok: false, kind: 'error', message }`
    naming the first such edge's id.
  - `runId` is minted by **main** with `randomUUID()` and returned from the invoke, following
    `tests-handlers.ts:109` and `loop-runs.ts`. It is not a renderer-minted `requestId` — that
    convention belongs to streams the renderer owns and can supersede, which a run is not.
  - Cap concurrent in-flight nodes at **4**, mirroring `SEARCH_CEILING = 4`
    ([`search-service.ts:26`](../../../packages/desktop/src/main/search-service.ts)). A twenty-node
    fan-out firing twenty simultaneous `fetch`es is a self-inflicted rate limit.
- [x] A **per-run mutation lock**, the `withRunLock` pattern from
      [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) — parallel node
      settles racing on a read-modify-write of the run object is the exact bug Phase 34 found, and
      this engine reproduces its conditions.
  - Copy it verbatim, `prior.then(fn, fn)` and all: the queue must advance on rejection too, or one
    throwing mutation wedges every later one for that run.
  - **Locked sections must never nest** — `council-runner.ts:200` records that nesting a second
    `withRunLock` inside one deadlocks against itself. The engine's shape follows from this: mutate
    state inside the lock, return a boolean out of it, and *start the next node outside it*.
  - `runLocks` in the councils original is a `Map` that is **never pruned**, so an entry leaks per
    run. Delete the key when a run reaches a terminal state, and assert it in the test.
- [x] Per-node timeout and whole-run cancel, both leaving a coherent terminal state — a cancelled
      run's un-started nodes are `skipped`, not `pending` forever.
  - Per-node deadline default **120 000 ms**, matching `COUNCIL_RUN_TIMEOUT_MS`
    ([`council.ts:171`](../../../packages/shared/src/council.ts)) and `DEFAULT_TIMEOUT_MS` in
    `process-runner.ts`. Overridable per node in its config; the Theme I settings page sets the
    default.
  - Use the `trackOneShot` idiom (`council-runner.ts:289`): one `settled` boolean racing the real
    outcome against a `setTimeout`, whichever wins calling `onSettle` exactly once, and
    `timer.unref?.()` so a pending deadline never holds the event loop open at quit.
  - The idempotence guard goes **inside** the lock — `if (node.status !== 'running') return false;`
    — because a user cancel can race a real settle. `council-runner.ts:353` is the line.
  - *Acceptance:* cancelling a 5-node run mid-flight leaves zero nodes in `pending` and zero in
    `running`.
- [x] A run's node snapshot is frozen at run start, so editing the workflow mid-run does not
      rewrite history (the Phase 34 Theme A guarantee, applied here).
  - Build the whole `WorkflowRun` — every node copied by value — and `saveRun(run)` **before** the
    first node launches, as `startRun` does at `council-runner.ts:78-97`. Execute from
    `run.nodes`, never from the live `workflow.nodes`.
  - Write the guarantee into the schema docblock, as `council.ts:106` does.
- [x] Runtime-only fields never reach disk.
  - Councils strip `ptyId`/`synthesisPtyId` before persisting (`council-service.ts:17`). The
    equivalent here is any `AbortController`, timer handle or in-flight promise — keep them in a
    side `Map` keyed by `runId`, never on the persisted object.
- [x] `workflow-engine.test.ts`: a diamond graph joins correctly, a failing node marks its
      dependants `skipped`, a cycle is rejected pre-run, a hung node times out without blocking its
      siblings, and concurrent settles do not drop a write.
  - Inject a fake clock and a fake executor registry so the timeout test does not actually wait
    120 s.
  - *Acceptance for "does not drop a write":* settle 20 nodes with `Promise.all` and assert the
    persisted run has 20 recorded outcomes — the assertion that fails without `withRunLock`.
  - *Acceptance for the lock leak:* `runLocks.size === 0` after the run reaches a terminal state.

### C — The HTTP executor (M) — ✅ DONE (PR #92, 2026-09-03)

- [x] `workflow/executors/http.ts` — method, URL, headers, body; `GET`, `POST`, `PUT`, `PATCH`,
      `DELETE`, `HEAD` and a `QUERY`-shaped GET-with-params, covering the verbs the feature note
      names.
  - Use Node's global `fetch` (Node 22 — `.prototools` pins 22.12.0). No new dependency.
  - `QUERY` is not an HTTP method; it is a `GET` whose `config.params` object is serialised into the
    query string. Name it that way in the schema (`method: 'GET', queryShaped: true`) or as its own
    literal, but say in the docblock that it is not a wire method — a reader will otherwise look for
    it in an RFC.
- [x] Response captured as `{ status, headers, body, durationMs }` and made available to downstream
      nodes.
  - `headers` as a plain `Record<string, string>` from `Object.fromEntries(res.headers)`; a
    `Headers` instance does not survive `JSON.stringify` into the run store.
  - `body` is parsed as JSON when `content-type` matches `/\bjson\b/`, and kept as a string
    otherwise. Record which happened in a `bodyIsJson: boolean` so `{{...}}` interpolation knows
    whether field access is meaningful.
- [x] Simple `{{node.field}}` interpolation from upstream outputs into URL, headers and body — a
      documented, deliberately non-Turing-complete substitution, not an expression language.
  - Grammar, written down once and tested: `{{` `<nodeId>` `.` `<dotted.path>` `}}`. The path is
    split on `.` and walked with plain property access; an array index is a numeric segment
    (`items.0.id`). No function calls, no arithmetic, no filters, no nested braces.
  - An unresolved reference is a **node failure** with the message
    `Cannot resolve {{a.b}} — node "a" has no field "b"`, not an empty string. Silent empty
    substitution is how an HTTP node quietly POSTs `undefined` and nobody notices.
  - Escaping: `{{{{` is a literal `{{`. One rule, so a JSON body containing braces is expressible.
  - Interpolation lives in its own pure module `workflow/interpolate.ts` with
    `export function interpolate(template: string, upstream: Record<string, unknown>): { ok: true; value: string } | { ok: false; error: string }`,
    unit-tested without the engine — it is string arithmetic, and string arithmetic that can be
    wrong should be testable without spawning anything.
- [x] Timeouts, non-2xx handling (a 404 is a *result*, not a crash), and a response-size cap so a
      large body cannot balloon the run store.
  - Cap at **512 KB**, reusing `COUNCIL_OUTPUT_CAP_BYTES` (`500 * 1024`,
    [`council.ts:179`](../../../packages/shared/src/council.ts)) rather than inventing a second
    number, and the `appendCapped(existing, chunk, capBytes): { buffer, truncated }` helper from
    [`council-output.ts:55`](../../../packages/desktop/src/main/council-output.ts).
  - The `truncated` flag it returns must reach the node's recorded output and be **rendered** —
    truncation the user cannot see is the failure mode this whole convention exists to avoid.
  - A non-2xx sets `ok: true` with the status recorded. Only a transport error (DNS, refused,
    timeout) is `ok: false`. Say so in the docblock, because it is counter-intuitive.
- [x] `transform`, `condition` and `delay` executors: JSON path pick/rename, a boolean predicate
      gating downstream nodes, and a bounded sleep.
  - `transform`: a list of `{ from: string; to: string }` pairs using the Theme C path grammar. No
    JS evaluation — that is a sandbox question this phase does not open.
  - `condition`: `{ left: string; op: 'eq'|'ne'|'lt'|'lte'|'gt'|'gte'|'contains'|'empty'; right?: string }`
    over interpolated values. A false predicate marks every downstream node `skipped`, the same
    terminal state a failed upstream produces.
  - `delay`: bounded to **60 000 ms** in the schema (`z.number().int().min(0).max(60_000)`), so a
    typo cannot park a run for a day.
  - `note` has no executor — it is canvas furniture. Give it an explicit no-op entry in the registry
    rather than a `default` arm, so the exhaustive `Record` keeps working.
- [x] Executor unit tests against a local fixture server, not the public internet.
  - Use Theme D's own demo API as the fixture, started on an ephemeral port in `beforeAll`. Two
    birds: the executor tests and the demo API's own tests exercise the same server.
  - *Acceptance:* the whole executor suite passes with the machine's network cable out.

### D — The demo CRUD API (M) — ◐ PARTIAL (PR #92, 2026-09-03) — the view-header surface carried to Theme H

- [x] `desktop/src/main/demo-api/server.ts` — `node:http`, bound to **`127.0.0.1` only**, on an
      ephemeral port reported back to the renderer. Never `0.0.0.0`; this is a dev conveniences
      server, and it should be impossible to reach from another machine.
  - `server.listen(0, '127.0.0.1')` and read the real port from `server.address()` after `listening`
    fires. **Port 0, not a fixed 7331** — see Decisions; the first draft said both.
  - `export function startDemoApi(): Promise<{ port: number }>`, `stopDemoApi(): Promise<void>`,
    `demoApiStatus(): { running: false } | { running: true; port: number }`.
- [x] `store.ts` — in-memory collections (`/items`, `/users`, and an arbitrary
      `/:collection`), each record auto-`id`'d and timestamped. Reset on stop; nothing persists.
  - Ids are `randomUUID()`. Timestamps are `createdAt`/`updatedAt` as epoch ms, matching the
    repo's `z.number().int().nonnegative()` convention so a workflow can round-trip them.
  - Cap each collection at **1 000 records**, oldest evicted, so a looping workflow cannot exhaust
    main's heap.
- [x] `routes.ts` — `GET /:c`, `GET /:c/:id`, `POST /:c`, `PUT /:c/:id`, `PATCH /:c/:id`,
      `DELETE /:c/:id`, `HEAD /:c/:id`, plus query params (`?limit`, `?offset`, `?field=value`) so
      the `QUERY` verb has something to query. Correct status codes throughout — 201 on create, 404
      on a missing id, 204 on delete.
  - Also: `400` on unparseable JSON, `405` with an `Allow` header on an unknown method, and
    `Content-Type: application/json` on every response that has a body.
  - `PUT` replaces and `PATCH` merges — the distinction is the point of having both, and a workflow
    author will test exactly that.
- [x] Started **on demand**, never at boot, and stopped on quit. Off by default.
  - Register the stop on `before-quit`. A `node:http` server with an open keep-alive socket delays
    quit; call `server.closeAllConnections()` before `close()`.
- [ ] ⏳ **Carried to Theme H**: Surfaced in the Workflows UI as `Demo API · running on :<port> · [stop]`, with one-click
      insertion of its base URL into a selected `http` node — the whole point is that it takes no
      setup.
  - The port is read from `demo-api:status`, never hard-coded in the renderer.
  - "Stopped" state reads `Demo API · stopped · [start]`. Both states live in the Workflows view
    header, not in Settings, because it is a thing you do while building, not a preference.
- [x] `demo-api.test.ts`: every verb, the error codes, the query params, and that it refuses a
      non-loopback bind.
  - *Acceptance for the bind:* assert `server.address().address === '127.0.0.1'` after listen, and
    assert a connection attempt to the machine's LAN IP on that port is refused.

### E — The canvas (L) — ✅ DONE (PR #100, 2026-09-03)

> **Re-tagged L, and the largest single risk in the phase.** The x1 audit found that pan/zoom,
> free 2-D drag, multi-select and undo/redo each have **zero precedent** in this renderer. This is
> six items of net-new interaction code, not six items of "reuse the existing pattern". Sequence it
> after B so there is something real to render, and expect it to be the theme that slips.

- [x] `features/workflows/canvas/workflow-canvas.tsx` — hand-rolled SVG. Nodes are positioned
      `<g>` elements; edges are cubic béziers between port anchors. No new dependency, per the
      guardrail.
  - Split the geometry out, mirroring Phase 18's two-module split:
    `canvas/workflow-geometry.ts` holds the dimension record (node width/height, port radius, grid
    step, zoom bounds) the way
    [`metric-geometry.ts`](../../../packages/app/src/features/monitor/metric-geometry.ts) holds
    `SPARKLINE_GEOMETRY`; `canvas/workflow-path.ts` holds pure `d`-string functions the way
    [`metric-path.ts`](../../../packages/app/src/features/monitor/metric-path.ts) holds `linePath`
    and `areaPath`, rounded to 2 dp by the same private `round` helper.
  - `metric-path.ts:115` states the reason to copy: *"it is arithmetic with an off-by-half in it,
    and arithmetic that can be wrong should be testable without mounting anything."*
  - **`edgePath` in [`graph-svg.tsx:321`](../../../packages/app/src/features/graph/graph-svg.tsx) is
    the bezier to copy, not to call.** Its control points are vertical
    (`controlY = (startY + endY) / 2`) because the commit graph flows top-to-bottom; a workflow flows
    left-to-right and needs the transpose (`controlX = (startX + endX) / 2`). Same shape, different
    axis.
  - Hoist shared `<defs>` — arrowhead markers, any gradient — into one always-mounted
    `<svg width={0} height={0}>` exactly as
    [`graph-defs.tsx:18`](../../../packages/app/src/features/graph/graph-defs.tsx) does. Its
    docblock explains the cost of not doing so: one duplicated marker per node.
- [x] Pan and zoom via a `viewBox` transform. **This phase defines the convention; there is none to
      inherit.**
  - State is one `{ x, y, scale }` in a `useState`, applied as
    ``viewBox={`${x} ${y} ${w / scale} ${h / scale}`}``.
  - Bindings: plain wheel / two-finger trackpad scroll **pans**; `Ctrl`- or `Cmd`-wheel **zooms**
    about the pointer. That is the macOS trackpad split and what a pinch gesture already sends
    (a pinch arrives as `wheel` with `ctrlKey: true`).
  - Zoom clamped to `[0.25, 2]`. Space-drag and middle-drag also pan.
  - `onWheel` must call `preventDefault`, which needs a **non-passive** listener — React's `onWheel`
    is passive, so attach it via `useEffect` + `addEventListener('wheel', h, { passive: false })`.
    This is the single detail most likely to be got wrong.
  - Container pixel size comes from `useContainerWidth({ measureBeforeMount: true })`, already a
    dependency via `react-grid-layout` and used at
    [`dashboard-view.tsx:328`](../../../packages/app/src/features/dashboard/dashboard-view.tsx) for
    exactly this reason (a resizable sidebar changes width without a window resize).
  - *Acceptance:* a `workflow-path.test.ts` case asserts that zooming about a pointer keeps the
    graph point under the cursor fixed — the property that makes zoom feel right and the one that
    silently breaks.
- [x] Node drag: **raw pointer events, not `@dnd-kit`.**
  - The first draft said `@dnd-kit`. Both existing uses are list reorders or discrete drop targets —
    [`sortable-list.tsx:66`](../../../packages/app/src/components/sortable-list.tsx) even applies
    `restrictToVerticalAxis` — and dnd-kit's drag-end carries **no pointer position**, which
    `graph-view.tsx:224` already works around with a manual `lastPointer` ref. Under a scaled
    `viewBox` its DOM-rect collision detection is wrong as well.
  - Use `onPointerDown` + `setPointerCapture` on the node `<g>`, convert client → graph coordinates
    by dividing the delta by `scale`, and write `x`/`y` back on `pointerup`.
  - Snap to a **16 px** grid on drop only; dragging is free, so the node tracks the cursor.
  - Keep `@dnd-kit` out of this theme entirely — it stays in the app for the lists that use it.
- [x] Edge creation by dragging from an output port to an input port, with a live preview edge and
      a rejection for a connection that would create a cycle — caught at draw time, not run time.
  - Reuse Theme B's cycle check as a pure exported function
    (`wouldCycle(edges, from, to): boolean`) so the canvas and the engine cannot disagree about what
    a cycle is.
  - An invalid target renders the preview edge in `text-destructive` and refuses the drop; it does
    not silently snap back with no explanation.
  - Drop on empty space cancels. Drop on an input port that already has an edge from the same source
    is a no-op, not a duplicate edge.
- [x] Selection and delete.
  - Single-select on click, multi-select on `Shift`-click and on marquee drag over empty space.
    Selection is `Set<string>` of node ids in canvas-local state — **net-new**; the graph's
    `selectedCommitSha` ([`ui-store.ts:304`](../../../packages/app/src/store/ui-store.ts)) is a
    single nullable string and is not a model for this.
  - `Delete`/`Backspace` removes the selection and every edge touching it. `Escape` clears the
    selection. `Cmd+A` selects all nodes.
  - Deleting a node with edges shows no confirm — undo covers it.
- [x] Undo/redo, canvas-local and in-session.
  - **Net-new.** The only `history` in the renderer is CodeMirror's own extension inside
    [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx), which is
    editor-internal and not reusable.
  - A ring buffer of whole-graph snapshots (`{ nodes, edges }`), capped at **50** entries — the
    graph is small and structural sharing is not worth the bug surface at this size.
  - `Cmd+Z` / `Cmd+Shift+Z`, handled on the canvas container, **not** registered in
    [`keybindings.ts`](../../../packages/shared/src/keybindings.ts): these are surface-local and
    must not fire while focus is in the inspector's text fields.
  - Not persisted. See Decisions.
- [x] Only nodes intersecting the viewport render, so a 200-node workflow stays interactive.
  - A plain rect-intersection filter over `nodes` against the current `viewBox`, widened by one node
    width so a partially-visible node is not popped. **Not** `@tanstack/react-virtual` — that
    virtualizes a 1-D list of known row heights (`estimateSize: () => theme.rowHeight`,
    `overscan: 24` at `graph-view.tsx:227`) and has no 2-D mode. The motivation transfers; the code
    does not.
  - Edges are culled by their bounding box, not their curve.
  - *Acceptance:* a 200-node fixture renders under 300 DOM nodes at default zoom, asserted in an
    RTL test counting `[data-node-id]` elements.

### F — The node inspector (M) — ✅ DONE (2026-09-03)

- [x] Right-hand config panel for the selected node, its form driven by the node `kind` — the
      discriminated union from Theme A is what makes this exhaustive rather than a `switch` with a
      default nobody maintains.
  - `node-inspector.tsx`'s `NODE_FORMS` is typed exactly as `Record<WorkflowNodeKind, (props: NodeFormProps) => ReactNode>`, so a sixth node kind is a typecheck failure until its form exists in `node-forms.tsx`.
  - `council-detail.tsx` no longer exists under that name — it is `council-config-panel.tsx` after Phase 42's rearrangement. The inspector mirrors its column markup with `border-l` instead of `border-r`, placed after the canvas: `flex w-80 shrink-0 flex-col border-l border-border`, a `shrink-0 … border-b` header, a `min-h-0 flex-1 overflow-auto px-3 py-2` body.
  - With nothing (or more than one node) selected the pane shows `<EmptyState>` with body *"Select a node to configure it."*
- [x] Form primitives: hoisted, not copied.
  - `Field`/`Choice` moved into `components/form/field.tsx`; `settings-pages/controls.tsx` re-exports them so its dozen call sites need no change. `TextField`/`TextArea` are new there, carrying the same className `council-config-panel.tsx`'s bare `<input>`/`<textarea>` already used.
  - `SwitchRow`/`RadioRow` needed no move — Phase 41 Theme G already hoisted them into `components/form/toggle-rows.tsx`, ahead of this phase's own doc catching up to it.
- [x] Live validation: a required field left empty marks the node invalid **on the canvas**, and an invalid workflow cannot be run.
  - **Correction:** validation is the existing `validateWorkflow()` (Theme A), not a bare `WorkflowNodeSchema.safeParse(node)` — that schema's `url`/`picks`/`right` fields have no `.min(1)`/presence constraint, so a zod parse would never catch an empty URL. `validateWorkflow`'s own docblock already earmarks it as "shared by the engine … and the canvas (which disables Run and names the offender)" — this theme is that consumer.
  - An invalid node draws a `stroke-destructive` outline and a `fill-destructive` badge (`workflow-canvas.tsx`); the canvas's new Run button is disabled with a `title` naming the first invalid node's issue.
  - *Acceptance:* `workflow-canvas.test.tsx`'s "acceptance" test runs the real `validateWorkflow` against a fixture, clears its URL, and asserts Run flips to disabled.
- [x] The `{{...}}` interpolation helper lists the upstream nodes and fields actually available at that point in the graph.
  - "Available" is the transitive ancestors of the selected node via `ancestorIds()` (new in `workflow.ts`, alongside `findCycleEdge`/`wouldCycle`). Fields come from the node kind's **declared output shape** (`node-output-fields.ts`) — the last-run fallback is Theme G's concern, since run history storage/reads live there; the doc's "when one exists" clause is deferred with it rather than guessed.
  - Insert-on-click into the focused field at the caret (`selectionStart`/`selectionEnd` on the stored element, `onMouseDown` `preventDefault` on the insert buttons so the field never blurs). No autocomplete popup.
- [x] Navigation between workflow → node.
  - No `panel-stack`: plain `ReadonlySet<string>` selection lifted from the canvas's existing `onSelectionChange`, exactly as recorded. Run-detail navigation is Theme G's own surface once it exists.

### G — Runs (M)

- [ ] Run view: the same canvas, in read-only mode, with per-node status colouring updating live.
  - `workflow-canvas.tsx` takes a `readOnly?: boolean`; in read-only mode pan/zoom stay live and
    drag, edge creation, delete and undo are all inert. One component, not two.
  - Status colours reuse the councils map verbatim
    ([`council-run-view.tsx:11`](../../../packages/app/src/features/councils/council-run-view.tsx)):
    `running → text-blue-500`, `succeeded → text-green-500`, `failed`/`timeout → text-destructive`,
    `skipped → text-muted-foreground`. `pending` is the default border.
- [ ] Liveness: **push, then re-fetch** — not polling.
  - Subscribe once at the app root to `workflowRunChanged` and invalidate the run query, following
    [`use-tests-stream.ts`](../../../packages/app/src/features/tests/use-tests-stream.ts) exactly,
    including the rule that **every subscription returns its unsubscribe** (preload doc, rule 1 —
    StrictMode double-mounts, so a missing teardown silently duplicates in dev).
  - Councils' `refetchInterval` poll (`RUN_POLL_MS = 1200`) is the wrong precedent here: it exists
    because a council member's live output rides `pty:*`, and a workflow node has no pty. A
    12-node run settling in 400 ms would look frozen at a 1 200 ms poll.
- [ ] Clicking a node in a run shows its input, output, duration and error.
  - Rendered in the same right-hand pane as the inspector, swapped by mode. Output is
    `<pre className="whitespace-pre-wrap">` with the `truncated` flag from Theme C surfaced as a
    trailing muted line, never silently dropped.
- [ ] Run history list per workflow, capped.
  - `MAX_STORED_WORKFLOW_RUNS = 200`, matching `MAX_STORED_RUNS` / `MAX_STORED_LOOP_RUNS` exactly,
    with the same **evict-on-save, keep-newest-tail** rule:
    `runs.length > MAX ? runs.slice(runs.length - MAX) : runs`.
  - Capped **globally across all workflows**, not per workflow — `councils-runs-store.ts:15`
    records why: per-node output is already capped, so a global bound is the one that matters.
- [ ] The running indicator reuses the app's existing glow idiom, and **this theme owns making it
      focus-gated.**
  - `loopGlowColor(loopId: string): string` and `LOOP_WAITING_COLOR`
    ([`loop-glow.ts:37,44`](../../../packages/app/src/features/loops/loop-glow.ts)) are the exports;
    the glow itself is the `.loop-run-glow` CSS class at
    [`styles.css:1028`](../../../packages/app/src/styles.css).
  - **The Phase 37 focus gate does not cover it.** `html[data-window-focused='false']` pauses only
    `.fab-panel-gradient::before` (`styles.css:967`), and `data-window-focused` is written by
    `useWindowFocusGate` **inside** `fab-panel.tsx:155`, only while that panel is mounted. Using the
    glow on a canvas therefore ships an ungated permanently-mounted animation — precisely what
    Phase 36 Theme E was written about.
  - So: hoist `useWindowFocusGate` out of `fab-panel.tsx` into an always-mounted host (`app.tsx`),
    and extend the paused selector to `.loop-run-glow`. Both changes are small and both are
    load-bearing.
  - `html[data-motion='reduced'] .loop-run-glow` already sets `animation: none`
    (`styles.css:1122`) — reduced motion is already handled, do not re-solve it.
  - *Acceptance:* `moon run app:perf --blurred` shows no measurable idle-CPU delta with a run
    mid-flight and the window blurred.

### H — Persistence and the list (M) — ✅ DONE (PR #92, #100, 2026-09-03) — stores + handlers (PR #92), the renderer half (PR #100)

- [x] `workflows-store.ts` and `workflow-runs-store.ts` in `desktop/src/main/`, JSON under
      `userData`, one malformed entry never costing the rest of the file — the councils stores'
      established behaviour, with the same test.
  - **Two files, not one** — `workflows.json` and `workflow-runs.json`.
    `councils-runs-store.ts:6` gives the reason: config and run history have different write
    profiles, and mixing them rewrites the whole roster every time a run's status ticks.
  - The template is exact: `export type WorkflowsStore = { load; save }`, a module-private
    `type StoredState = { version: 1; workflows: unknown[] }`, `createWorkflowsStore(directory)`,
    an exported `parseStoredWorkflows(value: unknown)` for the tests, and a `nullWorkflowsStore`.
    Written as `` `${JSON.stringify(state, null, 2)}\n` ``.
  - Two layers of tolerance: a whole-file `try/catch` returning `[]`, and a per-entry
    `safeParse` loop that pushes only successes. Writes swallow too — a read-only data dir must not
    take the app down.
  - **`version: 1` is written but never read**, and there is no migration machinery anywhere in
    this repo. Do not promise a migration path the precedent does not have; a shape change simply
    drops old entries.
  - *Acceptance:* a fixture file with 3 valid and 1 corrupt entry loads exactly 3.
- [x] `ipc/workflow-handlers.ts`, registered like
      [`council-handlers.ts`](../../../packages/desktop/src/main/ipc/council-handlers.ts).
  - `registerWorkflowHandlers(getWindow: () => BrowserWindow | null)` — it **does** take the thunk,
    unlike `registerCouncilHandlers()`, because this domain pushes events. Call it in
    [`index.ts`](../../../packages/desktop/src/main/index.ts) beside `registerCouncilHandlers()`,
    and wire the stores separately and earlier with
    `configureWorkflows(createWorkflowsStore(userData), createWorkflowRunsStore(userData), getWindow)`.
  - Use `handle(channel, schema, fn, (issue) => failure(issue))` from
    [`handle.ts:19`](../../../packages/desktop/src/main/ipc/handle.ts) — not `handleOp` — wherever
    the result carries a `value`, which is what council-handlers does and why.
  - `workflow:cancel` is one-way: `ipcMain.on` + a manual `safeParse`, following
    `tests-handlers.ts:139`.
- [x] `features/workflows/workflows-view.tsx` **replaces the `<Placeholder>`** at
      [`app.tsx:980`](../../../packages/app/src/app.tsx): a workflow list with create/duplicate/delete.
  - **Last-run status per row deferred to Theme G.** Theme G ("Runs") is what actually builds the
    run-history surface this would read from; wiring a per-row `runs.list` query in here first would
    duplicate that data model rather than reuse it. `workflow-list.tsx` shows node count per row for
    now, the same information `council-list.tsx` shows for a council with no run yet.
  - **Insert the arm before the `!selectedRepoId` guard at `app.tsx:961`**, beside `councils`. The
    comment at `app.tsx:949` states the rule: global views must be reachable before that guard.
    Workflows is global by this phase's own settled decision, so leaving it in the current
    fall-through position would show `<EmptyWorkspace />` to anyone with no repo open.
  - Empty state: `<EmptyState icon={LuWorkflow} title="No workflows yet" body="Create one to get started." />`,
    matching `councils-view.tsx:25`.
- [x] Lazy `loadWorkflowsView`, under the existing Suspense boundary.
  - Exact form, copying `app.tsx:102`:
    `const loadWorkflowsView = () => import('./features/workflows/workflows-view');` then
    `const WorkflowsView = lazy(() => loadWorkflowsView().then((m) => ({ default: m.WorkflowsView })));`
  - One shared `<Suspense>` already wraps all thirteen views (`app.tsx:938`) — do not add a second.
- [x] Query hooks in `features/workflows/use-workflow.ts`, **not** in
      [`queries.ts`](../../../packages/app/src/services/queries.ts).
  - Councils are deliberately absent from that file (`grep -c council` → 0), and
    [`use-council.ts:13`](../../../packages/app/src/features/councils/use-council.ts) records why:
    global entities carry no `repoId`, and nothing about them invalidates on a watcher event. A
    global workflows domain takes the same shape.
  - Key factory `WORKFLOW_KEYS = { list: ['workflows'] as const, detail: (id) => ['workflows', id] as const }`.
  - `noBridge<T>()` and `reportFailure<T>()` are currently duplicated verbatim in both council hook
    files. Hoist them to `services/bridge-result.ts` rather than writing a third copy.
- [x] Import/export a workflow as JSON — the cheapest possible sharing story, and it makes the
      contract's round-trip testable.
  - Export writes `WorkflowSchema.parse`'d JSON through the existing save dialog; import
    `safeParse`s and reports the zod issue verbatim on failure.
  - Import assigns **fresh ids** to the workflow and every node, remapping edges, so importing the
    same file twice does not collide.

### I — Wiring and verification (M)

- [ ] Sidebar sections: **no change needed** in
      [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts).
  - The first draft called `WORK_IN_PROGRESS` a placeholder to be replaced. It is not — it is a
    sidebar *filter preset* (`{ sections: ['worktrees'], dirtyOnly: true }`, line 157), and
    **councils kept it after Phase 34** (line 191) precisely because a global view has no section of
    its own to narrow to. `workflows: WORK_IN_PROGRESS` at line 192 is already correct.
  - `view-sections.test.ts:154` already asserts `workflows: false` in `filtersByDefault`. Leave it.
- [ ] Palette: the view row already exists; only the run command is new.
  - `VIEW_LABELS.workflows` (`providers.ts:35`) and `VIEW_KEYWORDS.workflows` (`:50`) are both
    populated, and `createViewsSource` (`:89`) derives every view row from `VIEW_IDS`. **Opening
    Workflows from the palette works today.**
  - What is new: a `workflow.run` command. Add `{ id: 'workflow.run', label: 'Run Workflow', group: 'view' }`
    to `COMMANDS` in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) — **chord-less**,
    following the `op.abort`/`markdown.presentAsSlides` precedent of declared-but-unbound commands.
    `CommandGroup` has no `'workflows'` member and does not need one.
  - A new `CommandId` also needs a `CommandRuntime` entry in
    [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts)
    and a `COMMAND_ICONS` entry — both are keyed by `CommandId`, so both are typecheck failures
    until added.
  - Native menu group in [`menu.ts`](../../../packages/desktop/src/main/menu.ts).
- [ ] A Workflows settings page: the default node timeout and the run-history cap.
  - Registration is **four edits across three files**, each enforced by a `Record` over the union:
    the id in `SettingsPageId` ([`ui-store.ts:87`](../../../packages/app/src/store/ui-store.ts)), a
    row in `SETTINGS_PAGES` (`:125`, group `'tools'`, beside `agent`/`reviews`), an entry in
    `PAGE_CONTENT` ([`settings-view.tsx:33`](../../../packages/app/src/features/settings/settings-view.tsx)),
    and a `SETTINGS_PAGE_ICON` entry in `nav-icons.ts`.
  - The page follows `graph-page.tsx`: a named `function WorkflowsPage()` with no props returning
    `<div className="flex flex-col gap-3">` of `<Accordion title icon defaultOpen>` from
    `@bilo-io/ui`, each wrapping `<div className="p-3">`.
  - The palette picks the page up for free via `createViewsSource` — no palette edit.
  - **The demo API toggle does not go here.** It lives in the Workflows view header (Theme D), where
    you are when you need it.
- [ ] Playwright `e2e/workflows.spec.ts` against the mock bridge: create a workflow, add two nodes,
      connect them, run it, watch both reach a terminal state.
  - The mock bridge must learn the `workflow` namespace and emit a `workflowRunChanged` after a
    scripted delay, or the run never settles in the spec.
  - Given [Phase 38](phase-38-e2e-suite-repair.md)'s ratchet, add the new spec **green** and keep it
    out of the ratchet list.
- [ ] One **real** end-to-end pass: start the demo API, build a POST-then-GET workflow against it,
      run it, and see the created record come back.
- [ ] Screenshots: the workflow list, the canvas with a selected node, and a run mid-flight.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts) *(new)*, [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts), [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) |
| Contract, reused | [`domain/result.ts`](../../../packages/shared/src/domain/result.ts) (**unchanged** — `GitOpResultOf` is the envelope, copy it, do not rebuild it) |
| Engine | `desktop/src/main/workflow/` *(new)* — `workflow-engine.ts`, `executor-registry.ts`, `node-executor.ts`, `interpolate.ts`, `executors/{http,transform,condition,delay}.ts` |
| Demo API | `desktop/src/main/demo-api/` *(new)* — `server.ts`, `store.ts`, `routes.ts` |
| Stores | `desktop/src/main/workflows-store.ts`, `workflow-runs-store.ts` *(new)* |
| IPC | `desktop/src/main/ipc/workflow-handlers.ts`, `demo-api-handlers.ts` *(new)*, [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) (**unchanged**), [`index.ts`](../../../packages/desktop/src/main/index.ts) (registration + `configureWorkflows`) |
| Preload | [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — namespace union member **and** implementation; a missing member is a compile error |
| Main, reused | [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts), [`council-output.ts`](../../../packages/desktop/src/main/council-output.ts) (`appendCapped`), [`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts) (the `getWindow` thunk) — all **unchanged**, all read before writing |
| Renderer, new | `app/src/features/workflows/` — `workflows-view.tsx`, `use-workflow.ts`, `canvas/{workflow-canvas,workflow-geometry,workflow-path}.tsx\|ts`, `inspector/`, `runs/` |
| Renderer, edited | [`app.tsx`](../../../packages/app/src/app.tsx) (lazy pair, ternary arm **before** the repo guard, hoisted `useWindowFocusGate`), [`styles.css`](../../../packages/app/src/styles.css) (extend the paused selector to `.loop-run-glow`), [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`SettingsPageId`, `SETTINGS_PAGES`), [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) (`PAGE_CONTENT`), [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) (`SETTINGS_PAGE_ICON`), `use-command-handlers.ts`, `command-icons.ts` |
| Renderer, moved | `components/form/` *(new)* — `Field`/`Choice` out of [`settings-pages/controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx), `SwitchRow`/`RadioRow` out of [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx), plus new `TextField`/`TextArea` |
| Renderer, moved | `services/bridge-result.ts` *(new)* — `noBridge`/`reportFailure`, currently duplicated in [`use-council.ts`](../../../packages/app/src/features/councils/use-council.ts) and `use-council-run.ts` |
| Deliberately untouched | [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) — `workflows: WORK_IN_PROGRESS` is already correct for a global view; [`providers.ts`](../../../packages/app/src/services/palette/providers.ts) view rows — already populated and derived from `VIEW_IDS`; [`queries.ts`](../../../packages/app/src/services/queries.ts) — global domains stay feature-local; `packages/git-engine` — nothing here touches git |
| Menu | [`desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: the engine and the demo server stay in `packages/desktop`; `shared`
      carries only zod; `git-engine` is untouched — workflows do not touch git.
- [ ] No module imports both `WorkflowNode` and `ForgeWorkflow` without a comment explaining why.
- [ ] ◐ `moon run app:perf`: the Workflows view and its canvas are lazy, entry chunk unmoved, no new
      runtime dependency added.
  - **Measured for Themes A–D (PR #92, 2026-09-03):** entry chunk **1298.5 KB → 1300.5 KB
    (+2.0 KB, +0.15%)**, total JS 13984.5 → 13986.5 KB across the same 453 chunks;
    `scripts/perf/bundle-report.mjs` against `moon run app:build`, baseline a detached worktree
    at `origin/main`. **No new runtime dependency** — the `http` executor is Node 22's global
    `fetch` and the demo API is `node:http`.
  - The +2 KB is `shared/src/workflow.ts` reaching the renderer through the `index.ts` barrel,
    and it is not tree-shakeable: `const X = z.object(...)` is an unannotated call, so rollup
    cannot prove it pure and keeps it. `council.ts` is already in the entry chunk for exactly
    the same reason, so this is the established cost of a domain living in `shared`, not a
    regression introduced here. Worth revisiting for the whole barrel if it ever matters — the
    fix would be a deep-import convention, which is a Phase 36 question and not this phase's.
  - **Still open:** the lazy-chunk half, which needs Themes E/H's actual view to exist before
    there is anything to assert is lazy.
- [ ] `ipc.test.ts`'s new `describe('workflow contract')` block fails when a `workflow*` channel is
      added without a `CASES` row — proven by deleting one row and watching it go red.
- [ ] The demo API refuses a non-loopback bind: `server.address().address === '127.0.0.1'`, and a
      connection to the machine's LAN IP on that port is refused.
- [ ] `workflow-engine.test.ts` asserts all five: diamond join, failed-marks-dependants-skipped,
      pre-run cycle rejection, per-node timeout without blocking siblings, and 20 concurrent settles
      producing 20 recorded outcomes.
- [ ] `runLocks.size === 0` after a run reaches a terminal state — the leak the councils original
      still has.
- [ ] Cancelling a 5-node run mid-flight leaves zero nodes `pending` and zero `running`.
- [ ] `interpolate.test.ts`: the `{{a.b}}` grammar, numeric array segments, the `{{{{` escape, and
      an unresolved reference producing a **failure** rather than an empty string.
- [ ] A capped HTTP response sets `truncated: true` and the run view **renders** the truncation
      notice — the flag existing but not being shown is the failure this convention exists to stop.
- [ ] A store fixture with 3 valid and 1 corrupt entry loads exactly 3.
- [ ] `workflow-path.test.ts`: zooming about a pointer keeps the graph point under the cursor fixed.
- [ ] A 200-node fixture renders under 300 `[data-node-id]` elements at default zoom.
- [ ] An invalid node disables the Run button, with a `title` naming it (RTL).
- [ ] Import of an exported workflow twice produces two workflows with disjoint node ids.
- [ ] With no repository open, the Workflows rail item renders the workflow list — **not**
      `<EmptyWorkspace />`. This is the regression the `app.tsx:961` placement prevents.
- [ ] `moon run app:perf --blurred` shows no measurable idle-CPU delta with a run mid-flight and the
      window blurred, proving the hoisted focus gate reaches `.loop-run-glow`.
- [ ] The real end-to-end pass from Theme I, on a machine with **no network** — proving the demo
      API makes the feature self-contained.
- [ ] **Open, for a human:** screenshots per Theme I — the workflow list, the canvas with a selected
      node, and a run mid-flight.

## Not in this phase

Scheduled/cron triggers, webhook ingress, task-event triggers, a credentials vault, an expression
language beyond `{{node.field}}`, workflow templates or a marketplace, versioning, per-repo
scoping, a minimap, auto-layout, and node kinds beyond the five in Theme A — notably **an agent
node**, which is the obvious next phase and the one that makes Workflows and the Kanban meet.

Added by the x1 refinement, each with its reason:

- **`panel-stack`.** It does not exist, [Phase 42](phase-42-councils-layout.md) owns building it,
  and this phase's three panes need no history — the canvas is always visible and the inspector
  always reflects the current selection.
- **Persisted undo history.** A ring buffer in memory is a small promise; an undo stack that
  survives restart is a much larger one about what a workflow *is*.
- **An autocomplete popup for `{{...}}`.** Click-to-insert from a list of genuinely-available
  upstream fields covers the need; a popup is an editor feature.
- **JS evaluation in the `transform` node.** That is a sandbox question, and opening it here would
  drag a security review into a phase that otherwise has none.
- **A second `<Suspense>` boundary or a second virtualizer.** One boundary already wraps all
  thirteen views; 2-D culling is a rect filter, not `@tanstack/react-virtual`.

## Decisions / open questions

- **Settled — hand-rolled SVG canvas, no graph library.** Matches Phase 5 and Phase 18 precedent
  and costs nothing against Phase 36's budgets. The price is edge routing and a minimap, both of
  which are deferred rather than faked.
- **Settled — a real local `node:http` demo API in main.** Chosen over a mock transport because a
  mock never exercises real fetch, timeouts, or status codes, which is most of what an HTTP node
  gets wrong.
- **Settled — global, not per-repo**, matching councils. Consequences, all now written into the
  themes: the view arm goes **before** `app.tsx:961`'s repo guard; hooks live in
  `features/workflows/use-workflow.ts` rather than `queries.ts`; and `view-sections.ts` needs no
  change at all.
- **Resolved — node outputs flow implicitly, by edge.** A node reads its upstreams by id through
  `{{nodeId.path}}`; there is no explicit port-mapping UI. An explicit mapping is a lot of surface
  for a five-node vocabulary, and the interpolation helper (Theme F) gives back most of what the
  mapping UI would have offered — a list of what is actually available — at a fraction of the cost.
- **Resolved — the demo API does not auto-start.** Off by default, started explicitly from the
  Workflows view header. A server that starts itself because you opened a view is a surprise, and
  on macOS it can raise a firewall prompt the user did not ask for.
- **Resolved — the demo API binds an ephemeral port (`listen(0)`), not `7331`.** The first draft
  said both, in two adjacent items. Ephemeral wins because a fixed port collides with whatever else
  the developer is running, and this server's whole promise is that it takes no setup. The renderer
  reads the real port from `demo-api:status` and never hard-codes one.
- **Resolved — undo/redo is canvas-local, in-session, and not persisted.** A 50-entry ring buffer of
  whole-graph snapshots. It is net-new code with no precedent in the renderer (CodeMirror's
  `history` is editor-internal), so it is scoped as tightly as it can be while still being useful.
- **Resolved — Phase 42 builds `panel-stack`, and this phase does not consume it.** The earlier
  draft had Theme F adopting it, which would have made a 0%-complete phase depend on another
  0%-complete phase for a primitive neither has written. The three panes need no history; if 42
  lands first, its primitive is worth adopting for the runs drawer alone.
- **Resolved — liveness is push (`workflowRunChanged`) plus a re-fetch, not polling.** Councils poll
  at 1 200 ms because a member's live output rides `pty:*`; a workflow node has no pty, and a
  12-node run settling in 400 ms would look frozen. The event carries **no payload**, exactly as
  `loopRunsChanged` does — a bare ping plus a re-fetch needs no payload design, no ordering
  guarantee and no reconciliation, and the run object is small.
- **Resolved — node drag uses raw pointer events, not `@dnd-kit`.** Both existing dnd-kit call sites
  are list reorders or discrete drop targets, its drag-end carries no pointer position (already
  worked around at `graph-view.tsx:224`), and its DOM-rect collision detection is wrong under a
  scaled `viewBox`.
- **Resolved — this phase defines the pan/zoom convention.** There is none to inherit: `onWheel`,
  `deltaY` and `zoom` return zero hits across `packages/app/src`, and the commit graph is a
  virtualized list of per-row SVGs, not a canvas. Plain wheel pans, `Ctrl`/`Cmd`-wheel zooms about
  the pointer, clamped to `[0.25, 2]`, with a non-passive listener so `preventDefault` works.
- **Resolved — Theme G owns hoisting the window-focus gate.** Phase 37 deliberately scoped its gate
  to `.fab-panel-gradient::before` and wrote `data-window-focused` only while the FAB panel is
  mounted. A workflow-run glow on an always-mounted canvas needs both the hook hoisted and the
  selector extended, and no other theme is going to do it.
- **Resolved — form primitives get hoisted into `components/form/`, not copied.** `SwitchRow` and
  friends are private to `loop-composer.tsx`, which already re-inlines its own switch markup once.
  A third copy is how a design system dies; this phase is the moment to close the seam.
- **Open — does `condition` gate by marking downstream `skipped`, or by not scheduling them at
  all?** *Recommendation:* mark them `skipped`. It is the same terminal state a failed upstream
  produces, it keeps "every node in the frozen snapshot has a terminal status" true, and it gives
  the run view something honest to draw. Not scheduling them leaves nodes in `pending` forever,
  which is exactly the incoherent state Theme B's cancel item forbids.
- **Open — should a workflow be runnable while it has unsaved canvas edits?** *Recommendation:* no;
  save first, implicitly. The run snapshot is frozen from the saved workflow, so running unsaved
  edits would produce a run whose graph never existed on disk — untraceable afterwards. An implicit
  save on Run is one line and makes the snapshot guarantee true.
