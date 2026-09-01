# Phase 34 — Agent Councils

"Councils" has sat in this app's nav rail, command palette and icon map since Phase 15/19 without
a single line of feature code behind it:
[`app.tsx:194`](../../../packages/app/src/app.tsx) lists `{ view: 'councils', label: 'Councils',
icon: VIEW_ICON.councils }` beside Workflows and Sessions,
[`palette/providers.ts:34,49`](../../../packages/app/src/services/palette/providers.ts) already
answers to the search hint `"agents council teams debate"`, and
[`view-sections.ts:189`](../../../packages/app/src/features/repos/view-sections.ts) renders the
view as a bare `WORK_IN_PROGRESS` filter. This phase fills the slot: a council is a standing panel
of AI members, configured once, that answers a prompt in parallel and hands the results to a
synthesizer for one distilled write-up — the concept and UI shape are ported from the sibling
`~/Dev/midnite` repo's mature councils feature, adapted to this app's own architecture rather than
copied wholesale.

**Builds on.** Phase 21's agent roster (`BUILTIN_AGENTS`, `AgentDefinitionSchema`, the
`agentInvocationArgs` per-agent flag table in
[`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts)) supplies the pool
a council member picks from. Phase 30's detached session broker
([`broker/server.ts`](../../../packages/desktop/src/broker/server.ts)) is what actually spawns and
tracks a member's one-shot process. Phase 9's xterm panel is reused, unmodified, as the live view
for a running member. Persistence follows the established `*-store.ts` convention
([`repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts),
[`agents-store.ts`](../../../packages/desktop/src/main/agents-store.ts)) — a global JSON file under
Electron's `userData`, not a database.

**Scope guardrails.** This is a **narrow vertical slice**, not the full upstream feature: **one**
synthesis format (brainstorm — attributed, no anonymization), **global** scope (one set of
councils across every open repo, like the agent roster itself, not keyed by `repoId`), and
exactly **three** eligible member providers — `agy`, `codex`, `opencode` — the only roster agents
that already have a defined non-interactive invocation flag in `agentInvocationArgs`. Debate/
critique/analyse/motivate/demotivate/custom formats, anonymization + de-anonymization, drag-reorder
of members, markdown/HTML export, re-synthesis in a different format, and per-repo scoping are all
explicitly deferred (see *Not in this phase*) — each is a clean, self-contained follow-on once this
slice proves the core loop.

**The one safety exception this phase makes, on purpose.** Every existing agent launch in this app
deliberately withholds Return — `start-agent.ts`'s own comment frames typing-but-not-sending as the
posture that keeps a human in the loop before an agent can touch a repo. A council member never
touches a repo; it only answers the one prompt it was given and exits. This phase treats that as
grounds for a narrow, explicit exception: a council run **auto-sends** each member's command (and
the synthesizer's). This is the first auto-executing command path in the app, and it should read as
one on screen — Theme F adds a one-line note on the composer explaining why, so it doesn't feel
like a silent departure from how every other agent launch behaves.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts (S) — ✅ DONE (2026-09-01)

The spine every other theme reads off; lands first.

- [x] `Council`, `CouncilMember`, `CouncilRun`, `CouncilRunMember` zod schemas in a new
      [`shared/src/council.ts`](../../../packages/shared/src/council.ts), modelled on upstream's
      `packages/shared/src/council.ts` but trimmed to this phase's scope: no `syntheses[]` archive
      (only one format exists), no `anonymize` flag, no `customPrompt`.
- [x] A single `CouncilFormat` literal (`'brainstorm'`) rather than the upstream union — written as
      a literal, not an enum of one, so adding format #2 later is an honest schema change and not a
      silent widening.
- [x] `COUNCIL_STARTER_MEMBERS` — the same four starter personas upstream seeds a new council with
      (Optimist, Skeptic, Pragmatist, Visionary), each defaulted to one of the three eligible
      providers.
- [x] `CouncilRunStatus` (`'running' | 'synthesizing' | 'completed' | 'failed'`) and per-member
      `CouncilMemberStatus` (`'running' | 'succeeded' | 'failed' | 'timeout' | 'skipped'`) — the
      settle-barrier states Theme C's orchestration drives.
- [x] New `mstudio:council:*` IPC channel constants in
      [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) and their request/response
      schemas in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts): council CRUD,
      member CRUD, run start/get, retry-member, skip-member.
- [x] Every write channel returns the `GitOpResult`-style discriminated envelope
      (`{ok:true, …} | {ok:false, kind:'error', message}`) rather than throwing across the IPC
      boundary — matching the convention `CLAUDE.md` already states for git ops, applied here to a
      second write surface.

### B — Persistence (S) — ✅ DONE (2026-09-01)

- [x] `packages/desktop/src/main/councils-store.ts`: `createCouncilsStore(directory)` with
      `load`/`list`/`get`/`save`/`remove`, persisting to one `councils.json` under `userData`,
      mirroring `agents-store.ts`'s shape (an array, merge-tolerant of one malformed entry rather
      than failing the whole file — the same guarantee `agents-store.test.ts` asserts for the
      roster).
- [x] A separate `councils-runs-store.ts` (or a second key in the same store — decide during
      implementation) persisting finished/in-progress runs, keyed by `runId`, so a run survives an
      app restart even mid-flight (it resumes as `failed` on next load, matching Phase 30's honest
      "ended" posture rather than pretending a dead process is still running).
- [x] Unit tests: round-trip a council + members through the store, one malformed entry does not
      cost the rest of the file, a run's member snapshots (`name`/`provider`/`role` captured
      **at run start**) survive editing the council afterward — the same snapshot discipline
      upstream's schema uses, so a run's history never silently rewrites itself.

### C — Run orchestration (M) — ✅ DONE (2026-09-01)

The highest-risk theme — the auto-send exception and the settle-barrier both live here.

- [x] `packages/desktop/src/main/council-runner.ts`: `startRun(councilId, prompt)` spawns one
      detached session per member through the Phase 30 broker
      ([`broker/server.ts`](../../../packages/desktop/src/broker/server.ts)), reusing
      `agentInvocationArgs` from `start-agent.ts`'s table to build each member's non-interactive
      command line, then — unlike `start-agent.ts` — sends the trailing newline itself instead of
      queuing it for a human.
- [x] The **settle barrier**: once every member's session has exited (or been explicitly skipped),
      collect their captured output and spawn the synthesizer's one-shot session the same way,
      building its prompt from a pure `buildSynthesisPrompt(prompt, memberEntries)` helper — ported
      near-verbatim from upstream's `lib/council-prompts.ts`, minus the anonymization branch this
      phase doesn't ship.
- [x] A per-member and per-synthesis timeout (config value, following `CouncilsConfigSchema`'s
      `runTimeoutMs` precedent) that settles a hung member as `timeout` rather than blocking the
      barrier forever.
- [x] `skipMember(runId, memberId)`: kills that member's session and settles it `skipped` so the
      barrier still fires without it — the one interactive control this phase's engine needs, since
      there is no re-synthesis or retry-in-place beyond Theme H.
- [x] Output capture reuses the broker's existing scrollback/ring-buffer mechanism rather than a
      second buffering scheme — a council member's session is not architecturally different from
      any other detached session, just one that runs once and is expected to exit.

### D — IPC bridge (S) — ✅ DONE (2026-09-01)

- [x] Preload exposes `window.midniteStudio.council.{create, list, get, updateMembers, remove}` and
      `.run.{start, get, retryMember, skipMember}`, following the existing `bridge()` shape other
      features use — no new bridging pattern.
- [x] Main-process handlers wire Theme A's channels to Theme B's store and Theme C's runner,
      translating `council-runner.ts` failures into the `GitOpResult` envelope at the boundary.
- [x] `use-council.ts` / `use-council-run.ts` hooks in `packages/app`, modelled on the shape of
      `use-agents.ts`: a query for the list/detail, and for an in-progress run, a short-interval
      poll (matching upstream's 1200ms `useCouncilRun` cadence) until the run reaches a terminal
      status.

### E — UI — list & create (S) — ✅ DONE (2026-09-01)

- [x] `packages/app/src/features/councils/` becomes a real feature folder; the `councils` case in
      `view-sections.ts` stops resolving to `WORK_IN_PROGRESS` and renders this feature's list view.
- [x] A council list (name, description, member count, last-run time) with an empty state for zero
      councils.
- [x] A minimal create modal — name + optional description only, matching upstream's
      `council-create-modal.tsx` — members are added afterward on the detail page, not at creation
      time.

### F — UI — detail & members panel (M) — ✅ DONE (2026-09-01)

- [x] Council detail view: a members panel (add/remove/edit inline — name, provider `<select>`
      restricted to the 3-agent pool, role `<textarea>`) and a synthesizer picker (same 3-agent
      pool), no drag-reorder for this phase.
- [x] A bottom-pinned topic composer: a prompt input and a Run button (no format picker — brainstorm
      is the only format, so the control has nothing to select between yet).
- [x] The auto-send safety-exception note (see the framing section above) rendered as a small inline
      line near the composer, visible before the first run.

### G — UI — run view (M) — ✅ DONE (2026-09-01)

- [x] Per-member tabs: while `running`, embed the existing xterm terminal component
      ([`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx)) live
      against that member's session id, exactly as any other terminal panel does; once settled,
      render the captured output as plain rendered markdown.
- [x] A synthesis tab: a waiting state while members are still running (with each pending member
      named), a live terminal once the synthesizer starts, then the rendered synthesis on completion.
- [x] Run-thread rail: a list of past runs for the open council, prompt preview + status pill +
      relative time, selecting one loads it read-only — the smallest version of upstream's
      `council-run-thread.tsx`.

### H — Retry/skip controls (S) — ✅ DONE (2026-09-01)

- [x] A skip button on a still-running member's tab, calling Theme C's `skipMember`.
- [x] A retry button on a `failed`/`timeout` member's settled tab: re-reads the member's *current*
      config from the council (not the run's snapshot) and starts a fresh one-shot session for that
      member alone, re-checking the settle barrier when it completes — mirroring upstream's retry
      semantics ("editing role/provider then retrying picks up the change").

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | new [`shared/src/council.ts`](../../../packages/shared/src/council.ts), [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) |
| Main | new `councils-store.ts`, new `councils-runs-store.ts`, new `council-runner.ts`, new `lib/council-prompts.ts`, new `ipc/council-handlers.ts`; reads from [`agents-store.ts`](../../../packages/desktop/src/main/agents-store.ts) and the [broker](../../../packages/desktop/src/broker/server.ts) |
| Renderer — feature | new `packages/app/src/features/councils/` (list view, detail view, members panel, composer, run-tabs, synthesis panel, run-thread rail), new `use-council.ts`, `use-council-run.ts` |
| Renderer — wiring | [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) (`councils` case), [`app.tsx`](../../../packages/app/src/app.tsx) (route the view), reuses [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) unmodified |
| Tests | `council.test.ts` (shared schemas), `councils-store.test.ts`, `council-runner.test.ts`, `council-prompts.test.ts`, new `e2e/councils.spec.ts` |

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] Boundary lint clean: `council-runner.ts` and the stores stay in `packages/desktop`; `shared`
      carries only the zod contract; `app` reaches everything through `window.midniteStudio`, never
      importing the runner or the broker directly.
- [x] Vitest (Theme A/B): schema round-trips, one malformed council/member entry does not cost the
      rest of the file, a run's member snapshots are frozen at run start even after the council's
      live members are edited afterward.
- [x] Vitest (Theme C): the settle barrier fires once every member is `succeeded`/`failed`/
      `timeout`/`skipped` and not before; a hung member times out without blocking the others; the
      synthesis prompt builder produces the expected shape for a 2-member and a 4-member panel.
      *(Building this test caught and fixed a real bug: concurrent member settles raced on a plain
      read-modify-write of the run object, dropping the earlier settle's write — fixed with a
      per-run mutation lock, `withRunLock` in `council-runner.ts`.)*
- [x] Playwright (`e2e/councils.spec.ts`): create a council, add a member, run against a mocked
      prompt (mock bridge, no real CLI spawn), watch the member tab and synthesis tab reach a
      terminal state, skip a running member and confirm the barrier still fires.
- [x] Screenshot, per the visual-phase convention: the council list, the detail view with the
      members panel open, and a run mid-flight with one member tab live.

*All eight themes (A–H) have landed. Two manual passes remain, both needing a human rather than a
test: run a real council (2–3 members, real `agy`/`codex`/`opencode` installs) end to end and
confirm each member's command actually executes without a manual Return, and that the synthesis
reads as a coherent distillation rather than a concatenation — everything up to this point was
built and verified against mocks, and while the shell-exit behavior `spawnOneShot`'s `; exit $?`
depends on is unit-tested, only a real CLI run confirms the login shell truly behaves this way
end to end; and confirm the auto-send note on the composer reads as reassuring rather than
alarming, which is a judgment call worth a second pair of eyes before it ships.*

## Not in this phase

- **Every format but brainstorm.** Debate and critique's anonymize/shuffle/de-anonymization-legend
  mechanic is upstream's own "heart of the feature," and it deserves a phase where it's the whole
  point rather than a corner of the MVP. `CouncilFormat` is written as a one-value literal so adding
  it later is a visible schema change.
- **Re-synthesis across formats.** Meaningless with one format; the natural next phase once a
  second format exists, reading upstream's `syntheses[]` archive + format-chip UI as the reference.
- **Repo-scoping.** Councils are global, like the agent roster. A `repoId` column and a
  `dashboard-store.ts`-style default-fallback pattern are the shape to reach for if this changes.
- **Drag-reorder of members.** `dnd-kit` is already a dependency (Phase 8's sequencer, Phase 31's
  rebase builder) so this is a small follow-on, not a hard one — just not in this slice.
- **Export (markdown/HTML).** `buildCouncilRunReport`'s shape ports cleanly whenever this lands;
  deferred so this phase stays focused on create → run → synthesize → view.
- **Agents beyond the 3-provider pool.** `claude`, `openclaude`, `cursor`, `copilot`, `kilo` have no
  defined non-interactive flag in `agentInvocationArgs` today. Extending the pool means giving each
  a headless flag first — a `start-agent.ts` change with its own testing burden, not a councils one.
- **Project linking.** Upstream links a council run to a project entity this app has no equivalent
  of; no analog exists here to link to.
- **i18n.** This app has no localization layer; upstream's `next-intl` message catalogs have no
  counterpart to port.

## Decisions / open questions

- **Resolved — members auto-run; the human does not press Return per member.** A narrow exception
  to `start-agent.ts`'s type-but-don't-send posture, justified because a council member only
  answers a prompt and cannot mutate a repo. Written down explicitly (Theme F) rather than left as
  a silent inconsistency with how every other agent launch behaves.
- **Resolved — only `agy`, `codex`, `opencode` are eligible member/synthesizer providers**, because
  they're the only roster agents with a defined headless invocation flag in `agentInvocationArgs`.
  Adding `claude` or others as members is gated on giving them a flag there first.
- **Resolved — councils are global**, matching the agent roster's own precedent
  (`agents.json`/`BUILTIN_AGENTS`), not keyed by `repoId` the way dashboard boards are.
- **Resolved — brainstorm is the only format this phase ships.** Debate/critique and their
  anonymization mechanic are deferred whole, not partially built.
- **Resolved — member editing is flat (add/remove/edit), no drag-reorder**, keeping Theme F small.
- **Resolved — no export in this phase.**
- **Resolved — a separate `councils-runs-store.ts`**, as recommended: run history writes far more
  often than council/member edits, so keeping it out of `councils-store.ts` keeps that file close to
  `agents-store.ts`'s shape. Capped at `MAX_STORED_RUNS = 200` (oldest dropped first) so history
  cannot grow unbounded over the life of the app.
- **Resolved — `COUNCIL_RUN_TIMEOUT_MS = 120_000`, a hardcoded constant in `shared/src/council.ts`**,
  not a `MidniteConfig` field — no Settings surface for it in this phase, matching the "minimal"
  option chosen in the exec session over a configurable one.
