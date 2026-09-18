---
name: midnite-swarm
description: Fan /midnite-create out across several phases (or ad hoc tasks) at once, each in its own background subagent capped to a chosen theme count, then post a recurring sitrep until every subagent has merged.
---

**Invoke with:** [optional: phases/tasks, themes-per-phase, sitrep interval, model/provider]

Fan-out orchestration on top of `/midnite-create` for **this project** — one subagent per phase,
running in parallel, with a recurring status report until they all land.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of
these instructions, no narrating what you're *about* to do. Report results, not intentions;
bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not
commentary.

## Respect

This skill does not reimplement `/midnite-create` — every spawned subagent invokes it directly and
inherits its own rules (`GEMINI.md` conventions, the `.midnite/tasks/` tracker, worktree-per-batch,
the pre-push gate, PR conventions). This skill's own job is narrower: pick *which* phases run, cap
*how much* each one takes on, launch them in parallel, and keep watch. Read
[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md) yourself in Stage 1 — **Pass 1
only** (`_INDEX.md`, no `phase-*.md`). Phase docs are Pass 2 inside each spawned `/midnite-create`,
not here. This skill does not get to skip the scan just because it delegates the build.

## 1 · Scope — a direct question to the human (skip whatever the invocation already answers)

If the invocation doesn't already name which phases or tasks to run, scan `_INDEX.md` for
candidates exactly like `/midnite-create` Stage 1 **Pass 1** (index columns only — do not open
`phase-*.md` to pick the list; `gh pr list --state open` to skip anything already in flight). Present up to 6 candidates as a grouped
multi-select — each option a phase (or a named ad hoc task, if the human describes one instead of
a phase number). The batch is every phase/task checked. If nothing is checked, stop and ask again
rather than guessing.

## 2 · Batch size per subagent — a direct question (skip if already answered)

Ask, once, for the whole batch (not per phase — one answer applies to all of it unless the human
says otherwise): how much should each subagent take on? Offer as a choice:
- `A theme or two [XS-S, fastest]` — the smallest unblocked slice per phase.
- `Up to a size cap (e.g. no single theme past L)` — ask what cap, or default to no theme over
  `[L · 4-8h]`.
- `All open, unblocked themes` — the whole phase in one PR, `/midnite-create`'s own default batching.

This becomes an instruction inside each subagent's own prompt (Stage 4) — the subagent still reads
its phase doc and index row itself and picks the *specific* themes within that cap.

## 3 · Sitrep interval — a direct question (skip if already answered)

Ask how many minutes between recurring status reports (suggest 10 as a default if the human has no
preference). This is the cadence for Stage 5, not a per-subagent setting.

## 4 · Model / provider — a direct question (skip if already answered)

Ask which model or provider runs the subagents, using whatever choice your own CLI's parallel-agent
mechanism actually exposes (a model name, a provider, or "same as this session" if there is no
separate choice to make). Don't invent an option your CLI doesn't have.

## 5 · Launch — one subagent per phase, all in parallel

For each phase/task in the batch, spawn one background agent using your CLI's own
parallel-subagent mechanism, passing the requested model/provider if your CLI supports selecting
one — launch every one of the batch's subagents together rather than serially, so they actually run
concurrently. Each subagent's prompt must be self-contained (it starts with none of this
conversation's context) and must instruct it to:

- Invoke the `midnite-create` skill for **that phase only**, capped to the Stage 2 theme/size limit.
- Skip any interactive prompt at `/midnite-create`'s own Stage 2 and 2.5 — it is running unattended.
  Pick themes and design defaults itself (most conventional choice, or whatever the phase doc's own
  *Decisions* section already recommends) and record what it chose and why in the PR body instead
  of asking.
- Still do Stage 2.7's claim in `_INDEX.md` on `main` before branching, and handle a push race with
  `git pull --rebase origin main`.
- Use a worktree slug that can't collide with a sibling subagent's, e.g. `.worktrees/p<N>-<letters>`.
- **Keep its worktree's `SCRATCHPAD.md` current** — `/midnite-exec`'s worktree stage writes one at
  the root. An unattended subagent is the case that file exists for: when one is killed it leaves
  nothing else behind, and the scratchpad is what lets this session or a replacement pick the phase
  up from where it actually stopped. Update it after each commit and at each stage boundary, and
  never commit it.
- **Actually watch CI to completion** rather than ending its turn with checks still pending — this
  is the single most common way a swarm subagent stalls. On a real failure, check whether the
  failing test touches files the PR changed; if not, treat it as a pre-existing flake, re-run the
  failed job once, and re-check before escalating.
- **Commits carry no attribution trailer.** GitHub credits such a commit to whichever account claims the trailer's email, which is how a solo repo grows contributors who never pushed a byte. PR bodies follow whatever the parent session uses.
- Report back its PR URL and what landed vs. what it left open, once merged.

## 6 · Sitrep — recurring, until every subagent has merged

Schedule the recurring check at the Stage 3 interval using your CLI's own scheduling facility, or
self-pace by checking back after the requested interval if it has none.

Each tick, post **one table and nothing else above it** — this is `GEMINI.md`'s own "Sitrep"
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

## 7 · Babysitting a stuck subagent

A background subagent can report done after genuinely doing nothing, or stop mid-poll while its
own PR's CI is still pending with nothing left watching it. Neither is actually done. On every
sitrep tick, cross-check each subagent's *external* state (`gh pr view <n> --json
state,mergedAt`, `gh pr checks <n>`) against what it last reported:

- If its PR is open with CI resolved (pass or fail) and it isn't currently running: message it to
  finish the remaining `/midnite-create` stages (fix-and-repush on a real failure, or merge + teardown
  once green).
- If it keeps re-stalling after being resumed once or twice, stop delegating and finish the
  remaining stages yourself directly (mark the PR ready, watch/rerun CI, squash-merge, worktree
  teardown, freed-space report) rather than burning further turns bouncing messages at it.
- If a subagent is dead and unreachable, its worktree's `SCRATCHPAD.md` is the handover it left:
  read it end to end, then finish the remaining stages yourself from its **Next** line rather than
  re-deriving the work or restarting the phase from scratch.

## 8 · Wrap-up

Once every subagent's PR is merged (or a real, reported blocker stands and can't be resolved
further), post a final summary table, cancel the recurring sitrep job, and stop. Do not leave a
recurring job running past the batch it was scoped to.

---
Autonomous through Stages 5–8 once the human has answered Stages 1–4. Stop only for a real
decision: a subagent reports a genuine blocker (credential/secret it doesn't have, CI it can't fix
after real attempts), or a new phase/task needs adding to the batch mid-run.
