# Phase 55 — Multi-Window Studio & Detachable Panels

**Refined: x1** · 2026-09-04 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

> **Builds on:** [Phase 30](phase-30-terminal-hardening.md) (detached terminal broker), [Phase 32](phase-32-browser-engine-and-tabs.md) (`WebContentsView` embedded browser), [Phase 35](phase-35-fab-mission-control.md) (FAB Loops console), and [Phase 51](phase-51-terminal-steadiness.md) (terminal steadiness & WebGL budgeting).
>
> **Scope guardrails:** Focuses on detaching and re-docking the 4 core auxiliary surfaces (**Terminal**, **Git Repos**, **FAB Loops**, and **Embedded Browser**) into dedicated secondary desktop windows. Universal top-left dock/undock affordances with hover morphs. Multi-monitor support via minimal frameless custom chrome. Freeform window tab docking matrices, full custom window tiling engines, or multi-workspace independent project windows stay out of scope.
>
> **Effort tags:** **(S)** ≤ half-day · **(M)** 1–2 days · **(L)** 3+ days · **(XL)** multi-week epic.

---

## Background & Architecture

Midnite Studio is designed around a unified workflow loop (Git, Terminal, Agents/Loops, Browser, Forge). On multi-monitor desktop setups, keeping auxiliary surfaces (like long-running agent loops, active terminal sessions, git repo trees, or browser web tabs) visible in dedicated secondary windows significantly improves productivity.

Because the main process in Electron can spawn multiple `BrowserWindow`s and the PTY broker already runs detached from any single UI view, detaching panels into popouts does not require recreating terminals or losing state. Furthermore, Electron's `WebContentsView` can be reparented between windows without reloading running web applications.

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Window                            │
│  ┌──────────┬─────────────────────────────┬──────────────┐  │
│  │  Repos   │        Commit Graph         │  FAB / Loops │  │
│  │ (popout) │                             │   (popout)   │  │
│  └──────────┴─────────────────────────────┴──────────────┘  │
│  │                    Terminal (popout)                  │  │
│  │                    Browser  (popout)                  │  │
└─────────────────────────────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Popout Win  │      │  Popout Win  │      │  Popout Win  │
│ (Midnite PTY │      │(Midnite Loops│      │  (Embedded   │
│   Terminal)  │      │   Console)   │      │   Browser)   │
└──────────────┘      └──────────────┘      └──────────────┘
```

### What the repo actually looks like today (audited 2026-09-04)

The three facts that shape every theme below, because each one contradicts an obvious-looking approach:

1. **The window domain is not empty.** [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) already carries a `// --- window chrome ---` block of six `mstudio:window:*` request channels, an `EVENT_CHANNELS.windowStateChanged`, and a `window` namespace on the preload bridge. **`windowStateChanged` is taken** — it carries `{maximized, fullScreen, focused}` and has three live consumers ([`window-chrome.ts:31,52`](../../../packages/desktop/src/main/window-chrome.ts), [`preload/index.ts:73,77,441`](../../../packages/desktop/src/preload/index.ts)). Detach/dock state needs its own channel name.
2. **`ptyData` reaches exactly one window.** The broker itself already fans out to every connected socket client ([`broker/server.ts` `broadcastData`](../../../packages/desktop/src/broker/server.ts)), but [`pty-service.ts:373`](../../../packages/desktop/src/main/pty-service.ts) terminates in `const win = getWindowThunk(); … win.webContents.send(EVENT_CHANNELS.ptyData, …)`. A second renderer attaching to a live session receives **nothing**. This is the single hardest problem in the phase and Theme C is built around it.
3. **The e2e suite never launches Electron.** [`playwright.config.ts`](../../../packages/app/playwright.config.ts) runs the Vite dev server against a mocked `window.midniteStudio` ([`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts), 2688 lines); `_electron.launch` appears nowhere in the repo and zero specs call `windows()`. Two real windows cannot be asserted on in that suite, so verification is split between bare vitest in `packages/desktop` and an explicit human pass.

---

## Deliverables

### Theme A — Window Lifecycle & IPC Infrastructure (L) — ✅ DONE (PR #139, 2026-09-04)

> **Lands first — every other theme imports from it.** A.1–A.4 are the contract; A.5–A.6 are lifecycle. Nothing in B–G compiles until A.1 and A.2 are in.

- [x] **A.1** Define window management contracts in [`packages/shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) *(new)*:
  - `WindowRoleSchema = z.enum(['main', 'terminal', 'repos', 'fab', 'browser'])`, `WindowRole = z.infer<…>` — the file follows [`domain/watch.ts`](../../../packages/shared/src/domain/watch.ts)'s shape exactly: `import { z } from 'zod'` as the only import, a JSDoc block per schema, and a sibling `z.infer` alias for each.
  - `WindowDescriptorSchema = z.object({ id: z.number().int(), role: WindowRoleSchema, repoId: z.string().nullable() })` — `id` is Electron's `BrowserWindow.id`.
  - Add `export * from './window';` to [`domain/index.ts`](../../../packages/shared/src/domain/index.ts), which is a flat barrel — a new module that is not listed there is not exported at all.
  - Request/response schemas go in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) beside the existing `WindowStateSchema` (`:1699`): `WindowDetachRequest = z.object({ role: WindowRoleSchema })`, `WindowDockRequest = z.object({ role: WindowRoleSchema })`, `WindowListResponse = z.array(WindowDescriptorSchema)`, `WindowsChangedEvent = z.object({ windows: z.array(WindowDescriptorSchema) })`.
  - New channel keys, appended to the **existing** `// --- window chrome ---` block, keeping the `mstudio:<domain>:<kebab-verb>` rule: `windowDetach: 'mstudio:window:detach'`, `windowDock: 'mstudio:window:dock'`, `windowList: 'mstudio:window:list'`, `windowFocusRole: 'mstudio:window:focus-role'`.
  - **The event channel is `windowsChanged: 'mstudio:window:windows-changed'`, not `windowStateChanged`** — that key already exists and means maximize/fullscreen/focus for `<TitleBar>`. Reusing it would deliver detach payloads to `windowChrome.onFullscreenChange`.
  - Bridge surface on [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), extending the existing `window` namespace (`:870`) rather than adding a sibling: `detach: (req: In<typeof S.WindowDetachRequest>) => void`, `dock: (req) => void`, `focusRole: (req) => void`, `list: () => Promise<WindowDescriptor[]>`, `onWindowsChanged: (handler: (e) => void) => Unsubscribe`, and the scalar `windowRole: WindowRole` (see A.4). Fire-and-forget verbs are typed `=> void`; subscriptions return `Unsubscribe`.
- [x] **A.2** Create [`packages/desktop/src/main/window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) *(new)*:
  - `export function createRoleWindow(role: WindowRole): BrowserWindow` — supersedes today's argument-less [`createWindow(): BrowserWindow`](../../../packages/desktop/src/main/window.ts) (`window.ts:42`), which stays as the `role: 'main'` path so the boot sequence in [`main/index.ts:434`](../../../packages/desktop/src/main/index.ts) is untouched.
  - Popout `BrowserWindowConstructorOptions` are **the main window's, verbatim** — `show: false`, `backgroundColor: '#09090b'`, the darwin-only `{ titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 16 } }` spread, and the same `webPreferences` (`preload`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`). Only `width`/`height` differ per role (defaults below). Copying rather than diverging is deliberate: a popout with weaker `webPreferences` would be a privilege split inside one app.
  - Each popout also gets `attachWindowChrome(win)` and the same `setWindowOpenHandler` that denies every `window.open` and routes `http(s)` to `shell.openExternal` — both already per-window in [`window.ts:87–107`](../../../packages/desktop/src/main/window.ts).
  - Registry: `const windows = new Map<number, { win: BrowserWindow; role: WindowRole }>()`, with `listWindows(): WindowDescriptor[]`, `windowForRole(role): BrowserWindow | null`, `resolveRole(win): WindowRole`. Modelled on [`stream-registry.ts:18`](../../../packages/desktop/src/main/stream-registry.ts)'s `WeakMap<BrowserWindow, …>`, which is already fully multi-window; a `Map` keyed by id is used here instead because `listWindows()` must enumerate.
  - Default popout sizes, applied only when `windows.json` has no saved bounds for that role: `terminal` 1100×640, `repos` 420×900, `fab` 520×820, `browser` 1280×860. Each is clamped by the same `minWidth: 900, minHeight: 560`? **No** — popouts take `minWidth: 360, minHeight: 320`, because a 420-wide Repos rail is the point of detaching it.
  - Every mutation of `windows` ends by pushing `EVENT_CHANNELS.windowsChanged` with the full descriptor list to **all** registered windows.
- [x] **A.3** Add `resolveWindow(event.sender)` and convert **only the four handler families a popout actually needs** — `pty`, `browser`, `watch`, `menu`:
  - `export function resolveWindow(sender: WebContents): BrowserWindow | null` lives in `window-manager.ts` and wraps `BrowserWindow.fromWebContents(sender)` — a call that currently appears **zero times** in the package.
  - [`ipc/handle.ts:19`](../../../packages/desktop/src/main/ipc/handle.ts) discards its `_event`. Add a sibling `handleFromSender<S, R>(channel, schema, handler: (payload, win: BrowserWindow) => …, onInvalid)` rather than changing `handle`'s signature — 30-odd existing call sites keep compiling untouched.
  - **The rule, written into the module doc so the split reads as intentional rather than half-finished:** a handler becomes sender-resolved only when two windows can legitimately ask for different answers. The remaining ~13 `getWindow: () => BrowserWindow | null` registration sites ([`repo-handlers.ts:29`](../../../packages/desktop/src/main/ipc/repo-handlers.ts), [`search-handlers.ts:12`](../../../packages/desktop/src/main/ipc/search-handlers.ts), [`tests-handlers.ts:58`](../../../packages/desktop/src/main/ipc/tests-handlers.ts), [`metrics-handlers.ts:19`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts), [`claude-handlers.ts:9`](../../../packages/desktop/src/main/ipc/claude-handlers.ts), [`update-service.ts:27`](../../../packages/desktop/src/main/update-service.ts), [`menu.ts:18,134`](../../../packages/desktop/src/main/menu.ts), [`workflow-service.ts:74`](../../../packages/desktop/src/main/workflow-service.ts), [`loop-runs.ts:46`](../../../packages/desktop/src/main/loop-runs.ts), [`video-service.ts:53`](../../../packages/desktop/src/main/video-service.ts)) keep `getWindow()` and it explicitly means *the main window* — renamed `getMainWindow` at those sites so the meaning is in the name.
- [x] **A.4** Teach a popout renderer its own role via `additionalArguments`, not a URL query:
  - New `export const WINDOW_ROLE_ARG = '--mstudio-window-role=';` in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), beside the existing `WINDOW_FRAMELESS_ARG` (`:681`) and `APP_VERSION_ARG` (`:694`).
  - `createRoleWindow` passes `` `${WINDOW_ROLE_ARG}${role}` `` in `webPreferences.additionalArguments`; [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) parses it at `:51–60` exactly as it already parses the other two, and exposes `windowRole` on the bridge. An unrecognised or absent value falls back to `'main'`.
  - [`packages/app/src/main.tsx`](../../../packages/app/src/main.tsx) — today 20 lines with no providers — branches on `window.midniteStudio?.windowRole`: `'main'` renders `<App />` unchanged; anything else renders `<DetachedRoot role={role} />`. Providers live in [`app.tsx`](../../../packages/app/src/app.tsx), so `DetachedRoot` mounts its **own** `ShellProviders` + `QueryClient` (a second renderer process has no access to the first's cache).
  - Why not `?window=<role>`: the argv switch is the established mechanism for per-window facts, it is typed at the bridge boundary instead of parsed from a string in the renderer, and it survives `loadFile` in the packaged build where there is no query string to carry.
- [x] **A.5** Persist popout geometry in a new main-process store [`packages/desktop/src/main/windows-store.ts`](../../../packages/desktop/src/main/windows-store.ts) *(new)*:
  - `type StoredState = { version: 1; bounds: Partial<Record<WindowRole, { x: number; y: number; width: number; height: number }>> }`, file name `windows.json` in `app.getPath('userData')` — copying [`repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts) (`{version: 1, paths: string[]}`, `repos.json`) line for line, including taking its directory as a constructor argument so tests can point it at a tmpdir. There is no `electron-store` dependency and this phase does not add one.
  - Written on the popout's `close` (debounced through the same `moved`/`resized` handlers), read in `createRoleWindow` before construction.
  - Geometry is main's concern, so main owns its durability — the alternative of a `ui-store` field would have every popout racing the same `localStorage` key.
- [x] **A.6** Window lifecycle and quit semantics:
  - **Closing the main window closes every popout.** The main window is the app; popouts are satellites. `main/index.ts`'s `mainWindow.on('closed')` (`:436`) additionally calls `closeAllPopouts()`, and the existing macOS `app.on('activate')` path (`:462`) then recreates a single main window exactly as today.
  - A popout closed by its own traffic light **re-docks** — it is the same outcome as pressing the re-dock button, so `ui-store`'s `<role>Detached` flag clears and the panel reappears in the main window. A popout close is never a way to lose a panel.
  - `destroyAllBrowserTabs()` stays wired to `before-quit` ([`index.ts:488`](../../../packages/desktop/src/main/index.ts)) and stays global — on quit, every window is going anyway.

### Theme B — Universal Detach/Dock Affordances & Popout Chrome (M) — ✅ DONE (PR #139, 2026-09-04)

- [x] **B.1** Top-left hover morph dock/undock affordances. All four imitate one existing pattern — [`terminal-session-list.tsx:350–367`](../../../packages/app/src/features/terminal/terminal-session-list.tsx), where a fixed-size box holds an `aria-hidden` glyph at `absolute … transition-opacity group-hover:opacity-0` and an `IconButton` at `opacity-0 transition-opacity group-hover:opacity-100`. The box keeps its size in both states, which is what makes the morph free of layout shift:
  - **Terminal Panel**: [`terminal-header.tsx`](../../../packages/app/src/features/terminal/terminal-header.tsx)'s `HeaderMark` (`:129–142`) becomes the morph's resting glyph — it already renders either `LuTerminal` or `resolveAgentIcon(agent)` at `size-3.5`. The header row itself (`:69`) gains `group`.
  - **Git Repos Panel**: [`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx)'s `<FaGitAlt className="h-3.5 w-3.5 shrink-0 text-[#F05032]" />` inside the `h-9` header (`:276–296`) is the resting glyph; the `<header>` gains `group`.
  - **Embedded Browser**: the button goes in [`tab-strip.tsx`](../../../packages/app/src/features/browser/tab-strip.tsx) — **not** `browser-pane.tsx`, which the original plan named. `BrowserTabStrip()` renders `role="tablist"` with `items-stretch` and no leading slot; tabs currently start flush at x=0. Insert a `shrink-0` button *before* the `SortableContext`, so it is on the tab strip's own row as specified.
  - **FAB / Loops Panel**: [`fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) has **no header today** — its first child is the tab bar (`:66`). Add an `h-7 flex items-center gap-2 border-b border-border px-2 shrink-0` bar above it, holding `<BrandMark className="h-4 w-4" />` on the far left (the morph's resting glyph) and the title *Midnite Loops* in `text-xs font-medium text-muted-foreground`.
  - Detach glyph is `LuSquareArrowOutUpRight` (one existing use, [`repos-panel.tsx:1389`](../../../packages/app/src/features/repos/repos-panel.tsx)); every button is an `IconButton size="sm"` whose `label` is both the tooltip and the accessible name — e.g. `"Detach Terminal into its own window"`.
- [x] **B.2** Create `DetachedWindowFrame` in [`packages/app/src/components/detached-window-frame.tsx`](../../../packages/app/src/components/detached-window-frame.tsx) *(new)*:
  - `export function DetachedWindowFrame({ role, title, children }: { role: WindowRole; title: string; children: ReactNode })`.
  - **It wraps `@bilo-io/shell`'s `<TitleBar>` rather than drawing its own chrome.** The `WindowChromeBridge` contract (`platform`, `frameless`, `onFullscreenChange`, `onFocusChange`, `setBackgroundColor`) is already implemented in the preload and already per-window; `attachWindowChrome(win)` (`window-chrome.ts:29`) already takes a `win` argument and needs no change. Re-implementing traffic-light spacing here would fork chrome behaviour between the main window and popouts for no gain.
  - `windowFrameless()` is `process.platform === 'darwin'` and `<TitleBar>` renders nothing when `frameless` is false, so Windows/Linux popouts keep their native frame with **no per-platform branch in this component**.
  - Right-hand slot carries the repo indicator (`ui-store.selectedRepoId` resolved to its basename) and the re-dock `IconButton` with `LuSquareArrowDownLeft` — currently **zero uses** in the renderer, so it reads unambiguously as "put this back".
- [x] **B.3** Commands and keyboard access, in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts):
  - Five new `COMMANDS` entries: `window.detachActive` (label *Detach Active Panel*, `chord: 'Mod+Shift+d'`, `scope: 'app'`) plus `window.detachTerminal`, `window.detachRepos`, `window.detachFab`, `window.detachBrowser` — **all four chord-free**, which `COMMANDS` supports and `view.refresh`/`sync.fetch` already do. `Mod+Shift+d` is unused today; the collision check is against the 41 bound chords, and note `Mod+m` and `Mod+Alt+l` are *forbidden by assertion* at [`ipc.test.ts:979`](../../../packages/shared/src/ipc/ipc.test.ts) — neither may be reused here.
  - Add `'window'` to the hand-written `CommandGroup` union — it is deliberately not derived from the id prefix, so a new prefix without a union member will not type-check.
  - `window.detachActive` joins **`TERMINAL_YIELD_COMMANDS`**: `Mod` is Ctrl off macOS, and `Ctrl+Shift+D` is meaningful inside a shell. Same reasoning that already put `fab.toggle` there.
  - A chord-free command's menu/palette label must come from `COMMANDS`, not `DEFAULT_KEYMAP` (which drops entries with no chord) — otherwise the four render as raw ids.
- [x] **B.4** The uniform re-dock strip — one affordance, four surfaces:
  - `export function DetachedPlaceholder({ role, label }: { role: WindowRole; label: string })` in [`packages/app/src/components/detached-placeholder.tsx`](../../../packages/app/src/components/detached-placeholder.tsx) *(new)*: a single `h-8` row, `text-xs text-muted-foreground`, centred, reading **"{label} is open in a detached window"** followed by a *Re-dock* button. The whole strip is clickable and calls `bridge().window.focusRole(role)`; only the button re-docks.
  - Literal copy per role: `Terminal`, `Git Repos`, `Midnite Loops`, `Browser`. Chosen over four bespoke treatments so a user learns the behaviour once — the original C.1/C.2 gave the terminal an inline strip and the FAB a morph-button state, which would have been two things to learn.
  - The FAB morph button additionally keeps its detached state: while `fabDetached`, it renders at reduced opacity and clicking it focuses the popout instead of opening the panel.
- [x] **B.5** Palette wiring for all five commands:
  - An entry each in `COMMAND_ICONS` ([`features/palette/command-icons.ts:36`](../../../packages/app/src/features/palette/command-icons.ts), typed `Record<CommandId, IconType>` — **exhaustive, so a new `CommandId` without an entry fails typecheck**). Reuse the panels' own palette glyphs where they exist (`repos.toggle` → `LuPanelLeft`, `fab.toggle` → `LuPanelRight`, `browser.toggle` → `LuGlobe`).
  - All five added to `PALETTE_SAFE` ([`features/palette/safety.ts:13`](../../../packages/app/src/features/palette/safety.ts)) — a command absent from that list never reaches the palette.
  - Handlers in the command runtime, each `enabled` only when that panel is currently docked (a detached panel's detach row is disabled with `disabledReason: 'Already open in a detached window'`).

### Theme C — Detachable Terminal & FAB Loops Popouts (M) — ✅ DONE (PR #139, 2026-09-04)

> **Depends on C.3.** C.1 cannot work until the pty routing defect is fixed; build C.3 first.

- [x] **C.1** Detached Terminal Popout:
  - `DetachedRoot` for `role: 'terminal'` renders `<DetachedWindowFrame role="terminal" title="Terminal">` around the existing `<TerminalPanel />`.
  - Re-attach uses the path that already exists and is stateless: `CHANNELS.ptySnapshot` → `sessionIdFor(ptyId)` → `fetchScrollbackSnapshot(sessionId)` → `trimScrollback(bytes, SCROLLBACK_BYTES)` ([`ipc/pty-handlers.ts:55–65`](../../../packages/desktop/src/main/ipc/pty-handlers.ts)). Scrollback lives in `pty-service.ts` module scope keyed by **session**, not by window, so a popout gets full history without touching the running process.
  - The main window's terminal drawer collapses to `<DetachedPlaceholder role="terminal" label="Terminal" />` (B.4). **No pty is killed, no shell restarted** — detaching is a UI move only.
- [x] **C.2** Detached FAB Loops Popout:
  - `DetachedRoot` for `role: 'fab'` renders `<FabPanel isOpen width={<window inner width>} fitSignal={<resize counter>} />`. `FabPanelProps` (`fab-panel.tsx:14–27`) is currently **not exported** — export it, since a second mount site now needs to satisfy it.
  - In a popout the panel is always open and always full-window: `isOpen` is hard-`true` and `width` tracks the window rather than `ui-store`'s resizable pane width, so the popout does not inherit a 520px main-window drag.
  - `fitSignal` increments on the popout's own `resize`, which is what makes the embedded xterm instances re-fit.
  - Active halos, the multi-loop tab strip, streaming output and prompt composition all come along unchanged — they are children of `FabPanel` and read from stores E.1 keeps in sync.
- [x] **C.3** Per-`ptyId` subscriber registry in [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) — **the fix that makes C.1 possible**:
  - Today `brokerClient.onData` ends in `const win = getWindowThunk(); … win.webContents.send(EVENT_CHANNELS.ptyData, …)` (`:373–376`), and `onExit` does the same (`:389–396`). One window, always.
  - Replace `getWindowThunk` with `subscribersFor(ptyId): BrowserWindow[]`, backed by `const ptySubscribers = new Map<string, Set<number>>()` (ptyId → window ids). New channels `ptySubscribe`/`ptyUnsubscribe` (`mstudio:pty:subscribe`, `mstudio:pty:unsubscribe`, payload `{ ptyId }`), resolved through `handleFromSender` so a renderer cannot subscribe another window.
  - A window's entries are dropped on its `closed` event, so a dead renderer cannot leak a subscription.
  - **Chosen over broadcasting to every window** because output volume is the terminal's whole performance story: Phase 51 budgeted WebGL and input backpressure for one consumer, and broadcasting would make every popout pay full throughput for sessions it never renders.
  - The in-process fallback path (`:462–465`, `:473–480`) gets the identical treatment — it is the path used when the broker is unavailable, and leaving it single-window would make popouts silently dead in exactly that degraded mode.
- [x] **C.4** `ui-store` learns the detached flags: `terminalDetached`, `reposDetached`, `fabDetached`, `browserDetached` (four booleans), added to `PersistedUi`, to `partialize`, and to the custom `merge`. Store `version: 7 → 8` with a `version < 8` arm seeding all four `false` — the existing `migrate` chain already has six such arms and this follows their form exactly.

### Theme D — Detachable Embedded Browser & WebContentsView Reparenting (M) — ✅ DONE (PR #139, 2026-09-04)

- [x] **D.1** Main-process `WebContentsView` reparenting in [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts):
  - The state container already carries the owning window: `type Tracked = { view: WebContentsView; win: BrowserWindow }` (`:22`), with `tabs = new Map<string, Tracked>()`. Reparenting is therefore `tracked.win.contentView.removeChildView(tracked.view)` → `next.contentView.addChildView(tracked.view)` → `tracked.win = next`, not a rebuild.
  - `export function reparentBrowserTabs(next: BrowserWindow): void` moves **every** tracked tab (see D.3) and leaves `partition: 'persist:browser'` untouched, so cookies, storage and login sessions are literally the same session object.
  - No `loadURL`, no `reload`, no `setWindowOpenHandler` re-registration — the view keeps its `webContents`, so navigation history and in-page DOM state (scroll position, half-typed form fields) survive by construction.
- [x] **D.2** Popout browser navigation bar and tab strip:
  - `DetachedRoot` for `role: 'browser'` renders `<DetachedWindowFrame>` around `<BrowserTabStrip />` and the `h-9` toolbar row from [`browser-pane.tsx:166`](../../../packages/app/src/features/browser/browser-pane.tsx) (address bar, back/forward/reload, find bar), then the bounds-carrying body div.
  - Bounds sync goes through the existing hook [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) — `useBrowserBounds(activeTabId, visible)` returning `{ ref, sync }`, which calls `bridge().browser.setBounds({ tabId, bounds })` off a `ResizeObserver` plus a `window` resize listener. **The renderer API is `browser.setBounds`; `setBrowserBounds` is the main-process function** (`browser-service.ts:276`) and is not callable from the renderer.
  - The hook's occlusion gate (`visible && occluders === 0`, read from `ui-store.occluders`) is per-renderer, so a modal open in the main window must not blank the popout's view — the popout reads its **own** store instance.
- [x] **D.3** Re-docking, and the all-tabs rule:
  - **Detaching moves the entire browser surface** — every `WebContentsView`, the tab strip, and the toolbar. The main window shows `<DetachedPlaceholder role="browser" label="Browser" />`. Re-docking is the same call with the main window as `next`.
  - Chosen over moving only the active tab because split tabs would require the strip in both windows plus drag-between-windows — the "freeform window tab docking matrices" the scope guardrails already exclude.
  - Re-dock restores the pane to whatever `ui-store.browserLayout` says (the existing side-by-side/overlay field) — the phase adds no new layout mode.
- [x] **D.4** Make tab activation window-scoped:
  - `activateBrowserTab` (`:286–288`) currently runs `for (const [id, tracked] of tabs) tracked.view.setVisible(id === tabId)` across **all** tabs process-wide, on the documented assumption that "only one view is ever attached-and-visible". With D.3 that assumption holds only within a window.
  - Narrow the loop to tabs whose `tracked.win` matches the activating tab's window. Without this, activating a tab in the popout hides nothing incorrectly today but will regress the moment any tab lives elsewhere — and it is the exact bug D.1 would otherwise introduce silently.

### Theme E — Cross-Window State Synchronization (M) — ✅ DONE (PR #143, 2026-09-04)

- [x] **E.1** Implement the state bridge in [`packages/app/src/services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) *(new)*:
  - **Two transports, one authority.** The main-process relay (`mstudio:window:relay`, main rebroadcasts any window's message to every *other* window) is authoritative and always runs; `BroadcastChannel('midnite-studio')` is a same-origin fast path layered on top. The relay cannot be the untested half: in the packaged build renderers load from `file://`, where origins are opaque and `BroadcastChannel` may never fire between windows — dev (`http://localhost:5173`) would pass while the shipped app silently desynced.
  - Messages are de-duplicated by a per-message `id` (a `crypto.randomUUID()`), so a payload arriving on both transports applies once.
  - **Synced state is an explicit allowlist, not a whole store.** `ui-store` persists ~60 fields and syncing all of them would have two windows fighting over pane sizes. The allowlist is: `selectedRepoId`, `selectedWorktreePath`, the four `*Detached` flags, and the whole of `appearance-store` (accent, motion, density, uiFont, background, bgIntensity, effects, shimmer).
  - **`browser-store` syncs** (tabs, groups, `activeTabId`) because after D.3 both windows can render the strip. **`terminal-store` does not** — it is deliberately unpersisted, main owns terminal durability via `terminals.json`, and a synced second copy would be exactly the drifting duplicate its module doc warns against.
  - There is **no renderer `repo-store`** — the original plan named one. Selected repo lives in `ui-store`; the repo *list* is React Query (`keys.repos`) and is covered by E.2.
- [x] **E.2** Cross-window React Query invalidation:
  - The client is configured `staleTime: Number.POSITIVE_INFINITY`, `refetchOnWindowFocus: false`, `retry: false` ([`app.tsx:167`](../../../packages/app/src/app.tsx)) — deliberately, because freshness comes from the watcher, not polling. So a popout **never refetches on its own**: without this item its data is frozen at mount.
  - Reuse the existing seam rather than inventing one: [`invalidateForWatchKind(client, repoId, kind)`](../../../packages/app/src/services/watch-invalidation.ts) already maps a `WatchKind` to the narrowest correct invalidation plus a `{restreamGraph}` flag. A relayed `{ repoId, kind }` message calls exactly that function in every other window.
  - Main pushes `watchEvent` to one window today ([`watch-service.ts:27`](../../../packages/desktop/src/main/watch-service.ts) takes an explicit `win`); `reconcileWatchers` is bound to the main window at [`index.ts:456`](../../../packages/desktop/src/main/index.ts). Keep that, and let the main window relay — one watcher, N consumers, no duplicate `git status` per popout.
  - The documented key invariant holds: "a key outside the `repos/<id>` prefix is never invalidated by the watcher" ([`queries.ts:69`](../../../packages/app/src/services/queries.ts)).
- [x] **E.3** Theme and appearance propagation:
  - Theme is **not** in any Zustand store — `@bilo-io/ui`'s `ThemeProvider` reads `localStorage['midnite.theme']` **once on mount** and applies `documentElement.classList.toggle('dark', …)` plus `style.colorScheme`. There is no `storage` listener, so a flip in one window never reaches another.
  - A popout gets the *stored* theme free at boot via the pre-paint script in [`index.html:19–41`](../../../packages/app/index.html). This item covers *later* flips: the theme change rides the E.1 relay, and each window applies the same two DOM mutations.
  - Two existing consumers already observe that class and keep working unchanged: `useWindowBackgroundSync()`'s `MutationObserver` on `attributeFilter: ['class']` ([`app.tsx:1503`](../../../packages/app/src/app.tsx)) and [`terminal-view.tsx:82,748`](../../../packages/app/src/features/terminal/terminal-view.tsx). Verifying the popout's native backing retints is what proves the chain end to end.
- [x] **E.4** Echo suppression and ordering:
  - Every applied message sets a module-level `applying = true` around the store write so the subscriber that would rebroadcast it stays silent — without this, two windows ping-pong a single change forever.
  - Messages carry the originating window id; a window ignores its own.
  - A window that mounts mid-session pulls current state once via `bridge().window.list()` plus its own persisted stores, rather than waiting for the next change.

### Theme F — Verification & Screenshots (M) — ◐ PARTIAL (PR #143, 2026-09-04) — F.3 open, for a human

- [x] **F.1** Automated coverage, at the layer that can actually run it:
  - **Bare vitest in `packages/desktop`** — new `window-manager.test.ts` and `pty-subscribers.test.ts`. Assertions: `createRoleWindow` registers exactly one descriptor per role and `listWindows()` returns it; a second `createRoleWindow('terminal')` focuses the existing window instead of opening a second; `resolveRole` round-trips; closing a window removes its descriptor **and** all its pty subscriptions; `subscribersFor(ptyId)` returns only windows that subscribed.
  - `windows-store.test.ts` against a tmpdir: bounds written on close are read back on the next `createRoleWindow`; a corrupt/absent `windows.json` yields role defaults rather than throwing (same fail-soft posture as `repo-store.ts`).
  - Renderer-side vitest for `broadcast-sync.ts`: two `applySync` calls with the same message `id` apply once; a message whose origin is this window is ignored; `applying` suppresses rebroadcast.
  - **No Electron Playwright suite is added.** The existing e2e suite runs Vite + a mocked bridge and cannot see a second window; standing up `_electron.launch` would be new CI infrastructure while Phase 38 is still retiring `KNOWN_RED`. Real two-window behaviour is F.3's human pass instead.
- [x] **F.2** Visual regression & screenshot verification:
  - New `packages/app/e2e/detached-panels-shots.spec.ts`, following the ~25 existing `*-shots.spec.ts` files: gated by `test.skip(!process.env['MSTUDIO_SHOTS'], …)`, output to `docs/screenshots/phase-55-multi-window/`, invoked as `MSTUDIO_SHOTS=1 pnpm exec playwright test e2e/detached-panels-shots.spec.ts`.
  - It photographs the *renderer-side* halves that the mocked bridge can reach: each `DetachedRoot` role rendered standalone, and each `DetachedPlaceholder` in the main layout — light and dark, dark via `document.documentElement.classList.add('dark')` as the other shots specs do.
  - The `window` namespace in [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) gains `detach`, `dock`, `focusRole`, `list`, `onWindowsChanged` and the `windowRole` scalar — the object literal there is serialised via `addInitScript` and may not close over anything from the test file.
- [ ] **F.3** **Open, for a human:** multi-monitor pass — detach all four panels across two displays, confirm a running `claude` session keeps streaming into the terminal popout, start a loop and watch its halo animate in the FAB popout, navigate the browser popout and confirm no reload on re-dock, flip the theme in the main window and watch all four follow, then re-dock everything and confirm the main window is whole.
- [x] **F.4** Extend the IPC guard so these channels cannot land unvalidated:
  - [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts)'s exhaustiveness guards are **prefix-scoped and opt-in**, and there is currently **no `window*` block at all** — the two global guards (unique names, `mstudio:` prefix) are all a new window channel gets today.
  - Add a `covers every window channel with a schema` block in the shape of the `metrics` one (`:778`): an `expected: Record<string, string[]>` mapping every `window`-prefixed key in `CHANNELS`/`EVENT_CHANNELS` to its schema export names, `expect(channelKeys.sort()).toEqual(Object.keys(expected).sort())`, and a `toHaveProperty` per name. The pre-existing chrome channels (`windowMinimize`, `windowClose`, …) are listed with `[]` where they carry no payload, exactly as `metricsStop` is.

### Theme G — Edge cases, diagnostics, and the invariants that stay single-window (M) — ✅ DONE (PR #143, 2026-09-04)

- [x] **G.1** Metrics stay bound to the main window, deliberately:
  - `bindMetricsToWindow(service, win)` ([`metrics-handlers.ts:54`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts)) binds one shared `MetricsService` to one window's `blur`/`focus`/`hide`/`show`/`minimize`/`restore`/`closed`. Two windows would fight over pause/resume.
  - Popouts render **no footer monitor** and never call `metrics.start()`. Phase 37's idle-CPU gating and [`scripts/perf/idle-cpu.mjs`](../../../scripts/perf/idle-cpu.mjs) both assume a single window and keep working untouched.
- [x] **G.2** Repo switch while detached: changing `selectedRepoId` in any window relays (E.1) and every popout re-renders against the new repo. The Repos popout is the one window that must **not** collapse or close on the switch — it is the switcher.
- [x] **G.3** Popout crash and renderer death:
  - `bindRenderProcessGone(win, defaultLogger)` — already applied to the main window at [`index.ts:443`](../../../packages/desktop/src/main/index.ts) — is applied to every popout by `createRoleWindow`.
  - A popout whose renderer dies is closed and re-docked (A.6's rule), so the panel comes back in the main window rather than leaving a dead frame on a second monitor. The log line names the role.
- [x] **G.4** Off-screen and display-change safety:
  - Saved bounds are validated against `screen.getAllDisplays()` before use; a rect whose origin falls outside every display's work area is discarded and the role's default size is used instead. Unplugging the monitor a popout lived on must not make it unreachable — the failure mode is a window positioned at `x: 3000` on a single 1440-wide display, invisible with no way to drag it back.
  - This is the phase's first use of Electron's `screen` module; it is main-process only.
- [x] **G.5** Per-window diagnostics: every `window-manager` mutation logs one line through the existing single log seam — `[window] open role=terminal id=3`, `[window] close role=terminal id=3 reason=redock|closed|crashed`. `MSTUDIO_PERF=1` boot marks stay main-window-only; a popout does not emit boot stages, because `startup-report.mjs` medians would otherwise mix two windows' marks.

### Theme H — Detachable PAGES, and the state they must share (M) — ✅ DONE (PR #177, 2026-09-05)

> Themes A–G detach **panels**, which *move*: the docked slot collapses and the popout becomes the
> only copy. A page cannot work that way — the main window has to go on rendering the view — so a
> page detaches by **duplicating**, and that one difference is what H, I and J are all about.
> [PR #175](https://github.com/bilo-io/midnite-studio/pull/175) landed the first five pages; this
> theme is the state-sharing half plus the two bugs #175 shipped with.

- [x] **H.1** Split `WindowRole` into `PANEL_WINDOW_ROLES` (move) and `PAGE_WINDOW_ROLES` (duplicate) in [`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts), with `isPageWindowRole` as the seam every consumer branches on. One role per page rather than a `page` role carrying a `ViewId`, because `windowForRole` then enforces at most one window per page for free — which is also what bounds the cost of duplicate rendering.
- [x] **H.2** Widen Theme E's relay allowlist with the three page-selection slices that visibly drift once the same view runs in two windows: `actions-store`'s `selectedRun`/`selectedJob`, `files-store`'s `scopeKey` + `selectedPath`, `workbench-store`'s `tabs` + `activeTabId`. `scopeKey` travels WITH the path — a relPath under a stale checkout points at a file in a different repository.
- [x] **H.3** View **furniture** deliberately stays local: `files-store.expanded`, `actions-store.collapsedWorkflows`, `file-editor-store`'s target line. Selection is a shared answer to "what am I looking at"; furniture is how one window is arranged to look at it, and syncing it is the pane-size fight Theme E already ruled out. Asserted, not just described (`broadcast-sync.test.ts`).
- [x] **H.4** **Bug, reported against #175 — the popout theme flicker.** `applying` guards the zustand subscribers, which run synchronously inside `applyIncoming`; it cannot guard the theme `MutationObserver`, whose callback is a **microtask** delivered after the `finally` has reset the flag. Every relayed theme message therefore made the receiving window rebroadcast it — with two windows the echo damps, with three it amplifies and `<html>` flips class many times a second. `applyTheme` now records `lastDark`/`lastPaletteId` (module-level) *before* mutating, and writes `ThemeProvider`'s own `localStorage` key so the DOM and its React state cannot disagree across a reload.

### Theme I — One watcher, N consumers (M) — ✅ DONE (PR #177, 2026-09-05)

- [x] **I.1** `watch-service.ts` captured one `BrowserWindow` at watcher-start time, so `watchEvent` reached main and nowhere else; every other window stayed fresh only because main's renderer rebroadcast it over the Theme E relay. A detached page is a full data-driven view, not a panel — its freshness must not depend on another window's renderer being mounted and awake to forward for it.
- [x] **I.2** Fan-out at the send, **not** a watcher per window: `broadcastToAllWindows` in `window-manager.ts`, with `watchers` still keyed by repoId. A repo open in three windows is watched once and costs three `webContents.send` calls rather than three recursive fs trees.
- [x] **I.3** `useWatchInvalidation` stops relaying watch events (main now delivers to every window, so a relay would double-invalidate). `requestRestream` stays per-window — only the window whose graph shows `selectedRepoId` should pay for a re-stream.
- [x] **I.4** **Bug, reported against #175 — the detached Graph never loaded.** `logStart`/`logCancel` and `searchStart`/`searchCancel` resolved their target with `getWindow()` — always main — while answering over an EVENT channel. A popout started a stream and main received every row. Now `handleFromSender`/`handleOpFromSender` (`handle.ts` gains the latter); `registerSearchHandlers` no longer takes a window accessor at all.

### Theme J — The rest of the pages (M) — ✅ DONE (PR #177, 2026-09-05)

- [x] **J.1** Eight more marks: Dashboard, Search, Tests, Projects, Reviews, Issues, History, Optimizer — thirteen detachable pages in all.
- [x] **J.2** Hand-placed per header rather than behind a shared `PageHeader`, because those headers differ for good reasons: History and Reviews are `role="tablist"` rows a non-tab child has no business joining (the mark goes *beside* the tablist, as `workbench.tsx` already does), Optimizer's is a block-flow two-row stack, and Search's sizes its children `flex-1`.
- [x] **J.3** Seven `ViewId`s stay out, and the reason splits in two. `settings`/`landing`/`sessions` are surfaces nobody wants twice. `councils`/`workflows`/`video` are excluded because duplicate rendering is only safe for a view whose **mount has no load-bearing side effects** — the trap `view-registry.tsx` records `BrowserPane` falling into. Asserted in `page-detach-mark.test.ts`.

---

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) *(new)* — `WindowRoleSchema`, `WindowDescriptorSchema`; [`shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) — the barrel entry, without which nothing is exported; [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — 4 request channels + `windowsChanged` + `WINDOW_ROLE_ARG`; [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — request/response schemas beside `WindowStateSchema` (`:1699`); [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — extends the existing `window` namespace (`:870`); [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — 5 commands, the `'window'` `CommandGroup`, one `TERMINAL_YIELD_COMMANDS` entry |
| Main — windowing | [`desktop/src/main/window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) *(new)*; [`desktop/src/main/windows-store.ts`](../../../packages/desktop/src/main/windows-store.ts) *(new)*; [`desktop/src/main/ipc/window-handlers.ts`](../../../packages/desktop/src/main/ipc/window-handlers.ts) *(new)*; [`desktop/src/main/window.ts`](../../../packages/desktop/src/main/window.ts) — `createWindow` becomes the `role: 'main'` path; [`desktop/src/main/window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts) (**unchanged** — `attachWindowChrome(win)` is already per-window and load-bearing for B.2); [`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) — registration, `closed` handler, `getWindow` → `getMainWindow` renames |
| Main — routing | [`desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) — new `handleFromSender`, existing `handle` untouched; [`desktop/src/main/pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) — the subscriber registry replacing `getWindowThunk` at `:373`/`:389`/`:462`/`:473`; [`desktop/src/main/ipc/pty-handlers.ts`](../../../packages/desktop/src/main/ipc/pty-handlers.ts) — subscribe/unsubscribe; [`desktop/src/main/browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) — `reparentBrowserTabs`, window-scoped `activateBrowserTab`; [`desktop/src/main/ipc/browser-handlers.ts`](../../../packages/desktop/src/main/ipc/browser-handlers.ts); [`desktop/src/main/stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) (**unchanged** — already `WeakMap`-per-window, the pattern A.2 imitates) |
| Preload | [`desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — `windowRole` from argv (`:51–60` pattern), the new `window` methods, pty subscribe/unsubscribe |
| Renderer — entry | [`app/src/main.tsx`](../../../packages/app/src/main.tsx) — role branch; [`app/src/detached-root.tsx`](../../../packages/app/src/detached-root.tsx) *(new)* — per-role tree with its own providers; [`app/src/app.tsx`](../../../packages/app/src/app.tsx) — placeholder mounts, FAB morph detached state |
| Renderer — chrome | [`app/src/components/detached-window-frame.tsx`](../../../packages/app/src/components/detached-window-frame.tsx) *(new)*; [`app/src/components/detached-placeholder.tsx`](../../../packages/app/src/components/detached-placeholder.tsx) *(new)*; [`app/src/components/icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx) (**unchanged** — `IconComponent`/`IconButton` are what every affordance uses) |
| Renderer — panels | [`app/src/features/terminal/terminal-header.tsx`](../../../packages/app/src/features/terminal/terminal-header.tsx) — `HeaderMark` morph; [`app/src/features/repos/repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx) — `FaGitAlt` morph in the `h-9` header; [`app/src/features/browser/tab-strip.tsx`](../../../packages/app/src/features/browser/tab-strip.tsx) — the leading undock button (**not** `browser-pane.tsx`); [`app/src/features/browser/browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) — placeholder + toolbar reuse; [`app/src/features/browser/use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts); [`app/src/components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) — new `h-7` header, exported props |
| Renderer — state | [`app/src/services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) *(new)*; [`app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — 4 flags, `PersistedUi`, `partialize`, `merge`, `version: 8` + migrate arm; [`app/src/store/browser-store.ts`](../../../packages/app/src/store/browser-store.ts); [`app/src/services/watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts) (**unchanged** — `invalidateForWatchKind` is the seam E.2 calls); [`app/src/services/queries.ts`](../../../packages/app/src/services/queries.ts) (**unchanged**) |
| Renderer — palette | [`app/src/features/palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts) — exhaustive `Record<CommandId, IconType>`; [`app/src/features/palette/safety.ts`](../../../packages/app/src/features/palette/safety.ts) — `PALETTE_SAFE` |
| Tests | [`shared/src/ipc/ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts) — the new `window*` guard block; new `desktop/src/main/window-manager.test.ts`, `windows-store.test.ts`, `pty-subscribers.test.ts`; new `app/src/services/broadcast-sync.test.ts`; new `app/e2e/detached-panels-shots.spec.ts`; [`app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — the `window` namespace + `windowRole` |
| Docs | [`.midnite/tasks/outstanding.md`](../outstanding.md) — record the deferred items from *Not in this phase*; [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) |

---

## Verification

- [x] `moon run :typecheck :lint :test` green across all monorepo packages.
- [ ] `window-manager.test.ts`: `createRoleWindow(role)` registers one descriptor; a repeat call for a live role focuses rather than duplicates; `closed` removes the descriptor and every pty subscription that window held.
- [ ] `windows-store.test.ts`: bounds survive a close/reopen round trip against a tmpdir; a corrupt `windows.json` falls back to role defaults without throwing.
- [ ] `pty-subscribers.test.ts`: `subscribersFor(ptyId)` returns only subscribed windows; two windows subscribed to one ptyId both receive `ptyData`; an unsubscribed window receives none.
- [ ] `ipc.test.ts`: the new `window*` block fails if any `window`-prefixed channel key lacks a row in its `expected` map.
- [x] `broadcast-sync.test.ts`: a duplicate message `id` applies once; a self-originated message is ignored; `applying` suppresses rebroadcast (no ping-pong).
- [ ] `ui-store` migrate: a persisted `version: 7` blob loads with all four `*Detached` flags `false` and no other field disturbed.
- [ ] `icon-names.test.ts` still passes with `LuSquareArrowDownLeft` added — it resolves to a real `react-icons/lu` export and is imported with the `Lu` prefix via a plain named import.
- [ ] Detaching and re-docking the Terminal panel preserves running shell sessions and WebGL terminal rendering — the pty's `pid` is unchanged across the round trip.
- [ ] Detaching and re-docking the FAB Loops panel preserves active running loops, streaming logs, and visual halo state.
- [ ] Detaching the Embedded Browser reparents `WebContentsView` with zero page refresh and preserves navigation history — asserted by `webContents.getURL()` and history length being identical either side, with no `did-start-loading` in between.
- [ ] Top-left icon hover morphs display smoothly without layout shifting — the morph box keeps a fixed size in both states, so the header's total width is unchanged between rest and hover.
- [ ] `MSTUDIO_SHOTS=1` writes light and dark frames for all four `DetachedRoot` roles and all four placeholders into `docs/screenshots/phase-55-multi-window/`.
- [ ] **Open, for a human:** the F.3 multi-monitor pass — four panels across two displays, a live agent session, a running loop, a theme flip, then a full re-dock.
- [ ] **Open, for a human:** unplug or disable the display a popout occupies and relaunch; the popout must reappear on a visible display at its role default, never off-screen.

**Themes H/I/J (PR #177):**

- [x] `broadcast-sync.test.ts`: each page-selection slice relays and applies; a relayed slice does not ping-pong back out; furniture (`expanded`, `collapsedWorkflows`) relays nothing.
- [x] `broadcast-sync.test.ts`: a relayed **theme** is not rebroadcast — asserted after a microtask *and* a macrotask turn, which is the only way to catch the `MutationObserver` timing the old `applying` guard missed. Verified to fail without the fix.
- [x] `watch-service.test.ts`: one watcher per repo however many windows are open; each event fans out rather than going to one captured window; a repo leaving the registry stops its watcher.
- [x] `stream-window-routing.test.ts`: `logStart` starts the stream for the window that ASKED, not the main window. Verified to fail without the fix.
- [x] `page-detach-mark.test.tsx`: all three states of the mark; `PAGE_ROLE_TITLE` covers exactly `PAGE_WINDOW_ROLES`; the six excluded views are absent.
- [x] `detached-pages-shots.spec.ts` writes 31 frames into `docs/screenshots/adhoc-page-detach/`. Three roles are out of the shot lists by design — `tests`/`projects` hide their header behind a data guard, `optimizer`'s rail row is behind a default-off setting — and the spec says so.
- [ ] **Open, for a human:** open a page popout alongside two others and flip the theme; the class must settle once, not oscillate. Then detach the Graph and confirm rows stream into the popout, not the main window.

---

## Not in this phase

- **Splitting browser tabs across windows.** Tabs move as a set (D.3). Per-tab placement needs the strip in every window plus drag-between-windows, which is the docking-matrix scope the guardrails already exclude.
- **A second main window / multi-workspace.** One repo workspace, one main window; popouts are satellites of it (A.6). Independent project windows are a different feature with its own store partitioning.
- **An Electron Playwright harness.** Deferred to keep new CI infrastructure out of a phase that already spans main, preload and renderer — and because Phase 38 has not finished retiring `KNOWN_RED`.
- **Per-window metrics/footer.** Popouts show no system monitor (G.1); one shared `MetricsService` stays bound to the main window so Phase 37's idle-CPU budget still holds.
- **Converting all 17 `getWindow` call sites.** Only pty, browser, watch and menu become sender-resolved (A.3); the rest keep an explicitly main-window meaning, renamed to say so.
- **Custom tiling or snap layouts.** Popout geometry is the OS's business; this phase only remembers and validates bounds.
- **Windows/Linux frameless chrome.** `windowFrameless()` is darwin-only and `<TitleBar>` renders nothing elsewhere, so popouts keep the native frame off macOS — unchanged from the main window's own behaviour.

---

## Decisions / open questions

- **Resolved — the detach event channel is `windowsChanged` (`mstudio:window:windows-changed`), not `windowStateChanged`.** The latter already exists and carries `{maximized, fullScreen, focused}` to three consumers including `windowChrome.onFullscreenChange`; reusing the key would silently deliver detach payloads into the title bar's fullscreen handler.
- **Resolved — role reaches the renderer via `WINDOW_ROLE_ARG` in `additionalArguments`, not `?window=<role>`.** It is the established mechanism for per-window facts (`WINDOW_FRAMELESS_ARG`, `APP_VERSION_ARG`), it arrives typed at the bridge boundary instead of being parsed from a string in the renderer, and it survives `loadFile` in the packaged build where there is no query string.
- **Resolved — pty output routes through a per-`ptyId` subscriber registry.** Broadcasting to every window was the simpler fix but would make each popout pay full terminal throughput for sessions it never renders, against Phase 51's WebGL and backpressure budgeting. The registry means no window pays for output it does not show.
- **Resolved — cross-window state uses a main-process relay as the authority, with `BroadcastChannel` as a same-origin fast path.** Two transports were chosen over `BroadcastChannel` alone because the packaged app loads renderers from `file://`, where opaque origins can stop it firing between windows — dev would have passed while the shipped build desynced. Messages carry an `id` so a payload arriving on both applies once.
- **Resolved — popout bounds persist in a new main-process `windows.json`.** Geometry is main's concern, and a `ui-store` field would have every popout racing one `localStorage` key. The store copies `repo-store.ts`'s `{version: 1, …}` shape; no `electron-store` dependency is added.
- **Resolved — A.3 converts only pty, browser, watch and menu to sender-resolved handlers.** Converting all 17 sites would touch every feature at once for handlers that have no multi-window meaning. The remaining sites are renamed `getMainWindow` so the split is legible rather than looking half-finished.
- **Resolved — one chord, `Mod+Shift+d` on `window.detachActive`; the four per-panel commands are chord-free palette rows.** The `Mod+Shift+` space is nearly exhausted (a, e, f, g, i, l, p, r, t, u taken) and `Mod+m`/`Mod+Alt+l` are forbidden by assertion. One chord for the common case plus four discoverable palette rows beats four collisions.
- **Resolved — all four panels collapse to the same `DetachedPlaceholder` strip.** The original plan gave the terminal an inline notice and the FAB a morph-button state — two behaviours to learn for one concept. The FAB button additionally reflects detached state, but the strip is the uniform path back.
- **Resolved — closing the main window closes every popout.** The main window is the app; the existing macOS `activate` handler then recreates it. A popout closed on its own re-docks instead, so closing a window is never a way to lose a panel.
- **Resolved — detaching the browser moves every tab.** Splitting tabs across windows needs the strip in both plus drag-between-windows, which the scope guardrails exclude. `activateBrowserTab` becomes window-scoped in the same change, since its "only one view is ever visible" assumption survives only within a window.
- **Resolved — theme changes ride the Theme E relay.** `ThemeProvider` reads `midnite.theme` once on mount with no `storage` listener, so popouts would otherwise hold a stale theme until relaunch. Boot-time pickup is already free via `index.html`'s pre-paint script; this covers later flips, and reuses the transport E.1 builds rather than adding a third sync path.
- **Resolved — metrics stay bound to the main window and popouts render no footer.** `bindMetricsToWindow` ties one shared service to one window's visibility events; two windows would fight over pause/resume and multiply the idle CPU that Phases 36 and 37 spent two phases reducing.
- **Resolved — automated coverage is bare vitest in `packages/desktop` plus a human multi-window pass.** The e2e suite runs Vite against a mocked bridge and never launches Electron, so two real windows are not observable there; standing up `_electron.launch` is new CI infrastructure this phase declines to add.
- **Open — whether the Repos popout should offer a repo picker of its own.** It is the one popout whose whole content is a switcher, and on a second monitor it is plausibly the only window a user looks at. *Recommendation:* ship G.2's relay-driven behaviour first and see whether the main window's picker actually feels far away before adding a second one.
- **Open — whether `ui-store`'s pane sizes should sync at all.** The E.1 allowlist excludes them so two windows cannot fight over a drag, but a user who resizes the docked Repos rail may expect the popout's width to follow. *Recommendation:* leave them unsynced; a popout's width is the window's, and `windows.json` already remembers it per role.
