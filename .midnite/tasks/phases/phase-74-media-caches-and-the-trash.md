# Phase 74 — Media caches and the Trash

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

**Sequencing guardrail — this phase depends on two undelivered docs, not shipped code.** As of this
writing, `EcosystemSchema` does not exist in
[`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) (confirmed by
reading the file directly — it is still Phase 59's three-category schema) and neither does
`system-cache-registry.ts`, `confineAllowlist`, or any of Phase 73's other deliverables (confirmed
by grepping the tree — zero matches outside this doc and Phase 73's own). **Theme A of this phase
cannot be built before Phase 72 Theme C (`EcosystemSchema`) and Phase 73 Themes A–C
(`system-cache-registry.ts`, `confineAllowlist`, the three-factor gate) have landed in code.**
Themes B–D (the Trash) have no such dependency — they touch none of Phase 72/73's surface and can
be picked up independently, in either order relative to Theme A.

**Builds on — read before writing code.**
- [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s own Theme A deliverables (once landed):
  `SystemCacheEntry`, `PathResolver`, `DEFAULT_SYSTEM_CACHE_ENTRIES`, `resolveSystemCacheEntries`,
  and `confineAllowlist` in
  [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) (`confineTree` sits
  at `:215` today). Theme A of this phase is a catalogue addition to that registry, never a new
  one.
- [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s Theme C consent gate:
  `allowSystemCacheClean`/`systemCacheConsentGiven` in
  [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) and the one-time acknowledgment
  dialog in
  [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx).
  Reused as-is for Plex; **not** reused for the Trash — see Theme C.
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `dirBytes(root, state, signal, log)` (`:101`), `readDirSafe(dir, log)` (`:83`),
  `MAX_WALK_ENTRIES = 200_000` (`:22`), `MAX_WALK_DEPTH = 12` (`:21`). The Trash-summary walk
  (Theme B) reuses this exact walker rather than writing a second one.
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess`/`realSpawn`: `shell: false`, a fixed argument vector, a timeout, `SIGKILL` on the
  process group. Theme C's `osascript` call runs through this, unmodified — a fourth caller
  (`diagnostics/runner.ts`, `testing/runner.ts`, Phase 73's vendor reclaim commands, now this),
  never a new execution model.
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY` (`:32`), `ConfirmRequest` (`:45`), `blastRadiusKind` (`:53`), `warnings?:
  string[]` (`:64`). Theme C adds both a fourth `blastRadiusKind` arm and a genuinely new field,
  `requireAck` — the first confirm in this app with friction beyond a button click. See Decision 6.
- [`packages/desktop/src/main/ipc/fs-write-handlers.ts:129-141`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts) —
  `deleteEntry`'s `shell.trashItem(targetPath(target))` call. The only other `shell.trashItem` call
  site in the tree besides Phase 59's `optimizer-handlers.ts:58` — both move something *into* the
  Trash. Nothing in the codebase today empties it, which is the gap this phase closes.
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) —
  `PAGE_CONTENT` (`:37`), the `Record<SettingsPageId, () => ReactNode>` every settings page
  registers in. Theme C adds one entry.
- [`packages/app/src/store/ui-store.ts:161-179`](../../../packages/app/src/store/ui-store.ts) —
  `SettingsPageId`, and `SETTINGS_PAGES` (`:206`) with its `{id, label, group}` shape. `'gitSafety'`
  (`:174`, `:219`) is the precedent Theme C's new `'trashSafety'` id follows exactly.
- [`packages/app/src/components/nav-icons.ts:82,107`](../../../packages/app/src/components/nav-icons.ts) —
  `SETTINGS_PAGE_ICON`, an exhaustive `Record`. Gains one entry.
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  today's `CATEGORY_ORDER` + `SegmentedBar` (`:8-33`). Phase 73's gated "System" section (once
  landed) is where Plex's rows appear automatically; Theme D adds a **separate** Trash card beside
  it, not inside it.

**Scope guardrails.**
- **No new confinement primitive for Plex.** Two entries in Phase 73's existing
  `DEFAULT_SYSTEM_CACHE_ENTRIES`, one new `Ecosystem` member. If Theme A needs anything Phase 73's
  registry shape cannot express, that is a signal to stop and re-open Phase 73, not to bolt a
  second registry beside it.
- **The Trash is never walked into a delete.** `emptyTrash()` (Theme C) takes zero path arguments
  and always runs the same fixed `osascript` command; the Trash-summary walk (Theme B) is read-only
  and exists solely to populate a confirm dialog's numbers. See Decision 7 for exactly why that
  separation is what keeps a discovery step (`readdir('/Volumes')`) safe despite Phase 73's own
  no-discovery rule.
- **No raw `fs.rm`, ever, anywhere in this phase.** Not for Plex's cache (still `shell.trashItem`
  via `cleanSystemCaches`, Phase 73's existing path) and not for the Trash itself (Theme C —
  Decision 4). This app has never issued a permanent-delete syscall from its own code, and this
  phase does not start.
- **Two separate consent pairs, not one shared toggle.** `allowSystemCacheClean` (Phase 73) never
  gates Trash-emptying, and vice versa — see Decision 5.
- **`git-engine` gains nothing.** Same guardrail as every phase in this arc.
- **No new dependency.** `osascript` ships with macOS; nothing here needs an npm package.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — Plex, and only Plex, joins Phase 73's registry (S/M)

- [ ] **Verified paths**, cross-checked against two independent sources because
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
- [ ] Add `'media'` to `EcosystemSchema` in
      [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts),
      following Phase 73's own Decision 8 precedent for `'go'` — a genuinely new grouping, not a
      guess dressed as one of the nine existing ones.
- [ ] Add two entries to `DEFAULT_SYSTEM_CACHE_ENTRIES`
      (`packages/desktop/src/main/optimizer/system-cache-registry.ts`, once Phase 73 lands it):
      - `plex-transcode-cache` — `fixed`, `Library/Application Support/Plex Media Server/Cache`,
        ecosystem `media`, producer `Plex Media Server (regenerates on next transcode or thumbnail
        request)`, **cheap** — a local recompute from the original media file, no network involved.
      - `plex-plugin-http-cache` — `fixed`, `Library/Application Support/Plex Media
        Server/Plug-in Support/Caches`, ecosystem `media`, producer `Plex Media Server's metadata
        agents (re-fetch over the network on next library scan)`, **costly** — regenerating it
        means Plex re-hitting its remote agents, not a local recompute.
- [ ] `resolve: {kind: 'fixed', ...}` for both — Plex exposes no `env`/CLI equivalent of `go env
      GOCACHE` to ask for its own data directory, so there is no `queryTool` arm to prefer here
      (Decision 2's rule from Phase 73 correctly falls through to `fixed` when nothing exists to
      ask).
- [ ] Update the one-time consent dialog copy (Phase 73 Theme C, `optimizer-settings-page.tsx`)
      to add Plex's two directories to its named enumeration — the dialog's whole design promise
      is that it names *exactly* what got unlocked, so a catalogue addition that changes what the
      switch reaches has to change what the dialog says, or a user who consented before Plex was
      added never actually consented to Plex. This is a copy edit, not a new consent version — see
      Decision 3's note on Phase 73's still-open Decision 9.
- [ ] Extend `system-cache-registry.test.ts` with both new entries: each resolves under a fake
      `homedir`; `confineAllowlist` accepts an exact match on each and refuses `Plex Media
      Server` itself, `Metadata`, and `Plug-in Support/Databases` (the sibling directories this
      registry must never reach, asserted explicitly rather than left implied).
- [ ] **Deliberately absent**: Emby, Jellyfin, Kodi, iTunes/Music.app, Photos.app's own library
      caches. "Media tool caches" as a category could plausibly include all of these, and each is
      plausibly shaped the same way (a cache subfolder beside a database) — but this session
      verified none of them against source documentation the way Plex's paths above are verified,
      and Phase 72's own precedent (PHP/Elixir/Dart/Haskell detectors: "add them when someone has
      the repo") applies with equal force here: add one when someone can verify its real path, not
      by analogy to Plex's shape. See Decision 2.

### B — Computing what's in the Trash, honestly (M)

- [ ] Add `packages/desktop/src/main/trash-service.ts` — not under `optimizer/`, because emptying
      the Trash is not a cache-cleaning operation and does not belong beside `system-cache-service.ts`
      the way Plex's catalogue entries belong beside Cargo's. A new top-level main module, matching
      how `system-health.ts` and `browser-service.ts` already sit beside `optimizer/` as siblings
      rather than inside it.
- [ ] Export `computeTrashSummary(opts: {signal: AbortSignal}): Promise<TrashSummary>`:
      - Walks `homedir()/.Trash` using the **same** `dirBytes`/`readDirSafe` primitives and budgets
        `scan-service.ts` already exports (`MAX_WALK_ENTRIES`, `MAX_WALK_DEPTH`) — no new walker,
        no new budget constants.
      - Also discovers every currently-mounted volume's own Trash: a **shallow, one-level**
        `readdir('/Volumes')` (never recursive), and for each entry, checks whether
        `/Volumes/<name>/.Trashes/<uid>` exists, where `<uid>` is `os.userInfo().uid` — the
        documented macOS convention for a per-volume, per-user Trash. This is the one discovery
        step this phase adds despite Phase 73's own no-discovery rule; Decision 7 explains exactly
        why it is safe anyway.
      - Returns `{ itemCount, totalBytes, oldestModifiedAt: string | null, volumeCount, truncated }` —
        `oldestModifiedAt` is the oldest **top-level entry's own mtime**, not "the date it was
        moved to the Trash" (macOS does not reliably expose the latter without parsing per-item
        extended attributes this app has no other reason to read). Name the field and its UI copy
        honestly — see Decision 8.
      - `truncated: true` if any walked root hit `MAX_WALK_ENTRIES`/`MAX_WALK_DEPTH`, surfaced in
        the confirm dialog as "…and more" rather than silently under-reporting.
- [ ] Add `TrashSummarySchema` to a new
      [`packages/shared/src/domain/trash.ts`](../../../packages/shared/src/domain/trash.ts) — its
      own domain file, not folded into `domain/optimizer.ts`, for the same reason Phase 73 kept
      `SystemCacheItemSchema` out of `ScanItemSchema`: a Trash summary has no `path`, no
      `detectorId`, no `ecosystem` — it is a single aggregate, not a list of items, and forcing it
      into the existing shape would mean padding it with fields that mean nothing here.
- [ ] Add two channels following `mstudio:<domain>:<verb>`
      ([`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)):
      `optimizerTrashSummary`, `optimizerTrashEmpty`. Kept in the `optimizer` domain — Trash-emptying
      is this arc's own extension of the Optimizer, and inventing a fourth IPC domain for two
      channels buys nothing a consistent prefix doesn't already give.
- [ ] `trash-service.test.ts`: a fixture `.Trash` with known items proves `itemCount`/`totalBytes`;
      a fixture with items of different mtimes proves `oldestModifiedAt` picks the earliest; a
      fixture `/Volumes` directory with one fake mounted volume's `.Trashes/<uid>` proves
      `volumeCount` includes it, and a volume with **no** `.Trashes/<uid>` for the current uid is
      correctly excluded; a budget-exceeding fixture sets `truncated: true`.

### C — Emptying the Trash: Finder, never a raw unlink (L)

This is the theme a reviewer should read most carefully — see Decision 4.

- [ ] Export `emptyTrash(): Promise<OptimizerResultOf<Record<string, never>>>` in
      `trash-service.ts`, running **exactly one** fixed command through the existing
      `runProcess`/`realSpawn` ([`process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts)):
      `osascript ['-e', 'tell application "Finder" to empty trash']` — a literal two-element argv,
      never built by concatenation, never taking any argument from the renderer (there is no path
      list to pass; unlike Phase 73's vendor reclaim commands, which at least select an `entryId`,
      this operation has no parameter at all).
      **Rejected alternative — walking `~/.Trash` (+ discovered volumes) and issuing `fs.rm` per
      top-level entry**: it would (a) require this app's own code to issue an actual
      permanent-delete syscall, a property this codebase has never had and should not acquire for
      this feature alone; (b) reimplement Finder's own handling of locked/immutable/in-use items,
      which macOS already solves and this app has no reason to solve worse; (c) still need the same
      multi-volume discovery Theme B already does, with none of Finder's own guarantee that it
      actually knows about every mounted volume's Trash the way its own "Empty Trash" menu item
      does. Finder wins on all three.
- [ ] Map AppleScript's well-known automation-denial error (`errorNumber -1743`, "not authorized to
      send Apple events") to a specific, actionable message — *"Grant Midnite Studio access to
      control Finder in System Settings ▸ Privacy & Security ▸ Automation, then try again"* —
      rather than a bare command-failed string. This is the first Automation-permission prompt this
      app has ever triggered; **flag for the human pass** (Theme E) since the permission grant UX
      cannot be exercised in this sandboxed session.
- [ ] **Known, accepted double-confirm**: if Finder's own "Warn before emptying the Trash"
      preference (Finder ▸ Settings ▸ Advanced) is on, invoking this via AppleScript still surfaces
      Finder's own native confirm sheet after this app's. Left as-is, not suppressed — Finder's own
      dialog is out of this app's control, and suppressing it would mean this app reaching further
      into Finder's own behavior than "ask it to do the thing its menu already offers." Document the
      double-confirm in the UI copy so it reads as expected rather than a bug.
- [ ] Add `allowTrashEmpty: boolean` (default `false`) and `trashEmptyConsentGiven: boolean`
      (default `false`) to `ui-store.ts`, following `allowForceWithLease`/`allowSystemCacheClean`'s
      exact eight-edit pattern — **a separate pair, never reusing
      `allowSystemCacheClean`/`systemCacheConsentGiven`.** No `version` bump, no `migrate` arm,
      identical reasoning to every prior boolean addition in this file.
- [ ] The one-time acknowledgment dialog (confirmed once, the first time `allowTrashEmpty` flips
      `false → true`; toggling off and back on does not re-ask) reads, in substance: *"Emptying the
      Trash permanently deletes everything in it — including anything another app put there, not
      just Midnite. Unlike every other delete in this app, this does **not** go through the Trash
      first, because this operation is the Trash's own last step. There is no undo."* Confirming
      sets `trashEmptyConsentGiven = true`; cancelling reverts `allowTrashEmpty` to `false`,
      mirroring Phase 73's own pattern exactly.
- [ ] Add `packages/desktop/src/main/ipc/trash-handlers.ts` — its own handler file, not folded into
      `optimizer-handlers.ts`, for the same separation-of-trust reason Phase 73 kept
      `system-cache-registry.ts` out of `detectors.ts`: the two operations should never become easy
      to confuse at a call site.
- [ ] Add `requireAck?: string` to `ConfirmRequest`
      ([`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx)): when
      present, renders a checkbox with that exact label, and the Confirm button stays `disabled`
      until it is checked. First use of any friction beyond a plain button click in this app's one
      confirm-dialog component — reserved for the one operation in this entire arc with true
      no-undo. See Decision 6.
- [ ] Add `blastRadiusKind: 'trash'` to `BLAST_RADIUS_COPY`: subject `(n) => \`${n} item${n === 1 ?
      '' : 's'}\``, consequence `'will be permanently deleted — this cannot be undone.'`, noEffect
      `'The Trash is already empty.'` `warnings` carries the byte total, the "oldest item's own
      modified date" line (worded to match Decision 8's honesty constraint), and, when
      `volumeCount > 1`, a line naming how many other mounted disks' Trash are included.
- [ ] `emptyTrash` request is gated at the point of use by
      `optimizerEnabled && allowTrashEmpty && trashEmptyConsentGiven` — the same three-way-AND shape
      Phase 73 Theme C established, with `allowTrashEmpty`/`trashEmptyConsentGiven` standing in for
      its second and third factors.
- [ ] `trash-handlers.test.ts` / `reclaim-commands`-style test: `emptyTrash` invokes `runProcess`
      with the exact fixed argv and nothing else, proven with a fake `spawn`; a simulated
      `-1743` exit maps to the actionable message; the settings-gate tests mirror Phase 73's
      `system-cache-consent.test.ts` shape for the new pair — toggling `allowTrashEmpty` without
      confirming leaves the action hidden and `trashEmptyConsentGiven` false; confirming persists it.

### D — UI: a settings page of its own, and a card that never reads as recoverable (M)

- [ ] Add `packages/app/src/features/settings/settings-pages/trash-safety-page.tsx`, copying
      `git-safety-page.tsx`'s shape exactly (its own page, one labelled checkbox, a "What this still
      never does" box) — the file's own reasoning, *"a switch that turns on a real force-push is a
      different weight of decision… it deserves a page a user has to go looking for,"* applies with
      more force to a switch with no undo at all than to one with a lease-checked one.
- [ ] Add `'trashSafety'` to `SettingsPageId`
      ([`ui-store.ts:161-179`](../../../packages/app/src/store/ui-store.ts)), to `SETTINGS_PAGES`
      (`:206`, label "Trash", group `'system'`), and to `SETTINGS_PAGE_ICON`
      ([`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts), e.g. `LuTrash2`).
      Register the page component in `PAGE_CONTENT`
      ([`settings-view.tsx:37`](../../../packages/app/src/features/settings/settings-view.tsx)).
- [ ] Storage tab ([`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx)):
      add a **separate** "Trash" card, gated on Theme C's three-way AND, showing the live
      `itemCount`/`totalBytes` from `optimizerTrashSummary` (fetched on tab mount/an explicit
      "Check Trash" action — see Decision 11) and a single "Empty Trash…" button that opens the
      Theme C confirm. Visually **more** alarming than Phase 73's System section (which uses a
      different accent, not a warning color) — full destructive styling, since this is the one card
      in the whole Optimizer surface with true no-undo. Never merged into the System section itself:
      the Trash is not a tool cache and grouping it with Cargo/Plex would understate what it does.
- [ ] Plex's two new rows need no new UI code — they render automatically inside Phase 73's
      existing gated System section once Theme A's registry entries exist, using that section's
      existing `label`/`producer` row format (*"Plex transcode cache · will need a re-transcode on
      next playback"*).
- [ ] Every icon from `react-icons`, imported per set, never `lucide-react` — unchanged repo rule.
- [ ] `packages/app/e2e/optimizer-shots.spec.ts`: the Trash card, light and dark, gate on; the
      System section with Plex's two rows present, light and dark, gate on.

### E — Verification (M)

- [ ] `system-cache-registry.test.ts` (Theme A additions), `trash-service.test.ts`,
      `trash-handlers.test.ts` — all from Themes A–C above.
- [ ] `confine-allowlist.test.ts` (or wherever Phase 73 lands its own): Plex's two entries refuse
      `Plex Media Server` itself, `Metadata`, and `Plug-in Support/Databases`.
- [ ] `emptyTrash`'s argv is asserted literal and constant across every test — no path, no
      renderer-supplied string, ever reaches it.
- [ ] Renderer test: the Trash card is absent with any one of `optimizerEnabled` /
      `allowTrashEmpty` / `trashEmptyConsentGiven` false, and present only with all three true; the
      Confirm button in the Trash's confirm dialog stays disabled until `requireAck`'s checkbox is
      checked.
- [ ] `moon run :typecheck :lint :test` green.
- [ ] **Human pass, on a real Mac:**
      - With Plex installed: confirm the System section reports real, correct byte figures for
        both new entries; confirm a clean of `plex-transcode-cache` only touches `Cache/` (check
        `Metadata/` and `Plug-in Support/Databases/` are untouched, and check the Trash for the
        recovered item).
      - Trash: create a disposable throwaway file, delete it (via Finder or this app), confirm
        `computeTrashSummary` reports it; click through the one-time consent dialog and confirm its
        copy reads honestly; confirm the Confirm button in the empty-Trash dialog is genuinely
        disabled until the acknowledgment checkbox is checked; confirm the Automation permission
        prompt appears once and, after granting it, the Trash actually empties; if a second mounted
        volume with its own Trash contents is available, confirm it is counted and cleared too.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/trash-service.ts` — `computeTrashSummary`, `emptyTrash` (B, C).
- `packages/desktop/src/main/trash-service.test.ts` (B, C, E).
- `packages/desktop/src/main/ipc/trash-handlers.ts`, `trash-handlers.test.ts` (C, E).
- [`packages/shared/src/domain/trash.ts`](../../../packages/shared/src/domain/trash.ts) —
  `TrashSummarySchema` (B).
- `packages/app/src/features/settings/settings-pages/trash-safety-page.tsx` (D).

**Changed**
- `packages/desktop/src/main/optimizer/system-cache-registry.ts` (once Phase 73 lands it) — two new
  `DEFAULT_SYSTEM_CACHE_ENTRIES` (A).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema` gains `'media'`, once Phase 72 has landed it (A).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
  [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) —
  `optimizerTrashSummary`, `optimizerTrashEmpty` (B, C).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `allowTrashEmpty`, `trashEmptyConsentGiven`, `'trashSafety'` added to `SettingsPageId` and
  `SETTINGS_PAGES`, eight edits for the boolean pair, **no `version` bump** (C, D).
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) —
  one `SETTINGS_PAGE_ICON` entry (D).
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) —
  one `PAGE_CONTENT` entry (D).
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `blastRadiusKind: 'trash'`, `requireAck?: string` (C).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  the one-time consent dialog copy names Plex's two directories (A).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the new, separately-styled Trash card (D).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts) —
  Trash card + Plex rows, gate-on shots (D, E).

**Deliberately unchanged**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `dirBytes`/`readDirSafe`/budgets reused as-is; `cleanItems`/`knownRoots` untouched.
- [`packages/desktop/src/main/optimizer/system-cache-service.ts`](../../../packages/desktop/src/main/optimizer/system-cache-service.ts) —
  Plex's clean path is Phase 73's existing `cleanSystemCaches`, unmodified.
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the Trash gets its own handler file (Theme C) specifically so this one stays untouched.
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Plex's two entries refuse every sibling directory (`Metadata`, `Plug-in Support/Databases`,
      `Plex Media Server` itself) in `confineAllowlist`'s test suite.
- [ ] `emptyTrash`'s argv is a literal constant in every test — never influenced by any input.
- [ ] The Trash card and its confirm dialog are unreachable with any one of the three Theme C gates
      off, and the empty-Trash Confirm button cannot be clicked before `requireAck`'s checkbox.
- [ ] Storage tab shots refreshed: System section with Plex rows, Trash card — light and dark.
- [ ] **Human:** real-Mac pass per Theme E, Plex and Trash both.

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
- **Per-volume opt-out** (e.g. "never empty this external drive's Trash"). Not built:
  `allowTrashEmpty` is the only gate, and every discovered volume's Trash is included or none are.
- **Selective/partial emptying** (choosing which items in the Trash to keep). This phase only
  offers "empty everything," matching what Finder's own single menu command does — a per-item
  picker is a materially larger feature (needs a listing/selection UI) and is not built here.
- **A "restore from Trash" affordance.** Out of scope in both directions — this phase only empties;
  Finder already offers restore for anything not yet emptied.
- **Automatic or scheduled Trash checks.** Every scan in this app stays user-initiated, matching
  Phase 73's own stance — see Decision 11.
- **Re-confirming consent when the registry grows** (e.g. a future media tool added to Theme A's
  catalogue after a user already consented). Phase 73's own Decision 9 left this open for its
  dev-tool catalogue; it stays open here for the same reason and is not resolved by this phase.

---

## Decisions / open questions

Every decision below was chosen without a human in the loop, running this brainstorm the way the
two prior phases in this arc ran theirs — see the task's own instruction to record rather than
silently pick. Each names the recommendation taken and why, so a later refine can reverse it with
the reasoning in view. **Decision 4 is the one a reviewer most needs to check by hand.**

1. **Plex's two cache directories slot into Phase 73's existing `SystemCacheEntry` registry and
   three-factor consent gate — not a parallel, media-specific registry.** The shape is identical
   (one exact allowlisted path, no descent, a named `producer` that regenerates it, the same
   `costly`/`cheap` grading and the same blast-radius class as a dev-tool cache), and Phase 73's own
   Decision 8 already established the precedent for widening `EcosystemSchema` by one member
   (`'go'`) when a genuinely new grouping needs a label rather than a parallel type. A second
   registry would duplicate `confineAllowlist`, the consent gate, and the Storage tab's System
   section for no structural reason — the whole value of Phase 73's design is that a *reviewed*
   entry, wherever it comes from, is exactly as trustworthy as any other.
2. **Scope Theme A to Plex alone.** Emby, Jellyfin, Kodi and Photos.app/Music.app are all
   plausible members of "media-tool cache," and this doc's own framing ("Plex and anything shaped
   like it") explicitly invited widening. Rejected for this phase: Phase 72's own precedent for
   PHP/Elixir/Dart/Haskell detectors — *"add them when someone has the repo [to test against]"* —
   applies with equal force to a tool whose real cache path this session cannot verify against its
   own documentation. Widening by analogy to Plex's directory shape is exactly the guessing Phase
   73's whole design exists to refuse (*"a wrong guess there is exactly the failure mode this
   phase's whole design exists to refuse"*, Phase 73 Theme A). One verified tool now beats three
   guessed ones.
3. **The verification chain for Plex's paths, stated honestly.** `support.plex.tv` — the
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
   out rather than shipped on the strength of a single hit.
4. **Emptying the Trash goes through `osascript`/Finder exclusively — never a raw `fs.rm` of
   `~/.Trash`'s contents.** The alternative (walk the discovered Trash roots and delete each
   top-level entry directly) was seriously considered and rejected on three independent grounds:
   it would give this app's own code the ability to issue an actual permanent-delete syscall for
   the first time in its history; it would reimplement Finder's own handling of locked, immutable
   and in-use files, which is exactly the kind of edge case this app has never had to solve and
   should not solve worse than the OS already does; and it would still need Theme B's own
   multi-volume discovery with none of the guarantee that Finder's single "Empty Trash" command
   already carries — that it actually finds every mounted volume's Trash, because it is the same
   code path the Finder menu item itself uses. The cost of the chosen option is one dependency on
   AppleScript/Automation permission (a real, user-visible one-time prompt); the cost of the
   alternative is this app acquiring a class of bug — an unrecoverable delete from its own code —
   that no other feature in Midnite Studio has ever had to defend against.
5. **Trash-emptying gets its own consent pair (`allowTrashEmpty`/`trashEmptyConsentGiven`) and its
   own settings page, never Phase 73's `allowSystemCacheClean`/`systemCacheConsentGiven`.** The
   blast-radius class is qualitatively different even from Phase 73's own "whole machine's dev
   tooling" jump: a dev-tool cache is, by construction, something *a build tool* put there and can
   put back; the Trash's contents are things *the user* put there, from any app, with an explicit
   expectation — Finder's own "Put Back" — that survives right up until the moment it is emptied.
   Sharing one toggle would mean a user who only ever meant to let Midnite clean their Cargo
   registry silently also unlocks a wholesale irreversible delete the day this phase ships. Two
   gates cost one more settings page; conflating them costs a class of accidental consent this
   phase's whole design exists to prevent.
6. **A new `requireAck?: string` field on `ConfirmDialog`, gating the Confirm button behind an
   explicit checkbox, used nowhere else in the app.** Considered and rejected: reusing the existing
   `warnings` list (which only ever *displays* text) or a longer `danger` styling change (which
   changes color, not interaction) — neither actually stops a reflexive click the way Phase 73's own
   framing worries about (*"a plain checkbox in a settings page a user may never fully read is the
   same shape of consent as the thing that got `node_modules` deleted with no producer field"*).
   Emptying the Trash is the one operation in this arc where that reflexive click has zero undo, so
   it is the one operation that earns a mechanism stronger than every other confirm dialog in the
   app. The cost is one more click, exactly once per empty; the alternative's cost is indistinguishable
   friction between "delete a rebuildable cache" and "delete everything, permanently."
7. **The Trash-summary walk is allowed one narrow discovery step
   (`readdir('/Volumes')`) that Phase 73's `confineAllowlist` rule would otherwise forbid — because
   the discovery only ever feeds a *displayed number*, never a delete target.** Phase 73's
   no-discovery rule exists to stop a detector bug from ever becoming an arbitrary-path *delete*;
   here, `emptyTrash()` takes zero path arguments and always runs the same fixed, argument-free
   `osascript` command regardless of what `computeTrashSummary` found. A bug in the volume-discovery
   step can, at worst, mis-report the confirm dialog's item count or byte total — it structurally
   cannot mis-target a delete, because nothing about it is wired to one. This is the one place in
   this phase's design where "discovery" and "confinement" are not the same question, and the
   distinction is the reason the exception is safe rather than a crack in Phase 73's own rule.
8. **"Oldest item" reports the oldest top-level Trash entry's own last-modified time (`mtime`), not
   "the date it was moved to the Trash."** macOS does not reliably expose the latter without
   parsing per-item extended attributes (`com.apple.trash.sourceInfo` or equivalent) this app has no
   other reason to read, and guessing at a "date trashed" from `mtime`/`ctime` alone would be a
   false precision the confirm dialog cannot actually back up. Naming the field for what it
   genuinely measures — "oldest item's own last-modified date" — beats promising a fact the walk
   does not compute.
9. **macOS-only, stated rather than silent**, matching Phase 73's own Decision 7 and this app's
   scope statement ([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md)). Windows' Recycle
   Bin (`SHEmptyRecycleBin` or a PowerShell equivalent) and Linux's XDG trash spec
   (`~/.local/share/Trash`) are real, named gaps for a follow-on phase if/when this app ships on
   those platforms — not built speculatively here.
10. **One phase doc, two PR-sized themes with different risk profiles (Theme A vs. Themes B–D) —
    not a Phase 74/75 split.** Seriously considered, because the assignment that produced this doc
    explicitly asked the question. Rejected: Theme A is almost entirely catalogue-and-copy reuse of
    machinery Phase 73 already designs (two registry entries, one `Ecosystem` member, one dialog
    copy edit) — it introduces no new confinement primitive, no new consent pair, no new IPC domain.
    Themes B–D are one coherent feature (compute a number, gate it, act on it, show it) that does
    not make sense shipped partially — a Trash-summary read with no way to act on it, or an
    empty-Trash action with no settings gate, are each incomplete on their own. Phase 72→73's split
    was justified by a genuinely different *confinement primitive* (repo-scoped `confineTree` vs.
    allowlist-only `confineAllowlist`) each needing its own review; here, only the Trash introduces
    a new primitive-adjacent concept (the discovery exception, Decision 7), and it is the minority
    of this phase's total weight. Splitting would mostly relabel theme letters as phase numbers
    without a matching review-boundary reason.
11. **Open — should the Storage tab's Trash card auto-refresh its count, or only recompute on an
    explicit action?** Recommend explicit-only (a "Check Trash" affordance, or refresh on tab
    focus rather than a poll), matching Phase 73's own stance that *"every scan in this app stays
    user-initiated, System caches included."* Not built as a background poll here; revisit only if
    a reviewer specifically wants a live-updating count badge instead.
