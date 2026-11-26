---
name: midnite-refine
description: Deepen an existing, uncompleted phase issue on GitHub — pick the phase, choose which areas to expand via option sheets, resolve the open decisions, then rewrite the issue and its theme sub-issues to a standard any model can execute. Stamps a `refined-N` label.
---

**Invoke with:** [optional: phase number, or an area hint, e.g. '24' or '26 perf+testing']

You are running the **refine** workflow for **this repo**. It takes one *existing, uncompleted*
phase issue (and its theme sub-issues) on GitHub and makes it **deeper**, not longer for its own sake — the goal is a plan whose
every item can be built by a model with no access to this conversation.

`/midnite-plan` invents a phase. `/midnite-build` builds a slice of one. **`/midnite-refine` sits between them** and is
run *separately from* an exec run: it never writes code, never opens a PR, never ticks a checkbox.

## 0 · Run the script first

Run `node scripts/skills/verify-phase.mjs --phase N --json`. It partitions the phase checklist into automated and human items and runs the tracker check (read-only). You still resolve the open decisions and rewrite the doc. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## The bar this skill exists to clear — the Sonnet test

> **A refined phase issue must be executable by Claude Sonnet, working alone, as well as by Opus —
> because every judgement call Opus would have made silently is written down.**

Apply it to **every** item you touch. An item passes only if all five hold:

1. **It names its file(s)** — real, linked, relative paths that exist (or are explicitly net-new).
2. **It names the symbol** — the exported function/type/component/channel it adds or edits, with the
   actual signature or shape, not a description of one.
3. **It states the rule, not the goal.** "Handle empty state appropriately" fails. "Render
   `describeEmpty(diff)`'s string centred in the body; a binary diff returns `'Binary file'` and
   must not reach the row builder" passes.
4. **Where two implementations are plausible, it names the chosen one and why** — one clause is
   enough. An executor that has to *decide* is an executor that will guess differently each run.
5. **It says how it is verified** — the assertion, the spec file, or the screenshot.

Corollary: **do not delete detail to make room.** Refinement is additive to substance and subtractive
only to vagueness.

## Context you must respect

- Phase plans live on **GitHub issues** ([`docs/TRACKER.md`](../../../docs/TRACKER.md)): a `phase` issue whose body
  carries the `## Headlines` narrative, one sub-issue per theme holding its `- [ ]` deliverables, closed
  sub-issues as the landed log, and `deferred` issues as deferred scope. `.midnite/tasks/` is git-ignored
  scratch: never commit a plan as markdown.
  The design source of truth is whatever `AGENTS.md` names, if anything.
- **House style** (read the doc you are refining before changing a word of it): `# Phase N — Title`,
  a framing prose section (builds-on + scope guardrails + effort-tag legend), `## Headlines` (one
  lead paragraph + one `**Theme X — Name.**` paragraph per theme), `## Deliverables` split
  into lettered `### A — Theme (S|M|L)` sections of `- [ ]` items, `## Files this phase touches`
  (a table), `## Verification`, `## Not in this phase`, `## Decisions / open questions`. The most
  recently refined phase issues (label `refined-*`) are the reference depth.
- Respect the boundaries and conventions `AGENTS.md` sets out. A refinement that would need a
  boundary exception is wrong — refine it into the sanctioned seam instead.
- **Never tick a box.** Everything you write stays `- [ ]`. Never close an issue.
- **This is planning-only work on GitHub** — like `/midnite-plan`. No worktree, no commit, no PR.

---

## 🔭 Stage 1 — Find the refineable phases

List the open phase issues only (`node scripts/skills/tracker.mjs index --state open` — refined count, themes done/total, WIP and TODO letters).
Do **not** read every phase issue; the list is what replaces that.

A phase is **refineable** if it has open (`- [ ]`) in-scope items — i.e. Status is `◻ TODO` or
`🔄 WIP` and `%` < 100. Rank candidates:

1. `◻ TODO` at 0% — planned but unstarted. **Best candidates**: refining costs nothing and pays off
   on every future `/midnite-build`.
2. `🔄 WIP` with whole themes still in `◻ TODO`. Refineable, but **only the untouched themes**.
3. `🔄 WIP` whose remainder is "N manual checks" — usually *not* worth refining; say so.

Check what is in flight before proposing anything: `node scripts/skills/tracker.mjs candidates` marks every open theme `claimed`,
`in PR #n` or `blocked`. **Refining a theme another `/midnite-build` loop has claimed will collide** — flag any such theme and
exclude it from scope by default.

Print a short table of the refineable phases only (not all 27):

| Phase | Status | Open | Refined | Why it's worth refining |
|-------|--------|------|---------|--------------------------|
| 26 · Side by side… | ◻ TODO | 68 items, A–H | — | Theme D's virtualizer has no row-height rule yet |

`Refined` is the current `xN` stamp (`—` if never refined). The last column must be a **real**
observation, not filler — from the row itself (open letters, %, `Refined`) or, for the handful of
candidates shown, a read of just that issue's `## Headlines` section (`node scripts/skills/tracker.mjs view <n>` prints it); the
index carries no per-theme prose.

## 🎯 Stage 2 — Pick the phase — STOP for the human

Present the **3–4 strongest** candidates via **a direct question to the user**, recommended first. Bias hard toward
`$ARGUMENTS` if it names a number — if it names exactly one phase and that phase is refineable, skip
the question and say which you picked. Always leave the "Other" door open.

Option labels carry the shape: `Phase 26 — Side by side [68 open · never refined]`.

## 🔬 Stage 3 — Audit the doc, on evidence

1. **Read the chosen phase issue and its sub-issues in full.** All of it. This is the one place in this skill where you
   read a whole large file into this conversation — everything downstream depends on it.
2. **Ground it in the repo, in parallel.** Dispatch **2–4 read-only subagents** (`Explore`) — one per
   area cluster the doc leans on — and keep the file dumps out of this thread. Each returns *facts*,
   not opinions:
   - Do the files the doc names still exist at those paths? Which linked paths are now **dead**?
   - The **real** current signatures/exports of the symbols the doc says it will extend
     (`grep` the export, return the line).
   - Existing patterns the phase should imitate rather than invent (the nearest sibling component,
     the nearest parser, the nearest zod schema, the nearest test).
   - Anything that **landed since the doc was written** and makes an item obsolete, already-done, or
     wrong.
3. **Print a terse audit** — the gaps, named. Group by the area they fall in, because Stage 4 is
   chosen off this list:
   - `⚠️ stale` — a path/symbol/claim the repo has moved past.
   - `🕳️ thin` — an item that fails the Sonnet test, quoted, with *which* of the five rules it fails.
   - `❓ open` — an unresolved decision in `## Decisions / open questions` (each is a Stage 6 question).
   - `🧪 unverified` — a deliverable with no matching line in `## Verification`.

   Keep it to a scannable list. **Do not fix anything yet.**

## 🧭 Stage 4 — Which areas to expand — STOP for the human

**One a direct question to the user call, four multi-select questions, four options each.** (The tool caps at 4
questions × 4 options — this grid is built to fill it exactly.) Every option is `multiSelect: true`.
Order the options *within* each question so the areas your Stage-3 audit flagged come first, and put
the audit's evidence into the option `description` (e.g. "3 thin items in Theme D").

| Q | header | Options |
|---|--------|---------|
| 1 | `Surface` | UI/UX & interaction · Visual design & theming · Accessibility & keyboard · Empty / loading / error states |
| 2 | `Behaviour` | Functionality & edge cases · Data model & IPC contract · Persistence & migration · Concurrency & cancellation |
| 3 | `Rigour` | Performance & scale · Testing & verification · Observability & diagnostics · Security, permissions & blast radius |
| 4 | `Plan shape` | Sequencing & dependencies · File-map precision · Per-item acceptance criteria · Out-of-scope tightening |

Swap an option out **only** when the phase makes it meaningless (a pure-parser phase has no
`Accessibility`) — replace it with something the audit actually found, never leave a dud.

## ⚖️ Stage 5 — Posture — STOP for the human

**One a direct question to the user call, four single-select questions.** These bound the rewrite, so they come
before any drill-down.

1. **`Scope`** — how much may the item count grow?
   - `Tighten only [no new items]` — sharpen wording, add sub-bullets, resolve opens. Count unchanged.
   - `Expand in place [recommended]` — new sub-items *inside* existing themes; count grows, themes don't.
   - `New themes allowed [scope+]` — a genuinely missing theme letter may be appended.
2. **`Depth`** — `Every item` · `Only the flagged items` · `Only the chosen themes` (then ask which).
3. **`Verification`** — `Assertion-level` (name the expectation per item, recommended) ·
   `Suite-level` (name the spec files only) · `Add manual passes too` (human-in-the-loop checks).
4. **`Opens`** — `Resolve all with recommendations` (recommended) · `Resolve only the ones I answer`
   · `Leave the opens alone`.

If a `🔄 WIP` theme is in flight (Stage 1), state that it is excluded and confirm.

## 🔎 Stage 6 — Drill down until the questions run out

This is where the skill earns its keep. **For each area chosen in Stage 4, ask the questions whose
answers change what gets written** — and keep going until the remaining unknowns are ones an
executor can settle from the codebase alone.

- **Budget: 6–14 questions across 2–4 a direct question to the user calls** (≤4 per call). Toward 6 for one area on
  a small phase; toward 14 for four-plus areas on a phase like 22/25/26. **Never fewer than 6.**
- **Every question must be a fork in the written plan.** If both answers produce the same doc text, it
  is not a question — decide it yourself and move on. Say which ones you decided and how, briefly.
- **Every option must be grounded** — quote the real symbol, file, or number from Stage 3. An option
  reading "use a virtualizer" is useless; "reuse `useVirtualizer` as `graph-view.tsx` does, fixed
  22px rows" is a decision.
- **Tag every option** the way `/midnite-build` does — a single dominant-nature tag plus effort:
  `[recommended · S]` · `[performance · M]` · `[simplicity · XS]` · `[future-proof · M]` ·
  `[scope+ · L]` · `[minimal · XS]` · `[DX · S]`.
- **Recommended option first**, and say *why* in its description in one clause.
- Pull every `❓ open` from Stage 3 into this stage as its own question (unless Stage 5.4 said leave
  them) — a resolved open is the highest-value thing a refinement produces.

**Per-area prompts** — use these to generate real questions, not as a checklist to recite:

| Area | Ask about |
|------|-----------|
| UI/UX & interaction | The exact affordance (button/menu/gesture), where it lives, its default state, what it does with a keyboard, what it looks like mid-flight, whether the preference persists and where |
| Visual design & theming | Which existing tokens/classes, density at both row heights, both light and dark, what a `graphTheme` change does to it |
| Accessibility & keyboard | The chord (and it must not collide — check `shared/src/keybindings.ts`), focus order, focus trap, aria roles/labels, what a screen reader announces on the async bits |
| Empty / loading / error states | The literal copy for each of empty vs loading vs error vs "too many results", where truncation is made visible instead of silent, what a `{ok:false}` envelope renders as |
| Functionality & edge cases | The specific inputs that break it — empty repo, detached HEAD, submodule, symlink, huge file, binary, CRLF, unicode/emoji in a ref or path, rename+edit, conflict, shallow clone |
| Data model & IPC contract | The exact zod schema fields and their optionality, the channel name and its prefix, request/response shapes, whether it is streamed, whether it needs a `requestId`, the migration for the persisted store's `version` |
| Persistence & migration | What is persisted, in which store, under `partialize`, and the `migrate` arm for the version bump |
| Concurrency & cancellation | What supersedes what, whether it goes through the write queue, what an abort does to a half-consumed stream, what happens on repo switch mid-flight |
| Performance & scale | The number that matters (rows, files, commits, bytes), where virtualization starts, what is memoized/cached and keyed on what, what work moves to main, the budget the perf spec asserts |
| Testing & verification | The layer (unit vs component vs end-to-end), the named spec file, the exact assertion, the fixture, what any mock must learn |
| Observability & diagnostics | What is logged, what surfaces in the footer/diagnostics, what a failure looks like to a user vs in the console |
| Security, permissions & blast radius | The jail/allowlist rule, the TOCTOU window, the confirm dialog's blast-radius number, the default-off switch and where it lives |
| Sequencing & dependencies | Which theme must land first and why, what can go in parallel, what a partial landing leaves in a broken state |
| File-map precision | Every touched file, marked net-new vs edited vs deliberately-unchanged-and-load-bearing |
| Per-item acceptance criteria | For each item, the one observable that proves it done |
| Out-of-scope tightening | What keeps creeping in, and the one-sentence reason it stays out |

## ✍️ Stage 7 — Play back, then write

Play back a **terse** change list before touching the file: per theme, `+N items`, the opens now
resolved, the verification lines added, anything corrected as stale. Get a go-ahead. If they want
changes, loop back to Stage 6.

## 📝 Stage 8 — Rewrite the issue

Copy the phase issue body and its sub-issue bodies into the session scratchpad and edit them there,
preserving their voice and structure. Stage 9 pushes them back.

**Rules of the rewrite**

- **The stamp is the `refined-N` label, not a line in the body.** Stage 9 swaps it; write no
  `**Refined: xN**` line into the issue.
- **Theme letters and their order never change**, and an existing item keeps its position. New
  sub-items nest under the item they refine; new sibling items go at the end of their theme.
- **Detail goes into nested bullets**, not into a longer first line. The `- [ ]` line stays a
  scannable one-liner; the specifics hang beneath it. Keep the S/M/L tags honest — if a theme grew,
  re-tag it and say so.
- **Sonnet-test every item you touched** (all five rules). Then re-read the theme cold and ask: *if
  this were all I had, would I write the same code twice?*
- **`## Files this phase touches`** — reconcile against Stage 3: fix dead links, add every newly
  named file, mark net-new files and mark deliberately-unchanged load-bearing ones as
  `(**unchanged**)`.
- **`## Verification`** — one line per newly specified behaviour, at the depth Stage 5.3 chose.
  Human-only passes stay prefixed `**Open, for a human:**`.
- **`## Not in this phase`** — anything Stage 6 explicitly ruled out, each with its one-sentence
  reason.
- **`## Decisions / open questions`** — every question answered in Stage 6 becomes a
  `**Resolved — <the decision>.**` entry carrying the *reason*, not just the choice. Anything still
  open keeps `**Open — …**` with an explicit `*Recommendation:*`.
- Use clickable relative markdown links for every file reference, per repo convention.
- **Nothing is ticked. No issue is closed. No code is written.**

## 🗂️ Stage 9 — Sync the issues — MANDATORY

A refinement that doesn't reach GitHub is invisible.

1. **Push the bodies.** `gh issue edit <n> --body-file <scratchpad>/<file>.md` for the phase issue and
   every theme sub-issue whose deliverables changed. A new theme becomes a new sub-issue:
   `gh issue create --title "Phase N · Theme X — <name>" --label theme --body-file <file>`, then
   `node scripts/skills/tracker.mjs link <phase-issue> <theme-issue>`.
2. **Stamp it.** `node scripts/skills/tracker.mjs refine-stamp <phase-issue>` swaps any `refined-*` label for `refined-N`
   (creating the label when it is the first `refined-N`).
3. **Headlines — in the phase issue body.** Rewrite the affected `**Theme X — …**` paragraphs so they
   describe what the theme now says, one call per theme:
   `node scripts/skills/tracker.mjs headlines <phase-issue> --theme X --text "**Theme X — <name>.** <the paragraph>"`. Status does
   not change; refining does no work.

## ✅ Stage 10 — Report

Nothing is committed: the plan lives on GitHub, and `.midnite/tasks/` is git-ignored scratch.

1. Remove any scratch files.
2. Report, terse: the phase issue link · `Refined: xN` · items `before → after` per theme · the opens
   resolved · and the one line that matters — **what a `/midnite-build` run can now
   do without asking a question it would have had to ask before**.

---

Stages 2, 4, 5, 6 and 7 stop for the human — that is the whole point; do not guess through them.
Stages 1, 3, 8, 9 and 10 are autonomous. Never write code, never commit, never open a PR, never tick a box.
