# Phase 32 — The browser gets an engine, and the tabs to fill it

**Refined: x1** · 2026-09-05 · functionality & edge cases, data model & IPC contract, persistence & migration, empty/loading/error states, accessibility & keyboard, performance & scale, testing & verification, sequencing & dependencies, file-map precision, out-of-scope tightening

**Read this paragraph before anything below it.** This doc was written against a repo that no
longer exists. Themes A–D landed on 2026-08-30 and Themes E–I landed *partially* over the same
weekend, but their boxes were never ticked and their prose was never re-read, so the framing that
used to open this file described a stub that has had a real engine inside it for six months.
A 2026-09-05 audit against the tree corrected **fifteen** citations, found **six** open items
already shipped by a later phase, and found **four** ticked items that were never actually built.
The rewrite below keeps every landed theme where it landed and restates E, F and G as the
**residue** they really are. Themes H and I are unchanged here and moved on to
[Phase 71](phase-71-links-that-open-in-place.md) — see `## Decisions / open questions` for the split.

**What actually exists today.**
[`browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) is 337 lines, not
the ninety-seven this doc used to quote: Back, Forward, Reload, an address bar that runs
[`resolveInput`](../../../packages/app/src/features/browser/resolve-input.ts), a find bar, a DevTools
button, a viewport-preset `<select>`, a layout picker and a crash panel are all wired.
[`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) is 347 lines owning a
`Map<string, {view: WebContentsView; win: BrowserWindow}>`, with 26 unit tests across it and
[`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts).
[`browser-store.ts`](../../../packages/app/src/store/browser-store.ts) has 20 actions and 26 tests.
[`e2e/browser-pane.spec.ts`](../../../packages/app/e2e/browser-pane.spec.ts) is 536 lines and 19
tests, not the 130-line stub spec. **The engine works.** What is left is the last mile of the
surface around it, and it is smaller than the item count used to suggest.

**Four things the audit found ticked but absent, and they are the sharp edges of this phase.**

1. **There is no zoom, anywhere.** Theme A's ticked item lists a `browserZoom` channel;
   [`channels.ts:373–391`](../../../packages/shared/src/ipc/channels.ts) has fourteen browser
   channels and none of them is zoom. No schema, no bridge method, no service function. Theme G's
   zoom item therefore owns the **whole** contract, not a UI binding.
2. **Closing a browser tab leaks its `WebContentsView`.** `bridge().browser.close` exists
   ([`bridge.ts:513`](../../../packages/shared/src/ipc/bridge.ts)) and has exactly one caller in the
   repo — [`video-studio-pane.tsx:55`](../../../packages/app/src/features/video/video-studio-pane.tsx).
   `browser-store`'s `closeTab` drops the row and nothing tears the view down; the Chromium process
   lives until quit. Theme E's first item.
3. **There is no `browser.devtools` or `browser.clearData` command.** Theme H's ticked item claims a
   palette command for DevTools; [`command-icons.ts:45–63`](../../../packages/app/src/features/palette/command-icons.ts)
   maps seventeen `browser.*` ids and none of them is one.
4. **`preview-deploy.ts` has zero production callers** and its test is 17 lines of inline strings, not
   the fixture-backed suite its ticked item claims. It moves to Phase 71 with the rest of Theme I.

**Theme E is a gap list now, not a build.** [Phase 62](phase-62-one-escape-one-dismissal.md) built
the dismissal-layer stack, and [`use-dismiss.ts:115–119`](../../../packages/app/src/components/use-dismiss.ts)
records the consequence in one line: *"A blocking registration is also an occluder registration."*
Every `blocking` layer increments `useUiStore`'s `occluders` counter
([`ui-store.ts:723–725, 1461–1463`](../../../packages/app/src/store/ui-store.ts)), and
[`use-browser-bounds.ts:20–21`](../../../packages/app/src/features/browser/use-browser-bounds.ts)
reads it as `effectiveVisible = visible && occluders === 0`.
[`occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx) already
pins twelve overlays. So the theme's two headline items — build a registry, register every overlay —
are **done**. What remains is the six overlays that portal without registering, the two layers that
register `blocking: false` **on purpose** and therefore still paint behind a page, a coordinate-space
bug in the bounds push, and the view leak above.

**The overlay that is deliberately invisible.** `tooltip.tsx:122` and `toast-host.tsx:106–112` both
pass `{ blocking: false }`, and `use-dismiss.ts:5–25` explains why at length: a tooltip left open by
a pointer resting on the browser toggle used to swallow the `Escape` that should have closed the
pane. That reasoning is about **dismissal order** and is correct. It has an unintended second effect,
because `blocking` is also what makes something an occluder: a tooltip over a loaded page renders
*under* the native layer and is simply not there. The fix is to separate the two axes, not to make
tooltips blocking again — see Theme E.

**Multi-window arrived after this doc was written, and it changes one item.**
[Phase 55](phase-55-multi-window-studio.md) shipped `window-manager.ts` and
[`window.ts`](../../../packages/shared/src/domain/window.ts)'s `PANEL_WINDOW_ROLES`, which includes
`'browser'`; `reparentBrowserTabs(next)` ([`browser-service.ts:318`](../../../packages/desktop/src/main/browser-service.ts))
moves every view to a popout and back, and `activateBrowserTab` was narrowed from a process-wide loop
to a per-window one. But `browserSetBounds` and `browserSetVisible` are raw `ipcMain.on` handlers
keyed on `tabId` alone ([`browser-handlers.ts:47–105`](../../../packages/desktop/src/main/ipc/browser-handlers.ts)),
where `browserCreate` goes through `handleFromSender`. Theme E owns closing that asymmetry.

**Builds on.** Phase 9 (the `CommandId` registry and `Mod+b`), Phase 13 (`useResizable`, `useReveal`
/ `motionMs()`, persisted `LayoutSizes`), Phase 16 (`Popover` as the overlay primitive, the settings
pages, the `mstudio-file:` protocol and its path jail), Phase 17 (the `gh`-backed forge and the
workbench tab strip), Phase 23 (the palette and `PALETTE_SAFE`), Phase 27 (the full-width status bar,
the pane shell, `useFocusTrap`, `browserOpen`), Phase 30 (`stream-registry.ts` as the main→renderer
event-push pattern), Phase 39 (the status-bar shortcut rail and `segments.ts`'s priority scale),
Phase 55 (multi-window, `reparentBrowserTabs`), Phase 58 (`Modal` as the shared dialog primitive),
Phase 60 (`VIEW_COMPONENT` in `view-registry.tsx`, which `BrowserPane` deliberately stays out of),
Phase 62 (the dismissal-layer stack that made the occluder registry universal), Phase 68 (focus
restoration inside `useFocusTrap`).

**Scope guardrails.** **The embedded views never get a preload.** No `window.midniteStudio`, no
channel constants, no bridge — a page loaded from the network must have no path to the IPC surface,
and the cheapest way to guarantee that is to hand it nothing;
[`browser-service.test.ts:250–262`](../../../packages/desktop/src/main/browser-service.test.ts) asserts
it. **The browser session is its own partition** (`persist:browser`), separate from the renderer's
default session, so the `mstudio-file:` protocol registered in
[`fs-protocol.ts:63`](../../../packages/desktop/src/main/fs-protocol.ts) is not reachable from a web
page. **No git command, no git-engine change.** This phase adds no git subprocess;
`packages/git-engine` is untouched end to end. **The renderer never touches an Electron API.**
Everything the pane does to a `WebContentsView` goes over `mstudio:browser:*`; a refinement that
would need the renderer to import `electron` is wrong by construction. **The pane keeps its
geometry.** It stays the overlay mounted at [`app.tsx:1371`](../../../packages/app/src/app.tsx)
(full-screen) and `:896` (side-by-side), plus
[`detached-root.tsx:99`](../../../packages/app/src/detached-root.tsx) for the popout; this phase fills
it, it does not promote it into `VIEW_COMPONENT`. **macOS arm64 is the only target** — Phase 11's
packaging scope is unchanged and no Windows/Linux bounds quirk is chased.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The engine, and the contract that drives it (L) — ✅ DONE (2026-08-30)

The main-process half. Lands first; C through I all assume these channels exist. Nothing in this
theme is visible — its acceptance test is a page rendering inside the pane with the app's own chrome
still disabled.

- [x] `packages/shared/src/domain/browser.ts` — the domain types and zod schemas: `BrowserTabId`
      (branded string), `BrowserTabState` (`id`, `url`, `title`, `faviconUrl`, `loading`,
      `canGoBack`, `canGoForward`, `groupId`, `originRepoId`), `BrowserBounds`
      (`x`/`y`/`width`/`height`), and `BrowserNavError` (`code`, `description`, `validatedUrl`).
      Exported from [`domain/index.ts`](../../../packages/shared/src/domain/index.ts) alongside the other
      domains. zod only — the package imports no other workspace package.
- [x] `mstudio:browser:*` channel constants in
      [`ipc/channels.ts:373–391`](../../../packages/shared/src/ipc/channels.ts), grouped and commented in
      the style of the `pty:*` / `terminal:*` split at `:341–365`: `browserCreate`, `browserClose`,
      `browserNavigate`, `browserBack`, `browserForward`, `browserReload`, `browserStop`,
      `browserSetBounds`, `browserSetVisible`, `browserActivate`, `browserZoom`, `browserFind`,
      `browserFindStop`, `browserDevtools`, `browserClearData`.
      *(Audit 2026-09-05: fourteen of the fifteen shipped. `browserZoom` never did — no channel, no
      schema, no bridge method, no service function. Theme G owns building it.)*
- [x] Payload schemas in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) and the method
      signatures on the preload bridge type in [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts).
      Every op returns the `GitOpResult` envelope, never throws.
- [x] A single **event** channel `mstudio:browser:event` carrying a discriminated union
      (`navigated` | `title` | `favicon` | `loading` | `failed` | `destroyed`), pushed main→renderer.
      Reuse the [`stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) subscription
      pattern rather than adding a second event mechanism.
- [x] `packages/desktop/src/main/browser-service.ts` — owns a `Map<BrowserTabId, WebContentsView>`,
      creates views into the window's `contentView`, and is the only file in the repo that constructs
      one. Views are created lazily on first activation and destroyed on tab close, window close and
      `before-quit`.
- [x] Embedded-view `webPreferences`, stricter than the renderer's: `partition: 'persist:browser'`,
      `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`** (the renderer sets
      `sandbox: false` only so its preload can `require` the channel constants — an embedded view has
      no preload and therefore no reason to relax it), and **no `preload`**.
- [x] `packages/desktop/src/main/ipc/browser-handlers.ts` following the shape of the sibling handler
      modules in [`main/ipc/`](../../../packages/desktop/src/main/ipc), registered through the existing
      `handle.ts` helper.
- [x] Wire the `webContents` listeners that feed the event channel: `did-navigate`,
      `did-navigate-in-page`, `page-title-updated`, `page-favicon-updated`, `did-start-loading`,
      `did-stop-loading`, `did-fail-load`, `render-process-gone`.
- [x] `render-process-gone` and `unresponsive` are surfaced as tab state, not swallowed — a crashed
      tab shows a reload affordance rather than a blank rectangle.
- [x] Unit-test `browser-service` view lifecycle against a fake `WebContentsView` (create → activate →
      close destroys; close of a never-activated tab is a no-op; quit destroys all).

### B — Security and navigation policy (M) — ✅ DONE (2026-08-30)

The condition Phase 27 attached to the engine. Lands with A, not after it — an engine that ships a
week before its policy is the incident Phase 27 named.

- [x] `setPermissionRequestHandler` **and** `setPermissionCheckHandler` on the `persist:browser`
      session, both denying every permission (camera, microphone, geolocation, notifications, midi,
      clipboard-read, display-capture, pointer-lock). Both, not just the first — the check handler is
      what a synchronous `permissions.query()` reads.
- [x] `setWindowOpenHandler` on every embedded view returns `{ action: 'deny' }` and instead emits a
      "open as new tab" event, so `target="_blank"` and `window.open` behave the way a browser user
      expects rather than spawning an unmanaged `BrowserWindow`.
- [x] A `will-navigate` / `will-redirect` policy allowing **only** `http:` and `https:`. `file:`,
      `mstudio:`, `javascript:`, `data:` and every custom scheme are blocked and reported as a
      `BrowserNavError` the pane renders.
- [x] Prove the `mstudio:` protocol is registered on the **default** session only — read
      [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts), confirm the registration
      target, and add a test asserting a `persist:browser` view cannot resolve an `mstudio:` URL. If it
      is currently registered on `protocol` globally rather than per-session, fixing that is part of
      this theme.
- [x] `certificate-error` is **not** blanket-accepted: the default (reject) stands, and the failure
      renders as an error page. No "proceed anyway" affordance this phase.
- [x] `session.on('will-download')` cancels and surfaces a one-line notice naming the file — downloads
      are out of scope, and cancelling loudly beats dropping silently.
- [x] Confirm no embedded view can reach the bridge: a test that evaluates `typeof window.midniteStudio`
      in an embedded view's `webContents` and asserts `'undefined'`.
- [x] Rewrite the now-false comment at [`window.ts:64–66`](../../../packages/desktop/src/main/window.ts)
      (*"the renderer only ever loads local content"*). It stays true of the renderer and becomes
      misleading about the app — say that remote content lives in sibling views on a separate
      partition with no preload, and link the reader to `browser-service.ts`.
- [x] A **Browser** settings page under
      [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages) with a
      "Clear browsing data" action (`session.clearStorageData()` + `clearCache()`), behind a
      `ConfirmDialog` naming what is cleared, plus the search-engine and link-handling settings
      Themes G and I need.

### C — The tab model and the strip (L) — ✅ DONE (2026-08-30)

- [x] `packages/app/src/store/browser-store.ts` (zustand, colocated `.test.ts`): `tabs`, `groups`,
      `activeTabId`, `recentlyClosed`. Persisted via `partialize` — **URLs and titles only**, never
      live view handles; views are recreated lazily on activation after a restart.
- [x] Store actions with pure, testable reducers: `openTab`, `closeTab`, `closeOthers`,
      `closeToRight`, `activateTab`, `moveTab`, `duplicateTab`, `reopenClosed`, `updateTabState`.
- [x] `features/browser/tab-strip.tsx`, modelled on
      [`workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx) — same
      `role="tablist"` semantics, same `overflow-x-auto` overflow decision, same close affordance.
      Read that file's header comment first and follow it rather than re-litigating it.
- [x] Favicon slot per tab, falling back to the monochrome
      [`midnite-icon.tsx`](../../../packages/app/src/components/icons/midnite-icon.tsx) for a new tab and to
      a generic globe for a page with no favicon. The PNG `BrandMark` is a hero asset and is wrong at
      16px — this is why the traced SVG exists.
- [x] Loading state on the tab (spinner replacing the favicon), and a title that falls back to the
      URL's host while the page has none.
- [x] Drag-to-reorder via [`sortable-list.tsx`](../../../packages/app/src/components/sortable-list.tsx),
      including dragging a tab into and out of a group (Theme D consumes the same drop targets).
- [x] Right-click menu via [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx):
      Reload, Duplicate, Copy URL, Move to group ▸, Close, Close others, Close to the right.
- [x] New chords in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) under a **browser
      scope**, not the app scope: `browser.newTab` (`Mod+t`), `browser.closeTab` (`Mod+w`),
      `browser.nextTab` / `browser.prevTab` (`Ctrl+Tab` / `Ctrl+Shift+Tab`), `browser.reopenTab`
      (`Mod+Shift+t`). Scoping is load-bearing: an app-scoped `Mod+w` would close the window.
- [x] `Mod+1`…`Mod+9` select the nth tab (9 = last), scoped the same way.
- [x] `browser.toggle` opening with zero tabs creates one new tab rather than showing an empty strip.
- [x] Reducer unit tests, including the ones easy to get wrong: closing the active tab activates its
      right neighbour then its left; closing the last tab leaves one new tab, not zero; reorder across
      a group boundary; `reopenClosed` restores position.

### D — Tab groups, manual and derived (L) — ✅ DONE (2026-08-30)

Two kinds of group with one visual language. Manual groups are user-made and persist; derived groups
are computed from where a tab came from and vanish when empty.

- [x] `BrowserTabGroup` in the shared domain: `id`, `name`, `color`, `collapsed`, `kind`
      (`'manual' | 'repo'`), `repoId?`.
- [x] Manual groups: create from a tab's context menu or a strip affordance, rename inline, pick a
      colour, collapse/expand, ungroup, delete-keeping-tabs.
- [x] A small named colour palette defined as tokens in
      [`styles.css`](../../../packages/app/src/styles.css) with a `.dark` override, in the style of the
      existing `--cal-1..4` and `--health-*` sets. Eight colours; do not reuse the graph lane ramp,
      which carries its own meaning.
- [x] Repo-derived groups: a tab opened with an `originRepoId` (Theme I supplies it) is auto-placed in
      that repo's group, labelled with the repo name and coloured deterministically from its id.
- [x] Derived groups are implicit — they appear when their first tab does, disappear when their last
      tab closes, and are not persisted as objects. Dragging a tab out of one is allowed and sticks
      (an explicit `groupId: null` beats the derived default).
- [x] Collapse rendering follows the [`tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx)
      idiom; a collapsed group shows its name, colour and tab count as one chip.
- [x] Closing a collapsed group closes its tabs, behind a `ConfirmDialog` when the count is above a
      threshold — the same blast-radius discipline the git ops use.
- [x] Group state persists across restarts (manual groups and their membership; derived membership
      re-derives from `originRepoId`).
- [x] Unit tests for derivation: a tab with `originRepoId` and no explicit `groupId` lands in the
      derived group; an explicit `groupId: null` overrides it; the derived group disappears at zero
      tabs.

### E — Occlusion, bounds, and the view that outlives its tab (M)

Phase 62's dismissal-layer stack already built this theme's headline: `useDismiss(active, onDismiss,
{layer, blocking})` increments `occluders` for every blocking layer, and
[`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) hides the
native view while the count is non-zero. What is left is a gap list. Nothing here is speculative —
every item names the line that is wrong today.

- [ ] **Closing a tab must destroy its view.** `useBrowserTabsEffects`
      ([`use-browser-tabs.ts:39`](../../../packages/app/src/features/browser/use-browser-tabs.ts))
      creates views but never closes them; `browser-store`'s `closeTab` only drops the row.
  - Add a `useEffect` in `useBrowserTabsEffects` that diffs the store's `tabs` against a
    `useRef<Set<string>>` of ids it has called `browser.create` for, and calls
    `bridge()?.browser.close({ tabId })` for every id that has disappeared. Diff-in-the-effect rather
    than a call inside `closeTab`: the store is a pure reducer with no bridge access by design, and
    `closeOthers` / `closeToRight` / `closeTabsInGroup` would each need their own call site otherwise.
  - The same ref is the create-set already implied by `:120`; hoist it rather than adding a second.
  - Verified by a new case in
    [`use-browser-tabs.test.ts`](../../../packages/app/src/features/browser/use-browser-tabs.test.ts):
    render with two tabs, `closeTab` the inactive one, assert `browser.close` called once with that id
    and never with the survivor's.
- [ ] **Bounds are pushed in CSS pixels; `setBounds` wants DIP.**
      `use-browser-bounds.ts`'s `sync()` sends `Math.round(rect.x/y/width/height)` from
      `getBoundingClientRect()`, and [`browser-service.ts:285`](../../../packages/desktop/src/main/browser-service.ts)
      passes them to `view.setBounds(bounds)` unmodified. The host window carries
      `role: 'zoomIn' | 'zoomOut' | 'resetZoom'` menu items
      ([`menu.ts:139–141`](../../../packages/desktop/src/main/menu.ts)), so the two units diverge the
      moment a user presses `Mod+=` on the app itself and the page lands offset from its box.
  - Fix in **main**, not the renderer: `setBrowserBounds` multiplies the incoming rect by
    `tracked.win.webContents.getZoomFactor()` before `view.setBounds`. Chosen over sending a factor
    from the renderer because the renderer has no legal way to read one (`webFrame` is an `electron`
    import, and `packages/app` may not import `electron`), and over removing the host zoom roles
    because window zoom is a real accessibility affordance.
  - Verified in [`browser-service.test.ts`](../../../packages/desktop/src/main/browser-service.test.ts):
    a fake window reporting `getZoomFactor() === 1.5` and a `{x:10,y:20,width:100,height:200}` push
    must reach `view.setBounds` as `{x:15,y:30,width:150,height:300}`.
- [ ] **`setBounds`/`setVisible` must resolve their window from the sender.**
      `browserCreate` uses `handleFromSender`
      ([`browser-handlers.ts:36–45`](../../../packages/desktop/src/main/ipc/browser-handlers.ts)); the
      other twelve are raw `ipcMain.on` with no sender resolution. With the browser detached into its
      popout ([`detached-root.tsx:99`](../../../packages/app/src/detached-root.tsx)), both renderers can
      hold a live `useBrowserBounds` for the same `tabId`.
  - Rule: `browserSetBounds` and `browserSetVisible` drop the message when
    `resolveWindow(event.sender)` ([`window-manager.ts:155`](../../../packages/desktop/src/main/window-manager.ts))
    is not the `tracked.win` for that tab. Silently — a stale push from the window that no longer hosts
    the pane is expected during a reparent, not an error.
  - Verified: a `browser-service.test.ts` case that reparents a tab to window B and then pushes bounds
    from window A's sender, asserting `view.setBounds` is not called.
- [ ] **Tooltips and toasts still paint under a loaded page.** `tooltip.tsx:122` and
      `toast-host.tsx:106–112` pass `{ blocking: false }`, which `use-dismiss.ts:160` reads as
      "not an occluder" as well as "does not consume Escape".
  - Split the axes: add `occludes?: boolean` to `DismissOptions`
    ([`use-dismiss.ts:30`](../../../packages/app/src/components/use-dismiss.ts)), defaulting to
    `blocking` so every existing caller is unchanged, and pass `{ layer: 'tooltip', blocking: false,
    occludes: true }` / `{ layer: 'toast', blocking: false, occludes: true }` at the two call sites.
    Chosen over making them blocking again because Phase 62's ordering comment (`:5–25`) is the
    regression that fix would re-introduce.
  - Verified in [`use-dismiss.test.ts`](../../../packages/app/src/components/use-dismiss.test.ts): a
    `{blocking:false, occludes:true}` registration raises `occluders` to 1 and still does **not** win
    `Escape` against a `dialog` layer.
- [ ] **Six overlays portal without registering at all** — enumerate from the tree, not from memory,
      and add `useOccluder(open)` ([`use-occluder.ts:9`](../../../packages/app/src/components/use-occluder.ts))
      to each: [`activity-tooltip.tsx`](../../../packages/app/src/components/commit-activity-timeline/activity-tooltip.tsx),
      [`project-actions.tsx`](../../../packages/app/src/features/agent/project-actions.tsx),
      [`tab-strip.tsx`](../../../packages/app/src/features/browser/tab-strip.tsx)'s group chip portal,
      [`graph-row.tsx`](../../../packages/app/src/features/graph/graph-row.tsx)'s `z-popover` flyout,
      [`ref-badge.tsx`](../../../packages/app/src/features/graph/ref-badge.tsx), and
      [`lock-screen.tsx`](../../../packages/app/src/features/screensaver/lock-screen.tsx).
  - `lock-screen.tsx` is the one that matters most and the one an eye-pass would miss: it is
    `fixed inset-0 z-[200]`, so on every other surface it covers the app completely — and over a
    loaded page it would cover nothing at all.
  - Extend [`occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx)
    with a numbered case per component, matching its existing exact-count style.
- [ ] **Two overlays sit outside the z scale** and will fight the native layer's `z-browser: 45`
      differently from every sibling: `onboarding-modal.tsx` uses `z-50` and
      `passcode-pad.tsx:259,266` uses `z-[110]`, where the scale in
      [`tailwind.config.ts:108–123`](../../../tailwind.config.ts) runs `z-menu` 80 · `z-popover` 85 ·
      `z-dialog` 90 · `z-toast` 92 · `z-tooltip` 95. Move both onto named tokens; a hand-rolled number
      is how the next occlusion bug gets in.
- [ ] **Re-push bounds on the window events a `ResizeObserver` cannot see.** `sync()` listens to the
      element and to `window resize`; a display scale-factor change and a macOS full-screen transition
      do not always produce either.
  - Main owns this, because the renderer cannot observe them: `browser-service.ts` keeps the last
    `BrowserBounds` per tab and re-applies it on the owning window's `enter-full-screen`,
    `leave-full-screen` and on `screen.on('display-metrics-changed')`. Re-applying the *last known*
    rect rather than asking the renderer avoids a round trip during a transition that is already
    janky.
  - Verified: a `browser-service.test.ts` case that emits `enter-full-screen` on the fake window and
    asserts `view.setBounds` was called a second time with the same rect.
- [ ] **Rewrite `use-browser-bounds.ts`'s doc comment (`:9–16`).** It states that the hook "does NOT
      install Theme E's occluder registry" and that overlays "will still paint BENEATH the native
      view" — four lines above the code that reads the counter — and points at the dead
      `todo/phase-32-browser-engine-and-tabs.md` path. Replace it with what the hook now does, and
      name the two remaining non-occluding layers as the known gap until the item above lands.
- [ ] **Unit-test the bounds arithmetic as a pure function.** Extract
      `boundsFromRect(rect: DOMRect, zoomFactor: number): BrowserBounds` — currently inline in
      `sync()` — and test rounding at fractional device ratios (a `199.6px` wide box at zoom 1 is
      `200`, not `199`) and the zero-size case (a pane mid-tween measures `0×0`; the push must be
      skipped, not sent, or Electron parks the view at the origin — the bug
      `4b1a51f fix(browser): stop the native browser view from showing at stale/zero bounds` already
      fixed once).

### F — The new tab page, finished (M)

The page exists — [`new-tab-page.tsx`](../../../packages/app/src/features/browser/new-tab-page.tsx) is
277 lines with a wallpaper, the `BrandMark`/`Wordmark` hero, an autofocused search field and six
shortcut tiles. Three of its promises are still hard-coded stubs, and one of them is a second copy of
logic that already has a tested home.

- [ ] **Delete `handleSubmit`'s private URL heuristic (`:106–121`) and call `resolveInput`.** The page
      re-implements URL-versus-search inline, and it has already diverged: it has no `localhost:PORT`
      arm, so typing `localhost:5173` on a new tab searches Google for it while typing the same string
      in the pane's address bar navigates.
      [`resolve-input.ts:3`](../../../packages/app/src/features/browser/resolve-input.ts) is
      `resolveInput(input: string, engine: SearchEngine = 'google'): string` and is the tested one.
  - Verified by moving the divergent cases into
    [`resolve-input.test.ts`](../../../packages/app/src/features/browser/resolve-input.test.ts) and
    asserting in [`new-tab-page.test.tsx`](../../../packages/app/src/features/browser/new-tab-page.test.tsx)
    that submitting `localhost:5173` reaches `browser.create` with `http://localhost:5173`.
- [ ] **Recents are `const recents: string[] = []` (`:83`)**, so the whole "Recent Origins" block at
      `:254–273` is dead code that has never rendered.
  - Add `recents: string[]` to `browser-store` — the last 8 **distinct origins**, most-recent-first,
    pushed from `updateTabState` whenever a `navigated` event carries a new origin. Origins, not URLs:
    a strip of eight `github.com/...` paths is not a shortcut list.
  - Persist it under `partialize`. `recentlyClosed` is deliberately **not** persisted and stays that
    way; recents are.
  - `clearRecents()` action, exposed from the Browser settings page and from the strip's own context
    menu.
  - Verified in `browser-store.test.ts`: eight distinct origins cap at eight, a ninth evicts the
    oldest, and re-visiting an existing origin moves it to the front rather than duplicating it.
- [ ] **Make the six tiles editable and persisted.** They are hard-coded with inline brand colours
      today (Google, YouTube, Figma, Claude, Gemini, Notebook).
  - `tiles: BrowserShortcutTile[]` in `browser-store`, seeded with exactly those six on first run, with
    `addTile` / `removeTile` / `renameTile` / `reorderTiles`. Reorder rides
    [`sortable-list.tsx`](../../../packages/app/src/components/sortable-list.tsx), the same primitive
    `tab-strip.tsx` uses — not a second dnd convention.
  - The existing exported `type BrowserShortcutTile` (`new-tab-page.tsx:17`) moves to
    [`domain/browser.ts`](../../../packages/shared/src/domain/browser.ts) with a zod schema, because it
    is now persisted state and every other persisted browser type lives there.
  - Editing UI lives in the Browser settings page, not on the new-tab page: an inline edit affordance
    on a surface whose whole job is one keystroke to somewhere else is the wrong trade.
- [ ] **A repo-derived second row.** When `useUiStore`'s active repo has a forge remote
      ([`forgeProjectUrl(forge)`](../../../packages/shared/src/domain/remote.ts) at `:77`), offer three
      tiles — the repo, its pulls, its actions — each opening with `originRepoId` set so Theme D's
      derived group catches them. With no active repo or no forge remote the row renders **nothing**,
      not an empty heading: Phase 27's rule.
- [ ] **Move the wallpaper theme out of raw `localStorage`.**
      [`wallpaper.ts:24`](../../../packages/app/src/features/browser/wallpaper.ts) writes
      `'midnite-studio.browser.wallpaper-theme'` directly, outside zustand persist, so it does not
      survive `adoptRenamedPersistKey`, is invisible to the settings-diff surface Phase 63 built, and
      cannot sync across windows through
      [`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts).
  - Move it into `browser-store` and bump its persist `version` **1 → 2** with the first `migrate` arm
    that store has ever had: read the legacy `localStorage` key, fold it into state, delete it. The
    store has no `migrate` today (`:363–380`), so the arm is net-new and must default to `'nature'`
    when the key is absent or unparseable.
  - Verified in `browser-store.test.ts`: a seeded v1 payload plus the legacy key migrates to v2 with
    the theme carried; a v1 payload with no legacy key migrates to the default.
- [ ] **Density and reduced motion.** The wallpaper cross-fade and the tile hover lift must both be
      instant under `data-motion='reduced'` (`motionMs() === 0`,
      [`use-reveal.ts:41`](../../../packages/app/src/components/use-reveal.ts)), and the tile grid must
      reflow from two rows of three to one column at the pane's narrowest usable width without a
      horizontal scrollbar. The side-by-side layout can be dragged to `320px`
      (`ui-store`'s `browserWidth` min) — that is the width to test at, not a guess.
- [ ] **Empty state on a first run** is the hero plus the tile grid alone, with no recents heading and
      no placeholder rows.

### G — The browsing chrome, finished (M)

Back/Forward/Reload/address-bar/find/DevTools are wired. What is missing is everything that tells the
user what the page is *doing*, plus one whole IPC surface that was ticked without being built.

- [x] Back, Forward, Reload and Stop wired to Theme A's channels. Enabled state comes from
      `canGoBack` / `canGoForward` in tab state, not from guessing.
      *(Audit 2026-09-05: Back/Forward/Reload landed at
      [`browser-pane.tsx:203–223`](../../../packages/app/src/features/browser/browser-pane.tsx). **Stop
      did not** — `bridge().browser.stop` has zero callers; see the loading-bar item below.)*
- [x] [`features/browser/resolve-input.ts`](../../../packages/app/src/features/browser/resolve-input.ts) —
      a **pure** function turning what was typed into either a URL or a search. Rules, in order: an
      explicit scheme wins; `localhost` and bare hosts with a port are URLs; a token matching a
      `host.tld` shape with no spaces is a URL; anything else is a search against the configured engine
      (default Google). Exhaustively unit-tested — this is the single most user-visible piece of logic
      in the phase. *(Audit 2026-09-05: landed and tested, but the new-tab page kept its own private
      copy of the heuristic — see Theme F.)*
- [ ] **Zoom does not exist — build the whole contract.** No channel, no schema, no bridge method, no
      service function.
  - `browserZoom: 'mstudio:browser:zoom'` in
    [`channels.ts`](../../../packages/shared/src/ipc/channels.ts)'s browser block (`:373–391`);
    `BrowserZoomRequest = z.object({ tabId: z.string().min(1), factor: z.number().min(0.25).max(5) })`
    in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) beside the other browser schemas at
    `:1752`; `zoom: (req: In<typeof S.BrowserZoomRequest>) => void` on the bridge's `browser` namespace
    ([`bridge.ts:511–528`](../../../packages/shared/src/ipc/bridge.ts)); a `browserZoom` arm in
    [`browser-handlers.ts`](../../../packages/desktop/src/main/ipc/browser-handlers.ts) matching the
    other twelve `ipcMain.on` + `safeParse` handlers; and
    `setBrowserZoom(tabId: string, factor: number): void` in `browser-service.ts` calling
    `view.webContents.setZoomFactor(factor)`.
  - An **absolute factor**, not a delta: the renderer already owns per-origin state, and a delta channel
    makes main the source of truth for something only the renderer persists.
  - `Mod+=` / `Mod+-` / `Mod+0` as `browser.zoomIn` / `browser.zoomOut` / `browser.zoomReset` in
    [`COMMANDS`](../../../packages/shared/src/keybindings.ts). These collide with the host window's own
    `zoomIn`/`zoomOut`/`resetZoom` menu roles at [`menu.ts:139–141`](../../../packages/desktop/src/main/menu.ts),
    which fire whenever the window is focused — so those three roles must become
    `itemNoAccelerator(...)`, exactly as `app.reload`/`app.hardReload` did at `:124–125` and for the
    identical reason. `use-keybindings.ts:39–49` then routes the chord to the `browser.*` reading while
    `browserOpen` is true and to the host reading otherwise.
  - Persisted **per origin**, not per tab, in `browser-store` (`zoomByOrigin: Record<string, number>`,
    under `partialize`), so re-opening a site returns to the factor you left it at.
  - The current factor renders in the chrome row **only when it is not `1`** — a permanently visible
    "100%" is noise.
  - Verified: a `browser-store.test.ts` case for the origin keying, and a `keybindings.test.ts`
    assertion that no `browser.zoom*` chord duplicates an existing `DEFAULT_KEYMAP` entry.
- [ ] **A `failed` navigation renders nothing.**
      [`use-browser-tabs.ts:71–75`](../../../packages/app/src/features/browser/use-browser-tabs.ts)
      handles the `failed` event by setting `loading: false` and dropping the `BrowserNavError` on the
      floor, so a DNS failure or a blocked scheme leaves the previous page — or a blank rectangle — on
      screen with no explanation.
  - Store `navError: BrowserNavError | null` on the tab, cleared on the next `did-start-loading`.
  - Render it in the **DOM** as `features/browser/error-page.tsx` — an `EmptyState` carrying
    `error.description`, the numeric `error.code`, the `validatedUrl`, and a **Retry** that calls
    `browser.navigate` — with the native view hidden for its duration, exactly as the `newtab` case
    already does at `browser-pane.tsx:311`. Never Chromium's own error page: it is unstyled, ignores
    the theme, and says "Midnite Studio" nowhere.
  - Theme B's blocked schemes arrive on the same channel (`browser-service.ts:184–197` emits
    `failed` with `code: -30`), so they get the same surface for free. Give `-30` a written copy string
    — "Midnite Studio only opens http and https pages here" — rather than showing a bare code.
  - Verified in `browser-pane.test.tsx`: dispatch a `failed` event through the mock bridge and assert
    the error page's description text and that `browser.setVisible` was last called with `false`.
- [ ] **No loading indication and no stop.** `bridge().browser.stop` exists and has zero callers.
  - An indeterminate 2px bar under the chrome row while `activeTab.loading`, and Reload swapped for
    Stop for its duration (`LuX`, `aria-label="Stop loading"`), calling `browser.stop({ tabId })`.
  - The bar animates only when `motionMs() > 0`; under reduced motion it is a static filled bar, which
    still communicates "busy" without a marquee.
- [ ] **Address-bar behaviour.** The input at `browser-pane.tsx:224–236` is a bare controlled field.
  - Focus → the full URL, `select()`ed. Blur with no edit → a trimmed `host + pathname` (scheme and a
    bare trailing `/` dropped). `Escape` → restore `activeTab.url` and blur, without closing the pane
    (the keydown must `stopPropagation` before `use-dismiss`'s window listener sees it).
  - While typing, show the `resolveInput(draft)` result as muted secondary text in the field's trailing
    edge, so "will this search or navigate?" is answered before Enter rather than after.
  - Verified in `browser-pane.test.tsx`: focus shows the full URL selected; typing `midnite` shows a
    google.com preview; `Escape` restores and leaves the pane open.
- [ ] **A security indicator.** Nothing at all for `https:`; an explicit **Not secure** chip in
      `text-warning` for `http:`. Resolved deliberately — see `## Decisions`. No certificate detail, no
      padlock for the secure case: a padlock that is always there teaches nothing, and the one omission
      that would actively mislead is rendering plaintext `http` identically to `https`.
- [ ] **Find-in-page has no match count.** `findInBrowserTab` (`browser-service.ts:273`) calls
      `webContents.findInPage` but never listens for `found-in-page`, so `result.matches` and
      `activeMatchOrdinal` never leave main.
  - Add a `found-in-page` listener in `createBrowserTab`'s listener block and a ninth arm to
    `BrowserEventSchema` ([`domain/browser.ts:84–124`](../../../packages/shared/src/domain/browser.ts)):
    `{ kind: 'found', tabId, matches: z.number().int(), activeMatchOrdinal: z.number().int() }`.
    A new arm on the existing discriminated union rather than a new channel — the union is exactly what
    `bridge.ts:504–510`'s comment says it is for.
  - [`find-bar.tsx`](../../../packages/app/src/features/browser/find-bar.tsx) renders `n / m`, and
    `0 / 0` for a query with no hits (not an empty slot, which reads as "still searching").
  - Verified in `browser-service.test.ts`: emitting `found-in-page` on the fake webContents pushes a
    `found` event with the ordinal intact.
- [ ] **`Mod+f` is unbound.** The Find button's own `title` advertises it and nothing in
      `DEFAULT_KEYMAP` binds it — [`keybindings.ts:376–378`](../../../packages/shared/src/keybindings.ts)
      records that `Mod+f` is deliberately free because `search.open` took `Mod+Shift+f`.
  - Declare `browser.find` with chord `Mod+f`. It must appear in **both** `YIELD_ROOTS` entries
    (`:365–380`): `.monaco-editor`, because `Mod+f` is Monaco's own find widget, and `.xterm`, because
    off macOS `Mod` is `Ctrl` and `Ctrl+F` is readline's forward-char. Adding a binding is what makes
    those yield entries newly necessary — today the dispatcher finds no candidate and does nothing.
  - Verified in [`use-keybindings.test.ts`](../../../packages/app/src/services/keybindings/use-keybindings.test.ts):
    `Mod+f` aimed at an `.xterm` root falls through; aimed at the pane it opens the find bar.
- [ ] **Two palette commands are missing.** `browser.devtools` and `browser.clearData` are named by a
      ticked Theme H item and by this theme's original text, and neither exists in `COMMANDS`.
  - Both get an entry in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) with **no
    chord**, an icon in [`command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts)
    (`LuCode` and `LuTrash2` — not another `LuGlobe`; seventeen identical globes is what the current
    map has and it makes the group unscannable), and a handler in
    [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts).
  - `browser.clearData` stays **out** of `PALETTE_SAFE`
    ([`safety.ts`](../../../packages/app/src/features/palette/safety.ts)) — it destroys every logged-in
    session in the partition. `browser.devtools` goes in.
  - Verified by the existing `palette-safety.test.ts`, which already asserts every `PALETTE_SAFE` entry
    is a real `CommandId`; add the negative assertion for `browser.clearData`.
- [ ] **Three stale comments contradict the shipped code** and will mislead the next reader more than
      no comment would:
      [`browser-pane.tsx:21–26`](../../../packages/app/src/features/browser/browser-pane.tsx) ("Back/
      Forward/Reload left disabled … no search fallback") and `:102` ("Theme F's new-tab page owns the
      fuller version; this is the minimal stand-in");
      [`e2e/browser-pane.spec.ts:6–15`](../../../packages/app/e2e/browser-pane.spec.ts) ("Back/Forward/
      Reload stay disabled this batch"); and
      [`styles.css:64`](../../../packages/app/src/styles.css), which points the eight `--tab-group-N`
      tokens at `features/browser/tab-group.tsx`, a file that has never existed — the real consumer is
      [`tab-group-colors.ts`](../../../packages/app/src/features/browser/tab-group-colors.ts).

### H — Dev-companion powers (M) — ◐ PARTIAL (2026-08-30) — remainder moved to Phase 71

DevTools and the viewport presets landed. Dev-server detection never did, and the presets are
component-local `useState` that does not survive closing the pane. **Both moved to
[Phase 71 Theme C](phase-71-links-that-open-in-place.md)** rather than being restated here — see
`## Decisions / open questions`.

- [x] DevTools for the active tab, opened **detached** (`openDevTools({ mode: 'detach' })`). Detached
      rather than docked on purpose: a docked panel resizes the view from underneath Theme E's bounds
      arithmetic, and reconciling the two is not worth the window it saves.
- [x] A DevTools affordance in the chrome row (`browser-pane.tsx:285–293`); closing the tab closes its
      DevTools window. *(The same item claimed a palette command; that half was never built and is
      Theme G's `browser.devtools` item above.)*

### I — The forge, opened in place (L) — moved to Phase 71

`openInMidnite` was never written, no call site was ever routed, and
[`preview-deploy.ts`](../../../packages/app/src/features/browser/preview-deploy.ts)'s ten lines have
zero production callers. The theme is intact and unstarted, it is a phase's worth of work on its own,
and it touches twenty-five files this phase otherwise never opens — so it moves whole to
**[Phase 71](phase-71-links-that-open-in-place.md)**, Themes A, B and D.

- [x] `features/browser/preview-deploy.ts` — a pure matcher over a check run's `details_url` and PR
      comment bodies, against a host-suffix allowlist. Returns candidates, not a verdict. *(Landed as a
      single regex over six hosts; Phase 71 Theme D wires it to a caller and replaces its two inline
      test strings with fixtures.)*
- [x] Unit-test the matcher against check-run and comment payloads, including the negatives (a
      `vercel.app` substring inside a longer host must not match; matching is on suffix boundaries).
      *(Audit 2026-09-05: [`preview-deploy.test.ts`](../../../packages/app/src/features/browser/preview-deploy.test.ts)
      is 17 lines and two cases over inline strings — the suffix-boundary negative is real, the
      "fixture payloads" half is not. Phase 71 Theme D replaces it.)*

## Files this phase touches

**Edited — shared**
- [`packages/shared/src/domain/browser.ts`](../../../packages/shared/src/domain/browser.ts) — the ninth
  `BrowserEvent` arm (`found`) and the `BrowserShortcutTile` schema.
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — `browserZoom`, the fifteenth request
  channel.
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `browser.find`,
  `browser.zoomIn`/`zoomOut`/`zoomReset`, `browser.devtools`, `browser.clearData`, plus the two
  `YIELD_ROOTS` entries `Mod+f` newly requires.

**Edited — desktop (main)**
- [`packages/desktop/src/main/browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts)
  — zoom-factor scaling on `setBounds`, sender-scoped bounds/visibility, the `found-in-page` listener,
  `setBrowserZoom`, last-bounds re-application on full-screen and display-metrics changes.
- [`packages/desktop/src/main/ipc/browser-handlers.ts`](../../../packages/desktop/src/main/ipc/browser-handlers.ts)
  — the `browserZoom` arm; `resolveWindow` guards on bounds and visibility.
- [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) — the three host
  zoom roles become `itemNoAccelerator`.

**New — app (renderer)**
- `packages/app/src/features/browser/error-page.tsx` — the DOM error surface for `failed`.

**Edited — app (renderer)**
- [`browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) — address-bar
  behaviour, the loading bar and stop button, the security chip, the zoom indicator, the error-page
  branch, three stale comments.
- [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) —
  `boundsFromRect` extracted, the doc comment rewritten.
- [`use-browser-tabs.ts`](../../../packages/app/src/features/browser/use-browser-tabs.ts) — the close
  diff, `navError`, the `found` arm.
- [`new-tab-page.tsx`](../../../packages/app/src/features/browser/new-tab-page.tsx) — `resolveInput`,
  live recents, store-backed tiles, the repo row.
- [`find-bar.tsx`](../../../packages/app/src/features/browser/find-bar.tsx) — the `n / m` counter.
- [`wallpaper.ts`](../../../packages/app/src/features/browser/wallpaper.ts) — persistence moves into the
  store; the module keeps the theme list and the fallback URLs.
- [`browser-store.ts`](../../../packages/app/src/store/browser-store.ts) — `recents`, `tiles`,
  `zoomByOrigin`, `wallpaperTheme`, `navError`, `version: 2` and its first `migrate` arm.
- [`use-dismiss.ts`](../../../packages/app/src/components/use-dismiss.ts) — the `occludes` axis.
- [`tooltip.tsx`](../../../packages/app/src/components/tooltip.tsx),
  [`toast-host.tsx`](../../../packages/app/src/components/toast-host.tsx) — `occludes: true`.
- [`activity-tooltip.tsx`](../../../packages/app/src/components/commit-activity-timeline/activity-tooltip.tsx),
  [`project-actions.tsx`](../../../packages/app/src/features/agent/project-actions.tsx),
  [`tab-strip.tsx`](../../../packages/app/src/features/browser/tab-strip.tsx),
  [`graph-row.tsx`](../../../packages/app/src/features/graph/graph-row.tsx),
  [`ref-badge.tsx`](../../../packages/app/src/features/graph/ref-badge.tsx),
  [`lock-screen.tsx`](../../../packages/app/src/features/screensaver/lock-screen.tsx) — `useOccluder`.
- `packages/app/src/features/onboarding/onboarding-modal.tsx`,
  `packages/app/src/features/screensaver/passcode-pad.tsx` — off the hand-rolled z values.
- [`command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts),
  [`safety.ts`](../../../packages/app/src/features/palette/safety.ts),
  [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) —
  the two new commands.
- [`browser-page.tsx`](../../../packages/app/src/features/settings/settings-pages/browser-page.tsx) — tile
  editing, wallpaper theme, clear recents, alongside the existing Clear browsing data.
- [`styles.css`](../../../packages/app/src/styles.css) — the `--tab-group-N` comment's dead path.

**Unchanged and load-bearing**
- [`packages/desktop/src/main/fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts)
  (**unchanged**) — `mstudio-file:` is registered on the module-level `protocol` object, i.e. the
  default session only, and [`fs-protocol.test.ts:60–69`](../../../packages/desktop/src/main/fs-protocol.test.ts)
  already asserts `session.fromPartition` is never called. Theme B's item to "confirm or fix" this is
  settled: it was already correct.
- [`packages/desktop/src/main/window.ts`](../../../packages/desktop/src/main/window.ts) (**unchanged**) —
  the "local content only" comment was already rewritten at `:64–74` and now names
  `browser-service.ts`.
- [`packages/app/src/features/status-bar/browser-toggle.tsx`](../../../packages/app/src/features/status-bar/browser-toggle.tsx)
  (**unchanged**) — Phase 39 moved its overflow priority from `5` to `30` in
  [`segments.ts:92`](../../../packages/app/src/features/status-bar/segments.ts) and left the reasoning in
  the comment at `:84–88`. Theme G's original item is done; do not re-do it.
- `packages/git-engine` (**unchanged**) — no git command, no parser, no layout change anywhere in this
  phase.

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Unit: `boundsFromRect` — fractional rounding, and the `0×0` push skipped rather than sent.
- [ ] Unit: `browser-service` scales `setBounds` by the host window's `getZoomFactor()`.
- [ ] Unit: `browser-service` drops a bounds push whose sender is not the tab's owning window.
- [ ] Unit: `browser-service` re-applies the last bounds on `enter-full-screen`.
- [ ] Unit: `use-browser-tabs` calls `browser.close` exactly once for a closed tab and never for a
      survivor.
- [ ] Unit: `use-dismiss` — `{blocking:false, occludes:true}` raises `occluders` and still loses Escape
      to a `dialog` layer.
- [ ] Unit: `occluder-coverage.test.tsx` gains a numbered case for each of the six newly registered
      overlays.
- [ ] Unit: `browser-store` — recents cap at 8 distinct origins, re-visit promotes rather than
      duplicates; `zoomByOrigin` keys on origin not tab; v1→v2 migration carries the legacy wallpaper
      key and defaults without it.
- [ ] Unit: `resolve-input` covers `localhost:5173` and every case the new-tab page used to handle
      privately.
- [ ] Unit: `keybindings` — no `browser.zoom*` or `browser.find` chord duplicates an existing
      `DEFAULT_KEYMAP` entry; `browser.find` appears in both `YIELD_ROOTS` entries.
- [ ] Unit: `use-keybindings` — `Mod+f` yields to `.xterm` and to `.monaco-editor`, and reaches the pane
      otherwise.
- [ ] Unit: `palette-safety` — `browser.devtools` is in `PALETTE_SAFE`, `browser.clearData` is not.
- [ ] Unit: `browser-service` pushes a `found` event carrying `activeMatchOrdinal`.
- [ ] RTL: `browser-pane` renders the error page for a `failed` event and hides the native view for its
      duration.
- [ ] RTL: address bar — focus selects the full URL, typing previews the resolved destination, `Escape`
      restores it and leaves the pane open.
- [ ] e2e: `browser-pane.spec.ts` gains a zoom case (`Mod+=` then reopening the same origin restores the
      factor) and a stop-button case, and its stale header comment is rewritten.
- [ ] e2e: a screenshot spec covering the new-tab page in both themes and at both densities, and at the
      `320px` minimum side-by-side width.
- [ ] **Open, for a human:** the occlusion sweep, now including the two layers that changed. With a page
      loaded, open in turn a tooltip, a toast, the command palette, a context menu, a `ConfirmDialog`,
      the status-bar overflow popover, a `RefBadge` flyout and the lock screen, and confirm each renders
      *above* the pane. This is the phase's most likely regression and no automated test covers it
      convincingly.
- [ ] **Open, for a human:** press the app's own `Mod+=` twice with a page loaded and confirm the page
      still fills its box — the coordinate-space bug Theme E fixes is invisible at 100% zoom.
- [ ] **Open, for a human:** detach the browser into its own window, load a page, and drag the popout
      across a display boundary with a different scale factor.
- [ ] **Open, for a human:** log in to GitHub and Figma in the pane, quit and relaunch, and confirm the
      sessions survived — the whole justification for the persistent partition.

## Not in this phase

- **Everything in Theme I, and dev-server detection from Theme H.** Moved to
  [Phase 71](phase-71-links-that-open-in-place.md) so this one stays the browser's own surface and ships.
- **The page console piped into Phase 18 diagnostics.** Considered and cut in the brainstorm: it
  overlaps almost entirely with just opening DevTools, and it is the largest new plumbing of the four
  dev features for the least new capability.
- **Per-site permission prompts.** Theme B denies everything. A consent UI with per-origin storage is a
  phase-sized surface of its own, and nothing in the shortcut set needs a permission to be useful.
- **A downloads manager.** `will-download` cancels loudly. Downloads mean a destination picker, a
  progress surface, a disk-write path outside the fs jail, and a "this file may be dangerous" story.
- **Extensions.** No `loadExtension`, no ad blocking, no user scripts.
- **Bookmarks as a real store.** Editable shortcut tiles and eight recents are the whole persistence
  model; no folders, no tags, no import, no sync.
- **A "proceed anyway" affordance for `certificate-error`.** The default reject stands. Note that
  `browser-service.ts:214–217` calls `event.preventDefault()` and never invokes the handler's
  `callback` — which is the *safe* failure (Electron falls back to rejecting), but it is accidental
  rather than chosen, and tightening it is a security review of its own.
- **Promoting the browser into `VIEW_COMPONENT`.** It stays the content-row overlay Phase 27 built;
  [`view-registry.tsx:21–24`](../../../packages/app/src/components/view-registry.tsx) records that it
  was in that list once and came back out.
- **True device emulation.** The width presets that landed are a **width** emulation, not device
  emulation: a page that branches on `devicePixelRatio` or user-agent is not fooled. Real emulation
  needs `Emulation.setDeviceMetricsOverride` through the debugger protocol. Phase 71 Theme C writes that
  limit into the UI copy and the code comment.
- **Windows and Linux bounds behaviour.** Phase 11 packages macOS arm64 and that is the target.
- **Multiple browser windows**, picture-in-picture, media-key handling, and reader mode. (One popout
  browser window exists via Phase 55's `PANEL_WINDOW_ROLES`; a second *simultaneous* one does not.)

## Decisions / open questions

- **Resolved — the phase is split, and Themes H and I move to
  [Phase 71](phase-71-links-that-open-in-place.md).** Phase 32 stood at 99 items across nine themes
  with five of them partly landed, which is two phases wearing one number. The line drawn is *the
  browser's own surface* (E, F, G — occlusion, the new-tab page, the chrome) versus *the rest of the
  app learning to use it* (H's dev-server detection, all of I's link routing). They share no file:
  32's remaining work never opens `external-link.tsx`, `pr-detail.tsx` or `run-detail.tsx`, and 71
  never opens `use-browser-bounds.ts` or `use-dismiss.ts`. E, F and G are one PR each.
- **Resolved — the audit's already-landed items are not restated.** Six items this doc listed as open
  were shipped by a later phase — the occluder registry and its overlay coverage (Phase 62), the reveal
  tween's `settled` gate and the focus-trap boundary (Phase 27/68), the status-bar priority (Phase 39),
  the `mstudio-file:` per-session proof (already correct, and tested). Each is recorded in
  `## Files this phase touches` as `(**unchanged**)` with the file and line that settles it, rather than
  left as an instruction someone would follow twice.
- **Resolved — `occludes` becomes its own `useDismiss` option, defaulting to `blocking`.** Making
  tooltips and toasts blocking again would fix the paint and re-break Phase 62's Escape ordering, which
  `use-dismiss.ts:5–25` describes as the exact regression that motivated the current arrangement. A
  defaulted third field changes no existing call site.
- **Resolved — DIP conversion happens in main.** The renderer measures in CSS pixels and may not import
  `electron`, so it cannot read a zoom factor; main already holds the owning `BrowserWindow` per tab
  (`Tracked`), so the conversion is one multiplication at the only place that has both numbers.
- **Resolved — zoom is an absolute factor over IPC, persisted per origin in the renderer.** A delta
  channel would make main the source of truth for state only the renderer persists, and per-tab
  persistence loses the factor the moment you close the tab you set it on.
- **Resolved — the default search engine is Google, as a setting.** It is the least surprising default
  and a Google tile already seeds the new-tab page. `resolveInput`'s `SearchEngine` union already carries
  `duckduckgo` and `bing`, and its only caller passes no engine — so the setting is a wiring job, not a
  design one. *(Chosen without the human on 2026-09-05; the alternative, a custom `%s` template, is
  additive later and blocks nothing.)*
- **Resolved — the address bar shows a "Not secure" chip for `http:` and nothing for `https:`.** Full
  certificate detail is out of proportion to a browser this size, but rendering plaintext http
  identically to https is the one omission that would be actively misleading. *(Chosen without the human
  on 2026-09-05.)*
- **Resolved — tabs are app-global, not per-repo.** `originRepoId` drives only the derived group. Per-repo
  tab sets would mean switching repos hides your tabs, which is surprising in something that presents
  itself as a browser. Already implemented this way in `browser-store`. *(Chosen without the human on
  2026-09-05.)*
- **Resolved — tabs restore as inactive records with no view mounted.** `partialize` already persists
  `tabs` with `loading/canGoBack/canGoForward/crashed` forced false (`browser-store.ts:363–380`), and
  `useBrowserTabsEffects` creates a view only on activation, so a relaunch never pays for a Chromium
  process the user has not asked for. Recorded as settled rather than open. *(Chosen without the human on
  2026-09-05.)*
- **Resolved — `WebContentsView`, not the `<webview>` tag.** `<webview>` would make Theme E almost
  disappear: an in-DOM element composes with `z-index` and needs no bounds choreography at all. It was
  rejected anyway because Electron discourages it, it carries a documented performance and reliability
  penalty, and it has no guarantee of surviving future majors. The cost is paid once, in Theme E, and
  bought back in process isolation and clean DevTools attachment.
- **Resolved — tab groups are both manual and repo-derived.** Manual alone leaves the browser generic;
  derived alone fights the user when they want to organise ad-hoc browsing. Derived groups are implicit
  and non-persisted precisely so they can never become clutter the user has to clean up.
- **Resolved — a persistent `persist:browser` partition, with every permission denied.** Without
  persistence the Figma and GitHub shortcuts are near-useless. "Clear browsing data" in settings is the
  escape valve.
- **Resolved — the new-tab page is DOM, not a web page.** No view is mounted for a new tab. It inherits
  tokens, theme, density and reduced-motion for free.
- **Resolved — DevTools open detached.** A docked panel resizes the view from under Theme E.
- **Corrected — there is no "browser scope".** This doc's original entry claimed browser chords live in
  a `browser` command scope. [`keybindings.ts:41`](../../../packages/shared/src/keybindings.ts) declares
  `CommandScope = 'global' | 'app'` and nothing else. The collision is resolved at dispatch instead:
  [`use-keybindings.ts:39–49`](../../../packages/app/src/services/keybindings/use-keybindings.ts) prefers
  a `browser.*` binding while `browserOpen` is true, then an *enabled* `terminal.*` one, then the
  app-wide one — which is why `Mod+w` still closes the repository when no terminal session exists.
  `browser-service.ts:171–179` also intercepts `Mod+W`/`Mod+T` as `before-input-event` inside the page,
  since a focused `WebContentsView` never gives the renderer a keydown at all.
- **Open — whether `certificate-error` should invoke its callback explicitly.** It currently
  `preventDefault()`s and returns, which rejects by omission. *Recommendation:* call
  `callback(false)` explicitly and log the host, so the intent is in the code rather than in the
  absence of code — a one-line change, but it belongs in a slice that can re-run the security tests.
