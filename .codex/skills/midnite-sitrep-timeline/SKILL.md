---
name: midnite-sitrep-timeline
description: The sitrep timeline — a Gantt-style text chart of every row laid out in waves against a clock, honouring dependencies and the parallel cap, with elapsed work, remaining estimate and waiting time drawn differently, and the batch finish time at the end. Read-only. Invoke for "when is all of it done", "what runs next", "what's the critical path", or planning a swarm's waves.
---

The "when is it done" view. Rows, gathering and the shared vocabulary come from
[`midnite-sitrep`](../midnite-sitrep/SKILL.md) §1–§3. Read it first. **Read-only:** the timeline
proposes waves. It launches nothing.

## Build it

1. **Edges.** Take the hard edges exactly as
   [`midnite-sitrep-graph`](../midnite-sitrep-graph/SKILL.md) derives them. Soft edges do not delay
   a row.
2. **Durations.**
   - A live row's remaining time is its ETA.
   - A row not started is sized from this session's *observed* pace for the same effort tag
     (S / M / L in a phase doc): build time plus a real CI run, plus the merge.
   - Only with no observation at all, fall back to the tag (S ≈ 1h, M ≈ 2h, L ≈ 4h end to end) and
     say so under the chart.
3. **Schedule.**
   - Place each row at the earliest time when all of its hard dependencies have merged *and* a
     slot is free under the cap.
   - When several rows compete for a slot, the one on the critical path to the user's stated
     target goes first, then the one that unblocks the most others.
   - A slot frees when a row *merges*, not when its build ends, because CI and the merge still
     hold the worktree.

## Format

An `####` heading, then one fenced `text` block, then two lines:

````markdown
#### 🗓 Timeline · <scope> · cap <N> · now 06:00Z

```
                     04Z 06Z 08Z 10Z 12Z 14Z 16Z 18Z
                     │   │   │   │   │   │   │   │
121 G  audit trail     ▓▓▒▒▒◆                        wave 1
121 F  limits            ····▒▒▒◆                    wave 2
121 C  MCP by hash       ····▒▒▒▒◆                   wave 2
120 G  rogue agents      ········▒▒▒▒◆               wave 3 ★
121 A  untrusted tag     ·········▒▒▒▒◆              wave 3
… 5 later rows (121 D, I, B, E, H), all done ~20:00Z
```
▓ done  ▒ estimated  · waiting  ◆ merge  ★ target · critical path: 121 G → 121 F → 120 G
Target 120 G ~12:00Z · all done ~20:00Z (30m columns; estimates from today's pace: M ≈ 2h end to end)
````

- **Axis.**
  - One column = a fixed slice of time, chosen so the whole chart fits in about 50 columns
    (15m, 30m or 1h).
  - Tick the axis every 2–4 columns with clock times in UTC, like the rest of the session.
- **Now.** Start the axis early enough that work already done sits left of the current time.
  `▓` never appears right of now, and `▒` never left of it.
- **Cells.**
  - `▓` is work already done (from the row's elapsed time).
  - `▒` is the remaining estimate.
  - `·` is time spent waiting on a dependency or a slot.
  - `◆` is the merge.
- **Rows.**
  - Ordered by planned start. Label each with the short name and up to three words.
  - The wave number goes on the right, numbered 1, 2, 3… with no gaps. The user's target row
    gets `★`.
- **Size.** At most 16 rows. Fold anything after them into one `… N later rows, all done ~HH:MMZ`
  line.
- **The two lines under the block.**
  - The legend, plus the critical path to the target, or to the last merge if there is no target.
  - The target and batch finish times, plus the pace basis in parentheses.
- **Recurring ticks.** Re-plan from the latest real state every tick. A row that slipped moves; a
  merged row keeps its `◆` where it really happened.
