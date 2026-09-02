# Phase 22 — Stash, the reflog, and writes you can take back

Twenty-one phases in, Midnite Studio can merge, rebase, cherry-pick, reset behind a blast-radius
confirm, and review a pull request without leaving the window — and it still cannot put work down
for five minutes. `git stash` appears nowhere in the codebase: a grep across all four packages
finds it only in prose, in a Claude prompt string in
[`sync-resolution.ts`](../packages/app/src/features/status/sync-resolution.ts) that asks the *agent*
to stash on the app's behalf, and in one line of [`outstanding.md`](outstanding.md). The parser is
more pointed than that — `kindFor()` in
[`refs-parser.ts`](../packages/git-engine/src/parsers/refs-parser.ts) returns `null` for anything
outside `refs/heads|remotes|tags`, so `refs/stash` is *deliberately* dropped on the floor, with a
test asserting it stays dropped.

The second half of the phase is the thing that has been written into the margins since Phase 7 and
never built. Three separate files carry a doc comment saying, in effect, *only the reflog stands
between you and this* — [`refs-ops.ts`](../packages/git-engine/src/commands/refs-ops.ts),
[`stage.ts`](../packages/git-engine/src/commands/stage.ts),
[`status-panel.tsx`](../packages/app/src/features/status/status-panel.tsx) — and
[`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts) tells the user
outright that *"there is no undo for them."* All four are true. The reflog is never read, `.git/logs`
is not watched, there is no ops journal, and there is no toast — the app has no way to say *that
happened, and here is how to take it back*. This phase builds the reading, the record, and the
voice, and then reverses the MVP's flat ban on force-push, because a client that can undo its own
writes has earned the one write it has been refusing.

**Builds on.** Phase 6 (staging, commit, the sync chips and `push()`), Phase 7
(`countOrphanedCommits`, `ConfirmDialog`, the blast-radius gate), Phase 10 (the repo watcher and
its own-write suppression), Phase 12 (the commit inspector and hunk-parsed diffs), Phase 13
(`TreeSection` and the sidebar ref tree), Phase 17 (the Changes view's filter tree and its danger
confirms), Phase 19 (the view-scoped navigation shell the rail's views hang off), Phase 20 (the
shared `DiffView`, and the precedent of a default-off Settings switch gating writes).

**Scope guardrails.** Every stash write goes through the existing per-repo `writeQueue` like every
other write — no exceptions, no direct `execGit` with `write: true`. Force-push is **only ever**
`--force-with-lease`, and only ever in its explicit `=<ref>:<expected-sha>` form; the bare flag is
not safe and is not offered. Undo is **ref-shaped only**: the reflog records where refs pointed,
not what the working tree or the index held, so an op that destroyed uncommitted work is journalled
and explicitly marked un-undoable rather than being given a lie of a button. Stashes are read
through their own command and parser — `kindFor()` keeps dropping `refs/stash`, and its test stays.
And the reflog view is **read-plus-checkout**: it can move `HEAD` to something it found, it never
rewrites, expires or deletes a reflog.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

**Correction (2026-09-02).** Themes B–G were marked `✅ DONE` by two mislabeled historical commits —
`7475d79` ("docs: sync todo trackers with Phase 25 Themes A, B, C merge") silently flipped B–E to
done while actually merging Phase 25 work, and `26e2349` ("docs(todo): mark Phase 31 Themes A-D and
Phase 22 Themes F-H landed") flipped F–H alongside a Phase 31 rebase-feature merge that contained
none of Phase 22's F/G/H code. `a2cd211` had already caught and reverted the Theme H half of that
second false claim; this pass re-audited the whole phase against the actual tree and found B, C, D,
E, F and G equally unbuilt — no `StashRow`/graph pseudo-rows/stash diff/Changes-view stash action, no
`forceWithLease` anywhere (and `sync.ts`/`CLAUDE.md` still say "no force-push"), no `reflog.ts`. Only
**A** (the git-engine stash engine) is real. Reverted to `◻ TODO` below; H moves to `◐ PARTIAL` for a
real starter slice landed in this same pass — see H's own note.
**Also corrected: the phase's own item total.** `_INDEX.md` and `a2cd211` both quoted 70 total
items/22 for Theme H — a recount (every `- [ ]`/`- [x]` line, attributed by nearest theme header)
finds Theme H's own lettered checklist has 8 items, not 22; the other 14 belong to the shared
`## Verification` section below and were miscounted into H by whichever earlier pass first summed
these. **The real total across A–H is 56**, not 70.

### A — Stash in the engine (M) ✅ DONE (2026-08-28)

The spine: B–E all read off this contract, so it lands first.

- [x] `packages/git-engine/src/parsers/stash-parser.ts`, following
      [`log-parser.ts`](../packages/git-engine/src/parsers/log-parser.ts)'s rule that *the parser
      owns the format string*: `export const STASH_FORMAT` built from `%gd` (the `stash@{n}`
      selector), `%H`, `%P`, `%gs`, `%at`, `%an`, `%ae` joined on `%x00`, with a `FIELD_COUNT`
      guard and `export function parseStashRecord(record: string): StashEntry | null`. Records come
      from `git stash list -z --format=STASH_FORMAT`.
- [x] `StashEntrySchema` in [`shared/src/domain/`](../packages/shared/src/domain/) — `{ selector,
      sha, parents, message, authoredAt, author }`. `parents` is load-bearing and not decoration: a
      stash commit has `^1` = HEAD at stash time, `^2` = the index state, and `^3` = the untracked
      files *only when `-u` was used*, and Theme D reads all three. A two-parent stash and a
      three-parent stash are different objects and the type must be able to tell them apart.
- [x] `packages/git-engine/src/commands/stash.ts` — reads and writes in one module, since the
      domain is small (contrast `refs.ts`/`refs-ops.ts`). `listStashes(worktreePath)` on the read
      side; `stashPush`, `stashPop`, `stashApply`, `stashDrop`, `stashBranch` on the write side,
      each returning `GitOpResult` through the module-local
      `const run = (p, args) => writeQueue.run(p, () => execGit(p, args, { write: true }))` idiom
      that every other write module defines.
- [x] `stashPush(worktreePath, { message?, keepIndex?, includeUntracked?, paths? })` — `paths`
      appended after `--`, which is what Theme E needs and what makes `git stash push` the right
      subcommand rather than the older `git stash save`.
- [x] **A pop can conflict, and the contract cannot currently say so.** `ConflictOpSchema` in
      [`result.ts`](../packages/shared/src/domain/result.ts) is
      `z.enum(['merge','rebase','cherry-pick','revert'])`; `stashPop`/`stashApply` need a
      `'stash-apply'` arm added to it, and every exhaustive switch over `ConflictOp` in the renderer
      has to grow the case. Detection follows
      [`sequencer.ts`](../packages/git-engine/src/commands/sequencer.ts)'s rule that exit code alone
      is not enough — on non-zero, call `conflictedPaths()` and return `conflict('stash-apply', files)`
      when it is non-empty.
- [x] A conflicted `pop` **must not drop the stash**, which is git's own behaviour and worth
      asserting: after a conflicted pop the entry is still in `stash list`, and the app must not
      imply otherwise.
- [x] `stashDrop` captures the dropped commit sha from stderr *before* returning, so Theme H has an
      anchor to restore from (`git stash store`). A dropped stash is unreachable, not gone.
- [x] Failure messages go through `gitErrorLine(stderr)` — exported, slightly oddly, from
      [`worktree-ops.ts`](../packages/git-engine/src/commands/worktree-ops.ts) — the same way
      refs-ops, sequencer and sync already do.
- [x] Contract wiring: `mstudio:stash:list` in `CHANNELS` plus `opStashPush`/`opStashPop`/
      `opStashApply`/`opStashDrop`/`opStashBranch`; `OpBase.extend(…)` request schemas and
      `OpResponse` in [`schemas.ts`](../packages/shared/src/ipc/schemas.ts); the `ops` block in
      [`bridge.ts`](../packages/shared/src/ipc/bridge.ts); the preload entries in
      [`preload/index.ts`](../packages/desktop/src/preload/index.ts); and handlers registered with
      `handleOp` behind the local `inWorkdir()` wrapper in
      [`ipc/status-handlers.ts`](../packages/desktop/src/main/ipc/status-handlers.ts).
- [x] Integration coverage in `stash.integration.test.ts` against a scratch repo, matching the
      `*.integration.test.ts` convention: push with and without `-u`, `--keep-index`, a path-scoped
      push, pop clean, pop conflicted, drop, and `stash branch`.

### B — Stashes in the sidebar (M) ✅ DONE (2026-09-03, PR #51)

- [x] `'stashes'` joins `SectionKey`/`ALL_SECTIONS`/`SECTION_TREE` in
      [`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) (already reserved
      from an earlier phase, right after `tags`). **Deviation**: it does **not** join
      `RefSectionKey` — that type is specifically for ref-backed heading menus, and a `StashEntry`
      is not a `Ref`. A parallel, dedicated `stashMenu(entry)` + `promptStashPush` mechanism was
      built instead (see below), rather than forcing a non-ref type through a ref-shaped seam.
- [x] A `<TreeSection title="Stashes">` block in `RepoTree` in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx)'s `SECTION_BODY`, with
      its entry in `SECTION_TITLE`/`useSectionToggles`. `hideWhenEmpty={false}` — deliberately the
      opposite of the plan's own assumption: the heading's "Stash changes" action is the only way to
      create a repo's *first* stash, so the section stays visible at zero count instead of hiding the
      one control that would ever change that count.
- [x] A `StashRow` component alongside `RefRow`/`WorktreeRow` at the same `TREE_INDENT` depth: the
      message as the primary text, a relative timestamp. **Deviation**: no file-count chip —
      `StashEntry` (Theme A's own contract) carries no per-entry file count, and `git stash list` has
      no `--format` token for one; a second subprocess per row costs more than the chip is worth.
      Left for later if it turns out to matter in practice.
- [x] The query key (`keys.stashes(repoId)`) nests under `keys.repo(repoId)` in
      [`queries.ts`](../packages/app/src/services/queries.ts).
- [x] `.git/refs/stash` invalidation confirmed directly in
      [`watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts)'s `'refs'` case
      (not assumed) — `stash push`/`pop`/`apply`/`drop`/`branch` all invalidate for free.
- [x] A row menu via `use-repo-actions.ts`'s `stashMenu(entry)`: Apply, Pop, Branch from stash, Copy
      sha, Drop. Drop is `danger` and goes through `dialogs.confirm`.
- [x] The heading action (`promptStashPush`) creates a stash from the current worktree state,
      prompting for a message through the existing `PromptDialog`.
- [x] [`sidebar-page.tsx`](../packages/app/src/features/settings/settings-pages/sidebar-page.tsx)'s
      `SECTION_LABELS` already had a compile-enforced `stashes` entry from the phase that widened
      `SectionKey`; only its stale doc comment needed updating.

### C — Stashes in the graph (M)

- [ ] Stash rows are **pseudo-rows**, following the precedent
      [`uncommitted-row.tsx`](../packages/app/src/features/graph/uncommitted-row.tsx) set and
      documented: `GraphRowSchema` in
      [`commit.ts`](../packages/shared/src/domain/commit.ts) stays a commit-only type, and a stash
      is not given a fake sha to smuggle it into `graph-store`, the virtualizer's index space, and
      every `rows[i]` lookup that would then have to exclude it again.
- [ ] A `StashRows` sibling rendered above the `role="grid"` scroller in
      [`graph-view.tsx`](../packages/app/src/features/graph/graph-view.tsx), beneath
      `UncommittedRow`, taking `lane`/`colorIdx` from `headRow` the same way.
- [ ] The same "this is not a real commit" visual grammar `UncommittedRow` established — dashed
      ring node, dashed lane, italic muted text — so the two pseudo-rows read as one family rather
      than two exceptions.
- [ ] Collapse past two entries: a repo with fourteen stashes must not push the actual graph off
      the top of the pane. The overflow row links to the sidebar section.
- [ ] Selecting a stash row drives the same selection state a commit row does, so Theme D's
      inspector is reached identically from the graph and from the sidebar.
- [ ] A stash's rows disappear the moment the underlying entry is popped or dropped — the watcher
      `'refs'` event from Theme B is the trigger, not a manual refresh.

### D — A stash you can read (M)

- [ ] `stashDiff(worktreePath, selector)` in `commands/stash.ts`, returning the same parsed shape
      [`diff.ts`](../packages/git-engine/src/commands/diff.ts) and
      [`diff-parser.ts`](../packages/git-engine/src/parsers/diff-parser.ts) already produce, so the
      inspector renders it through the one shared `DiffView` with no new renderer.
- [ ] **Three parts, not one.** The tracked changes are `stash@{n}^1..stash@{n}`; the index state is
      `stash@{n}^2`; the untracked files are `stash@{n}^3` and exist only when the stash was made
      with `-u`. `git stash show -p` shows the first and silently omits the rest, which is exactly
      the kind of quiet partial truth this inspector should not repeat.
- [ ] The inspector's stash mode reuses Phase 12's file list and hunk rendering wholesale, with a
      header naming the branch the stash was made on (parsed out of `%gs`, which reads
      `WIP on main: 1a2b3c4 subject`) and the time it was made.
- [ ] Untracked entries are labelled as untracked in the file list — they are additions with no
      "before", and rendering them as ordinary adds loses the one fact that matters when deciding
      whether a pop is safe.
- [ ] Apply / Pop / Drop / Branch as actions in the inspector header, sharing Theme B's handlers
      rather than a second copy of them.

### E — Stash from the Changes view (S) ✅ DONE (2026-09-03, PR #51)

- [x] The Changes view gains a "Stash changes" toolbar action (whole worktree) and a per-row "Stash
      file" action on the unstaged list (scoped to that one path) — `StashPushDialog`'s `paths` arg.
      **Deviation**: no multi-file checkbox selection exists anywhere in the Changes view today, so
      "the current selection" is read as the row a per-file action was invoked on, not a new
      multi-select UI this theme did not add.
- [x] `--keep-index`/`--include-untracked` as explicit, unchecked-by-default checkboxes on a
      dedicated `StashPushDialog` (not the generic `dialogs.prompt`, which is one text field only).
- [x] Runs through `useStashPush` (`features/stash/use-stash-actions.ts`, Theme B's own hook, shared
      rather than duplicated) — `onSettled` invalidates `keys.repo(repoId)`.
- [x] The "Stash changes" toolbar button is disabled with a reason (`disabledReason`) when
      `entries.length === 0`, refusing before attempting rather than surfacing git's own error text.

### F — Force-push, with a lease (S) ✅ DONE (2026-09-03, PR #51)

- [x] **The rule reversal is recorded, not silent.** `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` (the rule
      lives in one place, mirrored three ways per this repo's own sync rule — not a fourth location),
      `sync.ts`'s module header, `PushRequest`'s doc comment in `schemas.ts`, and
      `sync-controls.tsx`'s header all say what replaced the ban.
- [x] `PushOptions`/`PushRequest` gain `forceWithLease?: { ref: string; expect: string }` — never a
      boolean, never a bare `--force-with-lease`.
- [x] `expect` comes from the matching remote-tracking `Ref` already in the graph's own `refs` query
      (not a fresh IPC call). **Deviation**: `RevParseRequest.rev` is deliberately hex-only
      (`shared/ipc/schemas.ts`'s `HexRev`, guarding it from becoming a general "resolve any revision"
      channel); widening it for this one caller was rejected in favor of reusing data the
      repo-watcher already keeps current.
- [x] The blast-radius gate reuses `countOrphanedCommits`/`dialogs.confirm`'s tri-state
      `blastRadius`, exactly as hard-reset does — `danger: true`, confirm names the branch.
- [x] A rejected lease is its own outcome: `pushFailureCode`/`describePushFailure` gain a
      `'stale-lease'` code + message, detected off git's own `(stale info)` marker — distinct from
      the ordinary `'non-fast-forward'` code a plain push's rejection now also carries.
- [x] Entry point is the per-ref badge menu (`use-graph-actions.ts`'s `refMenu`), offered only once a
      plain push from that same menu has come back non-fast-forward (tracked per-ref, cleared the
      moment a later push settles any other way). Never in `SyncControls`.
- [x] Behind a default-off switch. **Deviation**: `Settings ▸ Git Safety ▸ Allow force-push (with
      lease)`, a new dedicated section — not `Settings ▸ Repositories` (no such settings page exists
      today; a force-push opt-in is a big enough decision to deserve its own page, per the batch's
      own upfront design decision). Its copy states no bare `--force`, no `--delete`, and no bypass of
      a branch-protection rule the remote already enforces (this app has no local concept of
      "protected," so a rejection there still comes back rejected, unchanged).

### G — The reflog, read and browsable (M) ✅ DONE (2026-09-03, PR #51)

- [x] `packages/git-engine/src/commands/reflog.ts` + `parsers/reflog-parser.ts` own `REFLOG_FORMAT`,
      read via `git reflog show --date=unix -z --format=… <ref>`. **Deviation**: `%gt` is not a real
      git placeholder — confirmed against real git, where it prints literally as the string `%gt`.
      The format actually shipped is `%gd%x00%gD%x00%H%x00%gs%x00%gn`, with `--date=unix` making
      `%gd`/`%gD` themselves carry the entry's real write time (`HEAD@{1788383371}`) — the only
      placeholders that answer "when was this reflog ENTRY written," as distinct from `%at`/`%ct`
      (the target commit's own date, verified wrong for e.g. a reset onto an old commit in the
      integration test). `readReflog(worktreePath, { ref?, limit })` — `ref` absent means `HEAD`.
- [x] `%gs` parses into a `ReflogAction` enum (commit/amend/checkout/reset/merge/rebase/cherryPick/
      revert/pull/branch/other) best-effort; the raw subject is always the displayed text.
- [x] The **History** view already existed (Theme H landed its nav-rail item, routing and tab shell
      ahead of this theme, with `ReflogList` as an honest placeholder). This theme replaces the
      placeholder's body: a ref selector (HEAD + every local branch), a time-ordered list, an action
      filter (applied client-side over the fetched page, not server-side — the `limit` is a page
      size, and filtering it server-side would silently shrink the page), and the old→new sha pair
      per entry (`oldSha` is not a git placeholder at all; `readReflog` fetches `limit + 1` records
      and pairs each with the next OLDER one so the returned page's own oldest entry still carries a
      real predecessor rather than a phantom `null`).
- [x] Each entry is checkout-able (`detach: true`, the existing op) and copy-able (its sha). The
      app's existing detached-HEAD indicators pick up the result reactively — no separate warning
      dialog was needed or added.
- [x] The list states the 30/90-day expiry rule in a standing footer note.
- [x] `.git/logs` (the common dir's shared reflogs) and every
      `.git/worktrees/<name>/logs/HEAD` (a linked worktree's own HEAD reflog) now ride the existing
      `'refs'` `WatchKind` — no growth to `WatchKindSchema`.
- [x] Own-write suppression needed no new wiring — it is scoped by write-queue busy windows, not by
      `WatchKind`, so it already covers reflog events uniformly; verified with a dedicated test
      rather than assumed.
- [x] Fifteen parser unit tests (including a colon-containing subject and a newline-adjacent branch
      name) plus seven integration tests against a real repo (real timestamps, a real reset, an
      explicit non-HEAD ref, page-boundary oldSha pairing, an empty-reflog ref).

### H — The ops journal, toasts, and undo (L) ◐ PARTIAL (2026-09-02, starter subset)

The largest theme, and the only one with no existing pattern to copy: this builds the app's first
history mechanism *and* the first surface it can announce itself on. Land it last.

**Starter-subset landing.** `@bilo-io/ui` was checked and exports no toast/notification component,
so `toast.tsx`/`toast-host.tsx` were built custom, per the original plan. The undoability classifier
(`isUndoableOpKind`/`undoReason`) is complete and exhaustive over every op this app can emit, but only
`stash-drop` and `branch-delete` have a real, wired Undo executor (`WIRED_UNDO_OPS` in
`services/use-journal.ts`) — every other undoable-by-classifier op (`commit`, `reset`, `checkout`,
branch create/move, `stash push`) is correctly classified and journalled but has no live Undo button
yet; wire it by adding to `WIRED_UNDO_OPS` plus an executor arm. The journal is genuinely the History
view's second tab, but Theme G's reflog tab is an honest placeholder, not real data — Theme G was
found unbuilt in this same pass (see the phase-level Correction note above), so there is no reflog
reader for the journal to sit beside yet.

- [x] **A toast primitive.** `components/toast.tsx` + `components/toast-host.tsx`, shaped after
      [`dialog-host.tsx`](../packages/app/src/components/dialog-host.tsx) — a `useToasts(): ToastApi`
      with `{ show, dismiss }`, a stacking host mounted once in
      [`app.tsx`](../packages/app/src/app.tsx), a `ToastRequest` carrying an optional `action`.
      Non-modal, keyboard-dismissible, and reusable far past this phase: today every op result goes
      through a locally-defined `report(result)` that sets inline error state and nothing else.
- [x] **A journal.** `OpJournalEntrySchema` in shared — `{ id, repoId, worktreePath, op, label,
      at, headBefore, headAfter, refBefore, undoable }` — recorded in the renderer for every write
      the app performs. Entries persist per repo alongside the existing renderer state, capped at a
      few hundred, so quitting the app does not erase the record of what it did.
- [x] **Undo is ref-shaped, and the plan says so out loud.** The reflog records where refs pointed;
      it records nothing about the working tree or the index. So the undoable set is exactly the ops
      that moved a ref and left the worktree intact: `commit`, `reset` (all three modes — the ref
      moves back; `--hard`'s discarded worktree changes do not come back and the confirm says so),
      `checkout`, branch create/delete/move, `stash drop` (via the captured sha and `git stash
      store`), and `stash push` (via `pop`).
- [x] **The un-undoable set is journalled and explicitly marked, never given a disabled button with
      no reason.** Merge, rebase and cherry-pick (the sequencer's ops — their inverse is a reset the
      user should choose deliberately, not a one-click), push, discard-changes, and any op whose
      journal entry cannot name a `headBefore`. Each carries a one-line reason shown on the entry.
- [x] Undo executes as a **new forward write** through the write queue — a `reset` to `headBefore`,
      never a reflog rewrite — so it is itself journalled, itself visible in the History view, and
      itself subject to the same blast-radius confirm when it would orphan commits.
- [x] Destructive ops raise a toast carrying **Undo**; non-destructive ones raise a plain toast or
      none. The undo action outlives the toast: dismissing it removes the notification, not the
      ability, which stays on the journal entry in the History view.
- [x] The journal is the History view's second tab, beside Theme G's reflog — *what this app did*
      next to *what this repository recorded*. They are different lists and conflating them would
      hide the difference between an app write and a terminal write in the same window.
- [x] Unit coverage for the undoability classifier (every `op` value, both arms) and for the journal
      reducer's cap and eviction; the classifier is the piece where a wrong answer is a data-loss
      bug rather than a cosmetic one.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/result.ts`](../packages/shared/src/domain/result.ts) (`ConflictOpSchema` gains `'stash-apply'`), [`shared/src/domain/commit.ts`](../packages/shared/src/domain/commit.ts) (unchanged, but load-bearing for Theme C), [`shared/src/domain/watch.ts`](../packages/shared/src/domain/watch.ts), new `shared/src/domain/stash.ts`, new `shared/src/domain/reflog.ts`, new `shared/src/domain/journal.ts`, [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) |
| git-engine | new [`commands/stash.ts`](../packages/git-engine/src/commands/stash.ts), new `commands/reflog.ts`, new `parsers/stash-parser.ts`, new `parsers/reflog-parser.ts`, [`commands/sync.ts`](../packages/git-engine/src/commands/sync.ts) (`forceWithLease`, `describePushFailure`), [`commands/refs-ops.ts`](../packages/git-engine/src/commands/refs-ops.ts) (`countOrphanedCommits` for a remote ref), [`commands/index.ts`](../packages/git-engine/src/commands/index.ts), [`parsers/index.ts`](../packages/git-engine/src/parsers/index.ts), [`watch/repo-watcher.ts`](../packages/git-engine/src/watch/repo-watcher.ts) (`.git/logs`) |
| Main | [`ipc/status-handlers.ts`](../packages/desktop/src/main/ipc/status-handlers.ts), [`ipc/ref-handlers.ts`](../packages/desktop/src/main/ipc/ref-handlers.ts), [`preload/index.ts`](../packages/desktop/src/preload/index.ts) |
| Renderer — stash | new `features/stash/stash-row.tsx`, new `features/stash/use-stash-actions.ts`, [`features/repos/repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx), [`features/repos/view-sections.ts`](../packages/app/src/features/repos/view-sections.ts), [`features/repos/use-repo-actions.ts`](../packages/app/src/features/repos/use-repo-actions.ts) |
| Renderer — graph | new `features/graph/stash-rows.tsx`, [`features/graph/graph-view.tsx`](../packages/app/src/features/graph/graph-view.tsx), [`features/graph/uncommitted-row.tsx`](../packages/app/src/features/graph/uncommitted-row.tsx) (the precedent; unchanged), [`features/graph/use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts), [`features/graph/ref-sync.ts`](../packages/app/src/features/graph/ref-sync.ts) |
| Renderer — inspector | the Phase 12 inspector and the shared `DiffView`, [`services/queries.ts`](../packages/app/src/services/queries.ts), [`services/use-status.ts`](../packages/app/src/services/use-status.ts), [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts) |
| Renderer — history | new `features/history/history-view.tsx`, new `features/history/reflog-list.tsx`, new `features/history/journal-list.tsx`, the Phase 19 nav-rail view registry, [`app.tsx`](../packages/app/src/app.tsx) |
| Renderer — shared | new [`components/toast.tsx`](../packages/app/src/components/toast.tsx), new `components/toast-host.tsx`, [`components/confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx) (unchanged; reused by F), [`components/dialog-host.tsx`](../packages/app/src/components/dialog-host.tsx) (the shape toasts copy), [`components/tree-section.tsx`](../packages/app/src/components/tree-section.tsx) |
| Settings | [`features/settings/settings-pages/sidebar-page.tsx`](../packages/app/src/features/settings/settings-pages/sidebar-page.tsx), the Repositories page (the force-with-lease switch) |
| Docs | [`CLAUDE.md`](../CLAUDE.md) (the no-force-push rule, rewritten rather than deleted), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`todo/outstanding.md`](outstanding.md) (stash and force-push come off the list) |
| Tests | new `stash.integration.test.ts`, new `reflog.integration.test.ts`, new `stash-parser.test.ts`, new `reflog-parser.test.ts`, [`refs-parser.test.ts`](../packages/git-engine/src/parsers/refs-parser.test.ts) (the `refs/stash`-is-dropped assertion stays), new `undoable.test.ts`, new `journal-store.test.ts`, new `e2e/stash.spec.ts`, new `e2e/history.spec.ts`, [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: the stash and reflog commands are plain Node in git-engine and import no
      `electron`; the journal and toasts live entirely in `app` and reach main only through
      `window.midniteStudio`.
- [ ] Vitest (A): `parseStashRecord` on a two-parent stash, a three-parent `-u` stash, a message
      containing a colon, and a truncated record returning `null`.
- [ ] Vitest integration (A): the full stash lifecycle against a scratch repo, including a
      deliberately conflicted `pop` asserting both `kind: 'conflict'` and that the entry survives.
- [ ] Vitest (F): the push arg builder emits `--force-with-lease=<ref>:<sha>` and **never** a bare
      `--force-with-lease` or a `--force`, asserted as a string-shape test the way
      [`gh-write.test.ts`](../packages/desktop/src/main/forge/gh-write.test.ts) asserts `--undo`
      never appears.
- [ ] Vitest (G): `REFLOG_FORMAT` round-trips captured real output; a subject the action parser
      cannot classify degrades to a plain row rather than a wrong verb.
- [ ] Vitest (H): the undoability classifier over every `op` value, and the journal cap/eviction.
- [ ] Playwright (`e2e/stash.spec.ts`): create a stash from the Changes view, see it in the sidebar
      section, in the graph as a dashed pseudo-row, and in the inspector with its file list; pop it
      and watch all three surfaces empty.
- [ ] Playwright (`e2e/history.spec.ts`): the History view renders both tabs, the ref selector
      switches lists, and an undoable journal entry offers Undo while a merge entry shows its
      reason instead.
- [ ] Screenshot, per the visual-phase convention: the sidebar Stashes section, a stash open in the
      inspector, the force-with-lease confirm showing a real blast radius, and the History view —
      all in both themes.
- [ ] **Open, for a human:** stash with `-u` in a real repo, confirm the inspector shows all three
      parts, then pop and confirm the untracked files come back untracked.
- [ ] **Open, for a human:** a real `--force-with-lease` against a disposable remote branch — once
      succeeding, and once rejected because the remote moved — and confirm the stale-info message
      is the one shown.
- [ ] **Open, for a human:** run five ops in a row, quit the app, relaunch, and confirm the journal
      is still there and its undo entries still work.
- [ ] **Open, for a human:** confirm the History view does not refresh in a loop on the app's own
      writes — the `.git/logs` watch plus own-write suppression is the one place this phase can
      produce a busy loop.

## Not in this phase

- **Interactive rebase.** Still the largest MVP gap after this one, and still blocked on a
  `GIT_SEQUENCE_EDITOR` helper binary that has to be packaged, signed and found at runtime. It
  deserves the whole phase that problem implies.
- **Undo for the sequencer's ops.** Merge, rebase and cherry-pick are journalled but not undoable
  here. Their inverse is a reset the user should choose with a blast radius in front of them, and
  wiring that to a toast button is how you delete someone's afternoon.
- **A command palette.** The `CommandId` registry in
  [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) is the obvious data source
  and the journal would be a good second one, but the palette is [Phase 23](phase-23-command-palette.md)'s
  own surface, which stays independent of this phase via its provider seam (Theme E).
- **Side-by-side diff** for stashes or anything else — the shared `DiffView` stays unified, as it
  has since Phase 12.
- **Reflog expiry, pruning or rewriting.** The History view reads and checks out. `reflog expire`,
  `reflog delete` and `gc` are not exposed; a client that offers to prune the only safety net it
  just spent a phase building is working against itself.
- **Submodules**, which have their own stash semantics entirely and are deferred wholesale in
  [`outstanding.md`](outstanding.md).
- **Non-macOS shapes.** `.git/logs` watching goes through the same `fs.watch` path as everything
  else and should port, but Phase 22 is verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — all four pillars ship together.** Stash, force-with-lease, the reflog view and a
  reflog-backed undo were offered as separable slices and deliberately kept in one phase. It is the
  largest phase in the repo and Theme H is the one that can stall the rest; A and F are the safest
  places to start, and G stands alone usefully even if H slips.
- **Resolved — stashes get all four surfaces**: the sidebar section, graph pseudo-rows, the
  inspector, and the Changes view. The graph one is the least conventional and the one to cut first
  if the pseudo-row precedent turns out not to stretch to a variable-length list.
- **Resolved — the reflog is a rail view, not a sidebar section.** A reflog entry carries a subject,
  a timestamp and an old/new sha pair; the sidebar is too narrow to show any two of those at once,
  and Phase 19's navigation shell means a new view costs almost nothing.
- **Resolved — undo announces itself with a new toast primitive**, backed by a permanent journal in
  the History view. The alternatives were a journal-only panel (undo findable only by going
  looking), the dialog host (modal after every write) and a footer slot (competing with Phase 18's
  metrics cluster). Toasts are the piece the app has been missing since Phase 6.
- **Resolved — undo is ref-shaped.** The reflog does not record the working tree, so an op that
  discarded uncommitted work is journalled and marked un-undoable with its reason. This is the
  single most important honest constraint in the phase and it belongs in the UI, not just here.
- **Open — does `.git/logs` need its own `WatchKind`?** *Recommendation:* start on the existing
  `'refs'` kind. It fans out to more invalidation than strictly needed, but `WatchKindSchema` is a
  four-value enum threaded through main, the bridge and `watch-invalidation.ts`, and growing it
  before there is evidence the fan-out hurts is a contract change bought on a guess. Revisit if the
  History view proves to cause measurable extra refetching.
- **Open — is `stash drop` undoable, or merely recoverable?** *Recommendation:* undoable. The sha is
  printed on stderr and `git stash store` puts it back with its message intact; capturing it in
  Theme A costs one regex and turns the only irreversible stash op into a reversible one. If the
  capture proves fragile across git versions, degrade to journalling the sha and pointing at the
  History view rather than offering a button that might fail.
- **Open — does the journal persist across restarts?** *Recommendation:* yes, per repo, capped at a
  few hundred entries. A journal that empties on quit answers "what did I do this session" but not
  "what happened to this branch last Tuesday", and the latter is the question the reflog cannot
  answer on its own because it cannot say which writes came from this app.
- **Open — toast dwell time, and whether Undo survives dismissal.** *Recommendation:* eight seconds
  for an undoable destructive op, four for a plain confirmation, and the undo capability lives on
  the journal entry rather than the toast — dismissing a toast should remove a notification, never a
  capability.
- **Open — does force-with-lease need its own Settings switch, or does it ride an existing one?**
  *Recommendation:* its own, default-off, on the Repositories page, following Phase 20's Reviews
  switch — including that switch's good habit of listing what the app will still never do. A
  reversal of a documented safety rule should cost one deliberate click, once.
- **Open — where does the force-push entry point live?** *Recommendation:* the per-ref badge menu in
  the graph, and only after a plain push has been rejected as non-fast-forward. Offering it before
  the ordinary path has failed makes it a shortcut rather than a remedy.
