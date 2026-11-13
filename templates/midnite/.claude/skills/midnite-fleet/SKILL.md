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

## 1 · Scope — option sheets, as many pages as it takes (skip what `$ARGUMENTS` answers)

Scan `.midnite/tasks/_INDEX.md` — **Pass 1 only**, its `## Phases` table; no `phase-*.md` — for
unblocked candidates, and `gh pr list --state open` to skip anything in flight. Present them as
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
  phase doc's *Decisions*, and records what it chose in the PR body.
- Claims its row in `_INDEX.md` on `main` before branching (`git pull --rebase origin main` on a push
  race); writes what landed into its phase doc's `## Headlines`, touching only its own index row.
- Uses a worktree slug that cannot collide: `.worktrees/p<N>-<letters>`.
- Opens the PR as a draft, self-reviews the diff with the repo's own review step, readies it, watches CI.

Then follow `/midnite-orchestrate` §2–§8. The sitrep's Task column is the phase/task with its PR link.
