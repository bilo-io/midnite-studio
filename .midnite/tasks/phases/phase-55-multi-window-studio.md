# Phase 55 — Multi-Window Studio & Detachable Panels

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

---

## Deliverables

### Theme A — Window Lifecycle & IPC Infrastructure (M)

- [ ] **A.1** Define window management contracts in `packages/shared/src/domain/window.ts`:
  - `WindowRoleSchema` (`'main' | 'terminal' | 'repos' | 'fab' | 'browser'`).
  - `WindowOpenRequestSchema` (`{ role: WindowRole, repoPath?: string, activeId?: string }`).
  - `WindowCloseRequestSchema` (`{ windowId: number }`).
  - IPC channels: `CHANNELS.windowDetach`, `CHANNELS.windowDock`, `CHANNELS.windowList`, and `EVENT_CHANNELS.windowStateChanged`.
- [ ] **A.2** Create `packages/desktop/src/main/window-manager.ts`:
  - Track all active `BrowserWindow` instances by ID and assigned `WindowRole`.
  - Window creation factory with shared preload, security policies, background theme color, and custom titlebar styling.
  - Lifecycle handlers: re-docking on window close, remembering detached window dimensions and coordinates.
- [ ] **A.3** Generalize desktop IPC handlers from singleton window getters (`getWindow: () => BrowserWindow | null`) to event-sender resolvers (`resolveWindow(event.sender)`).
- [ ] **A.4** Update `packages/app/src/main.tsx` entrypoint to inspect window query parameters (`?window=<role>`) and conditionally render the dedicated detached panel container instead of `<App />`.

### Theme B — Universal Detach/Dock Affordances & Popout Chrome (M)

- [ ] **B.1** Top-left hover morph dock/undock affordances:
  - **Terminal Panel**: In `TerminalHeader`, hover on the leading agent/terminal icon reveals the undock button (`LuSquareArrowOutUpRight`).
  - **Git Repos Panel**: In `ReposPanel` top bar, hover on the leading repository/git icon reveals the undock button.
  - **Embedded Browser**: Position a dedicated undock icon button at the far left, on the exact same row/level as the browser tab strip.
  - **FAB / Loops Panel**: Add a new thin header bar titled **"Midnite Loops"** with the Midnite brand mark on the far left, which on hover reveals the dock/undock button.
- [ ] **B.2** Create reusable `DetachedWindowFrame` component:
  - Minimal custom frameless titlebar with macOS traffic light spacing.
  - Window title and current repository indicator.
  - Top-left "Re-dock into Main Window" button (`LuSquareArrowDownLeft`).
- [ ] **B.3** Provide keyboard shortcuts and Command Palette entries for docking/undocking each panel:
  - `window.detachTerminal`, `window.detachFab`, `window.detachBrowser`, `window.detachRepos`.

### Theme C — Detachable Terminal & FAB Loops Popouts (M)

- [ ] **C.1** Detached Terminal Popout:
  - Render `<TerminalPanel />` inside the detached window container.
  - Direct connection to existing PTY sessions via the shared PTY broker socket without restarting running processes.
  - When detached, the main window terminal drawer collapses cleanly with an inline indicator: *"Terminal open in detached window (click to re-dock)"*.
- [ ] **C.2** Detached FAB Loops Popout:
  - Render `<FabPanel />` with the full multi-loop tab strip, active halos, terminal outputs, and prompt composition.
  - When detached, main window FAB morph button reflects detached state and clicking it focuses the popout window.

### Theme D — Detachable Embedded Browser & WebContentsView Reparenting (M)

- [ ] **D.1** Main-process `WebContentsView` reparenting in `packages/desktop/src/main/browser-service.ts`:
  - When detaching the browser, remove `WebContentsView` from the primary `BrowserWindow.contentView` and attach to the popout `BrowserWindow.contentView`.
  - Seamless transfer without page reloads, session drops, or losing DOM input state.
- [ ] **D.2** Popout browser navigation bar and tab strip:
  - Move active browser tabs, address bar, find bar, and tab groups into the popout window.
  - Synchronize layout bounds via `setBrowserBounds` against the popout window dimensions.
- [ ] **D.3** Re-docking transition back to main window side-by-side or overlay layout.

### Theme E — Cross-Window State Synchronization via BroadcastChannel (M)

- [ ] **E.1** Implement `BroadcastChannel` state bridge in `packages/app/src/services/broadcast-sync.ts`:
  - Synchronize active repository selection, theme preference, and UI layout flags across all open renderer windows.
  - Sync Zustand stores (`ui-store`, `terminal-store`, `browser-store`, `repo-store`).
- [ ] **E.2** Cross-window React Query cache invalidation listener:
  - Triggering a refetch in one window (e.g. branch checkout or loop run start) emits a lightweight cache invalidation message so all detached windows refresh immediately.

### Theme F — Verification & Screenshots (S)

- [ ] **F.1** Automated unit and Playwright integration tests:
  - Verify window creation, IPC routing, and query parameter dispatching.
  - Test `BroadcastChannel` state replication between independent renderer instances.
- [ ] **F.2** Visual regression & screenshot verification:
  - Capture detached popouts for Terminal, FAB Loops, Git Repos, and Browser across light and dark themes.
- [ ] **F.3** Manual multi-monitor verification pass:
  - Detach all 4 panels across displays, run background agent tasks, and re-dock back into the main window.

---

## Files this phase touches

- [`packages/shared/src/domain/window.ts`](packages/shared/src/domain/window.ts) *(new)* — Multi-window IPC schemas and contracts.
- [`packages/shared/src/channels.ts`](packages/shared/src/channels.ts) — Add window management channel constants.
- [`packages/desktop/src/main/window-manager.ts`](packages/desktop/src/main/window-manager.ts) *(new)* — Multi-window registry and lifecycle controller.
- [`packages/desktop/src/main/browser-service.ts`](packages/desktop/src/main/browser-service.ts) — WebContentsView reparenting across windows.
- [`packages/desktop/src/main/ipc/window-handlers.ts`](packages/desktop/src/main/ipc/window-handlers.ts) *(new)* — Window detach/dock IPC endpoints.
- [`packages/app/src/main.tsx`](packages/app/src/main.tsx) — Query router for detached window entries.
- [`packages/app/src/components/fab-panel.tsx`](packages/app/src/components/fab-panel.tsx) — Thin "Midnite Loops" header with dock/undock hover logo.
- [`packages/app/src/features/terminal/terminal-header.tsx`](packages/app/src/features/terminal/terminal-header.tsx) — Terminal icon hover dock/undock morph.
- [`packages/app/src/features/repos/repos-panel.tsx`](packages/app/src/features/repos/repos-panel.tsx) — Repos header icon hover dock/undock morph.
- [`packages/app/src/features/browser/browser-pane.tsx`](packages/app/src/features/browser/browser-pane.tsx) — Tab-level left dock/undock button.
- [`packages/app/src/services/broadcast-sync.ts`](packages/app/src/services/broadcast-sync.ts) *(new)* — Cross-window Zustand / React Query sync.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green across all monorepo packages.
- [ ] Detaching and re-docking the Terminal panel preserves running shell sessions and WebGL terminal rendering.
- [ ] Detaching and re-docking the FAB Loops panel preserves active running loops, streaming logs, and visual halo state.
- [ ] Detaching the Embedded Browser reparents `WebContentsView` with zero page refresh and preserves navigation history.
- [ ] Top-left icon hover morphs display smoothly without layout shifting.
- [ ] Multi-window state changes (switching repo, theme toggle, running tests) synchronize instantaneously across all windows.
