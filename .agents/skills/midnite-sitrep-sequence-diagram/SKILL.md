---
name: midnite-sitrep-sequence-diagram
description: The sitrep sequence diagram — a text sequence chart of who handed off to whom and when (orchestrator, each agent or PR, CI, main), built from real timestamps — launches, commits, PR opened, ready, CI start and finish, merges, the next wave. Read-only. Invoke for "what happened when", "walk me through the last few hours", "where did the time go", or a handoff review.
---

The handoff view. Rows, gathering and the shared vocabulary come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only.**

It is drawn in text, never Mermaid: the terminal shows a Mermaid block as source.

## Gather the events, with timestamps from external state

Use one shell invocation alongside the router's gather:

| Event | Source |
|---|---|
| agent launched / handed back | the session's own record: the board file in the scratchpad, or the launch and notification times |
| first commit, later pushes | `git -C <worktree> log --format='%cI %h %s' <base>..HEAD` |
| PR opened, ready, merged | `gh api repos/<o>/<r>/issues/<n>/timeline --paginate` (`ready_for_review`, `merged`, `head_ref_force_pushed`) plus `createdAt` / `mergedAt` |
| CI started / finished | `gh run list -R <o>/<r> --branch <head> --json databaseId,headSha,createdAt,updatedAt,status,conclusion` |
| main moved | `git log origin/main --format='%cI %h %s' --since=<window>` (claims and merges) |

Never invent an event to fill a gap. A gap in the evidence is a gap in the diagram.

## Format

An `####` heading, then one fenced `text` block, then a single line of observations:

````markdown
#### 🧭 Sequence · <scope> · <window>

```
          orchestrator     120 H · #988      CI               main
               │                │               │                │
   03:38Z      ├── launch ─────▶│               │                │
   03:55Z      │                ├── claim H ─────────────────────▶│
   04:12Z      │                ├── PR draft ──▶│                │
   04:21Z      │◀─ hand-back ───┤ ready         │                │
   04:22Z      │                │               ├── run 1 ─┐     │
   04:44Z      │                │               │◀─ 9 ✓ ───┘     │
   04:46Z      ├── squash-merge ─────────────────────────────────▶│
               │                │               │                │
```
CI 22m (queue 1m) · build 43m · launch→merge 1h08m
````

- **Lifelines.**
  - One lifeline per participant, left to right in the order work flows: orchestrator, each row,
    CI, then the base branch.
  - **At most six lifelines.** Fold extra rows into one `others` lifeline, or split by wave into
    two diagrams.
- **Gutter.** The time gutter is `HH:MMZ`, oldest at the top.
- **Events.**
  - At most **20 event lines**. Older events collapse into one `…  N earlier events` line.
  - An arrow `──▶` (or `◀──`) carries a label of two or three words.
  - A self-activity (a CI run) is a short `┐`/`┘` loop on that lifeline.
- **Failures and stalls.** A red CI run is labelled `✗ <job>`. A re-run after a fix shows as a
  second loop. A stall is a `⋮` gap on the lifeline, with its length in the label.
- **Observation line.** Under the block goes one line of durations, measured from the events
  shown: CI wall-clock, queue wait, build time, launch→merge. No narrative.
