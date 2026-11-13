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

**Theme A — The toggle registry.** ◻ TODO

**Theme B — State and sync.** ◻ TODO

**Theme C — Hide in the renderer.** ◻ TODO

**Theme D — Settings ▸ Features.** ◻ TODO

**Theme E — Stop in main.** ◻ TODO

**Theme F — Delete a feature's data.** ◻ TODO

## Build order

1. **A** first: every other theme reads the registry.
2. **B** next (the persisted state, the frame store and main's copy).
3. **C** and **E** (renderer hide, main stop), then **D** (the page that drives them), then **F**.

## Deliverables

### A — The toggle registry (M)

- [ ] `shared/src/feature-toggles.ts`: `FEATURE_TOGGLES`, one entry per user-facing feature with `label`, a one-line
  `description`, `group` (`pinned`, `workspace`, `git`, `agent`, `panels`: the rail's groups plus the panels with no rail
  row), `requires`, the feature `packages` it covers, its `views`, `settingsPages` and `commands`, its `data`
  (files under `userData`, renderer storage keys, vault entries) and `restart` when its main work only stops on relaunch.
- [ ] `ALWAYS_ON_FEATURE_PACKAGES`: every composed package no toggle covers, each with its reason (Terminal, the git
  engine behind forge, the MCP server's trust and approvals).
- [ ] Pure helpers: `disabledViews`, `featureForView`, `featureForCommand`, `featureForSettingsPage`,
  `withDependencies` (turning a feature on turns on what it needs), `dependentsOf` (what turning it off affects).
- [ ] Tests: `feature-toggles.test.ts` in shared (ids, requires form no cycle, no view/page/command claimed twice,
  Settings/Accounts/Terminal never claimed) and `feature-toggles.test.ts` in `apps/studio` (every `STUDIO_FEATURES`
  package is covered exactly once by a toggle or the always-on list; each toggle's views match its packages' manifests).

### B — State and sync (S)

- [ ] A `studioFeatures` suite-prefs group `{ disabled: FeatureToggleId[] }` (default `[]`, unknown ids dropped).
- [ ] `useFeatureTogglesStore` in the frame over `suitePrefsStorage`, with `setEnabled(id, on)` applying dependencies.
- [ ] Main keeps its own copy: read from `suite-prefs.json` synchronously at boot, before any feature work starts, and
  updated from the suite-prefs service's change event.
- [ ] Tests: the store (defaults, dependency closure, corrupt payload), main's gate state (boot read, change events).

### C — Hide in the renderer (M)

- [ ] Rail, palette view rows and the off-view redirect read an effective nav visibility that folds switched-off
  features in, beside Settings ▸ Sidebar's own choice.
- [ ] A switched-off feature's commands are disabled ("Switched off in Settings ▸ Features"), so their chords do
  nothing, and the palette leaves them out.
- [ ] Its settings pages leave the Settings sidebar; its dashboard widgets leave the dashboard; the quick-access menu
  drops a switched-off Notes leaf.
- [ ] A deep link (`midnite-studio://view?id=…`) or a stale active view of a switched-off feature lands on a "feature is
  off" state with a switch that turns it back on.
- [ ] Tests: vitest for the nav helpers, the command gating and the off state.

### D — Settings ▸ Features (M)

- [ ] A `features` settings page in the General group: every toggle grouped as the rail groups them, each row a switch,
  the description and a "Needs …" note; Terminal, Settings and Accounts listed as always on.
- [ ] Switching off a feature others need asks first and names the dependents, then switches them off too; switching on
  a dependent turns on what it needs.
- [ ] Tests: `features-page.test.tsx` (rows, dependency prompt, cascade on and off).

### E — Stop in main (M)

- [ ] One IPC gate in desktop's `ipc/handle.ts`: a channel owned by a switched-off feature (from each feature main's
  `channels`) answers `{ ok: false, kind: 'error', … }` instead of running; one-way channels drop the message.
- [ ] Background work stops when switched off and does not start at boot: listed per feature in Decisions.
- [ ] The MCP server stops listing and dispatching tools owned by a switched-off feature.
- [ ] Tests: the gate (on, off, back on), the start/stop wiring per feature.

### F — Delete a feature's data (M)

- [ ] `features:data-describe` and `features:data-delete` channels: main lists what exists of the feature's files with
  sizes and moves them to the Trash; vault entries named in the registry are removed; refused while the feature is on.
- [ ] Beside a switched-off feature, "Delete this feature's data…" opens the destructive confirm listing files, sizes,
  storage keys and vault entries; on confirm main trashes files and the renderer clears the storage keys.
- [ ] Tests: describe/delete over a temp `userData`, refusal while on, the page's confirm wiring.

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

- [ ] Targeted checks green: `tsc --noEmit` per touched package, eslint on changed files, vitest on touched suites,
  `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget` (the workspace-wide gate is not run here).
- [ ] **Gate — the built app, a throwaway `--user-data-dir`, no mocks.** Open Settings ▸ Features; switch off Chats while
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
7. **Resolved — "Delete" moves files to the Trash** (`shell.trashItem`, the optimizer's pattern), so it is recoverable;
   vault entries are removed outright, and the confirm says so.
