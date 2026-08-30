# Midnite Git

A GitKraken-inspired desktop git client. Plain Electron + typed IPC, a Vite + React renderer, and
the published [`@bilo-io/ui`](https://github.com/bilo-io/midnite-ui) design system.

![Midnite Git](docs/screenshots/midnite-git.png)

<sub>Running `~/Dev/midnite` — linked worktrees nested under their repository, 2,376 commits,
live branch and sync state in the footer. The crescent and the wordmark face are the midnite
app's own.</sub>

**Design source of truth:** [`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md).
**Progress tracker:** [`.midnite/tasks/`](.midnite/tasks/) (see the [index](.midnite/tasks/_INDEX.md)) — one checklist per phase, an append-only
[`done.md`](.midnite/tasks/done.md), and deliberately-deferred scope in
[`outstanding.md`](.midnite/tasks/outstanding.md).

## What it does

1. **An interactive commit graph** — coloured branch lanes laid out in the main process and drawn
   as one SVG per virtualized row. Right-click a commit to branch, tag, check out detached or
   reset; right-click a badge to check out, rename or delete; double-click a badge to check it
   out; drag a branch onto another to merge or rebase, or a commit onto a branch to cherry-pick.
   Anything that can orphan commits asks first, and shows how many.
2. **A worktree-aware sidebar** — repositories with their linked worktrees nested underneath,
   per-worktree status, staging, committing, and fetch/pull/push with ahead-behind counts.
3. **An integrated terminal** — the user's real login shell, in the selected worktree, toggled
   with `` Ctrl+` `` on every platform.

The UI follows the repository live: a commit made in the terminal (or anywhere else) appears in
the graph without a refresh.

## Prerequisites

- [proto](https://moonrepo.dev/proto) — `proto use` installs the pinned node 22.12.0 /
  pnpm 9.15.0 / moon 2.3.4 from [`.prototools`](.prototools).
- A GitHub token with **`read:packages`**, exported as `GITHUB_PACKAGES_TOKEN`. GitHub Packages
  requires an `Authorization` header even for public packages, so `pnpm install` fails without it:

  ```sh
  gh auth refresh -s read:packages
  export GITHUB_PACKAGES_TOKEN=$(gh auth token)
  ```

  (A classic PAT with `read:packages` works too. Never commit one — [`.npmrc`](.npmrc) reads it
  from the environment.)

## Getting started

```sh
proto use
export GITHUB_PACKAGES_TOKEN=$(gh auth token)
pnpm install

moon run desktop:start              # Vite dev server + Electron
moon run :typecheck :lint :test     # the gate every change must leave green
```

Useful extras:

```sh
moon run desktop:start-built        # Electron against the built renderer (file://)
moon run desktop:rebuild-native     # node-pty for Electron's ABI, after an Electron bump
moon run desktop:dist               # macOS arm64 dmg + zip → packages/desktop/release
moon run desktop:install-local      # ditto the .app into /Applications
pnpm --filter @midnite/studio-git-engine smoke ~/some/repo   # parse a real repo, print the lanes
```

## How it is put together

```
shared ◀ git-engine ◀ desktop
shared ◀ app
shared ◀ desktop
```

| Package | Role |
|---|---|
| [`packages/shared`](packages/shared) | The wire contract: domain zod schemas, `mstudio:*` channel constants, per-channel payload schemas, the preload bridge type, the CommandId registry. zod only — no other workspace package, never `electron`. |
| [`packages/git-engine`](packages/git-engine) | Everything that touches git, as plain Node/TS: dugite exec, the per-repo write queue, NUL-delimited parsers, commands, the lane layout, the watcher. Never imports `electron`, so it stays testable under bare vitest. |
| [`packages/app`](packages/app) | The renderer. Reaches the main process only through `window.midniteStudio`. |
| [`packages/desktop`](packages/desktop) | Electron main + preload. The only package allowed to import `electron` and `node-pty`. |

Those arrows are enforced by [`eslint.config.mjs`](eslint.config.mjs), not by convention: each
package has `no-restricted-imports` groups whose messages name the correct alternative. If a
boundary rule fires, the fix is an IPC channel.

A few decisions worth knowing before changing things:

- **Git is the real CLI**, via [dugite](https://github.com/desktop/dugite). That is what makes the
  user's credential helpers, SSH agent, commit signing and `~/.gitconfig` work with no code on our
  side. Reads run with `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0` and `GIT_TERMINAL_PROMPT=0`; `HOME` is
  never overridden.
- **All parsing is NUL-delimited.** Branch names and commit subjects contain spaces and newlines.
- **All writes go through the per-repo write queue** — concurrent writers race on `index.lock`.
- **Ops never throw across IPC.** They return a `GitOpResult` envelope, so a conflict is a state
  the UI renders rather than an exception it catches.
- **Lane layout runs in main**, so the renderer receives finished `GraphRow`s and only draws.
- **No force-push anywhere.** Not a flag, not a hidden menu item.

## Packaging

`moon run desktop:dist` produces a macOS arm64 dmg and zip in `packages/desktop/release`.

Main and preload are bundled by esbuild into two files, inlining the workspace packages. That is
not an optimisation: electron-builder follows pnpm's workspace symlinks into sibling directories
and fails, so the packaged app's only runtime dependencies are `dugite` and `node-pty`. Both need
to be outside the asar — dugite ships a 42MB git tree it resolves relative to its own `__dirname`,
and native modules cannot load from an archive.

Builds are unsigned by default and ad-hoc signed by
[`scripts/afterpack.cjs`](packages/desktop/scripts/afterpack.cjs) so they still launch. With a
Developer ID certificate in `CSC_LINK` + `CSC_KEY_PASSWORD`, electron-builder signs properly.

## Contributing

Work phase by phase from [`.midnite/tasks/`](.midnite/tasks/). Every change leaves
`moon run :typecheck :lint :test` green; visual changes get a screenshot in
[`docs/screenshots/`](docs/screenshots).
