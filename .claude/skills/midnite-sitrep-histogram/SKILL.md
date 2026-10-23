---
name: midnite-sitrep-histogram
description: The sitrep histogram — horizontal text bar charts comparing rows on one metric at a time (diff size, CI duration, PR age, time in the current stage), sorted, with the median marked so the outlier stands out. Read-only. Invoke for "which PR is the big one", "which CI run is slow", "what's been sitting longest", or any size/time comparison across rows.
argument-hint: "[optional: PR numbers/URLs, a plan name, or a repo — defaults to what this session has in flight] [optional metric: diff|ci|age|stage — default diff]"
allowed-tools: Bash, Read, Glob, Grep, ListAgents
---

The outlier view. Rows, gathering and the shared vocabulary come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only.**

## Metrics

Draw one chart per metric named. With none named, draw `diff`.

| Metric | Value per row | Source |
|---|---|---|
| `diff` | additions + deletions, with files in the label | the PR, or `git diff --shortstat` before one opens |
| `ci` | wall-clock minutes of the latest run on the current head | `gh run list --branch <head> --json createdAt,updatedAt,headSha` |
| `age` | hours since the PR opened, or since the worktree's first commit | `createdAt` / first commit time |
| `stage` | minutes in the current progress stage (draft, CI, review) | the timeline event that entered it |

## Format

An `####` heading per metric, then one fenced `text` block:

````markdown
#### 📊 Histogram · diff · <scope>

```
121 G  audit trail    ██████████████████████████████  3,412  📄 41
120 H  response       ███████████████████████████▌    3,070  📄 43
120 F  malware        █████████████████████████▉      2,957  📄 71
120 E  network        ███████████████████▍            2,284  📄 47
121 F  limits         █▍                                180  📄 6
                      ┊ median 2,620
```
````

- **Order and scale.**
  - Sort descending by value.
  - The longest bar is **30 cells**; the rest scale linearly.
  - Use `█` for whole cells and `▏▎▍▌▋▊▉` for the last fractional cell.
  - A non-zero value never renders as an empty bar.
- **Labels.**
  - Left-align them: the row's short name, then up to three words.
  - Right-align the values, with a thousands separator.
  - Units go in the heading or after the value (`22m`, `5h`).
- **Median and outliers.**
  - A `┊ median <v>` marker sits under the bars at the median's column.
  - A row more than **2× the median** gets ` ⚠️` after its value. That is the outlier the chart
    exists to show.
- **Size.**
  - At most 15 bars per chart. Beyond that, show the top 12 and one `… N more` line.
- **Missing values.** A row with no value for the metric (no PR, no CI run) is left out. Name
  the count in one line under the block: `2 rows have no CI run yet`.
