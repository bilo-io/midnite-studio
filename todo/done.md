# Done — append-only log

<!-- Append one entry per landed phase/PR: date, phase, PR link, one-line summary. -->

## 2026-08-25 — Phase 12 · Theme D — Real diff rendering

`readFileDiff` and the new `readCommitFileDiff` return a parsed `FileDiff` — hunks, per-line
old/new numbers, word-level intraline ranges — instead of patch text, so the renderer paints
geometry rather than tokenising on the render thread. New `mgit:commit:file-diff` channel (kept
separate from `mgit:file:diff`, where `staged` is meaningless against a sha), a hunk parser in
git-engine, and one `<DiffView>` serving both the status panel and the commit inspector: rows
virtualised, low-alpha row tint with the saturated colour on a 2px gutter bar, both line-number
columns behind a persisted toggle, context expansion as a refetch at a wider `-U`, and an honest
"N more lines not shown" past the cap. The inspector's `git show --stat` block is gone — it
repeated the file list's own numbers as preformatted text; that space now shows the diff.

372 tests green (`moon run :typecheck :lint :test`) plus 8 Playwright specs under
`moon run app:e2e` — the repo's first renderer-level test harness, driving the real app against a
mocked `window.midniteGit`.

What this shook out — mostly a family of cases where the pane rendered something plausible that
was not the file in front of you, which is the failure a diff viewer can least afford because
nothing about it looks wrong. Each is now covered by a regression test:

- **A pathspec is applied before rename detection**, so `git diff -M -- new-name` sees only the
  addition and reports a brand-new file with every line green. Both diff requests gained an
  `oldPath`; it comes from `StatusEntry.origPath` in the status panel, and in the inspector from
  the rename token `parseNumstat` had been reading and discarding.
- **`git show` prints no diff at all for a merge commit** — a merge has no single pre-image, so
  git declines to guess. `-m --first-parent` is what makes a merge's files inspectable.
- **A diff body line can be indistinguishable from a file header.** A deleted `-- comment` reads
  `--- comment` in the patch; parsing headers anywhere but before the first hunk dropped the line
  from the diff entirely, under-counted the deletion, clobbered `oldPath`, and shifted every
  following old-side line number by one. Found in self-review, not by the original tests.
- **`git diff` on an unmerged path emits a combined diff** (`@@@ -1,3 -1,3 +1,7 @@@`, one marker
  column per parent), which an `^@@ -`-anchored parser skips whole — so mid-merge the one file
  you most need to see said "No changes to show for this file." The parser reads N-parent headers
  now and flags `combined`, and the view states that the old numbers are the first parent's.
- **A pathspec is glob-matched**, so `pages/[id].tsx` is a character class that matches
  `pages/i.tsx` — the pane rendered a *different file's* content under the requested name.
  `--literal-pathspecs` fixes it, and it is a MAIN git option: as a subcommand flag it exits 255,
  which reads downstream as an empty diff rather than as an error.
- **"Empty output and not staged" does not mean "untracked."** A tracked file with nothing
  unstaged looks identical, and the `/dev/null` fallback painted it entirely green. Settled with
  `ls-files --error-unmatch`.
- **A query key outside the invalidation prefix is never refreshed.** The diff key sat at
  `['diff', …]` rather than under `keys.status`, and with the client's `staleTime: Infinity` the
  pane held its first-loaded hunks for the life of the process — through edits, stages, discards.
- **State reset in an effect lands one render late.** The context reset ran after the render that
  had already issued its query, so the click after "show the whole file" fetched the *next* file
  in full — precisely what the reset exists to prevent. It adjusts during render now.
- **The Vite dev port is contended across worktrees.** Playwright's `reuseExistingServer` attached
  to whichever server reached 5173 first, running the suite against another checkout's source
  while looking entirely healthy. The e2e config owns its own port.

Deferred to `outstanding.md`: syntax highlighting inside diff lines, side-by-side mode.

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

## 2026-08-25 — Brand assets from the midnite app

The crescent mark and the Quick Kiss wordmark face are now the midnite app's own files rather than
placeholders: `resources/icon.icns` + `icon.png` become the macOS app icon, `logo.PNG` is the
in-app mark, and `quick-kiss.ttf` sets the wordmark. Same product family, same logo — an
approximation reads worse than none.

Worth knowing: the mark is an **opaque** disc (a black crescent on a white ground, transparent
only outside the circle). A CSS mask reads only the alpha channel, so masking it flattens it to a
featureless dot — it has to be an `<img>`, in the rounded-coin-with-a-hairline-ring treatment
midnite itself uses, which is also what makes one asset work on both themes.

## 2026-08-25 — Phase 13 · UI polish

Resizable panels (sidebar, terminal, commit detail, changes list) with geometry persisted in
`midnite-git.ui`; a full per-repo ref tree (Branches · Remotes · Tags · Worktrees) replacing the
worktree-only sidebar, with `FolderGit2` distinguishing a checkout from a branch; a lockable nav
rail; the theme toggle and an icon-only fetch/pull/push cluster moved into the title bar (with a
framed-window fallback, since `<TitleBar>` renders nothing off darwin); graph column headers with
resizable Author/Date/SHA driven by CSS custom properties so the memoised rows never re-render
during a drag; and a multi-select branch filter that re-runs the log stream server-side —
`LogOptions.revisions` already existed in the engine, only `log-service` hard-coded `--all`. Every
Unicode glyph is now a lucide icon, and motion is a two-keyframe vocabulary disarmed by
`applyMotion` under `prefers-reduced-motion`. Three CommandIds (`sync.fetch/pull/push`) that had
been declared with chords and menu items since Phase 9 finally have handlers. 304 tests green.
**Not verified visually** — Electron cannot reach the macOS window server from the agent's shell,
so the manual smoke and the screenshot are outstanding.


## 2026-08-25 — Sidebar: flush delimiters, collapsible sections, and a smoke run that works

Two fixes to the Phase 13 sidebar, plus the visual verification that phase had left open.

Each repo `<section>` carried `py-0.5` *and* `mt-0.5 … pt-1.5`, which put ~6px under the
delimiter against ~4px above it, so a selected repo's highlight floated clear of the rule above
it. The rule now carries no padding of its own — the repo row and the tree below it already have
theirs. Every subsection folds independently (Local · Remotes · Tags · Worktrees), state held as
the set of *closed* keys so a section defaults open, and `TreeSection` swapped its boolean
`indent` for a `depth` so each nesting level's heading indents left of its own rows. "Branches"
became **Local**: the section under it is branches too, and the old heading left the reader to
work out which was which.

Worth knowing: `moon run desktop:start` was never blocked by the macOS window server, which is
what Phase 13 recorded. It exits ~700ms with no output because `app.requestSingleInstanceLock()`
hands the launch to the packaged app in /Applications and quits — silently, by design. The lock
is keyed on `userData`, so `electron . --user-data-dir=<tmp>` runs a dev instance alongside the
installed one. With that plus `MGIT_OPEN_REPOS` and the `MGIT_CAPTURE` harness already in
`main/capture.ts`, the sidebar was screenshotted expanded and folded without touching the
user's running app — closing Phase 13's last two verification items.
## 2026-08-25 — Phase 14 · Graph themes, avatars, author filter

Four selectable graph styles (`git-graph` with solid nodes and arrowheads, `git-extensions`,
`sourcetree`, `gitkraken`) driven by a `GraphTheme` descriptor — git-engine untouched, since
lane assignment is already a pure function of history and a style only decides how lanes are
drawn. Gravatar avatars inside every commit node, hashed with SHA-256 via `crypto.subtle`
(no MD5 dependency), deduped by email so twelve authors across 50 000 commits is twelve
requests, with generated initials as both the first-paint and the failure state. The avatar
retires the Author column; name/email/date moved to a tooltip on the bubble. Ref chips moved
into a dedicated BRANCH / TAG column. An author filter that dims rather than removes —
`git log --author` omits commits without rewriting `%P`, which would leave the lane engine
holding a lane open per filtered-out parent. And Settings finally exists: a style picker that
draws the same synthetic history four ways, plus the shell's appearance runtime (seven
appliers and a 500-line stylesheet shipped since Phase 0 and never called). Playwright covers
it against a stubbed Gravatar. 422 unit tests + 10 e2e green. **Outstanding:** the ref-chip drag gesture
(Phase 8's merge/rebase) has no test and needs a human in the real app.

## 2026-08-25 — Phase 14 verification: the ref-chip drag gesture, under a real pointer

Closes the one item Phase 14 landed without: whether Phase 8's drag gestures survived the ref
chips moving into the BRANCH / TAG column. They did — `useRefDnd` is wired from `graph-row.tsx`,
so the wiring travelled with the chips — but nothing in the markup says so, which is why the
item was left for a human. `e2e/ref-drag.spec.ts` now drives merge, rebase and cherry-pick with
a real pointer through the Playwright mock bridge, and the mock's `ops` proxy records its calls
so each assertion lands on the *operation*, not just on a menu label: choosing "Merge X into Y"
has to reach `ops.merge({source: X})`. The guard cases come with it — a tag is neither a drag
source nor a drop target, a branch dropped on itself is a no-op, and a drop onto a branch that
is not checked out shows both items disabled with the reason attached. 8 tests, plus
`docs/screenshots/phase-14/drop-menu.png`.

Two things bit while writing it, both worth knowing before touching a dnd-kit test again.
**dnd-kit eats the click that trails a drag for 50ms** — `AbstractPointerSensor` adds a
document-level capture listener that `stopPropagation()`s `click` on activation and only tears
it down on a 50ms timeout. A human never meets it; a synthetic click lands inside the window
and dies before React's delegated listener sees it, so the menu item looks stone dead while a
DOM-level `.click()` on the same button works perfectly. **And `rectIntersection` collides the
DragOverlay's rect, not the dragged element's** — the overlay pill is sized by the text it
carries, so the first version of this spec dropped a commit on `main` and was offered a
cherry-pick onto `feature/drag-me` one row above. The fixture keeps ref-less rows around every
drop target now; that spacing is load-bearing.

445 unit tests + 26 e2e green.

## 2026-08-25 — Sidebar: per-repo sync, primary-checkout switching, status dots

The repository headers grew the sync control that only the title bar had: `↑n ↓n` plus
fetch / pull / push per repo, acting on **that** repo's primary checkout whether or not it is the
selected one. Which needed two generalisations rather than a copy — `useRepoStatus(target)` and
`useTargetedGitOp(target, …)`, with `useStatus`/`useGitOp` now the selected-checkout case of each —
and one extraction: `<SyncControls>` and `<AheadBehind>` are shared with the title bar, so the two
places cannot disagree about when Push is live.

When a button is live and when it is not is now a pure function, `syncAffordances(branch)`, and
every disabled state carries a reason. That forced a fix in `IconButton`: a real `disabled`
attribute suppresses mouse events in every engine, so the one state most in need of explaining was
the only one that could not raise a tooltip. With a `disabledReason` it switches to `aria-disabled`,
stays hoverable and swallows the click. The same rules feed the header's ellipsis menu, which
replaces the bare ✕ — Fetch/Pull/Push, a *Switch primary checkout to ▸* submenu, Copy path, and
Close, reachable from the ⋮ or a right-click anywhere on the row.

Switching the primary checkout also lands on the branch rows themselves, on right-click and as a
hover button, with git's own refusal spelled out (`Checked out in <path> — a branch can only be
checked out once`). The sidebar's menus stay non-destructive on purpose: delete and rename remain
on the graph's ref badges behind Phase 7's blast-radius gating. Remote rows offer *Create local
branch from origin/x…* instead of a checkout, because `git checkout origin/x` lands on a detached
HEAD, which is never what clicking a remote branch means.

The checked-out marker is now a `<BranchDot>`: the same dot, with a radial-gradient halo that
breathes (`halo-breathe`, the app's only ambient loop — scale/opacity only, so it stays off the
main thread, and reduced motion freezes it on its final frame) and a red/amber/green level from
`branchHealth()`. Only signals the app can justify get a colour — a paused merge or a conflict is
red, uncommitted changes are amber, a gone upstream is amber — and a clean tree deliberately
reports `unknown` and stays neutral white, because "you have not edited anything" is not a verdict
on the code and a sidebar of green dots would drown a real one. `ChecksVerdict` is the seam a test
run or a GitHub pipeline plugs into (todo/outstanding.md → Branch checks); nothing supplies one
yet, so every branch git has nothing to say about shows no dot at all rather than a green lie.
Worst-signal-wins, which is why the worktree rows carry their own dot for the checkout they name.

Fitting all that on a 256px row cost the header's branch chip while the repo is expanded — the
Local list two rows below names the same branch and marks it live — and the fresh-profile default
sidebar width went to 288. Verified in the app via `--user-data-dir` + `MGIT_OPEN_REPOS`: names
intact, `↑0 ↓0` with both counts dimmed, Pull/Push at `aria-disabled` + `opacity .4` with
`pointer-events: auto`, the submenu listing exactly the branches free to check out, and amber dots
on both dirty checkouts. `moon run :typecheck :lint :test` green, with 16 new unit tests across
`sync-availability` and `branch-health`. **Outstanding:** the light theme's amber was not screenshotted, and no
screenshot can show a pulse.
