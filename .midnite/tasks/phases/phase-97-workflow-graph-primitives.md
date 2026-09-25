# Phase 97 — Workflow graph primitives, loops and templates

Brainstormed with the user · 2026-09-24 · seeded by three articles now in the working tree
([`Graph Engineering.md`](../../../docs/agentic_engineering/Graph%20Engineering.md),
[`Harness Engineering.md`](../../../docs/agentic_engineering/Harness%20Engineering.md),
[`Loop Engineering.md`](../../../docs/agentic_engineering/Loop%20Engineering.md), with their three
diagrams under [`docs/images/`](../../../docs/images/)). Grounded against the tree as of `0c2cb660`.

The three diagrams draw the same thing three ways. A request is scoped, then fans out into
independent branches (research / build / verify). The results are joined and synthesized, then
pass through a **Pass?** diamond. YES ships; NO is a **back-edge** into the work. Around the model sits a **harness**
(contract, context, state, tools, permissions, evidence). A **trigger** (a schedule, a PR) starts
the whole loop, and a **checker that is not the maker** decides whether it goes round again.

Midnite Studio's Workflows editor cannot draw any of that today. This phase gives it the
primitives: typed ports, edge kinds, routing, joins, bounded cycles, gates, verifiers, triggers,
durable run state and a harness frame. It then ships the documented graphs as built-in templates.

> **Builds on.**
> - **The contract** — [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts). Seven
>   node kinds (`WORKFLOW_NODE_KINDS`, `:31`: http, transform, condition, delay, note, agent,
>   script). `WorkflowEdgeSchema` (`:248`) is **`{id, from, to}` — no ports, no kind**.
>   `findCycleEdge` / `wouldCycle` (`:486`, `:527`) forbid cycles on both sides of the boundary.
>   `WORKFLOW_NODE_CONCURRENCY = 4` and `MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW = 20` (`:589`, `:599`).
> - **The engine** — [`workflow-engine.ts`](../../../packages/desktop/src/main/workflow/workflow-engine.ts)
>   runs a Kahn topological schedule. A node waits on **every** parent, and any failed / timed-out /
>   skipped parent skips it (`:330`). A false `condition` sets `skipDownstream` → `gatedDownstream`
>   (`:609-615`), which gates *all* children. There is no true/false branch.
>   Executors live in [`executors/`](../../../packages/desktop/src/main/workflow/executors/), and
>   `{{nodeId.path}}` resolution in [`interpolate.ts`](../../../packages/desktop/src/main/workflow/interpolate.ts).
> - **The agent node's verdict** — `MIDNITE_WORKFLOW_NODE_DONE: ok|fail`
>   (`WORKFLOW_AGENT_DONE_MARKER`, `workflow.ts:150`, Phase 95 Theme J). It is already a maker/checker
>   signal, just one nothing routes on.
> - **The editor** — the lazy `@xyflow/react` + `@dagrejs/dagre` canvas from Phase 95 Theme I, under
>   [`features/workflows/canvas/`](../../../packages/app/src/features/workflows/canvas/). It
>   includes `workflow-node-view.tsx` (card nodes, category hues `--node-trigger|action|logic|data|storage`),
>   `node-kind-meta.ts`, `node-palette.tsx`, `node-inspector.tsx` / `node-forms.tsx`,
>   `run-replay.ts`, and `workflow-layout.ts` (dagre LR). Node glow uses `.activity-glow` +
>   `useActivityGlow` (Phase 95 Themes A/C), whose palette already has a `waiting` state.
> - **"Save as template"** ([`workflows-view.tsx:337`](../../../packages/app/src/features/workflows/workflows-view.tsx))
>   is a clone (`cloneWorkflowWithFreshIds`). **There are no built-in templates.**
> - **The demo API** ([`main/demo-api/`](../../../packages/desktop/src/main/demo-api/), Phase 43
>   Theme D). It is a schemaless `/:collection[/:id]` store on `127.0.0.1:<port 0>`, started from
>   [`demo-api-pill.tsx`](../../../packages/app/src/features/workflows/demo-api-pill.tsx). **Its
>   port changes every start, and `{{…}}` can only name nodes**, so no saved workflow can point
>   at it durably.
> - **Neighbours reused, not rebuilt.** The forge poller
>   ([`forge/forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts)) for PR triggers.
>   The Studio MCP server ([`main/mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts)) for
>   remote approval. The notification bell ([`status-bar/notification-bell.tsx`](../../../packages/app/src/features/status-bar/notification-bell.tsx)).
>   Auto-mate ([`projects/board/use-automate.ts`](../../../packages/app/src/features/projects/board/use-automate.ts)).
>   The kill switch ([`automate/kill-switch-modal.tsx`](../../../packages/app/src/features/automate/kill-switch-modal.tsx)).
>   [Phase 94](phase-94-ai-engineering.md) Theme A's `AgentRunRecord` for receipts.

> **Scope guardrails.**
> - **Still one workflow engine.** Every primitive here is an extension of `workflow-engine.ts`.
>   There is no second orchestrator beside it, and Councils are untouched. This is the home that
>   [Phase 94](phase-94-ai-engineering.md) Decision 6 names for graph engineering in the
>   execution-topology sense.
> - **No LLM judge.** A verifier is either an agent whose own done marker says ok/fail, or a
>   computed check. A judge that needs a scoring model stays out, matching Phase 94 Decision 5.
> - **Triggers fire only while the app is open.** Manual, cron-while-open, and forge PR
>   opened/updated through the existing poller. There are no webhooks, no file-watch triggers and
>   no launchd agent.
> - **Every cycle is bounded by construction.** A `loop` edge without `maxIterations` and a budget
>   fails schema validation. "Repeat until good" is not a stop condition.
> - **Old workflows open and run unchanged.** Untyped edges migrate to `data` edges on the default
>   handles. A workflow with no new node kinds executes exactly as today (asserted by the existing
>   `workflow-engine.test.ts` suite passing without edits).
> - **Package boundaries hold.** Schemas, port types, compatibility checks and template JSON live
>   in `shared`. The engine, the scheduler, the state store and the forge/MCP hooks live in
>   `desktop`. The canvas lives in `app`, over `window.midniteStudio` only. Icons come from
>   `react-icons/lu` only.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Dependency order:** **A** first → **B**, **C**, **J** (J can start as soon as A's schema lands)
→ **D**, **E**, **F**, **H** after **B** → **G** after **C** → **K** needs [Phase 94](phase-94-ai-engineering.md)
Theme A → **M** is independent after A → **L** last (it needs every node kind it ships).

## Deliverables

### A — Typed ports and edge kinds (M) — ✅ DONE (PR #557, 2026-09-24)

- [x] `WorkflowPortSchema` in [`workflow.ts`](../../../packages/shared/src/workflow.ts):
      `{id, label, direction: 'in'|'out', type: WorkflowPortType}` with
      `WORKFLOW_PORT_TYPES = ['any','json','text','number','boolean','verdict','artifact-ref']`.
      Each node kind declares its ports in a pure `portsForNode(node)`. Most are static:
      `condition` → `true`/`false`, a verifier → `pass`/`fail`. Some are config-driven: router
      cases, join inputs.
- [x] Every node kind with an executor also gets an implicit **`error`** out-port (type `json`,
      `{message, status}`). `note` and the harness frame get no ports.
- [x] `WorkflowEdgeSchema` gains `fromPort`, `toPort` and
      `kind: 'data'|'conditional'|'loop'|'error'`, all `.optional()` in the wire schema.
      `normalizeEdge(edge)` fills the defaults (`out` → `in`, `data`). This is the same
      optional-plus-reader pattern `isWorkflowEnabled` uses (`:278`), so no fixture across `shared`
      or `desktop` has to change.
- [x] Per-port **output schema**: an optional `outputShape` on an out-port — a small JSON-shape
      descriptor (`{type, properties?, items?}`), not full JSON Schema. An agent / script / http
      node can pin it in its config.
- [x] `canConnect(fromNode, fromPort, toNode, toPort, edges)` in `shared` →
      `{ok:true}|{ok:false, reason}`. It checks direction, type compatibility (`any` accepts all;
      `verdict` → `boolean` allowed; `json` shape compatible when both sides declare one), a single
      edge per in-port unless the port is a join input, and `wouldCycle` for non-`loop` edges.
- [x] `validateWorkflow` (`:407`) reports edges whose ports no longer exist (a router case was
      deleted) as `WorkflowIssue`s instead of dropping them silently.
- [x] Migration: `migrateWorkflowEdges(workflow)` runs on load in
      [`workflows-store.ts`](../../../packages/desktop/src/main/workflows-store.ts). A legacy
      `condition` node's outgoing edges map to its `true` port, which preserves today's
      "false gates everything downstream" behaviour exactly.
- [x] Vitest (`workflow.test.ts`): the `canConnect` truth table, the migration identity on every
      existing fixture, a legacy condition keeping its semantics, and unknown-port issues.

### B — Routing, joins and the error port (L) ✅ DONE ([PR #558](https://github.com/bilo-io/midnite-studio/pull/558), 2026-09-25)

- [x] The engine resolves readiness **per in-edge**, not per parent. An edge is *taken* when its
      source settled on that edge's port, and *dead* when the source settled on a different port.
      A node whose in-edges are all dead is `skipped`, with the reason naming the port that was not
      taken.
- [x] `condition` settles on `true` or `false`. It no longer uses `skipDownstream`, which is
      removed from `NodeOutcome` once the migration in A covers legacy graphs.
- [x] A failed or timed-out node settles on its **`error`** port when that port has an edge. The
      run then continues along it, and the node's status stays `failed` so the run history stays
      honest. Without an error edge, today's skip-downstream cascade (`:330`) is unchanged.
- [x] New node kind **`join`**, config `{mode: 'all'|'any'|'allSettled', inputs: number}`
      (dynamic in-ports `in-1…in-N`):
  - `all` waits for every live input and fails if any input failed.
  - `any` fires on the first success and cancels nothing, since the siblings keep running.
  - `allSettled` waits for every input to settle and outputs
    `{fulfilled:[…], rejected:[…]}`, following the Graph Engineering article's `Promise.allSettled`
    shape.
- [x] Plain nodes keep the implicit "all parents" join, so a join node is only needed when the
      mode is not `all` or the output shape matters.
- [x] Interpolation: `{{join.fulfilled.0.body}}` resolves. The engine's upstream ancestor walk
      follows only taken edges, so a node cannot reference a branch that was never taken.
- [x] `WorkflowNodeRunSchema` records `settledPort` so replay and the canvas can highlight the
      edge that was taken.
- [x] Vitest in `workflow-engine.test.ts`: the diamond (fan-out → join all), a true/false branch
      with only one side running, error-port recovery, `any` vs `allSettled` outputs, and the
      Phase 95 race case (`:513`) still deterministic.

### C — Controlled cycles (L) ✅ DONE ([PR #560](https://github.com/bilo-io/midnite-studio/pull/560), 2026-09-25)

- [x] A `loop` edge carries `loop: {maxIterations: 1..20, budgetMs, convergence?}`. Convergence is
      one of `{kind:'dry-rounds', rounds, keyPath}`, as in the article's "2 dry rounds or 6
      iterations", or `{kind:'until-port', port}`.
- [x] Schema validation rejects a `loop` edge with no bounds, a `loop` edge that does not close a
      cycle, and a cycle made only of non-`loop` edges. `findCycleEdge` ignores `loop` edges, so
      the rest of the graph must stay a DAG.
- [x] Engine: when a `loop` edge is taken, the **loop body** is reset to `pending` under a new
      `iteration` index. The body is every node on a path from the loop target back to the loop
      source. The run records every iteration's `WorkflowNodeRun`s (keyed
      `nodeId#iteration`) rather than overwriting them.
- [x] **Failure carried forward.** Each iteration exposes `{{loop.iteration}}`, `{{loop.previous.<nodeId>…}}`
      and `{{loop.failures}}` (the fail-port outputs of every earlier pass, capped and passed
      through [`redact.ts`](../../../packages/shared/src/redact.ts)). An agent node's composed
      prompt gets a "previous attempt failed because…" block appended when `loop.failures` is
      non-empty. This is the Harness article's `state.failures.push(evidence.gap)`.
- [x] **Dedupe against everything seen.** `dry-rounds` convergence hashes the `keyPath` values of
      every iteration, rejected ones included, per the Graph Engineering article's warning that
      rejected ideas otherwise come back.
- [x] Stops, each recorded as a distinct `loopExit` reason on the run:
      - `converged`
      - `max-iterations`
      - `budget`
      - `cancelled`

      A non-converged exit takes the loop source's `exhausted` out-port (added by C). That port
      is typically wired to a human gate (D), which is the articles' "escalation path".
- [x] Budget is wall-clock only. There is no token accounting; see [Phase 94](phase-94-ai-engineering.md)
      Decision 8 for why the app cannot honestly see an agent's token use.
- [x] `MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW` is unchanged. A run's per-iteration node records
      are capped at `maxIterations × body size`, which the schema bounds.
- [x] Vitest: a 3-attempt build/verify loop that passes on attempt 2, exhaustion → `exhausted`
      port, dry-round convergence with a repeated rejected key, budget stop with an injected clock,
      and cancel mid-iteration.

### D — Human gate (M)

- [ ] New node kind **`gate`**, config
      `{title, instructions, timeoutMs?, onTimeout: 'reject', linkedRef?: {kind:'pr'|'issue', repoId, number}}`,
      ports `approved` / `rejected`.
- [ ] A reached gate puts the node in a new **`waiting`** `WorkflowNodeStatus`. The run stays
      `running`. `WorkflowNodeStatusSchema` (`:293`) gains the value, and every exhaustive switch
      over it is updated.
- [ ] **Run panel:** the gate's row in `run-output-panel.tsx` shows the instructions, the upstream
      artifact(s) and Approve / Reject with an optional note. The note becomes `{{gate.note}}`
      downstream.
- [ ] **Notification bell:** `notification-bell.tsx` gets a "workflow waiting on you" entry that
      reveals the run via `workflow-reveal-store.ts` (Phase 95 Theme J).
- [ ] **Node glow:** the gate paints `waiting` through `useActivityGlow`. There is no new colour
      logic.
- [ ] **Timeout:** when `timeoutMs` is set, main auto-rejects at the deadline with the note
      "timed out". The clock is main's, so a closed window does not stop it. A quit app loses it,
      which G's resume handles.
- [ ] **MCP approval:** new Studio MCP tools `workflow_gates_list` (read-only) and
      `workflow_gate_decide` (`{runId, nodeId, decision, note}`). The latter is the first
      non-read-only MCP tool. It goes through [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts)'s
      consent path, is audited in [`audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts),
      and is off unless Settings ▸ MCP allows it. It is not a repository write, so
      [Phase 57](phase-57-mcp-server.md) Decision 5 stands.
- [ ] **PR/issue comment approval:** when `linkedRef` is set, the gate posts one comment with a
      token (`/midnite approve <token>` / `/midnite reject <token>`). The forge poller watches that
      thread, and a matching comment **from the account that owns the forge credential** decides
      the gate. Anyone else's comment is ignored and logged.
- [ ] **Auto-mate:** `automate-derive.ts` treats a card whose workflow run is `waiting` as **not
      done**, so the board does not advance past it.
- [ ] **Kill switch:** the Flow scope cancels a waiting run like any running one. The gate
      settles `cancelled` and posts nothing further.
- [ ] Vitest: approve / reject / timeout routing, MCP decide with and without consent, a comment
      from the wrong author ignored, a cancelled gate, and Auto-mate's derive with a waiting run.

### E — Verifier node (M)

- [ ] New node kind **`verify`**, ports `in` → `pass` / `fail` (type `verdict`, with an evidence
      payload). The config is a discriminated union over `check`:
  - `agent`: an agent node config whose done marker `ok|fail` is the verdict. It must be a
    different agent id or skill from its maker when wired after an agent node; `validateWorkflow`
    warns rather than blocks.
  - `exit-code`: a script config; the verdict is exit `0`.
  - `test-counts`: a script config plus a parser (`vitest|jest|junit-xml|tap`) yielding
    `{passed, failed, skipped}`, with pass meaning `failed === 0 && passed >= minPassed`.
  - `json-path`: `{source: '{{node.path}}', op, right}`, reusing `WORKFLOW_CONDITION_OPS`.
- [ ] Evidence (`{check, passed, failed, message, failures[]}`) is capped and redacted, and is what
      C's `loop.failures` carries into the next iteration.
- [ ] The test-count parsers live in `shared` as pure functions and are fixture-tested. If
      [Phase 94](phase-94-ai-engineering.md) Theme B lands first, reuse its parsers instead of
      writing a second set.
- [ ] Vitest: each check kind's pass and fail, parser fixtures, and a maker == checker warning.

### F — Router node (S/M)

- [ ] New node kind **`router`**, config
      `{mode: 'expression'|'agent-label', cases: [{id, label, when?}], default: true}` with one
      out-port per case plus `default`.
  - `expression`: the first `when` (a condition-shaped `{left, op, right}`) that holds wins.
  - `agent-label`: an embedded agent config whose done marker is extended to
    `MIDNITE_WORKFLOW_NODE_DONE: route=<caseId>`. An unknown label routes to `default`, never to a
    guess. This is the article's "the classifier is probabilistic, the allowed routes are
    deterministic".
- [ ] The run records the chosen case and the value / label that chose it, which answers "why did
      the system choose this route".
- [ ] Vitest: first-match order, the default fallback, and an unknown agent label.

### G — Durable run state and failure policy (L)

- [ ] A per-run **state store**: `WorkflowRun.state: Record<string, JsonValue>`, written by a new
      `state` node kind (`{op:'set'|'merge'|'append', key, value}`) and read anywhere as
      `{{state.<key>}}`. Writes go through the engine, one at a time per run. Size is capped and a
      breach fails the writing node with a clear message.
- [ ] **Checkpoints.** After every node settles, the engine persists the run (statuses, iteration
      indices, `state`, loop counters) through
      [`workflow-runs-store.ts`](../../../packages/desktop/src/main/workflow-runs-store.ts).
- [ ] **Resume.** On boot, a run left `running` is marked `interrupted` (a new
      `WorkflowRunStatus`) instead of silently `failed`. The run panel offers **Resume**, which
      restarts from the last checkpoint: settled nodes stay settled, and `running` nodes re-run.
- [ ] Per-node **failure policy** `onFailure`:
  - `{kind:'retry', attempts, backoffMs}`
  - `fallback` (to the error port)
  - `skip` (settle as skipped, downstream proceeds)
  - `repair` (route to a named node with the error as input)
  - `escalate` (to a gate)
  - `stop` (fail the run)

  The default is today's behaviour.
- [ ] Idempotency note in the http form: retry is offered on `GET|HEAD|PUT|DELETE` by default and
      on `POST|PATCH` only behind an explicit "this call is idempotent" toggle, per the Graph
      Engineering article's "make writes idempotent so a retry does not duplicate side effects".
- [ ] Vitest: resume after a simulated crash (store reloaded mid-run), each failure policy, the
      state-size cap, and retry backoff with an injected clock.

### H — Trigger node (M)

- [ ] New node kind **`trigger`** (hue `--node-trigger`, finally used), at most one per workflow,
      with no in-ports. Config is a union over `on`:
  - `manual` (the default, which is today's Run button)
  - `schedule` (`{cron}`, 5-field, validated in `shared`)
  - `forge-pr` (`{repoId, events: ['opened','updated'], branchFilter?}`)
- [ ] A main-side **trigger scheduler** (`desktop/src/main/workflow/trigger-scheduler.ts`) arms
      schedules for enabled workflows (`isWorkflowEnabled`) while the app runs. Missed ticks while
      the app was closed are **not** replayed; the next tick is computed from now. It is idle-cheap
      (one timer to the next due tick, not a poll) and respects the window visibility gate for
      nothing, since it runs in main.
- [ ] `forge-pr` subscribes through `forge-poller.ts`'s existing projection/hash machinery rather
      than adding a second poller. The PR's `{number, title, headRef, url, author}` becomes the
      trigger node's output.
- [ ] A triggered run does not start while the same workflow already has a live run. The skip is
      logged against the workflow, which answers "why didn't it fire".
- [ ] The trigger form previews the next 3 fire times (a pure function in `shared`).
- [ ] Vitest: cron parse and next-fire (DST and month rollover), the at-most-one-trigger rule,
      skip-while-running, and a forge projection change firing once.

### I — Harness frame and policy gate (M)

- [ ] New canvas-only kind **`frame`** (no executor, like `note`): a React Flow group node whose
      children are the nodes dragged inside it. It has six labelled **slots**
      (Contract / Context / State on the left, Tools / Permissions / Evidence on the right), each
      a markdown field, mirroring the Harness diagram.
- [ ] When the frame contains agent nodes, the **Contract** and **Context** slots are prepended to
      each contained agent node's composed prompt, which is the article's "turn the request into a
      contract". A frame never changes scheduling.
- [ ] New node kind **`policy`** (a permission gate), config
      `{allow: string[], requireApprovalFor: string[]}` over a closed action vocabulary
      (`network`, `write-files`, `open-pr`, `push`, `deploy`, `delete-data`).
  - Downstream agent / script / http nodes declare an `actions` set.
  - A node whose action is in `requireApprovalFor` routes through an implicit D gate.
  - A node whose action is not allowed fails validation before the run starts.
  - This is "model suggests → policy checks → tool executes" enforced outside the model.
- [ ] The http executor honours `network`: an http node under a policy without `network` fails
      before sending.
- [ ] Vitest: frame membership survives save/load and auto-layout, contract prepending, policy
      validation, and policy-driven approval routing.

### J — Canvas styling (M) — ✅ DONE (PR TBD, 2026-09-25)

- [x] Edge style per kind in the canvas's custom edge component:
  - `data`: solid.
  - `conditional`: solid with the port label at the source.
  - `error`: dashed in the `failed` status colour.
  - `loop`: dashed, drawn as a curved back-edge routed *under* the body (not through it), with an
    **iteration badge** `2/3` while running and the bounds on hover.
  (`workflow-edge-view.tsx`. The iteration-badge slot renders `data.iterationLabel` but nothing
  populates it yet — Theme C's `WorkflowRun.loopStates`/per-node `iteration` aren't merged; wiring
  the real value in is a one-line addition to `workflow-canvas.tsx`'s edge-decorate step once they
  land. The "bounds on hover" affordance is deferred with them — there is no iteration budget to
  show yet.)
- [x] Port handles coloured by `WORKFLOW_PORT_TYPES`, as new theme tokens `--port-json|text|number|boolean|verdict|artifact`
      defined for light and dark themes. A connect drag dims incompatible handles live
      (`canConnect`) and shows the rejection reason in a tooltip on drop.
- [x] Node shapes from the diagrams:
  - condition and router: a diamond-accented header.
  - gate: a shield icon plus the waiting glow.
  - verify: a check badge showing its last verdict.
  - join: a narrow pill.
  - trigger: a left-rounded "start" card.
  - frame: a light bordered container titled *THE AGENT HARNESS* by default.
  (`node-shape.ts`'s `NODE_SHAPE` is exhaustive over today's `WorkflowNodeKind` — only `condition`
  → `diamond-header` and `join` → `pill` exist to style; gate/verify/router/trigger/frame are D/E/F/H/I's
  kinds, not yet on main. The map's own doc comment names each one's future variant so adding the
  kind is a compile error here until it's given one, per the swarm brief's explicit scope note.)
- [x] The taken path highlights after a run: dead edges go to 35% opacity, and taken edges keep
      the animated stroke.
- [x] Dagre layout ignores `loop` edges for ranking (then draws them), and lays out frame children
      inside the frame. (The frame-children half is Theme I's own kind, not yet on main — nothing
      to lay out inside a container that doesn't exist yet.)
- [x] Icons: `react-icons/lu` only (e.g. `LuShieldCheck`, `LuGitFork`, `LuMerge`, `LuRepeat`,
      `LuSplit`, `LuTimer`, `LuFrame`, `LuBadgeCheck`). Every new name is added to the
      `icon-names.test.ts` resolution check. (No new glyph was needed — condition/join already had
      theirs; `icon-names.test.ts` derives its list from source via `import.meta.glob`, so nothing
      to add by hand. The listed names are D/E/F/H/I's own icons to import when they add their kinds.)
- [x] Vitest for edge-kind → style mapping and handle colour. One Playwright **visual** baseline
      (locator-cropped canvas with every edge kind), within the ~100-baseline / 3 MB budget. The
      spec header names "real CSS / SVG path rendering" as its browser need. (Verified locally
      against a `-darwin.png` baseline, gitignored by convention; no docker in this sandbox to
      produce the committed `-linux.png` — needs `MSTUDIO_CROSS_PLATFORM=1 moon run
      root:visual-regen` from a machine with docker before the opt-in cross-platform CI lane can
      diff it.)

### K — Receipts and replay by iteration (M)

- [ ] Consumes [Phase 94](phase-94-ai-engineering.md) Theme A's `AgentRunRecord` (kind
      `workflow`). A completed workflow run writes a **change receipt** onto it:
      - context sources (frame slots, trigger payload)
      - policy version (hash of the policy nodes)
      - node kinds and agents used
      - verifier verdicts with counts
      - retries and loop iterations per loop edge
      - human decisions (who, via run panel / MCP / comment)
      - wall-clock
      - accepted artifact (last node output ref)
      - rollback point (the repo HEAD at trigger time, when the run has a repo)

      There is **no cost field**, per Phase 94 Decision 8.
- [ ] If Phase 94 Theme A has not landed when this theme is picked up, stop and pick another
      theme. Do not invent a parallel record.
- [ ] Replay: `run-replay.ts` orders steps by `(iteration, settledAt)`. The replay controls gain an
      iteration scrubber ("pass 2 of 3"), and the canvas paints each pass's statuses and the
      taken edge.
- [ ] The run output panel's Nodes tab groups a looped node's runs by iteration. Markdown export
      includes the receipt.
- [ ] Vitest: receipt assembly from a fixture run, replay ordering across iterations, and export.

### L — Built-in templates and a gallery (M)

- [ ] Templates as validated JSON in `shared` (`shared/src/workflow-templates/*.ts`, each a
      `WorkflowSchema` minus ids and timestamps, plus `{id, title, blurb, source, tags}`).
      Instantiation uses the existing `cloneWorkflowWithFreshIds`. Templates are data, never code.
- [ ] **Template gallery**: a "New from template" entry in [`workflow-list.tsx`](../../../packages/app/src/features/workflows/workflow-list.tsx)
      opening a sheet of cards, each with a mini canvas preview (static, laid out by dagre), a
      blurb and a link to the source article section. "Save as template" in the toolbar adds to a
      **user** section of the same gallery instead of cloning into the list.
- [ ] Five built-ins, each runnable end-to-end against the demo API (M) and a stub agent:
      1. **Graph Engineering diamond**: request → scope (agent) → fan-out {research, build,
         verify} → join(all) → synthesize (agent) → verify → pass → ship / fail → loop back to
         build (max 3).
      2. **Harness bounded build**: frame {contract, context} → build (agent) → verify
         (`test-counts`) → loop ×3 with failures carried → `exhausted` → human gate.
      3. **Loop Engineering maker/checker**: trigger (manual | schedule) → discover → plan → maker
         (agent) → checker (verify, `agent`, a different agent) → pass → ship / fail → loop to
         plan.
      4. **Research & publish**: topic → scope → decompose → fan-out {company sources, papers,
         expert posts} → join(allSettled) → dedupe (transform) → draft → final check → fail →
         repair → loop / pass → human gate → publish.
      5. **Risk router**: trigger (forge-pr) → classify (router, `agent-label`: low | high |
         default) → quick review / full parallel audit (fan-out + join) / human gate.
- [ ] Each template carries note nodes quoting the article's rule it demonstrates. A template
      that needs a repo or forge account shows a setup checklist on instantiation rather than
      failing at run time.
- [ ] Vitest: every template parses, passes `validateWorkflow`, uses only `{{demo.baseUrl}}` for
      http URLs, and runs to completion in the engine test harness with fake executors.

### M — Demo endpoint group for HTTP nodes (M) — ✅ DONE ([PR #559](https://github.com/bilo-io/midnite-studio/pull/559), 2026-09-25)

*Added in the brainstorm on the user's request: templates and demos need a stable, scriptable
HTTP target.*

- [x] A reserved interpolation root **`{{demo.baseUrl}}`**, resolved by main at execution time from
      `demoApiStatus()`. If the demo API is not running, the node fails with "Demo API is not
      running — start it from the Demo API pill", never a bare `ECONNREFUSED`.
      **`WORKFLOW_RESERVED_INTERPOLATION_ROOTS = ['demo', 'loop', 'state']`** lives in
      [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts), not `interpolate.ts` —
      `validateWorkflow` (which rejects a node id colliding with one) lives in `shared`, and `shared`
      can never import from `desktop`, so the one shared list has to live where both sides can reach
      it. `interpolate.ts`/`workflow-engine.ts` import the same constant; the actual namespace
      (`upstream.demo = {baseUrl}`) is injected at the engine's `runNode` call site.
- [x] A scripted **`/demo/*` route group** beside the generic store in
      [`routes.ts`](../../../packages/desktop/src/main/demo-api/routes.ts), each deterministic and
      query-driven:
      - `/demo/echo`
      - `/demo/delay?ms=` (capped at `WORKFLOW_DELAY_MAX_MS`)
      - `/demo/fail-n?key=&n=` (fails the first *n* calls per key, then passes, which makes a loop
        template genuinely loop)
      - `/demo/flaky?rate=&seed=`
      - `/demo/classify?risk=`
      - `/demo/research/:lane`
      - `/demo/verify?key=&passAfter=`

      Counters reset with the store on stop.
- [x] The http node form offers `{{demo.baseUrl}}` in its URL hints and a "Use demo API" quick-fill
      listing the routes above. A dismissible banner above the canvas offers to start the demo API
      whenever the open workflow has a node referencing `{{demo.baseUrl}}` and it isn't running
      (scoped to the open workflow rather than "opening a template" — Theme L's gallery doesn't
      exist yet, and any workflow with that reference is the superset that matters).
- [x] Vitest: route behaviour (`demo-api.test.ts`), `fail-n` counter reset, `{{demo.baseUrl}}`
      resolution with the server up and down, and the http executor suite still passing with no
      network, per its existing acceptance criterion.

## Files this phase touches

- [`packages/shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts) — ports, edge kinds, new node kinds, `canConnect`, migration, statuses (A–I).
- `packages/shared/src/workflow-templates/` — new; template JSON + registry (L).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — gate decide, resume, template list (D, G, L).
- [`packages/desktop/src/main/workflow/workflow-engine.ts`](../../../packages/desktop/src/main/workflow/workflow-engine.ts) — per-edge readiness, loops, gates, state, policy (B–G, I).
- [`packages/desktop/src/main/workflow/executors/`](../../../packages/desktop/src/main/workflow/executors/) — join, gate, verify, router, state, trigger, policy executors (B–I).
- [`packages/desktop/src/main/workflow/interpolate.ts`](../../../packages/desktop/src/main/workflow/interpolate.ts) — `loop`, `state`, `demo` roots (C, G, M).
- `packages/desktop/src/main/workflow/trigger-scheduler.ts` — new (H).
- [`packages/desktop/src/main/workflows-store.ts`](../../../packages/desktop/src/main/workflows-store.ts) · [`workflow-runs-store.ts`](../../../packages/desktop/src/main/workflow-runs-store.ts) — edge migration, checkpoints (A, G).
- [`packages/desktop/src/main/forge/forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts) — PR trigger + gate comment watch (D, H).
- [`packages/desktop/src/main/mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts) · [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts) · [`audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts) — gate tools (D).
- [`packages/desktop/src/main/demo-api/routes.ts`](../../../packages/desktop/src/main/demo-api/routes.ts) · [`store.ts`](../../../packages/desktop/src/main/demo-api/store.ts) — `/demo/*` group (M).
- [`packages/app/src/features/workflows/canvas/`](../../../packages/app/src/features/workflows/canvas/) — `workflow-node-view.tsx`, `node-kind-meta.ts`, `node-forms.tsx`, `node-palette.tsx`, `workflow-layout.ts`, `run-replay.ts`, new edge component (A–J, K).
- [`packages/app/src/features/workflows/run-output-panel.tsx`](../../../packages/app/src/features/workflows/run-output-panel.tsx) · [`workflow-list.tsx`](../../../packages/app/src/features/workflows/workflow-list.tsx) · [`workflow-toolbar.tsx`](../../../packages/app/src/features/workflows/workflow-toolbar.tsx) — gate actions, resume, gallery (D, G, L).
- [`packages/app/src/features/status-bar/notification-bell.tsx`](../../../packages/app/src/features/status-bar/notification-bell.tsx) · [`projects/board/automate-derive.ts`](../../../packages/app/src/features/projects/board/automate-derive.ts) · [`automate/kill-switch-modal.tsx`](../../../packages/app/src/features/automate/kill-switch-modal.tsx) — waiting runs (D).

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] Every pre-Phase-97 workflow fixture loads, migrates and runs with byte-identical node
      statuses (`workflow-engine.test.ts` passes without edits).
- [ ] `bundle-report.mjs` before/after: the entry chunk is unchanged, and all growth sits in the
      lazy `workflows-view` chunk.
- [ ] Each of the five built-in templates runs end-to-end in the packaged-equivalent app against
      the demo API. The Harness template demonstrably loops twice (via `/demo/verify?passAfter=2`)
      and the Graph Engineering template takes its NO back-edge once.
- [ ] A gate is decided once each via the run panel, the MCP tool and a PR comment, and the
      receipt names the channel.
- [ ] Quitting mid-run and relaunching shows the run `interrupted`, and Resume completes it
      without re-running settled nodes.
- [ ] A cron trigger fires while the app is open and does not fire a backlog after relaunch.
- [ ] `idle-cpu.mjs --blurred` with a scheduled workflow armed shows no regression over `main`.
- [ ] Visual baseline for the edge kinds committed. `scripts/e2e-budget.mjs` stays within budget.
- [ ] One human pass: build the Graph Engineering diagram from a blank canvas using only the
      palette, and confirm it reads like the article's image.

## Not in this phase

- **An LLM judge or scoring model.** Verifiers are agent verdicts or computed checks (resolved).
- **Webhook or file-watch triggers, and triggers while the app is closed** (resolved).
- **A second workflow engine** or any change to Councils (resolved).
- **Token or cost accounting** on loops, budgets or receipts. See Phase 94 Decision 8.
- **Sub-workflows (a workflow as a node).** A frame groups nodes visually and contractually; it
  does not nest an engine run.
- **Sharing templates between machines or users.** The user gallery stays local.

## Decisions / open questions

1. **Resolved (user) — all five brainstorm directions, combined.** Primitives + templates +
   harness-as-canvas + deep controlled cycles + durable state / checkpoints / receipts.
2. **Resolved (user) — a new Phase 97, not a refinement of 94.** Phase 94 explicitly declines a
   node/edge orchestrator (its Decision 6), naming Workflows as that home. This phase is that
   home. It consumes Phase 94 Theme A's run record for receipts (K) rather than defining its own.
3. **Resolved (user) — loops are true back-edges.** Edge `kind: 'loop'` with mandatory
   `maxIterations` + budget and an optional convergence rule, not a loop container node.
4. **Resolved (user) — named handles *and* data types.** Per-port output shape, with
   compatibility checked on connect (`canConnect`).
   *Recommendation on depth:* a small shape descriptor, not full JSON Schema. Revisit only if
   templates need more.
5. **Resolved (user) — human gate via every surface.** Run panel, notification bell, node glow,
   optional timeout auto-reject, Studio MCP, and a comment on a linked PR/issue. Auto-mate
   treats `waiting` as not done, and the kill switch cancels it.
   *Open:* the MCP decide tool is the first non-read-only MCP tool. Recommend it stay off by
   default behind a Settings ▸ MCP switch.
6. **Resolved (user) — verifier = agent-as-checker + computed checks, no LLM judge.** The existing
   `MIDNITE_WORKFLOW_NODE_DONE: ok|fail` marker plus exit code / test counts / JSON-path.
7. **Resolved (user) — templates.** Graph Engineering diamond, Harness bounded build, Loop
   Engineering maker/checker, Research & publish, Risk router, plus a template gallery.
8. **Resolved (user) — triggers.** Manual + cron schedule while the app is open + forge PR
   opened/updated via the existing poller.
9. **Resolved (user) — a demo endpoint group for the HTTP nodes** (Theme M), with templates using
   `{{demo.baseUrl}}` rather than a hard-coded port.
   *Recommendation:* generic scripted behaviours (echo, delay, fail-n, flaky) plus a few
   article-named aliases (`classify`, `research/:lane`, `verify`).
10. **Open — PR-comment approval authority.** Recommend: only the account that owns the forge
    credential the gate posted with can decide. A repo-collaborators allowlist is a later
    extension.
11. **Open — does a failed node with an error edge fail the run?** Recommend: no. The run's
    status is decided by whether it reached a terminal node on a non-error path, and the node
    itself stays `failed` in history.
12. **Open — `any` join and still-running siblings.** Recommend: siblings keep running and their
    outputs are recorded but unused. Cancelling them is a per-join option only if a template
    needs it.
