# Phase 97 Theme C — Controlled cycles

## Task
Bounded loop back-edges (`kind: 'loop'`), mandatory `maxIterations` + budget, dry-round
convergence, failures carried forward, escalation via an `exhausted` port. Stacked on
Theme A (PR #557, merged into this branch's base already — worktree started at Theme A's tip).
Full spec: `.midnite/tasks/phases/phase-97-workflow-graph-primitives.md` §C (lines 143-177).
Board: `/private/tmp/claude-501/.../scratchpad/p97-board.md` — my contracts posted under `## p97-c`
BEFORE writing code (per instructions). Read that section for the authoritative shape; this file
is just my own working notes.

## Key design decisions (see board for the real contract text)
- `findCycleEdge` UNCHANGED. New `findAcyclicEdgeViolation` filters `loop` edges before delegating —
  used by the engine's pre-run check instead of `findCycleEdge` directly.
- `canConnect` UNCHANGED (doc already says loop edges use "their own affordance"). New
  `canConnectLoop` requires a cycle instead of rejecting one; shares a private helper with
  `canConnect` for the direction/type/shape/multiplicity/self-connect checks.
- `portsForNode(node, edges?)` — new OPTIONAL 2nd param, backward compatible. Adds `exhausted`
  out-port when the node has an outgoing loop edge and `edges` was passed.
- `buildGraph`'s two call sites in workflow-engine.ts filter OUT loop edges — a loop edge never
  participates in ordinary Kahn scheduling. Iteration is driven by `loop-controller.ts` pushing
  fresh `pending` WorkflowNodeRun records (new `iteration` field) for the loop body.
- `WorkflowNodeRun.takenPort?: string` — ONLY ever set for loop-source nodes. Every other node's
  cascade behavior is byte-identical to before (this is what makes the "acyclic workflow runs
  identically to before" regression trivially true — non-loop nodes never touch this field).
- `WorkflowRun.loopStates?: WorkflowLoopState[]` — persisted iteration/budget/dedupe state per loop
  edge id, for Theme G (resume) and K (replay) to build on.
- `{{loop.iteration}}` / `{{loop.previous.X}}` / `{{loop.failures}}` injected into `runNode`'s
  upstream record under a synthetic `'loop'` key, only for nodes inside an active loop body.
- Converged exit does NOT go through `exhausted`; the other 3 reasons (`max-iterations`, `budget`,
  `cancelled`) do. Converged picks an alternate non-loop, non-error out-port if exactly one exists
  (e.g. condition's `true`), else falls back to `exhausted` too (documented, defensible fallback for
  a degenerate single-port source).

## Status
- [x] Board contract posted
- [ ] shared/workflow.ts: loop schema, ports, cycle helpers, canConnectLoop, validateWorkflow checks
- [ ] loop-controller.ts: pure decision logic + activeNodeRuns helpers + loop body reset
- [ ] workflow-engine.ts: wire loop-controller in, filter buildGraph, takenPort cascade, {{loop.*}} injection
- [ ] executors/agent.ts: failure-context block
- [ ] tests: shared workflow.test.ts, loop-controller.test.ts, workflow-engine.test.ts (5 scenarios + 2 regressions)
- [ ] gate green, PR opened as draft against feature/p97-a

## Surprises / gotchas
- Theme B (p97-b) hasn't started any commits yet as of this session — no collision risk found so far.
- Current engine's condition-node cascade is a BLANKET gate (any child of a gated parent is skipped,
  no per-port distinction) — Theme B's job to fix generally. I only special-case loop-source nodes.
