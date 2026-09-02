---
name: midnite-git-report
description: Git activity report for the repo over a day/week/month — merged PRs (linked), phases tackled + per-phase diff, and overall phase progress, as tables + a chart.
---

**Invoke with:** [today | yesterday | YYYY-MM-DD | this-week | this-month | YYYY-MM-DD..YYYY-MM-DD]

A git activity + phase-progress report for **this project** over a chosen window.

**Style:** terse — lead with the report, don't narrate the gathering.

## 0 · Set your timezone once

This skill renders every time in **one fixed timezone**, so a report generated at different times of
day is still internally consistent and so GitHub's UTC timestamps don't quietly shift the window.
**Before first use, replace `<TZ_NAME>` / `<TZ_OFFSET>` below with your own** (e.g. `America/New_York`
/ `-05:00`, `Europe/London` / `+00:00`) — pick whichever timezone the team actually works in. If your
timezone observes DST, note that too; the arithmetic below assumes a fixed offset for simplicity.

## 1 · Pick the window
If `$ARGUMENTS` already names a period (`today`, `yesterday`, a `YYYY-MM-DD`, `this-week`, `this-month`, or a `START..END` range), use it. Otherwise **AskUserQuestion** — one question, options **Today · Yesterday · This week · This month** (Other = a specific date or `START..END`).

Resolve to a concrete inclusive `START`/`END` (`YYYY-MM-DD`). macOS `date`:
- today `date +%F` · yesterday `date -v-1d +%F`
- this-week (Mon→today) START `date -v-monday +%F`, END `date +%F`
- this-month START `date -v1d +%F`, END `date +%F`

Echo the resolved range back in one line before the report.

**Timezone — render every time in `<TZ_NAME>`** (`<TZ_OFFSET>`). If the host clock is already set to
that timezone, `date +%F` already yields the right date and `git log --since/--until` needs no
adjustment. The trap is GitHub: `gh`'s `mergedAt` is **UTC** (`…Z`) and a bare-date `merged:`/`updated:`
search buckets by the **UTC** day — both must be pinned to `<TZ_NAME>` explicitly (see §2), or the
window slips and every merge time reads off by the offset. Any "now"/"generated" stamp you print is
plain `date` (already local, assuming the host clock matches `<TZ_NAME>`).

## 2 · Gather (read-only) — fan out to subagents

The gathering is independent, so once `START`/`END` are resolved **dispatch two read-only subagents in a single message** so they run concurrently. Pass the resolved `START`/`END` into each prompt. Each returns a compact structured digest — keep the raw JSON and file dumps out of this thread; you compose the report from the digests.

**Context discipline (enforced):** the report's phase-progress data comes from **`.midnite/tasks/_INDEX.md` only** — the pre-computed roll-up `/midnite-exec` keeps current. **Never read the individual `.midnite/tasks/phases/phase-*.md` files** (that's the whole point of the index — dozens of reads collapse to one). Sources are: GitHub/`gh` (PRs, status mix), `git log` (commits, file-touch mapping — `--name-only`, never reading the doc bodies), `.midnite/tasks/_INDEX.md` (phase progress + themes), and a date-filtered grep of `.midnite/tasks/done.md` (items shipped in range).

**Subagent A — GitHub / PR data:**
- **Merged PRs in range** (the spine of the report) — pin the window to `<TZ_NAME>` with the `<TZ_OFFSET>` offset on both bounds so the search brackets the **local** day, not the UTC day:
  ```bash
  gh pr list --state merged \
    --search "merged:${START}T00:00:00<TZ_OFFSET>..${END}T23:59:59<TZ_OFFSET>" \
    --json number,title,url,mergedAt,additions,deletions,author --limit 200
  ```
  (Default limit is 30 — keep `--limit 200`; bump it and note if the cap is hit.)
  **The `Merged` column must be in `<TZ_NAME>`.** `mergedAt` is UTC — convert it with jq using your
  offset in seconds (e.g. `+7200` for `+02:00`), rather than slicing the raw `…Z` string:
  ```bash
  ... | jq -r 'sort_by(.mergedAt) | reverse | .[]
        | "\(.number)\t\(.mergedAt|fromdateiso8601+<OFFSET_SECONDS>|strftime("%H:%M"))\t\(.additions)\t\(.deletions)\t\(.title)"'
  ```
  Pitfall: do **not** display the raw `mergedAt` HH:MM (that's UTC), and do **not** use `date -ju -f '%Y-%m-%dT%H:%M:%SZ' "$utc"` — the `-u` flag forces UTC *output* too, so it returns the time unconverted. The jq offset path is the reliable one.
- **Status mix** for the range: also run `--state all --search "updated:${START}T00:00:00<TZ_OFFSET>..${END}T23:59:59<TZ_OFFSET>"` and bucket by state → merged / still-open / closed-unmerged.
- **Phase mapping:** parse each PR's title (and body if needed) for `Phase N` (+ Theme). Cross-check against phase docs touched in range: `git log --since=START --until="END 23:59" --name-only -- '.midnite/tasks/phases/phase-*.md'`. PRs with no phase → an "—" bucket.
- If `gh` isn't available/authed, say so and fall back to merge commits via `git log` — don't fail the report.
- **Return:** the merged-PR rows (`number, title, url, mergedAt, additions, deletions, author, phase`), the status-mix counts, and the phase→PRs aggregation.

**Subagent B — phase state (index-only, no phase docs):**
- **Phase progress (whole repo):** read **`.midnite/tasks/_INDEX.md`** — it already carries one row per phase with `Status`, `Done`/`Total`, `%`, and the `🔄 WIP` / `◻ TODO` theme columns. Parse the table; **do not** recompute from `phase-*.md` and **do not** open them.
- **Items shipped in range:** `grep`/filter `.midnite/tasks/done.md` for entries whose date falls in `START..END`, grouped by phase (date-filtered so the file stays out of context — return only the counts).
- **Return:** one row per phase (`number, title, status, done, total, %, wipThemes, todoThemes`) straight from the index, plus the per-phase shipped-in-range counts.

## 3 · Report — markdown, tables-first
Emit in this order:

`# 📈 Git report — START → END`

A one-line **status mix**: `N merged · M open · K closed-unmerged`.

`## 🔀 Merged PRs` — newest first, link every PR via its `url`. The **Merged** column is in `<TZ_NAME>` (`mergedAt` converted per §2):
| PR | Title | Phase | Δ lines | Merged (`<TZ_NAME>`) |
|----|-------|-------|---------|---------------|
| [#69](url) | … | 25 · Theme D | +982 / −12 | 19:53 |

`## 🧭 Phases tackled` — aggregate the range's PRs per phase:
| Phase | PRs | Δ lines (period) | Items → done |
|-------|-----|------------------|--------------|
Sum the additions/deletions of the PRs mapped to each phase; `Items → done` = `done.md` entries dated in range for that phase.

`## 📊 Phase progress (overall)` — straight from `.midnite/tasks/_INDEX.md` (don't recompute), with a unicode bar + the open-theme columns:
| Phase | Status | Done / total | % | Bar | 🔄 WIP | ◻ TODO |
|-------|--------|--------------|---|-----|--------|--------|
| 25 · UI library | ✅ | 17 / 17 | 100% | `██████████` | — | — |
| 40 · Ideas pipeline | 🔄 | 15 / 54 | 28% | `███░░░░░░░` | — | C D E F |
Bar = 10 cells: `█` × round(%/10), `░` for the rest (this repo's index already ships a 10-cell bar — reuse it or re-derive from %). Status from the index's `Status` column: ✅ complete · 🔄 wip · ⬜ not started. The `🔄 WIP`/`◻ TODO` theme letters come verbatim from the index.

End with a one-line **headline** — e.g. *"5 PRs · +2.3k/−1.0k · Phase 25 closed, Phase 15 advanced; 24/29 phases complete."*

## 4 · Optional richer chart
For a week/month window, or if the user asks for a visual, offer an **Artifact**: a small self-contained HTML page with a bar chart of PRs (and lines changed) per day plus a phase-completion chart. Otherwise the unicode bars suffice — they render in the terminal, whereas mermaid does not.

## 5 · PDF export (end-of-day full-day report)

For a **complete-day window** — a past date, `yesterday`, or `today` **when this is the day's final report** — also export the report as a polished PDF and surface it in chat. Do it **once per day** at whatever cadence makes sense for your own schedule (skip mid-day runs). Also export on demand, for any window, whenever the user asks.

A bundled, data-driven template lives at `.claude/skills/midnite-git-report/pdf-template.html` — all three tables render from one `DATA` object, so you only edit that block (no hand-written rows). Steps:

1. Copy the template into your scratchpad: `cp .claude/skills/midnite-git-report/pdf-template.html "$TMP/git-report-$END.html"`.
2. Replace the object between `/* DATA-START */` and `/* DATA-END */` with this run's values — **identical to the chat tables**. Tuple shapes are documented inline; `status` is `"done"` (complete) / `"wip"` (in progress) / `"todo"` (not started); all times in `<TZ_NAME>`.
3. Render with headless Chrome (JS builds the tables, so allow virtual time):
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 \
     --print-to-pdf="$HOME/Desktop/git-report-$END.pdf" \
     "file://$TMP/git-report-$END.html"
   ```
   If Chrome isn't at that path, detect a Chromium/Edge binary; if none exists, say so and skip the PDF — **never fail the report over it**.
4. Surface it with **SendUserFile** (the PDF path) alongside the chat report; if that's unavailable, print the absolute path.

The PDF is the same report rendered for archiving — keep its data in lockstep with the chat output.
