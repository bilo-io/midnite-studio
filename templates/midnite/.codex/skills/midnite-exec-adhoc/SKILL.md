---
name: midnite-exec-adhoc
description: Execute a one-off ad hoc task outside the .midnite/tasks/ phase tracker — clarify scope with a quick back-and-forth, then build it in a worktree, screenshot visual changes, open a PR, drive CI green, merge. For a specific task described up front, not a backlog pick (that's /midnite-exec).
---

**Invoke with:** <a description of the adhoc task to build>

End-to-end "execute a described task" for **this project**, for work that isn't a `.midnite/tasks/phases/phase-N-*.md`
item — a bug someone just mentioned, a small feature sketched in chat, a cleanup nobody wrote down.
**[`/midnite-exec`](../midnite-exec/SKILL.md) picks from the backlog; this skill takes a task you
already have in mind** and runs the same build → PR → CI → merge machinery against it, minus every
step that assumes a phase doc exists.

**Conversation style — enforced.** Be terse to save time and tokens. No preamble, no recap of these instructions, no narrating what you're *about* to do. Report results, not intentions; bullets over prose. Stay silent on no-op stages. Spend tokens on code, diffs, and decisions — not commentary.

## Respect
- `CLAUDE.md` (and its `AGENTS.md`/`GEMINI.md` mirrors, if present) = this project's own conventions. Re-read the relevant bits before coding.
- `.midnite/tasks/` is **not** the driver here, the same posture [`/midnite-address-issue`](../midnite-address-issue/SKILL.md) takes: only touch it if the task happens to close out an existing phase item, and say so if it does. **Never claim a theme in `.midnite/tasks/_INDEX.md`, never touch `done.md`** — this work isn't phase-tracked.
- Parallel work → git worktrees in the repo-root **`.worktrees/<branch>/`** dir (git-ignored; **never** under `.git/`); keep the primary checkout as home base.

## 0 · Get the task
If `$ARGUMENTS` describes a concrete task, that's the seed. If it's empty or too vague to build from
("fix the thing", "clean stuff up"), **ask the user directly** what they want built — a plain
question, not the full `/midnite-brainstorm` interview.

## 1 · Quick clarify — only where genuinely ambiguous
Unlike `/midnite-exec`'s Stage 2.5, there is **no question-count floor** here — this is a described
task, not a phase slice standing in for a whole theme. Ask **0–3** `AskUserQuestion` questions, and
only for choices that would actually change the code (data flow, which surface it touches, scope
boundary — "just this" vs. "the whole class of it"). If the task is already unambiguous, skip
straight to Stage 2. **Do not implement until any question you did ask is answered.**

## 2 · Rename session
```bash
printf '\033]0;Adhoc: %s\007' "<short-slug>"
```

## 3 · Worktree
```bash
git fetch origin
git worktree add .worktrees/adhoc-<slug> -b feature/adhoc-<slug> origin/main
cd .worktrees/adhoc-<slug> && <this project's own install command>
```
Track sub-tasks with TodoWrite.

## 4 · Build
- Implement exactly the task agreed in Stages 0–1 — don't drift scope.
- Follow this project's own `CLAUDE.md` conventions (module/package boundaries, wire-contract validation at every I/O boundary, whatever this project's own rules are).
- **Tests ship with the change, not after:** unit tests at the right layer, following this project's own existing conventions; a visual or flow change gets a spec in this project's own e2e suite, if it has one.
- Small conventional commits, each ending with the required `Co-Authored-By` trailer.

## 5 · Screenshots — whenever the change is visual
Capture **before/after** with whatever this project's own visual-testing tooling is (a dev server + mocked backend where applicable, or the real app). Save PNGs to a temp dir, show them in this thread, and reuse them in the PR body (Stage 8).

## 6 · Pre-push gate
Run this project's own full test/lint/typecheck command (from `CLAUDE.md`).
All green before pushing — never push red.

## 7 · Review your own diff
Against, in order: fidelity to the agreed task → `CLAUDE.md` conventions → correctness & test coverage. May delegate to `code-review`/an Agent; you own the verdict. Fix material issues, re-run Stage 6, push.

## 8 · Open the PR (draft) + report it
- Push branch; `gh pr create --draft --base main`.
- **PR title:** a conventional-commit title for the task, no phase/size tag (there's no phase doc to size it against).
- **PR body:** the task as described in Stage 0 (and what Stage 1 resolved, if anything) · embedded screenshots for any visual change · the `🤖 Generated with [Claude Code]` trailer.
- **Report in this thread when posted:** the PR URL · a 3–5 **bullet** summary · the line diff in a ` ```diff ` fenced block (`gh pr diff <n> --patch`, trimmed) · the screenshots again if visual.

## 9 · CI green
`gh pr checks <n> --watch`. On failure: `gh run view <id> --log-failed` → fix in the worktree → re-run the local gate → push → repeat until green. If genuinely stuck, stop and say what's wrong.

## 10 · Merge & wrap
- If the branch is behind `main`, rebase it first: `git rebase origin/main`, then force-push (`git push --force-with-lease`).
- `gh pr ready <n>` → `gh pr merge <n> --squash --delete-branch`. Always squash.
- **Teardown + report freed space:**
  ```bash
  freed=$(du -sk .worktrees/adhoc-<slug> 2>/dev/null | cut -f1)
  git worktree remove .worktrees/adhoc-<slug>
  git branch -D feature/adhoc-<slug>
  git worktree prune && git worktree list
  echo "freed ~$(( freed / 1024 )) MB"
  ```
- Wrap-up (terse markdown): `# 🎉 Merged: <title>` (linked) · `## ✨ This PR` (what landed + link) · `🧹 Cleanup` (worktree + branch removed, freed MB).

## 11 · Compact & loop hygiene
**Always `/compact` once the wrap-up is posted** — every run, loop or not. Pass instructions so it keeps **only** the durable ledger:
```
/compact Keep ONLY: for each adhoc task tackled this session, its one-line title and the merged PR link (and its CI/merge status). Drop everything else — file contents, diffs, screenshots, tool output, command logs, intermediate reasoning. The retained summary is just a list of "Adhoc: <title> — <PR url>" lines.
```
Then:
- **On `/loop`** → re-invoke exactly as launched and ask for the next task from Stage 0.
- **One-shot** → stop after the compaction.

---
Autonomous through Stages 2–10 once Stage 0–1's task and any open questions are settled. Stop only for a real decision: an unresolved design question, a destructive/irreversible step, a plan-level issue from Stage 7, or CI you can't fix.
