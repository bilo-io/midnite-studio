---
name: midnite-swarm
description: A swarm of agents attacking one problem from different angles — research, plan, design, refine, dev, review, test, report — each stage its own subagent, handing work forward through a shared board, with recurring sitreps until the report is out. Reached through /midnite-agents or invoked directly. (The old "one agent per phase" behaviour is now /midnite-fleet.)
---

**Invoke with:** [optional: the problem (text or link), stages, sitrep interval, models, cap, rotate=<P>%|<N>k|off]

**Swarm** = many agents, **one** problem: each takes a different aspect of it, and their outputs
feed each other. (Many agents on separate tasks is `/midnite-fleet`.)

This skill sets the problem, the stages and how they hand off, then hands the run to
[`/midnite-orchestrate`](../midnite-orchestrate/SKILL.md) for the settings interview, cap, board,
launch rules, sitreps, rotation, unsticking and wrap-up.

**Conversation style — enforced.** Terse; results, not intentions; tables over prose.

## 1 · The problem (skip if the invocation gives it)

Ask for it in one line: a description, an issue or PR link, a phase number, or a doc. Restate it as
a one-sentence **goal** plus a **done** line (what must be true at the end), and write both at the
top of the board.

## 2 · Stages — option sheet

One question page, two multi-select questions, every option recommended by default:

| Question | Options |
|---|---|
| **Discovery** | Research · Plan · Design · Refine |
| **Delivery** | Dev · Review · Test · Report |

Unticked stages are skipped; their inputs come from what the human already supplied.

## 3 · The stage graph

| Stage | Model | Does | Writes | Starts when |
|---|---|---|---|---|
| Research | sonnet | Sweeps code (graphify first), docs, issues, prior PRs; no edits | `research.md`: findings with `file:line` | at once |
| Design | opus | 2–3 options for the UI or architecture, trade-offs, a pick | `design.md` (+ shots in `/tmp/midnite-shots-<run>/`) | at once, beside Research |
| Plan | opus | The build broken into slices with acceptance criteria; a phase doc when it belongs in the tracker (`/midnite-plan`) | `plan.md` or `phase-N-*.md` | Research done (and Design, if picked) |
| Refine | sonnet | Resolves open decisions, tightens criteria (`/midnite-refine`) | the plan, refined | Plan done |
| Dev | sonnet | Builds the plan in a worktree, one PR per slice (`/midnite-build` or `-adhoc`); independent slices run as parallel Dev agents within the cap | draft PR(s) | Plan (or Refine) done |
| Review | opus | `/midnite-pr-review` in-session on each PR; findings to the board | `review-<pr>.md` | each Dev PR opened |
| Test | sonnet | Acceptance criteria end to end: vitest, e2e where a browser is needed, screenshots | `test-<pr>.md` | beside Review |
| Report | haiku | Goal, what landed, evidence, open items — published as an Artifact | `report.md` + link | everything above done |

Stage artifacts live in `<session scratchpad>/swarm-<slug>/`. A stage starts when its inputs are
marked done on the board; stages without a dependency between them run in parallel within the cap.

**Feedback loop.** CRITICAL or WARNING findings from Review or Test go back to the Dev agent that
owns the PR (a message), which fixes, pushes and ticks them off. At most **two** rounds, then
the orchestrator decides or asks. A PR is ready (`gh pr ready`) only once Review is clean for its
current diff, and merges on green.

## 4 · Run settings

Invoke `/midnite-orchestrate` §1 with the stage roster and §3's model column as the recommendation.
Done criterion: Report published, every Dev PR merged or explicitly parked.

## 5 · Worker brief (orchestrate adds its standing rules)

Each stage agent gets: the goal and done line; its row of §3; the paths of its inputs and its
output; "read-only" for Research, Design and Review (no commits to the repo); a worktree under
`.worktrees/sw-<slug>-<stage>` for Dev; and the instruction to mark its artifact `Status: done` at
the top and append one line to the board when it finishes.

Then follow `/midnite-orchestrate` §2–§8. The sitrep has one row per stage (and per Dev slice), and
adds the `graph` view so the hand-offs are visible.
