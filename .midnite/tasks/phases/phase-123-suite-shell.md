# Phase 123 — One shell for every suite app

**Planned** (`/midnite-ideate` house style, from a session request) · 2026-10-29

Studio is the only suite app that looks like Midnite. Its window is frameless
([`window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts): `titleBarStyle: 'hidden'`,
inset traffic lights) and its renderer draws `TitleBar` and `AppFrame` — the custom title bar and the
side nav — from `@bilo-io/shell` ([`app.tsx`](../../../packages/app/src/app.tsx)). Under them sit the
terminal (`Ctrl+``), the companion, and the FAB with its Loops panel (`Mod+l`), all reached by the chords in
[`keybindings.ts`](../../../packages/shared/src/keybindings.ts).

Every extracted app (`apps/<id>`, Phase 113) opens a plain window with the native frame
(e.g. [`apps/vanguard/main/index.ts`](../../../apps/vanguard/main/index.ts) `openWindow`) and renders one
view inside `FrameChromeProvider` — no title bar, no nav, no logo, no terminal, no companion, no FAB, and
none of the chords. The launcher's logo for each app (the midnite moon in the app's accent with its glyph,
[`apps/launcher/src/renderer/assets/app-logos/`](../../../apps/launcher/src/renderer/assets/app-logos/),
written by [`generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs)) already
reaches each app's Dock icon through [`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs), but
never the window.

Studio also has a status bar along the bottom
([`features/status-bar`](../../../packages/app/src/features/status-bar/status-bar.tsx): panel toggles,
palette, notifications, update pill, liveness), a system monitor core behind it (the monitor feature's
metrics and system health in [`packages/features/monitor/main`](../../../packages/features/monitor/main/),
surfaced as the status bar's monitor flyout), and Settings pinned at the bottom of the side nav. The
extracted apps have none of these either.

This phase gives every suite app the same shell as Studio: the frameless window and custom title bar, a
side nav over that app's own views with Settings at its foot, the launcher's exact logo in the window, the
status bar with the system monitor core behind it, and the terminal, companion and FAB/Loops panels behind
the same chords. Studio then wears the same shell as its siblings rather than owning a private copy of it.

Scope guardrails:
- **The layer rule holds.** An app may not import `packages/app` or another app, and the launcher stays
  off the graph (CLAUDE.md, Phase 113). Everything shared lands in `packages/frame` (renderer),
  `packages/runtime` (main) or a `packages/features/<name>` package, and Studio consumes it from there too.
- **Same chords, one registry.** The panels answer to the `CommandId`s already in `COMMANDS` —
  `terminal.toggle` (`Ctrl+``), `terminal.toggleHalfMaximized` (`Ctrl+Shift+``), `terminal.new`
  (`Mod+t`), `terminal.close` (`Mod+w`), `fab.toggle` (`Mod+l`), `companion.toggle`, `panel.back` /
  `panel.forward`, `app.reload` / `app.hardReload`, `app.lock`. No app defines a chord literal, and
  `GLOBAL_CHORDS` / `TERMINAL_YIELD_COMMANDS` behave in every app as they do in Studio.
- **One logo source.** The launcher's 1024 px masters stay the only source; nothing hand-copies a PNG.
- **Opt-in per app, on by default.** Each app's manifest declares which panels it carries (an app with no
  repos may still want a terminal; a kiosk-like one may want none). The shell itself is not optional.
- **No visual change to Studio** beyond what moving onto the shared shell forces; its baselines are the
  regression net.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A, B and C are independent and land
> first. D needs B. E, F, G, J, K and L each need B (E–G and J also D) and are independent of one
> another. H needs A–D and whichever of E–G and J–L it rolls out. I closes the phase. Suggested swarm:
> A+C, then B, then D+L, then E+J, then F+K, then G, then H, then I.

## Open decisions (resolve in `/midnite-refine` before E–G and J–L)

1. **Terminal sessions across apps.** All apps attach to the same pty broker (runtime `broker/client.ts`).
   Default proposed: each app lists only the sessions it created (sessions tagged with the creating
   `AppId`), with a "show all" toggle; Studio keeps listing everything.
2. **Companion scope.** One conversation per app, or one shared companion that knows which app it is in?
   Default proposed: one companion store per app, sharing settings and voice.
3. **Loops ledger.** Loops run in whichever app started them; the run ledger (`loop-runs.ts`) moves to the
   runtime and is shared, so a loop started in Vanguard shows in Studio's history. Default proposed: shared.
4. **Nav content for single-view apps.** An app with one view gets a nav of its own tabs (Vanguard:
   sensors, findings) rather than a one-item rail; Settings always sits at the foot (Theme L), so no
   app's rail is ever a single item. Default proposed: yes.
5. **Status bar segments per app.** Which of Studio's segments are suite-wide (panel toggles, palette,
   notifications, update pill, monitor) and which stay Studio's (repo/worktree, checks and test verdicts,
   automate chip, MCP indicator). Default proposed: as listed; an app adds its own through a slot.
6. **Settings that are shared vs per app.** Appearance, motion, chords, privacy switches and panels are
   suite-wide and stored once; each app adds its own pages. Default proposed: shared pages read and write
   the same store in every app, so a theme change in one shows in all on next focus.

## Headlines

**Theme A — A frameless window for every app.** ◻ A runtime helper opens the suite window frameless with
Studio's traffic-light inset, and the bridge reports `frameless` so the title bar draws itself.

**Theme B — The shared shell.** ◻ `AppShell` in the frame: `TitleBar` + `AppFrame` + the app's logo and
name, a nav built from the app's manifest, and named slots for the panels and the footer.

**Theme C — The launcher's logo, in the window.** ◻ `generate-app-logos.cjs` also writes the logos where
the frame can import them; the shell's brand mark is that file.

**Theme D — The chords, everywhere.** ◻ The command dispatcher moves out of Studio into the frame, so
every app dispatches the shared `COMMANDS` subset with the same scopes and terminal-yield rules.

**Theme E — The terminal panel as a feature.** ◻ `packages/features/terminal`: the dock, sessions and
xterm view out of `packages/app`, over the runtime broker client.

**Theme F — The companion panel as a feature.** ◻ `packages/features/companion`: the panel, orb and
thread out of `packages/app`, its main half out of `packages/desktop/src/main/companion`.

**Theme G — The FAB and Loops as a feature.** ◻ `packages/features/loops`: the FAB, the quick-access menu,
the Loops panel and composer, with the run ledger in the runtime.

**Theme H — Every app on the shell.** ◻ The thirteen extracted apps adopt `AppShell` with their own nav,
Settings, status bar and chosen panels; Studio moves onto it last.

**Theme I — Proof.** ◻ Per-app shell tests, chord e2e in two non-Studio apps, and visual baselines for
the shell.

**Theme J — The status bar.** ◻ Studio's footer moves into the frame as a segment host; suite-wide
segments ship with it, Studio's repo-bound segments stay Studio's through a slot.

**Theme K — The system monitor core.** ◻ Every app composes the monitor feature's main half (system
health and metrics sampling) and its flyout; the status bar's monitor segment reads it in every app.

**Theme L — Settings at the foot of the nav.** ◻ Every app's rail ends in a pinned Settings entry that
opens the frame's settings view: the suite-wide pages plus the app's own.

## Deliverables

### A — A frameless window for every app [M · half-day]

- [ ] **The window helper.** `packages/runtime/src/app-main/suite-window.ts`: `createSuiteWindow(options)`
  returns a `BrowserWindow` with `titleBarStyle: 'hidden'` and Studio's `TRAFFIC_LIGHT_POSITION`, moved
  from `packages/desktop/src/main/window-chrome.ts` (which then re-exports it). Keeps `sandbox`,
  `contextIsolation` and `guardAppWindow` exactly as each app has them today.
- [ ] **The bridge flag.** Each app's bridge slice reports `frameless: true` the way Studio's does, so
  `TitleBar` renders (it renders nothing on a framed window).
- [ ] **Full-screen and double-click.** Double-clicking the drag region zooms per the system setting;
  entering full screen drops the inset, as Studio does today.
- [ ] **Tests.** `suite-window.test.ts` asserts the options; one app's main test asserts it uses the helper.

### B — The shared shell [M · ~1d]

- [ ] **`AppShell`.** `packages/frame/src/shell/app-shell.tsx`: wraps `ShellProviders`, `TitleBar` and
  `AppFrame` from `@bilo-io/shell` with the app's logo, name and accent, and renders `children` in the
  view slot. The view slot stays `overflow-hidden` and each view owns its scroll (the rule the
  2026-10-28 scroll fixes relied on).
- [ ] **Nav from the manifest.** Each app's `<id>-manifest.ts` gains `nav: NavConfig` (views, icons from
  `react-icons`, optional chords via `nav-chords`-style `CommandId` mapping). One-item navs hide the rail.
- [ ] **Panel slots.** `AppShell` takes `panels: { terminal?, companion?, fab? }` components and a
  `footer` slot (Theme J's status bar), so a feature supplies a panel without the frame importing it.
- [ ] **Studio's title-bar extras stay Studio's.** `TitleBarPrimaryAgent`, `TitleBarAgents`,
  `TitleBarOllama` go in a `titleBarEnd` slot only Studio fills.
- [ ] **Tests.** `app-shell.test.tsx`: renders the logo, name and nav; keeps Settings at the rail's foot;
  renders only the panels and footer it is given.

### C — The launcher's logo, in the window [S · ≤ 2h]

- [ ] **One more output.** `generate-app-logos.cjs` also writes `packages/frame/src/shell/app-logos/<id>.png`
  (a 256 px copy of each master), alongside the launcher's assets and the `icon.icns` files.
- [ ] **The lookup.** `appLogoUrl(id: AppId)` in the frame (an `import.meta.glob`, like the launcher's
  `app-icon.tsx`).
- [ ] **A drift check.** A test asserts every `AppId` in the catalogue has a logo in the frame and that it
  is byte-identical to the launcher's (hash compare), so a regenerate that skips one fails.

### D — The chords, everywhere [M · ~1d]

- [ ] **The dispatcher in the frame.** Studio's keymap dispatcher (the hook `app.tsx` mounts over
  `DEFAULT_KEYMAP`) moves to `packages/frame/src/commands/`, taking a `Partial<Record<CommandId, handler>>`
  so each app binds only what it has.
- [ ] **The suite subset.** `SUITE_COMMANDS` in `keybindings.ts`: the ids every app shell can bind
  (`terminal.*`, `fab.toggle`, `companion.toggle`, `notes.toggle`, `panel.back`/`panel.forward`,
  `app.reload`/`app.hardReload`, `app.lock`, `palette.open`). Derived from `COMMANDS`, never a second table.
- [ ] **Terminal yield.** `GLOBAL_CHORDS` and `TERMINAL_YIELD_COMMANDS` apply in every app exactly as in
  Studio (`Ctrl+`` and `Mod+k` escape the terminal; `Mod+l` yields to the shell's clear-screen off macOS).
- [ ] **Tests.** The dispatcher's existing tests move with it; one app-level test fires `Ctrl+`` and
  `Mod+l` in a non-Studio app's shell.

### E — The terminal panel as a feature [L · 1–2d]

- [ ] **Extract.** `packages/app/src/features/terminal` → `packages/features/terminal/renderer`; its
  main half (`terminal-service.ts`, `pty-service.ts`, `pty-env.ts` in `packages/desktop/src/main`) →
  `packages/features/terminal/main` over the runtime's broker client. Listed in
  `apps/studio/src/composition.ts`.
- [ ] **Per-app sessions.** Per open decision 1: sessions carry the creating `AppId`; each app lists its own
  by default.
- [ ] **Unload and rehydrate.** Phase 84 E's visible + 3 recent mounted rule comes with it unchanged.
- [ ] **Tests.** The existing terminal tests move; one app outside Studio mounts the panel against the
  mock bridge.

### F — The companion panel as a feature [L · 1–2d]

- [ ] **Extract.** `packages/app/src/features/companion` → `packages/features/companion/renderer`;
  `packages/desktop/src/main/companion` → `packages/features/companion/main`.
- [ ] **Per-app context.** Per open decision 2: the companion knows the app it is in (for deep links,
  Phase 112) and keeps its own thread per app.
- [ ] **Tests.** The existing companion tests move; one app outside Studio opens the panel.

### G — The FAB and Loops as a feature [L · 1–2d]

- [ ] **Extract.** The FAB, quick-access menu and Loops panel/composer (`packages/app/src/features/loops`,
  `quick-access`) → `packages/features/loops/renderer`; `loop-runs.ts` / `loop-runs-store.ts` →
  the runtime (shared ledger, open decision 3).
- [ ] **The menu's leaves.** Loops, Notes and the disabled future leaves keep their one-letter mnemonics
  after `Mod+l`; a leaf whose feature an app does not carry is hidden, not disabled.
- [ ] **Tests.** The existing FAB/Loops tests move; one app outside Studio opens the FAB and the Loops panel.

### H — Every app on the shell [L · 1–2d]

- [ ] **Roll-out.** `agents`, `browser`, `capture`, `cleaner`, `coder`, `creator`, `gamer`, `media`, `mind`,
  `money`, `monitor`, `vanguard`, `vault` each render `AppShell` with their manifest's nav, Settings at
  its foot, the status bar with the monitor segment, and their chosen panels, and open their window
  through `createSuiteWindow`.
- [ ] **Studio last.** `packages/app` renders the same `AppShell`, with its extras in `titleBarEnd`.
- [ ] **Screenshots.** One shot per app of the shell (repos panel closed), committed under
  `docs/screenshots/phase-123/` and embedded in the PR.

### I — Proof [M · ~1d]

- [ ] **e2e.** In two non-Studio apps: the title bar drags, `Ctrl+`` opens the terminal, `Mod+l` opens the
  FAB, `Mod+l` then `L` opens Loops. The e2e cap in `scripts/e2e-budget.mjs` and its pinned test move together.
- [ ] **Visual.** One locator-cropped baseline of the shell per app family, inside the visual budget.
- [ ] **Docs.** `docs/APPS.md` gains the shell: what an app gets for free and how it opts panels in or out.

### J — The status bar [M · ~1d]

- [ ] **A segment host in the frame.** `packages/app/src/features/status-bar/status-bar.tsx` and
  `segments.ts` move to `packages/frame/src/shell/status-bar/`; the bar renders an ordered list of
  segments from `AppShell`'s `footer` prop rather than a fixed set.
- [ ] **Suite-wide segments.** Panel toggles (`terminal-toggle`, companion, FAB), palette, notification
  bell, update pill and liveness ship with the frame and render in every app. Per open decision 5.
- [ ] **Studio's segments stay Studio's.** Repo/worktree, checks and test verdicts, the automate chip and
  the MCP indicator are passed in by `packages/app` through the same prop; no other app imports them.
- [ ] **Tests.** The existing status-bar tests move; `status-bar.test.tsx` asserts a non-Studio app renders
  only the suite segments plus the ones it passes.

### K — The system monitor core [M · ~1d]

- [ ] **Sampling in every app.** Each app composes `packages/features/monitor` and its main registers the
  feature's `main/system-health.ts` and `main/metrics` sampler (apps compose features, so nothing moves
  to the runtime), sampling only while a window is visible (the Phase 84 visibility gates).
- [ ] **One channel set.** The existing `mstudio:system:health` and `mstudio:metrics:*` channels are served
  by each app's main from that service; agent usage and token spend stay Studio-only.
- [ ] **The segment and flyout.** A monitor segment (CPU, memory, sparkline) joins the suite segments in
  Theme J and opens `monitor-flyout.tsx` with `system-health-section` and `capacity-section`; the
  Studio-only sections render only where their data exists.
- [ ] **Tests.** `system-health.test.ts` moves with the sampler; one app outside Studio renders the segment
  and opens the flyout against a mocked bridge.

### L — Settings at the foot of the nav [M · ~1d]

- [ ] **The pinned entry.** `AppShell`'s rail always ends in a Settings item (`LuSettings`), below the
  manifest's views, opening the app's settings view; a new `view.settings` command in `COMMANDS`
  (chord `Mod+,`, part of `SUITE_COMMANDS`) opens it in every app.
- [ ] **The settings view in the frame.** `settings-view.tsx` and its page layout move to
  `packages/frame/src/settings/`, beside `settings-section.tsx` and `settings-sections.ts`; an app passes
  its own pages through its manifest (`settings: SettingsPage[]`).
- [ ] **Shared pages, one store.** Appearance, motion, chords, privacy switches and panels are suite-wide
  pages reading and writing the same store in every app. Per open decision 6.
- [ ] **Tests.** The settings tests move; one app outside Studio shows the shared pages plus its own.
