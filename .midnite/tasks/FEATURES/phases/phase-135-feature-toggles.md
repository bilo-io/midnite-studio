# Phase 135 — Feature toggles

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `014faf783`.

Studio composes 37 feature packages and every one of them is always on: its rail row, its palette rows and chords, its
settings pages, its main-process timers and its IPC. This phase lets a user switch a feature off in a new Settings ▸
Features page. Off hides it everywhere a user meets it, stops its main-process work and answers its IPC with the error
envelope; its data stays on disk, so switching it back on restores it as it was, and a "Delete this feature's data"
action beside a switched-off feature moves that data to the Trash behind the destructive confirm. Terminal, Settings and
Accounts are always on.

> **Builds on.**
> - **Feature manifests and registrations** (Phase 113 Theme C): `FEATURE_VIEWS` / `FEATURE_SETTINGS_PAGES`
>   ([`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts)), each package's
>   `manifest.ts`, and `defineFeatureMain`'s `channels` list.
> - **Studio's composition** ([`composition.ts`](../../../apps/studio/src/composition.ts)): `STUDIO_FEATURES`, held to
>   `packages/features/*` by its test.
> - **Suite preferences** (Phase 123 Theme L, Phase 134 Theme D): `suite-prefs.json`, a frame store per group over
>   `suitePrefsStorage`, read and watched by main through `createSuitePrefsService`.
> - **Settings ▸ Sidebar's nav visibility** (`components/nav-visibility.ts`): the rail, palette and nav-command gating
>   this phase extends.
>
> **Scope guardrails.** Studio's composition only; the suite apps do not read the toggles. No per-tab Media toggles. No
> new eslint exception. macOS only, `react-icons` only, every new test a vitest unless it names the browser capability
> it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — The toggle registry.** ✅ `shared/src/feature-toggles.ts` holds 24 toggles over the composed feature packages (label, description, rail group, `requires`, packages, views, settings pages, commands, data, `ipcOpen`), `ALWAYS_ON_FEATURE_PACKAGES` with a reason each, and the pure helpers (`featureForView`/`Command`/`SettingsPage`, `withDependencies`, `dependentsOf`). `apps/studio`'s test holds every `STUDIO_FEATURES` package to exactly one toggle or the always-on list and each toggle's views to its manifests.

**Theme B — State and sync.** ✅ A `studioFeatures` suite-prefs group (`{ disabled }`, unknown ids dropped, no version bump) behind the frame's `useFeatureTogglesStore` (`setEnabled` closes over dependencies; `useDisabledFeatures`, `useFeatureOn`). Main reads `suite-prefs.json` synchronously before any feature work starts and follows the suite-prefs service's change event; once the log sink exists it writes one `feature-gate: switched off at boot: …; not started: …` line.

**Theme C — Hide in the renderer.** ✅ The rail, palette rows, nav commands and their chords (`withFeatureToggles`), settings pages, dashboard widgets, status-bar segments (Browser, Finance, Tests, Checks, Monitor), the quick-access Notes/Companion leaves, the docked browser, companion, FAB and Notes modal all drop an off feature. A deep link or stale view lands on `FeatureOffState` with "Turn on X". The real run found the Graph crashing with Chats off at boot (its running-chat avatars read the gated list), so always-on views now skip an off feature's IPC: the graph hook, the chats store and the companion's revealers and find sources.

**Theme D — Settings ▸ Features.** ✅ A `features` page after Appearance: one accordion per rail group, a switch, description and Needs/needed-by note per row, and an Always on section (Terminal, Settings, Accounts). Turning off a feature others need confirms and names them (Chats → Councils); turning on a dependent turns its requirements on and says so.

**Theme E — Stop in main.** ✅ `ipc/handle.ts` asks `featureOffAnswer` before running a handler: a channel owned by an off feature (each feature main's own `channels`, shared channels and `ipcOpen` toggles excluded) answers the error envelope, and stays registered. `bindFeatureLifecycle` starts and stops background work at runtime: FX rates (finance), capture, media library, vanguard sensors, browser discard sweeps, guard loop sweeps, workflow triggers and gate poll (`setWorkflowsBackgroundPaused`). MCP calls to an off feature's tools (media, `workflow_*`, `companion_*`) are refused. Every toggle takes hold at runtime; none needs a restart.

**Theme F — Delete a feature's data.** ✅ `features:data-describe` / `features:data-delete` list the feature's registered files under `userData` with sizes and move them to the Trash (`shell.trashItem`), refused while it is on and confined to `userData`. Beside an off feature, "Delete this feature's data…" opens the destructive confirm with files, sizes, saved view state and vault entries; the renderer clears the storage keys after main trashes the files.

## Build order

1. **A** first: every other theme reads the registry.
2. **B** next (the persisted state, the frame store and main's copy).
3. **C** and **E** (renderer hide, main stop), then **D** (the page that drives them), then **F**.

## Deliverables

### A — The toggle registry (M)

- [x] `shared/src/feature-toggles.ts`: `FEATURE_TOGGLES`, one entry per user-facing feature with `label`, a one-line
  `description`, `group` (`pinned`, `workspace`, `git`, `agent`, `panels`: the rail's groups plus the panels with no rail
  row), `requires`, the feature `packages` it covers, its `views`, `settingsPages` and `commands`, its `data`
  (files under `userData`, renderer storage keys, vault entries) and `restart` when its main work only stops on relaunch.
- [x] `ALWAYS_ON_FEATURE_PACKAGES`: every composed package no toggle covers, each with its reason (Terminal, the git
  engine behind forge, the MCP server's trust and approvals).
- [x] Pure helpers: `disabledViews`, `featureForView`, `featureForCommand`, `featureForSettingsPage`,
  `withDependencies` (turning a feature on turns on what it needs), `dependentsOf` (what turning it off affects).
- [x] Tests: `feature-toggles.test.ts` in shared (ids, requires form no cycle, no view/page/command claimed twice,
  Settings/Accounts/Terminal never claimed) and `feature-toggles.test.ts` in `apps/studio` (every `STUDIO_FEATURES`
  package is covered exactly once by a toggle or the always-on list; each toggle's views match its packages' manifests).

### B — State and sync (S)

- [x] A `studioFeatures` suite-prefs group `{ disabled: FeatureToggleId[] }` (default `[]`, unknown ids dropped).
- [x] `useFeatureTogglesStore` in the frame over `suitePrefsStorage`, with `setEnabled(id, on)` applying dependencies.
- [x] Main keeps its own copy: read from `suite-prefs.json` synchronously at boot, before any feature work starts, and
  updated from the suite-prefs service's change event.
- [x] Tests: the store (defaults, dependency closure, corrupt payload), main's gate state (boot read, change events).

### C — Hide in the renderer (M)

- [x] Rail, palette view rows and the off-view redirect read an effective nav visibility that folds switched-off
  features in, beside Settings ▸ Sidebar's own choice.
- [x] A switched-off feature's commands are disabled ("Switched off in Settings ▸ Features"), so their chords do
  nothing, and the palette leaves them out.
- [x] Its settings pages leave the Settings sidebar; its dashboard widgets leave the dashboard; the quick-access menu
  drops a switched-off Notes leaf.
- [x] A deep link (`midnite-studio://view?id=…`) or a stale active view of a switched-off feature lands on a "feature is
  off" state with a switch that turns it back on.
- [x] Tests: vitest for the nav helpers, the command gating and the off state.

### D — Settings ▸ Features (M)

- [x] A `features` settings page in the General group: every toggle grouped as the rail groups them, each row a switch,
  the description and a "Needs …" note; Terminal, Settings and Accounts listed as always on.
- [x] Switching off a feature others need asks first and names the dependents, then switches them off too; switching on
  a dependent turns on what it needs.
- [x] Tests: `features-page.test.tsx` (rows, dependency prompt, cascade on and off).

### E — Stop in main (M)

- [x] One IPC gate in desktop's `ipc/handle.ts`: a channel owned by a switched-off feature (from each feature main's
  `channels`) answers `{ ok: false, kind: 'error', … }` instead of running; one-way channels drop the message.
- [x] Background work stops when switched off and does not start at boot: listed per feature in Decisions.
- [x] The MCP server refuses calls to tools owned by a switched-off feature (its static `tools/list` still names them; see Decisions).
- [x] Tests: the gate (on, off, back on), the start/stop wiring per feature.

### F — Delete a feature's data (M)

- [x] `features:data-describe` and `features:data-delete` channels: main lists what exists of the feature's files with
  sizes and moves them to the Trash; vault entries named in the registry are listed and kept; refused while the feature is on.
- [x] Beside a switched-off feature, "Delete this feature's data…" opens the destructive confirm listing files, sizes,
  storage keys and vault entries; on confirm main trashes files and the renderer clears the storage keys.
- [x] Tests: describe/delete over a temp `userData`, refusal while on, the page's confirm wiring.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/feature-toggles.ts` | A | net-new: registry and helpers |
| [`packages/shared/src/suite-prefs.ts`](../../../packages/shared/src/suite-prefs.ts) | B | `studioFeatures` group |
| `packages/frame/src/prefs/feature-toggles-store.ts` | B | net-new |
| `apps/studio/src/feature-toggles.test.ts` | A | net-new coverage test |
| [`packages/app/src/components/nav-visibility.ts`](../../../packages/app/src/components/nav-visibility.ts) | C | effective visibility |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | C | rail, off state |
| `packages/app/src/features/settings/settings-pages/features-page.tsx` | D F | net-new |
| [`packages/desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) | E | the gate |
| `packages/desktop/src/main/feature-gate.ts` | B E F | net-new: main's state, start/stop, data |

## Verification

- [x] Targeted checks green: `tsc --noEmit` per touched package, eslint on changed files, vitest on touched suites,
  `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget` (the workspace-wide gate is not run here).
- [x] **Gate — the built app, a throwaway `--user-data-dir`, no mocks.** Open Settings ▸ Features; switch off Chats while
  Councils is on (the dependency prompt) and one more feature; both leave the rail and palette and their chord does
  nothing; a deep link lands on the off state; main's log shows the feature's work stopped; one comes back with its data;
  "Delete this feature's data" runs on a throwaway feature through its confirm. Shots under `/tmp/midnite-shots-p135/`.

## Not in this phase

- **Toggles in the suite apps.** The group is Studio's; Agents, Media and the rest keep every module on.
- **Per-tab Media toggles.** Media is one toggle over its eleven packages.
- **The frame.** Graph, History, Files, Search, Knowledge, Dashboard and Landing are the frame, not features.
- **Unregistering IPC handlers.** A switched-off feature's handlers stay registered and answer the error envelope.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Resolved — off means hide, stop and keep the data, with an explicit cleanup** (agreed with the user): hidden from
   the rail, palette, chords, dashboard, deep links and cross-feature entry points; main work stopped and IPC answered
   with the error envelope; data kept until "Delete this feature's data", which goes through the destructive confirm
   and lists what will be removed.
2. **Resolved — one new Settings page, "Features"** (agreed with the user), grouped like the rail, with switches,
   descriptions, dependency notes and a prompt naming dependents.
3. **Resolved — everything defaults on** (agreed with the user); Terminal, Settings and Accounts are always on.
4. **Resolved — the source of truth is Studio's composition.** The toggle unit is a user-facing feature that covers one
   or more feature packages; `apps/studio`'s test fails when a package in `STUDIO_FEATURES` is neither covered by a
   toggle nor listed always-on with a reason. Views come from the manifests (checked by the same test).
5. **Resolved — the state is a suite-prefs group, not a ui-store field.** `suite-prefs.json` is the settings mechanism
   main already reads and watches, so main knows a feature is off at boot before any of its work starts, with no
   renderer round trip. The file schema is per-group partial, so a new group needs no version bump or migration: a file
   without it resolves to "everything on". The group is named `studioFeatures` because only Studio applies it.
6. **Resolved — the IPC gate is central**, in desktop's `handle`/`handleBare`/`handleSend`, keyed by each feature
   main's own `channels`, so no feature package changes and nothing crosses a layer.
7. **Resolved — "Delete" moves files to the Trash** (`shell.trashItem`, the optimizer's pattern), so it is recoverable.
   Vault entries are **kept**, and the confirm lists them as kept: a vault entry is a credential the user typed, the
   vault is shared with always-on Accounts, and the Trash cannot hold one. Revised from "removed outright" at build.
8. **Resolved — every toggle acts at runtime.** The IPC gate, the lifecycles and the renderer hide all follow the
   suite-prefs change event, and Workflows gained `setWorkflowsBackgroundPaused`, so the registry's `restart` flag is
   set on no toggle today; the page's "after a restart" note appears only if one ever needs it.
9. **Resolved — `ipcOpen` toggles keep their channels open.** Vault, Pull requests and Sessions are hidden when off,
   but always-on surfaces (Accounts, the graph's PR badges, the terminal) read the same channels.
10. **Resolved — Councils needs Chats is a product dependency**, not a code one: a council runs its members as chats.
11. **Resolved — always-on surfaces must not call an off feature's IPC.** The gate answers the error envelope where a
    handler returns a list shape, so a caller outside the feature checks `useFeatureOn` first; the companion's reveal
    and find tables are wrapped once (`compose/companion/feature-gate.ts`) rather than per family.
12. **Deferred** (recorded in the done entry): the MCP shim's static `tools/list` still names an off feature's tools
    (calls are refused); Settings ▸ Sidebar does not mark off features; the empty workspace's "Toggle Browser" shortcut
    and the lock screen's finance and monitor widgets are not gated; Books' and Loops' runtime-directory data is not in
    the delete list.
