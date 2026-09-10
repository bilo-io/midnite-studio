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

### Theme C — Rail + flyout UI (M)

- [ ] **C.1** Bottom-of-rail toggle row in [`app.tsx`](../../../packages/app/src/app.tsx)'s existing `footer` render-prop slot, alongside `RailLockButton`/Settings/`RailVersion` — one icon per enabled-or-enableable app.
- [ ] **C.2** Brand marks via `react-icons/si` (`SiSpotify`, `SiGooglecalendar`, `SiYoutube`), added to the existing icon allow-list convention in [`components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts) (the same pattern that allow-lists `SiAnthropic`/`SiCline`/etc. rather than importing the `react-icons` root barrel). Fall back to a local traced SVG (following `midnite-icon.tsx`'s pattern) only if a mark is missing from Simple Icons or its shipped brand colour fights the rail's monochrome `currentColor` treatment.
- [ ] **C.3** New flyout panel component: click-to-open, dismiss-on-click-away, positioned to the left of the (open-or-closed) repos sidebar. It is **not** a resizable `LayoutSizes` slot — no new entry there.
- [ ] **C.4** The flyout shows whichever enabled app's rail icon was most recently clicked; clicking a different enabled app's icon swaps the flyout's active view. There is no separate tab strip inside the flyout — the rail icons themselves are the switcher, following the same `setVisible`-per-view toggle `activateBrowserTab` already does, scoped to `apps-service.ts`'s own map.

### Theme D — Independent detach per app (M)

- [ ] **D.1** Reuse [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts)'s `createRoleWindow` for the three new literal roles. Detaching an app reparents its `WebContentsView` from the flyout's host into its own popout window via the same `removeChildView`/`addChildView` move [Phase 55 Theme D](phase-55-multi-window-studio.md) established for the browser — zero reload, session and navigation state untouched.
- [ ] **D.2** While an app is detached, its rail icon stops opening the flyout and instead calls `bridge().window.focusRole(role)` — a taskbar-style "bring to front" rather than a redundant second view. Re-docking (via a small affordance on the popout, styled like the existing detach glyph) or closing the popout via its own titlebar returns the app to flyout-availability, mirroring Phase 55's "closed by its own traffic light re-docks" rule.
- [ ] **D.3** Because each app owns its own literal role (A.2), multiple apps can be detached into independent floating windows at the same time — Spotify and Calendar can each be their own window simultaneously. This is the one place this phase's window-role modeling diverges from Phase 55's fixed single-panel-per-role pattern, and A.2's "one literal role per app" choice is what makes it fall out for free rather than needing new multi-instance-per-role plumbing.

### Theme E — Settings on/off switches (S)

- [ ] **E.1** A small Settings section listing the three apps with enable/disable toggles. Disabling an app tears down its `WebContentsView` (B.3) and removes/disables its rail icon; the on-disk partition is untouched, so re-enabling picks the same session back up.

---

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/apps.ts`](../../../packages/shared/src/domain/apps.ts) *(new)*; [`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) — 3 new `PANEL_WINDOW_ROLES` literals; [`shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) — barrel entry; `shared/src/ipc/schemas.ts` / `shared/src/ipc/bridge.ts` — `apps` namespace |
| Main | [`desktop/src/main/apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) *(new)*; `desktop/src/main/ipc/apps-handlers.ts` *(new)*; [`desktop/src/main/browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (reused, unchanged); [`desktop/src/main/window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) (reused for the 3 new roles) |
| Renderer — rail/flyout | [`app/src/app.tsx`](../../../packages/app/src/app.tsx) — footer slot toggle row; new apps-flyout component; [`app/src/components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts) — 3 `Si*` allow-list entries |
| Renderer — state | [`app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `enabledApps`, migrate arm; new bounds-sync hook alongside [`app/src/features/browser/use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) |
| Settings | new Apps settings section/page |
| Tests | `apps-service.test.ts`; icon allow-list test extension; `MSTUDIO_SHOTS` screenshot spec |
| Docs | this file; `.midnite/tasks/_INDEX.md` |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green across all monorepo packages.
- [x] `apps-service.test.ts`: enabling an app creates exactly one `WebContentsView` with partition `persist:app-<id>`; disabling destroys the view; a disable→enable round trip against a tmp `userData` dir preserves session data (cookies/localStorage survive). *(PR #346 — the round trip is asserted against a faked `session.fromPartition`, not a real tmp `userData` dir, matching `browser-service.test.ts`'s own fake-Electron style.)*
- [ ] Clicking an enabled app's rail icon opens the flyout showing that app; clicking a second enabled app's icon swaps the flyout's active view without a reload.
- [ ] Detaching Spotify and then Calendar produces two independent floating windows, both visible at once; re-docking one leaves the other detached.
- [ ] Detaching an app reparents its view with zero reload — `webContents.getURL()` and navigation history are identical immediately before and after.
- [ ] Icon allow-list test passes with `SiSpotify`/`SiGooglecalendar`/`SiYoutube` added, each resolving to a real `react-icons/si` export.
- [ ] Disabling an app in Settings removes/disables its rail icon and tears down its view; re-enabling restores the same logged-in session.
- [ ] `MSTUDIO_SHOTS=1` screenshots: rail row (light/dark) with all three icons, flyout open on one app, two apps detached into separate windows.
- [ ] **Open, for a human:** confirm no embedded app view ever receives `window.midniteStudio` (no preload) — verified the same way `browser-service.test.ts` asserts it for the browser.

---

## Not in this phase

- **Per-app log-out / session-reset UI.** MVP persists the partition; clearing a stuck or wrong login is a manual workaround (deleting the partition's on-disk folder) until a fast-follow phase adds a formal reset action.
- **A generic app-registry framework for arbitrary/custom apps.** Three apps are hardcoded via `AppDefinitionSchema` entries; a user-configurable "add your own app by URL" surface is future scope.
- **Docked simultaneous multi-app display.** The flyout shows one app at a time, selected by rail icon; a split or tiled docked view is out of scope.
- **Automated multi-window verification.** Same precedent as [Phase 55 Theme F.3](phase-55-multi-window-studio.md): the e2e suite runs against a mocked bridge and cannot launch real Electron windows, so the "two apps detached at once" behavior gets a human pass rather than a Playwright spec.

---

## Decisions / open questions

- **Resolved — fixed literal window roles per app** (`apps-spotify`, `apps-google-calendar`, `apps-youtube`) rather than a dynamic `apps:<id>` scheme. Only three apps are in scope; a literal enum keeps `WindowRoleSchema` a plain `z.enum` with no new parsing.
- **Resolved — brand marks via `react-icons/si`**, added to the existing icon allow-list convention, with a local traced-SVG fallback only if a mark is missing or its default colour fights the rail's monochrome treatment.
- **Resolved — the panel is a dismiss-on-click-away flyout**, not a persistent resizable layout slot like the repos sidebar. No new `LayoutSizes` field.
- **Resolved — the docked flyout shows one app at a time**, switched by clicking that app's rail icon; no separate tab strip inside the flyout.
- **Resolved — session persistence per app is in scope**; per-app logout/reset UI is deferred.
- **Resolved — multiple apps may be detached into independent floating windows simultaneously**, via one literal role per app rather than a single shared `apps` role.
- **Open — exact Settings location for the on/off switches** (a new dedicated "Apps" settings page vs. a section folded into an existing page). *Recommendation:* a new dedicated page — Settings is already split into topic pages (Phase 16), and three toggles plus room for future apps warrant their own page rather than crowding an existing one.
