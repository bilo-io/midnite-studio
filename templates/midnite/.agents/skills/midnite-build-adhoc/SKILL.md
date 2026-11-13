---
name: midnite-build-adhoc
description: Execute a one-off ad hoc task outside the .midnite/tasks/ phase tracker — clarify scope, build it in a worktree, conduct self-review with subagents, screenshot visual changes, open a PR, drive CI green, and merge.
---

**Invoke with:** <a description of the adhoc task to build>

End-to-end "execute a described task" for **this repo**, for work that isn't a `.midnite/tasks/` phase item — a bug someone just mentioned, a small feature sketched in chat, a cleanup nobody wrote down.
**[`/midnite-build`](../midnite-build/SKILL.md) picks from category backlogs; this skill takes a task you already have in mind** and runs the same build → review → PR → CI machinery against it.

**Conversation style — enforced.** Be terse to save time and tokens. Report results, not intentions; bullets over prose.

## Respect
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` conventions (package/module boundaries, test coverage, commit-trailer rules).
- Isolated worktrees under `.worktrees/<branch>/`. Untracked `SCRATCHPAD.md` at worktree root.
- Two-subagent self-review pass before opening/readying PR.

## 0 · Scope Clarification
Clarify any ambiguous requirements with the user.

## 1 · Worktree Setup
1. Create worktree:
   ```bash
   git worktree add .worktrees/<slug> -b feature/<slug> origin/main
   cd .worktrees/<slug>
   # install dependencies the way the repo's convention file says
   ```
2. Write untracked `SCRATCHPAD.md` at worktree root.

## 2 · Build
Implement code, adhering strictly to the repo's package/module boundaries. Add tests at the layer its testing doc prescribes.

## 3 · Local Gate
Run the repo's gate (the typecheck, lint and test commands its convention file names).

## 4 · Sub-Agent Self-Review & Fix Implementation
1. Subagent 1 conducts self-review of the diff against house conventions (CRITICAL, WARNING, NIT).
2. Subagent 2 implements findings and confirms tests pass.

## 5 · Open PR & Merge
1. Push branch and open draft PR with house description.
2. Confirm checks green, mark ready (`gh pr ready <n>`), and squash-merge.
