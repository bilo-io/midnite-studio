---
name: midnite-exec-swarm
description: Fan /midnite-exec out across several phases (or ad hoc tasks) at once, each in its own background subagent capped to a chosen theme count, then post a recurring sitrep until every subagent has merged.
argument-hint: "[optional: phases/tasks, themes-per-phase, sitrep interval, model]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, TodoWrite, Agent, ToolSearch, CronCreate, CronDelete, ListAgents, SendMessage
---

Fan-out orchestration on top of `/midnite-exec` for **this project** — one subagent per phase,
running in parallel, with a recurring status report until they all land.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of
these instructions, no narrating what you're *about* to do. Report results, not intentions;
bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not
commentary.

## Respect

This skill does not reimplement `/midnite-exec` — every spawned subagent invokes it directly and
inherits its own rules (`CLAUDE.md` conventions, the `.midnite/tasks/` tracker, worktree-per-batch,
the pre-push gate, PR conventions). This skill's own job is narrower: pick *which* phases run, cap
*how much* each one takes on, launch them in parallel, and keep watch. Read
[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md) yourself in Stage 1 the same way
`/midnite-exec` Stage 1 does — this skill does not get to skip the scan just because it delegates
the build.

## 1 · Scope — STOP for the human (skip whatever `$ARGUMENTS` already answers)

If `$ARGUMENTS` doesn't already name which phases or tasks to run, scan `_INDEX.md` for candidates
exactly like `/midnite-exec` Stage 1 (open, unblocked `◻ TODO`/`🔄 WIP` themes; `gh pr list --state
open` to skip anything already in flight). Present up to 6 candidates via **one AskUserQuestion,
`multiSelect: true`** — each option a phase (or a named ad hoc task, if the human describes one
instead of a phase number). The batch is every phase/task checked. If nothing is checked, stop and
ask again rather than guessing.

## 2 · Batch size per subagent — STOP for the human (skip if `$ARGUMENTS` already answers)

Ask, once, for the whole batch (not per phase — one answer applies to all of it unless the human
says otherwise): how much should each subagent take on? Offer as an AskUserQuestion with options
like:
- `A theme or two [XS-S, fastest]` — the smallest unblocked slice per phase.
- `Up to a size cap (e.g. no single theme past L)` — ask what cap, or default to no theme over `[L
  · 4-8h]`.
- `All open, unblocked themes` — the whole phase in one PR, `/midnite-exec`'s own default batching.

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

## 5 · Launch — one subagent per phase, all in parallel

For each phase/task in the batch, spawn one background agent (`Agent` tool, `subagent_type:
general-purpose`, `model:` the Stage 4 answer) — send every call for the batch **in the same
message** so they run concurrently, not serially. Each subagent's prompt must be self-contained
(it starts with none of this conversation's context) and must instruct it to:

- Invoke the `midnite-exec` skill (`Skill({skill: "midnite-exec", args: "<phase>"})`) and follow it
  for **that phase only**, capped to the Stage 2 theme/size limit.
- Skip `AskUserQuestion` at `/midnite-exec`'s own Stage 2 and 2.5 — it is running unattended. Pick
  themes and design defaults itself (most conventional choice, or whatever the phase doc's own
  *Decisions* section already recommends) and record what it chose and why in the PR body instead
  of asking.
- Still do Stage 2.7's claim in `_INDEX.md` on `main` before branching, and handle a push race with
  `git pull --rebase origin main`.
- Use a worktree slug that can't collide with a sibling subagent's, e.g. `.worktrees/p<N>-<letters>`.
- **Actually watch CI to completion** (`gh pr checks <n> --watch`) rather than ending its turn with
  checks still pending — this is the single most common way a swarm subagent stalls. On a real
  failure, check whether the failing test touches files the PR changed; if not, treat it as a
  pre-existing flake, `gh run rerun <id> --failed` once, and re-watch before escalating.
- Attribute commits/PRs per this session's configured trailers (same ones the parent session uses).
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

## 7 · Babysitting a stuck subagent

A background subagent can report `completed` after doing genuinely nothing (0 tool calls, an
echoed-back status line), or stop mid-poll while its own PR's CI is still pending with nothing left
watching it. Neither is actually done. On every sitrep tick, cross-check each subagent's *external*
state (`gh pr view <n> --json state,mergedAt`, `gh pr checks <n>`) against what it last reported:

- If its PR is open with CI resolved (pass or fail) and it isn't currently running: `SendMessage`
  it to finish the remaining `/midnite-exec` stages (fix-and-repush on a real failure, or merge +
  teardown once green).
- If it keeps re-stalling after being resumed once or twice, stop delegating and finish the
  remaining stages yourself directly (`gh pr ready`, watch/rerun CI, squash-merge, worktree
  teardown, freed-MB report) rather than burning further turns bouncing messages at it.

## 8 · Wrap-up

Once every subagent's PR is merged (or a real, reported blocker stands and can't be resolved
further), post a final summary table, `CronDelete` the recurring sitrep job (or stop the `loop` if
that's what Stage 6 used), and stop. Do not leave a recurring job running past the batch it was
scoped to.

---
Autonomous through Stages 5–8 once the human has answered Stages 1–4. Stop only for a real
decision: a subagent reports a genuine blocker (credential/secret it doesn't have, CI it can't fix
after real attempts), or a new phase/task needs adding to the batch mid-run.
