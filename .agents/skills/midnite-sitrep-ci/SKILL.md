---
name: midnite-sitrep-ci
description: The sitrep CI view — per PR, every check on the current head as a job grid (gate-node, app-test shards, gate-native, e2e shards…) with status and duration, plus the runner queue against this repo's 5-job macOS cap, stale runs on superseded heads, and billing stops. Read-only. Invoke for "why is CI slow", "what's failing", "is it queued", or before deciding which runs to cancel.
---

The CI view. Rows, gathering and the shared vocabulary come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only:** this view names
runs worth cancelling. It never cancels or re-runs one. That is the orchestrator's call.

## Gather

Use one shell invocation:

```bash
gh pr checks <n> -R <o>/<r> --json name,bucket,state,startedAt,completedAt,link   # per PR, current head
gh run list -R <o>/<r> --workflow ci.yml --branch <head> -L 5 --json databaseId,headSha,createdAt,updatedAt,status,conclusion   # per PR: the run on the current head gives Wall
gh run list -R <o>/<r> --status in_progress --json databaseId,headBranch,headSha,event,createdAt
gh run list -R <o>/<r> --status queued      --json databaseId,headBranch,headSha,event,createdAt
gh run view <id> -R <o>/<r> --json jobs      # only for runs whose jobs you must place on a runner
```

- **Stale runs.** A run whose `headSha` is not its PR's current `headRefOid` is stale. So is a
  `main` push run behind `origin/main`.
- **Billing stop.** A job that failed in seconds with "The job was not started because an Actions
  budget is preventing further use" is a billing stop, not a code failure. A re-run won't help.

## Format

An `####` heading, then a job grid, then up to three lines:

````markdown
#### 🧪 CI · <scope>

| PR | gate-node | gate-audit | app-test 1/2 | gate-native | e2e 1–4 | Wall |
|---|:-:|:-:|:-:|:-:|:-:|--:|
| [120 H · #988](https://github.com/bilo-io/midnite-studio/pull/988) | ✅ 9m | ✅ 1m | ✅✅ 7m | 🟡 | ✅🟡🟡🟡 | 16m… |
| [121 G · #990](https://github.com/bilo-io/midnite-studio/pull/990) | 🔴 6m | ✅ 1m | ✅✅ 7m | ⏸ | ⏸⏸⏸⏸ | 12m… |

macOS 4/5 running (#988) · 5 queued (#990's gate-native + 4 e2e wait on #988) · cap 5
Stale: run 39898519113 (#988 @ e2c26dd9c, superseded) · run 39895732900 (main @ 71f81ebc0, behind)
🔴 #990 gate-node: `typecheck-node.test.mjs` expected 38 projects, got 39
````

- **Grid.**
  - One row per PR, linked as in the table. One column per job family, in the order `ci.yml` declares them.
  - A sharded job is one column with one mark per shard and the slowest shard's time.
  - A job skipped by its path filter or label is `⏭`, like any other skip.
- **Cell marks.**

  | Mark | Meaning |
  |---|---|
  | ✅ | pass |
  | 🔴 | fail |
  | 🟡 | running |
  | ⏸ | queued, no runner yet |
  | ⏭ | skipped |
  | 💸 | billing stop |
  | ⊘ | cancelled |

  Each cell shows the job's duration where known.
- **Wall.** From the current head's CI run (`gh run list --workflow ci.yml`): `createdAt` to
  `updatedAt` once it completes, so queue time counts. Add `…` while it is still running.
- **Lines under the grid.** Each appears only when it applies.
  1. **Queue.** macOS jobs running and queued against the cap, and who is waiting on whom. This
     repo caps macOS at **5 concurrent jobs** (`CLAUDE.md`, CONCURRENCY), and one PR run uses
     exactly 5 (`gate-native` plus 4 `e2e` shards), so a second PR's run queues behind the first.
  2. **Stale.** Runs on superseded heads or behind `main`, by id. These are the ones worth
     cancelling to free macOS slots.
  3. **Failures.** The first failing job's error, one line each, quoted from the log
     (`gh run view <id> --log-failed | tail`). Name the cause, not "it failed". A billing stop is
     named as billing.
