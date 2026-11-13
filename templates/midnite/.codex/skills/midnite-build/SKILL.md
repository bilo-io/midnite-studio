---
name: midnite-build
description: Pick one or more unblocked tasks across phase categories (FEATURES, SECURITY, ISSUES), build them together in a worktree, conduct a self-review with one sub-agent, implement proposed fixes with another subagent, screenshot visual changes with Playwright, open a PR, drive CI green, and merge.
---

**Invoke with:** [optional: category, phase number, or task hint]

End-to-end "execute a phase slice" for **Midnite Studio**.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of instructions, no narrating what you are *about* to do. Report results, not intentions; bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not commentary.

## Respect
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` = conventions (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ frame ◀ feature ◀ app`; commit style; pre-push gate). Re-read relevant sections before coding. `docs/INITIAL_PLAN.md` is design source of truth.
- `.midnite/tasks/` = tracker divided into category folders:
  - **`FEATURES/`** (`FEATURES/_INDEX.md`, `FEATURES/phases/phase-N-*.md`)
  - **`SECURITY/`** (`SECURITY/_INDEX.md`, `SECURITY/phases/phase-N-*.md`)
  - **`ISSUES/`** (`ISSUES/_INDEX.md`, `ISSUES/phases/phase-N-*.md`)
  - Completed work is logged append-only in `done.md`; deferred scope in `outstanding.md`.
- Parallel work → git worktrees in repo-root **`.worktrees/<branch>/`** directory. Keep primary checkout clean.
- Every worktree keeps an untracked `SCRATCHPAD.md` recording task, decisions, done, next, and gotchas.

---

## 1 · Scan — all category indexes

**Pass 1 — Category `_INDEX.md` files.** Read the index files across all relevant task folders:
- **[`.midnite/tasks/FEATURES/_INDEX.md`](../../../.midnite/tasks/FEATURES/_INDEX.md)**
- **[`.midnite/tasks/SECURITY/_INDEX.md`](../../../.midnite/tasks/SECURITY/_INDEX.md)**
- **[`.midnite/tasks/ISSUES/_INDEX.md`](../../../.midnite/tasks/ISSUES/_INDEX.md)**

Do **not** read individual phase docs yet. Status, Done/%, and `🔄 WIP` / `◻ TODO` theme letters are right in the `## Phases` tables. Scan them to find unblocked candidate work across categories. Anything marked `🔄 WIP` or with an active open PR is already claimed.

**Pass 2 — Candidate phase docs.** Open only the matching `phases/phase-{N}-*.md` files (at most 4 across categories) to inspect theme deliverables and `## Headlines`.

---

## 2 · Choose & Confirm Decisions

1. Pick up to **4 candidate phases** with open, unblocked themes.
2. If multiple categories have candidates, present the candidate themes grouped by category/phase.
3. Stop for human confirmation on the chosen batch.
4. Upfront decisions: Ask at least 5 consequential architectural/design decisions (state management, API contract, IPC channel, error handling, layout) before touching code.

---

## 3 · Worktree Setup

1. Check for existing/abandoned `SCRATCHPAD.md` in `.worktrees/`. If resuming an existing worktree, pick up from its `Next` line; otherwise clean up.
2. Claim chosen themes in the respective category's `_INDEX.md` on `main`:
   ```bash
   git add .midnite/tasks/<CATEGORY>/_INDEX.md
   git commit -m "chore(todo): claim <CATEGORY> Phase <N> Theme <X> (WIP)"
   git push origin main
   ```
3. Create worktree and install dependencies:
   ```bash
   git fetch origin
   git worktree add .worktrees/<slice> -b feature/<slice> origin/main
   cd .worktrees/<slice>
   export GITHUB_PACKAGES_TOKEN=$(gh auth token)
   pnpm install --frozen-lockfile
   ```
4. Write untracked `SCRATCHPAD.md` at worktree root before editing code.

---

## 4 · Build (Implementation Sub-Agent)

- Implement each theme in the batch in accordance with the phase doc and recorded decisions.
- Maintain strict package boundaries:
  - `packages/shared` has wire contracts only.
  - `packages/git-engine` touches git and never imports Electron.
  - `packages/app` communicates with main strictly via `window.midniteStudio`.
- Tests ship with every change:
  - Unit tests with Vitest at the proper layer.
  - Functional tests or Playwright tests where browser capabilities are required.
- Small, conventional commits without attribution trailers (`Co-Authored-By`, `Signed-off-by`).

---

## 5 · Visual Verification (Playwright Screenshots)

- For visual changes, capture screenshots using Playwright shots helper under `/tmp/midnite-shots-<slice>/`.
- Render screenshots inline in the thread for visual confirmation.
- Never commit ephemeral screenshots into git unless updating committed baselines.

---

## 6 · Pre-push Gate

Run the local gate inside the worktree:
```bash
moon run :typecheck && moon run :lint && moon run :test && moon run root:tracker-check
```
All checks must pass green before moving to review.

---

## 7 · Open Draft PR

- Push feature branch: `git push -u origin feature/<slice>`.
- Open draft PR: `gh pr create --draft --base main --title "<title>" --body "<body>"`.
- Format PR body using house template (`midnite-pr-description`).

---

## 8 · Sub-Agent Self-Review & Fix Implementation (Enforced)

Never mark ready or request review before completing the two-subagent self-review pass:

1. **Sub-Agent 1 — Reviewer:**
   - Launch a self-review subagent to audit the PR diff against `CLAUDE.md` conventions, code quality, and phase requirements.
   - Categorize findings into `CRITICAL`, `WARNING`, `NIT`, `PRAISE`.
2. **Sub-Agent 2 — Fix Implementer:**
   - Launch an implementation subagent to address the findings.
   - Fix **all** `CRITICAL` and `WARNING` items, and small `NIT` items.
   - Run tests to confirm zero regressions and push fixes to the PR branch.

---

## 9 · Mark Ready & Merge

1. Run final gate: `moon run :typecheck :lint :test && moon run root:tracker-check`.
2. Update phase doc: mark completed items `- [x]` and update `## Headlines` with landed narrative and PR link.
3. Update category `_INDEX.md`: update `Done`, `%`, progress bar, remove theme from `🔄 WIP`.
4. Check that `SCRATCHPAD.md` is untracked (`git ls-files --error-unmatch SCRATCHPAD.md`).
5. Commit tracker updates to branch.
6. Mark PR ready: `gh pr ready <n>`.
7. Once CI checks pass green, squash-merge PR, delete remote branch, and remove local worktree:
   ```bash
   git worktree remove .worktrees/<slice> --force
   git worktree prune
   ```
