# Phase 83 — Third-party apps rail

> **Builds on:** [Phase 32](phase-32-browser-engine-and-tabs.md) (`WebContentsView` embedded
> browser, partitioned sessions, security posture) and [Phase 55](phase-55-multi-window-studio.md)
> (window-role registry, panel detach/re-dock machinery).
>
> **Scope guardrails:** Ships three embedded apps — Spotify, Google Calendar, YouTube — as
> toggleable panels reachable from a new bottom-of-rail row, each backed by its own isolated,
> persistent browser session, and each independently detachable into its own floating window
> (more than one may be detached at once). A generic app-registry framework for arbitrary/custom
> apps, a per-app log-out/reset-session UI, and simultaneous docked multi-app display all stay out
> of scope.
>
> **Effort tags:** **(S)** ≤ half-day · **(M)** 1–2 days · **(L)** 3+ days.

---

## Background

The side nav (`app.tsx`) already renders a `NavConfig` with `pinned`/`sections`/`footer` slots; the
`footer` slot currently holds `RailLockButton`, the Settings link and `RailVersion` and is the
natural home for a "bottom of rail" affordance the brief describes. The git-repos sidebar
(`repos-panel.tsx`) is the reference point for "further left than the repos bar," but it is a
persistent resizable layout slot (`ui-store`'s `LayoutSizes`) — this phase deliberately uses a
lighter, dismiss-on-click-away flyout instead, so no new resizable layout state is needed.

Two phases already did the hard parts this reuses. Phase 32 built `WebContentsView` embedding with
a locked-down security posture (no preload/bridge on embedded views, deny-all permissions/popups,
`http(s)`-only navigation) and partitioned sessions — today one shared `persist:browser` partition
for every browser tab. Phase 55 built the window-role registry (`WindowRoleSchema`,
`window-manager.ts`'s `createRoleWindow`/`resolveRole`/`listWindows`) and the zero-reload
`WebContentsView` reparenting a detach/re-dock move uses.

The genuinely new work is: (1) per-app partitions so Spotify/Calendar/YouTube logins don't bleed
into each other or into general browser tabs, and (2) treating each app as its own independently
detachable panel rather than the single fixed-role panels Phase 55 modeled.

---

## Deliverables

### Theme A — Shared app registry & domain types (S) ✅ DONE (PR #346, 2026-09-11)

- [x] **A.1** Define the app domain in [`packages/shared/src/domain/apps.ts`](../../../packages/shared/src/domain/apps.ts) *(new)*, following [`domain/window.ts`](../../../packages/shared/src/domain/window.ts)'s shape (zod-only, one JSDoc block per schema, a sibling `z.infer` alias):
  - `AppIdSchema = z.enum(['spotify', 'google-calendar', 'youtube'])`
  - `AppDefinitionSchema = z.object({ id: AppIdSchema, label: z.string(), launchUrl: z.string().url(), partition: z.string() })` — `partition` is the literal `persist:app-<id>` string, computed once and carried rather than re-derived at each call site.
  - Add `export * from './apps';` to [`domain/index.ts`](../../../packages/shared/src/domain/index.ts) — it's a flat barrel; a module not listed there is not exported.
- [x] **A.2** Extend `PANEL_WINDOW_ROLES` in [`domain/window.ts`](../../../packages/shared/src/domain/window.ts) with three literal roles: `apps-spotify`, `apps-google-calendar`, `apps-youtube`. Fixed literals over a dynamic `apps:<id>` scheme — only three apps are in scope and `WindowRoleSchema` is a plain `z.enum`, so a dynamic pattern would be new parsing machinery for no present benefit.
- [x] **A.3** Persisted on/off state: `enabledApps: AppId[]` added to `ui-store`'s `PersistedUi`, `partialize` and `merge`, with a version bump and a `migrate` arm seeding `[]` — following the same chain [Phase 55's `*Detached` flags](phase-55-multi-window-studio.md) used.
- [x] **A.4** Request/response schemas in `ipc/schemas.ts` and a small `apps` namespace on `ipc/bridge.ts` (mirroring the existing `window`/`browser` namespaces): `appsEnable`/`appsDisable` (construct/destroy the main-process view), `appsSetBounds` (flyout content region), reusing `window.detach`/`window.dock`/`window.focusRole` for the three new roles rather than inventing app-specific detach verbs.

### Theme B — Main-process apps service (M) ✅ DONE (PR #346, 2026-09-11)

- [x] **B.1** New [`packages/desktop/src/main/apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) *(new)*, structured like [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts): a `Map<AppId, { view: WebContentsView; win: BrowserWindow }>`, one entry per *enabled* app. Each view is constructed with `partition: `persist:app-${id}`` — a dedicated partition per app, distinct from `persist:browser` and from each other, so a Spotify login can never read a Calendar cookie or a general browser tab's session.
- [x] **B.2** Reuse [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts)'s posture verbatim for every app view: deny-all `setPermissionRequestHandler`/`setPermissionCheckHandler`, `setWindowOpenHandler` denying popups (routing `http(s)` to `shell.openExternal` rather than opening a new tab, since these aren't general browsing surfaces), `will-navigate`/`will-redirect` restricted to `http(s)`. No preload, no bridge — same rule Phase 32 wrote for embedded views generally.
- [x] **B.3** New `apps-handlers.ts` IPC handlers: enabling an app constructs its view (if not already constructed) and shows it; disabling calls `view.webContents.session` cleanup of the *view* only — **the partition's on-disk session data is left untouched**, so re-enabling later restores the same logged-in state. This is what "persistent per-app session" means concretely: durability lives in Electron's session-partition store, not in the view instance's lifetime.
- [x] **B.4** Bounds sync for the flyout's active app, following [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts)'s pattern (`ResizeObserver` + window resize → `bridge().apps.setBounds`).

### Theme C — Rail + flyout UI (M) ✅ DONE (PR #347, 2026-09-11)

- [x] **C.1** Bottom-of-rail toggle row in [`app.tsx`](../../../packages/app/src/app.tsx)'s existing `footer` render-prop slot, alongside `RailLockButton`/Settings/`RailVersion` — one icon per enabled-or-enableable app. All three icons always render (`apps-rail-row.tsx`); a disabled one is inert (`aria-disabled`, no click handler) rather than absent, pointing at Settings.
- [x] **C.2** Brand marks via `react-icons/si` (`SiSpotify`, `SiGooglecalendar`, `SiYoutube`), added to the existing icon allow-list convention in [`components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts) behind a new `APP_ICON` map. `icon-names.test.ts` gained the `si` set entirely (it had none before this phase, despite `AGENT_ICONS` already importing eight).
- [x] **C.3** New flyout panel component (`apps-flyout-panel.tsx`): click-to-open, genuinely dismiss-on-click-away (a bespoke `pointerdown` listener — `useDismiss` only ever answers Escape, so it alone would not have delivered this), positioned at the content row's own left edge (an `absolute` sibling of `BrowserPane`'s overlay, not portalled/anchored like the generic `Popover`). Not a resizable `LayoutSizes` slot.
- [x] **C.4** The flyout shows whichever enabled app's rail icon was most recently clicked; clicking a different enabled app's icon swaps the flyout's active view via the new `apps.activate` IPC verb (nullable `id` — `null` hides every app in the window, which is what closing the flyout with nothing else taking its place sends). `activateApp` in `apps-service.ts` mirrors `activateBrowserTab`'s per-window visibility rule.

### Theme D — Independent detach per app (M) ✅ DONE (PR #347, 2026-09-11)

- [x] **D.1** Reuse [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts)'s `createRoleWindow` for the three new literal roles. Detaching an app reparents its `WebContentsView` from the flyout's host into its own popout window via the new `reparentAppView` (mirroring `reparentBrowserTabs`, but per-app-id) — zero reload, session and navigation state untouched.
- [x] **D.2** While an app is detached, its rail icon stops opening the flyout and instead calls `bridge().window.focusRole(role)`. Re-docking and "closed by its own traffic light re-docks" both go through `reparentAppView(..., { visible: false })` — hidden, not shown, since the main window's flyout may already have a different app active. `DetachedWindowFrame` needed **zero changes**: its existing non-merged-role fallback ("Re-dock {title}" → `window.dock`) already covers these three panel roles for free, since they were never added to its `MergedRole` union.
- [x] **D.3** Each app's own literal role (A.2) lets `apps-rail-shots.spec.ts` exercise Spotify's and Google Calendar's `DetachedRoot` content independently; two REAL simultaneous popouts stay a human pass (see "Not in this phase" below — same precedent as Phase 55 Theme F.3).

### Theme E — Settings on/off switches (S) ✅ DONE (PR #347, 2026-09-11)

- [x] **E.1** A new dedicated "Apps" settings page (`apps-page.tsx`) listing the three apps with enable/disable toggles, per the phase doc's own recommendation below. Disabling an app tears down its `WebContentsView` (via `use-apps-sync.ts`'s `enabledApps` reconciliation calling `apps.disable`) and disables its rail icon; the on-disk partition is untouched, so re-enabling picks the same session back up. This is what let `enabledApps` leave `persisted-keys.ts`'s `KNOWN_ORPHANS` allow-list and `outstanding.md`.

---

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/apps.ts`](../../../packages/shared/src/domain/apps.ts) *(new)*; [`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) — 3 new `PANEL_WINDOW_ROLES` literals; [`shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) — barrel entry; `shared/src/ipc/schemas.ts` / `shared/src/ipc/bridge.ts` — `apps` namespace |
| Main | [`desktop/src/main/apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) *(new)*; `desktop/src/main/ipc/apps-handlers.ts` *(new)*; [`desktop/src/main/browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (reused, unchanged); [`desktop/src/main/window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) (reused for the 3 new roles) |
| Renderer — rail/flyout | [`app/src/app.tsx`](../../../packages/app/src/app.tsx) — footer slot + content row wiring; new `features/apps/{app-pane,apps-rail-row,apps-flyout-panel,use-apps-sync}.tsx`; [`app/src/components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts) — `APP_ICON` map (3 `Si*` allow-list entries); [`app/src/detached-root.tsx`](../../../packages/app/src/detached-root.tsx) — real `AppPane` content |
| Renderer — state | [`app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `enabledApps` (Theme A), `detachedApps`/`appsFlyoutAppId` (Theme C/D); [`app/src/services/use-window-sync.ts`](../../../packages/app/src/services/use-window-sync.ts) — `detachedApps` reconciliation |
| Settings | new [`apps-page.tsx`](../../../packages/app/src/features/settings/settings-pages/apps-page.tsx); `domain/view.ts`'s `apps` `SettingsPageId`; `nav-icons.ts`; `settings-view.tsx` registration |
| Tests | `apps-service.test.ts`, `window-manager.test.ts` (extended); `apps-rail-row.test.tsx`, `apps-flyout-panel.test.tsx` (new); icon allow-list test extension; `apps-rail-shots.spec.ts` (`MSTUDIO_SHOTS`) |
| Docs | this file; `.midnite/tasks/_INDEX.md`; `.midnite/tasks/done.md`; `.midnite/tasks/outstanding.md` (`enabledApps` orphan removed) |

---

## Verification

- [x] `moon run :typecheck :lint :test` green across all monorepo packages.
- [x] `apps-service.test.ts`: enabling an app creates exactly one `WebContentsView` with partition `persist:app-<id>`; disabling destroys the view; a disable→enable round trip against a tmp `userData` dir preserves session data (cookies/localStorage survive). *(PR #346 — the round trip is asserted against a faked `session.fromPartition`, not a real tmp `userData` dir, matching `browser-service.test.ts`'s own fake-Electron style.)* Extended in PR #347 with `activateApp`'s per-window visibility switching (including the nullable-id "hide all" case) and `reparentAppView`'s move + explicit-visibility behavior.
- [x] Clicking an enabled app's rail icon opens the flyout showing that app; clicking a second enabled app's icon swaps the flyout's active view without a reload. Covered by `apps-rail-row.test.tsx`/`apps-flyout-panel.test.tsx` (unit) and `apps-rail-shots.spec.ts` (e2e).
- [ ] **Open, for a human:** detaching Spotify and then Calendar produces two independent floating windows, both visible at once; re-docking one leaves the other detached. Same carve-out Phase 55 Theme F.3 already established (a mocked single-tab e2e run cannot launch two real `BrowserWindow`s) — `apps-rail-shots.spec.ts` instead renders each app's `DetachedRoot` standalone.
- [x] Detaching an app reparents its view with zero reload — `reparentAppView` never calls `loadURL` or re-registers `setWindowOpenHandler`, asserted in `apps-service.test.ts`.
- [x] Icon allow-list test passes with `SiSpotify`/`SiGooglecalendar`/`SiYoutube` added, each resolving to a real `react-icons/si` export — `icon-names.test.ts` gained the `si` set entirely to do it.
- [x] Disabling an app in Settings removes/disables its rail icon and tears down its view; re-enabling restores the same logged-in session. `apps-page.tsx` + `use-apps-sync.ts`, covered by `apps-rail-row.test.tsx`'s auto-close-on-disable case.
- [x] `MSTUDIO_SHOTS=1` screenshots: rail row (light/dark, plus disabled) with all three icons, flyout open on one app and switched to a second, and each detachable app's popout content standalone — committed under `docs/screenshots/phase-83-apps-rail/`.
- [ ] **Open, for a human:** confirm no embedded app view ever receives `window.midniteStudio` (no preload) — verified the same way `browser-service.test.ts` asserts it for the browser. `enableApp`'s `sandbox: true`/no-`preload` construction is asserted in `apps-service.test.ts` (Theme A/B), but a live manual check against a real Electron window is still outstanding.

---

## Not in this phase

- **Per-app log-out / session-reset UI.** MVP persists the partition; clearing a stuck or wrong login is a manual workaround (deleting the partition's on-disk folder) until a fast-follow phase adds a formal reset action.
- **A generic app-registry framework for arbitrary/custom apps.** Three apps are hardcoded via `AppDefinitionSchema` entries; a user-configurable "add your own app by URL" surface is future scope.
- **Docked simultaneous multi-app display.** The flyout shows one app at a time, selected by rail icon; a split or tiled docked view is out of scope.
- **Automated multi-window verification.** Same precedent as [Phase 55 Theme F.3](phase-55-multi-window-studio.md): the e2e suite runs against a mocked bridge and cannot launch real Electron windows, so the "two apps detached at once" behavior gets a human pass rather than a Playwright spec — `apps-rail-shots.spec.ts` instead renders each app's `DetachedRoot` standalone, mirroring `detached-panels-shots.spec.ts`'s own `POPOUT_ROLES` loop.

---

## Decisions / open questions

- **Resolved — fixed literal window roles per app** (`apps-spotify`, `apps-google-calendar`, `apps-youtube`) rather than a dynamic `apps:<id>` scheme. Only three apps are in scope; a literal enum keeps `WindowRoleSchema` a plain `z.enum` with no new parsing.
- **Resolved — brand marks via `react-icons/si`**, added to the existing icon allow-list convention, with a local traced-SVG fallback only if a mark is missing or its default colour fights the rail's monochrome treatment.
- **Resolved — the panel is a dismiss-on-click-away flyout**, not a persistent resizable layout slot like the repos sidebar. No new `LayoutSizes` field.
- **Resolved — the docked flyout shows one app at a time**, switched by clicking that app's rail icon; no separate tab strip inside the flyout.
- **Resolved — session persistence per app is in scope**; per-app logout/reset UI is deferred.
- **Resolved — multiple apps may be detached into independent floating windows simultaneously**, via one literal role per app rather than a single shared `apps` role.
- **Resolved — Settings location for the on/off switches: a new dedicated "Apps" page** (Theme E), per this doc's own recommendation — Settings is already split into topic pages (Phase 16), and three toggles plus room for future apps warranted their own page rather than crowding an existing one.
- **Resolved — `apps.activate`'s `id` is nullable rather than a second IPC verb.** Theme C needs a way to hide every app in a window when the flyout closes with nothing else taking its place, which B.3's original two-verb (`enable`/`disable`) design had no room for (disabling tears the whole view down). Reusing `activate` with `id: null` — rather than adding `apps.deactivateAll` — keeps "only one view visible per window" as a single primitive with one degenerate case, instead of two verbs that could disagree about which app is on top.
- **Resolved — the flyout's click-away dismissal is a bespoke `pointerdown` listener, not `useDismiss`.** `useDismiss` (`use-dismiss.ts`) only ever answers the Escape key — a fact easy to miss since its name reads more generally — so C.3's own "dismiss-on-click-away" wording needed the same `pointerdown`-on-`window` pattern `Popover` already uses, with rail icons excluded from it so a click on a different enabled app's icon switches the flyout rather than racing a close against `apps-rail-row.tsx`'s own `onClick`.
