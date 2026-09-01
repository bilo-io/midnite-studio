---
name: midnite-refine
description: Deepen an existing, uncompleted .midnite/tasks/ phase doc — pick the phase, choose which areas to expand via option sheets, resolve the open decisions, then rewrite the doc to a standard any model can execute. Stamps "Refined: xN" on the doc and the index.
argument-hint: "[optional: phase number, or an area hint, e.g. '24' or '26 perf+testing']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **refine** workflow for **Midnite Studio**. It takes one *existing, uncompleted*
`.midnite/tasks/phases/phase-N-*.md` and makes it **deeper**, not longer for its own sake — the goal is a plan whose
every item can be built by a model with no access to this conversation.

`/midnite-brainstorm` invents a phase. `/midnite-exec` builds a slice of one. **`/midnite-refine` sits between them** and is
run *separately from* an exec run: it never writes code, never opens a PR, never ticks a checkbox.

## The bar this skill exists to clear — the Sonnet test

> **A refined phase doc must be executable by Claude Sonnet, working alone, as well as by Opus —
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

- Phase plans live in **`.midnite/tasks/phases/`** (not `todo/` — the tracker moved). [`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md) is
  the roll-up, [`.midnite/tasks/done.md`](../../../.midnite/tasks/done.md) is the append-only landed log,
  [`.midnite/tasks/outstanding.md`](../../../.midnite/tasks/outstanding.md) is deferred scope.
  [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) is the design source of truth.
- **House style** (read the doc you are refining before changing a word of it): `# Phase N — Title`,
  a framing prose section (builds-on + scope guardrails + effort-tag legend), `## Deliverables` split
  into lettered `### A — Theme (S|M|L)` sections of `- [ ]` items, `## Files this phase touches`
  (a table), `## Verification`, `## Not in this phase`, `## Decisions / open questions`. Recent docs
  ([phase-25](../../../.midnite/tasks/phases/phase-25-search-everywhere.md),
  [phase-26](../../../.midnite/tasks/phases/phase-26-side-by-side-diffs.md)) are the reference depth.
- Respect `CLAUDE.md` boundaries (`shared ◀ git-engine ◀ desktop`, `shared ◀ app`; git-engine is
  electron-free; the renderer only reaches main via `window.midniteStudio`; NUL-delimited parsing; the
  per-repo write queue; `GitOpResult` envelopes). A refinement that would need a boundary exception
  is wrong — refine it into an IPC channel instead.
- **Never tick a box.** Everything you write stays `- [ ]`. Never touch `done.md`.
- **This is doc-only work and lands on `main`** — like `/midnite-brainstorm`. Do not ask the worktree
  question, do not open a PR.

---

## 🔭 Stage 1 — Find the refineable phases

Read **[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md)** only. Do **not** read every phase doc; the index
is what replaces that.

A phase is **refineable** if it has open (`- [ ]`) in-scope items — i.e. Status is `◻ TODO` or
`🔄 WIP` and `%` < 100. Rank candidates:

1. `◻ TODO` at 0% — planned but unstarted. **Best candidates**: refining costs nothing and pays off
   on every future `/midnite-exec`.
2. `🔄 WIP` with whole themes still in `◻ TODO`. Refineable, but **only the untouched themes**.
3. `🔄 WIP` whose remainder is "N manual checks" — usually *not* worth refining; say so.

Check what is in flight before proposing anything: `gh pr list --state open` and the index's `🔄 WIP`
column. **Refining a theme another `/midnite-exec` loop has claimed will collide** — flag any such theme and
exclude it from scope by default.

Print a short table of the refineable phases only (not all 27):

| Phase | Status | Open | Refined | Why it's worth refining |
|-------|--------|------|---------|--------------------------|
| 26 · Side by side… | ◻ TODO | 68 items, A–H | — | Theme D's virtualizer has no row-height rule yet |

`Refined` is the current `xN` stamp (`—` if never refined). The last column must be a **real**
observation from the index's theme-key one-liners, not filler.

## 🎯 Stage 2 — Pick the phase — STOP for the human

Present the **3–4 strongest** candidates via **AskUserQuestion**, recommended first. Bias hard toward
`$ARGUMENTS` if it names a number — if it names exactly one phase and that phase is refineable, skip
the question and say which you picked. Always leave the "Other" door open.

Option labels carry the shape: `Phase 26 — Side by side [68 open · never refined]`.

## 🔬 Stage 3 — Audit the doc, on evidence

1. **Read the chosen phase doc in full.** All of it. This is the one place in this skill where you
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

**One AskUserQuestion call, four multi-select questions, four options each.** (The tool caps at 4
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

**One AskUserQuestion call, four single-select questions.** These bound the rewrite, so they come
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

- **Budget: 6–14 questions across 2–4 AskUserQuestion calls** (≤4 per call). Toward 6 for one area on
  a small phase; toward 14 for four-plus areas on a phase like 22/25/26. **Never fewer than 6.**
- **Every question must be a fork in the written plan.** If both answers produce the same doc text, it
  is not a question — decide it yourself and move on. Say which ones you decided and how, briefly.
- **Every option must be grounded** — quote the real symbol, file, or number from Stage 3. An option
  reading "use a virtualizer" is useless; "reuse `useVirtualizer` as `graph-view.tsx` does, fixed
  22px rows" is a decision.
- **Tag every option** the way `/midnite-exec` does — a single dominant-nature tag plus effort:
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
| Testing & verification | The layer (vitest in git-engine vs RTL vs Playwright), the named spec file, the exact assertion, the fixture, what the mock bridge must learn |
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

## 📝 Stage 8 — Rewrite the doc

Edit `.midnite/tasks/phases/phase-N-<slug>.md` **in place**, preserving its voice and its structure.

**Rules of the rewrite**

- **Stamp it.** Immediately under the `# Phase N — Title` line, on its own line, before the framing
  prose — insert or increment:

  ```markdown
  # Phase 26 — Side by side, and the room to show it

  **Refined: x1** · 2026-08-28 · UI/UX, performance, testing
  ```

  Increment the digit on each subsequent run (`x1` → `x2` → …), replace the date with today's, and
  **append** the newly-chosen areas to the list (deduped) rather than overwriting the old ones. Keep
  the literal `x` form — it is what the index and the drift guard grep for.
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
- **Nothing is ticked. `done.md` is not touched. No code is written.**

## 🗂️ Stage 9 — Sync `_INDEX.md` — MANDATORY

A refinement that doesn't reach the index is invisible, and — because refining changes the item
count — leaves every progress number wrong.

1. **Recompute the counts.** The `Done` cell is `<checked>/<total in-scope>`; refinement almost
   always raises the total. Recount `- [x]`/`✅` and `- [ ]` in the doc, excluding `❌ OUT OF SCOPE`
   and `⏳ deferred`, then redraw the 10-cell bar (`█` × `round(done/total × 10)`, remainder `░`) and
   the `%`. **Status and the WIP/TODO theme letters do not change** — refining does no work.
2. **The `Refined` column.** The `## Phases` table needs a `Refined` column immediately after
   `Status`. If it isn't there yet, add it once and backfill `—` for every phase:

   ```bash
   # header + separator, then every phase row
   sed -i '' -E 's/^\| Phase \| Status \|/| Phase | Status | Refined |/' .midnite/tasks/_INDEX.md
   sed -i '' -E 's/^\|-------\|--------\|/|-------|--------|---------|/' .midnite/tasks/_INDEX.md
   sed -i '' -E 's/^\| (\[[0-9]+ · [^|]*) \| ([^|]*) \|/| \1 | \2 | — |/' .midnite/tasks/_INDEX.md
   ```

   **Then `git diff .midnite/tasks/_INDEX.md` and check every row has the same cell count** before going on —
   a mangled table is worse than no column. Set this phase's cell to `x1` (or `x2`, …), matching the
   doc's stamp exactly.
3. **Theme key.** Rewrite the affected `- ◻ **X** — …` one-liners so they describe what the theme now
   says; refresh the italic framing paragraph if the refinement changed the phase's shape. Icons do
   not change.
4. **Headline.** Update only if the refinement materially changed what the phase is. Usually it
   doesn't — don't churn it.
5. **Drift guard — run it, it must print nothing:**

   ```bash
   for f in .midnite/tasks/phases/phase-*.md; do n=${f#.midnite/tasks/phases/phase-}; n=${n%%-*}; \
     grep -qE "^\| \[$n ·" .midnite/tasks/_INDEX.md || echo "DRIFT: phase $n absent from _INDEX.md"; done
   # and: every stamped doc must carry a matching index cell
   for f in .midnite/tasks/phases/phase-*.md; do n=${f#.midnite/tasks/phases/phase-}; n=${n%%-*}; \
     s=$(grep -m1 -oE '^\*\*Refined: x[0-9]+\*\*' "$f" | grep -oE 'x[0-9]+'); \
     if [ -n "$s" ] && ! grep -E "^\| \[$n ·" .midnite/tasks/_INDEX.md | grep -q "| $s |"; then \
       echo "DRIFT: phase $n stamped $s but index disagrees"; fi; done
   ```

## ✅ Stage 10 — Commit to `main` & report

Doc-only, source-of-truth change — same landing path as `/midnite-brainstorm`. No PR.

1. Commit against `main`, staging **by explicit path** (never `git add -A` — it sweeps worktree admin
   files and other loops' work):

   ```bash
   git add .midnite/tasks/phases/phase-N-<slug>.md .midnite/tasks/_INDEX.md
   git commit -m "docs: refine phase-N <slug> (xN) — <areas>

   Co-Authored-By: Claude <noreply@anthropic.com>"
   git push origin main
   ```

   (Use the executing model's own co-author trailer. If the push races another loop's `_INDEX.md`
   edit: `git pull --rebase origin main`, reconcile the table, re-push.)
2. `git status` must be clean, with only those two files changed. Remove any scratch files. If
   anything unexpected is staged, **stop and show the user** rather than committing it.
3. Report, terse: the doc path · `Refined: xN` · items `before → after` per theme · the opens
   resolved · the commit/push result · and the one line that matters — **what a `/midnite-exec` run can now
   do without asking a question it would have had to ask before**.

---

Stages 2, 4, 5, 6 and 7 stop for the human — that is the whole point; do not guess through them.
Stages 1, 3, 8, 9 and 10 are autonomous. Never write code, never open a PR, never tick a box.
