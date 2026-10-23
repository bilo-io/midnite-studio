---
name: midnite-sitrep-table
description: The sitrep status table — one row per agent, task or PR with a clickable link, author, a 10-cell progress bar, an ETA, a 🟩/🟥/📄 line diff, an emoji status and a six-word note, plus the whole-batch line under it. Read-only. The default view of /midnite-sitrep; invoke directly for the table alone.
argument-hint: "[optional: PR numbers/URLs, a plan name, or a repo — defaults to what this session has in flight]"
allowed-tools: Bash, Read, Glob, Grep, ListAgents
---

The status table, the anchor of every sitrep. Rows, gathering and the shared vocabulary
(progress scale, status emoji, state tags, ETA) come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only.**

**The table is the report.** Nothing goes above it. Under it go at most two lines: the
whole-batch line, plus one line only for a decision the user owes or a failure the table cannot
carry.

## The table

| Task | Author | Progress | ETA | Diff | Status | Notes |
|---|---|---|---|---|---|---|
| [PR-1 · #1259](https://github.com/org/repo/pull/1259) | @bilo-ekko | `████████░░` 80% | ~2h | 🟩 +1515 🟥 -28 📄 17 | 🟢 Ready · CI 7/7 · 🔵 audited | tell me before merging |
| [PR-3 · #1261](https://github.com/org/repo/pull/1261) | @kurtwarwick-ekko | `███████░░░` 70% | ~15m | 🟩 +0 🟥 -4 📄 4 | 🟡 CI 3/5 · ⛓ #1259 | — |
| [PR-6 · #1282](https://github.com/org/repo/pull/1282) | @bilo-ekko | `██████░░░░` 60% | ? | 🟩 +325 🟥 -6002 📄 31 | 🚧 Draft · CI 6/6 · ⛓ #1262 · ⏸ held | — |
| [PR-2 · #1260](https://github.com/org/repo/pull/1260) | @bilo-ekko | ✅ 100% | done | 🟩 +84 🟥 -66 📄 8 | 🟣 Merged · ✅ tested · 🚀 deployed | — |
| [TASK-B · #1252](https://github.com/org/repo/issues/1252) | @bilo-ekko | `████░░░░░░` 40% | ~45m | 🟩 +48 🟥 -12 📄 3 | 🚧 building | — |
| [TASK-A · #1251](https://github.com/org/repo/issues/1251) | — | `░░░░░░░░░░` 0% | ? | — | ⏳ Waiting on PR-1 deploy | — |

- **Task**: the row's name, **always a clickable link**.
  - Link to its PR once one exists, else to its issue, else put the branch name in code.
  - Link text is `<task> · #<n>`.
- **Author**: the PR author's login as `@login`, from `author.login`. Use `dependabot` for a bot.
  - Before a PR exists, use whoever the row's work is being built for (the issue's assignee, or the
    session's own account).
  - Use `—` when there is no one yet.
- **Progress**: the bar and percentage from the shared scale.
- **ETA**: from observed pace, per the shared rule.
  - A row waiting on a human (review, merge, deploy) is `?`, with the reason in Status.
- **Diff**: MUST ALWAYS use `🟩 +<additions> 🟥 -<deletions> 📄 <changedFiles>`.
  - Take it straight from the PR. Before a PR opens, take it from `git diff --shortstat` against
    the base branch, e.g. `main`.
  - Use `—` when there is no diff.
  - Plain text or code block formats like `+X/-Y` or `0/0` are forbidden.
  - A stacked PR's diff is against its base branch, which the `⛓ #n` tag in Status names.
- **Status**: one status emoji, then a few words. Add the CI count as `CI <passed>/<total>`
  whenever checks exist, then any state tags.
- **Notes**: **six words at most**, and only what Status cannot carry: news since the last tick,
  the blocker by name, or an ask ("tell me before merging").
  - Never restate the status, a tag, the CI count or the diff.
  - Empty is `—`, and most rows should be empty.

## Under the table

One line for the whole batch: a 20-cell overall bar over every row (the mean %) and the ETA until
*all* of it is done. Parallel rows do not add; a later wave does.

`████████░░░░░░░░░░░░ 40% overall · 5/8 in review · all done ~?, waiting on review`

Then, only if there is one, a single line naming the decision the user owes.
