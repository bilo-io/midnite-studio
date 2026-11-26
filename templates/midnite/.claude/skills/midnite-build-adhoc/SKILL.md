---
name: midnite-build-adhoc
description: Execute a one-off ad hoc task outside the phase issues on GitHub — clarify scope, build it in a worktree, conduct self-review with subagents, screenshot visual changes, open a PR, drive CI green, and merge.
argument-hint: "<a description of the adhoc task to build>"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

End-to-end "execute a described task" for **this repo**, for work that isn't a theme of a `phase` issue — a bug someone just mentioned, a small feature sketched in chat, a cleanup nobody wrote down.
**[`/midnite-build`](../midnite-build/SKILL.md) picks from category backlogs; this skill takes a task you already have in mind** and runs the same build → review → PR → CI machinery against it.

**Conversation style — enforced.** Be terse to save time and tokens. Report results, not intentions; bullets over prose.

## 0 · Run the script first

Run `scripts/skills/worktree-lifecycle.sh create <slug>`, then `node scripts/skills/pr-create.mjs` and `node scripts/skills/pr-description.mjs` at PR time. They set up the worktree and run the draft-PR preflight. You still build, review, fix, and merge as the stages below say. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Respect
- `AGENTS.md` conventions (Claude Code reads them through `CLAUDE.md`) (package boundaries, test coverage, no attribution trailers).
- Isolated worktrees under `.worktrees/<branch>/`. Untracked `SCRATCHPAD.md` at worktree root.
- Two-subagent self-review pass before opening/readying PR.

## 0 · Scope Clarification
Clarify any ambiguous requirements with the user via AskUserQuestion.

## 1 · Worktree Setup
1. Create worktree:
   ```bash
   git worktree add .worktrees/<slug> -b feature/<slug> origin/main
   cd .worktrees/<slug>
   <the project's install command, from AGENTS.md › Toolchain>
   ```
2. Write untracked `SCRATCHPAD.md` at worktree root.

## 2 · Build
Implement code, adhering strictly to package boundaries. Add unit and visual tests.

## 3 · Local Gate
Run `node scripts/skills/scoped-check.mjs --run` (focused vitest, `tsc --noEmit` and eslint for the packages the diff touches; outside a JS workspace run the project's focused equivalents, and leave the full gate to CI).

## 4 · Sub-Agent Self-Review & Fix Implementation
1. Subagent 1 conducts self-review of the diff against house conventions (CRITICAL, WARNING, NIT).
2. Subagent 2 implements findings and confirms tests pass.

## 5 · Open PR & Merge
1. Push branch and open draft PR with house description.
2. Confirm checks green, mark ready (`gh pr ready <n>`), and squash-merge.
