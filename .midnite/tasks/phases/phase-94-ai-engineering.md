# Phase 94 — AI engineering: skills, loops, graphs, harnesses

**Written unattended** (no human in the loop — see Decisions) · 2026-09-20 · seeded by four named
disciplines and grounded against the tree.

Four terms have settled over 2026 for the layers that sit *around* a model: **skill engineering**,
**loop engineering**, **graph engineering**, **harness engineering**. Midnite Studio ships an embryo
of all four already — thirteen skills mirrored three ways, six agent loops behind a FAB, a
15,570-node knowledge graph with a view over it, a pty broker, a twelve-agent roster, an MCP server
and a provenance crosswalk. What it does not ship is the one thing all four disciplines are
actually *about*: **the
feedback edge**. The app can start an agent and write down that it started; it cannot say whether
what came back was any good.

That is this phase. Not four essays — one slice: **make a run a first-class, checked, comparable
fact**, and let the loop, the skill catalogue and the graph all read it.

> ### What the sources say, and what could not be retrieved
>
> **All three x.com URLs the topic named are unretrievable from here.** `WebFetch` returns
> **HTTP 402 Payment Required** on every one of them — x.com now gates unauthenticated article and
> status reads behind its paid API — and both fallbacks failed too (`xcancel.com` → 451,
> `r.jina.ai` → 403). So:
>
> | Discipline | Source named | Retrieved? | What this doc's framing rests on |
> |---|---|---|---|
> | Skill engineering | *(no link given)* | n/a | Secondary definitions + this repo's own tree |
> | Loop engineering | [`x.com/0xwhrrari/article/2065539680146182270`](https://x.com/0xwhrrari/article/2065539680146182270) | ❌ 402 | A close paraphrase that reproduces the article's structure: [addyosmani.com/blog/loop-engineering](https://addyosmani.com/blog/loop-engineering/) |
> | Graph engineering | [`x.com/0xwhrrari/status/2086784668003598356`](https://x.com/0xwhrrari/status/2086784668003598356) | ❌ 402 | [Towards Data Science, *Graph Engineering for AI Agents*](https://towardsdatascience.com/graph-engineering-for-ai-agents-from-prompts-and-loops-to-workflows/) |
> | Harness engineering | [`x.com/0xwhrrari/status/2093685107534000560`](https://x.com/0xwhrrari/status/2093685107534000560) | ❌ 402 | [martinfowler.com/articles/harness-engineering](https://martinfowler.com/articles/harness-engineering.html) |
>
> **Nothing below is attributed to those three posts.** Where a theme derives from a source it names
> the source that was actually read. The one thing search returned *about* the loop article is its
> own title and thesis — *"Loop Engineering: The AI skill every builder needs in 2026"*, published
> 2026-06-12, arguing you stop prompting the agent and start designing the system that prompts it —
> which agrees with the paraphrase, so the framing is safe; the *specifics* are the paraphrase's.
>
> **Skill engineering** — packaging a repeatable procedure into a structured, versioned, loadable
> unit (`SKILL.md` + frontmatter + scripts) that an agent picks up on demand, with a lifecycle
> (build → test → review → deploy) rather than a folder of prose.
>
> **Loop engineering** — *"replacing yourself as the person who prompts the agent"*. The loop
> **finds the work, hands it out, checks it, writes down what is done, and decides the next thing**.
> Its named parts: automations (the trigger), worktrees (isolation), skills (codified procedure),
> connectors/MCP (reach), sub-agents (a verifier that is not the author), and external state
> (a file or board that survives the session).
>
> **Graph engineering** — declaring the *execution topology* in advance: nodes (work units), edges
> (transition logic), shared state, checkpoints. *"The difference is who decides the path, the agent
> or you."* In a loop the agent picks its route; in a graph you declare the legal ones.
>
> **Harness engineering** — **Agent = Model + Harness**. The harness is *guides* (feedforward:
> docs, rules, structure) and *sensors* (feedback: the things that observe output and let it
> self-correct), each either **computational** (deterministic, milliseconds — tests, linters, type
> checkers) or **inferential** (a judging model, slower, nuanced). The practice is to push controls
> as far left as cost allows.

> ### Six findings from the grounding. Together they are the phase.
>
> **1. There is no loop. The loop is a sentence.** `LoopScheduleSchema`
> ([`shared/src/loops.ts:321`](../../../packages/shared/src/loops.ts)) is never read by any timer —
> `loopScheduleFragment` (`:450`, *"the schedule as prose"*) turns it into English and
> `composeLoopPrompt` (`:1157-1182`) splices it into the command line. The field's own docblock says
> it: *"the loop schedules its own next wake-up"*. `grep` for `setInterval|cron|scheduleAt` across
> `features/loops`, `main/loop-runs.ts` and `shared/src/loops.ts` returns **zero**. A loop is a human
> pressing Start on a prompt that asks a model to keep itself alive. In the vocabulary above that is
> prompt engineering wearing a loop's clothes.
>
> **2. The sensor is already built, fully, and nothing agentic touches it.**
> [`main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) — argv-only, no
> shell, own deadline, detached process group so a test runner's grandchildren die too — backs
> [`main/diagnostics/runner.ts`](../../../packages/desktop/src/main/diagnostics/runner.ts) (the
> repo's own linter, streamed and parsed) and
> [`main/testing/runner.ts:38`](../../../packages/desktop/src/main/testing/runner.ts)
> `runTestSuite(suite, deps): Promise<TestRunResult>`. `TestRunResult`
> ([`shared/src/domain/tests.ts:138`](../../../packages/shared/src/domain/tests.ts)) is a parsed
> verdict already: `passed` / `failed` / `skipped` / `failures[]` / `durationMs` / `exitCode`, with
> an honest `structured: false` fallback. Each has a consent gate that stores a **command
> fingerprint, not a boolean**, so editing the script withdraws the grant
> ([`testing/trust-store.ts:14-19`](../../../packages/desktop/src/main/testing/trust-store.ts)).
> This is Fowler's computational sensor, shipped. No loop, no council, no session has ever called it.
>
> **3. Four run records exist and none of them records an outcome.** `LoopRunRecordSchema`
> ([`loops.ts:559-571`](../../../packages/shared/src/loops.ts)) has `composedPrompt`,
> `checkedModifierIds`, `exitCode`, `status: 'running'|'stopped'|'exited'` — and no repo, no skill,
> no verdict. `CouncilRunSchema`
> ([`shared/src/council.ts:146-160`](../../../packages/shared/src/council.ts)) has members and a
> synthesis. [`main/workflow-runs-store.ts`](../../../packages/desktop/src/main/workflow-runs-store.ts)
> is a third. `ClosedSessionSchema`
> ([`shared/src/domain/session-history.ts:31-68`](../../../packages/shared/src/domain/session-history.ts))
> is the fourth and the only one with a `repoId`. Four shapes, four stores, four caps, one missing
> field in common.
>
> **4. The join to "what the agent actually did" is already written, and so is the exact version of
> it.** Phase 78 landed [`shared/src/domain/provenance.ts`](../../../packages/shared/src/domain/provenance.ts):
> `classifyProvenance` (`:110`), `commitsForSession` (`:215`), `commitsForLiveSession` (`:244`), and
> a `CommitProvenance` union (`:31-47`) that carries `sessionId`. Its four strategies run strongest
> first (`:16-21`) and the weakest is a timestamp-window heuristic (`:171-205`) — but the strongest,
> `session-trailer`, is *exact*: [`main/hooks/prepare-commit-msg.sh`](../../../packages/desktop/src/main/hooks/prepare-commit-msg.sh)
> writes `Midnite-Session: $MSTUDIO_SESSION_ID`, [`main/pty-env.ts:24`](../../../packages/desktop/src/main/pty-env.ts)
> injects that variable into every pty the app spawns, and
> [`log-parser.ts:21`](../../../packages/git-engine/src/parsers/log-parser.ts) already reads the
> trailer back. The hook is opt-in and default-off, by Phase 78 Theme E's own design. Every run
> record already stores a `sessionId`. So *"which commits did this run produce"* is a function call
> away — exact with the hook armed, heuristic without — and nothing calls it.
>
> **5. The three skill mirrors have diverged, and one of the diffs is a bug.** 13 skills, 23 files,
> in each of `.claude/skills/`, `.agents/skills/`, `.codex/skills/`; no symlinks; the path sets are
> identical and **13 of 23 files differ** between `.claude` and each mirror. Two *kinds* of
> difference are tangled together: legitimate per-CLI translation (`allowed-tools:` frontmatter vs a
> prose `**Invoke with:**` line; `AskUserQuestion` vs *"a direct question to the user"*) and **real
> staleness where `.claude` is ahead** — [`.claude/skills/midnite-git-cleanup/cleanup.sh:143-151`](../../../.claude/skills/midnite-git-cleanup/cleanup.sh)
> carries a symref fix (match `%(refname)`, not `%(refname:short)`, so `refs/remotes/origin/HEAD` is
> not misread as a branch named `origin` **and pushed for deletion**) that
> `.agents/skills/midnite-git-cleanup/cleanup.sh:143` and `.codex`'s copy still lack; and
> [`.claude/skills/midnite-create/SKILL.md:14`](../../../.claude/skills/midnite-create/SKILL.md) points
> at `.midnite/tasks/phases/` while the mirrors still point at the flat path the tracker abandoned.
> **Nothing checks any of this** — no script, no moon task, no CI step, no test mentions `.codex` or
> `.agents/skills` at all.
>
> **6. The knowledge graph is a picture for humans and nothing else.**
> [`packages/knowledge`](../../../packages/knowledge/src/index.ts) reads `graphify-out/graph.json`
> (`graph-reader.ts:61` `readGraph`, `:111` `graphExists`, `:7` the path constant, whose comment
> reads *"never written by this package"*) and projects it (`projection.ts:17` `projectGraph`,
> `:53` `buildDetailIndex`) for exactly one consumer: the Knowledge canvas. The graph as it stands
> on disk today is **15,570 nodes · 37,852 links · 607 communities**, `built_at_commit ae5490f2` —
> **23 commits behind HEAD**, which the app correctly says out loud
> (`knowledge-handlers.ts:119-127` `countCommitsBehindHead` → `knowledge-view.tsx:391-397`
> `StaleBanner`) and correctly refuses to act on. Meanwhile the MCP server exposes **eleven** tools
> ([`shared/src/mcp.ts:84-217`](../../../packages/shared/src/mcp.ts)) — nine `readOnly`, plus
> `ui.navigate` and `ui.command` behind Phase 81's gate — and **not one of them is the graph**. So
> an agent that wants the repo's own map shells out to the `graphify` CLI, which is also the only
> thing `.claude/settings.json`'s `PreToolUse` hook (`graphify hook-guard search` / `… read`) knows
> how to suggest, and which the app itself deliberately never runs.

**Builds on.**
- [Phase 35](phase-35-fab-mission-control.md) — the loop console, `LoopDefinition`,
  `loop-runs-store.ts` (200-record cap, `userData`), and its own *Not in this phase* line
  *"retained transcripts for past runs — history keeps metadata + composed prompt only"*. This phase
  is the follow-through on that line.
- [Phase 78](phase-78-whose-hands-were-on-the-keyboard.md) — the provenance vocabulary, the
  sessions↔commits crosswalk, and Theme E's opt-in `prepare-commit-msg` hook plus the
  `MSTUDIO_SESSION_ID` env that makes it exact. Theme A joins a run to all of it; nothing here
  re-derives it, and nothing here arms that hook on a user's behalf.
- [`packages/shared/src/terminal.ts:230`](../../../packages/shared/src/terminal.ts) — `BUILTIN_AGENTS`,
  twelve roster entries, each with `signatures` and `activity` markers, overridable by a user's
  `agents.json`. A run's `agentId` is one of these; this phase adds no thirteenth.
- [Phase 57](phase-57-mcp-server.md) — `MCP_TOOLS`, the `readOnly` flag, the audit log
  ([`main/mcp/audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts)) and the "every tool takes
  an explicit `repoPath`" rule. Theme G adds tools to that table, it does not build a second server.
- [Phase 81](phase-81-where-the-companion-can-take-you.md) Theme F — the consent model that let
  `ui.*` be the first non-read-only tools: a default-off switch, a tier check, a toast on every act.
  Theme G's new tools are read-only and inherit it unchanged.
- [Phase 49](phase-49-repo-onboarding.md) — the scaffold manifest
  ([`shared/src/domain/scaffold.ts:86-93`](../../../packages/shared/src/domain/scaffold.ts),
  `main/scaffold/{manifest,hash,plan,version}.ts`). It hashes **template → target repo**. It does
  **not** hash this repo's own three mirrors; Theme E is the other half, and reuses `sha256File`.
- [Phase 87](phase-87-knowledge-graph-panel.md) / [Phase 89](phase-89-knowledge-graph-variants.md) —
  `packages/knowledge`, the `mstudio:knowledge:*` channels
  ([`channels.ts:1052-1063`](../../../packages/shared/src/ipc/channels.ts)) and
  `knowledge-source-location.ts`'s node→`file:line` mapping, which Theme G runs backwards.
- [Phase 19](phase-19-diagnostics.md)/[Phase 66-ish testing](phase-82-the-pyramid-righted.md) —
  `process-runner.ts` and the two trust stores. Finding 2. Theme B is a third caller, not a third
  spawner.
- [`scripts/website-sync-install.mjs`](../../../scripts/website-sync-install.mjs) — the exact shape
  Theme E's gate copies: a dependency-free `.mjs` with `--check` / `--write`, a loud diff, and a
  written rationale for *why it is not a vitest*.

**Scope guardrails.**
- **No new rail row.** The app has 22 views
  ([`domain/view.ts:35-58`](../../../packages/shared/src/domain/view.ts)). Runs land as a tab inside
  the existing `sessions` view, beside the live/closed lists Phase 86 merged there. A run is a thing
  that *happened in a session*; it does not need its own front door.
- **No runtime `.claude/skills/` scan.** Settled with Phase 92 on the swarm board and honoured here:
  `AgentCommandId` / `AGENT_COMMANDS` / `DEFAULT_AGENT_SKILLS` stay the one runtime catalogue.
  Theme E's drift gate is a **build-time script**, and `agent-page.tsx:579-587`'s standing argument
  against a disk picker is left intact. See Decision 3.
- **The app still never runs `graphify`.** [Phase 87](phase-87-knowledge-graph-panel.md) Decision 4
  stands unamended — no spawn, no rebuild button. Theme G reads `graph.json` through the
  `packages/knowledge` reader that already exists. See Decision 7.
- **MCP repository writes stay deferred.** [Phase 57](phase-57-mcp-server.md) Decision 5 is not
  lifted here. Every tool Theme G adds is `readOnly: true`.
- **Computational sensors only.** No LLM-as-judge, no scoring model, no "inferential" control in
  Fowler's sense. A verdict in this phase is a test suite's exit and counts, or a linter's problem
  list — a number the user can reproduce at their own shell. See Decision 5.
- **No second workflow engine.** *Graph engineering* in the execution-topology sense already has a
  home here: [Phase 43](phase-43-workflows-mvp.md) Workflows and
  [Phase 34](phase-34-agent-councils.md) Councils. This phase does not build a node/edge orchestrator
  beside them. See Decision 6.
- **Nothing on a run record is a secret.** The record is main-side JSON under `userData`, never a
  `persist()` slice — Phase 91 Theme G's lint applies, and `composedPrompt` goes through
  [`shared/src/redact.ts`](../../../packages/shared/src/redact.ts) before it is written.
- **No token, cost or model-side telemetry.** The app drives a pty; it has no honest access to an
  agent's token accounting and will not guess at one. See Decision 8.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The run record, in `shared` (M) — ✅ DONE ([PR #579](https://github.com/bilo-io/midnite-studio/pull/579), 2026-09-26)

One vocabulary over the four records that already disagree. Pure `shared`: zod only, no electron, no
imports from any other workspace package.

- [x] Add [`packages/shared/src/domain/agent-run.ts`](../../../packages/shared/src/domain/agent-run.ts)
      with `AgentRunSchema`:
      `{ id, kind: AgentRunKind, repoId, cwd, sessionId?, agentId?, skillId?, label, startedAt, endedAt?, status: AgentRunStatus, exitCode?, verdict?, sourceId? }`.
      `AgentRunKindSchema = z.enum(['loop','session','council','workflow'])` names the four existing
      producers; `sourceId` is the producer's own id (`loopId`, `councilId`, `workflowId`) so nothing
      loses its home key.
- [x] `skillId: AgentCommandIdSchema.optional()` — **deliberately the same enum Phase 92 settled on**
      (`AgentCommandId`, [`ui-store.ts:1698-1719`](../../../packages/app/src/store/ui-store.ts), 22
      members). This is the item that requires moving the union: `AgentCommandId` lives in the
      *renderer* today, and `shared` cannot import `app`. Lift the id union (and only the union) into
      `shared/src/domain/agent-command.ts`, re-export it from `ui-store.ts` so no import path moves —
      the exact manoeuvre [Phase 81](phase-81-where-the-companion-can-take-you.md) Theme A used for
      `ViewId`. `AGENT_COMMANDS`' labels and icons are UI copy and stay in `app`.
- [x] `AgentRunStatusSchema = z.enum(['running','stopped','exited','abandoned'])` — a superset of
      `LoopRunStatusSchema` ([`loops.ts:546`](../../../packages/shared/src/loops.ts)) plus
      `abandoned` for the case `main/loop-runs.ts:54-65` already handles by hand (a record still
      `running` at boot because the app died under it).
- [x] `AgentRunVerdictSchema` — the phase's actual point:
      `{ checkedAt, suiteId, outcome: 'pass'|'fail'|'unavailable', passed, failed, skipped, durationMs, failures: TestFailure[], reason?: TestRunReason }`.
      Reuse `TestFailureSchema` / `TestRunReasonSchema`
      ([`domain/tests.ts:127`/`:123`](../../../packages/shared/src/domain/tests.ts)) rather than
      declaring parallel shapes; `unavailable` is how `{ ok: false, reason }` arrives without
      pretending a missing suite is a failure.
- [x] Pure, module-level selectors, testable with no store and no Electron:
      `runsForRepo(runs, repoId)`, `runsForSkill(runs, skillId)`, `latestVerdict(run)`,
      `skillOutcomeTally(runs): Map<AgentCommandId, {pass, fail, unavailable}>`. Follow
      `notesForRepo`'s precedent — selectors are functions in the module, not methods on a store.
- [x] `export function fromLoopRun(record: LoopRunRecord, extra): AgentRun` — the adapter, in
      `shared`, so `loops.ts`'s record stays the loop console's own shape and the unification is a
      projection rather than a rewrite of a persisted file. Same for `ClosedSession` →
      `AgentRun` (`kind: 'session'`).
- [x] **No migration of the three on-disk stores in this theme.** `loop-runs.json`,
      the councils store and `workflow-runs` keep their files and their 200-record caps; Theme D
      reads them through the adapters. Decision 2 records why, and what the cost is.
- [x] Vitest [`agent-run.test.ts`](../../../packages/shared/src/domain/agent-run.test.ts): round-trip
      each schema; `fromLoopRun` against a real `LoopRunRecord` fixture; `skillOutcomeTally` over a
      mixed set; a run with no verdict tallies as neither pass nor fail.
- [x] `packages/shared/src/domain/index.ts` re-exports; `agent-command.ts` too.

### B — The sensor: a checked loop iteration (L)

Finding 2 meets finding 1. A loop gains an optional verification step, and it is the suite runner
that already exists — not a new spawner, not a shell string.

- [ ] Extend `LoopDefinitionSchema` ([`loops.ts:510-534`](../../../packages/shared/src/loops.ts))
      with `verifiable: boolean` (default `false`), and add a per-loop persisted setting
      `loopVerifySuite: Record<string, string | null>` (loopId → `TestSuite.id`) beside
      `loopSchedules` in [`ui-store.ts:886`](../../../packages/app/src/store/ui-store.ts). A suite
      **id**, never a command string: the trust store's grant is keyed on the suite's command
      fingerprint, and a free-text command would route straight around it.
- [ ] The picker in `LoopComposer`
      ([`loop-composer.tsx:96`](../../../packages/app/src/features/loops/loop-composer.tsx)) is a
      select over the repo's detected suites — the same list the `tests` view already renders — with
      an explicit "No check" option as the default. An untrusted suite renders with the existing
      trust prompt and cannot be selected until granted; do not add a second consent surface.
- [ ] New main module
      [`packages/desktop/src/main/runs/verify.ts`](../../../packages/desktop/src/main/runs/verify.ts):
      `verifyRun(runId, suiteId, repoPath): Promise<AgentRunVerdict>` — resolves the suite, checks
      `testTrustStore`, calls `runTestSuite` ([`testing/runner.ts:38`](../../../packages/desktop/src/main/testing/runner.ts)),
      maps `TestRunResult` → `AgentRunVerdict`, writes it onto the run. It calls the runner; it does
      not touch `process-runner.ts` directly.
- [ ] **One verification at a time, per repo.** A second `verifyRun` for the same `repoPath` queues
      rather than spawning a parallel vitest — two suites against one checkout is how you get a
      `failed` that is really a port collision. A small promise chain keyed by repo path, in the same
      spirit as [`git-engine`'s write queue](../../../packages/git-engine/src/exec/write-queue.ts),
      **not** an import of it (git-engine is about git).
- [ ] `TEST_RUN_TIMEOUT_MS` is ten minutes
      ([`testing/runner.ts:16`](../../../packages/desktop/src/main/testing/runner.ts)). A verify that
      hits it records `outcome: 'unavailable', reason: 'timed-out'` — it does **not** record a
      failure, and it does not stop the loop. Assert this in a test; the opposite behaviour would
      make a slow machine look like a broken agent.
- [ ] The verdict is surfaced on the loop tab: a pass/fail pill on the current run and on each row of
      [`loop-history.tsx:20`](../../../packages/app/src/features/loops/loop-history.tsx), with the
      failure names on expand beside the `composedPrompt` that is already there.
- [ ] **Verification never writes to the repository.** No stash, no checkout, no commit — the suite
      runs against the worktree as the agent left it. If the agent left the tree dirty that is part
      of what the verdict is measuring.
- [ ] Vitest `main/runs/verify.test.ts`: a passing suite → `outcome: 'pass'` with counts; a failing
      one → `'fail'` with `failures[]` populated; an untrusted suite → `'unavailable'` +
      `reason: 'untrusted'` and **no spawn** (assert the `process-runner` dep was never called); the
      per-repo queue serialises two concurrent calls.

### C — The decide: the loop steps out of the prompt (L)

Finding 1, fixed. The cadence stops being English addressed to a model and becomes a timer the app
owns. This is the theme that makes "loop engineering" true of this app rather than aspirational.

- [ ] New main module
      [`packages/desktop/src/main/runs/loop-driver.ts`](../../../packages/desktop/src/main/runs/loop-driver.ts):
      owns one interval per armed loop, reads `LoopSchedule` as **data**, and decides whether the
      next iteration may start — inside the window, on an allowed weekday, with no iteration already
      live for that loop.
- [ ] **The driver lives in main, not the renderer.** A `setInterval` in the renderer stops when the
      window is hidden ([Phase 84](phase-84-live-everywhere-lighter-when-hidden.md)'s visibility
      gates are explicit about this) and dies with a reload. A loop whose whole value is running
      while you are not looking cannot live there.
- [ ] `LoopSchedule` gains nothing and loses nothing — `loopScheduleFragment` (`:450`) **stays**, and
      the prose it emits stays in the prompt. Belt and braces: the app enforces the window, the
      sentence tells the agent why it was stopped. Say this in the code; the temptation to delete the
      fragment is exactly wrong while an iteration is still a long-lived interactive CLI.
- [ ] Stop conditions, in one exported pure function
      `nextAction(loop, runs, schedule, now): 'start' | 'wait' | 'stop'` in
      [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts) so it is testable with no
      Electron and no clock injection beyond `now`. Rules: stop on `maxIterations` reached; stop on
      a `pass` verdict when the loop is configured `until-green`; stop after
      `consecutiveFailures >= N`; wait outside the schedule window.
- [ ] Two new per-loop settings beside the existing ones: `loopMaxIterations`
      (`Record<string, number>`, default `0` = unbounded) and `loopStopOn`
      (`'never' | 'pass' | 'fail'`, default `'never'`). Default-off across the board: **an existing
      loop must behave exactly as it does today until the user arms the driver.**
- [ ] The re-prompt carries the verdict. On a `fail`, iteration *n+1*'s composed prompt is the same
      `composeLoopPrompt` output plus a fenced block of the verdict's `failures[]` (names + files +
      messages, capped). This is the whole feedback edge in one item — the agent is told what it
      broke, by the thing that ran the tests, without a human retyping it.
- [ ] Redact before it is composed and before it is stored:
      [`redact.ts`](../../../packages/shared/src/redact.ts) over the failure block. A test-failure
      message routinely contains an environment dump.
- [ ] A driver-started iteration is an ordinary `startAgent` session, so it inherits
      [`pty-env.ts:24`](../../../packages/desktop/src/main/pty-env.ts)'s `MSTUDIO_SESSION_ID` /
      `MSTUDIO_AGENT_ID` for free — which means a user who has armed Phase 78 Theme E's
      `prepare-commit-msg` hook gets *exact* run→commit attribution on every iteration, with no
      further work in this phase. Assert the env is present on a driver-spawned pty.
- [ ] Iteration *n+1* is a **fresh session**, not `\r` into the live pty. `use-loop-session.ts`'s
      `stop()` ([`:167-210`](../../../packages/app/src/features/loops/use-loop-session.ts)) already
      does interrupt → 300 ms grace → sleep; the driver reuses that path and then starts a new one,
      so an iteration boundary is a boundary in the ledger too.
- [ ] New IPC: `loopDriverArm` / `loopDriverDisarm` / `loopDriverState` under `mstudio:loops:driver:*`
      in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), `GitOpResult` envelope. The
      renderer arms; main runs.
- [ ] **The driver refuses to start an iteration in a repo with no armed session host.** If the
      window is gone the driver disarms itself and records `abandoned` rather than spawning a pty
      nobody can see — the same honesty `loop-runs.ts:54-65` already applies at boot.
- [ ] Vitest: `nextAction` truth table (in `shared`, no mocks); driver tests with an injected clock
      for window boundaries, weekday rollover, `until-green`, the failure streak, and "already
      running → wait".

### D — Runs: one list of what the agents did (M)

External state, in loop-engineering's sense — the thing that survives the session and can be read
back. Four ledgers become one readable surface, and no on-disk format moves.

- [ ] New main module
      [`packages/desktop/src/main/runs/index.ts`](../../../packages/desktop/src/main/runs/index.ts):
      `listRuns({ repoId?, kind?, skillId?, limit })` merges the four sources through Theme A's
      adapters — `loop-runs-store.ts`, `councils-runs-store.ts`, `workflow-runs-store.ts` and the
      session history — sorted newest-first, capped server-side.
- [ ] Channels `mstudio:runs:list` / `mstudio:runs:get` + an `mstudio:runs:changed` event that
      re-emits when any underlying store changes (`loop-runs.ts:37`'s `emitChanged` already exists;
      fan the others into the same event rather than adding three).
- [ ] A **Runs** tab in the existing `sessions` view — not a new `ViewId`. Columns: when, kind, the
      skill (label from `AGENT_COMMANDS`), the repo, duration, exit, **verdict**. Row click opens the
      detail.
- [ ] Run detail shows the composed prompt (already stored), the verdict with its failures, and
      **the commits the run produced** — `commitsForSession(sessionId, …)`
      ([`provenance.ts:215`](../../../packages/shared/src/domain/provenance.ts)) against the repo's
      log. This is finding 4 cashed in; it is a call, not an algorithm.
- [ ] A run whose session has been purged from history still renders — the record is the record.
      Missing commits degrade to "session transcript purged", never to an empty list that reads as
      "it changed nothing".
- [ ] A `verdict` filter (all / green / red / unchecked) and a `skillId` filter. Both are the query
      that makes Theme F's numbers legible one level up.
- [ ] A run row links **back** to its origin — a loop run opens the FAB on that tab, a council run
      opens that council, a session run opens the session. The Runs tab is an index over things that
      already have homes, not a replacement for them.
- [ ] Scope to the active repo by default, with an "all repositories" toggle. Three of the four
      sources are global stores; `ClosedSession` is the only one with a `repoId` today, so the
      adapters must supply it from the run's `cwd` where the source does not carry one — and where
      neither is available the row shows the repo as unknown rather than guessing.
- [ ] The empty state distinguishes "no runs yet" from "no runs matching these filters". Four merged
      sources make an over-filtered list look like a broken feature.
- [ ] Vitest: the merge orders across sources correctly; the cap is applied after the merge, not per
      source; a malformed row in one store does not empty the list (match
      `parseStoredLoopRuns`'s one-bad-row tolerance, [`loop-runs-store.ts:52`](../../../packages/desktop/src/main/loop-runs-store.ts));
      `sessions-view` renders the new tab and the old lists unchanged.

### E — Skill identity, and the mirror drift gate (M)

Finding 5. Skill engineering's versioning-and-lifecycle half, at the scale this repo actually needs:
not a registry, a gate.

- [ ] Add [`scripts/skills-sync-check.mjs`](../../../scripts/skills-sync-check.mjs), dependency-free,
      no `@midnite/*` imports (it must run from a bare checkout), with `--check` and `--write`,
      modelled line-for-line on
      [`scripts/website-sync-install.mjs`](../../../scripts/website-sync-install.mjs).
- [ ] **A byte-for-byte diff is the wrong check and the script must say so in its header.** All 13
      differing files differ *legitimately* in their frontmatter. The comparison is over a
      **normalised** body: strip the YAML frontmatter block; apply a declared substitution table
      (`AskUserQuestion` ↔ *"a direct question to the user"*, `.claude/skills/…` ↔ `.agents/skills/…`
      ↔ `.codex/skills/…`, `CLAUDE.md` ↔ `GEMINI.md` ↔ `AGENTS.md`); then compare. Anything left over
      is drift.
- [ ] The substitution table is **data at the top of the script, not regexes scattered through it**,
      and every entry carries a one-line reason. An entry with no reason is how a real divergence gets
      normalised away.
- [ ] The gate covers four trees, in two comparisons: `.claude/skills` ↔ `.agents/skills` ↔
      `.codex/skills` (all 13 skills), and `templates/midnite/.claude/skills` ↔ this repo's own
      `.claude/skills` **for the nine skills the template ships only** — the template's four
      omissions (`graphify`, `midnite-setup`, `midnite-release-prep`, `midnite-release-complete`) are
      deliberate and documented in [`templates/midnite/README.md`](../../../templates/midnite/README.md);
      the script asserts the omission list rather than flagging it.
- [ ] Reuse `sha256File` ([`main/scaffold/hash.ts:5`](../../../packages/desktop/src/main/scaffold/hash.ts))'s
      *algorithm*, not its module — the script cannot import from `packages/desktop`. Hash the
      normalised body, not the file.
- [ ] Fix the drift the gate will find on its first run, in this theme's PR: port the `cleanup.sh`
      symref fix into `.agents` and `.codex`; port `midnite-create`'s `.midnite/tasks/phases/` path and
      the dropped `open-decisions.md` reference. **List each ported fix in the PR body** — a silent
      mass re-sync is how a real behavioural difference gets flattened.
- [ ] `templates/midnite/.template-version` is `1.0.0` and has been touched once, in `f3658b07`,
      while `templates/midnite/` has had five commits since. Bump it as part of this theme and add a
      gate rule: **a commit that changes any file under `templates/midnite/` must change
      `.template-version`.** This is the only version number the scaffold manifest
      ([`scaffold/version.ts:11`](../../../packages/desktop/src/main/scaffold/version.ts)) has to
      decide whether an onboarded repo is out of date, and a frozen one makes "Update" a lie.
- [ ] Wire it: a `skills-check` task in root [`moon.yml`](../../../moon.yml) beside `tracker-check`
      (`:36`) and `version-check` (`:48`), `options: { cache: false }`; a step in
      [`ci.yml`](../../../.github/workflows/ci.yml)'s gate job beside the other four static checks
      (`:208`, `:214`, `:224`, `:230`). Unlike `website-sync-install` this **is** a PR gate — both
      sides of the comparison are in the diff, so there is a pull request for it to block.
- [ ] Ship `scripts/skills-sync-check.test.mjs` with it. Every script in `scripts/` has a sibling
      test except `website-sync-install.mjs` (which reaches the network and explains itself); this
      one reads only the working tree, so it has no excuse.
- [ ] Fix the two stale facts the sweep turned up while here:
      [`templates/midnite/README.md`](../../../templates/midnite/README.md) says *"of the twelve
      skills this repo has"* — there are thirteen, `graphify` arrived later — and
      [`quick-access-menu.tsx:43-49`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx)
      describes Loops as *"the four agent loops"* when `DEFAULT_LOOPS`
      ([`loops.ts:650`](../../../packages/shared/src/loops.ts)) has six.

### F — Which skills actually leave the repo green (S/M)

Skill engineering's evaluation half, derived rather than invented. No benchmark, no judge — just the
tally that Themes A–D make free.

- [ ] A **Skills** section on the agent settings page
      ([`settings-pages/agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx)),
      one row per `AgentCommandId`: label, the resolved slash-command string (the existing editable
      field, unchanged), run count, and the pass/fail/unchecked tally from
      `skillOutcomeTally(runs)`.
- [ ] Present it as **a count, never a score.** "11 runs · 8 green · 2 red · 1 unchecked", not a
      percentage and not a rank. Two runs of a skill is not a measurement, and a percentage over two
      runs reads as one.
- [ ] Flag the resolvable-but-absent case the grounding found: `DEFAULT_AGENT_SKILLS` names
      `/pr-review`, `/pr-feedback` and `/loop`
      ([`ui-store.ts:1748`, `:1749`, `:1762`](../../../packages/app/src/store/ui-store.ts)) which do
      **not** exist under this repo's `.claude/skills/` — they are user-level skills, and
      [`loops.ts:642-649`](../../../packages/shared/src/loops.ts) already acknowledges the gap in a
      comment. Surface it as a **hint on the row**, not a validation error: a user-level skill is a
      legitimate, common configuration, and the app cannot see `~/.claude/skills` (Decision 3).
- [ ] A "no runs yet" row is an empty state, not a zero. A skill nobody has run and a skill that
      always fails must not look alike.
- [ ] Vitest over `skillOutcomeTally` and the row renderer: an unchecked-only skill, a mixed skill, a
      skill with no runs, a `skillId` present on a run whose command has since been renamed by the
      user (the tally follows the id, the label follows `AGENT_COMMANDS`).

### G — The graph an agent can read, and the footprint of a run (M)

Finding 6, and the honest version of "graph engineering" for this product: the *knowledge* graph
becomes context an agent can fetch and a run can be plotted on.

- [ ] Two new **read-only** MCP tools in `MCP_TOOLS`
      ([`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts)), following Phase 57's rules
      exactly — explicit `repoPath`, zod input/output, server-side clamped limits, `readOnly: true`:
      - `knowledge.find` — `{ repoPath, query, limit }` → matching nodes with
        `id`, `label`, `source_file`, `source_location`, `community_name`.
      - `knowledge.neighbours` — `{ repoPath, nodeId, depth, limit }` → the scoped subgraph
        (nodes + links with `relation` / `weight`), depth clamped to 2, node count clamped hard.
- [ ] **`source_location` is not on the projected payload** — `projectGraph`
      ([`projection.ts:3-8`](../../../packages/knowledge/src/projection.ts)) drops it to keep the
      wire payload small and serves it per-node out-of-band through `buildDetailIndex` (`:53`) and
      `mstudio:knowledge:get-node-detail`. A `file:line` is the single most useful field for an
      agent, so these two tools read it off the **raw** graph rather than the projection. Note the
      asymmetry in the handler; it is the kind of thing that gets "tidied" back into a bug.
- [ ] Both go through [`packages/knowledge`](../../../packages/knowledge/src/index.ts)'s existing
      `readGraph` and the main-side cache behind `mstudio:knowledge:get-graph`
      ([`knowledge-handlers.ts:130-221`](../../../packages/desktop/src/main/ipc/knowledge-handlers.ts))
      — **the app still never spawns `graphify`** ([Phase 87](phase-87-knowledge-graph-panel.md)
      Decision 4). Each response carries `commitsBehind` from the existing
      `countCommitsBehindHead` (`:119-127`) so the agent is told how stale its answer is, in the
      answer. On this repo today that number is 23.
- [ ] **The MCP socket has no auth** — `userData/mcp/` at `0o700`, socket at `0o600`
      ([`main/mcp/server.ts:76`, `:198`](../../../packages/desktop/src/main/mcp/server.ts)), an
      8-connection cap (`:48`), and nothing else: any process running as the same user can connect.
      These two tools add no exposure — that same process can already read
      `graphify-out/graph.json` directly — and the item exists so the reasoning is on the record
      rather than assumed. Do not add a tool to this server without repeating it.
- [ ] **Do not claim parity with `graphify query`.** The CLI ranks and scores; these two tools do
      substring/identifier matching and breadth-first neighbourhood expansion. Name that limit in the
      tool's own `description` so an agent chooses correctly rather than discovering it.
- [ ] `knowledge.find` returns `{ ok: false, kind: 'not-found' }` when the repo has no
      `graphify-out/graph.json` (`graphExists`, [`graph-reader.ts:111`](../../../packages/knowledge/src/graph-reader.ts)),
      with a hint naming `graphify update .` — the tool tells the agent how to fix it and still does
      not run it.
- [ ] **The run footprint.** Given a run: `commitsForSession` → each commit's changed paths → match
      against nodes' `source_file`. Expose it as a pure function in `packages/knowledge`
      (`nodesForPaths(graph, paths): string[]`) — the reverse of
      [`knowledge-source-location.ts`](../../../packages/app/src/features/knowledge/knowledge-source-location.ts),
      which already maps a node to `file:line`.
- [ ] Surface it as a **filter on the Knowledge canvas**, reusing
      [`knowledge-filters-store.ts`](../../../packages/app/src/features/knowledge/knowledge-filters-store.ts)
      and the existing highlight path — "show what run *X* touched" is a highlight set, not a new
      renderer. Entry point is the run detail row from Theme D; no new controls on the canvas itself
      beyond the filter chip the panel already renders.
- [ ] A run that touched files the graph does not know about — a file created after
      `built_at_commit` — reports the count as **unmatched** rather than dropping it silently. With
      the graph 23 commits behind on this repo right now, this is the common case, not the edge
      case, and it is the `StaleBanner`'s abstract number turned into something specific.
- [ ] Vitest: both tools against a fixture graph (`MCP_TOOLS[id].output.safeParse(...)`, per Phase
      57's Theme D convention); the clamp holds against an over-large `limit`; `nodesForPaths`
      against a path that matches nothing; the write-queue spy assertion Phase 57 Theme D introduced
      still records zero calls with the two new tools in the set.

### H — Verification, tests and the numbers (M)

- [ ] `moon run :typecheck :lint :test` green; `moon run root:tracker-check` and the new
      `root:skills-check` both exit 0.
- [ ] Boundary lint clean and argued: `shared` gains `agent-run.ts` + `agent-command.ts` and imports
      nothing new; `packages/knowledge` gains one pure function and stays electron-free;
      `git-engine` is untouched; the renderer reaches main only through `window.midniteStudio`.
- [ ] **A live end-to-end pass, by hand, on the packaged app**: arm a loop with a suite and
      `stopOn: 'pass'` against a repo with a deliberately failing test; watch iteration 1 fail,
      iteration 2 receive the failure block, and the driver stop on green. This is the phase's whole
      claim and no unit test proves it.
- [ ] Per [`docs/TESTING.md`](../../../docs/TESTING.md)'s decision rule, every test added here is a
      **vitest** — none of this needs real layout, real CSS, pointer drag, xterm or canvas. The one
      candidate for a functional e2e is the Runs tab's render inside `sessions`, and it is a
      jsdom test unless it demonstrably cannot be; if a spec *is* added, its header names which
      browser capability forced it.
- [ ] No test asserts a wall-clock bound. Theme B and C are full of durations; every one of them is
      an injected clock or an injected result, never `expect(elapsed).toBeLessThan(...)`.
- [ ] `node scripts/perf/idle-cpu.mjs --blurred` with one armed loop driver and no iteration running,
      compared against the same window with the driver disarmed. The driver is a timer in main that
      exists to run while the window is hidden — the number that matters is the one Phase 84's gates
      cannot help with. Record it in the PR.
- [ ] `node scripts/perf/startup-report.mjs --runs=5` before/after: Theme D merges four stores at
      list time, not at boot, and Theme A's adapters are pure — the median should not move. If it
      does, the merge has crept into startup.
- [ ] Confirm by inspection that no run record, verdict or composed prompt reaches a `persist()`
      slice, and that `redact.ts` is applied on the write path. Phase 91 Theme G's lint is the
      automated backstop; this is the eyeball pass that does not wait for it.
- [ ] Update [`CLAUDE.md`](../../../CLAUDE.md), `AGENTS.md` and `GEMINI.md` together with one new
      convention bullet: **a loop's cadence is enforced in main, and a run's verdict comes from the
      repo's own trusted suite — never from a model's opinion of its own work.** Three files, one
      edit, per the sync rule.

## Files this phase touches

**New**
- [`packages/shared/src/domain/agent-run.ts`](../../../packages/shared/src/domain/agent-run.ts) — the run record, the verdict, the adapters and the selectors (A).
- `packages/shared/src/domain/agent-run.test.ts` — its vitest (A).
- [`packages/shared/src/domain/agent-command.ts`](../../../packages/shared/src/domain/agent-command.ts) — `AgentCommandId` lifted out of the renderer, re-exported from `ui-store.ts` (A).
- [`packages/desktop/src/main/runs/verify.ts`](../../../packages/desktop/src/main/runs/verify.ts) — the sensor call and the per-repo queue (B).
- [`packages/desktop/src/main/runs/loop-driver.ts`](../../../packages/desktop/src/main/runs/loop-driver.ts) — the cadence, in main (C).
- [`packages/desktop/src/main/runs/index.ts`](../../../packages/desktop/src/main/runs/index.ts) — the four-store merge (D).
- `packages/desktop/src/main/ipc/runs-handlers.ts` — `mstudio:runs:*` and `mstudio:loops:driver:*` (C, D).
- `packages/app/src/features/sessions/runs-tab.tsx` · `runs-detail.tsx` — the surface (D).
- [`scripts/skills-sync-check.mjs`](../../../scripts/skills-sync-check.mjs) + `scripts/skills-sync-check.test.mjs` — the drift gate (E).

**Changed**
- [`packages/shared/src/loops.ts`](../../../packages/shared/src/loops.ts) — `verifiable` on `LoopDefinitionSchema` (`:510`), `nextAction` as a pure function, `loopScheduleFragment` (`:450`) deliberately left alone (B, C).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — the `runs` and `loops:driver` channel blocks (C, D).
- [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) — `knowledge.find`, `knowledge.neighbours` in `MCP_TOOLS` (G).
- [`packages/desktop/src/main/mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts) — their handlers (G).
- [`packages/knowledge/src/projection.ts`](../../../packages/knowledge/src/projection.ts) — `nodesForPaths`, and the find/neighbour primitives the MCP handlers call (G).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `loopVerifySuite`, `loopMaxIterations`, `loopStopOn`; `AgentCommandId` re-export (A, B, C).
- [`packages/app/src/features/loops/loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx) · [`loop-history.tsx`](../../../packages/app/src/features/loops/loop-history.tsx) · [`loop-tab.tsx`](../../../packages/app/src/features/loops/loop-tab.tsx) — the suite picker, the verdict pill, the arm switch (B, C).
- [`packages/app/src/features/sessions/sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx) — the Runs tab beside the existing lists (D).
- [`packages/app/src/features/settings/settings-pages/agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx) — the Skills tally section (F).
- [`packages/app/src/features/knowledge/knowledge-filters-store.ts`](../../../packages/app/src/features/knowledge/knowledge-filters-store.ts) — the run-footprint highlight set (G).
- [`packages/app/src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx) — "four agent loops" → six (E).
- [`moon.yml`](../../../moon.yml) · [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — the `skills-check` task and its gate step (E).
- [`.agents/skills/`](../../../.agents/skills) · [`.codex/skills/`](../../../.codex/skills) — the ported `cleanup.sh` symref fix and the `midnite-create` path (E).
- [`templates/midnite/README.md`](../../../templates/midnite/README.md) · `templates/midnite/.template-version` — twelve → thirteen, `1.0.0` → next (E).
- [`CLAUDE.md`](../../../CLAUDE.md) · [`AGENTS.md`](../../../AGENTS.md) · [`GEMINI.md`](../../../GEMINI.md) — one new convention bullet, all three (H).

## Verification

- [ ] `moon run :typecheck :lint :test` green; `root:tracker-check` and `root:skills-check` exit 0.
- [ ] `node scripts/skills-sync-check.mjs --check` exits 0 on a clean tree, and exits 1 with a named
      file and a diff when one mirror is edited by hand — verify both directions.
- [ ] The normaliser does not hide the real drift: temporarily revert the `cleanup.sh` symref fix in
      `.claude` only and confirm the gate fires.
- [ ] A loop with **no** suite configured behaves byte-identically to today: same composed prompt,
      same `autoSend: true`, same record written, no verify, no driver.
- [ ] An armed loop with `stopOn: 'pass'` stops after the first green verdict and writes exactly one
      `exited` record per iteration.
- [ ] A verify against an **untrusted** suite spawns nothing and records `unavailable` / `untrusted`.
- [ ] The verdict's failure block reaches iteration *n+1*'s prompt, redacted, capped, and visible in
      the run detail exactly as it was sent.
- [ ] Closing the window while a loop is armed disarms the driver and records `abandoned` — no
      orphaned pty, no record left `running` after a relaunch.
- [ ] The Runs tab lists runs from all four sources on a repo that has loop, council, workflow and
      plain agent-session history; each row's commits match what `git log` attributes to that session.
- [ ] `knowledge.find` / `knowledge.neighbours` appear in `tools/list`, both `readOnly: true`, both
      refuse a repo with no `graphify-out/`, and the write-queue spy still records zero calls.
- [ ] The run-footprint filter highlights a plausible set on this repo's own graph, and reports
      unmatched paths rather than dropping them.
- [ ] `idle-cpu.mjs --blurred` with the driver armed and idle is within noise of the disarmed
      reading; `startup-report.mjs --runs=5` median unmoved.
- [ ] **Human pass** — the failing-test loop described in Theme H, on the packaged app, once.
- [ ] **Human pass** — read the ported mirror diffs (Theme E) line by line before merging; a
      normaliser that flattens a real difference is the one failure mode of this gate.

## Not in this phase

- **An LLM judge / inferential sensor.** Decision 5. The whole "is this code *good*" half of harness
  engineering is deliberately absent; only reproducible, computational verdicts ship.
- **A node/edge agent-workflow orchestrator.** Decision 6 — Workflows ([Phase 43](phase-43-workflows-mvp.md))
  and Councils ([Phase 34](phase-34-agent-councils.md)) already occupy that ground.
- **Migrating `loop-runs.json` / the councils store / `workflow-runs` onto one file.** Decision 2.
- **Runtime discovery of `.claude/skills/`, a skills picker, or reading `~/.claude/skills`.**
  Decision 3.
- **Running, refreshing or scheduling `graphify` from the app.** [Phase 87](phase-87-knowledge-graph-panel.md)
  Decision 4, unamended. Decision 7.
- **MCP repository writes.** [Phase 57](phase-57-mcp-server.md) Decision 5 still stands.
- **Token, cost or context-window telemetry per run.** Decision 8.
- **Worktree-per-iteration isolation.** Loop-engineering's "worktrees" pillar is real and this app
  has the machinery — but an iteration that runs in a worktree the user cannot see, and a verify that
  runs a suite there, is a second large design. Named here so it is a decision later, not an omission.
- **Skill versioning as a field in the frontmatter.** The gate compares content; a semver per skill
  is only worth adding once something consumes it.
- **A sub-agent verifier** (loop engineering's "ideation vs verification" split). The verifier in
  this phase is a test suite, on purpose.

---

## Decisions / open questions

1. **Resolved — the phase is the feedback edge, not a tour of four disciplines.** The brief named
   four topics and the honest reading of the tree is that they share one gap. A phase with a theme
   per discipline would have been four unrelated features; every theme here either produces, checks,
   stores or reads the same run record. **Rejected:** a survey phase; a "skills" phase alone (too
   small to matter); a "graph" phase alone (Phases 87/89 have it covered for humans, and the
   remaining value is for agents, which needs Theme A's context to be worth anything).

2. **Resolved — one vocabulary, four stores.** `AgentRun` is a *projection* over the four existing
   ledgers, not a fifth file, and nothing on disk moves. The cost is real and accepted: four caps
   (200 each) rather than one, and a query that touches four files. The alternative — migrating three
   persisted JSON formats in the same phase that introduces the thing they migrate to — risks losing
   real user history to a schema written the same week. Revisit once the shape has survived a few
   months.

3. **Resolved — no runtime skill discovery, working within Phase 92's decision rather than reversing
   it.** Phase 92 settled that `AgentCommandId` / `AGENT_COMMANDS` / `DEFAULT_AGENT_SKILLS` is the one
   runtime catalogue and verified nothing scans `.claude/skills/` today;
   [`agent-page.tsx:579-587`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx)
   argues the same case in the code. This phase agrees and does not reopen it. Two consequences it
   accepts out loud: the app cannot tell a valid user-level skill (`/pr-review`) from a typo, which is
   why Theme F ships a **hint** and not a validation error; and the drift gate is therefore a
   build-time script, which is the right place for it anyway — a check that only fires when someone
   opens the app is not a gate.

4. **Resolved — the driver lives in main.** A renderer timer is throttled when hidden, dies on
   reload, and duplicates itself across windows ([Phase 55](phase-55-multi-window-studio.md)). A loop
   exists to run while you are not looking. **Rejected:** a renderer `setInterval` (cheaper, wrong);
   a detached helper process like the pty broker (right shape, far too much machinery for a timer,
   and the broker's own build-fingerprint problem is not one to duplicate).

5. **Resolved — computational sensors only; no model judges a model here.** For the record, the
   repo has **no eval harness, scorer, rubric or golden set of any kind** — verified, not assumed:
   no `eval*` directory anywhere under `packages/`, and every file in `scripts/` is app-level
   gating. The closest thing is
   [`main/council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts), which runs N
   agents on one prompt and synthesises their answers while **scoring nothing** — no rubric, no
   reference answer, no pass/fail, no metric beyond `startedAt`/`endedAt`. So this phase is not
   choosing computational over inferential; it is building the first sensor of either kind.
   Fowler's split between
   computational (deterministic, seconds) and inferential (a judging model) controls is the one this
   phase acts on: a verdict must be something the user can reproduce at their own shell. An LLM
   reviewer is a genuinely good idea and a genuinely separate phase — it needs a cost model, a
   consent model and an answer to "what happens when the judge is wrong", none of which belong under
   a heading about loops.

6. **Resolved — "graph engineering" means two different things and this doc says which.** The
   execution-topology sense (nodes, edges, declared paths, *"who decides the path, the agent or
   you"*) already has a home in Workflows and Councils; building a second orchestrator beside them
   would be the worst outcome of taking the term literally. The sense this phase acts on is the
   *knowledge* graph — which is a different object that shares a word, exactly as
   [Phase 87](phase-87-knowledge-graph-panel.md) had to say about the commit graph. Theme G makes it
   readable by agents rather than only by humans.

7. **Resolved — the app still does not run `graphify`.** Theme G would be more useful with a
   rebuild button and it does not get one. [Phase 87](phase-87-knowledge-graph-panel.md) Decision 4's
   reasoning (owning a long-running child process, what happens when the repo switches mid-build) has
   not changed, and nothing here needs it: reading a stale graph and *saying it is stale* is strictly
   better than what agents do today, which is shelling out to a CLI that may not be installed.

8. **Resolved — no token or cost telemetry.** Grounded rather than assumed: a grep for
   `tokensUsed|inputTokens|totalCost|costUsd` across `packages/` returns **zero**, and no session or
   run schema carries a `usage` field. That is the right state. The app starts a CLI in a pty and
   reads bytes ([`broker/server.ts`](../../../packages/desktop/src/broker/server.ts) is
   `Uint8Array` end to end — no JSON mode, no tool-call extraction); it has no access to the
   agent's token accounting, and a number inferred from transcript length would be wrong in a way
   that looks authoritative. Duration, exit code and verdict are things the app actually knows.

9. **Resolved — Runs is a tab, not a view.** Twenty-two `ViewId`s is already a long rail. A run
   belongs to a session; Phase 86 already made `sessions` the place where live and closed sessions
   meet. **Rejected:** a `runs` ViewId (a 23rd rail row for a list most users open weekly); putting
   it on the dashboard (too small to be the whole surface, and Phase 78 Theme F already owns the
   dashboard's agent-share tile).

10. **Open — what `stopOn: 'pass'` should do when the suite was already green before the run.** A
    loop armed `until-green` against a repo that is already green stops after one iteration having
    done nothing, which is either correct or useless depending on the loop. Recommendation: record
    the verdict, stop, and say *"already green — nothing to do"* in the run detail, because the
    alternative (a pre-run baseline verify on every iteration) doubles the suite cost to answer a
    question the user can see. Settle in Theme C.

11. **Open — how many iterations of failure before the driver gives up by default.** `consecutiveFailures >= N`
    needs an `N`. Recommendation: **3**, and make it a setting rather than a constant, because the
    honest answer varies by loop — a `medic` loop failing three times means something different from
    an `innovate` loop failing three times.

12. **Open — whether a verified run should block on a dirty index.** The suite runs against the
    worktree as the agent left it, which is deliberate (Theme B), but a half-staged change can make a
    suite fail for reasons that are not the agent's. Recommendation: leave it, record the dirty state
    on the verdict so the run detail can say so, and do not stash. Stashing inside a verification is
    a write into the user's tree that they did not ask for.

13. **Noted, not acted on — the harness config has already drifted between agents.**
    [`.claude/settings.json`](../../../.claude/settings.json) runs `graphify hook-guard search` on
    `Bash|Grep` and `graphify hook-guard read` on `Read|Glob`; [`.codex/hooks.json`](../../../.codex/hooks.json)
    runs `graphify hook-check` on `Bash` alone; `.agents/` has no hook file at all and instead carries
    `rules/graphify.md` and `workflows/graphify.md` with no counterpart in the other two trees. Theme
    E's gate covers `skills/` only — the hook configs are genuinely per-CLI schemas and cannot be
    normalised the same way. Flagged here so the next person to touch them knows the three are not
    equivalent today.

14. **Noted — this doc was written without a human in the loop.** The brainstorm skill's option
    sheets (Stages 2-4) were skipped by instruction; the alternatives above are the ones that were
    generated and rejected in reasoning rather than offered. The three source URLs could not be
    retrieved (see the framing table) and nothing is attributed to them. Both facts are the reason
    Decisions 10-12 are left open rather than settled: they are the calls a human should make.
