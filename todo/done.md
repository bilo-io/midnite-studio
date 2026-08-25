# Done — append-only log

<!-- Append one entry per landed phase/PR: date, phase, PR link, one-line summary. -->

## 2026-08-25 — Phase 0 · Scaffold

proto/moon/pnpm workspace skeleton with four packages (`shared`, `git-engine`, `app`,
`desktop`), eslint 9 flat config carrying the dependency-boundary rules as per-package
`no-restricted-imports` groups, and `@bilo-io/ui@0.1.0` + `@bilo-io/shell@0.1.0` installed from
GitHub Packages (registry auth proven). `moon run :typecheck :lint :test :build` green; single
`react@19.2.8` in the store. Boundary rules negative-tested (probe files importing `electron`
from `app/src` and `git-engine/src` both fail lint).

## 2026-08-25 — Phase 1 · Shared contracts + git-engine exec/parsers

`shared` now carries the whole wire contract (domain zod schemas, `mgit:*` channel constants, IPC
payload schemas, the `MidniteGitBridge` type, the CommandId registry + default keymap), and
`git-engine` reads a real repository: dugite exec with env hygiene, the per-repo write queue, four
NUL-delimited parsers, and `log`/`status`/`refs`/`worktrees` commands including an incremental
`streamLog`. 93 tests green — 47 parser unit tests against fixture strings plus 21 integration
tests that build throwaway repos with real git (renames, conflicts, detached HEAD, unborn repo,
linked worktrees, upstream ahead/behind). `scripts/smoke.ts` parses ~/Dev/midnite — 4 worktrees,
200 refs, 2000 commits in 156ms.

## 2026-08-25 — Phase 2 · Lane layout engine

`LaneLayoutSession.push(commits) → GraphRow[]`: a single forward pass over `--topo-order` output
assigning straight branch lanes with left-first lane recycling, and sha-derived colours so a
branch keeps its colour across refreshes. Streaming-safe — batched layout is byte-identical to a
one-shot pass. 28 unit tests (linear, single merge, octopus, criss-cross, orphan roots, multiple
children, truncated history, degenerate input) plus structural invariants and an inline snapshot.
`smoke.ts` renders the lanes as ASCII next to `git log --graph` and they match row for row on
~/Dev/midnite.

## 2026-08-25 — Phase 3 · Electron shell boots

Frameless macOS window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar` bound to a typed `windowChrome` bridge, the login-shell PATH fix, a native menu that
dispatches CommandIds, and the design tokens driving light/dark. Verified with three in-app
screenshots: dark, light (tokens flip), and fullscreen (traffic-light clearance collapses from
112px to 20px, proving `onFullscreenChange` round-trips). Tailwind's library content globs
verified by asserting 21 shell-only utility classes are present in the generated CSS.

## 2026-08-25 — Phase 4 · Repo open/list + worktree sidebar

A repo registry in main that resolves any path inside a repository — root, subdirectory, or linked
worktree — to one entry, so opening a worktree nests it under its owner instead of adding a
duplicate top-level repo. Paths (only paths) persist to `userData/repos.json`; everything else is
re-read from git at open time. VS Code-style sidebar with nested worktrees, native folder picker,
and worktree removal that never passes `--force`. Verified against `~/Dev/midnite` and its real
worktrees, including a restart. 40 new tests.

## 2026-08-25 — Phase 5 · Commit graph, read-only

Streaming log service in main (parse + lane-layout incrementally, 500-row batches, cancellation
by `requestId`) feeding a virtualized SVG-per-row graph: coloured lanes with merge curves, ref
badges joined by sha with ahead/behind, subject/author/date columns, and a commit detail pane.
On `~/Dev/midnite` (2,376 commits) 56 DOM rows are live, scrolling holds a median 8.3ms frame,
and switching repos mid-stream carries zero rows across.

## 2026-08-25 — Phase 6 · Status / stage / commit / sync

Stage, unstage, discard, commit, fetch, pull and push in the engine — all through the write queue,
all with explicit paths, and none of them with a force-push escape hatch — plus a VS Code-style
changes panel: ahead/behind chips with Fetch/Pull/Publish, staged and unstaged lists (a partially
staged file correctly appears in both), a commit box, and a unified-diff text pane. Verified by
committing through the UI on a scratch repo and checking `git log`. 130 engine tests green,
including a push/fetch/pull round trip and a conflicting pull against a real bare remote.

## 2026-08-25 — Phase 7 · Graph interactions

Checkout, branch create/rename/delete, tag create and reset in the engine, each with git's
refusals translated into a sentence that says what to do; renderer-drawn context menus on commit
rows and ref badges; double-click a badge to check it out; and a confirmation dialog that shows
the real blast radius. The count excludes commits any other ref still holds — the naive
`to..from` range overstated it, which is how safety dialogs become noise. 157 engine tests green.

## 2026-08-25 — Phase 8 · Drag-drop ops + conflicts

merge/rebase/cherry-pick plus a sequencer that detects in-progress state and exposes abort and
continue, all returning conflicts as the `GitOpResult` conflict arm rather than throwing.
@dnd-kit gestures on the graph: drag a branch badge onto another to get a merge/rebase choice,
drag a commit onto a branch to cherry-pick. An always-visible conflict banner lists the unmerged
files, disables Continue until they are resolved, and never disables Abort. 173 engine tests.

Also fixed a build-graph bug found here: `desktop:typecheck` could pass against a stale
`git-engine` API because moon hashed only the task's own inputs.

## 2026-08-25 — Phase 9 · Integrated terminal + keybindings

node-pty in the main process (lazy, fail-soft, login shell, cwd = the selected worktree) behind an
xterm panel that defers `open()` until its container is measurable; a CommandId dispatcher shared
by the key handler and the native menu, with an xterm escape allow-list derived from the keymap's
`global` scope; and a footer bar with the toggle, branch, ahead/behind and change count. Verified
with real OS-level key events: `Ctrl+\`` opens from cold and closes again with the terminal
focused, and `git status --short` inside the shell agrees with the footer.

## 2026-08-25 — Phase 10 · Watcher / live refresh

`fs.watch` on the narrow set of git paths plus the working tree, classified into
refs/head/index/worktree, debounced at 200ms, with own-write suppression driven by the write
queue so the app's own commits don't loop back as external changes. The renderer maps each kind
to the narrowest correct refresh. Verified live: committing from the integrated terminal adds the
row to the graph, and `git checkout -b` outside the app makes the badge appear.

The mapping had a real bug worth remembering: `refs` events were treated as badge-only, which
meant a commit — the commonest ref event there is — never appeared in the graph.

## 2026-08-25 — Phase 11 · Packaging + docs

macOS arm64 dmg + zip via electron-builder, with main and preload bundled by esbuild so
electron-builder never has to walk pnpm's workspace symlinks; dugite's bundled git and node-pty
unpacked from the asar; an afterPack hook that restores +x on 197 executables, prunes dangling
symlinks and ad-hoc signs; `install-local` using `ditto`. CI runs the gate on every PR and
packages on main. README rewritten around what the app does and the decisions behind it.

Verified on the installed app launched with a bare `env -i` PATH: the graph renders (bundled git
works from `app.asar.unpacked`) and the terminal runs the user's real zsh (node-pty plus the
login-shell PATH fix).

## 2026-08-25 — Final end-to-end verification

Against the installed `/Applications/midnite-git.app`, launched with `env -i` and
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (what a Finder launch actually gets), opening the real
`~/Dev/midnite`:

- 2 repositories, 3 linked worktrees nested under their owner
- 2,376 commits streamed, lanes and ref badges rendered
- Full-graph scroll (61,776px): median frame **8.3ms**, 1 frame over 16.7ms in 120
- Integrated terminal runs the user's own zsh in the selected worktree
- A commit made in that terminal appears in the graph without a refresh

Screenshot: [`docs/screenshots/midnite-git.png`](../docs/screenshots/midnite-git.png).
