# Midnite Studio — working notes for Codex

A desktop workspace for the whole loop around a repository: a GitKraken-inspired git client at
its centre, with an integrated terminal and agent roster, an embedded browser, and the forge
(PRs, checks, reviews) in the same window.

**Design source of truth:
[`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md)** — read it before any non-trivial change; it
carries the architecture, IPC contract, data model, and the verified research constraints
(licensing, registry auth, native-module ABI) that every phase assumes.

**Progress tracker: [`.midnite/tasks/`](.midnite/tasks/)** — `_INDEX.md` is the phase table, `done.md` is the
append-only landed log, `outstanding.md` is deliberately-deferred scope.

## Keep `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` in sync

This repo drives three coding agents — **Claude** (`CLAUDE.md`), **Codex** (`AGENTS.md`, this
file), and **Antigravity** (`GEMINI.md`) — each reading its own convention file by its own
naming rule, not this one. All three carry the *same* conventions, so a session started with
any of them sees the same rules.

**Whenever you edit this file, apply the same edit to `CLAUDE.md` and `GEMINI.md`** — and the
same the other way around: an edit landed in either of those two belongs in this file and the
remaining one too. Keep prose agent-neutral (say "the agent" or "a session", not "Codex")
except where the guidance is genuinely specific to one CLI's own behavior — that stays named,
in the one file it actually applies to.

## Where to work — ask before the first edit

**At the start of every session, and again at the start of every new task, ask the user
whether to work in the primary checkout (`/Users/bilolwabona/Dev/midnite-studio`) or in a
worktree — and say that a worktree is the default.** Ask before the first file edit or
branch switch, not after. The prompt is one line, e.g. _"Worktree (default) or the primary
checkout for this one?"_.

Why: several sessions can be live at once. A session that quietly checks out a branch or
edits files in the primary checkout stomps on whatever the human has open there — and the
damage is invisible until they switch back to a dirty tree on a branch they did not choose.

- **Default: a worktree.** `git worktree add .worktrees/<slug> -b feature/<slug>` for work
  that will become a PR; `git worktree add --detach <path> main` for a throwaway build or
  test, which needs no branch and cannot be left behind on one.
- **Throwaway worktrees go in the session scratchpad**, not `.worktrees/` — they are
  discardable by construction and never clutter the repo.
- **A fresh worktree needs its own install**: `export GITHUB_PACKAGES_TOKEN=$(gh auth token)`
  then `pnpm install --frozen-lockfile`. The pnpm store is shared, so this is seconds, not
  minutes.
- **Clean up when done**: `git worktree remove <path>` (add `--force` if the tree is dirty),
  then `git worktree prune`. Check `git worktree list` for strays from dead sessions.
- Only work directly in the primary checkout when the user says so in this session.

## Toolchain

`proto use` installs the pinned node 22.12.0 / pnpm 9.15.0 / moon 2.3.4 (`.prototools`).
Everything runs through moon:

```sh
moon run :typecheck :lint :test    # the gate every phase must leave green
moon run desktop:start             # dev: Vite dev server + Electron main
moon run desktop:dist              # macOS arm64 dmg/zip (Phase 11)
```

`@bilo-io/ui` + `@bilo-io/shell` come from **GitHub Packages**, which requires an
`Authorization` header even for public packages. Export a `read:packages` token before
installing:

```sh
gh auth refresh -s read:packages
export GITHUB_PACKAGES_TOKEN=$(gh auth token)
```

## Package boundaries — enforced by eslint, not convention

```
shared ◀ git-engine ◀ desktop
shared ◀ app
shared ◀ desktop
```

- **`packages/shared`** — the wire contract. zod only; imports no other workspace package and
  never `electron`. Domain types, IPC channel constants, payload schemas, the preload bridge type.
- **`packages/git-engine`** — everything that touches git, as plain Node/TS. **Never imports
  `electron`**, so parsers/layout/commands stay testable under bare vitest.
- **`packages/app`** — the renderer. Reaches the main process *only* through
  `window.midniteStudio`; may not import git-engine, desktop, electron, or node builtins.
- **`packages/desktop`** — Electron main + preload. The only package allowed to import
  `electron` and `node-pty`.

`eslint.config.mjs` encodes these as per-package `no-restricted-imports` groups with
explanatory messages. If a boundary rule fires, the fix is an IPC channel, not an exception.

## Conventions that bite if ignored

- **All git parsing is NUL-delimited.** `-z` + `%x00` field separators everywhere; never split
  on whitespace or newlines (branch names and commit subjects contain both).
- **All git writes go through the per-repo write queue** (`git-engine/src/exec/write-queue.ts`).
  Concurrent writers race on `index.lock`.
- **IPC ops never throw across the boundary.** They return the `GitOpResult` discriminated
  envelope (`{ok:true}` | `{ok:false, kind:'conflict'|'error', …}`) so conflicts are a normal
  outcome the UI renders, not an exception.
- **Lane layout runs in main**, inside git-engine. The renderer receives fully laid-out
  `GraphRow` batches — parsing and layout stay off the render thread.
- **No force-push anywhere in the MVP.** Destructive ops need a confirm dialog showing blast
  radius (`rev-list --count` of commits about to be orphaned).
- **New icons come from `react-icons`.** It fronts ~30 icon sets behind one package, so a
  control can take the glyph that actually reads as its job instead of the nearest match
  within one family. Lucide is one of those sets — `react-icons/lu`, e.g. `LuGitBranch` —
  so switching costs a rename, not a redesign. Import per set (`react-icons/lu`,
  `react-icons/md`), never from the package root: the root barrel pulls every set.
- **`lucide-react` stays, and the two coexist.** Most of the renderer still imports it and
  there is no migration in flight; only the nav rail in `app.tsx` is on react-icons today.
  Match the file you are editing rather than mixing families inside one component. The
  shared `IconComponent` type (`components/icon-button.tsx`) is declared structurally, so
  `IconButton`, `Tooltip` and the context menus accept either family with no change.
- **`Ctrl+`` toggles the terminal on every platform.** macOS reserves `Cmd+`` for window
  cycling — do not take it.
- **The command registry is [`shared/src/keybindings.ts`](packages/shared/src/keybindings.ts),
  not `commands.ts`** (that path has never existed). `COMMANDS` is the single source of truth —
  every `CommandId`, label, palette `group` and optional chord — with `COMMAND_IDS`,
  `DEFAULT_KEYMAP` and `GLOBAL_CHORDS` all derived from it. `Mod+k` opens the command palette and
  joins `Ctrl+`` as the second chord that escapes the terminal; `Mod+Shift+p` stays `sync.pull`.

## Phase workflow

One phase per PR where practical. Work the checklist in `.midnite/tasks/phases/phase-N-*.md`, leave
`moon run :typecheck :lint :test` green, append an entry to `.midnite/tasks/done.md`, and update the
table in `.midnite/tasks/_INDEX.md`.
