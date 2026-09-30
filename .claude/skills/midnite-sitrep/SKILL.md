---
name: midnite-sitrep
description: Post the standing sitrep table for whatever is in flight — swarm subagents, an execution plan's PRs, or a named set of PRs — one row each with a clickable PR link, a progress bar, an ETA, a 🟩/🟥/📄 line diff and an emoji status. Read-only. Use when the user says "sitrep", asks for status or "where are we", or a recurring status tick fires.
argument-hint: "[optional: PR numbers/URLs, a plan name, or a repo — defaults to what this session has in flight]"
allowed-tools: Bash, Read, Glob, Grep, ListAgents
---

The one format every status report takes — ad hoc or on a recurring tick — so the user can diff
one table against the last at a glance. **Read-only**: this skill changes nothing, posts nothing,
and messages no one. It reports.

**Conversation style — enforced.** The table is the report. Nothing above it. At most two lines
under it: the whole-batch line (below), plus one line only for a decision the user owes or a
failure the table cannot carry.

## 1 · What the rows are

Take the scope from `$ARGUMENTS` if given (PR numbers or URLs, a plan name, a repo). Otherwise,
the rows are whatever **this session** has in flight, in this order of preference:

1. The subagents it launched (`ListAgents`), each keyed by the thing it owns.
2. The tasks of the execution plan it is driving — every task, including ones not started, so
   the table shows the whole plan, not just the live part.
3. The PRs it opened.

If there is still nothing to report, say so in one line instead of posting an empty table.

One row per agent or task, identified by what it owns (phase, task id, PR) — never by an internal
agent id.

## 2 · Gather — external state, not self-reports

Fetch every PR in one pass per repo, all calls in one shell invocation:

```bash
gh pr view <n> -R <owner>/<repo> --json number,url,title,state,isDraft,mergeable,mergedAt,baseRefName,reviewDecision,additions,deletions,changedFiles,statusCheckRollup
```

Pass the right account's token in the same command (`GH_TOKEN="$(gh auth token -u <user>)" gh …`)
when the repo's owner is not the active `gh` account — never `gh auth switch`.

For a row with no PR yet, the evidence is the worktree: does it exist, is there a diff, and what
do the **Done** / **Next** lines in `.worktrees/*/SCRATCHPAD.md` say (when the repo keeps
scratchpads). A subagent reporting "done" with no PR, or a **Next** line that has not moved in two
ticks, is stalled — mark it ⚠️, whatever it last said.

## 3 · The table

| Task | Progress | ETA | Diff | Status | Notes |
|---|---|---|---|---|---|
| [PR-1 · #1259](https://github.com/org/repo/pull/1259) | `████████░░` 80% | ~2h | 🟩 +1515 🟥 -28 📄 17 | 🟢 Ready · CI 7/7 | tell me before merging — #1261 stacks on it |
| [PR-3 · #1261](https://github.com/org/repo/pull/1261) | `███████░░░` 70% | ~15m | 🟩 +0 🟥 -4 📄 4 | 🟡 CI 3/5 · stacked on #1259 | — |
| [TASK-A · #1251](https://github.com/org/repo/issues/1251) | `░░░░░░░░░░` 0% | ? | — | ⏳ Waiting on PR-1 deploy | — |

- **Task** — the row's name, **always a clickable link**: to its PR once one exists, else to its
  issue, else the branch name in code. Link text is `<task> · #<n>`.
- **Progress** — a 10-cell bar in backticks, then the percentage: `█` × round(% / 10), `░` for the
  rest. Unknown is `░░░░░░░░░░` `?`, never blank. Derive it from observable state, on this scale:

  | % | State |
  |---|---|
  | 0 | not started |
  | 10–50 | building — worktree exists, commits landing, by stages done |
  | 60 | PR open as a draft |
  | 70 | PR ready, CI running |
  | 80 | PR ready, CI green, awaiting review |
  | 90 | merged |
  | 100 | deployed or verified — or merged, where merging is the last stage |

- **ETA** — wall-clock time until the row reaches 100%, from *observed* pace (elapsed time against
  the % so far, this session's real CI durations, stages left) — never an agent's own claim. `?`
  with no basis yet, `done` at 100%. A row waiting on a human (review, merge, deploy) is `?` with
  the reason in Status.
- **Diff** — `🟩 +<additions> 🟥 -<deletions> 📄 <changedFiles>`, straight from the PR. `—` with no
  PR. A stacked PR's diff is against its base branch; say "stacked on #n" in Status.
- **Status** — one emoji, then a few words:

  | Emoji | Meaning |
  |---|---|
  | ⬜ | not started |
  | 🚧 | building, or draft PR |
  | 🟡 | CI running |
  | 🔴 | CI failing, or merge conflict |
  | 🟢 | ready — CI green, awaiting review |
  | 💬 | changes requested, or unresolved threads |
  | ⏳ | blocked on another row or on a human step |
  | ⚠️ | stalled subagent |
  | 🟣 | merged |
  | ✅ | done — deployed, verified, or merged as the last stage |

  Add the CI count as `CI <passed>/<total>` whenever checks exist.
- **Notes** — what changed since the last sitrep, what it is blocked on, what it handed another
  row. Empty is `—`.

## 4 · Under the table

One line for the whole batch: an overall bar over every row (the mean %) and the ETA until
*all* of it is done — parallel rows do not add, a later wave does:

`████████░░░░░░░░░░░░ 40% overall · 5/8 in review · all done ~?, waiting on review`

Then, only if there is one, a single line naming the decision the user owes.

## 5 · Recurring ticks

On a recurring schedule, each tick is this same table and nothing more. When every row is at
100% (or the scope the user named is done), post the final table and cancel the recurring job
that drives the ticks — do not leave it running past the work it was scoped to.
