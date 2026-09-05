# Phase 74 — Media caches and the Trash

**Refined: x1** · 2026-09-05 · security & blast radius, data model & IPC contract, testing & verification, UI/empty/loading/error states, sequencing & cross-phase dependencies, per-item acceptance criteria, file-map precision, out-of-scope tightening

**Written directly** (no human in the loop — see Decisions) · 2026-09-05

[Phase 59](phase-59-workspace-optimizer.md) shipped the Workspace Optimizer confined to repo roots.
[Phase 72](phase-72-every-build-systems-leftovers.md) widened what it recognizes *inside* those
roots. [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) took it *outside* them for the first
time — a hand-written, exact-match allowlist (`confineAllowlist`) and a three-factor consent gate
for system-wide dev-tool caches (`~/.cargo`, `~/.gradle`, Homebrew, …) — and named, in its own "Not
in this phase" section, the two things it explicitly declined to cover because each needs a
*different* review than a dev-tool cache: **media-tool caches (Plex) and emptying the system
Trash.** This is that phase.

**The two halves are genuinely different operation shapes, and this doc treats them that way.**
Plex's disposable cache directories are, structurally, one more entry in Phase 73's own registry —
same trust tier, same blast-radius class, same `confineAllowlist`/three-factor gate, no new
machinery. Emptying the Trash is not: it is the one operation in this entire arc that can destroy
content the *user* — not a build tool, not this app — put somewhere with an explicit expectation of
recoverability, and `shell.trashItem`'s whole safety story (Phase 59, Phase 72, Phase 73 all reuse
it unmodified) simply does not apply once the target already *is* the Trash. See Decision 10 for
why both still live in one phase doc rather than splitting into a Phase 75.

**This phase is macOS-only, stated rather than assumed**, matching Phase 73's own stance and this
app's stated scope ([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md): *"Desktop-only,
macOS arm64 primary target"*). Every path below is a macOS path; Windows' Recycle Bin and Linux's
XDG trash spec are real, named gaps — see Decision 9 — not built speculatively for platforms this
app does not ship on.

**Sequencing guardrail — Theme A is blocked on undelivered docs; Themes B–D are not, and should be
built first.** As of this writing, verified by reading the tree rather than by inference:

- `EcosystemSchema` **does not exist** anywhere in the repo. `grep` returns three hits, all of them
  `DiagnosticsEcosystemSchema` in
  [`shared/src/domain/diagnostics.ts:39`](../../../packages/shared/src/domain/diagnostics.ts) — an
  unrelated symbol. Phase 72's Theme C is what creates it.
- [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) is still
  Phase 59's shape, and its `ScanCategorySchema` (`:18`) has **four** members —
  `'nodeModules' | 'buildOutput' | 'staleWorktree' | 'looseObjects'` — not three. (The file's own
  docblock at `:12-17` still says "three"; that is Phase 72's line to fix, not this phase's.)
- `system-cache-registry.ts`, `system-cache-service.ts`, `SystemCacheEntry`, `PathResolver`,
  `DEFAULT_SYSTEM_CACHE_ENTRIES`, `resolveSystemCacheEntries`, `confineAllowlist`,
  `allowSystemCacheClean` and `systemCacheConsentGiven` all return **zero** grep matches outside
  `.midnite/tasks/`. `packages/desktop/src/main/optimizer/` holds exactly six files today:
  `gpu-service.ts`, `kill-service.ts`, `scan-service.ts` and their three specs.

**Therefore: Theme A cannot be built before Phase 72 Theme C (`EcosystemSchema`, `ReclaimCostSchema`)
and Phase 73 Themes A–C (`system-cache-registry.ts`, `confineAllowlist`, the three-factor gate) have
landed in code. Themes B–D (the Trash) have no upstream dependency at all** — they touch none of
Phase 72's or Phase 73's surface, add their own domain file, their own IPC channels, their own
handler file, their own consent pair and their own settings page. **Pick B → C → D up first, in that
order, and leave A for whenever 72 and 73 have landed.** A partial landing of B alone is safe (a
summary nobody can act on); C without D is not shippable (an IPC surface with no way to reach it);
D without C does not compile (it imports C's channels).

**This phase consumes Phase 72's and Phase 73's symbols and never redefines them.** If an item below
needs a shape those phases have not specified, the fix is to re-open that phase, not to declare a
second version of the symbol here.

**Builds on — read before writing code.**
- [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s Theme A deliverables (once landed), quoted
  from its own doc so this phase is checkable against it:
  - `SystemCacheEntry` = `{ id: SystemCacheEntryId; label: string; ecosystem: Ecosystem; producer:
    string; reclaim: ReclaimCost; resolve: PathResolver }` — **every field required**, and the
    cheap/costly grading is named **`reclaim`**, typed `ReclaimCost` (`'cheap' | 'costly'`, from
    Phase 72's `ReclaimCostSchema`). It is *not* called `cost`.
  - `SystemCacheEntryId` is an **explicit string-literal union** in the same file, so a new
    catalogue entry is **two edits in one file**: the literal added to the union, the object added
    to the array. (On the wire `entryId` stays a plain `z.string()`, matching Phase 72's
    `detectorId` precedent.)
  - `PathResolver` = `{ kind: 'fixed'; path: string }` — **homedir-relative with no leading `~/`
    and no leading `/`**, resolved as `join(os.homedir(), entry.resolve.path)`; a leading `~` or `/`
    is a registry authoring bug Phase 73 asserts against — `| { kind: 'queryTool'; command; args;
    timeoutMs?; parse }`.
  - `DEFAULT_SYSTEM_CACHE_ENTRIES: readonly SystemCacheEntry[]` in
    `packages/desktop/src/main/optimizer/system-cache-registry.ts`.
  - `resolveSystemCacheEntries(entries, log): Promise<ResolvedSystemCacheEntry[]>` — and it now
    **`lstat`s each resolved entry and drops any whose own final segment is a symlink**, because
    exact-match confinement alone has a symlink hole (both sides `realpath`, so a symlinked
    `Cache/` would compare equal to its own real target and pass). Same refusal `cleanItems`
    already makes at [`scan-service.ts:313-316`](../../../packages/desktop/src/main/optimizer/scan-service.ts).
  - `confineAllowlist(allowed: readonly string[], target: string): Promise<string | null>` in
    [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) — it takes
    **already-resolved absolute paths**, and matches by **exact equality only: no `startsWith`, no
    `sep` join, no descent**, returning `null` on refusal rather than throwing, exactly as
    `confineTree` (`:215`) does today.
  - Its consent dialog's enumeration is **derived from the catalogue at render time** (over Phase
    73's own `optimizerSystemCatalogue` channel, because the renderer may not import
    `packages/desktop`), and the same live list renders permanently beside the settings checkbox.
    This is what makes Theme A's catalogue addition self-documenting — see Decision 3.
  - Theme A of this phase is a **catalogue addition** to that registry, never a new one.
- [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s Theme C consent gate:
  `optimizerEnabled && allowSystemCacheClean && systemCacheConsentGiven`, the latter two on
  [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), with the one-time acknowledgment
  dialog in
  [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx).
  Reused as-is for Plex; **not** reused for the Trash — see Theme C and Decision 5.
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  the walker Theme B reuses. **Read the correction in Theme B before writing code**: `dirBytes`
  (`:101`), `readDirSafe` (`:83`), `newWalkState` (`:63`) and the `WalkState` type (`:55`) are all
  **module-private today**, and `dirBytes` is bounded by `MAX_WALK_ENTRIES` (`:24`) **only** —
  `MAX_WALK_DEPTH` (`:22`) bounds the separate private `walk` (`:139`), which Theme B does not use.
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess<T>(command, args, cwd, deps: RunProcessDeps<T>)`, `shell: false`, a fixed argument
  vector, `detached` + `process.kill(-pid, 'SIGKILL')` on the group. Theme C's `osascript` call runs
  through this unmodified. Its three production callers today are
  [`video/render-service.ts:202`](../../../packages/desktop/src/main/video/render-service.ts),
  [`testing/runner.ts:46`](../../../packages/desktop/src/main/testing/runner.ts) and
  [`diagnostics/runner.ts:79`](../../../packages/desktop/src/main/diagnostics/runner.ts) — each
  defining its own private `bufferSink()`. Phase 73's Theme D adds one; this phase adds another.
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BlastRadius` (`:18`), `BLAST_RADIUS_COPY` (`:32`, **module-private**, exactly two arms
  `commits`/`files`), `ConfirmRequest` (`:45`), `blastRadiusKind?: keyof typeof BLAST_RADIUS_COPY`
  (`:53`), `warnings?: string[]` (`:64`), `danger?: boolean` (`:49`). Theme C adds a third
  `BLAST_RADIUS_COPY` arm and a genuinely new field, `requireAck` — the first confirm in this app
  with friction beyond a button click. See Decision 6.
- [`packages/app/src/components/dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx) —
  `useDialogs(): DialogApi` with `confirm(request)`, `notify`, `prompt`, `setBlastRadius`. **State
  is React context, not a zustand store.** `setBlastRadius` patching an already-open request is the
  async-count path Theme C uses; the nearest caller to copy is
  [`smart-scan-tab.tsx:40-65`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx).
- [`packages/desktop/src/main/ipc/fs-write-handlers.ts:139`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts) —
  `deleteEntry`'s `shell.trashItem(targetPath(target))`. The only other `shell.trashItem` call site
  in the tree is
  [`optimizer-handlers.ts:58`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) — both
  move something *into* the Trash. Nothing in the codebase empties it, and there is **no `osascript`
  or AppleScript anywhere in `packages/*/src`**, which is the gap this phase closes.
- [`packages/desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) —
  `handle(channel, schema, handler, onInvalid)` (`:21`) and `handleBare(channel, handler)` (`:104`).
  Optimizer handlers deliberately use these, **never** `handleOp`, which is `GitOpResult`-shaped.
- [`packages/app/src/features/settings/settings-view.tsx:40-61`](../../../packages/app/src/features/settings/settings-view.tsx) —
  `PAGE_CONTENT: Record<SettingsPageId, () => React.ReactNode>`, invoked at `:150`. Theme D adds one
  import and one entry.
- [`packages/app/src/store/ui-store.ts:161-181`](../../../packages/app/src/store/ui-store.ts) —
  `SettingsPageId` (20 members), `SETTINGS_GROUPS` (`:195`, exactly `general | tools | system`),
  `SETTINGS_PAGES` (`:206`, 20 rows, whose *array order is the render and tab order*).
  `{ id: 'gitSafety', label: 'Git Safety', group: 'tools' }` (`:219`) is the precedent Theme D's
  `'trashSafety'` follows exactly — including its group. Persist config: `name:
  'midnite-studio.ui'`, **`version: 9`** (`:1750`), `partialize` at `:1751`, `migrate` arms `v1→v9`.
- [`packages/app/src/store/persisted-keys.ts:46`](../../../packages/app/src/store/persisted-keys.ts) —
  `PREFERENCE_KEYS`, where every persisted ui-store key is registered with a `// <page>.tsx` comment.
  This is the edit the phrase "the `allowForceWithLease` pattern" most often forgets.
- [`packages/app/src/components/nav-icons.ts:92-115`](../../../packages/app/src/components/nav-icons.ts) —
  `SETTINGS_PAGE_ICON: Record<SettingsPageId, IconType>`, exhaustive, so tsc enforces the new entry.
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  today's `CATEGORY_ORDER` (`:9`) + `SegmentedBar` (`:34`). Phase 73's gated "System" section (once
  landed) is where Plex's rows appear automatically; Theme D adds a **separate** Trash card beside
  it, not inside it.

**Scope guardrails.**
- **No new confinement primitive for Plex.** Two entries in Phase 73's existing
  `DEFAULT_SYSTEM_CACHE_ENTRIES`, one new `Ecosystem` member. If Theme A needs anything Phase 73's
  registry shape cannot express, that is a signal to stop and re-open Phase 73, not to bolt a
  second registry beside it.
- **The Trash is never walked into a delete.** `emptyTrash()` (Theme C) takes no path arguments and
  always runs the same fixed `osascript` argv; the Trash-summary walk (Theme B) is read-only and
  exists solely to populate a confirm dialog's numbers. See Decision 7 for exactly why that
  separation is what keeps a discovery step (`readdir('/Volumes')`) safe despite Phase 73's own
  no-discovery rule.
- **No raw `fs.rm`, ever, anywhere in this phase.** Not for Plex's cache (still `shell.trashItem`
  via `cleanSystemCaches`, Phase 73's existing path) and not for the Trash itself (Theme C —
  Decision 4). This app has never issued a permanent-delete syscall from its own code, and this
  phase does not start.
- **Two separate consent pairs, not one shared toggle.** `allowSystemCacheClean` (Phase 73) never
  gates Trash-emptying, and vice versa — see Decision 5.
- **The Trash is not a `ScanCategory` and never becomes one.** Adding a member to that enum to reuse
  the Storage tab's bar and legend would put an irreversible delete into the same visual vocabulary
  as a rebuildable cache. It gets its own card and its own copy instead. (Theme A *does* touch
  [`category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) — but
  for the new `'media'` **ecosystem**, which is a grouping label for a Plex cache, not for the Trash.)
- **`git-engine` gains nothing.** Same guardrail as every phase in this arc.
- **No new npm dependency.** `osascript` ships with macOS. The only packaging additions are one
  entitlement key and one `Info.plist` string — see Theme C.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — Plex, and only Plex, joins Phase 73's registry (M)

**✅ DONE (PR #194 + PR #196, 2026-09-06).** PR #194 landed the registry entries,
`EcosystemSchema`'s `'media'` member, the `confineAllowlist`/`system-cache-registry.test.ts`
coverage, and the consent-enumeration assertion — leaving only the `ECOSYSTEM_LABELS`/
`ECOSYSTEM_HUES` palette entries, genuinely blocked on Phase 72 Theme D (unmerged at the time).
Theme D landed in PR #196, which picked up this exact bullet in the same rebase: `'media'` → hue
`135` (not the `120` this doc originally proposed — `buildOutput` already sits at `115`, only 5°
away; `135` clears every `CATEGORY_HUES`/`METRIC_HUES` entry by ≥12°, verified by
`category-palette.test.ts`).

- [x] **Verified paths**, cross-checked against two independent sources because
      `support.plex.tv` itself returned HTTP 403 to every automated fetch attempted while writing
      this doc (see Decision 3 for the honest chain of custody on this):
      - `~/Library/Application Support/Plex Media Server/Cache` — Plex's own documented working
        directory for transcode/thumbnail output, recreated automatically. Sits beside
        `Metadata/` (posters/artwork) and `Plug-in Support/` (the Plex database, under
        `Plug-in Support/Databases/`) in the **same parent directory** — neither of those is ever
        named by this phase's registry entries, and the exact-match-only `confineAllowlist` means
        a bug here cannot accidentally reach either.
      - `~/Library/Application Support/Plex Media Server/Plug-in Support/Caches` — a second,
        narrower cache directory: cached HTTP responses from Plex's own metadata/channel agents
        (there is a dedicated Plex support article, "Clearing Plugin/Channel/Agent HTTP Caches",
        describing exactly this directory as safe to clear). Distinct from top-level `Cache/`
        (transcode output) and from `Plug-in Support/Databases/` (the actual database, two levels
        away in the same tree) — the two-segment `match` shape Phase 72 established for `.moon/cache`
        is the right one here too: `Plug-in Support/Caches`, never a bare `Plug-in Support`.
      - **Deliberately excluded**: a third path, `~/Library/Caches/PlexMediaServer/transcode/Sessions`,
        surfaced by one search result but not corroborated by a second source in this session. Not
        shipped without a second confirmation — see Decision 3.
- [x] Add `'media'` to `EcosystemSchema` in
      [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts),
      following Phase 73's own Decision 8 precedent for `'go'` — a genuinely new grouping, not a
      guess dressed as one of the existing ones.
      - It is the **twelfth** member. Phase 72 Theme C declares ten, **in this exact order**:
        `z.enum(['node','multi','rust','cpp','dotnet','python','java','swift','ruby','git'])`.
        Phase 73 Decision 8 inserts `'go'` as the eleventh.
      - **Insert `'media'` immediately before `'git'`**, giving
        `…,'ruby','go','media','git']`. Not at the end, and never alphabetised: `'git'` must stay
        the last member because `ECOSYSTEM_ORDER` in `category-palette.ts` is asserted to be a
        permutation of the enum and the Storage-tab legend renders in enum order, so appending
        after `'git'` would put the git row above a media row that produces nothing.
      - **Acceptance:** `Ecosystem` includes `'media'`, the enum's last member is still `'git'`, and
        every `Record<Ecosystem, …>` still compiles.
- [x] Add the two `Record<Ecosystem, …>` entries Phase 72 Theme D's palette
      work requires, in
      [`category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
      `ECOSYSTEM_LABELS.media = 'Media'` and `ECOSYSTEM_HUES.media = [135, 55, 48]` (not the `120`
      this doc proposed — see the theme's own note above), landed in PR #196 once Theme D existed
      for these entries to join.
      **exhaustive records, so omitting either is a typecheck failure, not a runtime gap**:
      - `ECOSYSTEM_LABELS.media = 'Media'`.
      - `ECOSYSTEM_HUES.media = 120`. The hue is not free choice: Phase 72's net-new
        `category-palette.test.ts` asserts every `ECOSYSTEM_HUES` value sits **≥12° (shortest arc)**
        from every `CATEGORY_HUES` value and from every `METRIC_HUES` value (cpu 210, memory 280,
        gpu 160, disk 35). `120` sits in the still-free 115–125 band — 20° from java's 100 and 15°
        from node's 135 — and is the value Phase 72 itself suggested for `'media'`.
      - **Acceptance:** `moon run app:test` passes `category-palette.test.ts` with no threshold
        adjustment. If it fails, move the hue inside another free band (48–70, 173–178, 192–197,
        223–226, 293–297); never relax the 12° assertion.
- [x] Add `'plex-transcode-cache' | 'plex-plugin-http-cache'` to Phase 73's `SystemCacheEntryId`
      union **and** the two objects below to `DEFAULT_SYSTEM_CACHE_ENTRIES` — both in
      `packages/desktop/src/main/optimizer/system-cache-registry.ts`, once Phase 73 lands it. Two
      edits, one file: the union is what makes a typo in an id a compile error rather than an entry
      that silently never resolves. Spelled against Phase 73's real `SystemCacheEntry` shape —
      `reclaim`, not `cost`, and a `path` with no leading `~` or `/`:
      ```ts
      {
        id: 'plex-transcode-cache',
        label: 'Plex transcode cache',
        ecosystem: 'media',
        producer: 'Plex Media Server (regenerates on next transcode or thumbnail request)',
        reclaim: 'cheap',
        resolve: { kind: 'fixed', path: 'Library/Application Support/Plex Media Server/Cache' },
      },
      {
        id: 'plex-plugin-http-cache',
        label: 'Plex metadata agent cache',
        ecosystem: 'media',
        producer: "Plex Media Server's metadata agents (re-fetch over the network on next library scan)",
        reclaim: 'costly',
        resolve: {
          kind: 'fixed',
          path: 'Library/Application Support/Plex Media Server/Plug-in Support/Caches',
        },
      },
      ```
      - The `reclaim` split is Phase 72's own rule applied literally — *"`cheap` means a local
        rebuild restores it; `costly` means the network does."* Transcode output is recomputed from
        the original media file on this machine; the agent cache is re-fetched from Plex's remote
        agents. Getting this backwards is not cosmetic: Phase 72 Theme D gates behaviour on it.
      - `resolve.path` is homedir-relative with **no leading slash and no `~`**, matching Phase 73's
        `PathResolver` contract (`resolveSystemCacheEntries` prepends `os.homedir()`).
      - **The `label` strings are user-facing copy, not internal names** — Phase 73's consent
        enumeration and its settings-page list both render them verbatim, so each has to read as a
        clause in a sentence. `'Plex metadata agent cache'` is chosen over the more literal
        *"plugin HTTP cache"* (Plex's own article title) because the enumeration's reader is
        deciding whether to grant access, not looking the directory up.
      - **Acceptance:** both ids appear in `DEFAULT_SYSTEM_CACHE_ENTRIES` and nothing else in the
        registry changes; ids are kebab, stable, and never reused (Phase 73's own rule — they key
        settings state and `OptimizerSystemCleanRequest.entryIds`).
- [x] `resolve: { kind: 'fixed', … }` for both, stated as a decision rather than a default — Plex
      exposes no `env`/CLI equivalent of `go env GOCACHE` to ask for its own data directory, so
      there is no `queryTool` arm to prefer here. Phase 73's Decision 2 rule ("prefer `queryTool`
      whenever the tool exposes one") correctly falls through to `fixed` when nothing exists to ask.
      Record that in a code comment on the entries, so a later reader does not "fix" it.
- [x] **Prove the consent enumeration picked Plex up — do not hand-edit the copy.** Phase 73
      resolved its own Decision 9 by deriving the dialog's enumeration from the catalogue at render
      time (over its `optimizerSystemCatalogue` channel) and rendering the same live list beside the
      settings checkbox, so adding two registry entries updates both surfaces automatically.
      - The item is therefore an **assertion, not a copy edit** — and a stronger one, because it
        fails if the derivation ever regresses to hardcoded prose:
        `optimizer-settings-page.test.tsx` (or wherever Phase 73 lands its consent spec) renders the
        page with a stubbed catalogue containing both Plex entries and asserts both `label` strings
        — `Plex transcode cache` and `Plex metadata agent cache` — appear in the enumeration.
      - **The one hand-edit that remains**: Phase 73's Theme C static copy contains the line
        *"Never Plex or another media tool's cache (a separate review)"*. **Delete it.** A derived
        enumeration that lists Plex sitting beside prose promising Plex is never touched is worse
        than either alone. Assert the rendered page does **not** contain
        `another media tool's cache`.
      - No consent version and no reset of `systemCacheConsentGiven` — the whole point of the
        derived list is that a user can always see the current covered set without being re-asked.
        See Decision 3.
- [x] Extend `system-cache-registry.test.ts` with both new entries:
      - each resolves to `<fakeHome>/Library/Application Support/Plex Media Server/…` under a fake
        `homedir`, using the temp-dir idiom from
        [`scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts)
        (`mkdtemp(join(tmpdir(), …))` + `realpath`, because macOS resolves `/var` → `/private/var`);
      - an entry whose resolved path does not exist is dropped by `resolveSystemCacheEntries`
        (Plex not installed is the common case, and it must be a silent skip, not an error);
      - **a symlinked `Cache/` is dropped, not followed** — create the fixture as
        `Plex Media Server/Cache → <some other dir>` and assert `resolveSystemCacheEntries` omits
        the entry. This is Phase 73's symlink rule applied to Plex specifically, and it is the
        assertion that closes the one hole exact-match confinement does *not* cover: both sides
        `realpath`, so a symlinked entry would compare `===` to its own real target and pass;
      - `reclaim` is `'cheap'` for the transcode entry and `'costly'` for the agent entry, asserted
        by id so a future reorder cannot silently swap them;
      - both `resolve.path` strings begin with neither `~` nor `/`, per Phase 73's authoring rule.
- [x] `confineAllowlist` refuses every sibling, asserted **explicitly rather than left implied** —
      in `confine-allowlist.test.ts` (or wherever Phase 73 Theme A lands its own):
      - `…/Plex Media Server` (the parent) → `null`
      - `…/Plex Media Server/Metadata` (artwork, expensive to rebuild) → `null`
      - `…/Plex Media Server/Plug-in Support/Databases` (the database) → `null`
      - `…/Plex Media Server/Plug-in Support` (the parent of an allowed entry) → `null`
      - `…/Plex Media Server/Cache/Transcode` (a **child** of an allowed entry) → `null`, which is
        the assertion that proves the rule is equality and not `startsWith`
      - `…/Plex Media Server/Cache` → the realpath, i.e. accepted.
- [x] **Deliberately absent**: Emby, Jellyfin, Kodi, iTunes/Music.app, Photos.app's own library
      caches. "Media tool caches" as a category could plausibly include all of these, and each is
      plausibly shaped the same way (a cache subfolder beside a database) — but this session
      verified none of them against source documentation the way Plex's paths above are verified,
      and Phase 72's own precedent (PHP/Elixir/Dart/Haskell detectors: "add them when someone has
      the repo") applies with equal force here: add one when someone can verify its real path, not
      by analogy to Plex's shape. See Decision 2.

### B — Computing what's in the Trash, honestly (M)

**✅ DONE (PR #189, 2026-09-05).**

*No upstream dependency. This is where to start the phase.*

- [x] Add `packages/desktop/src/main/trash-service.ts` — **not** under `optimizer/`, because
      emptying the Trash is not a cache-cleaning operation and does not belong beside
      `system-cache-service.ts` the way Plex's catalogue entries belong beside Cargo's. A new
      top-level main module, matching how
      [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts) and
      [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) already sit
      beside `optimizer/` as siblings rather than inside it (both verified present at that level).
- [x] **Correct the walker claim before reusing it — `dirBytes` and friends are private today.**
      In [`scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts), add the
      `export` keyword to `readDirSafe` (`:83`), `dirBytes` (`:101`), `newWalkState` (`:63`) and the
      `WalkState` type (`:55`). Nothing else about them changes.
      - **Chosen over the two alternatives, and why:** copying the walk into `trash-service.ts`
        would fork the entry budget and the symlink rule — the two properties Phase 59's own
        verification asserts — and extracting them into a new `optimizer/walk.ts` would move code
        Phase 72 and Phase 73 are both mid-edit on, guaranteeing a conflict. Widening four
        declarations by one keyword is the smallest change that leaves one walker in the tree.
      - **Consequence for the file map:** `scan-service.ts` is therefore **not**
        "deliberately unchanged" in this phase, and the earlier draft of this doc that said so was
        wrong. Its behaviour is unchanged; its export surface is not.
      - If Phase 73's Theme B lands this same export first (its `scanSystemCaches` reuses the same
        primitives), this item degrades to a no-op — verify, do not re-apply.
- [x] Export `computeTrashSummary(opts: ComputeTrashSummaryOptions): Promise<TrashSummary>` from
      `trash-service.ts`, with the injectable roots that make it testable without a real `~/.Trash`:
      ```ts
      export type ComputeTrashSummaryOptions = {
        signal: AbortSignal;
        /** Defaults to `os.homedir()`. Injected by the spec, never by IPC. */
        home?: string;
        /** Defaults to `'/Volumes'`. Injected by the spec, never by IPC. */
        volumesDir?: string;
        /** Defaults to `os.userInfo().uid`. Injected by the spec, never by IPC. */
        uid?: number;
        log?: Logger;
      };
      ```
      - **Every override is spec-only.** No IPC payload reaches this function — `optimizerTrashSummary`
        is a `handleBare` channel with no request schema at all, so there is no path from a renderer
        string to `home`/`volumesDir`. Say so in the docblock; it is the property that keeps the
        discovery step in Decision 7's safe half.
      - `os.userInfo()` has **zero** existing uses in the tree; `homedir()` is used at
        [`fs-scope.ts:54`](../../../packages/desktop/src/main/fs-scope.ts) and elsewhere. Prefer
        `homedir()` over `app.getPath('home')` here so `trash-service.ts` needs no `electron` import
        and its spec runs under bare vitest.
- [x] The home Trash root: `join(home, '.Trash')`. If it does not exist, that is an **empty summary,
      not an error** — a fresh account has no `~/.Trash` until something is deleted.
- [x] Multi-volume discovery — **a shallow, one-level `readDirSafe(volumesDir)`, never recursive**:
      - For each entry: **skip anything `entry.isSymbolicLink()`**. macOS puts a symlink to the boot
        volume in `/Volumes` (`/Volumes/Macintosh HD` → `/`); following it would walk the entire
        startup disk and double-count `~/.Trash`. This single `continue` is the difference between a
        bounded read and a whole-disk crawl, and it gets its own assertion in the spec.
      - For each surviving directory entry, the candidate is `/Volumes/<name>/.Trashes/<uid>` — the
        documented macOS convention for a per-volume, per-user Trash. Include it only if `lstat`
        says it is a directory and **not** a symlink.
      - A volume whose `.Trashes` exists but has no subdirectory for *this* `uid` is excluded — that
        is another user's trash on a shared disk and this app has no business sizing it.
      - `readDirSafe` already swallows `EACCES`/`EPERM` and returns `[]`, which is the right
        behaviour for a mounted volume the user cannot read: it is skipped, not fatal.
      - This is the one discovery step this phase adds despite Phase 73's own no-discovery rule;
        Decision 7 explains exactly why it is safe anyway.
- [x] Returns `TrashSummary` — every field defined by what it actually measures:
      - `itemCount` — the number of **top-level entries** across every walked root, summed. This is
        deliberately Finder's own definition of "N items in the Trash", not a recursive file count.
      - `totalBytes` — the sum of `dirBytes(root, state, signal, log)` over every root, plus the
        `lstat().size` of top-level files. **Symlinks contribute zero**, because `dirBytes` skips
        them (`scan-service.ts:119`); the figure is a floor, and the UI copy must not call it exact.
      - `oldestModifiedAt: string | null` — the oldest top-level entry's own `mtime` as an ISO
        string, `null` when the Trash is empty. **Not** "the date it was moved to the Trash": macOS
        does not reliably expose that without parsing per-item extended attributes this app has no
        other reason to read. Name the field and its UI copy honestly — see Decision 8.
      - `volumeCount` — the number of roots actually walked, **including** `~/.Trash`. So a machine
        with no external disks reports `1`, and the UI only mentions other disks when it is `> 1`.
      - `truncated` — `true` when `state.entriesWalked >= MAX_WALK_ENTRIES` after the last root.
        **`MAX_WALK_DEPTH` is not part of this test**: it bounds the private recursive `walk`, and
        `dirBytes` is an iterative stack walk with no depth bound at all. The earlier draft of this
        doc claimed both budgets applied; only the entry budget does.
      - One `WalkState` is shared across every root, so the 200,000-entry budget is a budget for the
        whole summary, not per volume — a single pathological root cannot be escaped by mounting a
        second disk.
- [x] Cancellation: poll `opts.signal.aborted` between roots and return the partial totals rather
      than throwing. `dirBytes` already polls the same signal internally at `:111` and `:117`. The
      handler supersedes an in-flight summary the same way `optimizerScan` does
      (`optimizer-handlers.ts:24`, `currentScan?.abort()`), so a double-click cannot race two walks.
- [x] Add `TrashSummarySchema` to a new
      [`packages/shared/src/domain/trash.ts`](../../../packages/shared/src/domain/trash.ts):
      ```ts
      export const TrashSummarySchema = z.object({
        itemCount: z.number().int().nonnegative(),
        totalBytes: z.number().nonnegative(),
        /** The oldest top-level entry's own mtime, ISO-8601. `null` when the Trash is empty. */
        oldestModifiedAt: z.string().nullable(),
        /** Roots walked, `~/.Trash` included — so `1` means "no other disks". */
        volumeCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
      });
      export type TrashSummary = z.infer<typeof TrashSummarySchema>;
      ```
      - Its own domain file, not folded into `domain/optimizer.ts`, for the same reason Phase 73
        keeps `SystemCacheItemSchema` in its own `domain/system-optimizer.ts`: a Trash summary has no
        `path`, no `detectorId`, no `ecosystem` — it is a single aggregate, not a list of items, and
        forcing it into the existing shape would mean padding it with fields that mean nothing here.
      - **Add `export * from './trash';` to
        [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts)** —
        the barrel is how `@midnite/studio-shared` consumers see it (`optimizer.ts` is re-exported at
        `:13`). A new domain file that is not re-exported is invisible and the omission typechecks.
- [x] Add two channels following `mstudio:<domain>:<verb>`
      ([`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), inside the
      existing `CHANNELS` object beside the Phase 59 optimizer block at `:299-309`):
      `optimizerTrashSummary: 'mstudio:optimizer:trash-summary'` and
      `optimizerTrashEmpty: 'mstudio:optimizer:trash-empty'`.
      - Kept in the `optimizer` domain: Trash-emptying is this arc's own extension of the Optimizer,
        and inventing a fourth IPC domain for two channels buys nothing a consistent prefix does not
        already give. Never reuse `optimizerClean` — that channel takes a `paths` array.
      - Both are **payload-free**, so neither gets a `*Request` schema. Add to
        [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) only:
        `export const OptimizerTrashSummaryResponse = OptimizerResultOf(TrashSummarySchema);` and
        `export const OptimizerTrashEmptyResponse = OptimizerVoidResultSchema;`.
      - `schemas.ts` has **no channel-keyed registry** — the binding is made at the call site, so
        the two names above are the whole contract.
- [x] Add both to the bridge, **inside the existing `optimizer: { … }` namespace** at
      [`bridge.ts:902-914`](../../../packages/shared/src/ipc/bridge.ts):
      ```ts
      /** Read-only: walks ~/.Trash plus every mounted volume's own Trash. Never a delete target. */
      trashSummary: () => Promise<z.infer<typeof S.OptimizerTrashSummaryResponse>>;
      /** Fixed `osascript` argv, no parameters. Gated three ways in the renderer — see Theme C. */
      emptyTrash: () => Promise<z.infer<typeof S.OptimizerTrashEmptyResponse>>;
      ```
      and to [`preload/index.ts:502-509`](../../../packages/desktop/src/preload/index.ts) as
      `trashSummary: () => call(CHANNELS.optimizerTrashSummary),` and
      `emptyTrash: () => call(CHANNELS.optimizerTrashEmpty),`. Because they live inside `optimizer`,
      the preload's `Pick<MidniteStudioBridge, …>` union at `:145` needs **no** change — a new
      top-level namespace would have needed one, and this is the reason not to make one.
- [x] `packages/desktop/src/main/trash-service.test.ts` — the real-temp-dir idiom from
      `scan-service.test.ts`, no `fs` faking:
      - a fixture `.Trash` with three known files proves `itemCount === 3` and `totalBytes` equals
        their summed sizes;
      - a fixture with a nested directory proves `itemCount` counts the **directory as one item**
        while `totalBytes` includes its contents;
      - items written with distinct `mtime`s prove `oldestModifiedAt` is the earliest, as an ISO
        string;
      - a fake `volumesDir` with one directory containing `.Trashes/<uid>` proves `volumeCount === 2`;
      - a volume with `.Trashes/<other-uid>` and no `<uid>` entry is excluded (`volumeCount === 1`);
      - **a symlink in `volumesDir` pointing at the fixture home is skipped** — `volumeCount === 1`
        and `totalBytes` is not doubled. This is the boot-volume-symlink assertion;
      - a symlink *inside* `.Trash` adds zero bytes and does not escape the root;
      - a missing `.Trash` yields `{itemCount: 0, totalBytes: 0, oldestModifiedAt: null,
        volumeCount: 0, truncated: false}` without throwing;
      - an already-aborted `AbortSignal` returns promptly with zeroed totals rather than walking;
      - a budget-exceeding fixture (or a `WalkState` pre-seeded past `MAX_WALK_ENTRIES`) sets
        `truncated: true`.

### C — Emptying the Trash: Finder, never a raw unlink (L)

**✅ DONE (PR #189 backend/IPC half + this PR's remainder, 2026-09-05).** PR #189 landed
`emptyTrash()`, its stderr mapping and timeout wording, `trash-handlers.ts`, packaging (entitlement
+ usage string), and `ConfirmDialog`'s `requireAck`/`trash` copy arm. This PR closes the rest,
folded in with Theme D since the two were coupled exactly as this doc predicted:
`ui-store.ts`'s `allowTrashEmpty`/`trashEmptyConsentGiven` (plus the one-time acknowledgment
dialog), `use-optimizer.ts`'s `loadTrashSummary`/`runEmptyTrash`, the confirm's
warnings-array/recompute-own-numbers behaviour, and the point-of-use three-way gate.

*No upstream dependency. This is the theme a reviewer should read most carefully — see Decision 4.*

- [x] Export `emptyTrash(deps?: EmptyTrashDeps): Promise<OptimizerVoidResult>` in `trash-service.ts`:
      ```ts
      export type EmptyTrashDeps = { spawn?: SpawnFn; timeoutMs?: number; log?: Logger };

      const EMPTY_TRASH_COMMAND = 'osascript' as const;
      const EMPTY_TRASH_ARGS = ['-e', 'tell application "Finder" to empty trash'] as const;
      ```
      - The return type is **`OptimizerVoidResult`**
        ([`domain/optimizer.ts:101`](../../../packages/shared/src/domain/optimizer.ts):
        `{ok: true} | {ok: false, message: string}`), not `OptimizerResultOf<Record<string, never>>`
        — there is nothing to return, and `OptimizerVoidResultSchema` is exactly the existing shape
        for that (`optimizerKill` is its only user today). See Decision 12.
      - Runs **exactly one** fixed command through
        [`runProcess`](../../../packages/desktop/src/main/process-runner.ts):
        `runProcess(EMPTY_TRASH_COMMAND, EMPTY_TRASH_ARGS, homedir(), { spawn, sink: bufferSink(),
        timeoutMs })`. The argv is a module-level `as const` literal, **never built by
        concatenation and never taking any value from the renderer** — unlike Phase 73's vendor
        reclaim commands, which at least select an `entryId`, this operation has no parameter at all.
      - `cwd` is `homedir()` because `runProcess` requires one and `osascript` does not use it;
        picking the home directory rather than a repo path keeps it obviously unrelated to any scan.
      - Define a private `bufferSink(): ProcessSink<string>` in this file, copying
        [`testing/runner.ts:21`](../../../packages/desktop/src/main/testing/runner.ts) — every
        `runProcess` caller in the tree defines its own rather than sharing one, and following that
        beats exporting a new shared sink for a command whose stdout is always empty.
      - `deps.spawn` exists **only** so the spec can inject a `fakeChild()`. This repo never
        `vi.mock`s `node:child_process`; every process-running module takes an injected `SpawnFn`.
      - **Rejected alternative — walking `~/.Trash` (+ discovered volumes) and issuing `fs.rm` per
        top-level entry**: it would (a) require this app's own code to issue an actual
        permanent-delete syscall, a property this codebase has never had and should not acquire for
        this feature alone; (b) reimplement Finder's own handling of locked/immutable/in-use items,
        which macOS already solves and this app has no reason to solve worse; (c) still need the same
        multi-volume discovery Theme B already does, with none of Finder's own guarantee that it
        actually knows about every mounted volume's Trash the way its own "Empty Trash" menu item
        does. Finder wins on all three.
- [x] **Read `runProcess`'s outcome correctly — a failed `osascript` still returns `ok: true`.**
      `ProcessOutcome<T>` is `{ok: true; data; stderr; exitCode: number | null; ranAt; durationMs} |
      {ok: false; reason: 'not-installed' | 'timed-out' | 'parse-failed'; hint}`, and its `ok` means
      only *"the sink could read the output"*. So the mapping is, in order:
      - `outcome.ok === false && reason === 'timed-out'` → see the timeout item below.
      - `outcome.ok === false` (any other reason) → `{ok: false, message: outcome.hint}`.
      - `outcome.ok === true && outcome.exitCode === 0` → `{ok: true}`.
      - `outcome.ok === true && exitCode !== 0` → inspect `outcome.stderr` and map, below.
      - Treating `outcome.ok` alone as success is the specific bug this item exists to prevent, and
        the spec asserts a non-zero exit with empty stderr still comes back `{ok: false}`.
- [x] Map AppleScript's three known stderr signatures to specific, actionable messages rather than a
      bare command-failed string. Match on the error number substring, which `osascript` always
      prints (e.g. `execution error: Not authorized to send Apple events to Finder. (-1743)`):
      - **`-1743`** (automation not authorized) → *"Midnite Studio isn't allowed to control Finder.
        Grant it in System Settings ▸ Privacy & Security ▸ Automation, then try again."*
      - **`-128`** (user cancelled) → *"Cancelled in Finder — nothing was deleted."* This is **not a
        failure of this app**: it is what Finder's own "Warn before emptying the Trash" sheet returns
        when the user backs out, and it must never read as an error. See Decision 17.
      - **`-600` / `-1728`** (Finder not running / not scriptable) → *"Finder didn't respond. Open
        Finder and try again."*
      - Anything else → the first line of `stderr`, trimmed, prefixed *"Finder could not empty the
        Trash: "*. Never surface a raw multi-line AppleScript trace.
      - The `-1743` path is the first Automation-permission prompt this app has ever triggered;
        **flag for the human pass** (Theme E) since the grant UX cannot be exercised in a sandboxed
        session.
- [x] **Raise the timeout, and word a timeout truthfully.** Pass `timeoutMs: 10 * 60_000` explicitly
      rather than accepting `DEFAULT_TIMEOUT_MS = 120_000`.
      - AppleScript's `empty trash` does not return until Finder has finished, and a Trash holding
        tens of gigabytes routinely takes longer than two minutes. At the default this app would
        report a failure for an operation that is succeeding.
      - `runProcess`'s timeout kills `osascript`, which does **not** stop Finder — Finder is a
        separate process that keeps deleting. So the message is
        *"Finder is still emptying the Trash. Midnite Studio stopped waiting; it did not stop
        Finder — check the Trash in a moment."*, returned as `{ok: false, message}` so the card
        re-checks rather than claiming success.
- [x] **Known, accepted double-confirm**: if Finder's own "Warn before emptying the Trash"
      preference (Finder ▸ Settings ▸ Advanced) is on, invoking this via AppleScript still surfaces
      Finder's own native confirm sheet after this app's. Left as-is, not suppressed — Finder's own
      dialog is out of this app's control, and suppressing it would mean this app reaching further
      into Finder's own behavior than "ask it to do the thing its menu already offers." The
      acknowledgment dialog's copy names it in one clause (*"macOS may ask a second time"*) so it
      reads as expected rather than as a bug, and the `-128` mapping above is what makes cancelling
      that second sheet a clean outcome.
- [x] **Packaging: the entitlement and the usage string, both currently absent.** Verified in the
      tree: `hardenedRuntime: true`
      ([`electron-builder.yml:82`](../../../packages/desktop/electron-builder.yml)),
      `com.apple.security.automation.apple-events` **not present** in
      [`resources/entitlements.mac.plist`](../../../packages/desktop/resources/entitlements.mac.plist)
      (which today carries only the four `com.apple.security.cs.*` JIT keys), `NSAppleEventsUsageDescription`
      **not present anywhere in the repo**, and **no `mac.extendInfo:` block exists at all**.
      - Add `<key>com.apple.security.automation.apple-events</key><true/>` to
        `entitlements.mac.plist`. Do **not** add it to `entitlements.mac.inherit.plist`: that file
        is for helper processes, and the renderer has no business sending Apple events.
      - Add a `mac.extendInfo:` block to `electron-builder.yml` with
        `NSAppleEventsUsageDescription: Midnite Studio asks Finder to empty the Trash when you choose
        Empty Trash in the Workspace Optimizer.` — this string is what macOS shows in the consent
        prompt, so it must name the one thing this app actually does with the permission.
      - **This only works in a packaged build.** Under `moon run desktop:start` the responsible
        process is the dev Electron binary, so the prompt names "Electron", and a grant made there
        does not transfer to the shipped app. Theme E's human pass runs `moon run desktop:dist`.
      - **Known friction, documented not solved:** `notarize: false` and env-gated signing mean a
        rebuild can change the app's code signature, and macOS invalidates a TCC grant when it does
        — so a developer may be re-prompted after each `desktop:dist`. This is the same class of
        problem the pty broker's build fingerprint solves for its socket, and it is a packaging
        question, not a feature one. See the one remaining Open in Decisions.
- [x] Add `allowTrashEmpty: boolean` (default `false`) and `trashEmptyConsentGiven: boolean`
      (default `false`) to [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
      **a separate pair, never reusing `allowSystemCacheClean`/`systemCacheConsentGiven`** (Decision 5).
      Following `allowForceWithLease`'s real edit list, which is **six edits per flag in `ui-store.ts`
      plus one in `persisted-keys.ts`** — not the "eight edits" an earlier draft claimed:
      1. state type member (beside `:1093`), 2. setter signature, 3. `PersistedUi` `Pick` member
      (`:1286`), 4. default in the creator (`:1349`), 5. setter impl, 6. `partialize` entry (`:1826`);
      7. a `PREFERENCE_KEYS` entry in
      [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) with the
      `// trash-safety-page.tsx` trailing comment, exactly as `'allowForceWithLease'` carries `:34`
      and `'optimizerEnabled'` carries `:46`.
      - **Step 7 is not optional bookkeeping — omitting it fails the build twice.**
        `persisted-keys.ts:158-163`'s `AssertExactPartition` makes a missing key a *typecheck*
        error, and `persisted-keys.test.ts:92-97` additionally requires each key's identifier to
        appear literally somewhere under `features/settings/` — which is satisfied here only
        because Theme D's `trash-safety-page.tsx` reads both flags by name.
      - Do the store edits and the page in the same commit for that reason; a boolean landed without
        its settings page fails a test that looks like it is about something else.
      - **No `version` bump, no `migrate` arm.** The store is at `version: 9`; a persisted blob from
        before this phase simply lacks the keys, and zustand merges the `false` defaults. Identical
        reasoning to `allowForceWithLease` and `optimizerEnabled`, neither of which added an arm.
- [x] The one-time acknowledgment dialog — confirmed once, the first time `allowTrashEmpty` flips
      `false → true`; toggling off and back on does **not** re-ask, because
      `trashEmptyConsentGiven` stays true. Body copy, in substance:
      > Emptying the Trash permanently deletes everything in it — including anything another app put
      > there, not just Midnite. Unlike every other delete in this app, this does **not** go through
      > the Trash first, because this operation is the Trash's own last step. There is no undo.
      > macOS may ask a second time; that dialog is Finder's, not ours.
      - Confirming sets `trashEmptyConsentGiven = true` and leaves `allowTrashEmpty = true`.
      - **Cancelling reverts `allowTrashEmpty` to `false`** — the checkbox must not be left visually
        on after a declined consent. Mirrors Phase 73's pattern exactly.
      - Raised through `useDialogs().confirm({ danger: true, hideCancel: false, confirmLabel: 'I
        understand' })` — no `blastRadius`, because at this point nothing is being deleted and a
        count would imply otherwise.
- [x] Add `packages/desktop/src/main/ipc/trash-handlers.ts` exporting
      `registerTrashHandlers(): void` — its own handler file, not folded into
      `optimizer-handlers.ts`, for the same separation-of-trust reason Phase 73 keeps
      `system-cache-registry.ts` out of `detectors.ts`: the two operations should never become easy
      to confuse at a call site.
      - Both channels are payload-free, so both use `handleBare` (`handle.ts:104`), not `handle` —
        there is no schema to validate and therefore no `onInvalid` arm.
      - `optimizerTrashSummary` owns an `AbortController` in module scope and calls
        `currentSummary?.abort()` on re-entry, copying `optimizer-handlers.ts:16-26` verbatim in
        spirit.
      - Envelopes are hand-rolled `{ok: true as const, value}` / `{ok: false as const, message}`,
        matching every optimizer handler; **never** the `GitOpResult` helpers.
      - Register it in [`main/index.ts`](../../../packages/desktop/src/main/index.ts): one import
        beside `:30` and one call inside `app.whenReady()` immediately after
        `registerOptimizerHandlers(getMainWindow)` (`:361`). It takes no arguments — it needs no
        window, since neither channel streams progress.
      - **The main process does not consult `allowTrashEmpty`.** Like every optimizer handler, the
        gate is renderer-side (Decision 14's note); the main-side safety property is that the argv is
        a constant, which no renderer can influence.
- [x] Add `requireAck?: string` to `ConfirmRequest`
      ([`confirm-dialog.tsx:45`](../../../packages/app/src/components/confirm-dialog.tsx)):
      - When present, render a checkbox with that exact label between the warnings box and the
        button row, using the same raw-input markup the settings pages use (`<label className="flex
        items-center gap-2 text-xs">` + `<input type="checkbox" className="h-3.5 w-3.5
        accent-[hsl(var(--primary))]" />`) — there is no shared checkbox component in this app, and
        inventing one for this dialog is out of scope.
      - The Confirm button carries `disabled={Boolean(request.requireAck) && !acked}`. `disabled`
        rather than `aria-disabled` so the focus trap (`useFocusTrap`, whose first stop is Cancel)
        skips it naturally until it is legal to press.
      - **State reset is the subtle part.** `ConfirmDialog` holds `const [acked, setAcked] =
        useState(false)` (the file imports only `useRef` today). It must **not** reset on `request`
        identity, because `dialog-host.tsx`'s `setBlastRadius` patches the open request into a new
        object when an async count lands — an effect keyed on `request` would silently un-tick the
        box mid-flight. Instead, `DialogHost` renders `<ConfirmDialog key={confirmSeq} …>` with a
        counter incremented inside `confirm()`, so each *new* request gets a fresh instance and a
        patched one does not. See Decision 6.
      - First use of any friction beyond a plain button click in this app's one confirm-dialog
        component — reserved for the one operation in this entire arc with true no-undo.
      - **Every existing caller is unaffected**: the field is optional and absent, so `acked` is
        never consulted.
- [x] Add a third arm to `BLAST_RADIUS_COPY` (`confirm-dialog.tsx:32`, module-private, so this is a
      local edit with no export change):
      ```ts
      trash: {
        subject: (n: number) => `${n} item${n === 1 ? '' : 's'}`,
        consequence: 'will be permanently deleted — this cannot be undone.',
        noEffect: 'The Trash is already empty.',
      },
      ```
      `blastRadiusKind?: keyof typeof BLAST_RADIUS_COPY` widens by itself; no type edit is needed.
      Note it deliberately reads *"permanently deleted"* where the `files` arm reads *"moved to the
      trash"* — the two sentences are the whole difference between Phase 59's confirm and this one.
- [x] The Trash confirm's `warnings` array, built in order, each line a full sentence:
      - `` `${formatBytes(summary.totalBytes)} will be freed.` ``
      - `` `The oldest item was last modified ${formatDate(summary.oldestModifiedAt)}.` `` — omitted
        entirely when `oldestModifiedAt` is `null`. Worded as *last modified*, never *"deleted on"*
        or *"in the Trash since"*, per Decision 8.
      - when `summary.volumeCount > 1`:
        `` `Includes the Trash on ${summary.volumeCount - 1} other mounted disk${…}.` ``
      - when `summary.truncated`: `'More than 200,000 entries were found — the count and size above
        are a floor, not an exact total.'`
      - `sample` stays `[]` — `BlastRadius.sample` is `{sha, subject}[]`, git-only, and
        `ConfirmDialog` already skips the list when it is empty (`:176-189`).
- [x] **The confirm recomputes its own numbers; it never trusts the card's.** The click handler calls
      `dialogs.confirm({ …, blastRadius: undefined })` — which renders *"Checking what this
      affects…"* (`:169`) — then awaits `trashSummary()` and calls `dialogs.setBlastRadius({count:
      summary.itemCount, sample: []})` plus the warnings.
      - Chosen over passing the card's cached summary straight through: the card's number is from
        whenever the user last pressed "Check Trash", and anything the user (or any other app) has
        deleted since would make the confirm understate what it is about to destroy. For the one
        irreversible operation in the arc, the number on the confirm must be the freshest one
        available. See Decision 15.
      - If the re-check fails, close the confirm and toast the error — **never** offer a Confirm
        button with an unknown blast radius.
- [x] The `emptyTrash` request is gated at the point of use by
      `optimizerEnabled && allowTrashEmpty && trashEmptyConsentGiven` — the same three-way-AND shape
      Phase 73 Theme C established, with `allowTrashEmpty`/`trashEmptyConsentGiven` standing in for
      its second and third factors. The gate hides the card entirely (Theme D); it is not a disabled
      button, because a disabled control advertises a capability the user has not consented to.
- [x] Add `loadTrashSummary()` and `runEmptyTrash()` to
      [`use-optimizer.ts`](../../../packages/app/src/features/optimizer/use-optimizer.ts), following
      its existing shape exactly: plain exported async functions (not hooks), `const api = bridge();
      if (!api) { … return; }`, results written into the store, failures raised via
      `useToastStore.getState().addToast(…)`.
      - `runEmptyTrash`'s cancelled-in-Finder message is toasted with `status: 'info'`, not
        `'error'` — the user did that on purpose.
      - On a successful empty, immediately re-run `loadTrashSummary()` so the card shows
        `0 items` rather than a stale count.
- [x] `packages/desktop/src/main/trash-service.test.ts` (the `emptyTrash` half) and
      `packages/desktop/src/main/ipc/trash-handlers.test.ts`:
      - **The literal-argv assertion**, modelled on
        [`diagnostics/runner.test.ts:62`](../../../packages/desktop/src/main/diagnostics/runner.test.ts):
        `expect(spawn).toHaveBeenCalledWith('osascript', ['-e', 'tell application "Finder" to empty
        trash'], expect.any(String))`, with a `fakeChild()` copied from
        [`process-runner.test.ts`](../../../packages/desktop/src/main/process-runner.test.ts) — plus
        `expect(spawn).toHaveBeenCalledTimes(1)`, so the argv is provably the *only* thing spawned.
      - `emptyTrash` takes no parameters, so there is nothing to fuzz — assert instead that the
        exported `EMPTY_TRASH_ARGS` is `as const` and that two separate calls spawn identical argv.
      - a `close(0)` child → `{ok: true}`; a `close(1)` with empty stderr → `{ok: false}` (the
        `outcome.ok === true, exitCode !== 0` path);
      - stderr containing `(-1743)` → the Automation message; `(-128)` → the cancelled message;
        `(-600)` → the Finder-not-running message; an unrecognised trace → its first line only;
      - a `'timed-out'` outcome → the "stopped waiting, did not stop Finder" message;
      - `trash-handlers.test.ts` uses the `vi.hoisted` + `vi.mock('electron', () => ({ ipcMain: {
        handle } }))` idiom from
        [`optimizer-handlers.test.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.test.ts),
        with its `invoke(channel, raw)` helper, and asserts both channels are registered and that a
        second `optimizerTrashSummary` invoke aborts the first.
      - **A grep-level assertion that this phase's own rule held:** `trash-service.ts` contains no
        `rm`, `rmdir`, `unlink` or `trashItem`. One `expect(source).not.toMatch(…)` over the file's
        own text is crude, and it is exactly proportionate to the one operation in the arc that
        cannot be undone.

### D — UI: a settings page of its own, and a card that never reads as recoverable (M)

**✅ DONE (PR #194, 2026-09-06).** The Trash half is complete: the `trashSafety` settings page, the
Storage tab's five-state Trash card, the `optimizer-store.ts` slice, and both e2e specs. Plex's
two rows need no dedicated code — they render inside Phase 73's System section automatically,
which the merge already reconciles into this PR's final state. Only the screenshot pairing (below)
stays owed.

- [x] Add `packages/app/src/features/settings/settings-pages/trash-safety-page.tsx`, copying
      [`git-safety-page.tsx`](../../../packages/app/src/features/settings/settings-pages/git-safety-page.tsx)'s
      shape exactly — that file's own reasoning, *"a switch that turns on a real force-push is a
      different weight of decision… it deserves a page a user has to go looking for,"* applies with
      more force to a switch with no undo at all than to one with a lease-checked one.
      - Structure, verbatim from the template: one `<Accordion title="Empty Trash" icon={<LuTrash2
        className="h-4 w-4" />} defaultOpen>` from `@bilo-io/ui`, containing one `<Field label hint>`
        (from `'./controls'`) wrapping a raw `<label><input type="checkbox" className="h-3.5 w-3.5
        accent-[hsl(var(--primary))]" /> …</label>` whose text repeats the label — that duplication
        is what makes `getByRole('checkbox', { name: … })` work in e2e.
      - Checkbox label, used identically in both places: **"Allow emptying the Trash"**.
      - `hint`: *"Adds an Empty Trash card to the Optimizer's Storage tab. Emptying is permanent —
        it asks Finder to do it, and there is no undo. Nothing else in Midnite Studio ever deletes
        without moving to the Trash first."*
      - A "What this still never does" box, same token string as the template
        (`space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px]
        text-muted-foreground`), listing: *no selective emptying — it is all or nothing, like
        Finder's own menu item*; *no scheduled or automatic emptying*; *no `rm` — the request goes to
        Finder, which is what handles locked and in-use items*.
      - The checkbox's `onChange(true)` is what triggers Theme C's one-time acknowledgment dialog
        when `trashEmptyConsentGiven` is false; `onChange(false)` just clears `allowTrashEmpty`.
- [x] Register the page at its **three** required points plus the two `Record`s tsc already enforces:
      - `'trashSafety'` added to `SettingsPageId`
        ([`ui-store.ts:161-181`](../../../packages/app/src/store/ui-store.ts));
      - `{ id: 'trashSafety', label: 'Trash Safety', group: 'tools' }` inserted into
        `SETTINGS_PAGES` (`:206`) **immediately after `gitSafety` (`:219`)** — the array's order is
        the render order *and* the tab order, and this page is Git Safety's sibling. Group `'tools'`,
        not `'system'`: `'system'` is labelled "System Info" and holds read-outs (CLI, Updates,
        System Health, Monitor, Optimizer), while a consent switch belongs with Git Safety. See
        Decision 14.
      - the `PAGE_CONTENT` entry + import in
        [`settings-view.tsx:40-61`](../../../packages/app/src/features/settings/settings-view.tsx);
      - `trashSafety: LuTrash2` in `SETTINGS_PAGE_ICON`
        ([`nav-icons.ts:92`](../../../packages/app/src/components/nav-icons.ts)) — a literal trash
        can rather than a third shield glyph, because `reviews` already owns `LuShieldCheck` and
        `gitSafety` owns `LuShieldAlert` and a third shield is indistinguishable at 16px.
      - **Two surfaces update for free and must be sanity-checked, not edited**: the command palette
        derives `Settings: Trash Safety` from `SETTINGS_PAGES`
        ([`services/palette/providers.ts:121-132`](../../../packages/app/src/services/palette/providers.ts)),
        and [`title-bar-nav.tsx:222`](../../../packages/app/src/components/title-bar-nav.tsx) derives
        the breadcrumb. The label must therefore read well after the prefix — which is why it is
        "Trash Safety", not "Trash".
      - Add the page to the registration guardrail in
        [`ui-store.test.ts:487-521`](../../../packages/app/src/store/ui-store.test.ts), which
        already asserts every page files into a real group and that a named page is present.
- [x] Storage tab ([`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx)):
      add a **separate** Trash card, rendered after the existing bar/list/legend and after Phase 73's
      System section, gated on Theme C's three-way AND (absent entirely when any factor is false).
      - **Container**: the `gpu-tab.tsx:66` card shape (`space-y-2 rounded-md border p-3`) with
        destructive tokens — `border-destructive/40 bg-destructive/5` — so it reads as a different
        weight from the System section before a word of it is read. Heading `Trash` with a
        `LuTrash2` glyph, `text-sm font-medium`.
      - **The button is `border border-destructive/40 text-destructive hover:bg-destructive/10`** —
        the at-rest tier from [`memory-tab.tsx:280-281`](../../../packages/app/src/features/optimizer/memory-tab.tsx),
        **not** a filled `bg-destructive`. The house rule is that danger escalates *in the confirm*
        (Smart Scan's own Clean button is entirely neutral); an outlined destructive button is the
        strongest at-rest signal that already exists here. See Decision 20.
      - **`SegmentedBar` is not reused — and after Phase 72 that is a choice, not a type
        constraint.** Today its props are `readonly { id: ScanCategory; bytes: number }[]` and it
        looks `CATEGORY_LABELS`/`categoryColor` up internally, so it simply cannot take a Trash
        segment. Phase 72 Theme D generalises it (`SegmentedBar<Id extends string>` with injected
        `color`/`name`), which removes that barrier — so state the real reason it still is not used:
        **the Trash is one undifferentiated quantity, and a one-segment bar is a progress bar with
        nothing to compare against.** The card shows a number and a size, not a proportion.
      - Its `aria-label` namespace is already crowded — `optimizer-shots.spec.ts:175,185` locates
        the existing bar by `"Reclaimable storage by category"` and Phase 73's System bar takes
        `"System caches by ecosystem"`. The Trash card adds no `role="img"` element at all, so it
        collides with neither; locate it in e2e by its heading instead.
      - Every state has literal copy, and there are five:
        - **not checked yet** — body *"The Trash hasn't been checked yet."*, one button
          **"Check Trash"**.
        - **checking** — the same button, `disabled`, label **"Checking…"**. No `CircularGauge`:
          there is no progress event for this walk, and a gauge that cannot move is a lie. (Smart
          Scan's gauge is driven by `optimizerScanProgress`; this phase adds no such channel.)
        - **empty** — *"The Trash is empty."*, "Empty Trash…" rendered `disabled`.
        - **has items** — `` `${itemCount} item${…} — ${formatBytes(totalBytes)}` `` on one line, the
          oldest-modified line beneath it in `text-xs text-muted-foreground`, a
          *"Includes N other mounted disks."* line when `volumeCount > 1`, a *"More than 200,000
          entries — this is a floor."* line when `truncated`, and an enabled **"Empty Trash…"**
          button (the ellipsis is the house signal that a confirm follows).
        - **error** — `<p className="text-xs text-destructive">{message}</p>` inline, matching
          `smart-scan-tab.tsx:126`, with the "Check Trash" button still available to retry.
      - **No auto-refresh and no poll** — the count updates only on "Check Trash", on a successful
        empty, and never otherwise. Resolves Decision 11.
      - Never merged into the System section itself: the Trash is not a tool cache, and grouping it
        with Cargo/Plex would understate what it does.
- [x] Hold the card's state in
      [`optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) as a `trash` slice
      (`{status: 'idle' | 'loading' | 'ready' | 'error'; summary: TrashSummary | null; message:
      string | null}`), not in component state — the Storage tab unmounts on every tab switch, and
      local state would silently discard a check the user just paid for. Same reason `scan`, `gpu`,
      `memory` already live there.
- [x] Plex's two new rows need **no new UI code** once Phase 73's gated System
      section exists — true on `main` as of this PR's own merge (the section had to be reconciled
      against Phase 73's concurrently-landing PR #193 as part of this PR, so it exists in the final
      merged state even though it didn't when this bullet was first drafted). The registry entries
      from this PR's Theme A render there automatically; nothing more to
      build here. The Theme D screenshot obligation for Plex (below) is deferred with it.
- [x] Every icon from `react-icons`, imported per set (`react-icons/lu`), never `lucide-react` —
      unchanged repo rule, enforced by `no-restricted-imports` and by
      `components/icons/icon-names.test.ts`.
- [x] `packages/app/e2e/optimizer.spec.ts` — behavioural, following its own `test.describe('the
      feature gate')` shape: with all three flags seeded true the "Trash" card is visible; with
      `allowTrashEmpty` false it is absent; clicking "Empty Trash…" opens a dialog headed
      **"Empty the Trash?"** whose Confirm button is `disabled` until the acknowledgment checkbox is
      checked, then enabled.
- [x] `packages/app/e2e/optimizer-shots.spec.ts` — the Trash card (has-items state) light and dark,
      shipped. **The System section with Plex's two rows light and dark stays open** — see the
      still-blocked note above; there is no System section on `main` to screenshot yet.
      - Seed via the existing `seedOptimizerEnabled` helper (`:114-121`), extended with
        `allowTrashEmpty` and `trashEmptyConsentGiven`.
      - **Fix the stale version literal while you are in there**: that helper writes `{ version: 8 }`
        while [`ui-store.ts:1750`](../../../packages/app/src/store/ui-store.ts) is now `version: 9`,
        so the seeded blob is one migration behind on every run. Change it to `9`.
      - Dark shots use the file's own two-step (`goDark` before navigation, `paintDark` after), and
        `MSTUDIO_SHOTS=1` still gates the suite.
      - **Rebase onto Phase 72 before touching either e2e file.** Phase 72 renames the wire value
        `'nodeModules'` → `'dependencies'`, and that literal appears in
        `optimizer-shots.spec.ts` (`:24`, `:34`, `:40`, `:46`), `optimizer.spec.ts` (`:16`, `:21`,
        `:24`) and `e2e/mock-bridge.ts` (`:525`, `:2400`). Phase 72 rewrites all three; resolving a
        string-literal conflict by hand afterwards is how a fixture ends up half-renamed.

### E — Verification (M)

**◐ PARTIAL (this PR, 2026-09-05).** `moon run :typecheck :lint :test` green; every test this PR
could write is written and passing. Two items stay open, both tracking the same two Theme A/D
blockers noted above (Phase 72 Theme D, Phase 73 Theme E) — not new gaps — plus the human pass,
which no automated session can perform.

- [x] `moon run :typecheck :lint :test` green.
- [x] `packages/desktop/src/main/optimizer/system-cache-registry.test.ts` (Theme A) — both Plex
      entries resolve under a fake `homedir`; a non-existent path is dropped silently by
      `resolveSystemCacheEntries`; `reclaim` is `'cheap'`/`'costly'` asserted by id.
- [x] `confine-allowlist.test.ts` — the six Plex assertions listed in Theme A, including the
      **child** path (`Cache/Transcode`) returning `null`, which is what proves equality-not-prefix.
- [x] A **symlinked** `Plex Media Server/Cache` is dropped by `resolveSystemCacheEntries` rather
      than followed — the one case exact-match confinement cannot catch on its own.
- [ ] Phase 72's `category-palette.test.ts` still passes with `ECOSYSTEM_HUES.media = 120` present,
      with no change to its 12°-separation threshold.
- [x] The consent enumeration, rendered from a stubbed catalogue, contains both Plex labels and no
      longer contains `another media tool's cache`.
- [x] `packages/desktop/src/main/trash-service.test.ts` (summary) — the ten fixture assertions listed
      in Theme B, of which the two that matter most are the `/Volumes` symlink skip (no double count)
      and the missing-`.Trash` zero summary.
- [x] `packages/desktop/src/main/trash-service.test.ts` (empty) — `expect(spawn).toHaveBeenCalledWith(
      'osascript', ['-e', 'tell application "Finder" to empty trash'], expect.any(String))` **and**
      `toHaveBeenCalledTimes(1)`; the four stderr mappings (`-1743`, `-128`, `-600`, unrecognised);
      the non-zero-exit-with-`ok:true` path; the timeout message.
- [x] `packages/desktop/src/main/ipc/trash-handlers.test.ts` — both channels registered via
      `handleBare`; a second summary invoke aborts the first; the empty handler passes no argument
      through to `emptyTrash`.
- [x] A source-level assertion that `trash-service.ts` contains no `rm`/`rmdir`/`unlink`/`trashItem`.
- [x] `packages/app/src/components/confirm-dialog.test.tsx` — the Confirm button is `disabled` while
      `requireAck` is set and the box is unchecked, enabled once checked, and **unaffected for every
      request without `requireAck`**; a `setBlastRadius` patch on an open request does **not** clear
      the checkbox.
- [x] `packages/app/src/features/settings/settings-pages/trash-consent.test.tsx` — note the `.tsx`
      extension, matching every rendering sibling in that directory. Following
      `crash-reporting.test.tsx`'s harness and `use-graph-actions.test.tsx`'s gate idiom
      (`useUiStore.setState(…)`, then assert presence/absence): toggling `allowTrashEmpty` on with
      `trashEmptyConsentGiven` false opens the acknowledgment dialog; confirming persists both;
      cancelling reverts `allowTrashEmpty` to `false`.
- [x] `packages/app/src/features/optimizer/storage-tab.test.tsx` — the Trash card is absent with any
      one of `optimizerEnabled` / `allowTrashEmpty` / `trashEmptyConsentGiven` false and present only
      with all three true; each of the five card states renders its literal copy; a `window.midniteStudio`
      stub is installed inline per `mcp-page.test.tsx:15-29` (there is no shared vitest mock bridge).
- [x] `ui-store.test.ts` — `trashSafety` is present in `SETTINGS_PAGES` and files into a real group.
- [x] `packages/app/e2e/optimizer.spec.ts` + `optimizer-shots.spec.ts` per Theme D, with the
      `{ version: 9 }` seed fix.
- [ ] **Human pass, on a real Mac, against a `moon run desktop:dist` build — not `desktop:start`:**
      - With Plex installed: confirm the System section reports real, correct byte figures for
        both new entries; confirm a clean of `plex-transcode-cache` only touches `Cache/` (check
        `Metadata/` and `Plug-in Support/Databases/` are untouched, and check the Trash for the
        recovered item); confirm the consent dialog now names both Plex directories and no longer
        says "another media tool's cache".
      - Trash: create a disposable throwaway file, delete it, confirm "Check Trash" reports it;
        click through the one-time consent dialog and confirm its copy reads honestly; confirm the
        Confirm button is genuinely disabled until the acknowledgment checkbox is checked.
      - **The permission path, which no test can cover**: confirm the macOS Automation prompt appears
        once, names *Midnite Studio* (not *Electron*), and shows the
        `NSAppleEventsUsageDescription` string; **deny it once** and confirm the app shows the
        `-1743` "Grant Midnite Studio access to control Finder…" message rather than a raw trace;
        then grant it and confirm the Trash actually empties.
      - With Finder's "Warn before emptying the Trash" on: confirm Finder's own second sheet appears,
        and that **cancelling it** produces the `-128` "Cancelled in Finder — nothing was deleted."
        info toast rather than an error.
      - If a second mounted volume with its own Trash contents is available, confirm it is counted in
        the confirm dialog's "N other mounted disks" line and cleared too.
      - Re-run `desktop:dist` and relaunch: note whether macOS re-prompts for Automation (the
        signature-change friction documented in Theme C), and record the answer on the Open decision.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/trash-service.ts` — `computeTrashSummary`, `ComputeTrashSummaryOptions`,
  `emptyTrash`, `EmptyTrashDeps`, `EMPTY_TRASH_ARGS`, a private `bufferSink()` (B, C).
- `packages/desktop/src/main/trash-service.test.ts` (B, C, E).
- `packages/desktop/src/main/ipc/trash-handlers.ts` — `registerTrashHandlers()` (C).
- `packages/desktop/src/main/ipc/trash-handlers.test.ts` (C, E).
- [`packages/shared/src/domain/trash.ts`](../../../packages/shared/src/domain/trash.ts) —
  `TrashSummarySchema`, `TrashSummary` (B).
- `packages/app/src/features/settings/settings-pages/trash-safety-page.tsx` (D).
- `packages/app/src/features/settings/settings-pages/trash-consent.test.tsx` (C, D, E).
- `packages/app/src/features/optimizer/storage-tab.test.tsx` (D, E) — the Optimizer feature has no
  tab-level test today, only the two component tests under `components/`.
- `packages/app/src/components/confirm-dialog.test.tsx` (C, E) — net-new; the component ships
  untested today.

**Changed**
- `packages/desktop/src/main/optimizer/system-cache-registry.ts` (once Phase 73 lands it) — two new
  `DEFAULT_SYSTEM_CACHE_ENTRIES` (A).
- `packages/desktop/src/main/optimizer/system-cache-registry.test.ts`, `confine-allowlist.test.ts`
  (once Phase 73 lands them) — the Plex assertions (A, E).
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  **`export` added to `readDirSafe` (`:83`), `dirBytes` (`:101`), `newWalkState` (`:63`) and the
  `WalkState` type (`:55`)**. Behaviour unchanged; export surface widened (B).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema` gains `'media'`, once Phase 72 has landed it (A).
- [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) —
  `export * from './trash';` (B).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) —
  `optimizerTrashSummary`, `optimizerTrashEmpty` in `CHANNELS` (B, C).
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) —
  `OptimizerTrashSummaryResponse`, `OptimizerTrashEmptyResponse`; no `*Request` (both payload-free) (B, C).
- [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — two members
  inside the existing `optimizer: { … }` block (B, C).
- [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — two
  `call(…)` lines inside `optimizer`; the `Pick<…>` union at `:145` is **unchanged** (B, C).
- [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) — one import
  and one `registerTrashHandlers()` call inside `app.whenReady()` after `:361` (C).
- [`packages/desktop/resources/entitlements.mac.plist`](../../../packages/desktop/resources/entitlements.mac.plist) —
  `com.apple.security.automation.apple-events` (C).
- [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) — a new
  `mac.extendInfo:` block carrying `NSAppleEventsUsageDescription` (C).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `allowTrashEmpty`, `trashEmptyConsentGiven` (six edits each), `'trashSafety'` in `SettingsPageId`
  and `SETTINGS_PAGES`, **no `version` bump** and no `migrate` arm (C, D).
- [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) —
  two `PREFERENCE_KEYS` entries with `// trash-safety-page.tsx` comments (C).
- [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) —
  the `trash` slice (D).
- [`packages/app/src/store/ui-store.test.ts`](../../../packages/app/src/store/ui-store.test.ts) —
  the settings-page registration guardrail gains `trashSafety` (D, E).
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) —
  one `SETTINGS_PAGE_ICON` entry (D).
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) —
  one import + one `PAGE_CONTENT` entry (D).
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  a `trash` arm on `BLAST_RADIUS_COPY`, `requireAck?: string`, `useState` for the acknowledgment (C).
- [`packages/app/src/components/dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx) —
  a `confirmSeq` counter and `key={confirmSeq}` on `<ConfirmDialog>`, so a new request resets
  `requireAck`'s checkbox and a `setBlastRadius` patch does not (C).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  **one deletion only**: the now-false "Never Plex or another media tool's cache (a separate review)"
  line. The enumeration itself is derived from the catalogue by Phase 73 and needs no edit (A).
- [`packages/app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  one `ECOSYSTEM_LABELS` entry (`media: 'Media'`) and one `ECOSYSTEM_HUES` entry (`media: 120`),
  both in exhaustive `Record<Ecosystem, …>` maps Phase 72 Theme D adds (A).
- `packages/app/src/features/optimizer/category-palette.test.ts` (Phase 72's, once landed) — the
  12°-separation assertion must still pass with hue 120 present (A, E).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the new, separately-styled Trash card and its five states (D).
- [`packages/app/src/features/optimizer/use-optimizer.ts`](../../../packages/app/src/features/optimizer/use-optimizer.ts) —
  `loadTrashSummary`, `runEmptyTrash` (C, D).
- [`packages/app/e2e/optimizer.spec.ts`](../../../packages/app/e2e/optimizer.spec.ts) — the gate and
  the `requireAck` behaviour (D, E).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts) —
  Trash card + Plex rows, gate-on shots, and the `{ version: 8 }` → `9` seed fix (D, E).

**Deliberately unchanged**
- [`packages/desktop/src/main/optimizer/system-cache-service.ts`](../../../packages/desktop/src/main/optimizer/system-cache-service.ts) —
  Phase 73's file, not yet in the tree; once it lands, Plex's clean path is its `cleanSystemCaches`,
  unmodified (**unchanged**).
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the Trash gets its own handler file (Theme C) specifically so this one stays untouched
  (**unchanged**).
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  a fifth caller, not a fifth execution model; no edit (**unchanged**).
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineAllowlist` is Phase 73's to add; this phase only asserts against it (**unchanged**).
- [`components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  generalised by Phase 72 Theme D, and still not used by the Trash card: one undifferentiated
  quantity has nothing to segment (**unchanged by this phase**).
- `ScanCategorySchema` in
  [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) — the Trash
  deliberately never becomes a category; only `EcosystemSchema` is widened, and only for Plex
  (**unchanged**).
- [`packages/desktop/resources/entitlements.mac.inherit.plist`](../../../packages/desktop/resources/entitlements.mac.inherit.plist) —
  helper processes get no Apple-events entitlement (**unchanged**).
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail
  (**unchanged**).

---

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] Plex's two entries resolve under a fake home, and `confineAllowlist` refuses the parent, both
      dangerous siblings (`Metadata`, `Plug-in Support/Databases`), the intermediate
      `Plug-in Support`, **and a child of an allowed entry** — the last being the assertion that
      proves equality rather than prefix matching.
- [x] `emptyTrash` spawns `osascript` with a literal, module-constant argv, exactly once per call,
      in every test — never influenced by any input, because it accepts none.
- [x] A non-zero `osascript` exit is treated as a failure even though `runProcess` reports
      `ok: true`, and each of `-1743` / `-128` / `-600` maps to its own message.
- [x] `computeTrashSummary` skips symlinks in `/Volumes` (no double-count of the boot volume),
      excludes another user's `.Trashes/<uid>`, and returns a zeroed summary for a missing `~/.Trash`.
- [x] `truncated` is driven by `MAX_WALK_ENTRIES` alone; the doc and the code agree that
      `MAX_WALK_DEPTH` does not apply to `dirBytes`.
- [x] The Trash card and its confirm dialog are unreachable with any one of the three Theme C gates
      off, and the Confirm button cannot be clicked before `requireAck`'s checkbox — including after
      a `setBlastRadius` patch lands mid-dialog.
- [x] All five Trash-card states render their literal copy, and the "checking" state shows no
      progress gauge.
- [x] Storage tab shots refreshed: **Trash card**, light and dark. **Still open**: the System
      section with Plex rows, blocked on Phase 73 Theme E (not yet landed) — see Theme A/D's notes.
- [ ] **Human:** real-Mac pass per Theme E on a **packaged** build, Plex and Trash both, including a
      deliberate denial of the Automation prompt and a cancel of Finder's own sheet.

---

## Not in this phase

- **Any media-tool cache besides Plex's two verified directories** — Emby, Jellyfin, Kodi,
  iTunes/Music.app, Photos.app. Named, not silently dropped: each needs its own path verified
  against its own documentation before it ships, per Decision 2.
- **The third Plex path** (`~/Library/Caches/PlexMediaServer/transcode/Sessions`) surfaced by one
  uncorroborated source. Add it once a second source (or a real Plex install) confirms it — see
  Decision 3.
- **Windows' Recycle Bin and Linux's XDG trash spec.** A real, named gap, matching Phase 73
  Decision 7's macOS-only stance — see Decision 9.
- **A `ScanCategory` member for the Trash.** `category-palette.ts` and `SegmentedBar` are both keyed
  on that enum; adding a member to reuse them would put an irreversible delete into the same visual
  vocabulary as a rebuildable build cache, which is precisely the confusion this phase's separate
  card exists to prevent.
- **Progress reporting for the Trash walk.** No `optimizerTrashProgress` event channel: the walk is
  bounded by the same 200,000-entry budget as a Smart Scan and completes in well under a second on
  any realistic Trash, and a gauge with no events behind it is worse than a disabled button.
- **A shared checkbox component.** `requireAck` uses the same raw `<input type="checkbox">` markup
  every settings page uses; extracting one is a renderer-wide refactor with 20+ call sites and no
  bearing on this feature.
- **Per-volume opt-out** (e.g. "never empty this external drive's Trash"). Not built:
  `allowTrashEmpty` is the only gate, and every discovered volume's Trash is included or none are —
  which is also what Finder's own single command does.
- **Selective/partial emptying** (choosing which items in the Trash to keep). This phase only
  offers "empty everything," matching what Finder's own single menu command does — a per-item
  picker is a materially larger feature (needs a listing/selection UI) and is not built here.
- **A "restore from Trash" affordance.** Out of scope in both directions — this phase only empties;
  Finder already offers restore for anything not yet emptied.
- **Automatic or scheduled Trash checks.** Every scan in this app stays user-initiated, matching
  Phase 73's own stance — see Decision 11.
- **Suppressing Finder's own "Warn before emptying the Trash" sheet.** It is Finder's preference,
  not this app's, and reaching in to override it would be a bigger intrusion than the feature
  itself — the `-128` mapping is how this phase copes with it instead.
- **Versioned consent that re-asks when the registry grows.** Phase 73 **resolved** its own
  Decision 9 while this phase was being refined: the consent dialog's enumeration is derived from
  the catalogue at render time and the same live list sits permanently beside the settings
  checkbox, so the covered set is always visible and always accurate without a modal. Theme A
  therefore ships no consent version, no reset of `systemCacheConsentGiven`, and no copy edit — only
  an assertion that the derivation picked Plex up. A future media tool inherits the same property
  for free, which is the whole reason not to build versioning here.
- **Fixing `optimizer.ts`'s "three patterns" docblock or `ScanCategorySchema`'s four members.**
  Found during this refinement, but it is Phase 72 Theme C's line to correct.

---

## Decisions / open questions

Every decision below was chosen without a human in the loop, running this brainstorm the way the
two prior phases in this arc ran theirs — see the task's own instruction to record rather than
silently pick. Each names the recommendation taken and why, so a later refine can reverse it with
the reasoning in view. **Decision 4 is the one a reviewer most needs to check by hand.**

1. **Resolved — Plex's two cache directories slot into Phase 73's existing `SystemCacheEntry`
   registry and three-factor consent gate, not a parallel, media-specific registry.** The shape is
   identical (one exact allowlisted path, no descent, a named `producer` that regenerates it, the
   same `reclaim` grading and the same blast-radius class as a dev-tool cache), and Phase 73's own
   Decision 8 already established the precedent for widening `EcosystemSchema` by one member
   (`'go'`) when a genuinely new grouping needs a label rather than a parallel type. A second
   registry would duplicate `confineAllowlist`, the consent gate, and the Storage tab's System
   section for no structural reason — the whole value of Phase 73's design is that a *reviewed*
   entry, wherever it comes from, is exactly as trustworthy as any other.
2. **Resolved — scope Theme A to Plex alone.** Emby, Jellyfin, Kodi and Photos.app/Music.app are all
   plausible members of "media-tool cache," and this doc's own framing ("Plex and anything shaped
   like it") explicitly invited widening. Rejected for this phase: Phase 72's own precedent for
   PHP/Elixir/Dart/Haskell detectors — *"add them when someone has the repo [to test against]"* —
   applies with equal force to a tool whose real cache path this session cannot verify against its
   own documentation. Widening by analogy to Plex's directory shape is exactly the guessing Phase
   73's whole design exists to refuse (*"a wrong guess there is exactly the failure mode this
   phase's whole design exists to refuse"*, Phase 73 Theme A). One verified tool now beats three
   guessed ones.
3. **Resolved — the verification chain for Plex's paths, stated honestly.** `support.plex.tv` — the
   authoritative source — returned HTTP 403 to every automated fetch attempted while writing this
   doc (both direct WebFetch calls to its own articles failed; only a WebSearch-engine synthesis of
   its cached text came through). The two shipped paths were corroborated by a second, independent
   source (plexopedia.com, whose text directly quotes Plex's own support wording verbatim, plus a
   dedicated Plex support article title — "Clearing Plugin/Channel/Agent HTTP Caches" — confirming
   `Plug-in Support/Caches` is Plex's own named safe-to-clear location) rather than trusted from one
   search snippet alone. This is a real notch below Phase 73's `queryTool` entries (`go env
   GOCACHE`, verified by literally running the command), which is why Theme E's human pass calls
   out a real Plex install by name rather than treating this as machine-verified with equal
   confidence. A third path, mentioned by exactly one uncorroborated source, is deliberately left
   out rather than shipped on the strength of a single hit. **The refinement also removed this
   decision's one dependency on an unresolved question**: an earlier draft said the consent dialog
   needed a hand-written copy edit and pointed at Phase 73's then-open Decision 9. Phase 73 has
   since resolved that decision by deriving the dialog's enumeration from the catalogue itself, so
   Theme A's obligation is now an assertion that the derivation works, plus deleting one prose line
   that Plex's arrival makes false. That is strictly stronger: a hand-edited enumeration is exactly
   the thing that silently drifts the *second* time the catalogue grows.
4. **Resolved — emptying the Trash goes through `osascript`/Finder exclusively, never a raw `fs.rm`
   of `~/.Trash`'s contents.** The alternative (walk the discovered Trash roots and delete each
   top-level entry directly) was seriously considered and rejected on three independent grounds:
   it would give this app's own code the ability to issue an actual permanent-delete syscall for
   the first time in its history; it would reimplement Finder's own handling of locked, immutable
   and in-use files, which is exactly the kind of edge case this app has never had to solve and
   should not solve worse than the OS already does; and it would still need Theme B's own
   multi-volume discovery with none of the guarantee that Finder's single "Empty Trash" command
   already carries — that it actually finds every mounted volume's Trash, because it is the same
   code path the Finder menu item itself uses. The cost of the chosen option is one dependency on
   AppleScript/Automation permission (a real, user-visible one-time prompt, plus the entitlement and
   `Info.plist` string Theme C now ships); the cost of the alternative is this app acquiring a class
   of bug — an unrecoverable delete from its own code — that no other feature in Midnite Studio has
   ever had to defend against. Theme E's source-level grep assertion is the cheap guard that keeps
   it that way.
5. **Resolved — Trash-emptying gets its own consent pair (`allowTrashEmpty`/`trashEmptyConsentGiven`)
   and its own settings page, never Phase 73's `allowSystemCacheClean`/`systemCacheConsentGiven`.**
   The blast-radius class is qualitatively different even from Phase 73's own "whole machine's dev
   tooling" jump: a dev-tool cache is, by construction, something *a build tool* put there and can
   put back; the Trash's contents are things *the user* put there, from any app, with an explicit
   expectation — Finder's own "Put Back" — that survives right up until the moment it is emptied.
   Sharing one toggle would mean a user who only ever meant to let Midnite clean their Cargo
   registry silently also unlocks a wholesale irreversible delete the day this phase ships. Two
   gates cost one more settings page; conflating them costs a class of accidental consent this
   phase's whole design exists to prevent.
6. **Resolved — a new `requireAck?: string` field on `ConfirmRequest`, gating the Confirm button
   behind an explicit checkbox, used nowhere else in the app.** Considered and rejected: reusing the
   existing `warnings` list (which only ever *displays* text) or a longer `danger` styling change
   (which changes color, not interaction) — neither actually stops a reflexive click the way Phase
   73's own framing worries about (*"a plain checkbox in a settings page a user may never fully read
   is the same shape of consent as the thing that got `node_modules` deleted with no producer
   field"*). Emptying the Trash is the one operation in this arc where that reflexive click has zero
   undo, so it is the one operation that earns a mechanism stronger than every other confirm dialog
   in the app. The cost is one more click, exactly once per empty. **The refinement added the
   mechanism's one non-obvious rule**: reset the checkbox by remounting on a `confirmSeq` key, never
   by an effect on `request` identity — because `dialog-host.tsx`'s `setBlastRadius` deliberately
   replaces the request object when an async count lands, and an identity-keyed reset would un-tick
   the box at exactly the moment the user was reading the number they had just been shown.
7. **Resolved — the Trash-summary walk is allowed one narrow discovery step (`readdir('/Volumes')`)
   that Phase 73's `confineAllowlist` rule would otherwise forbid, because the discovery only ever
   feeds a *displayed number*, never a delete target.** Phase 73's no-discovery rule exists to stop
   a detector bug from ever becoming an arbitrary-path *delete*; here, `emptyTrash()` takes zero
   arguments and always runs the same fixed `osascript` argv regardless of what
   `computeTrashSummary` found. A bug in the volume-discovery step can, at worst, mis-report the
   confirm dialog's item count or byte total — it structurally cannot mis-target a delete, because
   nothing about it is wired to one. This is the one place in this phase's design where "discovery"
   and "confinement" are not the same question, and the distinction is the reason the exception is
   safe rather than a crack in Phase 73's own rule. **The refinement bounded the exception three
   ways**: the walk is one level deep, it skips every symlink in `/Volumes` (Decision 19), and its
   roots are injectable only from a spec, never from an IPC payload — both channels are `handleBare`
   with no request schema at all.
8. **Resolved — "oldest item" reports the oldest top-level Trash entry's own last-modified time
   (`mtime`), not "the date it was moved to the Trash."** macOS does not reliably expose the latter
   without parsing per-item extended attributes (`com.apple.trash.sourceInfo` or equivalent) this app
   has no other reason to read, and guessing at a "date trashed" from `mtime`/`ctime` alone would be
   a false precision the confirm dialog cannot actually back up. Naming the field for what it
   genuinely measures — and wording the warning line *"The oldest item was last modified …"* — beats
   promising a fact the walk does not compute.
9. **Resolved — macOS-only, stated rather than silent**, matching Phase 73's own Decision 7 and this
   app's scope statement ([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md)). Windows'
   Recycle Bin (`SHEmptyRecycleBin` or a PowerShell equivalent) and Linux's XDG trash spec
   (`~/.local/share/Trash`, with its `files/` + `info/` pair and per-mount `.Trash-$uid`) are real,
   named gaps for a follow-on phase if/when this app ships on those platforms. **The reason this
   stays a named gap rather than a stub is that neither platform's mechanism is shaped like this
   one**: Windows has a documented shell API and no per-item confirm to defer to, and the XDG spec
   requires this app to *parse and delete* the trashinfo pairs itself — which is precisely the
   permanent-delete-syscall property Decision 4 refuses to acquire. Each therefore needs its own
   Decision-4-equivalent review, not a `switch (process.platform)`.
10. **Resolved — one phase doc, two PR-sized halves with different risk profiles (Theme A vs. Themes
    B–D), not a Phase 74/75 split.** Seriously considered, because the assignment that produced this
    doc explicitly asked the question. Rejected: Theme A is almost entirely catalogue-and-copy reuse
    of machinery Phase 73 already designs (two registry entries, one `Ecosystem` member, one dialog
    copy edit) — it introduces no new confinement primitive, no new consent pair, no new IPC domain.
    Themes B–D are one coherent feature (compute a number, gate it, act on it, show it) that does
    not make sense shipped partially — a Trash-summary read with no way to act on it, or an
    empty-Trash action with no settings gate, are each incomplete on their own. Phase 72→73's split
    was justified by a genuinely different *confinement primitive* (repo-scoped `confineTree` vs.
    allowlist-only `confineAllowlist`) each needing its own review; here, only the Trash introduces
    a new primitive-adjacent concept (the discovery exception, Decision 7), and it is the minority
    of this phase's total weight. Splitting would mostly relabel theme letters as phase numbers
    without a matching review-boundary reason. **The refinement strengthened the case rather than
    weakening it**: the sequencing guardrail now says outright that A is blocked and B–D are not, so
    the two halves are already independently schedulable inside one doc — which is the only benefit
    a split would have bought.
11. **Resolved — the Storage tab's Trash card never auto-refreshes; it recomputes only on an explicit
    "Check Trash", and again immediately after a successful empty.** Matches Phase 73's own stance
    that *"every scan in this app stays user-initiated, System caches included,"* and avoids a
    background walk of `/Volumes` running on a timer for a number nobody asked for. The staleness
    this creates is real, and it is answered where it actually matters rather than by polling:
    Decision 15 makes the **confirm dialog** recompute its own count, so the number attached to the
    irreversible action is always fresh even when the card's is minutes old.
12. **Resolved — `emptyTrash` returns `OptimizerVoidResult`, not `OptimizerResultOf<Record<string,
    never>>`.** The earlier draft named a type that would force a meaningless empty-object `value`
    on every success. `OptimizerVoidResultSchema`
    ([`domain/optimizer.ts:101`](../../../packages/shared/src/domain/optimizer.ts)) already exists
    for exactly this — `{ok: true} | {ok: false, message: string}` — and `optimizerKill` is its
    precedent. Note the failure arm is a flat `message` with **no `kind` discriminator**: the
    optimizer envelope is deliberately not `GitOpResult`, whose `conflict` arm is git-specific.
13. **Resolved — export `dirBytes`, `readDirSafe`, `newWalkState` and `WalkState` from
    `scan-service.ts` rather than copying the walk or extracting a new module.** The audit found all
    four are module-private today, which invalidated the earlier draft's claim that Theme B "reuses
    this exact walker" with `scan-service.ts` left unchanged. Copying would fork the entry budget and
    the symlink rule — the two properties Phase 59's verification actually asserts — and a new
    `optimizer/walk.ts` would move code both Phase 72 and Phase 73 are mid-edit on, guaranteeing a
    conflict for no behavioural gain. Four `export` keywords is the smallest change that keeps one
    walker in the tree, and it is why `scan-service.ts` moved out of this phase's
    "deliberately unchanged" list.
14. **Resolved — `trashSafety` sits in the `tools` group, immediately after `gitSafety`, labelled
    "Trash Safety".** The earlier draft said group `'system'` and label `'Trash'`. Both were wrong on
    inspection: `SETTINGS_GROUPS` (`ui-store.ts:195`) labels `'system'` as **"System Info"** and it
    holds read-outs (CLI Integration, App Updates, System Health, Monitor, Workspace Optimizer),
    whereas `gitSafety` — this page's stated template and closest analogue — lives in `'tools'`. And
    the label is rendered as `Settings: <label>` in the command palette
    (`services/palette/providers.ts:121`), where a bare "Trash" would read as a place to find
    deleted things rather than a permission. Array position matters twice over, per the file's own
    comment: it is the render order within the group *and* the tab order across the whole list.
15. **Resolved — the empty-Trash confirm recomputes its own blast radius rather than trusting the
    card's cached summary.** `dialog-host.tsx` already supports exactly this shape: open with
    `blastRadius: undefined` (the dialog renders *"Checking what this affects…"*), then patch it with
    `setBlastRadius` when the fresh `trashSummary()` resolves. The alternative — pass the card's
    number straight through — is one fewer round trip and is wrong for this specific operation: the
    card's figure dates from whenever the user last pressed "Check Trash", and anything trashed since
    (by this app or any other) would make the confirm understate what it is about to destroy
    permanently. If the re-check fails the dialog closes with a toast rather than offering a Confirm
    button over an unknown radius.
16. **Resolved — `osascript` runs with an explicit `timeoutMs: 10 * 60_000`, and a timeout is
    reported as "stopped waiting", not as a failure.** `runProcess`'s `DEFAULT_TIMEOUT_MS` is
    120_000, and AppleScript's `empty trash` does not return until Finder has finished — a Trash
    holding tens of gigabytes routinely exceeds two minutes, so the default would report a failure
    for an operation that is succeeding. And because killing `osascript` does not stop Finder (a
    separate process that keeps deleting), the honest message is that this app stopped waiting, not
    that the empty failed. Ten minutes is chosen as comfortably beyond any realistic Finder empty
    while still bounding a genuinely wedged call.
17. **Resolved — AppleScript error `-128` ("user cancelled") is a distinct, non-error outcome.**
    When Finder's own "Warn before emptying the Trash" preference is on, the sheet it raises is
    cancellable, and cancelling it returns `-128`. Mapping that to a generic failure would tell a
    user who deliberately backed out that something went wrong. It returns
    `{ok: false, message: 'Cancelled in Finder — nothing was deleted.'}` — `ok: false` because
    nothing was in fact emptied and the card must not clear its count — and the renderer toasts it
    with `status: 'info'`, not `'error'`. This is the only place in the phase where an `ok: false`
    is deliberately presented as neutral.
18. **Resolved — the Automation entitlement and `NSAppleEventsUsageDescription` ship in this phase,
    and the human pass runs on a packaged build.** The audit found `hardenedRuntime: true` with
    neither `com.apple.security.automation.apple-events` in the entitlements plist nor any
    `mac.extendInfo:` block in `electron-builder.yml` — so today's build has no declared reason to
    send an Apple event and no string for macOS to show in the consent prompt. Shipping the feature
    without both would mean a `-1743` that the user has no obvious way to resolve. The entitlement
    goes only in `entitlements.mac.plist`, never the `.inherit` variant, because helper processes
    have no business sending Apple events. Dev-mode is explicitly not a valid test: under
    `desktop:start` the responsible process is the dev Electron binary, so the prompt names
    "Electron" and a grant there does not transfer.
19. **Resolved — the `/Volumes` scan skips every symlink, and that skip is asserted.** macOS places a
    symlink to the boot volume in `/Volumes` (typically `/Volumes/Macintosh HD` → `/`). Following it
    would walk the entire startup disk and double-count `~/.Trash` inside the same shared
    `WalkState`, producing a byte total that is both wrong and alarming on the one dialog where a
    number has to be trustworthy. `readDirSafe` returns `Dirent`s, so `entry.isSymbolicLink()` is a
    one-line guard — and the per-volume candidate gets the same treatment via `lstat`, so a
    `.Trashes/<uid>` that is itself a symlink is skipped rather than followed. This is the same rule
    `scan-service.ts:119` and `:159` already apply inside a repo scan, applied one level up.
20. **Resolved — the Trash *card* is destructive-tinted; the Trash *button* is not filled.** The
    earlier draft said "full destructive styling", which reads against the house convention the audit
    found: `smart-scan-tab.tsx`'s own Clean button is entirely neutral, with the danger signal
    deferred to the confirm dialog. Filling this button `bg-destructive` would make it the loudest
    control on a tab whose other actions are equally consequential-looking but recoverable. The
    chosen shape uses both existing tiers at once — a `border-destructive/40 bg-destructive/5`
    *container*, so the card reads as a different weight than Phase 73's System section before it is
    read, and `memory-tab.tsx:280-281`'s at-rest outlined-destructive *button*
    (`border border-destructive/40 text-destructive hover:bg-destructive/10`), which is the strongest
    at-rest button token that already exists in this codebase. Escalation still happens in the
    confirm, where `requireAck` now lives.

21. **Open — should the Automation entitlement ship while `notarize: false` and signing is
    env-gated?** macOS invalidates a TCC grant when an app's code signature changes, so with ad-hoc
    or absent signing a developer (and any user installing successive builds) may be re-prompted for
    Automation access after every `desktop:dist`. This is the same class of problem the pty broker's
    build-fingerprinted socket name solves for itself, and it is a packaging and release decision
    rather than a feature one — it touches whether this app starts signing and notarizing properly,
    which is well outside this phase.
    *Recommendation:* ship the entitlement and the usage string now regardless — without them the
    feature cannot work at all, and a repeated prompt is a far better failure than a `-1743` with no
    path to resolution. Record what actually happens on the second `desktop:dist` during Theme E's
    human pass, and if the re-prompt turns out to be per-build rather than one-time, open it as its
    own signing/notarization phase rather than degrading this feature to work around it.
