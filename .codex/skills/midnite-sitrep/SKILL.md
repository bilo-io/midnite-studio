---
name: midnite-sitrep
description: Post the standing sitrep for whatever is in flight — swarm subagents, an execution plan's PRs, or a named set of PRs. Defaults to the status table (one row each with a clickable PR link, a progress bar, an ETA, a 🟩/🟥/📄 line diff and an emoji status) and routes to the other views by name — graph, sequence-diagram, histogram, timeline, ci. Read-only. Use when the user says "sitrep", asks for status or "where are we", or a recurring status tick fires; also "which can merge / merge order / dependency graph", "when is it all done", "where is CI stuck" or "what happened when".
---

The one family every status report comes from, ad hoc or on a recurring tick, so the user can
diff one report against the last at a glance. **Read-only:** no view changes anything, posts
anything, or messages anyone. They report.

This skill is the **router and the shared rules**. It defines what the rows are, how they are
gathered, and the vocabulary every view uses. Each view has its own skill with its exact format:

| View | Skill | Answers | When it runs |
|---|---|---|---|
| table | [`midnite-sitrep-table`](../midnite-sitrep-table/SKILL.md) | Where is each row? | **Always**, first |
| graph | [`midnite-sitrep-graph`](../midnite-sitrep-graph/SKILL.md) | What can merge, and in what order? | When asked, or **automatically** when rows depend on each other |
| sequence-diagram | [`midnite-sitrep-sequence-diagram`](../midnite-sitrep-sequence-diagram/SKILL.md) | What happened, when, and who handed off to whom? | When asked |
| histogram | [`midnite-sitrep-histogram`](../midnite-sitrep-histogram/SKILL.md) | Which row is the outlier (size, CI time, age)? | When asked |
| timeline | [`midnite-sitrep-timeline`](../midnite-sitrep-timeline/SKILL.md) | When is all of it done, wave by wave? | When asked |
| ci | [`midnite-sitrep-ci`](../midnite-sitrep-ci/SKILL.md) | Which job is slow, failing or stuck in the queue? | When asked |

## 0 · Routing

- **No view named:** the table, then the graph if any row has a hard dependency on another — a
  stacked base (`baseRefName` is another row's branch) or a plan or phase dependency. Both are
  visible in §2's data. Soft edges (shared files) need a `files` fetch per PR, so they are drawn
  only when the graph is rendered, never used to decide whether to render it.
- **Views named in the arguments** (`/midnite-sitrep 988 timeline ci`): the table first, then
  each named view in the order given. The table is never dropped: it is the anchor the others
  hang off.
- **A sub-skill invoked directly** (`/midnite-sitrep-ci 988`) renders only that view, using
  §1 and §2 below for its rows and data.
- Read each view's skill before rendering it. Formats are exact; do not improvise one from memory.
- **Gather once, render many.** One pass of §2 feeds every view in the report. Fetch the extra data
  a named view needs (its skill says which) in the same pass.

## 1 · What the rows are

Take the scope from the arguments if one is given (PR numbers or URLs, a plan name, a repo).
Otherwise the rows are whatever **this session** has in flight, in this order of preference:

1. The subagents it launched (`ListAgents`), each keyed by the thing it owns.
2. The tasks of the execution plan it is driving. Include every task, including ones not
   started, so the report shows the whole plan and not just the live part.
3. The PRs it opened.

If there is still nothing to report, say so in one line instead of posting an empty view.

One row per agent or task, identified by what it owns (phase, theme, task id, PR). Never use an
internal agent id.

## 2 · Gather — external state, not self-reports

Fetch every PR in one pass per repo, with all calls in one shell invocation:

```bash
gh pr view <n> -R <owner>/<repo> --json number,url,title,author,state,isDraft,mergeable,mergedAt,createdAt,baseRefName,headRefOid,reviewDecision,additions,deletions,changedFiles,statusCheckRollup
```

If the repo's owner is not the active `gh` account, pass the right account's token in the same
command (`GH_TOKEN="$(gh auth token -u <user>)" gh …`). Never run `gh auth switch`.

For a row with no PR yet, the evidence is the worktree:
- Does it exist?
- Is there a diff? Measure it with `git diff --shortstat` against the base branch, e.g. `main`.
- What do the **Done** / **Next** lines in `.worktrees/*/SCRATCHPAD.md` say (when the repo keeps
  scratchpads)?

A subagent that reports "done" with no PR is stalled. So is one whose **Next** line has not moved
in two ticks. Mark it ⚠️, whatever it last said.

## 3 · Shared vocabulary

Every view uses these, so a row reads the same in each.

**Progress**: a 10-cell bar in backticks, then the percentage. Fill `█` × round(% / 10) cells and
`░` the rest. Unknown is `░░░░░░░░░░` `?`, never blank. Complete is `✅ 100%`.

| % | State |
|---|---|
| 0 | not started |
| 10–50 | building: worktree exists, commits landing, by stages done |
| 60 | PR open as a draft |
| 70 | PR ready, CI running |
| 80 | PR ready, CI green, awaiting review |
| 90 | merged |
| 100 | deployed or verified, or merged where merging is the last stage |

**Status emoji**: one per row.

| Emoji | Meaning |
|---|---|
| ⬜ | not started |
| 🚧 | building, or draft PR |
| 🟡 | CI running |
| 🔴 | CI failing, or merge conflict |
| 🟢 | ready: CI green, awaiting review |
| 💬 | changes requested, or unresolved threads |
| ⏳ | blocked on another row or on a human step |
| ⚠️ | stalled subagent |
| 🟣 | Merged, with a capital M. A merged PR keeps this emoji for good; testing and deploys after it are tags |
| ✅ | done: a row with no PR that finished (a verified task, a manual step) |

**State tags** follow the status, joined with ` · `. A state is never a note.

| Tag | Meaning |
|---|---|
| `⛓ #n` | stacked on #n (its base is that PR's branch) |
| `⏸ held` | built on purpose and parked, e.g. a draft waiting on a deploy |
| `🔵 audited` | `/midnite-pr-audit` or `/ekko-pr-audit` ran on it this session |
| `✅ tested` | an acceptance test (`/ekko-test`) passed on it, before or after the merge |
| `🚀 deployed` | the merge is live where it needed to be |

**ETA**: wall-clock time until a row reaches 100%. Derive it from *observed* pace: elapsed time
against the % so far, this session's real CI durations, and stages left. Never use an agent's own
claim. Use `?` when there is no basis yet, and `done` at 100%.

## 4 · Conversation style — enforced

- **The table comes first, with nothing above it.**
- Under the table, at most two lines: the whole-batch line (see `midnite-sitrep-table`) and one
  line, only when needed, for a decision the user owes or a failure no view can carry.
- Every other view goes after those lines under its own `####` heading. Views are exempt from the
  two-line limit, but each keeps to the size cap in its own skill.
- No narrating the `gh` calls, and no prose between views.

## 5 · Recurring ticks

- On a recurring schedule, each tick is the same report, the table plus whichever views the
  schedule was set up with, and nothing more.
- Do not add views tick by tick; that breaks the diff.
- When every row is at 100%, or the named scope is done, post the final report and cancel the
  recurring job that drives the ticks. Do not leave it running past the work it was scoped to.
