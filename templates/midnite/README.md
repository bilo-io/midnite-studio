# The onboarding kit

This tree is the checked-in **skeleton** for onboarding a repo onto the same tracker-and-skills
workflow this repo uses — deliberately not a snapshot of this repo's own `.midnite/`, which is
megabytes of real phase docs. Setup (the midnite menu's "Set up"/"Update onboarding kit" leaf)
copies this tree into a target repo; re-running it there is an upgrade, not a fresh guess, because
`.midnite/settings.json` carries a hash manifest once Setup has run once.

## What's in it

- **`.midnite/settings.json`** — Setup's hash manifest (seeded `{ "version": 1 }`). The tracker is
  GitHub issues, so there is no markdown tracker skeleton any more.
- **`docs/TRACKER.md`** — the issue model, the `tracker.mjs` CLI, and the per-repo settings file
  `.midnite/skills.json` (repo slug, gh account, project board, full gate — every key optional).
- **`scripts/skills/`** — every script the kit's skills call (`tracker.mjs`, `worktree-lifecycle.sh`,
  `scoped-check.mjs`, `orchestrate-cap.sh`, …) plus everything they import, byte-identical to this
  repo's and executable where the source is. Node builtins only; no tests. They name no repo: each
  reads `.midnite/skills.json` through `lib/skills-config.mjs`, so in a repo with none they act on the
  `origin` remote as the active gh account, and put no issue on any board.
- **`.claude/skills/`, `.agents/skills/`** — two mirrors of the same nineteen workflow skills (plus
  the Media set): Claude Code reads `.claude/skills/`; Codex, Antigravity and most other CLIs read
  `.agents/skills/`.
  Symlinks were considered and rejected: zero drift by construction, but broken the moment the
  repo is cloned onto another machine, since a symlink target under `~/.claude/skills/` is
  machine-local. Two copies plus the hash manifest solves the same drift problem without a
  machine-local path landing in a git repo.
- **`AGENTS.md`** (with a `CLAUDE.md` that imports it) — a stub, not a copy. What actually transfers
  between repos is the one-convention-file rule and the tracker/worktree/phase-workflow
  sections; everything repo-specific (the toolchain, package boundaries, house conventions) is
  left as a marked `<!-- TODO -->` placeholder. A stub that reads as a template is honest; a copy
  that names this repo's own package boundaries in someone else's repo is not.

## The kit is generated — never edit it by hand

Everything under `.claude/skills/`, `.agents/skills/`, `scripts/skills/` and `docs/TRACKER.md` here
is derived from this repo's own copies by
[`scripts/skills/sync-template.mjs`](../../scripts/skills/sync-template.mjs):

- each skill (both mirrors, every file in its folder) is this repo's copy with the reviewed generic
  substitutions in [`templates/midnite-overrides/`](../midnite-overrides/) applied — `<skill>.md`
  first, then `_all.md`; `doc-TRACKER.md.md` does the same for the doc. A block is
  `<<<<` exact repo text `====` its generic replacement `>>>>`, and the prose around it says why;
- the scripts are the closure of every `scripts/skills/…` path those files mention plus their
  relative imports, copied verbatim (a dependency outside `scripts/skills/` is an error);
- the media skills ship byte-identical (they are about the app, not about this repo).

```sh
node scripts/skills/sync-template.mjs --check   # what drifted; exit 1 on drift
node scripts/skills/sync-template.mjs --write   # regenerate, then review the diff
```

`--check` also fails on an override that no longer matches anything (the repo's text moved under it),
on a kit file nothing generates, on a repo-specific token left in a generic file (`bilo-io`, the
product name, `moon run`, `pnpm`, a board number, …) and on a reference to a skill the kit does not
ship. It runs inside `node scripts/skills/sync-skills.mjs --lint` and the node gate's
`scripts/skills/sync-template.test.mjs`, so a skill change that forgets the kit fails the gate. The fix is always the same: `--write`, read the
diff, and add an override for anything that names this repo. Bump `.template-version` when the kit
changes materially.

## Why these skills, and not the others

Of the skills this repo has, the workflow core ships here: the lifecycle set (`midnite-plan`,
`midnite-design`, `midnite-refine`, `midnite-build`, `midnite-build-adhoc`, `midnite-test`,
`midnite-maintain`, `midnite-verify`), the agent-group set (`midnite-agents`, the
umbrella; `midnite-fleet`, separate tasks one agent each; `midnite-swarm`, one problem one agent per
stage; `midnite-orchestrate`, the shared core they both run on; `midnite-agents-handover`, the clean
stop) and the helpers (`midnite-address-issue`, `midnite-triage`, `midnite-git-report`,
`midnite-git-cleanup`, `midnite-retro`). That is nineteen, beside the `midnite-media-*` skills.
The agent-group set holds true of any target repo — it is a pure orchestration layer over
`midnite-build` with no credentials or product-specific assumptions of its own, so it passes the
test below and ships alongside it. So does `midnite-retro`: it reads
whatever GitHub org or repo the user names and assumes nothing about the one it runs in. Excluded:

- **`midnite-setup`** — the bootstrapper itself. A repo that has just been onboarded does not need
  the skill that onboards repos; shipping it would be circular.
- **`midnite-release-*`** (the release pair) and **`midnite-deploy`**, which chains them — they
  assume this product's own release repo, its namespaced `<product>/vX.Y.Z` tag scheme and its
  `generic`-provider updater feed, and their scripts import this repo's root-level version and
  changelog checks. None of that is true of an arbitrary target repo, and a skill that assumes it
  would fail (or worse, half-work) the first time someone actually ran it somewhere else.

Also excluded, for the same test: the PR family (`midnite-pr-review`, `-pr-feedback`,
`-check-yourself`, `-pr-create`, `-pr-description`, `-pr-description-image`) and `midnite-pr-audit`
and the sitrep family. They name this repo's slug, its auth, its CI caps and its conventions, none
of which hold in an arbitrary target repo; the kit's skills describe those steps instead of linking
them (some of their scripts still ship, because a kit skill calls them).

If a future onboarding pass wants to add another skill, ask whether it holds true of *any* target
repo or only of this one — add it to `KIT_SKILLS` in `sync-template.mjs` and let `--check` tell you
what needs an override.

## Install user skills

The Agents ▸ project actions "Install user skills" button copies the kit's skills into
`~/.claude/skills/` and `~/.agents/skills/`, so they are available in every repo. It records what it
wrote in `.midnite-kit.json` in each folder and **never overwrites a skill you have edited since**
(or one it did not install): those are skipped and listed. Note that a user-level skill outranks a
repo's own skill of the same name in Claude Code, so inside a repo that carries its own copies (like
this one) the installed generic ones shadow them.

## What Setup does not do

- **No git.** No `git add`, no commit, no `.gitignore` edit. What you do with the new files is
  your own next, separate action.
- **No merging file contents.** A file Setup finds already edited (or a `.midnite/` that predates
  any manifest at all) is skipped and reported, never three-way merged.
- **No arbitrary target.** Setup writes into the repo the menu is already scoped to — never a
  folder picker pointed anywhere else.
