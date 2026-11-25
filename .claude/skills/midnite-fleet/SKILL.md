---
name: midnite-fleet
description: A fleet of agents, each building its own separate task — fan /midnite-build out across several phases (or ad hoc tasks) at once, one background subagent per task capped to a chosen theme count, with recurring sitreps until every PR has merged. Formerly midnite-swarm. Reached through /midnite-agents (its default) or invoked directly.
argument-hint: "[optional: phases/tasks, themes-per-task, sitrep interval, model, cap, rotate=<P>%|<N>k|off]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, TodoWrite, Agent, ToolSearch, CronCreate, CronDelete, ListAgents, SendMessage, TaskStop, Skill
---

**Fleet** = many agents, **separate** tasks: each owns its own phase or ad hoc task end to end, in its
own worktree, to its own merged PR. (Many agents on **one** problem is `/midnite-swarm`.)

This skill picks *which* tasks run and *how much* each takes on, then hands the run to
[`/midnite-orchestrate`](../midnite-orchestrate/SKILL.md), which owns the settings interview, the
cap, the board, launch rules, sitreps, rotation, unsticking and wrap-up. It does not reimplement
`/midnite-build`: every worker invokes it directly and inherits its rules.

**Conversation style — enforced.** Terse; results, not intentions; tables over prose.

## 0 · Run the script first

Run `scripts/skills/orchestrate-cap.sh --running <n>` before each spawn, `scripts/skills/worktree-lifecycle.sh create <slug>` per task, `node scripts/skills/sitrep.mjs table --worktrees` each tick (rows for units with no PR come from their scratchpads), `orchestrate-cap.sh --running <n> --queued <q> --chart` for the cap line and machine block, `worktree-lifecycle.sh sweep --apply` at wrap-up. They give the cap line, the worktrees and the sitrep table. You still run the interview and own the board and merges (see midnite-orchestrate). Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## 1 · Scope — option sheets, as many pages as it takes (skip what `$ARGUMENTS` answers)

Scan the forge — `node scripts/skills/tracker.mjs candidates` lists every open theme of every open phase as `ready`, `claimed`,
`in PR #n` or `blocked by #n`; offer only the `ready` ones (no issue bodies yet). Present them as
`AskUserQuestion` checkboxes (`multiSelect: true`): up to 4 options per question and up to 4
questions per page, so 16 per page; keep paging until every candidate has been offered. The human
may describe an ad hoc task via "Other". The roster is everything checked; nothing checked → ask
again, never guess.

## 2 · Size per task (skip if answered)

One question for the whole batch:
- `A theme or two [XS–S, fastest]` (Recommended)
- `Up to a size cap` — default no theme over `[L · 4–8h]`
- `All open, unblocked themes` — `/midnite-build`'s own batching

## 3 · Run settings

Invoke `/midnite-orchestrate` §1 with the roster and this model recommendation per task: **sonnet**
for a refined phase with spec'd themes, **opus** for an unrefined or judgment-heavy one, **haiku**
for mechanical chores (renames, doc sweeps). Done criterion: the task's PR is squash-merged.

## 4 · Worker brief (orchestrate adds its standing rules)

Each worker:
- Invokes `Skill({skill: "midnite-build", args: "<phase>"})` (or `midnite-build-adhoc` for an ad
  hoc task) for **that task only**, capped to §2.
- Runs unattended: skips `/midnite-build`'s own questions, takes the conventional choice or the
  phase issue's *Decisions*, and records what it chose in the PR body.
- Claims its theme sub-issue on GitHub before branching (`node scripts/skills/tracker.mjs claim <n>`);
  writes what landed into its phase issue's `## Headlines` (`node scripts/skills/tracker.mjs headlines <phase> --theme X --text …`), and its PR closes the sub-issue.
- Uses a worktree slug that cannot collide: `.worktrees/p<N>-<letters>`.
- Opens the PR as a draft, self-reviews with `/midnite-check-yourself`, readies it, watches CI.

Then follow `/midnite-orchestrate` §2–§8. The sitrep's Task column is the phase/task with its PR link.
