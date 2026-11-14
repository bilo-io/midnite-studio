---
name: midnite-plan-fast
description: Fast, read-only feasibility and PR-breakdown plan rendered directly in chat using the midnite-sitrep family (table, merge graph, timeline) — with effort/duration estimates, PR sizes, counts, and wave sequence — without creating a .midnite/tasks/ phase doc yet.
---

**Invoke with:** a feature idea, feasibility question, or rough scope (e.g. `/midnite-plan-fast unify sessions and chats`).

You are running the **fast plan** workflow for **Midnite Studio**. **Read-only:** do **not** write any `.midnite/tasks/` phase doc, do **not** edit `_INDEX.md`, and do **not** invoke `/midnite-plan`. Render the entire output directly in the chat/session response, then offer to promote it to `/midnite-plan` or refine it.

## 1 · Quick feasibility check (read-only)

Inspect only the relevant contracts, engines, and UI entry points (e.g. `packages/shared/src/`, `packages/features/*/`, `packages/desktop/src/main/`) to ground the answer in real code:
- Identify what works universally vs. where provider, platform, or boundary rules (`shared ◀ frame ◀ feature ◀ app`, `shared ◀ runtime ◀ feature/main ◀ desktop`) impose limits or fallbacks.
- Lead with a **2–4 bullet Feasibility & Basic Approach** section answering the user's core question first.

## 2 · Render the sitrep plan

Read and follow the exact formatting rules of [`midnite-sitrep-table`](../midnite-sitrep-table/SKILL.md), [`midnite-sitrep-graph`](../midnite-sitrep-graph/SKILL.md), and [`midnite-sitrep-timeline`](../midnite-sitrep-timeline/SKILL.md):

1. **Status table (`midnite-sitrep-table`)**
   - One row per proposed PR (`PR-1 · <slug>`, `PR-2 · <slug>`, …), sized `S` / `M` / `L`.
   - `Progress`: `` `░░░░░░░░░░` 0% ``.
   - `ETA`: `<duration> (<S|M|L>)` (fallback guide: `S ≈ 1–1.5h`, `M ≈ 2h`, `L ≈ 3–4h` end to end).
   - `Diff`: estimated diff in exact `🟩 +<add> 🟥 -<del> 📄 <files>` format.
   - `Status`: `⬜ not started` (root PRs) or `⏳ blocked on PR-X`.
   - `Notes`: 6 words at most.
   - Whole-batch line underneath: 20-cell bar, PR count, wave count, parallel cap, total elapsed time, and `(diffs & ETAs estimated)`.

2. **Merge graph (`midnite-sitrep-graph`)**
   - `#### 🔀 Merge graph · <topic>` with legend, `─` delimiter, `──▶` hard dependencies, `┄┄` shared-file soft edges, and a numbered **Merge order**.

3. **Timeline (`midnite-sitrep-timeline`)**
   - `#### 🗓 Timeline · <topic> · cap <N> · now <HH:MM>Z` showing waves, `▒` estimated duration, `·` waiting, `◆` merge, critical path (`★`), and estimated finish time.

## 3 · Hand off with an option sheet

Close with an option sheet (using `ask_question` where supported, else numbered choices) asking whether to:
1. Promote this breakdown into a formal `.midnite/tasks/FEATURES/phases/phase-N-*.md` doc via `/midnite-plan` (Recommended).
2. Refine scope, PR slicing, or parallel cap before creating a phase doc.
3. Keep it chat-only / start building `PR-1` directly in a worktree.

Include at most 2–3 crisp architectural recommendations if relevant.
