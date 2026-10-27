---
name: midnite-sitrep-graph
description: The sitrep merge graph — which PRs or tasks must merge before which (hard edges), which only share files (soft edges), what can merge now, and a numbered merge order. Read-only. /midnite-sitrep adds it automatically when rows depend on each other; invoke directly for "which can merge", "merge order", "what unblocks X" or "dependency graph".
---

The dependency view. Rows, gathering and the shared vocabulary come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only:** the graph
names re-targets and rebases. It never performs them.

## Derive the edges from external state, not memory

- **Hard edges (`──▶`, must merge first):**
  - `baseRefName` is another PR's branch.
  - The branch has merge commits pulling in another PR's head.
  - `go.mod` or a lockfile pins another PR's commit.
  - The PR body, or the plan's `Depends on` / `dependsOn`, names it.
  - For `.midnite/tasks/` phases, the phase doc's sequencing note ("G lands first … B needs A") and
    its Deliverables' cross-theme references.
- **Soft edges (`┄┄`, rebase only, order free):** two open PRs change the same files
  (`gh pr view <n> --json files`). Name the files in parentheses, abbreviated.

## Mark each node

| Mark | Meaning |
|---|---|
| ✅ | can merge now: every hard dependency merged, CI green, no conflict |
| 🚧 | building, no PR yet |
| ⬜ | not started, and nothing blocks it |
| ⏳ | blocked |
| 🔴 | failing or conflicting |
| 🟣 | merged |

## Format

An `####` heading, then one fenced `text` block, then a numbered merge order:

````markdown
#### 🔀 Merge graph · <plan or scope>

```
✅ can merge now   ⏳ blocked   ──▶ must merge first   ┄┄ same files (rebase, order free)
──────────────────────────────────────────────────────────────────────────────────────────

<repo>
  ✅ #130  PR-2   config contract ──┬──▶ ⏳ #139  PR-8   nature gating
                                    └──▶ ⏳ #140  PR-10  carbon row
  ✅ #132  PR-3   event contract  ────▶ #140
  ✅ #131  PR-1   credits on      ┄┄ #130 (types · utils)

<repo> ▸ <repo>
  ✅ #1263 PR-5   suggested_amounts ──▶ ⏳ #504  PR-6   passthrough

not built
  TASK-B #129 ──▶ PR-11 #126 ──▶ PR-12 #127 release
```

**Merge order**
1. **#130**: re-target #139 and #140 onto `main` first
2. **#131 · #132**: rebase onto #130
````

- **Legend.**
  - The legend lists only the marks used in this graph.
  - It is always followed by a delimiter line of `─` as wide as the legend, then a blank line,
    before the first repo group. Never let the legend run straight into the graph.
- **Grouping.**
  - Group by repo.
  - A cross-repo chain (a pin, a proto consumer) gets its own `<repo> ▸ <repo>` group.
- **Nodes.**
  - A node's full line (`mark #n task label`) appears once; every later mention is the bare `#n`.
  - A node with no PR yet uses its task label (`121 G`) in place of `#n`.
  - Labels are three words at most. Align the columns.
- **Layout.**
  - Fan-out uses `┬ ├ └`.
  - Tasks with no PR yet go in a last `not built` chain, unless the whole graph is unbuilt.
  - A non-gating effect, such as "unblocks a follow-up", is a plain line under the chain, not
    an edge.
- **Merge order.**
  - At most eight numbered lines.
  - PRs that can land together share a line, joined with ` · `.
  - After the `:`, name only the action the merge needs: a re-target, a rebase, a re-pin, a human
    sign-off. Nothing else.
- **With a target** (`until 120 G`), name the critical path to it in one line under the merge
  order: the minimum set of rows that must merge, in order.
