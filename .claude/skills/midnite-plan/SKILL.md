---
name: midnite-plan
description: Interactively plan a brand-new phase for simpler models to execute — scans the phase issues on GitHub, shows a status overview, riffs on proposals, and files the phase as a GitHub issue with one sub-issue per theme.
argument-hint: "[optional: category and topic/theme to seed the new phase, e.g. 'FEATURES mobile app' or 'SECURITY cve audit']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **plan** workflow for the **Midnite Studio** repo: an interactive, human-in-the-loop session that lands a **new phase as GitHub issues** (a `phase` issue plus one sub-issue per theme; see [`docs/TRACKER.md`](../../../docs/TRACKER.md)). It is a back-and-forth — propose, let the user steer, refine over a few rounds, and specify the plan with sufficient detail that simpler/fast models can execute it without ambiguity. **Do not file the issues until the user has converged on a direction** (Stage 5).

## 0 · Run the script first

Run `node scripts/skills/verify-phase.mjs --json`. It reads the category indexes and lists incomplete phases and their checklists (read-only), so the status overview does not need a long scan. You still riff with the user and write the phase doc. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Context you must respect

- Phase plans live on **GitHub issues** ([`docs/TRACKER.md`](../../../docs/TRACKER.md)): a phase is an issue labelled `phase` plus its category label:
  - **`features`** — product features and architecture phases.
  - **`security`** — CVE remediations, audits, and security hardening.
  - **`issues`** — GitHub issue triage and structured remediations.
  - Completed work is the closed sub-issues; deferred scope is issues labelled `deferred`.
- **Never commit a plan as markdown.** `.midnite/tasks/` is git-ignored; a local draft there is a scratch file. Recommend the user keeps it that way.
- Match the **house style** of existing phase issues: a `# Phase N — Title` heading; blockquote framing (`> **Builds on:** ...`, `> **Scope guardrails:** ...`); a **`## Headlines`** section (lead paragraph with `Planned <date>` + one `**Theme X — <name>.** ◻ <one-liner>` paragraph per theme); a **Deliverables** checklist (`- [ ]` items grouped into lettered Themes); a **Verification** checklist; crib-file references.
- **Refinement for simpler models:** Every deliverable must be concrete and actionable. Specify target file paths, schema shapes, export names, and edge cases so models without deep repo context can execute without hallucinating.
- Respect `AGENTS.md` and `docs/INITIAL_PLAN.md` (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ frame ◀ feature ◀ app`; shared is the wire contract).
- Checkboxes start unchecked (`- [ ]`) in a fresh plan.

---

## 🔭 Stage 1 — Scan & show the overview

**Pass 1 — the phase list only.** Default category is `features`. If `$ARGUMENTS` specifies `security` or `issues`, use that label. Run `node scripts/skills/tracker.mjs index --category <category>` (add `--json` to parse it). Do **not** read individual phase issues yet.

Print an overview table first thing — before any question — from that list:

   | Phase | Status | Summary | Done | In flight |
   |-------|--------|---------|------|-----------|
   | 0 · Scaffold | ✅ | Monorepo, moon/proto, package skeletons | 100% | — |
   | 124 · Apps into modules | ✅ | Merge suite apps into packages/modules | 100% | — |
   | 125 · Animations library | 🔄 | Animation clip library & timeline | 93% | PR pending |

- State the **next phase number** (`node scripts/skills/tracker.mjs next`: highest `Phase N` issue title + 1). If `$ARGUMENTS` named a topic, acknowledge it as the seed.

**Pass 2 — only overlapping files.** Once a direction is seeded or chosen, read only the overlapping phase issues (`node scripts/skills/tracker.mjs view <n>`) for style/boundary references.

## 💡 Stage 2 — Seed 5 proposals

1. Propose **5 distinct directions** for the new phase. Each: a crisp name + a one-line pitch + rough size (S/M/L) + why it's worth doing now.
2. If `$ARGUMENTS` seeded a topic, make the 5 proposals variations/angles on that topic; otherwise spread across the category scope.
3. Use **AskUserQuestion** to present the 5 as options (recommended first). Always invite the user to combine, extend, or replace with their own idea.

## 🔁 Stage 3 — Hone in & refine for simpler models

1. Take the user's choice and go deeper: sketch the themes it contains, surface trade-offs, identify boundary constraints.
2. Iterate over 3–5 rounds of questions via AskUserQuestion to nail down exact deliverables:
   - What packages and modules are touched?
   - What IPC channels or shared zod schemas need adding?
   - What automated tests will prove each theme?
3. Ensure every checklist item is crystal clear so a simpler model will not guess or drift.

## ✍️ Stage 4 — Confirm before writing

1. Play back a summary: phase title, category (`features`, `security`, or `issues`), themes with S/M/L tags, out-of-scope boundaries, and resolved decisions.
2. Confirm phase number and title.
3. Get user go-ahead.

## 📝 Stage 5 — File the phase on GitHub

1. Write the phase body in the session scratchpad (never in the repo), matching house style:
   - Framing blockquotes (builds-on, scope guardrails).
   - `## Headlines` section.
   - `## Verification` checklist.
   - `## Decisions / open questions`.
   The body's first line is its title: `# Phase N — Title`.
2. For each theme, write its `- [ ]` deliverables to a scratchpad file whose first line is `# Phase N · Theme X — <name>`.
3. File them in one call — it creates the phase, each theme, and links every theme as a sub-issue
   (dry-run first to check the titles): `node scripts/skills/tracker.mjs file --phase-body <scratchpad>/phase.md --theme <scratchpad>/theme-a.md --theme … --category <category> [--dry-run]`.
4. Put the phase on the project board: `node scripts/skills/tracker.mjs board <phase-issue> --status Todo [--project N]` (it refuses rather than guesses when the board is ambiguous).

## ✅ Stage 6 — Report

Nothing is committed: the plan lives on GitHub. Tell the user the phase issue link, the sub-issue links, the summary, and that `/midnite-design` can extend visual/UI specs or `/midnite-build` can pick it up.
