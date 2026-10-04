---
name: midnite-swarm
description: Fan /midnite-create out across several phases (or ad hoc tasks) at once, each in its own background subagent capped to a chosen theme count, then post a recurring sitrep until every subagent has merged.
argument-hint: "[optional: phases/tasks, themes-per-phase, sitrep interval, model, rotate=<P>% of the context window (default 30-40%), window=<N>k]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, TodoWrite, Agent, ToolSearch, CronCreate, CronDelete, ListAgents, SendMessage, TaskStop
---

Fan-out orchestration on top of `/midnite-create` for **this project** — one subagent per phase,
running in parallel, with a recurring status report until they all land.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of
these instructions, no narrating what you're *about* to do. Report results, not intentions;
bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not
commentary.

## Respect

This skill does not reimplement `/midnite-create` — every spawned subagent invokes it directly and
inherits its own rules (`CLAUDE.md` conventions, the `.midnite/tasks/` tracker, worktree-per-batch,
the pre-push gate, PR conventions). This skill's own job is narrower: pick *which* phases run, cap
*how much* each one takes on, launch them in parallel, and keep watch. Read
[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md) yourself in Stage 1 — **Pass 1
only** (`_INDEX.md`'s `## Phases` table, which is the whole file; no `phase-*.md`). Phase docs are Pass 2 inside each spawned `/midnite-create`,
not here. This skill does not get to skip the scan just because it delegates the build.

## 1 · Scope — STOP for the human (skip whatever `$ARGUMENTS` already answers)

If `$ARGUMENTS` doesn't already name which phases or tasks to run, scan `_INDEX.md` for candidates
exactly like `/midnite-create` Stage 1 **Pass 1** (index columns only — do not open `phase-*.md` to
pick the list; `gh pr list --state open` to skip anything already in flight). Present up to 6
candidates via **one AskUserQuestion, `multiSelect: true`** — each option a phase (or a named ad
hoc task, if the human describes one instead of a phase number). The batch is every phase/task
checked. If nothing is checked, stop and ask again rather than guessing.

## 2 · Batch size per subagent — STOP for the human (skip if `$ARGUMENTS` already answers)

Ask, once, for the whole batch (not per phase — one answer applies to all of it unless the human
says otherwise): how much should each subagent take on? Offer as an AskUserQuestion with options
like:
- `A theme or two [XS-S, fastest]` — the smallest unblocked slice per phase.
- `Up to a size cap (e.g. no single theme past L)` — ask what cap, or default to no theme over `[L
  · 4-8h]`.
- `All open, unblocked themes` — the whole phase in one PR, `/midnite-create`'s own default batching.

This becomes an instruction inside each subagent's own prompt (Stage 4) — the subagent still reads
its phase doc and index row itself and picks the *specific* themes within that cap.

## 3 · Sitrep interval — STOP for the human (skip if `$ARGUMENTS` already answers)

Ask how many minutes between recurring status reports (suggest 10 as a default if the human has no
preference). This is the cadence for Stage 5, not a per-subagent setting.

## 4 · Model — STOP for the human (skip if `$ARGUMENTS` already answers)

Ask which model runs the subagents. In Claude Code this maps directly to the `Agent` tool's
`model` parameter — offer `sonnet` (default; inherits the parent's model when omitted), `opus`
(higher-effort, slower, costs more — pick for a genuinely gnarly phase), `haiku` (fastest/cheapest,
for small mechanical phases only). If this session is instead running under Codex or Antigravity,
ask the equivalent model/provider choice that CLI itself exposes — do not invent a Claude-specific
option name for a different CLI.

## 4b · Context rotation threshold — a parameter, not a question

Rotation is keyed to the share of each subagent's **context window**, not a fixed token count:
**start the handoff once its current context reaches 30% of its window, and have the fresh agent
running before it reaches 40%.** Do not ask; take an override from the invocation when it names
one (`rotate=25-35%`, `rotate=300k` for an absolute count, `rotate=off` to disable) and otherwise
use the default band. The window is the subagent model's context size: 1M for the current Opus
and Sonnet models, 200k for Haiku. When unsure, `window=<N>k` overrides it. Record the resolved
band on the shared board (e.g. `30–40% of 1M = 300k–400k`) so every tick applies the same numbers.

## 5 · Launch — one subagent per phase, all in parallel

For each phase/task in the batch, spawn one background agent (`Agent` tool, `subagent_type:
general-purpose`, `model:` the Stage 4 answer) — send every call for the batch **in the same
message** so they run concurrently, not serially. Each subagent's prompt must be self-contained
(it starts with none of this conversation's context) and must instruct it to:

- Invoke the `midnite-create` skill (`Skill({skill: "midnite-create", args: "<phase>"})`) and follow it
  for **that phase only**, capped to the Stage 2 theme/size limit.
- Skip `AskUserQuestion` at `/midnite-create`'s own Stage 2 and 2.5 — it is running unattended. Pick
  themes and design defaults itself (most conventional choice, or whatever the phase doc's own
  *Decisions* section already recommends) and record what it chose and why in the PR body instead
  of asking.
- Write what landed into each phase doc's own `## Headlines` theme paragraph, never into
  `_INDEX.md` — the subagent touches only its phase's table row there.
- Still do Stage 2.7's claim in `_INDEX.md` on `main` before branching, and handle a push race with
  `git pull --rebase origin main`.
- Use a worktree slug that can't collide with a sibling subagent's, e.g. `.worktrees/p<N>-<letters>`.
- **Keep its worktree's `SCRATCHPAD.md` current** — `/midnite-exec`'s worktree stage writes one at
  the root. An unattended subagent is the case that file exists for: when one is killed it leaves
  nothing else behind, and the scratchpad is what lets this session or a replacement pick the phase
  up from where it actually stopped. Update it after each commit and at each stage boundary, and
  never commit it.
- **Actually watch CI to completion** (`gh pr checks <n> --watch`) rather than ending its turn with
  checks still pending — this is the single most common way a swarm subagent stalls. On a real
  failure, check whether the failing test touches files the PR changed; if not, treat it as a
  pre-existing flake, `gh run rerun <id> --failed` once, and re-watch before escalating.
- **Commits carry no attribution trailer.** GitHub credits such a commit to whichever account claims the trailer's email, which is how a solo repo grows contributors who never pushed a byte. PR bodies follow whatever the parent session uses.
- **Open visual PRs with their screenshots already in the body.** Capture them with the worker
  skill's Playwright screenshot stage, commit them under `docs/screenshots/<slice>/` with
  commit-pinned raw URLs, and embed them in the body `gh pr create` is called with. Never add
  them after the PR is open. On the first sitrep tick after a visual PR opens, the orchestrator
  checks its body for images. If there are none, Notes says `no screenshots` and the worker is
  sent back to add them before CI finishes.
- **Obey the context-rotation handoff.** When the orchestrator sends `CONTEXT ROTATION`, stop at the
  next safe point (start nothing new), commit and push everything (a `wip:` commit if mid-change),
  write a `## HANDOFF (read first)` section at the top of its `SCRATCHPAD.md` (goal, decisions and
  why, done, PR and CI state with any failing job's cause, the exact next steps in order,
  gotchas, files that matter), reply `HANDOFF READY <worktree path>` and end its turn. It never
  merges or removes its worktree while handing off. Between rotations it keeps its context lean:
  tail logs (`gh run view --log-failed | tail -80`), read files by range, never dump whole outputs.
- Report back its PR URL and what landed vs. what it left open, once merged.

## 6 · Sitrep — recurring, until every subagent has merged

Schedule the recurring check at the Stage 3 interval. Convert minutes to a cron expression
(`*/Nm` for N ≤ 59) and call `CronCreate` with `recurring: true` and a prompt describing the sitrep
task (check `ListAgents` plus `gh pr status`/`gh pr checks` per subagent's branch, post one table,
repeat until every subagent's PR is merged) — or invoke the `loop` skill directly
(`Skill({skill: "loop", args: "<N>m sitrep on ..."})`) if that's already wired up in this session;
either mechanism works, don't set up both.

Each tick, post **one table and nothing else above it** — this is `CLAUDE.md`'s own "Sitrep"
format: one row per subagent, columns `Agent | % | ETA | Doing | Notes`. Percentage is an estimate from
observable state (worktree present? uncommitted diff? PR open? CI pending/green? merged?), never
fabricated from a subagent's own self-report of "done" without checking — see Stage 7. **ETA is the
remaining wall-clock time to that row's merge**, derived the same way: elapsed time against the %
so far, the CI durations actually observed this session, and the stages still ahead (push → CI →
rebase → merge → teardown). `?` until there is a basis, `done` once merged. Under the table, one
line gives the ETA for the whole batch — parallel rows do not add, a later wave does. Bake the ETA
column into the cron/loop prompt so every tick carries it.

**Read the scratchpads before writing the table.** The **Done** and **Next** lines in
`.worktrees/*/SCRATCHPAD.md` are the cheapest ground truth in the swarm — written by the worker,
sitting on disk, surviving its death — and they are what turns a `Doing` cell from "building" into
something the human can act on. They are evidence, not a claim: cross-check each against `gh pr`
state per the next stage, and treat a scratchpad whose **Next** hasn't moved in two ticks as a
stalled subagent, whatever it last reported.

## 6b · Context rotation — a fresh window past the threshold

A subagent's context only grows, and past a few hundred thousand tokens it gets slower, costlier
and sloppier. So on **every sitrep tick**, measure each live subagent's current context and rotate
any that has reached the Stage 4b band (default: start at 30% of its window, done by 40%; one
already past 40% goes first, at its very next safe point):

1. **Measure** from the tail of its transcript (the `output_file` its launch returned) — never read
   the whole file. Current context = the last turn's `input_tokens + cache_read_input_tokens +
   cache_creation_input_tokens`:
   ```bash
   tail -n 200 "$OUT" | grep '"usage"' | tail -1 \
     | jq '(.message.usage // .usage) | (.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)'
   ```
2. **Ask for the handoff.** `SendMessage` it `CONTEXT ROTATION` with what Stage 5's handoff bullet
   asks for. Wait for `HANDOFF READY` (or, if it is parked in a background wait, check its
   `SCRATCHPAD.md` for the `## HANDOFF` section directly).
3. **Close it.** `TaskStop` the old subagent once the handoff is on disk and pushed. Its worktree,
   branch and PR stay exactly as they are.
4. **Start fresh.** Launch a new subagent **without** worktree isolation, pointed at the *existing*
   worktree path, whose whole brief is: work only in that worktree; read `CLAUDE.md`, then
   `SCRATCHPAD.md` starting at `## HANDOFF`; continue from its first next step without redoing
   finished work; the standing rules (token, no trailers, never merge on red, no `pgrep` wait loops,
   don't remove the worktree); and the report it owes at the end. It takes the retired agent's
   concurrency slot — a rotation never counts as an extra agent.
5. **Note it** on the board (`rotated <task> at <N>k → fresh agent`) and in that row's Notes cell.

Rotate at a safe point, not mid-merge: a subagent whose PR is green and merging may finish first.
The orchestrator's own window is the harness's job — `/autocompact <N>k` sets its threshold.

## 7 · Babysitting a stuck subagent

A background subagent can report `completed` after doing genuinely nothing (0 tool calls, an
echoed-back status line), or stop mid-poll while its own PR's CI is still pending with nothing left
watching it. Neither is actually done. On every sitrep tick, cross-check each subagent's *external*
state (`gh pr view <n> --json state,mergedAt`, `gh pr checks <n>`) against what it last reported:

- If its PR is open with CI resolved (pass or fail) and it isn't currently running: `SendMessage`
  it to finish the remaining `/midnite-create` stages (fix-and-repush on a real failure, or merge +
  teardown once green).
- If it keeps re-stalling after being resumed once or twice, stop delegating and finish the
  remaining stages yourself directly (`gh pr ready`, watch/rerun CI, squash-merge, worktree
  teardown, freed-MB report) rather than burning further turns bouncing messages at it.
- If a subagent is dead and unreachable, its worktree's `SCRATCHPAD.md` is the handover it left:
  read it end to end, then finish the remaining stages yourself from its **Next** line rather than
  re-deriving the work or restarting the phase from scratch.

## 8 · Wrap-up

Once every subagent's PR is merged (or a real, reported blocker stands and can't be resolved
further), post a final summary table, `CronDelete` the recurring sitrep job (or stop the `loop` if
that's what Stage 6 used), and stop. Do not leave a recurring job running past the batch it was
scoped to.

---
Autonomous through Stages 5–8 once the human has answered Stages 1–4. Stop only for a real
decision: a subagent reports a genuine blocker (credential/secret it doesn't have, CI it can't fix
after real attempts), or a new phase/task needs adding to the batch mid-run.
