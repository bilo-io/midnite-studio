---
name: midnite-build
description: Pick one or more unblocked tasks across phase categories (FEATURES, SECURITY, ISSUES), build them together in a worktree, conduct a self-review with one sub-agent, implement proposed fixes with another subagent, screenshot visual changes with Playwright, open a PR, drive CI green, and merge.
argument-hint: "[optional: category, phase number, or task hint]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

End-to-end "execute a phase slice" for **Midnite Studio**.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of instructions, no narrating what you are *about* to do. Report results, not intentions; bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not commentary.

## 0 · Run the script first

Run `scripts/skills/worktree-lifecycle.sh create <slug>` (brief-first SCRATCHPAD.md, install), `scripts/skills/orchestrate-cap.sh` before spawning subagents, `node scripts/skills/pr-create.mjs` and `node scripts/skills/pr-description.mjs` at PR time. They set up the worktree, report the subagent cap and run the draft-PR preflight. You still build, review, fix, and merge as the stages below say. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Respect
- `AGENTS.md` = conventions (Claude Code reads them through `CLAUDE.md`) (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ frame ◀ feature ◀ app`; commit style; pre-push gate). Re-read relevant sections before coding. `docs/INITIAL_PLAN.md` is design source of truth.
- The tracker is **GitHub issues** ([`docs/TRACKER.md`](../../../docs/TRACKER.md)): a phase is an issue labelled `phase` + `features` / `security` / `issues`, each theme a sub-issue, deferred scope labelled `deferred`. Nothing about the plan is committed; `.midnite/tasks/` is git-ignored scratch.
- Parallel work → git worktrees in repo-root **`.worktrees/<branch>/`** directory. Keep primary checkout clean.
- Every worktree keeps an untracked `SCRATCHPAD.md` recording task, decisions, done, next, and gotchas.

---

## 1 · Scan — all category indexes

**Pass 1 — the open phase issues.** `gh issue list --label phase --state open --limit 500 --json number,title,labels,assignees`, plus the project board's Status column.

Do **not** read individual phase issues yet. Scan the list to find unblocked candidate work across categories. A theme sub-issue that is assigned, labelled `wip`, or has an open PR linked is already claimed.

**Pass 2 — Candidate phases.** Open only the matching phase issues and their sub-issues (at most 4 phases) to inspect theme deliverables and `## Headlines`.

---

## 2 · Choose & Confirm Decisions

1. Pick up to **4 candidate phases** with open, unblocked themes.
2. If multiple categories have candidates, present the candidate themes grouped by category/phase.
3. Stop for human confirmation on the chosen batch via AskUserQuestion.
4. Upfront decisions: Ask at least 5 consequential architectural/design decisions (state management, API contract, IPC channel, error handling, layout) before touching code.

---

## 3 · Worktree Setup

1. Check for existing/abandoned `SCRATCHPAD.md` in `.worktrees/`. If resuming an existing worktree, pick up from its `Next` line; otherwise clean up.
2. Claim chosen themes on GitHub (no commit):
   ```bash
   gh issue edit <theme-issue> --add-assignee @me --add-label wip
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

- Implement each theme in the batch in accordance with the theme sub-issue and recorded decisions.
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

Run the focused gate inside the worktree:
```bash
node scripts/skills/scoped-check.mjs --run
```
It runs vitest on the changed tests, `tsc --noEmit` per touched package (building `shared` first when needed) and eslint on the changed files. Never the workspace-wide moon gate: it exhausts RAM.
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

1. Run final gate: `node scripts/skills/scoped-check.mjs --run`.
2. Make sure the PR body says `Closes #<theme-issue>` for each theme it lands, and tick the sub-issue's `- [x]` items.
3. Update the phase issue's `## Headlines` paragraph with the landed narrative and PR link (`gh issue edit <phase> --body-file …`), and drop the `wip` label.
4. Check that `SCRATCHPAD.md` is untracked and no commit carries a trailer: `scripts/skills/push.sh --check` (`--fix` untracks it).
5. Nothing tracker-related is committed.
6. Mark PR ready: `gh pr ready <n>`.
7. Once CI checks pass green (`node scripts/skills/ci-watch.mjs <n> --rerun-flakes-once`), squash-merge PR, delete remote branch, and remove local worktree:
   ```bash
   git worktree remove .worktrees/<slice> --force
   git worktree prune
   ```
