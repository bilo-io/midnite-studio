# Phase 123 — One shell for every suite app

**Refined: x1** · 2026-10-29 · UI/UX, accessibility & keyboard, empty/loading/error states, visual design & theming, data model & contract, persistence & migration, functionality & edge cases, concurrency & cancellation, testing & verification, performance & scale, security & blast radius, observability, sequencing, file-map precision, out-of-scope tightening, per-item acceptance criteria

**Planned** (`/midnite-ideate` house style, from a session request) · 2026-10-29

Studio is the only suite app that looks like Midnite. Its window is frameless
([`window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts): `windowFrameless()` is
`process.platform === 'darwin'`, `TRAFFIC_LIGHT_POSITION = { x: 16, y: 13 }`, and `attachWindowChrome(win)`
pushes full-screen and focus changes to the renderer), the frameless flag reaches the renderer as a
`--mstudio-frameless=` launch argument (`WINDOW_FRAMELESS_ARG` in
[`channels.ts`](../../../packages/shared/src/ipc/channels.ts)) that the preload turns into the
`windowChrome: WindowChromeBridge` slice ([`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts)), and the
renderer draws `TitleBar` and `AppFrame` — the custom title bar and the side nav — from `@bilo-io/shell`
([`app.tsx`](../../../packages/app/src/app.tsx)). Settings sits in that nav's `footer` slot. Under them sit
the terminal (`Ctrl+``), the companion, and the FAB with its quick-access menu and Loops panel (`Mod+l`), all
reached through `useKeybindings` over the chords in
[`keybindings.ts`](../../../packages/shared/src/keybindings.ts). Along the bottom runs the status bar
([`status-bar.tsx`](../../../packages/app/src/features/status-bar/status-bar.tsx), a data-driven
`STATUS_SEGMENTS` list), whose monitor segment opens the monitor feature's flyout.

Every extracted app (`apps/<id>`, Phase 113) opens a plain framed `BrowserWindow`
(e.g. [`apps/vanguard/main/index.ts`](../../../apps/vanguard/main/index.ts) `openWindow`) and renders one
view inside `FrameChromeProvider` — no title bar, no nav, no logo, no status bar, no terminal, no companion,
no FAB, none of the chords, and (except Mind and Cleaner) no settings. Neither `packages/frame` nor any app
depends on `@bilo-io/shell` today. The launcher's logo for each app
([`apps/launcher/src/renderer/assets/app-logos/`](../../../apps/launcher/src/renderer/assets/app-logos/),
written by [`generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs)) already
reaches each app's Dock icon through [`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs), but
never the window.

This phase gives every suite app the same shell as Studio: the frameless window and custom title bar, a
side nav over that app's own views with Settings at its foot, the launcher's exact logo in the window, the
status bar with the system monitor core behind it, and the terminal, companion and FAB/Loops panels behind
the same chords. Studio then wears the same shell as its siblings rather than owning a private copy of it.

Scope guardrails:
- **The layer rule holds.** An app may not import `packages/app` or another app, a feature may not import
  another feature, the frame never imports a feature, the runtime imports no `electron`, and the launcher
  stays off the graph (CLAUDE.md, Phase 113, `eslint.config.mjs`'s `LAYER_OTHER_FEATURE`). Everything shared
  lands in `packages/frame` (renderer), `packages/runtime` (main), `packages/shared` (contract) or a
  `packages/features/<name>` package. **Where a feature needs another feature, it declares a host port**
  (the [`notes/renderer/host.tsx`](../../../packages/features/notes/renderer/host.tsx) pattern) and the
  composer fills it — never an eslint exception.
- **Same chords, one registry.** The panels answer to the `CommandId`s in `COMMANDS` — `terminal.toggle`
  (`Ctrl+``), `terminal.toggleHalfMaximized` (`Ctrl+Shift+``), `terminal.new` (`Mod+t`), `terminal.close`
  (`Mod+w`), `fab.toggle` (`Mod+l`), `companion.toggle`, `notes.toggle`, `panel.back` / `panel.forward`,
  `palette.open` (`Mod+k`), `app.reload` / `app.hardReload`, `app.lock`, and the new `view.settings`
  (`Mod+,`). No app defines a chord literal, and `GLOBAL_CHORDS` / `TERMINAL_YIELD_COMMANDS` behave in every
  app as they do in Studio.
- **One logo source.** The launcher's 1024 px masters stay the only source; nothing hand-copies a PNG.
- **Opt-out per app, on by default.** Every app carries every panel unless its manifest sets
  `panels: { <name>: false }`. The shell itself is not optional.
- **No visual change to Studio** beyond what moving onto the shared shell forces; its visual baselines are
  the regression net and must not move.
- **Suite-wide state lives in the runtime, not in localStorage.** Each app has its own `userData` and its own
  renderer origin, so anything two apps must share (preferences, the loop ledger) is a file under
  `<appData>/Midnite Runtime/`, served by each app's main.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. F was re-tagged **L ×2** in the
> refinement (the whole companion moves behind a host port).
>
> **Sequencing.** A, C and the suite-prefs half of L (L.1) are independent and land first. B needs C.
> D needs B. J and the rest of L need B and D. K needs J. E needs B and D. G needs E (its `LoopsHost`
> fills from the terminal feature). F needs B and D and is independent of E and G. H needs A–D, J, K, L
> and whichever of E–G have landed, and rolls out in three PRs. I closes the phase.
> **A partial landing is safe at every step**: until H, nothing changes for any app but Studio, and each
> extraction (E, F, G) leaves Studio consuming the new package with the same behaviour.
> Suggested swarm (cap 2): **A+C → B+L.1 → D → E+J → F+K → G+L → H (×3) → I.**

## Headlines

**Theme A — A frameless window for every app.** ◐ PARTIAL (helpers landed, PR pending) `packages/runtime/src/app-main/suite-window.ts` exports
`suiteWindowOptions(platform)` and `attachWindowChrome(win, send)` over a structural window type (the runtime
never imports `electron`); each app spreads the options into its own `new BrowserWindow` and its preload
exposes the same `windowChrome` slice Studio's does. Landed: `suite-window.ts` (`suiteWindowOptions`, `windowFrameless`, `attachWindowChrome`, `toggleMaximize`, `TRAFFIC_LIGHT_POSITION`) and `window-chrome-preload.ts` (`createWindowChromeBridge`) in the runtime, with Studio's desktop `window-chrome.ts` and preload now thin callers of them (behaviour unchanged). `ChromeableWindow` also carries `isFocused`/`isDestroyed`, which the state push needs. **Left open:** no app's own `BrowserWindow` or preload adopts the options yet — a frameless window with no renderer-drawn title bar has no drag region, so wiring each app waits for Theme B/H (as does the double-click e2e and the per-app security assertion).

**Theme B — The shared shell.** ✅ `AppShell` in `packages/frame/src/shell/`: `ShellProviders` + `TitleBar` +
`AppFrame` from `@bilo-io/shell`, the app's logo and name, a nav built from the manifest's new `nav` field with
Settings in the footer, the app accent on the logo tile and active nav item only, and named slots for the
panels, the footer and Studio's title-bar extras. Landed (stacked on #1059): `app-shell.tsx`, `nav-config.ts`
(`NavConfig`, `NavView`, `ShellManifestFields`, `navConfigProblems`, `navChordFor`) and `view-link.tsx`
(`createViewLink`) with tests, and a `nav` field on all twelve existing app manifests (Creator, Gamer and Media
derive theirs from their media-tab descriptors). Surprises: `@bilo-io/shell` was already a frame dependency
(Phase 113), so no lockfile change; `IconComponent` already lived in the frame's `chrome/types.ts`, so
`nav-config.ts` re-exports it; and `frameContent` never scanned `@bilo-io/shell`'s dist, so an app rendering
`AppShell` drew the phone-width bottom tabs instead of the rail until the glob was added. Studio's own
`ViewLink`, `Tooltip` and `ThemeToggle` stay in `packages/app` — Studio passes them in at H, and the right
cluster is `@bilo-io/ui`'s `ThemeToggle` until J.4.

**Theme C — The launcher's logo, in the window.** ✅ The app-id list moves to `packages/shared` as
`SUITE_APP_IDS`; `generate-app-logos.cjs` also writes a 256 px copy per app into the frame, and a drift test
keeps it byte-identical to the launcher's. Landed: `suite-apps.ts` in shared (launcher `catalog.ts` takes it by source path; the launcher's Vite alias is now the same regex vitest already used), 19 PNGs in `packages/frame/src/shell/app-logos/` copied byte-for-byte from the launcher (`launcher.png` excluded) and written by `generate-app-logos.cjs` from now on, and `appLogoUrl`. The drift test compares Vite `?inline` data URLs rather than SHA-256 because the renderer may not import node builtins; equal strings mean equal bytes.

**Theme D — The chords, everywhere.** ✅ The dispatcher, the chord parser and the palette live in
`packages/frame/src/commands/`. `useKeybindings(runtime, gates?)` takes a `Partial` `CommandRuntime`: candidates
with no handler are dropped before the browser/terminal/rest resolution, so a chord that is not the app's reaches
the page un-`preventDefault`ed. What only Studio's window knows — the browser pane, and the quick-access menu and
two switcher HUDs that own the keyboard — comes in as `KeybindingGates` (`browserOpen`, `blocked`), which Studio's
`services/keybindings/use-keybindings.ts` binds as a module constant; its 40-odd tests stay there and pass
unchanged, and the frame has its own suite-app test. `SUITE_COMMANDS` (derived from `COMMANDS`) and
`view.settings` on `Mod+,` are in `shared/src/keybindings.ts`; Studio's handler is `setActiveView('settings')`,
companion access `never` like every `view.*`. The palette's store, scoring, frecency and rendering moved too
(`CommandPalette`, `createCommandSource`, `PaletteHost`): the command rows are every `COMMANDS` entry with a
handler, and Studio's `Palette` wraps the frame surface with its repo-bound sources, its palette-safe filter and
its dismissal stack. Surprise: the "Mod+t does not escape `.xterm`" check in the doc does not describe Studio —
`terminal.new` is not a yield command there, so the frame test proves the yield with `fab.toggle` (`Ctrl+L` off
macOS) instead of changing Studio.

**Theme E — The terminal panel as a feature.** ✅ 6/6 ([#1068](https://github.com/bilo-io/midnite-studio/pull/1068)).
`packages/features/terminal/renderer` now holds the panel, the session list, every xterm, the store, the unload
policy and the replay gate (27 test files moved with it), behind a `TerminalHost` port: panel layout and prefs,
font, repos, palette, link routing, a tooltip, popover and avatar slot, and three optional actions (configure an
agent, reveal a session, show its commits). Studio's adapter is `packages/app/src/compose/terminal-host.tsx`,
and the old `features/terminal/*` paths are re-export shims that bind each component to it, so no render site
changed. The default host sits in the feature, not the frame as the doc first placed it: the frame may not
import a feature, so it could not name the port's type. `use-reveal` and `use-now` moved to the frame. Studio's
glue (start-agent, submit-command, reveal-session, the switcher overlay) stays in the app — it drives Studio's
FAB and primary agent. Sessions carry an optional `appId` (absent = studio); only a non-Studio window stamps it,
so Studio's records are unchanged on disk. The list filters to its own app with a "Show all apps" toggle on
suite-prefs `terminal.showAllApps`, shown only once another app's session is present; until someone toggles it,
each app takes its host's default (Studio: all). A broker that never attached now says so in the empty panel.
E.3, the main half, is in: the session list's stores, `terminal-service`, `pty-env` and now `pty-service` live in
`packages/features/terminal/main`. The pty service reaches the main window, confinement, the secrets vault, the
broker client and the in-process pty through a `PtyPorts` object that desktop's `pty-service.ts` shim binds once
(`inproc-pty` and `node-pty` stay in desktop and arrive as `ports.inproc`). The pty IPC handlers moved into
`terminalMain.register`; `RuntimeIpc` gained an optional `sendFromSender` (the handler receives a structural
`RuntimeWindow`), which desktop binds to `handleSendFromSender` and the recording test context fakes.

**Theme F — The companion panel as a feature.** ✅ `packages/features/companion`: the renderer (orb, panel, thread,
voice, zen stage, the reveal engine; ~50 files and the store) and the main half (`desktop/src/main/companion`,
28 files) moved whole. Everything the companion reached into the app for is one typed member of
`CompanionHost` (`renderer/host.tsx`): the UI store handle, a revealer table and source list, the live
follow-up reads, the view/settings/command vocabulary, the terminal, the lock-screen kit and the chrome.
Studio fills it in `packages/app/src/compose/companion-host.tsx`, with the revealers, sources and live
follow-up reads (which read Studio's stores) in `compose/companion/`. Main takes `CompanionMainServices`
(dispatch, session counts, agents, safeStorage, utility fork, microphone access) and `companionMain =
defineFeatureMain` registers its 11 invoke and 2 send channels; process-runner and `confineToRoot` come from the
runtime. Deviations from the plan: the default host lives in the package (`renderer/default-host.tsx`), not the
frame, because the frame may not import a feature; revealers are a table keyed by resource kind (a kind the host
lacks answers "unavailable"), not a list. Module-level wiring (`conversation.ts`, `voice-ports.ts`) follows the
host through `onCompanionHostInstalled`, so importing the barrel reads no host (asserted by
`import-without-host.test.ts`). Settings and voice follow suite-prefs: `CompanionPrefsSchema` gained `voices`,
`sttEngine` and `sttProvider`. The store-vs-schema assertion moved to the Studio adapter.

**Theme G — The FAB and Loops as a feature.** ◻ `packages/features/loops`: the FAB, quick-access menu, Loops
panel and composer, reaching the terminal and companion only through `LoopsHost` slots. The run ledger moves
to the runtime as one file per app under `<appData>/Midnite Runtime/loop-runs/`, merged on read.

**Theme H — Every app on the shell.** ◻ The thirteen extracted apps adopt `AppShell` in three PRs of four or
five apps, each with its own nav, Settings, status bar and panels; Studio moves onto it last in its own PR.

**Theme I — Proof.** ◻ Playwright shell flows in Vanguard and Vault, one visual baseline per shell variant,
an idle-CPU number for a blurred suite app, and `docs/APPS.md`.

**Theme J — The status bar.** ✅ 4/4 ([#1068](https://github.com/bilo-io/midnite-studio/pull/1068), J.4 in this phase's follow-up).
`packages/frame/src/shell/status-bar/` is the segment host: `StatusBar({ segments, fab, liveRegions })`, the
separator grouping, per-zone density (`lib/density.ts` moved with it) and the overflow popover. Its tooltip and
popover come through an optional `StatusBarChromeProvider` — the default is a `title` and the frame's
`SimplePopover`; Studio installs its own, whose portalled popover is what lets a collapsed segment's label show
in the overflow panel. `suiteSegments(panels)` gives every app the five suite segments at Studio's zones and
priorities, dropping any whose panel is absent. The frame owns where each segment sits and the app passes the
component, because each one belongs to a feature (terminal, companion, monitor) the frame may not import; a
Studio test holds Studio's five entries to the same metadata. Studio's bar is a wrapper over the frame's, with
`STATUS_SEGMENTS` and its two live regions passed in, so it looks the same. The `.status-label` density CSS
still lives in Studio's `styles.css` — whichever app mounts the bar first in Theme H brings it along. J.4: the title
bar's right cluster (`TitleBarStatus`, `TitleBarBattery`, a frame `ThemeToggle`) is in `packages/frame/src/shell/titlebar/`
and `AppShell` renders it after `titleBarEnd`. Studio fills a `TitleBarHost` (metrics cadence, privacy switches) and
its portalled popover through `compose/titlebar-host.tsx`; the two bridge tests stayed in the app.

**Theme K — The system monitor core.** ✅ ([PR pending]) Every app registers the monitor feature's `monitorMain` and pauses
sampling on blur, hide and minimise exactly as `apps/monitor` does; the status bar's monitor segment opens
the metrics-only `MonitorFlyout`, whose "Open Monitor" hands off to the Monitor app. What landed: `bindMetricsToWindow(win, service)` in
`runtime/src/app-main/bind-metrics.ts` is the one pause/resume/stop rule, used by Studio's main
(replacing its local copy) and `apps/monitor`. The cluster is now `createMonitorSegment({ Flyout, openMonitor })`
in `frame/src/shell/status-bar/monitor/`, drawn through the status-bar chrome port; the flyout and the
hand-off are injected because the frame never imports a feature (Studio's wrapper is the unchanged
`features/monitor/monitor-cluster.tsx` export). `Sparkline` and `MetricDonut` moved to `frame/src/metrics/`
(the feature re-exports them). `hiddenMetrics` and `metricsIdleIntervalMs` left `ui-store` for the
`monitor` suite-prefs group (`useMonitorPrefsStore`), migrated once from the old `midnite-studio.ui` blob;
the settings page, battery segment and optimizer host read them from there. **Open for Theme H:** each
standalone app's own `monitorMain.register` and `bindMetricsToWindow` call lands with its roll-out — K ships
the helper, the segment and the prefs, not thirteen mains. No visual change, so no screenshots.

**Theme L — Settings at the foot of the nav.** ✅ A runtime `suite-prefs` file shared by every app holds
appearance, palette, motion, title-bar status and companion voice settings; the settings view lives in the
frame and shows the suite-wide pages plus each app's own. **L.1** (#1063): the contract in
`shared/src/suite-prefs.ts`, `createSuitePrefsService` in `runtime/src/suite-prefs/` (atomic writes,
read-merge-write per key, corrupt-file recovery, debounced watch), the `suitePrefsGet/Set/Changed` channels
and Studio's first-boot seed from localStorage. **L.2**: `appearance`, `activity-palette`, `palette` and
`titlebar-status` stores moved to `packages/frame/src/prefs/` (one-line re-exports at their old paths) and
persist through `suitePrefsStorage(key, version, fallback)` — read the group from the file, else the old
localStorage blob; write the group to the file only, dropping a write equal to what the file holds, which is
what stops `suitePrefsChanged` ping-ponging. `useAppearanceSync` subscribes to `suitePrefsChanged` and each
store re-hydrates its own group, so a theme change in one app shows in every open one. No bridge (vitest, a
plain browser) keeps the storage fully synchronous. The palette store is a factory
(`createPaletteStore<P>()`) because `StudioPalette`'s xterm/monaco types are the app's; the app instantiates
it. This ends the `activePaletteId` collision the seed worked around (two groups, two keys). **L.3**:
`SettingsView` takes `pages: SettingsPageDef[]` with every piece of state controllable (Studio keeps page,
folded groups and nav width in its ui-store; Studio's own list stays `SETTINGS_PAGES`), `SettingsGroupId`
and `SETTINGS_GROUPS` moved to the frame, `suiteSettingsPages()` builds the five suite pages plus a
read-only `ChordsPage` (rows straight from `COMMANDS`, `view.settings` shows `⌘,`), `appSettingsPages()`
resolves a manifest's `settings` ids and `settingsPageProblems()` is the assertion each app's test will make.
The chords page id is `'chords'`, outside `SettingsPageId` (that union is Studio's persisted-page registry).
**L.4**: each def carries `scope: 'suite' | 'app'`; a test asserts a suite page's write reaches suite-prefs
and not localStorage, and an app page's the reverse. **Open for Theme H:** the suite page *components*
(Appearance, Privacy, Terminal, Companion, Monitor) still live in `packages/app` and import feature code, so
the frame cannot supply them — H hands them to `suiteSettingsPages()` per app and fills each manifest's
`settings`. Verified in vitest (no visual change to Studio, so no screenshots).

## Deliverables

### A — A frameless window for every app [M · half-day]

- [x] **The window options.** Net-new `packages/runtime/src/app-main/suite-window.ts`, exported from the
  folder's [`index.ts`](../../../packages/runtime/src/app-main/index.ts):
  - `export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 13 } as const;` (moved from
    [`window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts), which re-exports it).
  - `export function windowFrameless(platform: NodeJS.Platform): boolean` → `platform === 'darwin'` (the
    desktop's zero-arg `windowFrameless()` becomes a one-line call to it).
  - `export function suiteWindowOptions(platform: NodeJS.Platform): { titleBarStyle?: 'hidden'; trafficLightPosition?: { x: number; y: number }; additionalArguments: string[] }`
    — on darwin `{ titleBarStyle: 'hidden', trafficLightPosition, additionalArguments: [WINDOW_FRAMELESS_ARG + '1'] }`,
    elsewhere `{ additionalArguments: [WINDOW_FRAMELESS_ARG + '0'] }`.
  - Chosen over an injected-constructor `createSuiteWindow(BrowserWindow, …)`: each app keeps its own
    `new BrowserWindow({...})` call, sizes and `webPreferences` visible in its own main, exactly as
    `guardAppWindow` takes a structural `GuardableWebContents` rather than the class.
  - *Done when* `suite-window.test.ts` asserts both platform branches, including the exact argument string.
- [x] **Chrome events over a structural window.** In the same file:
  - `export type ChromeableWindow = { isFullScreen(): boolean; isMaximized(): boolean; maximize(): void; unmaximize(): void; on(event: 'enter-full-screen' | 'leave-full-screen' | 'focus' | 'blur' | 'maximize' | 'unmaximize', fn: () => void): unknown; webContents: { send(channel: string, ...args: unknown[]): void } }`.
  - `export function attachWindowChrome(win: ChromeableWindow): void` — the body of the desktop's
    `attachWindowChrome`, sending `EVENT_CHANNELS.windowStateChanged` with `WindowState = { maximized; fullScreen; focused }`.
  - `export function toggleMaximize(win: ChromeableWindow): void` — `isFullScreen() ? return : isMaximized() ? unmaximize() : maximize()`,
    the logic behind `CHANNELS.windowMaximizeToggle`. Each app's main binds that channel to it through its
    `createIpcContext`.
  - The desktop's `attachWindowChrome` / `registerWindowChrome` become thin wrappers (Studio's behaviour
    unchanged); `window.ts:117` and `window-manager.ts:392` keep calling them.
  - *Done when* `suite-window.test.ts` drives a fake `ChromeableWindow` through enter/leave full screen and a
    toggle while full-screen (no-op) and while maximised (unmaximise).
- [x] **The preload slice.** Net-new `packages/runtime/src/app-main/window-chrome-preload.ts` exporting
  `createWindowChromeBridge(ipc: RendererIpc, argv: readonly string[], platform: DesktopPlatform): WindowChromeBridge`
  — parses `WINDOW_FRAMELESS_ARG` from `argv` the way
  [`desktop/src/preload/index.ts:56`](../../../packages/desktop/src/preload/index.ts) does, and subscribes
  `onFullscreenChange` / `onFocusChange` to `windowStateChanged`. Studio's preload calls it; each app's preload
  adds `windowChrome: createWindowChromeBridge(...)` to its bridge.
  - *Done when* a test asserts `frameless` is `true` for `--mstudio-frameless=1`, `false` for `=0` **and for a
    missing argument** (a framed window must never lose its native title bar to a missing flag).
- [ ] **Full-screen and double-click.** Entering full screen drops the traffic-light inset (the `TitleBar`
  reads `onFullscreenChange`); double-clicking the drag region calls `windowMaximizeToggle`, a no-op in full
  screen. No `systemPreferences` / `AppleActionOnDoubleClick` read — Studio doesn't today, and matching it is
  the goal.
  - *Done when* the e2e in I.1 double-clicks Vanguard's title bar and asserts the window's maximised state flips.
- [ ] **Security stays per app.** Each app keeps `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`, `devTools: devToolsAllowed(app.isPackaged)` and its existing `guardAppWindow`
  call. The options helper sets none of them, so it cannot weaken them.
  - *Done when* one app's main test (Vanguard) asserts its `BrowserWindow` options contain both the
    `suiteWindowOptions` keys and `sandbox: true`.

### B — The shared shell [M · ~1d] — ✅ DONE (2026-10-29)

- [x] **`AppShell`.** Net-new `packages/frame/src/shell/app-shell.tsx`; `packages/frame/package.json` gains
  `@bilo-io/shell` (same version as `packages/app`). Signature:
  ```ts
  export type AppShellProps = {
    app: SuiteAppId; name: string; accent: string;
    nav: NavConfig; activeView: string; onNavigate(view: string): void;
    panels?: { terminal?: ComponentType; companion?: ComponentType; fab?: ComponentType };
    footer?: ReactNode;          // Theme J's StatusBar
    titleBarEnd?: ReactNode;     // Studio's agent / Ollama trio
    children: ReactNode;         // the active view
  };
  ```
  - Renders `ShellProviders` > `AppFrame` (`nav`, `titleBar`, `linkComponent`) > a view slot that is
    `overflow-hidden` — each view owns its scroll (the rule the 2026-10-28 scroll fixes relied on).
  - `windowChrome` comes from `bridge()?.windowChrome ?? null`; with `frameless === false` the title bar
    renders the slim strip, as Studio's `framed` branch does (`app.tsx:1466`).
  - *Done when* `app-shell.test.tsx` renders the name, the logo `<img>` with `src === appLogoUrl(app)`, and the
    view, and the slim strip for `frameless: false`.
- [x] **Nav from the manifest.** Each `apps/<id>/src/<id>-manifest.ts` constant (e.g. `VANGUARD_APP`) gains:
  ```ts
  nav: { views: readonly { id: string; label: string; icon: IconComponent; command?: CommandId }[] };
  panels?: { terminal?: boolean; companion?: boolean; fab?: boolean };   // absent = all true
  settings?: readonly SettingsPageId[];                                  // Theme L
  ```
  - `NavConfig` and `IconComponent` live in `packages/frame/src/shell/nav-config.ts`; `IconComponent` is the
    structural type from `packages/app/src/components/icon-button.tsx`, moved to the frame and re-exported.
  - A single-view app lists its tabs as views (Vanguard: `sensors`, `findings`) — open decision 4. Settings is
    never in `views`; B.4 puts it in the footer.
  - `apps/browser/src/browser-manifest.ts` does not exist: H.1 creates it.
  - *Done when* a test per app asserts `nav.views.length >= 1` and every `command` is a valid `CommandId`
    (`isCommandId`).
- [x] **Nav links with chords.** `ViewLink` (`app.tsx:236`, not exported today) moves to
  `packages/frame/src/shell/view-link.tsx` as `createViewLink(onNavigate, chordFor)`; the tooltip shows only
  the chord (CLAUDE.md's rail rule). `nav-chords.ts`'s `navChord` stays Studio's and is passed in as
  `chordFor`; other apps derive `chordFor` from `nav.views[].command`.
  - *Done when* `view-link.test.tsx` asserts the tooltip text equals the chord and a click calls `onNavigate`
    with `preventDefault`.
- [x] **Settings at the foot.** `AppShell` renders the Settings button in `AppFrame`'s nav `footer` slot, last,
  with Studio's markup (`app.tsx:1335`): `aria-label="Settings"`, `aria-current="page"` when active,
  `LuSettings`, label when expanded. It calls `onNavigate('settings')`.
  - *Done when* `app-shell.test.tsx` asserts the footer's last button is labelled Settings and sets
    `aria-current` when `activeView === 'settings'`.
- [x] **Panel slots.** `AppShell` mounts each `panels.*` component it is given and nothing else; the frame
  imports no feature (each app's composer imports the feature and passes the component).
  - *Done when* `app-shell.test.tsx` renders with `panels: { terminal: Stub }` and asserts the stub is present
    and no companion/fab container exists.
- [x] **Studio's title-bar extras stay Studio's.** `TitleBarPrimaryAgent`, `TitleBarAgents`, `TitleBarOllama`
  go in `titleBarEnd`, which only Studio fills. The suite-wide right cluster (`TitleBarStatus`,
  `TitleBarBattery`, `ThemeToggle`) is J.4's and renders after it.
  - *Done when* the test asserts `titleBarEnd` renders before the theme toggle.
- [x] **Accent: brand only.** The manifest `accent` sets `--app-accent` on the shell root and colours only the
  logo tile and the active nav item; the user's appearance accent (suite-prefs, L.1) drives everything else.
  - *Done when* `app-shell.test.tsx` asserts `--app-accent` on the root and that the active nav link carries
    the accent class, and the I.2 baseline shows Vanguard's red only on those two.

### C — The launcher's logo, in the window [S · ≤ 2h]

- [x] **The id list in shared.** Net-new `packages/shared/src/suite-apps.ts`:
  `export const SUITE_APP_IDS = [...] as const; export type SuiteAppId = (typeof SUITE_APP_IDS)[number];`
  plus `export const SuiteAppIdSchema = z.enum(SUITE_APP_IDS);`, holding exactly today's
  [`catalog.ts:70`](../../../apps/launcher/src/common/catalog.ts) `APP_IDS` (19 ids, including the ones with
  no app dir yet). `catalog.ts` imports it by source path
  (`@midnite/studio-shared/suite-apps`, the one-file rule) and keeps `export type AppId = SuiteAppId`.
  - *Done when* the launcher's existing catalog tests pass unchanged and a shared test asserts the list has
    no duplicates.
- [x] **One more output.** `generate-app-logos.cjs` also writes
  `packages/frame/src/shell/app-logos/<id>.png` — a byte-for-byte copy of the 256 px
  `apps/launcher/src/renderer/assets/app-logos/<id>.png` it already writes, for every id in `SUITE_APP_IDS`.
  Run via `moon run launcher:logos`; the PNGs are committed.
  - *Done when* the regenerated tree has 19 PNGs in the frame.
- [x] **The lookup.** Net-new `packages/frame/src/shell/app-logo.ts`:
  `const LOGOS = import.meta.glob<string>('./app-logos/*.png', { eager: true, import: 'default' });`
  `export function appLogoUrl(id: SuiteAppId): string` — the launcher's `app-icon.tsx:8` pattern. An id with no
  file throws in dev (the drift test makes that unreachable).
- [x] **A drift check.** `app-logo.test.ts` asserts every `SUITE_APP_IDS` entry has a frame logo and that its
  SHA-256 equals the launcher's file, so a regenerate that skips one, or a hand-edited PNG, fails.

### D — The chords, everywhere [M · ~1d] — ✅ DONE (2026-10-29)

- [x] **The dispatcher in the frame.** `useKeybindings(runtime: CommandRuntime)` moves from
  [`packages/app/src/services/keybindings/use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts)
  to net-new `packages/frame/src/commands/use-keybindings.ts`, with `CommandRuntime` (today
  `Record<CommandId, CommandEntry>` in `use-command-handlers.ts:50`) widened to
  `Partial<Record<CommandId, CommandEntry>>` so an app binds only what it has; Studio still passes the full
  record. The app's file
  re-exports it; `app.tsx` and `detached-root.tsx` keep their imports.
  - *Done when* `use-keybindings.test.ts` moves with it and passes unchanged, plus one new case: a chord whose
    command has no handler is not `preventDefault`ed (it reaches the page).
- [x] **The suite subset.** In `keybindings.ts`:
  `export const SUITE_COMMANDS: readonly CommandId[] = COMMANDS.filter((c) => SUITE_COMMAND_IDS.has(c.id)).map((c) => c.id)`
  with `SUITE_COMMAND_IDS` (a `Set<string>`) = `terminal.*` (all six), `fab.toggle`, `companion.toggle`, `notes.toggle`,
  `panel.back`, `panel.forward`, `palette.open`, `app.reload`, `app.hardReload`, `app.lock`, `app.zoomIn`,
  `app.zoomOut`, `app.zoomReset`, `view.settings`. Derived from `COMMANDS`, never a second table.
  - *Done when* a test asserts every `SUITE_COMMANDS` id is in `COMMAND_IDS` and that the list contains no
    repo-bound command (`sync.*`, `view.graph`).
- [x] **`view.settings` on `Mod+,`.** New `COMMANDS` entry
  `{ id: 'view.settings', label: 'Open Settings', group: 'view', chord: 'Mod+,', scope: 'app' }` — `Mod+,` is
  unbound today (grep of `keybindings.ts` and `menu.ts`) and is the macOS convention. No menu accelerator
  (CLAUDE.md: chords route through the renderer). Studio's handler is `setActiveView('settings')`; an app's
  is `onNavigate('settings')`.
  - *Done when* [`keybindings.test.ts`](../../../packages/app/src/services/keybindings/keybindings.test.ts)'s
    chord-uniqueness check passes and `menu.test.ts` still finds no accelerator for it, and `use-keybindings.test.ts`
    fires `Meta+,` and asserts the handler ran.
- [x] **Terminal yield.** `GLOBAL_CHORDS` and `TERMINAL_YIELD_COMMANDS` (from `YIELD_ROOTS`) apply in every app
  exactly as in Studio: `Ctrl+`` and `Mod+k` escape the terminal; `fab.toggle`, `panel.back`,
  `panel.forward` yield to the shell off macOS.
  - *Done when* a test mounts the frame dispatcher with focus inside a `.xterm` element and asserts `Ctrl+``
    fires `terminal.toggle` while `Mod+t` does not.
- [x] **Palette in every app.** `PaletteHost` ([`components/palette-host.tsx`](../../../packages/app/src/components/palette-host.tsx)) and the palette's command list move to
  `packages/frame/src/commands/palette/`, filtered to the commands the app has handlers for, so `Mod+k` lists
  only what works there.
  - *Done when* a test renders the palette with handlers for three commands and asserts exactly those three
    are listed.

### E — The terminal panel as a feature [L · 1–2d]

- [x] **Extract the renderer.** `packages/app/src/features/terminal` (63 files, ~11.5k lines, about half
  tests) → net-new `packages/features/terminal/renderer`, laid out like
  [`packages/features/monitor`](../../../packages/features/monitor/) (`package.json` name
  `@midnite/studio-feature-terminal`, `./renderer` and `./main` exports, `manifest.ts` via
  `defineFeatureManifest`, `moon.yml`, `vitest.config.ts`). Listed in
  [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) `STUDIO_FEATURES` (the
  composition test fails otherwise).
  - `useTerminalStore` (`terminal-store.ts`) and `session-mount-policy.ts` move inside the feature.
  - *Done when* `composition.test.ts` and every moved terminal test pass, and `scripts/layer-boundaries.test.mjs`
    stays green.
- [x] **`TerminalHost` port.** Net-new `packages/features/terminal/renderer/host.tsx`
  (`TerminalHostProvider`, `useTerminalHost`) replacing every reach into `packages/app`:
  - Layout and prefs: `terminalMaximized`, `terminalSidebarSide`, `terminalListOpen`, `layout`/`setLayout`,
    `terminalKeepRecentSessions`, `terminalDisposeAfterMs` (today `ui-store.ts` 1879–2648).
  - Repos: `useRepos()` (`services/queries`), `openInMidnite`.
  - Agents: `agentInstallStatus`, `agentProbe` (from `agent/*`).
  - Theme: `resolvePalette` (`themes/resolve-palette`).
  - Components with no frame equivalent (`resizable/*`, `state-dot`, `use-reveal`) move to the frame first
    if generic; otherwise they become host slots. The executor lists each in the PR body with its choice.
  - Studio's adapter is net-new `packages/app/src/compose/terminal-host.tsx` (mirrors `notes-host.tsx`); every
    other app gets `packages/frame/src/shell/default-terminal-host.ts` (no repos, default layout, prefs from
    suite-prefs).
  - *Done when* `grep -r "packages/app\|\.\./\.\./store" packages/features/terminal` is empty and a test
    renders `TerminalPanel` under the default host with a mock bridge.
- [x] **Extract the main half.** `terminal-service.ts`, `pty-service.ts`, `pty-env.ts` from
  `packages/desktop/src/main/` → `packages/features/terminal/main/`, exposed as
  `terminalMain = defineFeatureMain<TerminalMainServices>(...)` over the runtime broker client
  (`openBrokerClient`). Studio's desktop registers it; its existing imports re-export from the feature.
  `inproc-pty.ts` and `node-pty` stay in `packages/desktop` and arrive as an injected service (the feature
  may not import `node-pty`).
  - *Done when* the moved main tests pass and Studio's `main/index.ts` boots with `terminalMain.register`.
  - ◐ Slice landed (2026-10-29): `terminal-service`, `terminal-store`, `agents-store`, `session-history-store` and
    `pty-env` (with their tests) live in `packages/features/terminal/main/`, built like `feature-monitor`
    (`tsconfig.main.json`, `./main` export, desktop references). `terminal-service` reaches the pty service, the
    agent-conversation locator and the logger through a `TerminalPorts` object that desktop's shim binds once.
    `terminalMain` registers `terminalList`, `agentList`, `agentRecheck` and the save/forget/reorder sends; Studio's
    `terminal-handlers.ts` is now its composition.
  - ✅ Landed (2026-10-30): `pty-service` and the pty handlers moved too, behind `PtyPorts` and `RuntimeIpc.sendFromSender`.
- [x] **Sessions carry the app.** `TerminalSessionSchema`
  ([`shared/src/terminal.ts:624`](../../../packages/shared/src/terminal.ts)) gains `appId: SuiteAppIdSchema.optional()`;
  absent means `'studio'` (every existing record). `ptyCreate`'s payload carries it; each app's main stamps
  its own id. No persisted-store migration: the field is optional and read with a default.
  - Listing: each app shows `appId === self` by default; a "Show all apps" toggle in `terminal-session-list.tsx`
    (persisted in suite-prefs as `terminal.showAllApps`) shows every broker session, each tagged with the
    owning app's logo. Studio shows all by default. (Open decision 1.)
  - *Done when* a schema test parses a record without `appId` as studio, and `terminal-session-list.test.tsx`
    asserts the filter and the toggle.
- [x] **Unload and rehydrate unchanged.** `DEFAULT_KEEP_RECENT_SESSIONS = 3` and
  `DEFAULT_SESSION_DISPOSE_AFTER_MS = 2 * 60 * 1000` (`session-mount-policy.ts:33-34`) and `replay-gate.ts`
  come with the feature unchanged.
  - *Done when* the Phase 84 E.6 mount-count test passes from its new location.
- [x] **Broker failure is visible.** An app whose broker attach fails shows the existing broker-status message
  in the panel (`getBrokerStatus`), not an empty dock, and logs once through the runtime's `warn`.
  - *Done when* a test with a failing broker client asserts the status text renders.

### F — The companion panel as a feature [L ×2 · 3–4d]

- [x] **Extract the renderer, whole.** `packages/app/src/features/companion` (~50 source files incl. `reveal/`,
  `audio/`) and `packages/app/src/store/companion-store.ts` → net-new
  `packages/features/companion/renderer`. Listed in `STUDIO_FEATURES`. Chosen over a slim core: other apps
  get the full companion (voice, digest, ask, zen stage) with only the Studio-bound reveals stubbed.
  - *Done when* the moved companion tests pass and the layer-boundaries test stays green.
- [x] **`CompanionHost` — one method per cross-feature reach.** Net-new
  `packages/features/companion/renderer/host.tsx`. Each import the audit found becomes a typed method,
  grouped:
  - Terminal: `startAgent`, `revealSession`, `terminalSessions()` (from `../terminal/*`).
  - Studio views: `revealCommit`, `requestCommitFile`, `openMedia`, `openFile` (graph, commit, media, files).
  - Feature stores it read directly: browser, media-game, database, chats, api-client, workflows, tasks,
    media-terrain, media-sprite, media-model, councils — each becomes a `revealers: Revealer[]` entry the host
    supplies, so the companion holds a list, not eleven imports.
  - App stores: `toast`, `issueModal`, `fileEditor`, `notes`, `sessions`, `reviews`, `actions`, `metrics`.
  - Studio's adapter is net-new `packages/app/src/compose/companion-host.tsx` (fills everything); other apps
    use `packages/frame/src/shell/default-companion-host.ts` where every reveal returns `false` and the
    revealer list is empty.
  - *Done when* `grep -r "@midnite/studio-feature-" packages/features/companion` is empty and a test renders
    the orb under the default host.
- [x] **Extract the main half.** `packages/desktop/src/main/companion` (27 files, ~7k lines) →
  `packages/features/companion/main` as `companionMain = defineFeatureMain<CompanionMainServices>(...)`. Its
  reaches (`../mcp/dispatch`, `../terminal-service`, `../pty-service`, `../process-runner`, `../fs-scope`)
  become `CompanionMainServices` fields Studio injects; other apps inject `livePtyActivityCounts` from the
  terminal feature and no MCP dispatch (ask answers without tools).
  - *Done when* the moved main tests pass and Studio registers it.
- [x] **Per-app thread, shared voice.** The conversation store is per app (its own origin); the companion's
  settings (enabled, voice, STT provider) move to suite-prefs (L.1) so they are set once. (Open decision 2.)
  - *Done when* a test asserts two default-host renders read `companion.enabled` from the suite-prefs mock.
- [x] **Disabled is explicit.** With `companion.enabled === false`, the panel renders the existing "Enable in
  Settings ▸ Companion" state and the quick-access C leaf stays disabled with that hint.
  - *Done when* asserted in `companion-launcher.test.tsx`.

### G — The FAB and Loops as a feature [L · 1–2d]

- [ ] **Extract.** `packages/app/src/features/loops` (29 files, ~5.6k lines, including `fab-launchers.tsx`)
  and `features/quick-access` (3 files) → net-new `packages/features/loops/renderer`. Listed in
  `STUDIO_FEATURES`.
  - *Done when* the moved tests pass and layer-boundaries stays green.
- [ ] **`LoopsHost` slots.** Net-new `packages/features/loops/renderer/host.tsx`:
  `{ renderTerminal(props: { sessionId: string }): ReactNode; renderCompanionLauncher(): ReactNode; startAgent(input: StartAgentInput): Promise<string>; openNotes(): void; setupStore?: SetupPort }`.
  `AppShell`'s composer in each app fills them from the terminal and companion features; the loops package
  imports neither.
  - *Done when* `grep -r "features/terminal\|features/companion" packages/features/loops` is empty.
- [ ] **The ledger in the runtime, one file per app.** `loop-runs.ts` / `loop-runs-store.ts` →
  net-new `packages/runtime/src/loop-runs/`. Each app writes only
  `<appData>/Midnite Runtime/loop-runs/<appId>.json` (`MAX_STORED_LOOP_RUNS = 200` per file, written by atomic
  temp-file + rename); `listLoopRuns()` reads and merges every file in the directory, newest first, each run
  tagged with `appId`. One writer per file, so concurrent apps never race. Studio's existing
  `<userData>/loop-runs.json` is moved to `loop-runs/studio.json` on first start (a one-time copy, the old
  file left in place). (Open decision 3.)
  - `loopRunsChanged` fires on the app's own writes and on an `fs.watch` of the directory.
  - *Done when* a runtime test writes from two fake apps and asserts the merged list and that a corrupt file is
    skipped with one `warn`, and a migration test asserts the copy.
- [ ] **The menu's leaves.** Loops (L), Companion (C), Notes (N), Repeat (R), Setup (S), Report Issue (I) and
  Guided tour (G) keep their mnemonics after `Mod+l`; a leaf whose feature the app does not carry is **hidden,
  not disabled** (the existing "Coming soon" I/G stay disabled).
  - *Done when* `quick-access-menu.test.tsx` renders with `panels: { companion: false }` and asserts no C row.

### H — Every app on the shell [L · 1–2d]

- [ ] **Roll-out, batch 1.** `vanguard`, `vault`, `monitor`, `cleaner`, `capture` — the apps with the least UI.
  Each: `openWindow` spreads `suiteWindowOptions`, its preload adds `windowChrome`, its app root renders
  `AppShell` with its manifest's `nav`, `panels`, `settings` and the frame's default hosts, its main registers
  `terminalMain`, `companionMain`, `monitorMain` and the suite-prefs + loop-runs services.
  `apps/browser/src/browser-manifest.ts` is created in batch 3.
  - *Done when* each app's `*-app.test.tsx` asserts the shell renders its name, logo and Settings, and the
    PR carries one screenshot per app.
- [ ] **Roll-out, batch 2.** `agents`, `coder`, `creator`, `gamer` — same checklist.
- [ ] **Roll-out, batch 3.** `media`, `mind`, `money`, `browser` — same checklist. Mind's in-view `settings`
  tab and Cleaner's `midnite-cleaner.settings` become their Theme L app pages.
- [ ] **Studio last.** `packages/app` renders the same `AppShell` with its extras in `titleBarEnd`, its full
  segment list in `footer`, and its hosts. Its own PR.
  - *Done when* every existing Studio visual baseline passes unchanged.
- [ ] **Screenshots.** One shot per app of the shell (repos panel closed), committed under
  `docs/screenshots/phase-123/<app>.png` and embedded in each batch's PR at creation.

### I — Proof [M · ~1d]

- [ ] **e2e.** In Vanguard and Vault (Playwright against each app's renderer with a mock bridge; if suite apps
  have no Playwright project yet, add one for these two only, mirroring `packages/app`'s config and
  `installMockBridge`): the title bar double-click toggles maximise, `Ctrl+`` opens the terminal, `Mod+l`
  opens the FAB, `Mod+l` then `L` opens Loops, `Mod+,` opens Settings. Each spec's header names the browser
  capability it needs (focus order, real keyboard). The e2e cap in `scripts/e2e-budget.mjs` and its pinned
  test in `e2e-budget.test.mjs` move together.
- [ ] **Visual.** One locator-cropped baseline per shell variant — framed, frameless, nav collapsed — taken in
  Vanguard, inside the visual budget (~100 baselines / 3 MB).
- [ ] **Idle cost.** `scripts/perf/idle-cpu.mjs --blurred` against one packaged suite app (Vanguard) shows no
  more than its pre-phase number + 0.5 % of a core; both numbers go in the PR body.
- [ ] **Docs.** `docs/APPS.md` gains "The shell": what an app gets for free, the manifest fields (`nav`,
  `panels`, `settings`), the host ports, and how to opt a panel out.

### J — The status bar [M · ~1d]

- [x] **A segment host in the frame.** `status-bar.tsx`, `segments.ts`, `segments-groups.ts`,
  `overflow-popover.tsx`, `use-overflow.ts`, `status-toggle.tsx`, `status-separator.tsx` → net-new
  `packages/frame/src/shell/status-bar/`. `StatusBar` becomes
  `StatusBar({ segments, fab }: { segments: readonly StatusSegment[]; fab?: ReactNode })`; `STATUS_SEGMENTS`
  stays Studio's list and is passed in. The `StatusSegment` / `StatusZone` / `StatusGroup` types are
  unchanged.
  - *Done when* the moved status-bar tests pass with `segments={STATUS_SEGMENTS}`.
- [x] **Suite segments.** Net-new `packages/frame/src/shell/status-bar/suite-segments.ts`
  `export function suiteSegments(panels: AppPanels): StatusSegment[]` returning terminal-toggle (20),
  palette-toggle (40), monitor (42), notification-bell (50), assistant-menu (60) with today's zones,
  groups and priorities. A toggle whose panel is absent is left out — never a dead button. The bell reads
  the frame's `toast-store.ts`. (Open decision 5.)
  - *Done when* `suite-segments.test.ts` asserts `panels: { terminal: false }` drops terminal-toggle and the
    rest keep their priorities.
- [x] **Studio's segments stay Studio's.** Repos/explorer/browser/activity/files toggles, diagnostics, the
  progress trio, automate, finance, test- and checks-verdict, liveness, the MCP indicator and the update pill
  remain in `packages/app` and reach the bar only through Studio's `segments` prop. The update pill stays
  Studio-only because the launcher alone updates suite apps (CLAUDE.md).
  - *Done when* `status-bar.test.tsx` asserts a non-Studio render with `suiteSegments(all)` has exactly five
    segments.
- [x] **The title bar's right cluster.** ✅ DONE (2026-10-29) `TitleBarStatus` (with `titlebar-status-store.ts`, now backed by
  suite-prefs key `titlebarStatus`), `TitleBarBattery` and `ThemeToggle` move to
  `packages/frame/src/shell/titlebar/` and render in every app after `titleBarEnd`. Weather keeps its existing
  network fetch and its existing error state.
  - *Done when* `app-shell.test.tsx` asserts all three render in a non-Studio shell.
  - Landed after L.2 (PR #1067): the store was already in `packages/frame/src/prefs/`, so the cluster moved once.
    Its two reaches into Studio's `ui-store` (metrics idle cadence; the privacy switches the weather fetch honours)
    come through a `TitleBarHost` context with defaults, and the pill and battery draw their popover through the
    status bar's chrome context. The frame's `ThemeToggle` is its own copy, dismissing on Escape, outside press,
    resize and blur; Studio keeps its layered one (its `use-dismiss` stack reads `ui-store`).

### K — The system monitor core [M · ~1d] — ✅ DONE (2026-10-29)

- [x] **Sampling in every app.** (helper + Studio + Monitor; the other apps' mains register it in H) Each app's main calls `monitorMain.register(ctx, { onMetricsService })` and
  binds `service.pause()` on `blur`, `hide`, `minimize` and `resume()` on `focus`, `show`, `restore`, and
  `stop()` on `closed` — the pattern in [`apps/monitor/main/index.ts`](../../../apps/monitor/main/index.ts)
  (lines 109–114) and `desktop/src/main/ipc/metrics-handlers.ts`, extracted once as net-new
  `packages/runtime/src/app-main/bind-metrics.ts`
  `export function bindMetricsToWindow(win: PausableWindow, service: { pause(): void; resume(): void; stop(): void }): void`.
  No `agentSessions` service is passed outside Studio, so `monitorAgentUsage` answers empty.
  - *Done when* `bind-metrics.test.ts` drives a fake window through each event and asserts the calls.
- [x] **One channel set.** `metricsStart`, `metricsStop`, `metricsSample` and `systemHealth` are served by each
  app's main from that registration; nothing new in `channels.ts`.
- [x] **The segment and flyout.** `MonitorCluster` (`packages/app/src/features/monitor/monitor-cluster.tsx`)
  and its helpers (`metric-chart`, `metric-icons`, `metric-geometry`, `metric-palette`, `metric-path`,
  `format-bytes`) move to `packages/frame/src/shell/status-bar/monitor/`, reading `hiddenMetrics` and
  `metricsIdleIntervalMs` from suite-prefs. It opens `MonitorFlyout` (metrics only: CPU/RAM/GPU timelines and
  the capacity gauge); its "Open Monitor" button calls `requestHandoff({ app: 'monitor', view: 'monitor' })`,
  which in the Monitor app itself navigates in place. The segment renders nothing until the first sample.
  - *Done when* a test renders the cluster with no samples (asserts empty), then one sample (asserts CPU), and
    clicks Open Monitor (asserts the hand-off call).

### L — Settings at the foot of the nav [M · ~1d] — ✅ DONE (2026-10-29)

- [x] **The suite-prefs file.** ✅ DONE (2026-10-29, branch `feature/p123-l1`). Net-new `packages/runtime/src/suite-prefs/` (service) and
  `packages/shared/src/suite-prefs.ts` (contract):
  - `SuitePrefsSchema = z.object({ version: z.literal(1), appearance: AppearancePrefsSchema, palette: …, titlebarStatus: …, companion: …, terminal: …, monitor: … }).partial()`
    with each group `.passthrough()`-free and defaulted on read.
  - File: `<appData>/Midnite Runtime/suite-prefs.json`. Writes are atomic (temp file + rename) and
    read-merge-write per top-level key; concurrent writers are user-driven and last-writer-wins per key.
    An unparseable file is moved aside to `suite-prefs.json.bad-<ts>`, defaults are used, and one `warn` is
    logged.
  - Channels: `suitePrefsGet: 'mstudio:suite-prefs:get'`, `suitePrefsSet: 'mstudio:suite-prefs:set'`
    (payload `{ key, value }`, validated), event `suitePrefsChanged: 'mstudio:suite-prefs:changed'` fired on
    the app's own writes and on an `fs.watch` of the file (debounced 100 ms).
  - Migration: on first start, Studio seeds the file from its `midnite.settings` (`appearance-store` v2,
    `palette-store`, `activity-palette-store`) and `midnite.titlebar-status` if the file does not exist yet;
    the localStorage keys stay as a fallback for one release.
  - *Done when* runtime tests cover read-defaults, write-merge, corrupt-file recovery and the change event,
    and a Studio test covers the seed.
- [x] **Renderer stores on suite-prefs.** ✅ DONE (2026-10-29) `appearance-store.ts`, `palette-store.ts`,
  `activity-palette-store.ts` and `titlebar-status-store.ts` move to `packages/frame/src/prefs/` and
  hydrate from / write to suite-prefs via the bridge instead of `sharedSettingsStorage`; a
  `suitePrefsChanged` event re-hydrates, so a theme change in one app shows in every open app.
  `useAppearanceSync()` moves with them.
  - *Done when* a test fires `suitePrefsChanged` with a new accent and asserts `data-*` attributes update.
- [x] **The settings view in the frame.** ✅ DONE (2026-10-29) `settings-view.tsx` and its page shell → net-new
  `packages/frame/src/settings/settings-view.tsx`
  `SettingsView({ pages }: { pages: readonly { id: SettingsPageId; label: string; group: SettingsGroupId; Page: ComponentType }[] })`
  (`SettingsGroupId` moves from `ui-store.ts` to the frame with it).
  Suite pages (net-new `suite-settings-pages.ts`): appearance, privacy, terminal, companion, monitor, and a
  read-only chords page. Each app appends the pages its manifest lists in `settings`. The `SETTINGS_PAGES`
  table in `ui-store.ts:290` becomes Studio's list.
  - *Done when* a test renders Vanguard's settings and asserts the five suite pages, plus the chords page
    listing `view.settings` as `⌘,`.
- [x] **Shared pages, one store; app pages, its own.** ✅ DONE (2026-10-29) Suite pages read and write suite-prefs only; an app's
  own page persists however it does today (e.g. Cleaner's `midnite-cleaner.settings`). (Open decision 6.)
  - *Done when* asserted in the test above by inspecting which store each page's write reaches.

## Files this phase touches

| File | Change | Theme |
|---|---|---|
| `packages/runtime/src/app-main/suite-window.ts` (+ test) | **net-new** | A |
| `packages/runtime/src/app-main/window-chrome-preload.ts` (+ test) | **net-new** | A |
| `packages/runtime/src/app-main/bind-metrics.ts` (+ test) | **net-new** | K |
| [`packages/runtime/src/app-main/index.ts`](../../../packages/runtime/src/app-main/index.ts) | edited (exports) | A, K |
| [`packages/runtime/src/app-main/window-guard.ts`](../../../packages/runtime/src/app-main/window-guard.ts) | **unchanged**, load-bearing | A |
| [`packages/desktop/src/main/window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts) | edited (re-exports) | A |
| [`packages/desktop/src/main/window.ts`](../../../packages/desktop/src/main/window.ts) | **unchanged** | A |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | edited | A |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | **unchanged** (`WindowChromeBridge`) | A |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | edited (suite-prefs channels) | L |
| `packages/shared/src/suite-apps.ts` | **net-new** | C |
| `packages/shared/src/suite-prefs.ts` | **net-new** | L |
| [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) | edited (`view.settings`, `SUITE_COMMANDS`) | D |
| [`packages/shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) | edited (`appId`) | E |
| `packages/frame/package.json` | edited (`@bilo-io/shell`) | B |
| `packages/frame/src/shell/app-shell.tsx`, `nav-config.ts`, `view-link.tsx` (+ tests) | **net-new** | B |
| `packages/frame/src/shell/app-logo.ts`, `app-logos/*.png` (+ test) | **net-new** | C |
| `packages/frame/src/shell/default-*-host.ts` | **net-new** | E, F |
| `packages/frame/src/shell/status-bar/**` | **net-new** (moved) | J, K |
| `packages/frame/src/shell/titlebar/**` | **net-new** (moved) | J |
| `packages/frame/src/commands/**` | **net-new** (moved) | D |
| `packages/frame/src/prefs/**` | **net-new** (moved) | L |
| `packages/frame/src/settings/settings-view.tsx`, `suite-settings-pages.ts` | **net-new** | L |
| [`packages/frame/src/settings/settings-sections.ts`](../../../packages/frame/src/settings/settings-sections.ts) | **unchanged**, load-bearing | L |
| `packages/runtime/src/suite-prefs/**` | **net-new** | L |
| `packages/runtime/src/loop-runs/**` | **net-new** (moved) | G |
| `packages/features/terminal/**` | **net-new** (moved) | E |
| `packages/features/companion/**` | **net-new** (moved) | F |
| `packages/features/loops/**` | **net-new** (moved) | G |
| [`packages/features/monitor/**`](../../../packages/features/monitor/) | **unchanged**, load-bearing | K |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | edited (renders `AppShell`) | H |
| `packages/app/src/compose/{terminal,companion,loops}-host.tsx` | **net-new** | E, F, G |
| [`packages/app/src/features/status-bar/segments.ts`](../../../packages/app/src/features/status-bar/segments.ts) | edited (Studio's list only) | J |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | edited (terminal/settings fields read through hosts) | E, L |
| [`packages/app/src/store/appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts) | moved | L |
| [`packages/desktop/src/main/loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts), `loop-runs-store.ts` | moved | G |
| [`packages/desktop/src/main/ipc/metrics-handlers.ts`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts) | edited (uses `bindMetricsToWindow`) | K |
| [`apps/launcher/scripts/generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs) | edited | C |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) | edited (imports `SUITE_APP_IDS`) | C |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | edited (3 features) | E, F, G |
| `apps/<id>/main/index.ts`, `apps/<id>/main/preload.ts`, `apps/<id>/main/context.ts`, `apps/<id>/src/<id>-app.tsx`, `<id>-manifest.ts` ×13 | edited | H |
| `apps/browser/src/browser-manifest.ts` | **net-new** | H |
| [`apps/monitor/main/index.ts`](../../../apps/monitor/main/index.ts) | edited (uses `bindMetricsToWindow`) | K |
| [`eslint.config.mjs`](../../../eslint.config.mjs), [`scripts/layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs) | **unchanged**, load-bearing | all |
| [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs) + test | edited | I |
| [`docs/APPS.md`](../../../docs/APPS.md) | edited | I |

## Verification

- `suite-window.test.ts`: both platform branches of `suiteWindowOptions`; `attachWindowChrome` events;
  `toggleMaximize` no-op in full screen.
- `window-chrome-preload.test.ts`: `frameless` true / false / missing-arg-is-false.
- Vanguard main test: `BrowserWindow` options include the suite keys and `sandbox: true`.
- `app-shell.test.tsx`: name, logo `src`, slim strip when framed, Settings last in the footer with
  `aria-current`, only the given panels, `titleBarEnd` before the theme toggle, `--app-accent` on the root.
- Per-app manifest test: `nav.views.length >= 1`, every `command` passes `isCommandId`.
- `view-link.test.tsx`: tooltip is the chord only; click navigates.
- `suite-apps` test: no duplicate ids; launcher catalog tests unchanged.
- `app-logo.test.ts`: every id has a frame logo, SHA-256 equal to the launcher's.
- `use-keybindings.test.ts` (moved): unbound chord passes through; `Meta+,` opens settings; `Ctrl+`` escapes
  `.xterm`, `Mod+t` does not.
- `keybindings.test.ts`: no chord collision after `view.settings`; `menu.test.ts`: no accelerator for it.
- Palette test: lists only commands with handlers.
- `composition.test.ts`: terminal, companion, loops listed.
- Terminal schema test: no `appId` parses as studio; `terminal-session-list.test.tsx`: filter + toggle.
- Phase 84 E.6 mount-count test passes from `packages/features/terminal`.
- Broker-failure test: status text renders.
- Companion: no `@midnite/studio-feature-*` import in the package; default-host render; disabled state.
- Loops: no terminal/companion import; two-app merged ledger; corrupt file skipped; Studio ledger copied;
  hidden C leaf with `companion: false`.
- `suite-segments.test.ts` and `status-bar.test.tsx`: five suite segments, toggles drop with their panel.
- `bind-metrics.test.ts`: pause/resume/stop per window event.
- Monitor cluster test: empty before first sample, CPU after, Open Monitor hand-off.
- suite-prefs runtime tests: defaults, merge-write, corrupt recovery, change event; Studio seed test.
- Prefs store test: `suitePrefsChanged` re-applies appearance.
- Settings test: Vanguard shows the five suite pages and the chords page.
- e2e (Vanguard, Vault): double-click maximise, `Ctrl+``, `Mod+l`, `Mod+l` `L`, `Mod+,`.
- Visual: three shell baselines; every existing Studio baseline unchanged.
- Perf: `idle-cpu.mjs --blurred` on Vanguard ≤ baseline + 0.5 % of a core, numbers in the PR.
- **Open, for a human:** on a real Mac, open Vanguard and Studio side by side, change the theme in one, and
  confirm the other follows within a second; enter and leave full screen in Vanguard and confirm the traffic
  lights and title bar sit as they do in Studio; confirm the window logo matches the Dock icon.

## Not in this phase

- **`guardAppWindow` on Studio's own window.** Studio's main window doesn't call it today; adding it would
  change in-window navigation for the browser pane and web apps, which is its own security review.
- **An update pill outside Studio.** The launcher alone updates suite apps (CLAUDE.md); a read-only launcher
  feed in each app is a new cross-app read with no ask behind it.
- **The MCP indicator outside Studio.** Only Studio runs the MCP server.
- **Repo-bound segments in other apps** (liveness, verdicts, diagnostics, progress, automate, finance) — no
  other app has a repo.
- **Linux and Windows chrome.** macOS is the only supported platform; the non-darwin branch keeps the
  native frame.
- **A shared pty broker policy change.** Apps attach to brokers exactly as the runtime client does today;
  only the session listing changes.
- **Per-app accents beyond the logo tile and active nav item** — open decision on accent resolved as brand-only.

## Decisions

1. **Resolved — Terminal sessions: own by default, "Show all apps" toggle.** `TerminalSessionSchema` gains an
   optional `appId` (absent = studio, so no migration); Studio shows all. Keeps each app's list relevant
   without hiding a session the user started elsewhere.
2. **Resolved — Companion: the whole thing moves, behind a fat `CompanionHost`; one thread per app, shared
   voice and settings.** Chosen over a slim core so every app gets the full companion; the price is a host
   port with a method per cross-feature reach, stubbed outside Studio. F is re-tagged L ×2.
3. **Resolved — Loops ledger: shared, in the runtime, one file per app.** `<appData>/Midnite Runtime/loop-runs/<appId>.json`,
   merged on read, so a loop started in Vanguard shows in Studio's history and no two processes write the same
   file.
4. **Resolved — Single-view apps list their tabs as nav views; Settings always sits in the footer**, so no
   rail is ever one item.
5. **Resolved — Suite status segments: terminal and palette toggles, bell, monitor, assistant menu**, each
   dropped when its panel is absent. Repo-bound segments, the MCP indicator and the update pill stay Studio's.
6. **Resolved — Shared settings live in a runtime `suite-prefs.json`, not localStorage.** Each app has its own
   `userData` and origin, so localStorage cannot be shared; the file is served by each app's main and watched,
   so a change in one app shows live in all. App-specific pages keep their own storage.
7. **Resolved — Window helper is options + a structural attach, not an injected constructor**, mirroring
   `guardAppWindow`'s structural type, so each app's window options stay visible in its own main.
8. **Resolved — `SUITE_APP_IDS` lives in `packages/shared`**; the off-graph launcher imports it by source path.
9. **Resolved — `view.settings` on `Mod+,`, no menu accelerator.** Free today, the macOS convention, and
   CLAUDE.md keeps chords off the native menu.
10. **Resolved — Title bar right cluster in every app: `TitleBarStatus`, `TitleBarBattery`, `ThemeToggle`**;
    the agent/Ollama trio stays Studio's.
11. **Resolved — App accent is brand only** (logo tile, active nav item); the user's accent drives the rest.
12. **Resolved — All panels on by default in every app**, opt out per manifest — matches "same chords
    everywhere".
13. **Resolved — Roll-out in three batches of four or five apps, Studio last in its own PR**, so a regression
    shows in a small diff and Studio's baselines guard the final move.
