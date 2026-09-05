# Phase 24 — The explorer learns to write, and to search

**Refined: x1** · 2026-09-05 · file-map precision, testing & verification, out-of-scope tightening, dependency hygiene

> **Refine note (2026-09-05) — read this before trusting Theme D.** Themes A–G all landed on
> 2026-08-28, but the tree has moved under this doc since, and three of its load-bearing claims are
> now false:
>
> 1. **CodeMirror 6 is gone.** [Phase 64](phase-64-offline-monaco-and-themes.md) Theme C (PR #164)
>    rewrote [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) on
>    `@monaco-editor/react` — same component signature, same `data-testid`. Its own docblock says so.
>    The seven `@codemirror/*` entries are **still in
>    [`packages/app/package.json`](../../../packages/app/package.json) with zero importers anywhere in
>    the repo**: that is Theme H below, and it is the single most useful thing left in this phase.
> 2. **`fs-activity.ts` is in git-engine, not desktop.** Theme G says
>    `desktop/src/main/fs-activity.ts`; it is
>    [`git-engine/src/exec/fs-activity.ts`](../../../packages/git-engine/src/exec/fs-activity.ts),
>    and it had to be — the watcher that consumes it
>    ([`watch/repo-watcher.ts`](../../../packages/git-engine/src/watch/repo-watcher.ts)) is in
>    git-engine, and `shared ◀ git-engine ◀ desktop` means desktop can import git-engine but never
>    the other way round. `fs-write-handlers.ts` reaches it through the package's public export.
> 3. **Several file paths in the map were never real.** `file-search.tsx`, `fs-scope-key.ts`,
>    `fs-search-handler.ts` (singular), `file-search.test.ts` and `status-badge.test.ts` are all
>    fictions or renames; the corrected map is in *Files this phase touches*.
>
> Nothing else in Themes A–C, E and F has drifted — every path, symbol and count in them was
> re-verified against the tree on 2026-09-05 and the corrections are inline as *As built* bullets.

[Phase 16](phase-16-explorer-and-settings-pages.md) shipped a Folder explorer that is read-only
*by contract* rather than by omission, and it said so in four places. The header comment on
[`shared/src/fs.ts`](../../../packages/shared/src/fs.ts) is the strongest of them: "There is deliberately
no write/rename/delete channel: 'read-only' is a property of this contract, not of whichever buttons
the UI happens to render." [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) repeats it above
the two `mstudio:fs:*` entries, [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) repeats it above
`fs: { listDir, readFile }`, and
[`file-tree.tsx`](../../../packages/app/src/features/files/file-tree.tsx) closes the loop from the other
end — "read-only by construction — rows have no rename/delete affordance and the bridge has no
channel that could serve one."

This phase makes all four of those sentences false, deliberately, and rewrites them in the same
voice — the way [Phase 20](phase-20-reviews-page.md) handled `gh-cli.ts`'s "strictly reads" when it
added [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) beside it. That precedent is
the whole shape of Theme B: a separate write module whose own doc comment states its bounds, so the
reader's claim about *itself* stays true.

The recon settled three things worth stating up front. First, **the jail cannot authorise a create
as it stands.** `confineToRoot()` in [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts)
`realpath`s the target and returns `null` when it does not exist — correct for a browser, where
"not there" and "not allowed" earn the same answer, and useless for `new file`. A write path has to
confine the *parent* and then join the final segment itself. Second, **there is no editor in the
renderer at all** — no CodeMirror, no Monaco, no `contentEditable` anywhere;
[`code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) is shiki into
`dangerouslySetInnerHTML` behind a 200 KB cap. Theme D adds the app's first real editor dependency.
Third, **the fs query keys were never registered** in
[`services/queries.ts`](../../../packages/app/src/services/queries.ts) — they are local literals in
`file-tree.tsx` — so [`watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts)
has never invalidated `['fs', …]` and an external edit does not refresh the tree today. Theme G
fixes that, and it stops being a nicety the moment the app itself is the thing doing the writing.

**Scope guardrails.** Writes are `scope: 'repo'` only — `claude-home` is rejected at the schema
level, not by hiding buttons, because writing into `~/.claude` is a different blast radius from
writing a repo file and [`agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx)
is the tree's second consumer. `FileTree` takes an opt-in `writable` prop for the same reason the
comment gutter is opt-in on the shared `DiffView`. Search is `git grep` only, so ignored and
untracked files are out of reach this phase. Nothing here edits binaries or files past the existing
1.5 MB `FS_TEXT_CAP_BYTES`, and nothing here moves files by drag.
[Phase 22](phase-22-stash-and-safety-net.md) and [Phase 23](phase-23-command-palette.md) are both
unstarted and both run ahead of this one; this phase shares no files with either and blocks neither.
*(Both have since shipped. Phase 23's palette is what `file.save` and the `Mod+s` chord are reached
through, so Theme D's "should fall back to the current `useKeybindings` handler map if it does not
[exist]" contingency is moot — the dispatcher is there.)*

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The write contract (M) — ✅ DONE (2026-08-28)

Lands first; every other theme reads off it.

- [x] Widened [`shared/src/fs.ts`](../../../packages/shared/src/fs.ts) with the write half of the
      contract: `FsWriteScopeSchema` is `z.literal('repo')` — `claude-home` is not a member, so a
      write into `~/.claude` fails zod parsing at the boundary rather than being refused by a
      handler that someone can later "fix". Added `FS_WRITE_CAP_BYTES` (same ceiling as the read
      cap, deliberately — one number instead of two that can drift) and `FsVersionSchema` /
      `FsVersion` = `{ mtimeMs, size }`.
- [x] Rewrote the module's header comment to say what the write channels *are* and what still
      holds — repo scope only, relative paths only, the jail confines the parent, and failures are
      data. Same for the block above the fs entries in
      [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) and the one above `fs:` in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts).
- [x] Four new channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) —
      `fsWriteFile: 'mstudio:fs:write-file'`, `fsCreate: 'mstudio:fs:create'`, `fsRename: 'mstudio:fs:rename'`,
      `fsDelete: 'mstudio:fs:delete'` — with request schemas in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) built on `FsWriteScopeSchema`.
      `fsRename` carries independent `fromRelPath`/`toRelPath` (a general move; the UI only offers
      same-directory rename today) and `fsCreate` takes `kind: 'file' | 'directory'`. Responses are
      plain [`GitOpResult`](../../../packages/shared/src/domain/result.ts), the same envelope `handleOp`
      returns everywhere else.
- [x] Decided how a **stale write** rides that envelope: `GitOpResult`'s error arm gained an
      optional `code: 'stale-write'` discriminant rather than growing `ConflictOp` (which stays
      merge/rebase/cherry-pick/revert) a fs-shaped member. `failure()` takes the code as an
      optional third argument.
- [x] `FsReadFileResponse`'s `text` arm now carries `FsVersion`; `fs-handlers.ts`'s read handler
      fills it from the `fstat` it already has. `fsWriteFile` requires `expectedVersion` and main
      will refuse when it has moved (Theme B implements the actual refusal).
- [x] `fs.writeFile` / `create` / `rename` / `delete` added to the preload bridge
      ([`preload/index.ts`](../../../packages/desktop/src/preload/index.ts)) — `'fs'` was already in the
      namespace union, so this was four entries and no new surface.
- [x] Vitest in `ipc.test.ts`: every write request accepts repo scope and refuses `claude-home`;
      empty/NUL relPaths rejected; `fsCreate`'s kind is exactly `file | directory`; `fsRename`
      carries `fromRelPath`/`toRelPath`, not a bare `relPath`; a stale write parses as
      `{ok:false, code:'stale-write'}` and does not fit `ConflictOp`.

*No jail, no main-process write handlers, no UI yet — that's Themes B and C.*

### B — The jail learns to write (M) — ✅ DONE (2026-08-28)

The load-bearing theme. Everything a write can do wrong, it does wrong here.

- [x] New `desktop/src/main/fs-scope-write.ts` beside
      [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts), following the
      [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) precedent — a separate module
      with its own bounds comment. `confineParent(root, relPath)` shape-checks the whole path with
      `joinWithin` first (absolute paths, a `C:\` drive string, `..` traversal, NUL — the same guard
      the read jail applies, so a single-segment relPath with nothing to split on still gets it),
      then `realpath`s the **parent** and requires it under the real root, returning `{ dir, name }`
      with the final segment unresolved. Refuses a final segment that is `.`, `..`, empty, contains
      a separator, or is `.git` — and requires the immediate parent to already exist (no
      `mkdir -p`; nothing in the UI ever produces a multi-segment new path).
      *As built, with the real signatures:*
      `export interface ConfinedTarget { dir: string; name: string }` and
      `export async function confineParent(root: string, relPath: string): Promise<ConfinedTarget | null>`.
      **`hasGitSegment` and `isValidFinalSegment` are module-private**, not exports — a test reaches
      them through `confineParent`, which is deliberate and should stay that way. The module also
      exports five helpers this doc never named:
      `targetPath(target): string`, `targetExists(target): Promise<boolean>`,
      `ensureConfinedDirs(root, relPath): Promise<boolean>`,
      `confineTree(root, target): Promise<string | null>` and
      `describeFsError(error: unknown): string`. `confineParent` guards NUL and `.git` **first**
      (`if (relPath.includes('\0') || hasGitSegment(relPath)) return null;`), before any `realpath`,
      so a hostile path never reaches the filesystem at all.
- [x] Refuses a **symlink as the final segment** of write, rename and delete via
      `isSymlinkTarget()` (`lstat().isSymbolicLink()`, a dangling link included). Create refuses the
      same case for free — `O_CREAT | O_EXCL` fails outright if anything, symlink included, already
      sits at the target.
- [x] Refuses any path under `.git/` outright, at any depth (`hasGitSegment`), not just as a final
      segment.
- [x] Closes the TOCTOU window by writing through a descriptor rather than re-resolving the path by
      name: `open(path, O_CREAT | O_EXCL | O_WRONLY)` for create, `open(path, O_RDWR | O_NOFOLLOW)`
      for overwrite (stronger than a bare `'r+'` — the open call itself refuses a symlink swapped in
      after confinement), `fstat` compared against the caller's `FsVersion`, write through the same
      handle. A new directory has no descriptor to open through, so `createDirectory` closes the
      narrower residual race with `mkdir` (which already refuses `EEXIST`) plus an immediate
      `lstat` re-check.
- [x] New `desktop/src/main/ipc/fs-write-handlers.ts` with `registerFsWriteHandlers()`, mirroring
      how [`fs-handlers.ts`](../../../packages/desktop/src/main/ipc/fs-handlers.ts) is laid out (and now
      exports the shared `SNIFF_BYTES` constant so the two files can't drift on the binary-sniff
      threshold). Delete goes through Electron's `shell.trashItem()` — macOS Trash, recoverable in
      Finder — not `unlink`. Enforces `FS_WRITE_CAP_BYTES` and re-sniffs the on-disk bytes for a
      NUL before overwriting, refusing a binary target the renderer could not really have loaded as
      text. Rename refuses a destination that already exists (fail closed, no silent `mv`-style
      clobber); a shared `describeFsError()` maps `ENOENT`/`EACCES`/`EEXIST`/etc. to one message
      table across all four handlers.
- [x] Decided the write-queue question and wrote it down in the module comment: fs writes stay
      **outside** `write-queue.ts` — that queue exists to serialise writers racing on
      `index.lock`, and a plain file write never touches it, exactly like an external editor
      saving the same file. The consequence (the watcher's own write-echo) is left for Theme G.
- [x] Unit tests beside [`fs-scope.test.ts`](../../../packages/desktop/src/main/fs-scope.test.ts), in new
      `fs-scope-write.test.ts` (39 cases) and `ipc/fs-write-handlers.test.ts` (16 cases):
      `confineParent` over `..` traversal, absolute paths, a `C:\` string, NUL, an empty/separator
      final segment, a symlinked parent pointing out of the root, `.git` at any depth and as a final
      segment; `isSymlinkTarget` on a real file, a symlink, and a dangling symlink; `createFile`/
      `openForOverwrite` refusing a pre-existing symlink; and, at the handler level, an overwrite
      refusing on a stale `FsVersion` with `{ok:false, code:'stale-write'}` rather than a throw, a
      refused binary overwrite, a refused oversized write, and rename/delete/create collision and
      symlink refusals.
      *As built:* **27** cases in `fs-scope-write.test.ts` (not 39 — the count in the original text
      was wrong) and 16 in `ipc/fs-write-handlers.test.ts`, whose stale-write case reads
      `expect(result).toMatchObject({ ok: false, code: 'stale-write' })`. A third file the doc never
      named also exists: `ipc/fs-handlers.test.ts`.

### C — Mutations in the tree (M) — ✅ DONE (2026-08-28)

- [x] `file-tree.tsx` grows its first `onContextMenu`, plus a hover ellipsis (`repos-panel.tsx`'s
      shared-`openMenu`-closure pattern) — both feed the one `useDialogs().openMenu`, no
      new context-menu hook. A right-click on empty tree space (now `h-full`, matching a real
      file explorer's clickable background) opens a root menu.
- [x] A `writable?: boolean` prop on `FileTree`, defaulting **false**. `agent-page.tsx`'s
      `claude-home` tree is unchanged at its call site and wires no menu at all, asserted in
      `files-write.spec.ts`.
- [x] Menu entries: New File, New Folder, Rename, Delete, plus Reveal in Finder and Copy Relative
      Path (both free, both wanted, neither a write). Directory rows and file rows get different
      sets; the root row gets New File / New Folder only. Reveal needed a new read-only
      `mstudio:shell:show-item-in-folder` channel (`FsRepoScope`-scoped, confined through the same
      jail as every other fs read) — no such channel existed.
- [x] Rename is **inline on the row**, not a dialog — the row becomes an input (`data-testid`
      `inline-name-input`), `Enter` commits, `Escape` reverts, blur commits-or-cancels with a
      `settledRef` guard against double-firing. `validateEntryName` (empty / `/` / `.`, `..`,
      `.git` / sibling collision) runs client-side against the directory's already-loaded
      listing before any round trip. New File/Folder reuses the same inline row, pre-filled
      (`Untitled` / `New Folder`) and pre-selected so typing replaces it, and auto-expands a
      collapsed target directory.
- [x] Delete goes through `confirm-dialog.tsx`'s `warnings` line (not the commit-shaped
      `blastRadius` field — that one had to be pinned `null` explicitly, or the dialog reads its
      `undefined` as "still counting" and never stops saying so): a file's warning is "unsaved
      changes to Git" when it has one; a directory's is `dirStats` (new `mstudio:fs:dir-stats` read,
      a capped breadth-first walk, `FS_DIR_STATS_WALK_CAP`) joined with an uncommitted count
      filtered out of the same `statusIndex.byPath` Theme F already builds — no second status
      fetch.
- [x] Every mutation invalidates only its own fs subtree (`[...fsScopeKey(scope), 'dir', parent]`).
- [x] A created file is selected and opened in the preview immediately.
- [x] `use-file-actions.ts` (new): every verb above, plus `validateEntryName`/`joinRelPath`/
      `parentOf`; `fs-scope-key.ts` split out of `file-tree.tsx` to keep the two files from
      importing each other. Vitest for the pure helpers and the `files-store.ts` editing state;
      desktop unit tests for `dirStats`/`showItemInFolder`; a new `files-write.spec.ts` (12
      Playwright cases) plus schema coverage in `ipc.test.ts`. Found and fixed along the way: the
      e2e mock bridge's `listDir` handed out the *live* `fsDirs` array by reference, so
      react-query's structural-sharing equality check saw "no change" after a mutation and
      silently never repainted — fixed by returning a copy per read.
      Screenshots: `docs/screenshots/phase-24-c/{context-menu,inline-create,delete-confirm}.png`.

### D — The preview pane becomes an editor (L) — ✅ DONE (2026-08-28) · ⚠️ **superseded in part**

The largest theme, and the only one that adds a dependency.

> **The dependency it added has since been replaced.** Everything below about *dirty state, the
> `file.save` command, the navigation guard and the stale-write banner* is still exactly what the
> app does — those are store- and store-adjacent behaviours, and Phase 64 did not touch them. Only
> the **editor widget itself** changed: `code-editor.tsx` is Monaco now
> ([Phase 64](phase-64-offline-monaco-and-themes.md) Theme C, PR #164, 2026-09-05), pinned as
> `@monaco-editor/react` 4.7.0 + `monaco-editor` 0.56.0, with the theme wiring living in
> `packages/app/src/lib/monaco/` and `features/themes/`. Read the first bullet below as history: it
> records **why an editor library at all**, which is still the operative decision. Theme H cleans up
> what the swap left behind.

- [x] Added **CodeMirror 6** to [`packages/app/package.json`](../../../packages/app/package.json) — and
      only there, as hand-picked `@codemirror/{state,view,commands,language,language-data,
      autocomplete,search}` extensions rather than the bundled `basicSetup` meta-package, the same
      call the fuzzy matcher and the hand-drawn chart made elsewhere in this repo. Phase 16's
      decision log records "shiki over highlight.js/CodeMirror", but that was a call about
      *previewing*; nothing in it argued CodeMirror is wrong for an editor, because Phase 16 had no
      editor. The alternative considered here was a raw `<textarea>` over the shiki render — there
      is precedent for raw textareas in
      [`status-panel.tsx`](../../../packages/app/src/features/status/status-panel.tsx) and
      [`comment-composer.tsx`](../../../packages/app/src/features/reviews/comment-composer.tsx) — and it
      was rejected because re-highlighting a whole file per keystroke fights the 200 KB cap the
      preview already has, and because line numbers and bracket matching are the minimum bar for a
      thing calling itself an editor. Language grammar comes from `@codemirror/language-data`'s
      `LanguageDescription.matchFilename`, resolved by filename rather than reusing
      `languages.ts`'s shiki-id table — the two highlighters have no shared vocabulary for a grammar
      name. **Code-split**: `code-editor.tsx` is `React.lazy`-loaded from `file-preview.tsx`, found
      in review — a static import pulled the whole CM6 graph into every Files-view load, editing or
      not, and cost multiple seconds on a cold Vite dev-server compile.
- [x] New `features/files/preview/code-editor.tsx` beside `code-preview.tsx`. The preview keeps
      shiki for read mode; the editor owns edit mode. **Both highlighters stay in the app** — see
      the decision at the foot of this doc. A hand-rolled `EditorView.theme()` reading the app's own
      `hsl(var(--background))`-style CSS tokens, rather than a community theme package, so the
      editor matches the app's palette exactly in both themes with no second dependency.
- [x] Edit mode is entered explicitly, and `file-preview.tsx`'s literal `read-only` badge becomes
      the toggle rather than a label that has quietly stopped being true — `read-only` now renders
      only for what genuinely has no write channel (`claude-home`, non-text results).
- [x] Dirty state, and `Cmd+S` routed through the `CommandId` registry rather than a bare keydown —
      a new `file.save` command (group `files`, chord `Mod+s`) reads `file-editor-store`'s
      `target`/dirty state in `useCommandHandlers()`, the same way `status.commit` reads
      `commit-box-store`'s registered handle.
- [x] An unsaved-changes guard on: selecting another file, switching repo or worktree, leaving the
      Files view (including the title bar's Back/Forward), and closing the window. Centralised
      rather than scattered per call site: `ui-store`'s `setActiveView`/`selectRepo`/
      `selectWorktree`/`goBack`/`goForward` all defer through
      [`store/file-editor-store.ts`](../../../packages/app/src/store/file-editor-store.ts)'s
      `guardNavigation` — note the path: the store lives in `packages/app/src/store/`, beside
      `ui-store.ts`, **not** under `features/files/`, because `ui-store` is what defers into it and
      a features-level store would invert that dependency. The guard — when the open file is dirty —
      parks the real state change in `pendingNav` instead of
      applying it. A `beforeunload` listener in `app.tsx` does the same for closing the window,
      re-issuing `window.close()` once the guard resolves. [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx)
      gained an optional `secondaryLabel`/`onSecondary` pair for the three-way Save / Discard /
      Cancel prompt ([`features/files/preview/file-editor-guard.tsx`](../../../packages/app/src/features/files/preview/file-editor-guard.tsx),
      mounted once from `app.tsx`), with Cancel — its
      existing built-in button — as the safe default.
      *As built:* the window-close half is `useUnsavedCloseGuard()` in `app.tsx`, and
      `file-editor-store.test.ts` sits beside the store. Both survived the Monaco swap untouched —
      which is the point of having put the dirty state in a store rather than in the widget.
- [x] Stale-write handling that is honest. When main refuses on a moved `FsVersion`, an inline
      banner above the editor says the file changed on disk and offers Reload (re-reads and adopts
      the new content/version) or Keep editing (dismisses the banner, edits untouched) — **never**
      a silent overwrite or a silent discard.
- [x] Editing is refused, visibly, for binary files, files past `FS_TEXT_CAP_BYTES`, and anything
      the read returned as `too-large` — the Edit toggle itself does not render for a non-text
      result; the existing `FallbackCard` states which.

Found and fixed in self-review: the guard dialog's `blastRadius` was left `undefined`, which
`ConfirmDialog` reads as "still being counted" and renders "Checking what this affects…" forever —
fixed to the explicit `null` the delete confirm already established for a warnings-only dialog.

### E — Find in files (M) — ✅ DONE (2026-08-28)

- [x] New [`git-engine/src/commands/grep.ts`](../../../packages/git-engine/src/commands/grep.ts) —
      `git grep -z -n -I --no-color`, NUL-delimited like everything else, modelled on
      [`ignore.ts`](../../../packages/git-engine/src/commands/ignore.ts)'s batched single call. Plain
      Node over `execGit`, no `electron`, exported from
      [`commands/index.ts`](../../../packages/git-engine/src/commands/index.ts).
- [x] New `parsers/grep-parser.ts` with a pure `parseGrep(payload)` and its own unit tests, per the
      repo's split between the command that spawns and the parser that is testable without one.
- [x] Options that matter and nothing else: case sensitivity, whole word, and fixed-string vs
      regular expression (`-F` / `-E`). Result and per-file caps, with the cap **stated in the UI**
      when it bites — a truncated result list that does not say so is a lie. Per-file cap (50) is
      `-m` itself; the 2,000-total cap is enforced in the handler and reported as `truncated`.
      *As built, and both numbers are shared constants — do not re-derive them:*
      `FS_SEARCH_MAX_MATCHES_PER_FILE = 50` and `FS_SEARCH_MAX_MATCHES = 2000` in
      [`shared/src/fs.ts`](../../../packages/shared/src/fs.ts) (`:77` and `:80`). `grep.ts` takes
      the per-file one as an optional `maxPerFile?: number` and pushes it as `-m`; the handler
      slices at the total and sets `truncated`, because `-m` bounds one file and can therefore
      never bound a response.
- [x] One read channel (`mstudio:fs:search`) and its handler, calling git-engine from
      `desktop/src/main/ipc/` — never shelling out to git from `desktop` directly, which nothing in
      the repo does today. Its own `fs-search-handlers.ts` rather than joining `fs-handlers.ts`:
      that file's reads are plain `node:fs` confined by `fs-scope.ts`; this one's trust boundary is
      `resolveWorkdir`, the one every git-op handler already crosses.
      *As built:* the file is `ipc/fs-search-handlers.ts` — **plural**, matching every other handler
      module; the file map's `fs-search-handler.ts` was never a real path. It has its own
      `fs-search-handlers.test.ts` (5 cases). The channel is
      `CHANNELS.fsSearch: 'mstudio:fs:search'`, and it is a **different channel** from
      [Phase 25](phase-25-search-everywhere.md)'s `mstudio:search:*` family — that phase built a
      streamed, cross-repo search and left this one alone. Do not merge them.
- [x] A search panel above the tree in
      [`files-view.tsx`](../../../packages/app/src/features/files/files-view.tsx): a query input, results
      grouped by file with matched-line context, and a click that opens the file in the preview
      **at the line**. Reuse the resizable split that is already there rather than adding a third
      pane. Split into an always-mounted `SearchBar` (the query has to stay typeable at zero
      length) and a `SearchResults` list that replaces `FileTree` only while a query is active.
      "At the line" reuses Shiki's own per-line `<span class="line">` wrapping to scroll and
      flash the match — the real per-line row model is Phase 25 D's rewrite of `CodePreview`, not
      this phase's.
      *As built:* the two files are
      [`features/files/search-panel.tsx`](../../../packages/app/src/features/files/search-panel.tsx)
      (exporting `SearchBar` and `SearchResults`) and
      [`features/files/use-file-search.ts`](../../../packages/app/src/features/files/use-file-search.ts).
      There is no `file-search.tsx` and there never was. Its e2e cover is
      [`e2e/files-search.spec.ts`](../../../packages/app/e2e/files-search.spec.ts) (4 cases), not
      the `file-search.test.ts` the old file map named.
- [x] `git grep` searches tracked content only. Say so in the empty state when a query returns
      nothing — "no tracked file matches" is a different fact from "no match", and the difference is
      the whole reason the untracked case is out of scope.

### F — Status badges on tree rows (S) — ✅ DONE (2026-08-28)

The cheapest theme in the phase; the join already exists in miniature.

- [x] Join `StatusEntry` against tree rows by path. `StatusEntry.path` is documented in
      [`shared/src/domain/status.ts`](../../../packages/shared/src/domain/status.ts) as "repo-relative,
      forward-slashed, already unquoted" — byte-identical to how `file-tree.tsx` builds `relPath`.
      No normalisation added; new `features/files/file-status.ts` keys `byPath` straight off
      `entry.path`.
- [x] Read it off the existing cache: `useRepoStatus` inside a new `useFileStatusIndex` in
      `file-tree.tsx`, mirroring the single-path lookup
      [`file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) already
      does. A per-row badge costs a `Map` get, not a subprocess.
- [x] Colour by `StatusCode` via the existing `StatusMark`/`primaryCode` — reused rather than a
      second glyph table. `isPlaceholderData` is respected: `resolveFileStatusIndex` returns
      `undefined` while status hasn't actually answered yet, so a row never renders a false
      "clean" (no-badge) state, matching the honesty rule in
      [`use-status.ts`](../../../packages/app/src/services/use-status.ts).
- [x] Directory rollup — **not** via `build-change-tree.ts`. That module collapses a single-child
      directory chain into one row for the Changes panel, but `file-tree.tsx` lists every literal
      fs level individually (lazy, one `listDir` per directory), so a collapsed intermediate level
      would resolve to no rollup entry at all. `file-status.ts` instead walks every changed path's
      literal ancestors once, building a worst-status-wins `Map<dirPath, StatusBadge>` that matches
      `file-tree.tsx`'s own directory granularity exactly.
      Decision recorded: gitignored rows (`entry.isIgnored`) never render a badge — the existing
      dimming already signals "not part of the repo", and in practice no `StatusEntry` would match
      such a path anyway (`getStatus` runs with `--ignored=no`).
      Ten new Vitest cases in `file-status.test.ts`; a Playwright case in `files-view.spec.ts`
      asserting the collapsed-directory rollup, the per-file badges, and the "no entry → no badge"
      case, with a screenshot at `docs/screenshots/phase-24-f/status-badges.png`.

### G — fs invalidation, live (S) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] Moved the fs query keys out of the standalone `fs-scope-key.ts` and into
      [`services/queries.ts`](../../../packages/app/src/services/queries.ts) as `keys.fs`/`keys.fsRepo`,
      beside `keys.status` / `keys.refs` / `keys.stats`.
      *As built:* `fs-scope-key.ts` was **deleted**, not emptied, and `FsScopeInput` moved with the
      keys (`queries.ts:51`). `keys.fsRepo(repoId) => ['fs','repo',repoId]` and `keys.fs(scope)`
      appends `scope.worktreePath ?? null`, so `fsRepo` is a genuine prefix of `fs` — which is what
      makes the coarse invalidation below correct rather than lucky. One wart worth knowing:
      `files-view.tsx:16` imports `type FsScopeInput` from `./file-tree`, which re-exports it,
      rather than from `services/queries` directly.
- [x] Taught [`watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts) to
      invalidate `keys.fsRepo(repoId)` on a `worktree` event — a coarser prefix than `keys.fs`
      itself, since the watcher only ever learns a `repoId`, never which worktree changed.
- [x] Suppressed the echo with a new `fs-activity.ts`, mirroring `write-queue.ts`'s `onActivity`
      shape but keyed per `repoId` (a write in one repo cannot suppress another's watcher — unlike
      the write queue's own global broadcast) and with its own 150ms settle window, shorter than
      the write queue's 300ms since a plain file write has no `index.lock`-style tail. Wrapped
      through `fs-write-handlers.ts` at registration, one choke point, so the four handlers stay
      plain functions a unit test can call directly.
      *As built, and the package is not the one this doc named:* the module is
      [`git-engine/src/exec/fs-activity.ts`](../../../packages/git-engine/src/exec/fs-activity.ts),
      **not** `desktop/src/main/fs-activity.ts`. It has to be — its consumer is
      [`git-engine/src/watch/repo-watcher.ts`](../../../packages/git-engine/src/watch/repo-watcher.ts),
      and under `shared ◀ git-engine ◀ desktop` a git-engine module cannot import from desktop.
      Exports: `class FsActivity`, `type FsActivityListener = (repoId: string, active: boolean) => void`,
      the `fsActivity` singleton, and `withFsActivity<T>(repoId, task): Promise<T>` — re-exported
      from `git-engine/src/index.ts` and used by `fs-write-handlers.ts` as
      `withFsActivity(req.repoId, () => writeFile(req))` on each of the four handlers. The 150ms is
      `RepoWatcherOptions.fsSettleMs` (defaulted at `repo-watcher.ts:99`), and an *active* write
      holds the gate for up to 60s (`repo-watcher.ts:150`) so a slow write cannot leak an echo
      through the tail of the window.
- [x] Kept the manual refresh button in `files-view.tsx`, untouched.

*Themes A–G landed 2026-08-28 and the explorer writes, edits, searches and badges as designed. The
three themes below are what a 2026-09-05 audit against the tree turned up: one real cleanup the
Monaco swap left behind, and two verification gaps. All three are deliberately S — nothing here
needs a day.*

### H — Drop the dead CodeMirror dependencies (S)

Theme D added seven `@codemirror/*` packages; [Phase 64](phase-64-offline-monaco-and-themes.md)
Theme C replaced the editor with Monaco and left them installed. **`grep -rn "codemirror"` over
`packages/*/src` and `packages/app/e2e` returns zero hits today** — they are pure install weight and
a trap for the next reader, who will reasonably assume the editor is CodeMirror because
`package.json` says so.

- [ ] Remove all seven entries from
      [`packages/app/package.json`](../../../packages/app/package.json)'s `dependencies`:
      `@codemirror/autocomplete`, `@codemirror/commands`, `@codemirror/language`,
      `@codemirror/language-data`, `@codemirror/search`, `@codemirror/state`, `@codemirror/view`.
      Nothing else in the workspace lists any of them — this is one file.
- [ ] Re-run the install to update `pnpm-lock.yaml`
      (`export GITHUB_PACKAGES_TOKEN=$(gh auth token)` first, per `CLAUDE.md`), and commit the
      lockfile change with the `package.json` one.
- [ ] **Prove it before removing, not after:** `grep -rn "codemirror" packages/ --include='*.ts'
      --include='*.tsx' --include='*.json' -i` must show hits only in `package.json` and
      `pnpm-lock.yaml`. If any source file matches, the removal is wrong and this theme stops.
- [ ] Correct the places the repo still tells a reader the editor is CodeMirror. This doc's Theme D
      and its decision entry are already corrected by this refine pass;
      [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) never mentioned it at all (checked);
      what is left is [`.midnite/tasks/outstanding.md:45`](../outstanding.md) ("the
      Monaco/CodeMirror surface"), which should now just say Monaco. Leave `done.md` alone — it is
      an append-only historical log and the entry was true when written.
- [ ] Record the numbers, per `CLAUDE.md`'s "perf claims come with a number" rule: run
      `node scripts/perf/bundle-report.mjs` before and after. The expectation is **no change to the
      entry chunk** — nothing imported these, so nothing bundled them — and a smaller
      `node_modules`. If the entry chunk moves at all, something did import them and the audit was
      wrong.
- [ ] `moon run :typecheck :lint :test` green afterwards, and
      [`e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts) (5 cases) still
      passes — it exercises Monaco through the same `data-testid` Phase 64 preserved.

### I — The verification gaps that are real (S)

Most of the original Verification list is already covered by tests on disk (the counts are in the
list below). Two gaps are genuine, and both are in the search half.

- [ ] [`grep-parser.test.ts`](../../../packages/git-engine/src/parsers/grep-parser.test.ts) has
      **two** cases — a fixture round-trip and a CRLF case — against a Verification line that asks
      for five. Add the three that are missing, each as its own `it`:
      **(a)** a match in a path containing a colon (`src/a:b.ts`), proving the parser splits on the
      NUL field separators and never on `:`;
      **(b)** a file with no trailing newline, proving the last record is not dropped;
      **(c)** an empty payload → `{ matches: [] }`, no throw.
- [ ] The fixture is named `__fixtures__/grep-z-context.txt` and `GrepMatch` carries
      `kind: 'match' | 'context'`, but **no case asserts a `context` line is parsed as one**. Add
      it — a context line mis-typed as a match is a silently wrong result list, which is the exact
      failure mode this parser exists to prevent.
- [ ] The result-at-the-cap case the Verification list asks for belongs in
      `fs-search-handlers.test.ts`, not the parser: the parser has no cap, the handler slices at
      `FS_SEARCH_MAX_MATCHES` and sets `truncated`. Assert `truncated === true` and
      `matches.length === FS_SEARCH_MAX_MATCHES` for a 2,001-match payload, and `truncated === false`
      at exactly 2,000.
- [ ] Delete the two fictional test files from this doc's file map — `file-search.test.ts` and
      `status-badge.test.ts` were never created, and their real substitutes already exist
      (`fs-search-handlers.test.ts`, and `file-status.test.ts`'s 10 cases plus
      `files-view.spec.ts:238`). *(Done in this refine — the item is here so the theme's reviewer
      knows to check the map rather than re-create the files.)*

### J — The visual and human passes (S)

- [ ] `docs/screenshots/phase-24-d/{editor-clean,editor-dirty,editor-guard}.png` were taken against
      **CodeMirror** and are now misleading reference images. Phase 64 committed
      `docs/screenshots/p64-abcd/code-editor-{light,dark}.png` — which covers the *editor widget* in
      both themes but **not** the dirty buffer or the Save/Discard/Cancel guard, the two states this
      phase actually owns. So: regenerate all three against Monaco via
      [`e2e/files-editor-shots.spec.ts`](../../../packages/app/e2e/files-editor-shots.spec.ts) and
      keep `phase-24-d/`; do not delete it in favour of Phase 64's pair.
- [ ] The other three screenshot sets (`phase-24-c/`, `-e/`, `-f/`) are still accurate — the context
      menu, inline create, delete confirm, search results and status badges have not changed. Confirm
      rather than assume, then leave them alone.
- [ ] **Open, for a human:** a real repository — rename a file that is staged, delete a directory
      with uncommitted work in it, edit a file while `git checkout` moves it underneath, and confirm
      the deleted file is in the macOS Trash and restorable. This is the item the original
      Verification list carried; `shell.trashItem()` cannot be asserted over the mock bridge.
- [ ] **Open, for a human:** a repo large enough to make `git grep` interesting, and a directory
      large enough to make the invalidation strategy visible — specifically whether the 150ms
      `fsSettleMs` window is long enough that the app's own writes never echo back as watcher
      events, and short enough that an *external* edit still refreshes the tree promptly.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/fs.ts`](../../../packages/shared/src/fs.ts) (write scope, `FsVersion`, `FS_WRITE_CAP_BYTES`, header rewritten), [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), [`domain/result.ts`](../../../packages/shared/src/domain/result.ts) (read, not changed) |
| Main — fs write | new `main/fs-scope-write.ts`, new `main/ipc/fs-write-handlers.ts`, [`main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) (unchanged; load-bearing), [`main/ipc/fs-handlers.ts`](../../../packages/desktop/src/main/ipc/fs-handlers.ts) (version token on the read), [`main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts), [`main/index.ts`](../../../packages/desktop/src/main/index.ts) (register), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) |
| Main — search | new [`main/ipc/fs-search-handlers.ts`](../../../packages/desktop/src/main/ipc/fs-search-handlers.ts) — **plural**; the singular `fs-search-handler.ts` this map used to name never existed. Its `fs-search-handlers.test.ts` (5 cases) sits beside it. |
| git-engine | new [`commands/grep.ts`](../../../packages/git-engine/src/commands/grep.ts), new [`parsers/grep-parser.ts`](../../../packages/git-engine/src/parsers/grep-parser.ts) + `__fixtures__/grep-z-context.txt`, [`commands/index.ts`](../../../packages/git-engine/src/commands/index.ts), new [`exec/fs-activity.ts`](../../../packages/git-engine/src/exec/fs-activity.ts) **(Theme G — this package, not desktop)**, [`watch/repo-watcher.ts`](../../../packages/git-engine/src/watch/repo-watcher.ts) (`fsSettleMs`), [`index.ts`](../../../packages/git-engine/src/index.ts) (re-export), [`exec/git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) (**unchanged**) |
| Renderer — files | [`features/files/file-tree.tsx`](../../../packages/app/src/features/files/file-tree.tsx) (context menu, `writable`, badges, inline rename), [`features/files/files-view.tsx`](../../../packages/app/src/features/files/files-view.tsx) (search panel), [`features/files/files-store.ts`](../../../packages/app/src/features/files/files-store.ts) (edit mode), [`features/files/file-icons.tsx`](../../../packages/app/src/features/files/file-icons.tsx), new [`features/files/use-file-actions.ts`](../../../packages/app/src/features/files/use-file-actions.ts), new [`features/files/file-status.ts`](../../../packages/app/src/features/files/file-status.ts), new [`features/files/search-panel.tsx`](../../../packages/app/src/features/files/search-panel.tsx) (`SearchBar` + `SearchResults`) and new [`features/files/use-file-search.ts`](../../../packages/app/src/features/files/use-file-search.ts) — **there is no `file-search.tsx`**. `fs-scope-key.ts` was created and then **deleted** by Theme G; `FsScopeInput` lives in `services/queries.ts`. |
| Renderer — editor state | new [`store/file-editor-store.ts`](../../../packages/app/src/store/file-editor-store.ts) (+ `.test.ts`) — under `store/`, beside `ui-store.ts`, **not** `features/files/`; new [`features/files/preview/file-editor-guard.tsx`](../../../packages/app/src/features/files/preview/file-editor-guard.tsx) |
| Renderer — preview | [`preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) (the `read-only` badge becomes a toggle), [`preview/code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) (read mode, shiki — it **never** used CodeMirror, whatever `done.md:3174` implies), new [`preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) (**now Monaco**, Phase 64 C), [`lib/languages.ts`](../../../packages/app/src/lib/languages.ts), [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) (**unchanged**) |
| Arrived later, owned elsewhere — **do not edit from this phase** | `packages/app/src/lib/monaco/{monaco-loader.ts, monaco-languages.ts, editor-prefs.ts}` and `features/themes/` ([Phase 64](phase-64-offline-monaco-and-themes.md)); `preview/blame-store.ts` and `preview/find-bar.tsx` ([Phase 25](phase-25-search-everywhere.md) D–F); [`components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), which is how `FilesView` is mounted now — `app.tsx`'s view ternary is gone ([Phase 60](phase-60-view-registry-and-error-boundaries.md)) |
| Renderer — shared | [`services/queries.ts`](../../../packages/app/src/services/queries.ts), [`services/watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts), [`services/use-status.ts`](../../../packages/app/src/services/use-status.ts) (read), [`components/context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) (reused), [`components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx), [`components/build-change-tree.ts`](../../../packages/app/src/components/build-change-tree.ts) (reused for the rollup), [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) (`file.save`) |
| Untouched, deliberately | [`features/settings/settings-pages/agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx) — the tree's second consumer stays read-only with no change at its call site |
| Deps | [`packages/app/package.json`](../../../packages/app/package.json) — Theme D added seven `@codemirror/*` entries, app-only. Phase 64 C replaced the editor with `@monaco-editor/react` 4.7.0 + `monaco-editor` 0.56.0 and left all seven installed with **zero importers**; **Theme H removes them**, which also touches `pnpm-lock.yaml`. |
| Docs | [`CLAUDE.md`](../../../CLAUDE.md), [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md), [`.midnite/tasks/outstanding.md`](../outstanding.md) (explorer editing, search-in-files and status badges come off the list) |
| Tests (written) | [`main/fs-scope.test.ts`](../../../packages/desktop/src/main/fs-scope.test.ts) · [`main/fs-scope-write.test.ts`](../../../packages/desktop/src/main/fs-scope-write.test.ts) (27) · [`main/ipc/fs-write-handlers.test.ts`](../../../packages/desktop/src/main/ipc/fs-write-handlers.test.ts) (16) · `main/ipc/fs-handlers.test.ts` · [`main/ipc/fs-search-handlers.test.ts`](../../../packages/desktop/src/main/ipc/fs-search-handlers.test.ts) (5) · [`parsers/grep-parser.test.ts`](../../../packages/git-engine/src/parsers/grep-parser.test.ts) (2 — thin, see Theme I) · [`commands/grep.integration.test.ts`](../../../packages/git-engine/src/commands/grep.integration.test.ts) (8) · [`exec/fs-activity.test.ts`](../../../packages/git-engine/src/exec/fs-activity.test.ts) · [`features/files/file-status.test.ts`](../../../packages/app/src/features/files/file-status.test.ts) (10) · [`store/file-editor-store.test.ts`](../../../packages/app/src/store/file-editor-store.test.ts) · [`services/watch-invalidation.test.ts`](../../../packages/app/src/services/watch-invalidation.test.ts) · [`e2e/files-write.spec.ts`](../../../packages/app/e2e/files-write.spec.ts) (12) · [`e2e/files-view.spec.ts`](../../../packages/app/e2e/files-view.spec.ts) (9) · [`e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts) (5) · [`e2e/files-search.spec.ts`](../../../packages/app/e2e/files-search.spec.ts) (4) · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) |
| Tests — **fictional, never created** | `file-search.test.ts` and `status-badge.test.ts` were named by the original map and do not exist. Do not create them: their coverage lives in `fs-search-handlers.test.ts` / `e2e/files-search.spec.ts` and `file-status.test.ts` / `files-view.spec.ts:238` respectively. |
| Screenshots | `docs/screenshots/phase-24-c/{context-menu,inline-create,delete-confirm}.png` · `phase-24-d/{editor-clean,editor-dirty,editor-guard}.png` **(stale — pre-Monaco, Theme J regenerates)** · `phase-24-e/{search-results,search-open-at-line}.png` · `phase-24-f/status-badges.png`. There is no `phase-24-a/-b/-g` — those themes have nothing visual. |

## Verification

Assertion-level, reconciled against the tree on 2026-09-05. Items marked *(written)* have their
spec on disk with the case count given — Themes I and J run and extend them; they do not rewrite
them. The human passes live in Theme J, not here, so a reader can see at a glance that this list is
entirely machine-checkable.

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean, and asserted deliberately for this phase: `shared/src/fs.ts` still imports
      only zod and no workspace package; `commands/grep.ts`, `parsers/grep-parser.ts` and
      `exec/fs-activity.ts` import no `electron`; `packages/app` imports no `node:fs`, no git-engine
      and no desktop, and reaches every write through `window.midniteStudio`. **The old wording of
      this line said "CodeMirror appears in `packages/app/package.json` and nowhere else" — after
      Theme H it must appear nowhere at all**, and the editor dependency to check for app-only
      confinement is `@monaco-editor/react` / `monaco-editor`.
- [ ] *(written — `fs-scope-write.test.ts`, 27 cases)* `confineParent` refuses `..` traversal,
      absolute paths, a `C:\` string, NUL, an empty or separator-bearing final segment, a symlinked
      parent that resolves out of root, a symlinked final segment, a dangling symlink, and any path
      under `.git/` — **each with its own case, because a single "rejects bad input" test is how one
      of these silently stops being checked.**
- [ ] *(written — `ipc/fs-write-handlers.test.ts`, 16 cases)* overwrite refuses when the caller's
      `FsVersion` does not match `fstat`, and the refusal arrives as
      `{ ok: false, code: 'stale-write' }` rather than a throw; plus the refused binary overwrite,
      the refused oversized write, and the rename/delete/create collision and symlink refusals.
- [ ] **Net-new (I):** `parseGrep` over a match with a colon in the path, a file with no trailing
      newline, an empty payload, and a `kind: 'context'` line typed as context rather than as a
      match. `grep-parser.test.ts` has 2 cases today against a list that asks for five.
- [ ] **Net-new (I):** the cap case belongs to `fs-search-handlers.test.ts`, not the parser —
      `truncated === true` with `matches.length === FS_SEARCH_MAX_MATCHES` at 2,001 matches, and
      `truncated === false` at exactly 2,000.
- [ ] *(written — `file-status.test.ts`, 10 cases; `files-view.spec.ts:238`)* the status join by
      path, `StatusCode` values mapping to distinct badges, the directory rollup over nested changes
      via the literal-ancestor walk, and `isPlaceholderData` rendering as unknown rather than clean.
- [ ] *(written — `services/watch-invalidation.test.ts:35`, asserting
      `toContainEqual(['fs','repo','repo-1'])`)* a `worktree` event invalidates the repo's whole fs
      cache. The other half — a write's own echo **not** reaching the watcher — is asserted in
      git-engine, in `exec/fs-activity.test.ts` and `watch/repo-watcher.test.ts`, because that is
      where `fs-activity.ts` and the settle window actually live.
- [ ] *(written — `e2e/files-write.spec.ts`, 12 cases)* create, rename and delete each move the
      tree; a delete shows the blast radius before it happens; a colliding name shows an inline
      error and creates nothing; `Escape` reverts a rename in flight; New Folder auto-expands a
      collapsed directory; the hover ellipsis opens the same menu as right-click. Per Phase 20's
      rule, **mocked writes must mutate seeded state** — an `ok: true` that changed nothing must not
      pass, which is exactly the by-reference `listDir` bug Theme C found.
- [ ] *(written — `e2e/files-editor.spec.ts`, 5 cases)* edit → save → the preview shows the new
      content, and the unsaved guard fires on navigate. These run against **Monaco** now and must
      keep passing through Theme H unchanged — they are the proof that removing the CodeMirror deps
      changed nothing.
- [ ] *(written — `e2e/files-search.spec.ts`, 4 cases)* search results open the file at the line,
      and the empty state says "no tracked file matches" rather than "no match".
- [ ] *(written — `e2e/files-write.spec.ts:213`)* the Settings ▸ Agent page's tree still offers no
      write affordance, asserted rather than assumed — `agent-page.tsx` passes no `writable` prop and
      `file-tree.tsx` defaults it `false`.
- [ ] **Net-new (H):** `grep -rn "codemirror" packages/ -i` matches nothing outside
      `pnpm-lock.yaml`, and `scripts/perf/bundle-report.mjs` shows **no** entry-chunk change across
      the removal.

## Not in this phase

- **Writing to `claude-home`.** Rejected at the schema level, not by the UI. Editing agent settings
  in-app is a reasonable feature and a different one: it needs its own thinking about what a bad
  write to a live agent config does, and it should not arrive as a side effect of a repo file
  browser growing a Save button.
- **Searching ignored and untracked files.** `git grep` covers tracked content and nothing else. A
  jail-honouring directory walk in main would cover the rest and is greenfield perf work over a
  large tree; the empty state names the gap so nobody has to discover it.
- **Drag-to-move in the tree.** `dnd-kit` is already in the app from
  [Phase 8](phase-8-drag-drop-ops.md), so this is cheap to add later and not free to add well —
  drop targets on a lazily-mounted tree with auto-expand-on-hover is its own problem.
- **Multi-file operations.** No multi-select, no bulk delete, no rename-across-imports. One path per
  call keeps the jail's reasoning about a single confined path intact, which is worth more this
  phase than the ergonomics.
- **An undo stack for file edits.** CodeMirror's own history covers the buffer. A cross-file undo of
  filesystem mutations is the shape [Phase 22](phase-22-stash-and-safety-net.md) is already thinking
  about for git ops, and Trash covers the irreversible case.
- **Side-by-side diff.** Still waiting on a full-width diff surface that does not exist, exactly as
  [Phase 20](phase-20-reviews-page.md) left it — and now owned by
  [Phase 26](phase-26-side-by-side-diffs.md).
- **Status badges in the command palette's file source.** [Phase 23](phase-23-command-palette.md)'s
  palette reads `list-files`, a different list off a different cache; giving it Theme F's badges
  means teaching it about `useRepoStatus` inside a palette's per-keystroke budget. That is a palette
  decision, not an explorer one.
- **Anything about Monaco itself** — its loader, its language map, its theme registry, its
  preferences. All of that is [Phase 64](phase-64-offline-monaco-and-themes.md)'s, which is still
  WIP. Theme H removes what CodeMirror left behind and touches nothing Monaco owns.
- **Merging `mstudio:fs:search` into Phase 25's `mstudio:search:*`.** They answer different
  questions — this one is a synchronous, capped, single-repo `git grep` feeding a panel above the
  tree; that one is a streamed cross-repo search with its own registry. One channel serving both
  would be a worse version of each.

## Decisions / open questions

- **Resolved (brainstorm) — an editor library, not a `<textarea>`.** *(Originally: "CodeMirror 6".)*
  The textarea route has real precedent in the repo's composers and needs no dependency, but
  re-highlighting a whole file per keystroke fights the preview's 200 KB shiki cap, and an editor
  without line numbers or bracket matching is a demo. Phase 16's "shiki over CodeMirror" was a
  decision about rendering a preview, not about editing. **This decision survived the library
  changing under it:** [Phase 64](phase-64-offline-monaco-and-themes.md) Theme C swapped CodeMirror 6
  for Monaco and the reasoning above is unaffected — it was never an argument for CodeMirror
  specifically, only against hand-rolling one.
- **Resolved (brainstorm) — `git grep`, not a directory walk.** It respects `.gitignore` for free,
  it is fast on large repos, and it lives in git-engine where the boundary is already clean. The
  cost is the untracked-files gap, which is stated in the UI rather than hidden.
- **Resolved (brainstorm) — repo scope only, `writable` opt-in.** Two gates rather than one: the
  contract cannot express a `claude-home` write, and the tree renders no affordance unless a caller
  asks for it. Either alone would be enough; both together mean a future refactor has to defeat two
  deliberate things instead of forgetting one.
- **Resolved (brainstorm) — Trash plus a blast-radius confirm.** `shell.trashItem()` makes delete
  recoverable in Finder, and the confirm follows `CLAUDE.md`'s rule for destructive ops. The
  git-native alternative — `git rm` for tracked paths, Trash for untracked — was rejected for this
  phase: two code paths and a split mental model ("where did my file go?" having two answers) for a
  gain that the Changes panel already provides once the deletion shows up there anyway.
- **Resolved (brainstorm) — `mtimeMs + size`, not a content hash.** It catches the case that loses
  work (something else wrote the file) at the cost of two numbers. Hashing catches
  touch-without-change, which loses nothing.
- **Resolved (brainstorm) — Phases 22 and 23 run first.** This phase shares no files with either and
  is blocked by neither, but the destructive-git safety net and the command palette both land ahead
  of it; Theme D's `Cmd+S` assumes Phase 23's dispatcher exists and should fall back to the current
  `useKeybindings` handler map if it does not.
*The four entries below were `**Open**` until the 2026-09-05 refine pass. There was no human in that
session; three of them turned out to be answerable from the tree rather than from taste, and the
fourth is resolved with its reason stated. Each records the choice **and** why.*

- **Resolved (refine x1) — two highlighters in one app is accepted, and the pair is now shiki +
  Monaco.** *(Was: "Open — shiki and CodeMirror both in one app.")* The original recommendation was
  to accept it, and the tree accepted it: Monaco owns edit mode, shiki owns read mode
  (`code-preview.tsx`, which despite `done.md:3174`'s wording never used an editor library) and
  every diff surface
  ([`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts), Phase 20).
  Unifying would mean re-theming every diff in the product to buy consistency nobody can see, since
  the two never render at the same time. **What has changed is that the reconciliation caveat now
  has an owner:** [Phase 64](phase-64-offline-monaco-and-themes.md)'s cross-surface theme registry
  is precisely the "revisit if the themes visibly disagree across the read/edit toggle" clause,
  built. Nothing for this phase to do.
- **Resolved (refine x1) — both caps, at 50 per file and 2,000 total, as shared constants.** *(Was:
  "Open — where does the search cap sit, and is it per-file or total?")* The recommendation's shape
  was right — both, because a single total cap lets one enormous file swallow the result set — but
  its **numbers were wrong**: the code shipped `FS_SEARCH_MAX_MATCHES_PER_FILE = 50` and
  `FS_SEARCH_MAX_MATCHES = 2000` ([`shared/src/fs.ts:77,80`](../../../packages/shared/src/fs.ts)),
  not the recommended 20/500. Resolving to the shipped numbers rather than the recommended ones:
  they are in `shared`, so both main and the renderer read one source, and 20/500 would now be a
  behaviour change dressed as a decision. The per-file cap is git's own `-m`; the total is enforced
  after parsing, because `-m` cannot bound a response.
- **Resolved (refine x1) — no autosave.** Explicit `Mod+s` via
  `{ id: 'file.save', label: 'Save File', group: 'files', chord: 'Mod+s' }`
  ([`shared/src/keybindings.ts:233`](../../../packages/shared/src/keybindings.ts)), with a visible
  dirty indicator — because autosave into a git working tree changes what `git status` says without
  the user having asked, and this app's whole job is telling the truth about `git status`. Confirmed
  against the tree: `file-editor-store.ts` has no debounce or timer, and the chord survived
  [Phase 25](phase-25-search-everywhere.md) F's keybinding reshuffle (which moved `sync.fetch` and
  `search.open`, not this).
- **Resolved (refine x1) — the palette's file source does not get Theme F's badges, and that stays
  out of this phase.** [Phase 23](phase-23-command-palette.md)'s palette has since shipped and reads
  a different list (`list-files`) from a different cache; wiring a status badge into it means
  teaching the palette about `useRepoStatus`, which is a palette decision with a palette's
  performance budget, not a Files-explorer one. Recorded in *Not in this phase*.
