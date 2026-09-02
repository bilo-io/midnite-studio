# The onboarding kit

This tree is the checked-in **skeleton** for onboarding a repo onto the same tracker-and-skills
workflow this repo uses — deliberately not a snapshot of this repo's own `.midnite/`, which is
megabytes of real phase docs. Setup (the midnite menu's "Set up"/"Update onboarding kit" leaf)
copies this tree into a target repo; re-running it there is an upgrade, not a fresh guess, because
`.midnite/settings.json` carries a hash manifest once Setup has run once.

## What's in it

- **`.midnite/`** — the tracker skeleton: `settings.json`, `tasks/_INDEX.md` (headers + an empty
  phase table), `tasks/done.md`, `tasks/outstanding.md`, an empty `tasks/phases/`, and
  `_features.md`.
- **`.claude/skills/`, `.agents/skills/`, `.codex/skills/`** — three verbatim mirrors of the same
  eight skills, because each CLI (Claude Code, Codex, Antigravity/Gemini) reads its own path.
  Symlinks were considered and rejected: zero drift by construction, but broken the moment the
  repo is cloned onto another machine, since a symlink target under `~/.claude/skills/` is
  machine-local. Three copies plus the eventual hash manifest solves the same drift problem
  without a machine-local path landing in a git repo.
- **`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`** — stubs, not copies. What actually transfers between
  repos is the *sync rule* between the three files and the tracker/worktree/phase-workflow
  sections; everything repo-specific (the toolchain, package boundaries, house conventions) is
  left as a marked `<!-- TODO -->` placeholder. A stub that reads as a template is honest; a copy
  that names this repo's own package boundaries in someone else's repo is not.

## Why these eight skills, and not the other three

Of the eleven skills this repo has, eight are the workflow core and ship here:
`midnite-brainstorm`, `midnite-exec`, `midnite-exec-adhoc`, `midnite-refine`,
`midnite-address-issue`, `midnite-triage`, `midnite-git-report`, `midnite-git-cleanup`. Three are
deliberately excluded:

- **`midnite-setup`** — the bootstrapper itself. A repo that has just been onboarded does not need
  the skill that onboards repos; shipping it would be circular.
- **`midnite-release-*`** (the release pair) — these assume this product's own release repo, its
  namespaced `<product>/vX.Y.Z` tag scheme, and its `generic`-provider updater feed. None of that
  is true of an arbitrary target repo, and a skill that assumes it would fail (or worse, half-work)
  the first time someone actually ran it somewhere else.

If a future onboarding pass wants to add a ninth skill, ask whether it holds true of *any* target
repo or only of this one — that's the test these three failed.

## What Setup does not do

- **No git.** No `git add`, no commit, no `.gitignore` edit. What you do with the new files is
  your own next, separate action.
- **No merging file contents.** A file Setup finds already edited (or a `.midnite/` that predates
  any manifest at all) is skipped and reported, never three-way merged.
- **No arbitrary target.** Setup writes into the repo the menu is already scoped to — never a
  folder picker pointed anywhere else.
