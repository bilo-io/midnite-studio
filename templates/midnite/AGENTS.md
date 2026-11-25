# AGENTS.md — working notes for agents

<!-- TODO: one or two sentences on what this project is. -->

**Progress tracker: [`.midnite/tasks/`](.midnite/tasks/)** — `_INDEX.md` is the phase table,
`done.md` is the append-only landed log, `outstanding.md` is deliberately-deferred scope.

**`_INDEX.md` is status only — scan its table, nothing else.** Its `## Phases` table is all a
session needs to find what is TODO, in flight or done. Each phase's narrative lives in the
`## Headlines` section at the top of its own `phases/phase-N-*.md`, one short paragraph per theme
(`**Theme A — <name>.** ✅ …`). Read a phase's Headlines only once that phase is picked; when a
theme lands or a phase is refined, verified or created, write the narrative there and touch only
the phase's *row* in `_INDEX.md`.

## One convention file: `AGENTS.md`

**`AGENTS.md` is the single source of the conventions every coding agent follows here.** Codex,
Antigravity and most other agent CLIs read it directly. Claude Code reads only `CLAUDE.md`, so `CLAUDE.md` is a stub that imports this file
(`@AGENTS.md`) and holds only notes that apply to Claude Code alone. There is no `GEMINI.md`:
Antigravity reads `AGENTS.md`.

**Edit the conventions here, never in `CLAUDE.md`.** Keep prose agent-neutral (say "the agent" or
"a session", not a product name) except where the guidance is genuinely specific to one CLI's
behaviour.

**Skills live in two mirrors: `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex,
Antigravity and the other CLIs).** Keep the two in step; the Claude copy may carry extra
Claude-only frontmatter (`argument-hint`, `allowed-tools`). There is no `.codex/skills/`: current
Codex reads `.agents/skills/`.

## Where to work — ask before the first edit

**At the start of every session, and again at the start of every new task, ask whether to work in
the primary checkout or in a worktree — and say that a worktree is the default.** Ask before the
first file edit or branch switch, not after.

Why: several sessions can be live at once. A session that quietly checks out a branch or edits
files in the primary checkout stomps on whatever is open there — and the damage is invisible until
someone switches back to a dirty tree on a branch they did not choose.

- **Default: a worktree.** `git worktree add .worktrees/<slug> -b feature/<slug>` for work that
  will become a PR; `git worktree add --detach <path> main` for a throwaway build or test, which
  needs no branch and cannot be left behind on one.
- **Clean up when done**: `git worktree remove <path>` (add `--force` if the tree is dirty), then
  `git worktree prune`. Check `git worktree list` for strays from dead sessions.
- **A worktree keeps a `SCRATCHPAD.md` at its root while the work is in flight — untracked, never
  committed, and never in the primary checkout.** A session dies more often than anyone plans for:
  the terminal closes, context runs out, a swarm subagent is killed. What is lost is never the code
  — that is on disk — it is *why* the half-finished diff looks like it does. So a worktree's first
  file, written before the first edit, is a `SCRATCHPAD.md` recording the task, the decisions
  already taken, what is done, what is next, and what surprised it; keep it current as the work
  moves, because a stale one is worse than none. It is **deliberately not git-ignored** — showing
  up untracked in `git status` is precisely how the next session finds it. The cost of that is a
  `git add -A` swallowing it, so **check before merging** (`git ls-files --error-unmatch
  SCRATCHPAD.md`) and un-track it if it landed; a squash-merge collapses an add plus a remove to
  nothing, so un-tracking on the branch is the whole fix. The file goes when the worktree does. One
  in the primary checkout is a bug, not a note — delete it.
- Only work directly in the primary checkout when explicitly told to in that session.

## Toolchain

<!--
  TODO: describe how to install dependencies and how to run the project's
  test/lint/typecheck gate — the one command (or short sequence) every
  phase must leave green before a PR. Example shape:

  ```sh
  <install command>
  <the one gate command, e.g. `npm test`, `pnpm run check`, `make verify`>
  ```
-->

## Package boundaries

<!--
  TODO, if this project has enforced module/package boundaries (a monorepo
  dependency direction, a layering rule, etc.) — document them here the way
  this comment block should be replaced: state the rule, then how it's
  enforced (a lint rule, a CI check), so a violation has an obvious fix
  rather than reading as "the reviewer said so."
-->

## Conventions that bite if ignored

<!--
  TODO: the handful of non-obvious rules a new contributor (or a fresh
  agent session) would otherwise get wrong — a parsing convention, a
  required write path, a naming rule enforced by tooling rather than by
  code review. Each existing here should read: what the rule is, why it
  exists (usually a past incident), and how it's enforced.
-->

## Phase workflow

One phase per PR where practical. Work the checklist in `.midnite/tasks/phases/phase-N-*.md`,
leave the project's own test/lint/typecheck gate green, append an entry to `.midnite/tasks/done.md`,
update the phase doc's `## Headlines` paragraph for each theme that landed, and update the phase's
row in the table in `.midnite/tasks/_INDEX.md` (the row only — no prose goes in the index).
