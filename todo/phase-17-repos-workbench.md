# Phase 17 — The repositories sidebar as a workbench

The sidebar has been a read-mostly tree since Phase 4. It lists refs and worktrees, but it
cannot answer the one question a multi-worktree workflow asks constantly — *where did I leave
off?* Only the **primary** checkout of each repository ever got a `git status`, so a linked
worktree with a dozen uncommitted files rendered identically to a clean one
(`repos-panel.tsx` passed `health` only when `worktree.isMain`, with a comment explaining that
attributing the primary's dirt to a linked checkout would be a lie — correct, and the fix was
to fetch the missing data rather than to keep the silence).

This phase makes the tree say what it knows, gives every actionable node a menu, adds a place
for things to open *into*, and connects the app to GitHub for the first time.

**Scope guardrails.** The forge integration is **read-only** — no merge, approve, re-run or
comment path exists, and the app links out for anything that changes state on GitHub, so no
cached listing can ever cause a write. No branch-vs-base range diff: "View all changes" reads
a working tree, and a branch with no checkout has none. No `tagDelete` or remote-branch delete
— neither has a channel, and a menu item that cannot reach an implementation is worse than an
absent one. No PAT, no secret storage: `gh` already holds the user's credential.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Per-worktree status and the change-count pill (M) ✅

- [x] `services/use-status.ts` — `useWorktreeStatuses(repo, enabled)` over TanStack's
      `useQueries`, one entry per worktree, reusing **`keys.status(repoId, path)` verbatim** so
      a row's count and the Changes panel that later selects that checkout are one cached
      `git status`, not two — and the watcher's existing invalidation reaches both
- [x] `isPlaceholderData` respected: the placeholder is an EMPTY status, so treating it as data
      would report every checkout clean while the query is in flight. `byPath` holds only
      checkouts that have actually answered; absent ≠ clean
- [x] `components/change-count-pill.tsx` — VS Code's accent pill, counting **paths** (a file can
      be staged and unstaged at once), destructive-coloured when anything is conflicted, and
      absent at zero
- [x] Pills on worktree rows, on local-branch rows for the checkout they are live in, and the
      repo roll-up on a collapsed header
- [x] `liveStatus()` preserves the old invariant: only a checkout's own status may speak for it
- [x] Nothing changed in main or git-engine — `status.get` has taken `worktreePath` since Phase 6

### B — The Changes view filters the tree (S) ✅

- [x] `features/repos/use-dirty-filter.ts` — defaults from the active view, user-overridable,
      override reset on view change via the adjust-state-**during-render** pattern
      (`useContextReset` in `features/diff/use-file-diff.ts`), not an effect: an effect would
      paint one frame with the previous view's answer
- [x] Filter mode hides Local / Remotes / Tags / Actions / Reviews, keeps only worktrees with
      changes, and drops a repository with none — but **never while its counts are still
      arriving**
- [x] A pressed toggle in the panel header, visible whenever the mode is on. A tree that
      silently eats two thirds of its rows is indistinguishable from data loss
- [x] `use-dirty-filter.test.ts`

### C — Menus everywhere, danger-themed confirms (L) ✅

- [x] `use-repo-actions.ts` — `worktreeMenu`, `sectionMenu`, and the destructive verbs the old
      docblock deliberately withheld. That docblock is **rewritten**, not left contradicting the
      code: the "delete lives only on the graph" rule did not survive contact with the tree
- [x] Both affordances on every actionable node — `onContextMenu` **and** a hover ellipsis.
      `WorktreeRow` had neither
- [x] Only existing channels: checkout, branchCreate, branchDelete, branchRename, worktreeAdd
      (wired in main since Phase 4 with **zero renderer callers** until now), worktreeRemove,
      close, openExternal
- [x] Row action labels disambiguated — a branch and a worktree can both be called `main`, and
      "Actions for main" twice in one tree is unusable by name or by screen reader
- [x] `confirm-dialog.tsx` — `danger` now tints the border, ring, header and glyph, not just the
      confirm button; new `warnings?: string[]` for consequences not measured in commits
- [x] Branch delete waits on `ops.blastRadius` (the Phase 7 two-phase pattern), and fails soft
      to "nothing becomes unreachable" rather than hanging on "Checking what this affects…"
- [x] Worktree removal: confirm naming the uncommitted count, `force: false` first, and a
      **second** separately-confirmed dialog only after git has actually objected

### D — View all changes (M) ✅

- [x] `use-file-diff.ts` — an optional `worktreePath` that wins over the store. It read
      `useActiveWorktree()` unconditionally, so any caller addressing a checkout by name got
      the selected one's diff under the right title
- [x] `diff-view.tsx` — an `inline` mode: no toolbar, no `h-full`, and **no virtualizer** (inside
      an accordion its scroller is the page, so it would render three rows and stop). Row count
      is already bounded by `DIFF_LINE_CAP`
- [x] `features/changes/file-accordion.tsx` — the diff query lives in the **body**, so a closed
      file costs zero `git diff` calls and closing one unmounts it
- [x] `features/changes/all-changes-view.tsx` — expand-all / collapse-all, one row per path, and
      an `EXPAND_ALL_LIMIT` that **says** what it withheld
- [x] `features/status/status-mark.tsx` — `StatusMark` promoted out of the status panel so both
      surfaces share one legend

### E — The workbench tab strip (M) ✅

- [x] `store/workbench-store.ts` — deliberately **not** `ui-store`: tabs name repos, checkouts and
      runs, all of which can be gone by next launch, so nobody has to remember to exclude them
      from `partialize`
- [x] Identity derived from what a tab points at, so "open" means "focus it if it is already
      open"; `NewWorkbenchTab` distributes the `Omit` (a naive `Omit` over the union would erase
      the very fields identity is built from)
- [x] `features/workbench/{workbench,tab-strip}.tsx`. The working-tree tab is not in the store
      and cannot be closed
- [x] Closing a repository drops its tabs, reconciled against the repo **list** rather than the
      close mutation — a repo can leave the list without anyone clicking Close
- [x] `workbench-store.test.ts` — focus falls to the left neighbour, not the start of the strip

### F — Actions and Reviews via `gh` (L) ✅

- [x] `shared/src/domain/forge.ts` — `ForgeRun`, `ForgePull`, `ForgeCliStatus`, and the
      `{cli, items, error}` envelope that keeps "no runs yet" and "gh is signed out" different
      answers at every layer
- [x] `mgit:forge:{cli-status,runs,pulls}` + schemas (listings capped so a sidebar section
      cannot spawn an unbounded call) + bridge group + preload + `ipc.test.ts` coverage
- [x] `desktop/src/main/forge/gh-cli.ts` — `$SHELL -lic`, the `claude-cli.ts` pattern, so a
      Homebrew/mise-managed `gh` resolves. `GH_PAGER=cat` (an interactive shell convinces `gh`
      it has a tty, and a pager would hang until the timeout)
- [x] **`shellQuote()`** — load-bearing, not politeness: owner/repo are parsed from whatever URL
      is in `.git/config`. Tested against `$(…)`, backticks, `;`, `&&`, `|`, newline, and the
      embedded `'` that is the only character single-quoting cannot contain
- [x] `gh-parse.ts` — total parsers over `--json` output, dropping a row they cannot understand
      rather than guessing. Run ids stay **strings** (GitHub's exceed 2^53); `conclusion: ""`
      normalises to null; `isAuthenticated` believes a logged-in line even on exit 1, because
      `gh auth status` fails if *any* configured host has a bad token
- [x] Owner/repo resolved **in main** from `.git/config`, never sent by the renderer — the only
      thing crossing the boundary is a `repoId`
- [x] `features/repos/forge-sections.tsx` — closed by default (each open is a subprocess and an
      API request), `hideWhenEmpty={false}` so the fixable empty states can speak, a refresh
      action because the fs watcher cannot know about CI, and a finite `staleTime` against the
      app's global `Infinity`
- [x] Absent entirely without a GitHub remote — `gh` speaks GitHub only, and a permanently empty
      section is not a section
- [x] `features/forge/forge-detail.tsx` — the run and PR tab bodies: the verdict beside your
      code, and a link out for the transcript
- [x] **Closes `outstanding.md` → "Branch checks"**: `checks-verdict.ts` maps runs to the
      `ChecksVerdict` that `branchHealth()` has accepted since Phase 13 with no producer.
      Matched on **sha**, never branch name; newest run per workflow wins; an all-skipped set is
      `unknown`, not green. Read from cache with `enabled: false`, so it costs nothing unless
      the user has already opened Actions

## Verification

- [x] `moon run :typecheck :lint :test` green
- [x] 11 new Playwright specs (`e2e/repos-workbench.spec.ts`), plus `mock-bridge.ts` grown a
      `forge` group, multi-worktree fixtures and per-worktree status
- [ ] **Open, for a human:** the packaged-app screenshot pass in both themes. Electron cannot
      attach to the macOS window server from a non-interactive session — it exits silently with
      no output while other Electron apps on the same machine run fine — so
      `MGIT_CAPTURE=… moon run desktop:start-built` could not be run here
- [ ] **Open, for a human:** `gh` present-and-authed vs absent vs authed-but-offline; a
      GitLab-only remote; dragging a repo row with the new hover buttons in it

## Not in this phase

- Branch-vs-base range diff (needs a `branchDiff` channel and a "what is the base" decision)
- Tag delete and remote-branch delete (no channel)
- Job logs, review threads, and any write path to the forge
- GitLab: `gh` is GitHub-only, so its sections simply do not render
