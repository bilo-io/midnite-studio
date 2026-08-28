# Phase 24 — The explorer learns to write, and to search

[Phase 16](phase-16-explorer-and-settings-pages.md) shipped a Folder explorer that is read-only
*by contract* rather than by omission, and it said so in four places. The header comment on
[`shared/src/fs.ts`](../packages/shared/src/fs.ts) is the strongest of them: "There is deliberately
no write/rename/delete channel: 'read-only' is a property of this contract, not of whichever buttons
the UI happens to render." [`channels.ts`](../packages/shared/src/ipc/channels.ts) repeats it above
the two `mgit:fs:*` entries, [`bridge.ts`](../packages/shared/src/ipc/bridge.ts) repeats it above
`fs: { listDir, readFile }`, and
[`file-tree.tsx`](../packages/app/src/features/files/file-tree.tsx) closes the loop from the other
end — "read-only by construction — rows have no rename/delete affordance and the bridge has no
channel that could serve one."

This phase makes all four of those sentences false, deliberately, and rewrites them in the same
voice — the way [Phase 20](phase-20-reviews-page.md) handled `gh-cli.ts`'s "strictly reads" when it
added [`gh-write.ts`](../packages/desktop/src/main/forge/gh-write.ts) beside it. That precedent is
the whole shape of Theme B: a separate write module whose own doc comment states its bounds, so the
reader's claim about *itself* stays true.

The recon settled three things worth stating up front. First, **the jail cannot authorise a create
as it stands.** `confineToRoot()` in [`fs-scope.ts`](../packages/desktop/src/main/fs-scope.ts)
`realpath`s the target and returns `null` when it does not exist — correct for a browser, where
"not there" and "not allowed" earn the same answer, and useless for `new file`. A write path has to
confine the *parent* and then join the final segment itself. Second, **there is no editor in the
renderer at all** — no CodeMirror, no Monaco, no `contentEditable` anywhere;
[`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) is shiki into
`dangerouslySetInnerHTML` behind a 200 KB cap. Theme D adds the app's first real editor dependency.
Third, **the fs query keys were never registered** in
[`services/queries.ts`](../packages/app/src/services/queries.ts) — they are local literals in
`file-tree.tsx` — so [`watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts)
has never invalidated `['fs', …]` and an external edit does not refresh the tree today. Theme G
fixes that, and it stops being a nicety the moment the app itself is the thing doing the writing.

**Scope guardrails.** Writes are `scope: 'repo'` only — `claude-home` is rejected at the schema
level, not by hiding buttons, because writing into `~/.claude` is a different blast radius from
writing a repo file and [`agent-page.tsx`](../packages/app/src/features/settings/settings-pages/agent-page.tsx)
is the tree's second consumer. `FileTree` takes an opt-in `writable` prop for the same reason the
comment gutter is opt-in on the shared `DiffView`. Search is `git grep` only, so ignored and
untracked files are out of reach this phase. Nothing here edits binaries or files past the existing
1.5 MB `FS_TEXT_CAP_BYTES`, and nothing here moves files by drag.
[Phase 22](phase-22-stash-and-safety-net.md) and [Phase 23](phase-23-command-palette.md) are both
unstarted and both run ahead of this one; this phase shares no files with either and blocks neither.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The write contract (M) — ✅ DONE (2026-08-28)

Lands first; every other theme reads off it.

- [x] Widened [`shared/src/fs.ts`](../packages/shared/src/fs.ts) with the write half of the
      contract: `FsWriteScopeSchema` is `z.literal('repo')` — `claude-home` is not a member, so a
      write into `~/.claude` fails zod parsing at the boundary rather than being refused by a
      handler that someone can later "fix". Added `FS_WRITE_CAP_BYTES` (same ceiling as the read
      cap, deliberately — one number instead of two that can drift) and `FsVersionSchema` /
      `FsVersion` = `{ mtimeMs, size }`.
- [x] Rewrote the module's header comment to say what the write channels *are* and what still
      holds — repo scope only, relative paths only, the jail confines the parent, and failures are
      data. Same for the block above the fs entries in
      [`channels.ts`](../packages/shared/src/ipc/channels.ts) and the one above `fs:` in
      [`bridge.ts`](../packages/shared/src/ipc/bridge.ts).
- [x] Four new channels in [`channels.ts`](../packages/shared/src/ipc/channels.ts) —
      `fsWriteFile: 'mgit:fs:write-file'`, `fsCreate: 'mgit:fs:create'`, `fsRename: 'mgit:fs:rename'`,
      `fsDelete: 'mgit:fs:delete'` — with request schemas in
      [`schemas.ts`](../packages/shared/src/ipc/schemas.ts) built on `FsWriteScopeSchema`.
      `fsRename` carries independent `fromRelPath`/`toRelPath` (a general move; the UI only offers
      same-directory rename today) and `fsCreate` takes `kind: 'file' | 'directory'`. Responses are
      plain [`GitOpResult`](../packages/shared/src/domain/result.ts), the same envelope `handleOp`
      returns everywhere else.
- [x] Decided how a **stale write** rides that envelope: `GitOpResult`'s error arm gained an
      optional `code: 'stale-write'` discriminant rather than growing `ConflictOp` (which stays
      merge/rebase/cherry-pick/revert) a fs-shaped member. `failure()` takes the code as an
      optional third argument.
- [x] `FsReadFileResponse`'s `text` arm now carries `FsVersion`; `fs-handlers.ts`'s read handler
      fills it from the `fstat` it already has. `fsWriteFile` requires `expectedVersion` and main
      will refuse when it has moved (Theme B implements the actual refusal).
- [x] `fs.writeFile` / `create` / `rename` / `delete` added to the preload bridge
      ([`preload/index.ts`](../packages/desktop/src/preload/index.ts)) — `'fs'` was already in the
      namespace union, so this was four entries and no new surface.
- [x] Vitest in `ipc.test.ts`: every write request accepts repo scope and refuses `claude-home`;
      empty/NUL relPaths rejected; `fsCreate`'s kind is exactly `file | directory`; `fsRename`
      carries `fromRelPath`/`toRelPath`, not a bare `relPath`; a stale write parses as
      `{ok:false, code:'stale-write'}` and does not fit `ConflictOp`.

*No jail, no main-process write handlers, no UI yet — that's Themes B and C.*

### B — The jail learns to write (M) — ✅ DONE (2026-08-28)

The load-bearing theme. Everything a write can do wrong, it does wrong here.

- [x] New `desktop/src/main/fs-scope-write.ts` beside
      [`fs-scope.ts`](../packages/desktop/src/main/fs-scope.ts), following the
      [`gh-write.ts`](../packages/desktop/src/main/forge/gh-write.ts) precedent — a separate module
      with its own bounds comment. `confineParent(root, relPath)` shape-checks the whole path with
      `joinWithin` first (absolute paths, a `C:\` drive string, `..` traversal, NUL — the same guard
      the read jail applies, so a single-segment relPath with nothing to split on still gets it),
      then `realpath`s the **parent** and requires it under the real root, returning `{ dir, name }`
      with the final segment unresolved. Refuses a final segment that is `.`, `..`, empty, contains
      a separator, or is `.git` — and requires the immediate parent to already exist (no
      `mkdir -p`; nothing in the UI ever produces a multi-segment new path).
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
      how [`fs-handlers.ts`](../packages/desktop/src/main/ipc/fs-handlers.ts) is laid out (and now
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
- [x] Unit tests beside [`fs-scope.test.ts`](../packages/desktop/src/main/fs-scope.test.ts), in new
      `fs-scope-write.test.ts` (39 cases) and `ipc/fs-write-handlers.test.ts` (16 cases):
      `confineParent` over `..` traversal, absolute paths, a `C:\` string, NUL, an empty/separator
      final segment, a symlinked parent pointing out of the root, `.git` at any depth and as a final
      segment; `isSymlinkTarget` on a real file, a symlink, and a dangling symlink; `createFile`/
      `openForOverwrite` refusing a pre-existing symlink; and, at the handler level, an overwrite
      refusing on a stale `FsVersion` with `{ok:false, code:'stale-write'}` rather than a throw, a
      refused binary overwrite, a refused oversized write, and rename/delete/create collision and
      symlink refusals.

### C — Mutations in the tree (M)

- [ ] `file-tree.tsx` grows its first `onContextMenu`. The machinery is well-worn — see
      [`graph-row.tsx`](../packages/app/src/features/graph/graph-row.tsx),
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) and
      [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx)
      — but there is no `useContextMenu` hook and each caller holds its own `{ position, target }`
      state. Follow the local pattern; do not invent a shared hook for the fourth caller.
- [ ] A `writable?: boolean` prop on `FileTree`, defaulting **false**. `agent-page.tsx` mounts the
      same tree on the `claude-home` scope and must keep every affordance it has today, without
      needing to know that write channels now exist.
- [ ] Menu entries: New File, New Folder, Rename, Delete, plus Reveal in Finder and Copy Relative
      Path (both free, both wanted, neither a write). Directory rows and file rows get different
      sets; the root row gets New File / New Folder only.
- [ ] Rename is **inline on the row**, not a dialog — the row becomes an input, `Enter` commits,
      `Escape` reverts, and the name is validated against the same rules Theme B enforces so the
      user sees the refusal before the round trip.
- [ ] Delete goes through [`confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx)
      with a real blast radius, per the Phase 7 pattern and `CLAUDE.md`'s rule: the file count and
      total size for a directory, and **how many of them are uncommitted** — read off the same
      status cache Theme F joins against. "3 files, 2 with unsaved changes to Git" is the sentence
      that stops the wrong delete; "Are you sure?" is not.
- [ ] Every mutation invalidates its own fs subtree on success. Do not invalidate the whole `['fs']`
      root — each directory in `file-tree.tsx` holds its own `useQuery` and expansion *is* mounting,
      so a broad invalidation collapses and refetches the visible tree for a one-file rename.
- [ ] A created file is selected and opened in the preview immediately. Creating a file you then
      have to find is a worse version of the same action.

### D — The preview pane becomes an editor (L)

The largest theme, and the only one that adds a dependency.

- [ ] Add **CodeMirror 6** to [`packages/app/package.json`](../packages/app/package.json) — and only
      there. Phase 16's decision log records "shiki over highlight.js/CodeMirror", but that was a
      call about *previewing*; nothing in it argued CodeMirror is wrong for an editor, because
      Phase 16 had no editor. The alternative considered here was a raw `<textarea>` over the shiki
      render — there is precedent for raw textareas in
      [`status-panel.tsx`](../packages/app/src/features/status/status-panel.tsx) and
      [`comment-composer.tsx`](../packages/app/src/features/reviews/comment-composer.tsx) — and it
      was rejected because re-highlighting a whole file per keystroke fights the 200 KB cap the
      preview already has, and because line numbers and bracket matching are the minimum bar for a
      thing calling itself an editor.
- [ ] New `features/files/preview/code-editor.tsx` beside `code-preview.tsx`. The preview keeps
      shiki for read mode; the editor owns edit mode. **Both highlighters stay in the app** — see
      the decision at the foot of this doc.
- [ ] Edit mode is entered explicitly, and `file-preview.tsx`'s literal `read-only` badge becomes
      the toggle rather than a label that has quietly stopped being true.
- [ ] Dirty state, and `Cmd+S` routed through the `CommandId` registry rather than a bare keydown —
      by the time this lands, [Phase 23](phase-23-command-palette.md) has made that registry the one
      dispatch path, so a new command belongs in it and gets a palette row for free.
- [ ] An unsaved-changes guard on: selecting another file, switching repo or worktree, leaving the
      Files view, and closing the window. Use
      [`confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx); Save / Discard /
      Cancel, with Cancel as the safe default.
- [ ] Stale-write handling that is honest. When main refuses on a moved `FsVersion`, say the file
      changed on disk and offer to reload — **do not** silently overwrite and do not silently
      discard. This is the one place a wrong answer loses work the user typed.
- [ ] Editing is refused, visibly, for binary files, files past `FS_TEXT_CAP_BYTES`, and anything
      the read returned as `too-large`. The fallback card says which.

### E — Find in files (M)

- [ ] New [`git-engine/src/commands/grep.ts`](../packages/git-engine/src/commands/grep.ts) —
      `git grep -z -n -I --no-color`, NUL-delimited like everything else, modelled on
      [`ignore.ts`](../packages/git-engine/src/commands/ignore.ts)'s batched single call. Plain
      Node over `execGit`, no `electron`, exported from
      [`commands/index.ts`](../packages/git-engine/src/commands/index.ts).
- [ ] New `parsers/grep-parser.ts` with a pure `parseGrep(payload)` and its own unit tests, per the
      repo's split between the command that spawns and the parser that is testable without one.
- [ ] Options that matter and nothing else: case sensitivity, whole word, and fixed-string vs
      regular expression (`-F` / `-E`). Result and per-file caps, with the cap **stated in the UI**
      when it bites — a truncated result list that does not say so is a lie.
- [ ] One read channel (`mgit:fs:search`) and its handler, calling git-engine from
      `desktop/src/main/ipc/` — never shelling out to git from `desktop` directly, which nothing in
      the repo does today.
- [ ] A search panel above the tree in
      [`files-view.tsx`](../packages/app/src/features/files/files-view.tsx): a query input, results
      grouped by file with matched-line context, and a click that opens the file in the preview
      **at the line**. Reuse the resizable split that is already there rather than adding a third
      pane.
- [ ] `git grep` searches tracked content only. Say so in the empty state when a query returns
      nothing — "no tracked file matches" is a different fact from "no match", and the difference is
      the whole reason the untracked case is out of scope.

### F — Status badges on tree rows (S)

The cheapest theme in the phase; the join already exists in miniature.

- [ ] Join `StatusEntry` against tree rows by path. `StatusEntry.path` is documented in
      [`shared/src/domain/status.ts`](../packages/shared/src/domain/status.ts) as "repo-relative,
      forward-slashed, already unquoted" — byte-identical to how `file-tree.tsx` builds `relPath`.
      **No normalisation is needed, and none should be added**; a normalising helper here would
      paper over the day the two conventions diverge.
- [ ] Read it off the existing cache. `useRepoStatus` is already fetched by the sidebar and the
      Changes panel, and
      [`file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx) already does
      exactly this lookup for one question. A per-row badge costs a `Map` get, not a subprocess.
- [ ] Colour by `StatusCode`, which is a ten-value enum — modified, added, deleted, renamed,
      conflicted, untracked, ignored are all distinguishable, so the badge distinguishes them rather
      than collapsing to "changed". Respect `isPlaceholderData`: an empty status that has not loaded
      must not render as "clean", per the honesty rule already written into
      [`use-status.ts`](../packages/app/src/services/use-status.ts).
- [ ] Directory rollup. `entries` is flat, so the aggregate is built here —
      [`build-change-tree.ts`](../packages/app/src/components/build-change-tree.ts) already turns
      changed paths into a path tree for the Changes panel and is the thing to reuse, not
      reimplement with a prefix scan.

### G — fs invalidation, live (S)

- [ ] Move the fs query keys out of `file-tree.tsx` and into
      [`services/queries.ts`](../packages/app/src/services/queries.ts) beside `keys.status` /
      `keys.refs` / `keys.stats`, where every other key in the app lives. They were never registered
      there, which is precisely why the next item has never worked.
- [ ] Teach [`watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts) to
      invalidate `['fs', …]` on a `worktree` event. Phase 16 called watcher-driven tree refresh a
      stretch and set manual refresh as the bar; that was defensible for a viewer and is not
      defensible for an app that writes.
- [ ] Suppress the echo. Every write in Themes C and D fires a `worktree` event of its own, and the
      naive wiring makes a save invalidate the file being edited underneath the cursor. The
      per-repo write queue's `onActivity` suppression is the existing pattern
      ([`write-queue.ts`](../packages/git-engine/src/exec/write-queue.ts)) — mirror its shape rather
      than debouncing and hoping.
- [ ] Keep the manual refresh button. A watcher that misses an event is a watcher; a UI with no way
      to ask again is a bug report.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/fs.ts`](../packages/shared/src/fs.ts) (write scope, `FsVersion`, `FS_WRITE_CAP_BYTES`, header rewritten), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts), [`domain/result.ts`](../packages/shared/src/domain/result.ts) (read, not changed) |
| Main — fs write | new `main/fs-scope-write.ts`, new `main/ipc/fs-write-handlers.ts`, [`main/fs-scope.ts`](../packages/desktop/src/main/fs-scope.ts) (unchanged; load-bearing), [`main/ipc/fs-handlers.ts`](../packages/desktop/src/main/ipc/fs-handlers.ts) (version token on the read), [`main/ipc/handle.ts`](../packages/desktop/src/main/ipc/handle.ts), [`main/index.ts`](../packages/desktop/src/main/index.ts) (register), [`preload/index.ts`](../packages/desktop/src/preload/index.ts) |
| Main — search | new `main/ipc/fs-search-handler.ts` (or the entry beside the existing `mgit:fs:*` handlers) |
| git-engine | new [`commands/grep.ts`](../packages/git-engine/src/commands/grep.ts), new `parsers/grep-parser.ts`, [`commands/index.ts`](../packages/git-engine/src/commands/index.ts), [`exec/git-exec.ts`](../packages/git-engine/src/exec/git-exec.ts) (unchanged) |
| Renderer — files | [`features/files/file-tree.tsx`](../packages/app/src/features/files/file-tree.tsx) (context menu, `writable`, badges, inline rename), [`features/files/files-view.tsx`](../packages/app/src/features/files/files-view.tsx) (search panel), [`features/files/files-store.ts`](../packages/app/src/features/files/files-store.ts) (dirty + edit mode), [`features/files/file-icons.tsx`](../packages/app/src/features/files/file-icons.tsx), new `features/files/use-file-actions.ts`, new `features/files/file-search.tsx` |
| Renderer — preview | [`preview/file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx) (the `read-only` badge becomes a toggle), [`preview/code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) (read mode, unchanged), new `preview/code-editor.tsx`, [`lib/languages.ts`](../packages/app/src/lib/languages.ts) (a CodeMirror language map beside `LANG_BY_EXT`), [`lib/highlighter.ts`](../packages/app/src/lib/highlighter.ts) (unchanged) |
| Renderer — shared | [`services/queries.ts`](../packages/app/src/services/queries.ts), [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts), [`services/use-status.ts`](../packages/app/src/services/use-status.ts) (read), [`components/context-menu.tsx`](../packages/app/src/components/context-menu.tsx) (reused), [`components/confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx), [`components/build-change-tree.ts`](../packages/app/src/components/build-change-tree.ts) (reused for the rollup), [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) (`file.save`) |
| Untouched, deliberately | [`features/settings/settings-pages/agent-page.tsx`](../packages/app/src/features/settings/settings-pages/agent-page.tsx) — the tree's second consumer stays read-only with no change at its call site |
| Deps | [`packages/app/package.json`](../packages/app/package.json) (CodeMirror 6, app only) |
| Docs | [`CLAUDE.md`](../CLAUDE.md), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`todo/outstanding.md`](outstanding.md) (explorer editing, search-in-files and status badges come off the list) |
| Tests | [`main/fs-scope.test.ts`](../packages/desktop/src/main/fs-scope.test.ts), new `fs-scope-write.test.ts`, new `grep-parser.test.ts`, new `grep.integration.test.ts`, new `file-search.test.ts`, new `status-badge.test.ts`, new `e2e/files-write.spec.ts`, [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean, and asserted deliberately for this phase: `shared/src/fs.ts` still imports
      only zod and no workspace package; `commands/grep.ts` and `parsers/grep-parser.ts` import no
      `electron`; `packages/app` imports no `node:fs`, no git-engine and no desktop, and reaches
      every write through `window.midniteGit`; CodeMirror appears in `packages/app/package.json`
      and nowhere else.
- [ ] Vitest (B): `confineParent` refuses `..` traversal, absolute paths, a `C:\` string, NUL, an
      empty or separator-bearing final segment, a symlinked parent that resolves out of root, a
      symlinked final segment, a dangling symlink, and any path under `.git/` — **each with its own
      case, because a single "rejects bad input" test is how one of these silently stops being
      checked.**
- [ ] Vitest (B): overwrite refuses when the caller's `FsVersion` does not match `fstat`, and the
      refusal arrives as `{ ok: false, kind: 'error' }` rather than a throw.
- [ ] Vitest (E): `parseGrep` over a match with a colon in the path, a binary file skipped by `-I`,
      a file with no trailing newline, an empty result, and a result at the cap.
- [ ] Vitest (F): the status join by path, the ten `StatusCode` values mapping to distinct badges,
      the directory rollup over nested changes, and `isPlaceholderData` rendering as unknown rather
      than clean.
- [ ] Vitest (G): a `worktree` event invalidates `['fs', …]`, and a write's own echo does not.
- [ ] e2e over the mock bridge: create, rename and delete each move the tree; a delete shows the
      blast radius before it happens; edit → save → the preview shows the new content; the unsaved
      guard fires on navigate; search results open the file at the line. Per Phase 20's rule,
      **mocked writes must mutate seeded state** — an `ok: true` that changed nothing must not pass.
- [ ] e2e: the Settings ▸ Agent page's tree still offers no write affordance, asserted rather than
      assumed.
- [ ] **Open, for a human:** a real repository — rename a file that is staged, delete a directory
      with uncommitted work in it, edit a file while `git checkout` moves it underneath, and confirm
      the deleted file is in the macOS Trash and restorable.
- [ ] **Open, for a human:** a repo large enough to make `git grep` interesting, and a directory
      large enough to make the invalidation strategy visible.
- [ ] Screenshots: the context menu on a tree row, the editor in edit mode with a dirty buffer, the
      delete confirm showing blast radius, search results, and status badges with a directory rollup.

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
  [Phase 20](phase-20-reviews-page.md) left it.

## Decisions / open questions

- **Resolved (brainstorm) — CodeMirror 6, not a `<textarea>`.** The textarea route has real
  precedent in the repo's composers and needs no dependency, but re-highlighting a whole file per
  keystroke fights the preview's 200 KB shiki cap, and an editor without line numbers or bracket
  matching is a demo. Phase 16's "shiki over CodeMirror" was a decision about rendering a preview,
  not about editing.
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
- **Open — shiki and CodeMirror both in one app.** *Recommendation:* accept it. CodeMirror owns edit
  mode, shiki owns read mode and every diff in the app
  ([`line-highlight.ts`](../packages/app/src/features/diff/line-highlight.ts), Phase 20). Unifying
  on CodeMirror's highlighter would mean re-theming every diff surface in the product to buy
  consistency nobody can see, since the two never render at the same time. Revisit only if the
  themes visibly disagree across the read/edit toggle — the same file should not change colour when
  you start typing in it, and that is the one thing worth spending effort to reconcile.
- **Open — where does the search cap sit, and is it per-file or total?**
  *Recommendation:* both — roughly 20 matches per file and 500 total — with the truncation stated in
  the results header. A single total cap makes one enormous file swallow the whole result set,
  which is the failure mode that makes a search feel broken rather than limited.
- **Open — does the editor autosave?** *Recommendation:* no. Explicit `Cmd+S` with a visible dirty
  indicator, because autosave into a git working tree changes what `git status` says without the
  user having asked, and this app's whole job is telling the truth about `git status`.
- **Open — should Theme F's badges also appear in the Phase 23 palette's file source?**
  *Recommendation:* yes if trivial, and not worth a dependency between the phases. The palette's
  file source reads a different list (`list-files`), so this is a small addition there rather than
  anything this phase must ship.
