---
name: midnite-plan
description: Interactively plan and refine a brand-new .midnite/tasks/ phase doc for simpler models to execute — scans category indexes, shows a status overview, riffs on proposals, and writes the structured phase doc.
argument-hint: "[optional: category and topic/theme to seed the new phase, e.g. 'FEATURES mobile app' or 'SECURITY cve audit']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **plan** workflow for **this repo**: an interactive, human-in-the-loop session that lands a **new `.midnite/tasks/<CATEGORY>/phases/phase-N-*.md`** plan. It is a back-and-forth — propose, let the user steer, refine over a few rounds, and specify the plan with sufficient detail that simpler/fast models can execute it without ambiguity. **Do not write the phase file until the user has converged on a direction** (Stage 5).

## Context you must respect

- Phase plans live in **`.midnite/tasks/`** divided into category folders:
  - **`FEATURES/`** (`.midnite/tasks/FEATURES/phases/phase-N-<slug>.md`, with `FEATURES/_INDEX.md`) — product features and architecture phases.
  - **`SECURITY/`** (`.midnite/tasks/SECURITY/phases/phase-N-<slug>.md`, with `SECURITY/_INDEX.md`) — CVE remediations, audits, and security hardening.
  - **`ISSUES/`** (`.midnite/tasks/ISSUES/phases/phase-N-<slug>.md`, with `ISSUES/_INDEX.md`) — GitHub issue triage and structured remediations.
  - Completed work is logged append-only in `done.md`; deferred scope lives in `outstanding.md`.
- Match the **house style** of existing phase docs: a `# Phase N — Title` heading; blockquote framing (`> **Builds on:** ...`, `> **Scope guardrails:** ...`); a **`## Headlines`** section (lead paragraph with `Planned <date>` + one `**Theme X — <name>.** ◻ <one-liner>` paragraph per theme); a **Deliverables** checklist (`- [ ]` items grouped into lettered Themes); a **Verification** checklist; crib-file references.
- **Refinement for simpler models:** Every deliverable must be concrete and actionable. Specify target file paths, schema shapes, export names, and edge cases so models without deep repo context can execute without hallucinating.
- Respect the repo's convention files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) and its design doc if it has one: package/module boundaries, wire contracts and any I/O-boundary validation rule.
- Checkboxes start unchecked (`- [ ]`) in a fresh plan.

---

## 🔭 Stage 1 — Scan & show the overview

**Pass 1 — Category `_INDEX.md` only.** Default category is `FEATURES`. If `$ARGUMENTS` specifies `SECURITY` or `ISSUES`, inspect that category's `_INDEX.md`. Read **[`.midnite/tasks/<CATEGORY>/_INDEX.md`](../../../.midnite/tasks/)** directly. Do **not** read individual phase docs yet.

Print an overview table first thing — before any question — from the index:

   | Phase | Status | Summary | Done | In flight |
   |-------|--------|---------|------|-----------|
   | 0 · Scaffold | ✅ | Monorepo, moon/proto, package skeletons | 100% | — |
   | 124 · Apps into modules | ✅ | Merge suite apps into packages/modules | 100% | — |
   | 125 · Animations library | 🔄 | Animation clip library & timeline | 93% | PR pending |

- State the **next phase number** (max in that category's index + 1). If `$ARGUMENTS` named a topic, acknowledge it as the seed.

**Pass 2 — only overlapping files.** Once a direction is seeded or chosen, inspect only the overlapping `phases/phase-{X,Y,Z}.md` files for style/boundary references.

## 💡 Stage 2 — Seed 5 proposals

1. Propose **5 distinct directions** for the new phase. Each: a crisp name + a one-line pitch + rough size (S/M/L) + why it's worth doing now.
2. If `$ARGUMENTS` seeded a topic, make the 5 proposals variations/angles on that topic; otherwise spread across the category scope.
3. Use **AskUserQuestion** to present the 5 as options (recommended first). Always invite the user to combine, extend, or replace with their own idea.

## 🔁 Stage 3 — Hone in & refine for simpler models

1. Take the user's choice and go deeper: sketch the themes it contains, surface trade-offs, identify boundary constraints.
2. Iterate over 3–5 rounds of questions via AskUserQuestion to nail down exact deliverables:
   - What packages and modules are touched?
   - What interfaces, contracts or schemas (API, IPC, events) need adding?
   - What automated tests will prove each theme?
3. Ensure every checklist item is crystal clear so a simpler model will not guess or drift.

## ✍️ Stage 4 — Confirm before writing

1. Play back a summary: phase title, category (`FEATURES`, `SECURITY`, or `ISSUES`), themes with S/M/L tags, out-of-scope boundaries, and resolved decisions.
2. Confirm phase number and filename slug (`phase-N-<kebab-slug>.md`).
3. Get user go-ahead.

## 📝 Stage 5 — Write the phase doc

1. Write `.midnite/tasks/<CATEGORY>/phases/phase-N-<slug>.md` matching house style:
   - `# Phase N — Title`
   - Framing blockquotes (builds-on, scope guardrails).
   - `## Headlines` section.
   - `## Deliverables` with `- [ ]` checklist grouped by theme letter.
   - `## Verification` checklist.
   - `## Decisions / open questions`.
2. Register the phase in `.midnite/tasks/<CATEGORY>/_INDEX.md`:
   - Add row at top of `## Phases` table:
     `| [N · Title](phases/phase-N-<slug>.md) | ◻ TODO | — | 0/<total> | \`░░░░░░░░░░\` | 0% | — | <all theme letters> |`
3. Also ensure top-level `.midnite/tasks/_INDEX.md` reflects active categories.
4. Run the tracker drift guard if the repo has one (its convention file names it; it must exit 0).

## ✅ Stage 6 — Commit & clean up

Commit doc-only change to `main` (or active feature branch):
```bash
git add .midnite/tasks/<CATEGORY>/phases/phase-N-<slug>.md .midnite/tasks/<CATEGORY>/_INDEX.md .midnite/tasks/_INDEX.md
git commit -m "docs: add phase-N <slug> plan to <CATEGORY> (+ index row)"
```
Tell the user the file path, summary, and that `/midnite-design` can extend visual/UI specs or `/midnite-build` can pick it up.
