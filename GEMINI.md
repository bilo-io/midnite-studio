# Midnite Studio — working notes for Antigravity

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

This repo drives three coding agents — **Claude** (`CLAUDE.md`), **Codex** (`AGENTS.md`), and
**Antigravity** (`GEMINI.md`) — each reading its own convention file by its own
naming rule, not this one. All three carry the *same* conventions, so a session started with
any of them sees the same rules.

**Whenever you edit this file, apply the same edit to `CLAUDE.md` and `AGENTS.md`** — and the
same the other way around: an edit landed in either of those two belongs in this file and the
remaining one too. Keep prose agent-neutral (say "the agent" or "a session", not
"Antigravity") except where the guidance is genuinely specific to one CLI's own behavior —
that stays named, in the one file it actually applies to.

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
- **Destructive ops need a confirm dialog showing blast radius** (`rev-list --count` of commits
  about to be orphaned).
- **Force-push is `--force-with-lease` only, and only through its own gated entry point — never a
  bare `--force`, and never from the title bar.** Phase 22 Theme F reversed the MVP's original
  "no force-push anywhere" rule; the replacement is narrower than a plain revert, not an
  open door. `PushOptions`/`PushRequest` carry `forceWithLease: {ref, expect}`, never a boolean —
  a bare `--force-with-lease` leases against the local remote-tracking ref, which a background
  fetch can silently refresh into agreement, so only the explicit `ref:expect` form is ever built.
  The entry point is the per-ref badge menu (`ref-sync.ts`/`use-graph-actions.ts`), offered only
  once a plain push has already been rejected as non-fast-forward, behind a default-off
  `Settings ▸ Git Safety ▸ Allow force-push (with lease)` switch, gated by the same blast-radius
  confirm every other destructive op uses. `sync-controls.tsx`'s title-bar sync cluster still has
  no force-push button and never will — one un-modal click is that control's whole design.
- **Every icon comes from `react-icons` — it is the only family.** It fronts ~30 icon sets
  behind one package, so a control can take the glyph that actually reads as its job instead
  of the nearest match within one family. Lucide is one of those sets — `react-icons/lu`,
  e.g. `LuGitBranch` — and it is where the renderer's everyday glyphs live. Import per set
  (`react-icons/lu`, `react-icons/md`), never from the package root: the root barrel pulls
  every set.
- **`lucide-react` is gone, and eslint keeps it out.** Phase 36 Theme D moved all 54 of its
  importers onto `react-icons/lu`, which is the same Lucide glyph set under an `Lu` prefix —
  `ChevronLeft` → `LuChevronLeft` — so nothing changed visually. It does **not** leave
  `node_modules`, though: `@bilo-io/ui` and `@bilo-io/shell` both depend on it, so the 40 MB
  stays whatever our own source does (measured in Phase 36 Theme A; the real win is ~18 KB off
  the entry chunk and one family in our code). A `no-restricted-imports` entry in `eslint.config.mjs` fails
  the build on a fresh import of it, and `components/icons/icon-names.test.ts` asserts every
  `react-icons/lu` name the renderer imports actually resolves to a defined export. The
  shared `IconComponent` type (`components/icon-button.tsx`) stays declared structurally
  rather than as react-icons' `IconType`: it is what let that migration touch no call site,
  and it is what lets the app's own hand-held marks (`components/icons/`) sit beside a set
  glyph in `IconButton`, `Tooltip` and the context menus.
- **Perf claims come with a number, from `scripts/perf/`.** `startup-report.mjs` (cold-start
  marks, `--runs=5` for the median), `bundle-report.mjs` (entry chunk / total JS, read from
  Vite's `.vite/manifest.json`) and `idle-cpu.mjs` (percent of one core over a chosen window,
  `--blurred` for the state the visibility gates key on). All three launch the
  **packaged-equivalent** app — `moon run app:build desktop:bundle` first; dev-mode numbers
  are noise. Instrumentation is behind `MSTUDIO_PERF=1` and is a no-op otherwise: main marks
  boot stages through the one log seam, the renderer sends three marks over
  `mstudio:perf:mark`. Measurement stays dev-side — no perf UI in the product, and the
  scripts read `ps` from outside rather than having main report on itself. Every run gets a
  throwaway `--user-data-dir`, because Electron keys the single-instance lock on it and a run
  alongside the installed app would otherwise quit instantly; see
  `scripts/perf/electron-run.mjs`, which also explains why the profile is seeded first.
- **The terminal broker outlives the build it was started from — so its socket is keyed by
  one.** The pty broker (`desktop/src/broker/`) is spawned detached so terminals survive
  reloads, window closes and relaunches, which also means a `desktop:dist` + reinstall replaces
  the bundle under a running broker. Its socket name carries a build fingerprint
  (`brokerSocketName` in `main/broker-client.ts`), so a new build starts its own broker and
  finds the previous one as a *legacy* peer whose sessions stay reachable until they end. The
  broker also watches its own script and node-pty's `spawn-helper` (`broker/staleness.ts`):
  when either changes on disk it answers `create` with `stale-broker` instead of node-pty's
  errno-less "posix_spawnp failed.", the client asks it to `retire` to a `-retired-<pid>.sock`
  path and spawns a fresh one. Order matters there — Node unlinks a Unix socket's file when the
  server that bound it closes, so a stale broker must step off the path *before* its successor
  binds it.
- **`Ctrl+`` toggles the terminal on every platform.** macOS reserves `Cmd+`` for window
  cycling — do not take it.
- **The command registry is [`shared/src/keybindings.ts`](packages/shared/src/keybindings.ts),
  not `commands.ts`** (that path has never existed). `COMMANDS` is the single source of truth —
  every `CommandId`, label, palette `group` and optional chord — with `COMMAND_IDS`,
  `DEFAULT_KEYMAP` and `GLOBAL_CHORDS` all derived from it. `Mod+k` opens the command palette and
  joins `Ctrl+`` as the second chord that escapes the terminal; `Mod+Shift+p` stays `sync.pull`.
  **`Mod+r`/`Mod+Shift+r` are `app.reload`/`app.hardReload`** — reload the window, and reload it
  bypassing the HTTP cache, exactly as a browser reads them. They head the list in
  `TERMINAL_YIELD_COMMANDS`, which the dispatcher honours by falling through when the keystroke
  is aimed at an `.xterm` root: `app` scope alone does **not** keep a chord out of the terminal
  (the dispatcher's window listener grabs every bound chord, `Mod+1` from inside a shell
  included), and `Mod+R` off macOS is `Ctrl+R` — readline's reverse-i-search. For the same
  reason neither gets a native Electron accelerator in `menu.ts`; an OS accelerator fires
  whenever the window is focused, xterm included. They displaced `view.refresh` and `sync.fetch`,
  which are now declared with **no chord** — and a menu or palette label for a chord-free command
  has to come from `COMMANDS`, not `DEFAULT_KEYMAP` (which drops them), or it renders as the raw id.
  **The "L" pair is `Mod+l` = `fab.toggle` (the quick-access menu) and `Mod+Shift+l` = `app.lock`**
  — the same letter one modifier apart, replacing `Mod+m` and `Mod+Alt+l`. Phase 58 Theme E put a
  menu behind `Mod+l` instead of opening the Loops panel directly — Loops, Notes, and two disabled
  future leaves, each one single-letter mnemonic away (`L`/`N`/`I`/`G`) once the menu is open — so
  Loops is now `Mod+l` then `L`, one keystroke further than before. `fab.toggle` joins the reload
  pair and `panel.back`/`panel.forward` in `TERMINAL_YIELD_COMMANDS` for the identical reason:
  `Mod` is Ctrl off macOS, and `Ctrl+L` is every shell's clear-screen. Notes' own chord-free
  `notes.toggle` is not in that list — a chord-free command has nothing to yield.
  **Each rail item that has a chord shows it on hover, and shows *only* it** —
  [`components/nav-chords.ts`](packages/app/src/components/nav-chords.ts) maps a `ViewId` to a
  `CommandId` (never a chord literal), and `app.tsx`'s `ViewLink` wraps the row in `<Tooltip
  side="right">`. Only the chord, because hover or focus anywhere in the rail expands it — the
  label is already on screen, so a bubble repeating it teaches nothing. The map names the command
  that navigates there *unconditionally*: `Mod+1` is shorter than `view.graph`'s `Mod+Shift+g` but
  becomes `browser.selectTab1` while the browser pane is open.
- **Public downloads and issues live in
  [`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps), not here.** This repo is
  private, so nothing a user touches can be served from it — installers, release notes and the
  bug tracker all sit in that repo, which does the same job for every midnite app at once. Two
  consequences bite. **Its release tags are namespaced** — `midnite-studio/v0.3.1`, never a bare
  `v0.3.1`, which would collide with a sibling app's — so `releases/latest` there means "the
  newest release of *any* app in it" and is never what resolves a version. And **the updater feed
  is `generic`, not `github`** ([`electron-builder.yml`](packages/desktop/electron-builder.yml)):
  electron-updater's GitHub provider reads its manifest off that same latest-release endpoint, so
  it would hand Midnite Studio another app's update. `install.sh` reads
  `midnite-studio/version.json`; electron-updater reads `midnite-studio/feed/latest-mac.yml`.
  Both are written per release — see
  [`/midnite-release-complete`](.claude/skills/midnite-release-complete/SKILL.md) §4.
- **Commits here are authored as `bilo-io` — `Bilo Lwabona <bilo.lwabona@gmail.com>`.** The
  global `~/.gitconfig` carries the *work* identity, which is correct for every other
  checkout on this machine and wrong for this one. Nothing about a clone announces that
  difference, so the mistake is silent, and the only remedy after the fact is rewriting
  history — which changes every SHA downstream of it. So the repo pins its own identity in
  local config and enforces it with [`.githooks/pre-commit`](.githooks/pre-commit), wired up
  by a repo-local `core.hooksPath`. The hook reads `git var GIT_AUTHOR_IDENT` rather than
  `user.email`, so a `GIT_AUTHOR_EMAIL=…` or `git -c user.email=…` override is caught rather
  than waved through; bypass it deliberately with `git commit --no-verify`. **Neither
  setting survives a fresh clone** — both are local config, not committed state — so re-run
  all three after cloning:

  ```sh
  git config --local user.name "Bilo Lwabona"
  git config --local user.email bilo.lwabona@gmail.com
  git config --local core.hooksPath .githooks
  ```

## Phase workflow

One phase per PR where practical. Work the checklist in `.midnite/tasks/phases/phase-N-*.md`, leave
`moon run :typecheck :lint :test` green, append an entry to `.midnite/tasks/done.md`, and update the
table in `.midnite/tasks/_INDEX.md`.

## Onboarding another repo

[`templates/midnite/`](templates/midnite/) is a checked-in, repo-agnostic skeleton of this same
workflow — the `.midnite/tasks/` tracker, the eight core skills mirrored into `.claude/`, `.agents/`
and `.codex/`, and `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` stubs — for onboarding a *different* repo
onto it, not this one. The midnite menu's Setup leaf is what will copy it in and track a hash
manifest so a re-run is an upgrade rather than a guess (Phase 49); until then,
[`midnite-setup`](.claude/skills/midnite-setup/SKILL.md) is the interactive path — it emits this
same tree. See the template's own [README](templates/midnite/README.md) for what ships and why
three of this repo's eleven skills are deliberately left out.
