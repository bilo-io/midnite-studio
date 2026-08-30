---
name: midnite-exec
description: Pick one or more unblocked .midnite/tasks/ themes across up to 4 phases, build them together in a worktree, screenshot visual changes with Playwright, open a PR, drive CI green, merge.
---

**Invoke with:** [optional: phase number or task hint]

End-to-end "execute a phase slice" for **Midnite Studio**.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of these instructions, no narrating what you're *about* to do. Report results, not intentions; bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not commentary.

## Respect
- `CLAUDE.md` = conventions (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ app`; commit style; pre-push gate). Re-read the relevant bits before coding. `docs/INITIAL_PLAN.md` is the design source of truth.
- `.midnite/tasks/` = tracker: **`_INDEX.md` (the roll-up you scan first — phase status, progress, `🔄 WIP`/`◻ TODO` themes)**, `phase-N-*.md` (open checklist per phase), `done.md` (append-only, newest first), `open-decisions.md`, `outstanding.md`; rules in `.midnite/tasks/README.md`. Markers: `- [ ]` open · `- [x]`/`✅` done · `◐ PARTIAL` · `⏳ deferred` · `❌ OUT OF SCOPE`. Never pick `deferred`/`OUT OF SCOPE` unless told. `_INDEX.md` is the source of truth for what's claimed/in-flight — keep it current (Stages 2.7 + 10).
- Parallel work → git worktrees in the repo-root **`.worktrees/<branch>/`** dir (git-ignored; **never** under `.git/` — that path gets pruned by parallel `git worktree` runs and Vite denies `.git/**`); keep the primary checkout (`/Users/bilolwabona/Dev/midnite-studio`) as home base.
- **`.worktrees/` is outside `.git/`, so the full `moon run :test` runs fine inside the worktree** — no need to hop back to the primary checkout.

## 1 · Scan
Read **[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md)** — the roll-up of every phase's status, progress, and which themes are `🔄 WIP` / `◻ TODO`. **Do not** read every `phase-*.md`; that's what the index replaces (saves context). Only open the individual `phase-N-*.md` for the **candidate phases** you're about to propose, to read the open theme detail. Skim `open-decisions.md`/`outstanding.md` if relevant. `gh pr list --state open` + the index's `🔄 WIP` column — anything in flight or already claimed isn't a fresh candidate. Emit a tight digest of the few candidate phases + their real open themes.

## 2 · Choose — STOP for the human
Pick up to **4 candidate phases** with open, unblocked themes (favor: doc-flagged "next" slices; small/self-contained/high-value; unblockers). Assign each theme a t-shirt size and **include it directly in the option label**: `<Theme letter>: <name> [<size> · <time>]`.

| Size | Time |
|------|------|
| `[XS]` | < 30 min |
| `[S]` | 30 min – 2 h |
| `[M]` | 2 – 4 h |
| `[L]` | 4 – 8 h |
| `[XL]` | 1 – 2 d |
| `[XXL]` | 2 – 5 d |
| `[XXXL]` | 5 + d |

Example label: `E4: Retro games modal [M · 2-4h]`

Present as **one grouped multi-select prompt with up to 4 sections — one section per candidate phase**:
- **Section header**: names the phase, e.g. `Phase 9`.
- **Options**: that phase's open `◻ TODO` **unblocked** themes, each labeled `<Theme letter>: <name> [<size> · <time>]`. Cap each section at 4 options — if a phase has more open unblocked themes, keep the 4 strongest by the usual heuristic and drop the rest.
- The human can check zero, one, or several themes per section, independently across sections.

Use fewer than 4 sections if fewer than 4 phases have open unblocked themes — never pad with an empty or weak phase just to fill a slot. Bias `$ARGUMENTS` (a phase or task hint) into the first section and toward the top of its options. **Do not implement until they submit.**

**The batch = every theme checked, across all sections, regardless of phase.** All of it lands together in one worktree, one branch, one PR — Stages 3–10 operate on the whole batch as a unit, not per-theme. If nothing is checked anywhere, stop and ask again rather than guessing a default.

## 2.5 · Upfront decisions — STOP for the human
Before touching code, identify the **most consequential design decisions** across the whole batch (data flow, persistence strategy, component shape, API contract, etc. — per theme where they diverge) and present each as a separate **direct question to the user**. **Always ask 5 or more — 5 is a hard floor, never fewer.** Use 5 for a single small theme and scale up (7, or more) for a multi-theme batch or a meaty phase theme. For every option include:
- A **dominant-nature tag** in brackets: `[planned]` (matches the phase doc) · `[recommended]` (fits existing patterns) · `[performance]` · `[simplicity]` · `[DX]` · `[future-proof]` · `[minimal]` · `[scope+]` (expands scope) — pick whichever single tag best characterises the option.
- The **effort size** for that option.

Example option label: `Zustand store [recommended · S]`
Example option label: `Local component state [simplicity · XS]`
Example option label: `Server-side with SWR polling [performance · M]`

Skip any decision already unambiguously settled in the phase doc or `open-decisions.md` — but **never drop below the 5-question floor**: if skipping the settled ones leaves you with fewer than 5, surface the next-most-useful choices (edge-case handling, test strategy, naming / API shape, error states, rollout) until you have at least 5. **Do not implement until all of them are answered.**

## 2.6 · Rename session
Once the batch is chosen, immediately set the terminal/session title so the session shows what's in flight:
1. For each theme in the batch, extract its phase number (`phase-<N>-*.md` → `<N>`) and theme letter (fall back to a short slug if no letter exists).
2. Group by phase and join: `P<N>:<letters>` per phase, `+`-separated across phases — e.g. `P9:A,C+P12:B`.
3. Run: `printf '\033]0;Loop: exec %s\007' "<label>"` — this updates the terminal title the session surfaces.

## 2.7 · Claim the theme(s) on `main` — before the worktree
So parallel `/midnite-exec` loops don't grab the same slice, **claim the whole batch in the index first**:
1. In **[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md)**, for **every phase touched by the batch**, move its chosen theme letter(s) from the `◻ TODO` column into the `🔄 WIP` column (flip that row's **Status** to `🔄 WIP` if it wasn't already). A multi-phase batch touches multiple rows — update all of them in the same pass.
2. Commit **straight to `main`** and push immediately, one commit for the whole batch:
   ```bash
   git add .midnite/tasks/_INDEX.md
   git commit -m "chore(todo): claim Phase <N> Theme <X>[, Phase <M> Theme <Y>, ...] (WIP)"
   git push origin main
   ```
   (Small index-only touch-up → committing to `main` is sanctioned by `CLAUDE.md`. If the push races another loop: `git pull --rebase origin main` and re-push.)

The claim must land on `main` **before** Stage 3 so the worktree branches from a tip that already carries it.

## 3 · Worktree
One worktree, one branch, for the **whole batch** — even when it spans multiple phases. Derive `<slice>` from the batch label built in 2.6 (e.g. `p9-ac-p12-b`), not from a single theme.
```bash
git fetch origin                                    # picks up the WIP claim from 2.7
git worktree add .worktrees/<slice> -b feature/<slice> origin/main
cd .worktrees/<slice> && pnpm install
```
Track sub-tasks with a running task list — one group per theme in the batch.

## 4 · Build
- Implement every theme in the batch to its **phase doc + recorded decisions** — don't drift scope or reintroduce a rejected approach. Work through the themes in dependency order where one informs another; otherwise order doesn't matter.
- Follow `CLAUDE.md` (shared = the IPC contract; zod-validate every IPC payload; `app` never imports git-engine/electron; `git-engine` stays electron-free and unit-testable).
- **Tests ship with the change, not after:**
  - Logic → Vitest at the right layer (pure parsers/layout in `git-engine`; RTL for `app` components).
  - **Visual or flow change → add/extend the Playwright suite** (specs under `packages/app/e2e/`, running against the Vite dev server with a mocked `window.midniteStudio` bridge; scaffold a minimal `playwright.config.ts` if none exists yet) so the new/updated feature is genuinely covered.
- Small conventional commits, each ending with the required `Co-Authored-By` trailer.

## 5 · Screenshots — whenever the change is visual
Capture **before/after with Playwright** against the Vite renderer (`moon run app:dev`, mocked bridge for pure-UI shots) or the real app via `moon run desktop:start`; `pnpm exec playwright install chromium` if the browser is missing. Save PNGs to a temp dir.
- **Always show them in this thread** when there's a visual change — read the PNGs so they render inline.
- The same shots go into the PR body (Stage 7).

## 6 · Pre-push gate
```bash
moon run :typecheck && moon run :lint && moon run :test   # runs in-worktree — .worktrees/ is outside .git, so Vite-based tests work here
```
All green before pushing — never push red.

## 7 · Open the PR (draft) + report it
- Push branch; `gh pr create --draft --base main`.
- **PR title:** for a single-theme batch, `<conventional-commit-title> [<size> · <time>]` as before. For a multi-theme batch, name the lead theme and note the rest: `<conventional-commit-title> + N more [<combined size> · <combined time>]`.
- **PR body:** succinct *why* (not a wall of what) · **one link per phase doc + section** touched by the batch (anchor = lower-cased heading, spaces→`-`, punctuation stripped), each with its phase/item id · **embedded screenshots** for any visual change · the `🤖 Generated with [Claude Code]` trailer. To embed shots: commit the PNGs on the branch under `docs/screenshots/<slice>/` and reference them with **commit-pinned** raw URLs (`https://github.com/<owner>/<repo>/raw/<sha>/docs/screenshots/...`) so they survive a squash-merge + branch delete.
- **Report in this thread when posted:** the PR URL · a 3–5 **bullet** summary of what was done · the line diff in a ` ```diff ` fenced block (`gh pr diff <n> --patch`, trimmed to the meaningful hunks) · the screenshots again if the change was visual.

## 8 · Review your own diff
Against, in order: fidelity to the phase doc/decisions → `CLAUDE.md` conventions → correctness & test coverage. May delegate to a sub-task or the `code-review` skill; you own the verdict. Fix material issues, re-run Stage 6, push. Stop and ask only on a real plan-level question.

## 9 · CI green
`gh pr checks <n> --watch`. On failure: `gh run view <id> --log-failed` → fix in the worktree → re-run the local gate → push → repeat until green. If genuinely stuck (flaky infra, outage, product call), stop and say what's wrong.

## 10 · Merge & wrap
- **Update the trackers in the branch first, so the merge auto-publishes them** (don't wait to do this on `main` afterward). The batch spans one or more phases — repeat this for **every phase touched**, not just the first:
  - **Phase doc** (`phase-<N>-*.md`), per phase in the batch: mark that phase's landed theme/items done (`✅ DONE (PR #<n>, <date>)`) and **move** the completed `- [ ]` items into `done.md` (today's date, per `.midnite/tasks/README.md`) — don't just tick in place.
  - **[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md) — MANDATORY every merge, never skip it.** This is the roll-up the next loop scans; a theme that lands but doesn't move this file reads as "still 0%". For **each phase in the batch**, do all three:
    1. **Phases table row** for that phase: remove the just-landed theme letter(s) from the `🔄 WIP` column (the claim from 2.7); **recompute the numbers from the phase doc** — `Done` = `<count of - [x]/✅ items> / <total in-scope items>`, `%` = `round(100 × done / total)`, and **redraw the 10-cell `Progress` bar** (`█` × `round(done/total × 10)`, remainder `░`); flip **Status** to `✅ DONE` once **every** theme of that phase is done (else leave `🔄 WIP`).
    2. **`## Theme key`** section: flip each landed theme's icon (`◻`/`🔄` → `✅`) and append the PR # to its one-liner.
    3. **Verify before Stage 10's `gh pr ready`:** re-read every touched row and confirm its `Done`/`%`/bar **actually changed** for that phase — unchanged numbers mean you skipped this and the merge will look like no progress.
  - Commit these on the branch (`docs(todo): ...`) so the squash-merge lands docs + index + code together, for every phase at once.
- If the branch is behind `main`, rebase it first: `git rebase origin/main` in the worktree, then force-push (`git push --force-with-lease`). If the tracker files conflict with another loop's merge, take both sides (keep every `done.md` entry; reconcile the `_INDEX.md` cells) — see the parallel-agent conflict gotchas in memory.
- `gh pr ready <n>` → `gh pr merge <n> --squash --delete-branch`. **Always squash. Only use a merge commit if squash is genuinely impossible (e.g. protected-branch rules outside our control).** The merge now carries the doc + index updates — no separate `main` commit needed for trackers.
- **Post-merge `_INDEX.md` sync on `main` — MANDATORY every merge, never skip.** The squash carried your in-branch `_INDEX.md` edit, but a parallel loop's merge can land between and leave it stale. Back in the primary checkout, refresh `main` and verify the index reflects reality:
  ```bash
  git checkout main && git pull origin main
  ```
  Re-read **[`.midnite/tasks/_INDEX.md`](../../../.midnite/tasks/_INDEX.md)** and confirm **every phase touched by the batch** has its row (**Status** / `🔄 WIP` theme letters / `Done` / `%` / the 10-cell progress bar) and its `## Theme key` line **actually reflect the just-merged work**. If a race dropped, clobbered, or under-counted any of them, fix `_INDEX.md` **directly on `main`** and push:
  ```bash
  git add .midnite/tasks/_INDEX.md
  git commit -m "docs(todo): sync _INDEX.md after PR #<n>"
  git push origin main    # if it races: git pull --rebase origin main && re-push
  ```
  Then run the **whole-index drift guard** — it catches any `phase-*.md` (yours *or* one a `/midnite-brainstorm` run left unregistered) that has no `## Phases` row. It must print nothing:
  ```bash
  for f in .midnite/tasks/phases/phase-*.md; do n=${f#.midnite/tasks/phases/phase-}; n=${n%%-*}; \
    grep -qE "^\| \[$n ·" .midnite/tasks/_INDEX.md || echo "DRIFT: phase $n absent from _INDEX.md"; done
  ```
  If it names a phase, add that row (Status / counts / bar / theme letters, from its phase doc) directly on `main` and push — an unregistered phase is invisible to the next `/midnite-exec` and reads as stale on every surface.
- **Teardown + report freed space — every merge.** Measure the worktree's on-disk size *before* removing it, tear down the worktree + branch, then report the reclaimed space:
  ```bash
  freed=$(du -sk .worktrees/<slice> 2>/dev/null | cut -f1)       # KB, before removal
  git worktree remove .worktrees/<slice>                         # add --force if it balks over untracked/admin-file noise
  git branch -D feature/<slice>                                  # -d normally; -D since a squash leaves it "unmerged"
  git worktree prune && git worktree list                        # confirm it's gone
  echo "freed ~$(( freed / 1024 )) MB"
  ```
  Surface the freed figure (e.g. `🧹 Reclaimed ~430 MB`) in the wrap-up below.
- Wrap-up (terse markdown): `# 🎉 Merged: <title>` (linked) · `## 📊 Phase status` (every phase: ✅/🔄/⬜ + outstanding count) · `## ✨ This PR` (what landed + link) · `🧹 Cleanup` (worktree + branch removed, `~<N> MB` freed from Stage 10 teardown) · `## ⏭️ Next up`.

## 11 · Compact & loop hygiene
**Always run your context-compaction step once the wrap-up is posted, if your CLI has one** — every run, loop or not. Keep **only** the durable ledger and drop the rest:

```
Keep ONLY: for each task tackled this session, its phase/theme id + one-line title and the merged PR link (and its CI/merge status). Drop everything else — file contents, diffs, screenshots, tool output, command logs, intermediate reasoning, scan digests. The retained summary is just a list of "Phase <N> Theme <X>: <title> — <PR url>" lines.
```

Then:
- **If invoked repeatedly/on a schedule** → re-invoke exactly as launched, preserving the arguments, and start again from Stage 1 on the next batch. Re-run Stage 2.6 as soon as the next batch is chosen so the session title stays current.
- **One-shot** → stop after the compaction; the compacted ledger is the final state.

The compacted carry-over is the running record of what this session shipped — task ids + PR links, nothing heavier.

---
Autonomous through Stages 3–11 once the user has chosen in Stage 2. Stop only for a real decision: an unresolved design question, a destructive/irreversible step, a plan-level issue from Stage 8, or CI you can't fix.
