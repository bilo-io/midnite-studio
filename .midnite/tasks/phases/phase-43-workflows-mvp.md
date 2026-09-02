# Phase 43 — Workflows

`workflows` has been a registered `ViewId` since Phase 19 — it is in the union at
[`ui-store.ts:56`](../../../packages/app/src/store/ui-store.ts), in `VIEW_IDS`, in
`AGENT_NAV_ITEMS` at [`app.tsx:252`](../../../packages/app/src/app.tsx), it has an icon and a
palette entry — and it has rendered the generic `<Placeholder>` ever since. This phase fills it,
the way [Phase 34](phase-34-agent-councils.md) filled the identically-reserved Councils slot.

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

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts (M)

- [ ] `Workflow`, `WorkflowNode`, `WorkflowEdge`, `WorkflowRun`, `WorkflowNodeRun` zod schemas in a
      new [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts), plus
      `workflow.test.ts`, modelled on `council.ts`'s structure.
- [ ] `WorkflowNode` is a **discriminated union on `kind`**, and the MVP's vocabulary is exactly
      five: `http`, `transform`, `condition`, `delay`, `note`. Written as a union, not an open
      string, so adding node #6 is an honest schema change.
- [ ] `WorkflowNodeStatus` — `pending | running | succeeded | failed | skipped` — mirroring the
      council member states the runner already models.
- [ ] Node position (`x`, `y`) lives on the node, so the canvas layout is data and survives a
      round-trip through the store.
- [ ] Channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts):
      `mstudio:workflow:list|save|delete|run|cancel`, `mstudio:workflow-runs:list|get`, and
      `mstudio:demo-api:start|stop|status`. Push events (`workflowRunChanged`,
      `workflowNodeChanged`) grouped under `EVENT_CHANNELS`, as `loopRunsChanged` is.
- [ ] Bridge signatures in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), returning the
      result envelope — a failed node is a normal outcome the UI renders, never a thrown error.

### B — The engine (L)

- [ ] `desktop/src/main/workflow/executor-registry.ts` — `kind → executor` lookup, one place a new
      node type is registered.
- [ ] `node-executor.ts` — resolves a node's inputs from its incoming edges, runs its executor,
      records the result, emits a change event.
- [ ] `workflow-engine.ts` — topological order over the graph, executing independent branches in
      **parallel** and joining before a node with multiple inputs. Cycle detection **before** the
      first node runs, reported as a validation error against the offending edge, not a hang.
- [ ] A **per-run mutation lock**, the `withRunLock` pattern from
      [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) — parallel node
      settles racing on a read-modify-write of the run object is the exact bug Phase 34 found, and
      this engine reproduces its conditions.
- [ ] Per-node timeout and whole-run cancel, both leaving a coherent terminal state — a cancelled
      run's un-started nodes are `skipped`, not `pending` forever.
- [ ] A run's node snapshot is frozen at run start, so editing the workflow mid-run does not
      rewrite history (the Phase 34 Theme A guarantee, applied here).
- [ ] `workflow-engine.test.ts`: a diamond graph joins correctly, a failing node marks its
      dependants `skipped`, a cycle is rejected pre-run, a hung node times out without blocking its
      siblings, and concurrent settles do not drop a write.

### C — The HTTP executor (M)

- [ ] `workflow/executors/http.ts` — method, URL, headers, body; `GET`, `POST`, `PUT`, `PATCH`,
      `DELETE`, `HEAD` and a `QUERY`-shaped GET-with-params, covering the verbs the feature note
      names.
- [ ] Response captured as `{ status, headers, body, durationMs }` and made available to downstream
      nodes.
- [ ] Simple `{{node.field}}` interpolation from upstream outputs into URL, headers and body — a
      documented, deliberately non-Turing-complete substitution, not an expression language.
- [ ] Timeouts, non-2xx handling (a 404 is a *result*, not a crash), and a response-size cap so a
      large body cannot balloon the run store.
- [ ] `transform`, `condition` and `delay` executors: JSON path pick/rename, a boolean predicate
      gating downstream nodes, and a bounded sleep.
- [ ] Executor unit tests against a local fixture server, not the public internet.

### D — The demo CRUD API (M)

- [ ] `desktop/src/main/demo-api/server.ts` — `node:http`, bound to **`127.0.0.1` only**, on an
      ephemeral port reported back to the renderer. Never `0.0.0.0`; this is a dev conveniences
      server, and it should be impossible to reach from another machine.
- [ ] `store.ts` — in-memory collections (`/items`, `/users`, and an arbitrary
      `/:collection`), each record auto-`id`'d and timestamped. Reset on stop; nothing persists.
- [ ] `routes.ts` — `GET /:c`, `GET /:c/:id`, `POST /:c`, `PUT /:c/:id`, `PATCH /:c/:id`,
      `DELETE /:c/:id`, `HEAD /:c/:id`, plus query params (`?limit`, `?offset`, `?field=value`) so
      the `QUERY` verb has something to query. Correct status codes throughout — 201 on create, 404
      on a missing id, 204 on delete.
- [ ] Started **on demand**, never at boot, and stopped on quit. Off by default.
- [ ] Surfaced in the Workflows UI as `Demo API · running on :7331 · [stop]`, with one-click
      insertion of its base URL into a selected `http` node — the whole point is that it takes no
      setup.
- [ ] `demo-api.test.ts`: every verb, the error codes, the query params, and that it refuses a
      non-loopback bind.

### E — The canvas (L)

- [ ] `features/workflows/canvas/workflow-canvas.tsx` — hand-rolled SVG. Nodes are positioned
      `<g>` elements; edges are cubic béziers between port anchors. No new dependency, per the
      guardrail.
- [ ] Pan and zoom via a `viewBox` transform, with the wheel/trackpad conventions the commit graph
      already uses so the two canvases do not disagree.
- [ ] Node drag with `@dnd-kit` (already a dependency), snapping to a grid, writing `x`/`y` back to
      the node.
- [ ] Edge creation by dragging from an output port to an input port, with a live preview edge and
      a rejection for a connection that would create a cycle — caught at draw time, not run time.
- [ ] Selection, multi-select, delete, and undo/redo scoped to the canvas.
- [ ] Only nodes intersecting the viewport render, so a 200-node workflow stays interactive — the
      lesson the virtualized graph already learned.

### F — The node inspector (M)

- [ ] Right-hand config panel for the selected node, its form driven by the node `kind` — the
      discriminated union from Theme A is what makes this exhaustive rather than a `switch` with a
      default nobody maintains.
- [ ] Live validation: a required field left empty marks the node invalid **on the canvas**, and an
      invalid workflow cannot be run.
- [ ] The `{{...}}` interpolation helper lists the upstream nodes and fields actually available at
      that point in the graph, rather than asking the user to remember them.
- [ ] Adopt [Phase 42](phase-42-councils-layout.md)'s `panel-stack` for workflow → node → run-detail
      navigation, so this view and Councils behave identically. (If 42 has not landed, this theme
      is what unblocks it — coordinate rather than duplicating.)

### G — Runs (M)

- [ ] Run view: the same canvas, in read-only mode, with per-node status colouring updating live
      off the `EVENT_CHANNELS` push.
- [ ] Clicking a node in a run shows its input, output, duration and error.
- [ ] Run history list per workflow, capped, following
      [`loop-runs-store.ts`](../../../packages/desktop/src/main/loop-runs-store.ts)'s capping
      convention rather than growing forever.
- [ ] The running indicator reuses the app's existing glow idiom
      ([`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts)) rather than a third
      running-animation, and is focus-gated per Phase 37.

### H — Persistence and the list (M)

- [ ] `workflows-store.ts` and `workflow-runs-store.ts` in `desktop/src/main/`, JSON under
      `userData`, one malformed entry never costing the rest of the file — the councils stores'
      established behaviour, with the same test.
- [ ] `ipc/workflow-handlers.ts`, registered like
      [`council-handlers.ts`](../../../packages/desktop/src/main/ipc/council-handlers.ts).
- [ ] `features/workflows/workflows-view.tsx` **replaces the `<Placeholder>`** at
      [`app.tsx:980`](../../../packages/app/src/app.tsx): a workflow list, create/duplicate/delete,
      and last-run status per row.
- [ ] Lazy `loadWorkflowsView`, under the existing Suspense boundary.
- [ ] Import/export a workflow as JSON — the cheapest possible sharing story, and it makes the
      contract's round-trip testable.

### I — Wiring and verification (M)

- [ ] Sidebar sections in
      [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) — currently
      a `WORK_IN_PROGRESS` filter, as Councils' was before Phase 34.
- [ ] Palette entries in
      [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) (open
      Workflows, run a named workflow) and a native menu group in
      [`menu.ts`](../../../packages/desktop/src/main/menu.ts).
- [ ] A Workflows settings page: the demo API toggle and port, default node timeout, run-history
      cap.
- [ ] Playwright `e2e/workflows.spec.ts` against the mock bridge: create a workflow, add two nodes,
      connect them, run it, watch both reach a terminal state.
- [ ] One **real** end-to-end pass: start the demo API, build a POST-then-GET workflow against it,
      run it, and see the created record come back.
- [ ] Screenshots: the workflow list, the canvas with a selected node, and a run mid-flight.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts) *(new)*, [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) |
| Engine | `desktop/src/main/workflow/` *(new)* — `workflow-engine.ts`, `executor-registry.ts`, `node-executor.ts`, `executors/` |
| Demo API | `desktop/src/main/demo-api/` *(new)* — `server.ts`, `store.ts`, `routes.ts` |
| Stores | `desktop/src/main/workflows-store.ts`, `workflow-runs-store.ts` *(new)* |
| IPC | `desktop/src/main/ipc/workflow-handlers.ts`, `demo-api-handlers.ts` *(new)* |
| Renderer | `app/src/features/workflows/` *(new)*, [`app.tsx`](../../../packages/app/src/app.tsx), [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts), [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts), [`queries.ts`](../../../packages/app/src/services/queries.ts) |
| Menu | [`desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: the engine and the demo server stay in `packages/desktop`; `shared`
      carries only zod; `git-engine` is untouched — workflows do not touch git.
- [ ] No module imports both `WorkflowNode` and `ForgeWorkflow` without a comment explaining why.
- [ ] `moon run app:perf`: the Workflows view and its canvas are lazy, entry chunk unmoved, no new
      runtime dependency added.
- [ ] The demo API refuses a non-loopback bind, asserted in a test.
- [ ] The real end-to-end pass from Theme I, on a machine with **no network** — proving the demo
      API makes the feature self-contained.
- [ ] Screenshots per Theme I.

## Not in this phase

Scheduled/cron triggers, webhook ingress, task-event triggers, a credentials vault, an expression
language beyond `{{node.field}}`, workflow templates or a marketplace, versioning, per-repo
scoping, a minimap, auto-layout, and node kinds beyond the five in Theme A — notably **an agent
node**, which is the obvious next phase and the one that makes Workflows and the Kanban meet.

## Decisions / open questions

- **Settled — hand-rolled SVG canvas, no graph library.** Matches Phase 5 and Phase 18 precedent
  and costs nothing against Phase 36's budgets. The price is edge routing and a minimap, both of
  which are deferred rather than faked.
- **Settled — a real local `node:http` demo API in main.** Chosen over a mock transport because a
  mock never exercises real fetch, timeouts, or status codes, which is most of what an HTTP node
  gets wrong.
- **Settled — global, not per-repo**, matching councils.
- **Open — how do node outputs flow: implicit by edge, or explicit mapping?**
  *Recommendation:* implicit for the MVP — a node reads its upstreams by id through `{{...}}`. An
  explicit port-mapping UI is a lot of surface for a five-node vocabulary.
- **Open — should the demo API auto-start when a workflow references its base URL?**
  *Recommendation:* no. Off by default and started explicitly; a server that starts itself is a
  surprise, and macOS may prompt for it.
- **Open — undo/redo scope on the canvas (Theme E).** *Recommendation:* canvas-local and
  in-session, not persisted. Persisting an undo stack is a much larger promise than this phase
  should make.
- **Open — does this phase or [Phase 42](phase-42-councils-layout.md) build `panel-stack`?**
  *Recommendation:* Phase 42, which is smaller and whose whole point it is. Theme F consumes it;
  if 43 runs first, build the primitive here to 42's spec so it is not written twice.
