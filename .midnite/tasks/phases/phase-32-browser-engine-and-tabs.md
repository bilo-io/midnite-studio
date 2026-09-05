# Phase 32 — The browser gets an engine, and the tabs to fill it

Phase 27 Theme F built a browser with no browser in it. Ninety-seven lines in
[`browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) render a chrome strip
whose Back, Forward and Reload buttons are permanently `disabled`, an address field whose `onSubmit`
calls `preventDefault()` and sets local state, and an `<EmptyState>` reading *"No web engine yet —
‹url› would load here."* Everything around it is real: `browser.toggle` is bound to `Mod+b` in
[`keybindings.ts:91`](../../../packages/shared/src/keybindings.ts), the native View menu has an item
([`menu.ts:72`](../../../packages/desktop/src/main/menu.ts)), the palette has an icon and a safety entry,
`browserOpen` is persisted in [`ui-store.ts:312`](../../../packages/app/src/store/ui-store.ts), and
`e2e/browser-pane.spec.ts` has 130 lines asserting the stub behaves. The shell is finished. The body
is empty, deliberately.

**Phase 27 wrote down why, and this phase is the answer to it.** Its "Not in this phase" section
says: *"Embedding remote content is a sandboxing, CSP, permissions and navigation-policy surface with
a security review of its own, and hanging it off a layout phase is how a status-bar phase becomes a
security incident. Theme F builds the shell so that phase only has to fill the body."* That is the
inheritance. Theme B is not a nice-to-have here; it is the condition Phase 27 attached to the work.

**The engine is available and the window is already configured for it.**
[`packages/desktop/package.json:26`](../../../packages/desktop/package.json) pins `electron ^33.2.0`, which
ships `WebContentsView` — the supported successor to both `BrowserView` and the `<webview>` tag.
[`window.ts:57–69`](../../../packages/desktop/src/main/window.ts) already sets `contextIsolation: true`,
`nodeIntegration: false` and does **not** enable `webviewTag`. Nothing has to be loosened for this
phase; the embedded views get their own, stricter `webPreferences` than the renderer's.

**The one thing that will hurt is geometry.** A `WebContentsView` is an OS-level layer composited
*above* the renderer's DOM. It cannot be `z-index`ed under anything. Every overlay the app already
has — `Popover`, `ConfirmDialog`, `PromptDialog`, the `Mod+k` palette, context menus, tooltips — will
be painted *behind* a loaded page unless something explicitly hides the view first. Theme E exists
solely for that, and it is the theme most likely to be underestimated. The status bar is the
exception that proves the rule: it sits *below* the content row, so bounds that stop at the row's
bottom edge leave it visible for free, preserving the demonstration Phase 27 built the pane to make.

**Tabs are not a new problem in this repo.**
[`features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx) already
solves closable tabs, a permanent first tab, `role="tablist"`, per-kind icons, tooltips and
`overflow-x-auto` overflow — and its header comment records why `@bilo-io/ui`'s `Tabs` was rejected
(*"a segmented control with no close affordance, no overflow behaviour and no notion of a tab that
outlives the click that made it"*). [`sortable-list.tsx`](../../../packages/app/src/components/sortable-list.tsx)
is the existing drag-to-reorder primitive. Theme C follows both rather than inventing a third
convention.

**And the new-tab page is a React page, not a web page.** This is the design decision the rest of
Theme F hangs off: a new tab mounts no `WebContentsView` at all, so the home surface is ordinary DOM
and inherits the app's tokens, theme, density and motion settings for nothing.
[`brand.tsx`](../../../packages/app/src/components/brand.tsx) already exports `BrandMark`, `Wordmark` and
`Brand`; `--font-brand` (Quick Kiss) is already a Tailwind utility. The logo hero costs an import.

**Builds on.** Phase 9 (the `CommandId` registry and `Mod+b`), Phase 13 (`useResizable`, `useReveal`
/ `motionMs()`, persisted `LayoutSizes`), Phase 16 (`Popover` as the overlay primitive, the settings
pages, the `mstudio:` fs-protocol and its path jail), Phase 17 (the `gh`-backed forge and the workbench
tab strip), Phase 20 (the Reviews view and its PR links), Phase 19 (the Actions view), Phase 23 (the
palette and `PALETTE_SAFE`), Phase 27 (the full-width status bar, the pane shell, `useFocusTrap`,
`browserOpen`), Phase 28 (`tree-section.tsx`), Phase 30 (`stream-registry.ts` as the main→renderer
event-push pattern).

**Scope guardrails.** **The embedded views never get a preload.** No `window.midniteStudio`, no channel
constants, no bridge — a page loaded from the network must have no path to the IPC surface, and the
cheapest way to guarantee that is to hand it nothing. **The browser session is its own partition**
(`persist:browser`), separate from the renderer's default session, so the `mstudio:` protocol registered
in [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts) is not reachable from a web page.
**No git command, no git-engine change.** This phase adds no git subprocess; `packages/git-engine`
is untouched end to end. **Browser IPC follows the existing envelope discipline** — ops return the
`GitOpResult`-shaped result from [`domain/result.ts`](../../../packages/shared/src/domain/result.ts) rather
than throwing across the boundary, so a failed load, a blocked navigation and a certificate error are
all outcomes the UI renders. **The pane keeps its geometry.** It stays the `absolute inset-0 z-20`
overlay of the content row mounted at [`app.tsx:847`](../../../packages/app/src/app.tsx); this phase fills
it, it does not promote it into the view router. **macOS arm64 is the only target** — Phase 11's
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
      [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), grouped and commented in the style
      of the `pty:*` / `terminal:*` split at `:248–271`: `browserCreate`, `browserClose`,
      `browserNavigate`, `browserBack`, `browserForward`, `browserReload`, `browserStop`,
      `browserSetBounds`, `browserSetVisible`, `browserActivate`, `browserZoom`, `browserFind`,
      `browserFindStop`, `browserDevtools`, `browserClearData`.
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

### E — Occlusion, bounds, and everything that moves (M)

The riskiest theme. A `WebContentsView` paints above the DOM, so every overlay in the app is behind
it until told otherwise. Budget more than it looks like.

- [ ] `features/browser/use-browser-bounds.ts` — one `ResizeObserver` on the pane's content area
      pushes `browserSetBounds`. Bounds are the pane rect **minus the chrome row and tab strip**, and
      stop at the content row's bottom edge so the status bar stays visible (Phase 27's whole point).
- [ ] An **occluder registry** in the ui-store: a counter that any portalled overlay increments while
      open. While `occluders > 0`, the view is hidden via `browserSetVisible(false)`.
- [ ] Register every existing overlay as an occluder:
      [`popover.tsx`](../../../packages/app/src/components/popover.tsx),
      [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx), `ConfirmDialog`,
      `PromptDialog`, the `Mod+k` palette, and `tooltip.tsx`. A missed one is a tooltip that renders
      invisibly under a web page — enumerate them from the components directory rather than from
      memory.
- [ ] The pane's own reveal tween: hide the view for the duration of the `motionMs()` transition and
      show it on settle, rather than driving `setBounds` per frame. Cheaper, and it avoids the
      native layer tearing against a CSS opacity animation. Under `data-motion='reduced'`
      (`motionMs() === 0`) it is a straight show.
- [ ] Panel resizes drive bounds: dragging the repositories panel or the terminal splitter
      (`useResizable`) updates bounds live, throttled to animation frames.
- [ ] Window events: hide on `blur` is **not** done (a background browser should keep rendering), but
      `minimize`, `enter-full-screen` / `leave-full-screen` and display changes all re-push bounds.
- [ ] Closing the pane (`Escape`, the close button, `Mod+b`) hides the view rather than destroying it,
      so reopening is instant and page state survives.
- [ ] Switching the active tab swaps which view is visible; only one is ever attached-and-visible.
- [ ] The focus trap in the existing pane
      ([`use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts)) has to account for
      focus leaving the DOM entirely into the native view — pressing Tab out of the address bar should
      focus the page, and a chord to get back out (`Escape`) must still work. Document the boundary.
- [ ] Unit-test the occluder counter (nested overlays, unmount-while-open, double-decrement safety)
      and the bounds arithmetic as a pure function of the pane rect.

### F — The new tab page (M)

A React page, not a web page. No view is mounted for a new tab, so this surface gets the app's
tokens, theme, density and reduced-motion for free.

- [ ] `features/browser/new-tab-page.tsx`, rendered in the pane body whenever the active tab's kind is
      `newtab`, with the view hidden.
- [ ] The hero: `BrandMark` from [`brand.tsx`](../../../packages/app/src/components/brand.tsx) at a large
      size over `Wordmark` in `font-brand`, centred, generously spaced. Minimal — one mark, one
      wordmark, one search field, one row of tiles.
- [ ] A centred search/address field that focuses automatically on new tab and shares Theme G's
      URL-versus-search resolution. Enter navigates the current tab.
- [ ] Static shortcut tiles: **Google**, **YouTube**, **Figma**, each with a favicon fetched once and
      cached to disk (never hot-linked on every render), falling back to a monogram tile.
- [ ] Tiles are editable — add, remove, reorder, rename — persisted in the browser store and exposed
      in the Browser settings page. The three defaults seed a first run.
- [ ] Repo-derived tiles: when a repo is active, a second row offers its remote, its PR list and its
      Actions, built from the Phase 17 forge data already in the renderer. Absent with no active repo
      — a row with nothing to say renders nothing, per the Phase 27 rule.
- [ ] A recents strip: the last 8 distinct origins visited, from the store, each opening in the
      current tab. Clearable from the Browser settings page and from the context menu.
- [ ] Empty state on first run (no recents yet) is the hero plus tiles alone, with no empty recents
      heading.
- [ ] Reduced-motion and density respected; the page reflows to the pane's narrowest sensible width
      without horizontal scroll.

### G — The browsing chrome becomes real (M) — ✅ DONE (2026-08-30)

Everything the Phase 27 stub drew disabled, now wired — plus the parts a browser is unusable without.

- [x] Back, Forward, Reload and Stop wired to Theme A's channels. Enabled state comes from
      `canGoBack` / `canGoForward` in tab state, not from guessing.
- [x] `features/browser/resolve-input.ts` — a **pure** function turning what was typed into either a
      URL or a search. Rules, in order: an explicit scheme wins; `localhost` and bare hosts with a
      port are URLs; a token matching a `host.tld` shape with no spaces is a URL; anything else is a
      search against the configured engine (default Google). Exhaustively unit-tested — this is the
      single most user-visible piece of logic in the phase.
- [ ] Address-bar behaviour: full URL on focus with select-all, a trimmed `host/path` on blur, the
      resolved destination previewed while typing, and `Escape` restoring the current URL.
- [ ] An indeterminate loading bar under the chrome row while `loading`, and a stop button replacing
      reload for its duration.
- [ ] An error page rendered in the **DOM** (an `EmptyState` with the `BrowserNavError` code,
      description and a Retry) for `did-fail-load` and for Theme B's blocked navigations — never the
      engine's own default error page, which is unstyled and off-brand.
- [ ] Find-in-page: `Mod+f` scoped to the browser, a small overlay input, `findInPage` /
      `stopFindInPage`, match count, next/previous, `Escape` to dismiss.
- [ ] Zoom per tab: `Mod+=` / `Mod+-` / `Mod+0`, persisted per origin, with the current factor shown
      in the chrome when it is not 100%.
- [ ] Raise the status-bar toggle's overflow priority in
      [`browser-toggle.tsx`](../../../packages/app/src/features/status-bar/browser-toggle.tsx) from `5` and
      rewrite the comment that justified it (*"the browser pane holds nothing yet"*) — it now holds
      work, and should no longer be the first control into the `…` popover.
- [ ] New palette commands for the browser ops that deserve one (`browser.newTab`, `browser.devtools`,
      `browser.clearData`), added to `COMMANDS` and to
      [`palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts); anything
      destructive stays out of `PALETTE_SAFE`.

### H — Dev-companion powers (M) — ◐ PARTIAL (2026-08-30)

What makes it the browser of a git client rather than a browser that happens to be in one.

- [x] DevTools for the active tab, opened **detached** (`openDevTools({ mode: 'detach' })`). Detached
      rather than docked on purpose: a docked panel resizes the view from underneath Theme E's bounds
      arithmetic, and reconciling the two is not worth the window it saves.
- [x] A DevTools affordance in the chrome row and a palette command; closing the tab closes its
      DevTools window.
- [ ] `features/browser/dev-server.ts` — detect a dev server for the active repo: read its
      `package.json` scripts for a `dev` / `start` script, extract an explicit `--port`, and otherwise
      probe a short list of conventional ports (3000, 4200, 5173, 8000, 8080) for a listening socket.
      Detection is a **hint**, never an auto-navigation.
- [ ] A detected dev server appears as a tile on the new-tab page and as a palette command
      ("Open dev server"), with the port shown. Absent when nothing is listening.
- [ ] Responsive viewport presets: Mobile (390), Tablet (834), Laptop (1280) and Full. A preset
      narrows the view's bounds inside the pane, centred, with the app background showing either side
      and the current width labelled.
- [ ] Be honest about the limit in the UI and the code comment: this is a **width** emulation, not
      device emulation. True DPR and user-agent overrides need `Emulation.setDeviceMetricsOverride`
      through the debugger protocol, which is out of scope; a page that branches on
      `devicePixelRatio` or UA will not be fooled.
- [ ] Unit-test the port extraction and the preset bounds arithmetic; probe logic is behind an
      injectable socket check so the test needs no network.

### I — The forge, opened in place (L)

- [ ] `services/open-in-midnite.ts` — one entry point, `openInMidnite(url, { originRepoId })`, that
      opens a tab, reveals the pane and routes the tab into the derived group from Theme D.
- [ ] A **Link handling** setting on the Browser settings page: *Open links in — Midnite browser
      (default) | System browser*. The default flips app-wide behaviour, so it is a setting from day
      one, not a follow-up.
- [ ] Modifier escape hatches, documented in the setting's help text: `Cmd`/`Ctrl`-click opens in the
      *other* target, `Shift`-click forces the system browser, middle-click opens a background tab.
- [ ] Route the existing call sites through it:
      [`external-link.tsx`](../../../packages/app/src/features/markdown/external-link.tsx),
      [`linkify-rehype.ts`](../../../packages/app/src/features/commit/linkify-rehype.ts), the remote links in
      [`graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx), and the repo/branch
      context menus. Enumerate them from `grep -rn "openExternal"` rather than from this list.
- [ ] `openExternal` in [`queries.ts`](../../../packages/app/src/services/queries.ts) stays and remains the
      only path for non-`http(s)` protocols; `OPEN_EXTERNAL_PROTOCOLS` in main is unchanged.
      `ExternalLink`'s existing comment about `file://` same-window navigation stays true and should
      be extended, not replaced.
- [ ] Reviews integration: PR links, commit links and compare links in
      [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx) open in-app, carrying the
      PR's repo as `originRepoId`.
- [ ] Actions integration: a workflow run's `details_url` opens in-app from the Actions view.
- [x] `features/browser/preview-deploy.ts` — a **pure** matcher over a check run's `details_url` and PR
      comment bodies, against a host-suffix allowlist (`vercel.app`, `netlify.app`, `pages.dev`,
      `surge.sh`, `render.com`, `fly.dev`, …). Returns candidates, not a verdict.
- [ ] An "Open preview" affordance in the Reviews view when the matcher finds exactly one candidate; a
      small menu when it finds several; nothing when it finds none. Say in the code comment that this
      is a heuristic over an allowlist and will miss self-hosted preview hosts — a false negative is
      an absent button, which is the right failure.
- [x] Unit-test the matcher against fixture check-run and comment payloads, including the negatives
      (a `vercel.app` substring inside a longer host must not match; matching is on suffix
      boundaries).

## Files this phase touches

**New — shared**
- [`packages/shared/src/domain/browser.ts`](../../../packages/shared/src/domain/browser.ts) — tab, group,
  bounds and error types.

**New — desktop (main)**
- `packages/desktop/src/main/browser-service.ts` — the only constructor of `WebContentsView`.
- `packages/desktop/src/main/ipc/browser-handlers.ts` — channel registration.

**New — app (renderer)**
- `packages/app/src/store/browser-store.ts` — tabs, groups, recents, settings.
- `packages/app/src/features/browser/tab-strip.tsx`, `tab-group.tsx`, `new-tab-page.tsx`,
  `address-bar.tsx`, `resolve-input.ts`, `use-browser-bounds.ts`, `dev-server.ts`,
  `preview-deploy.ts`, `find-bar.tsx`, `error-page.tsx`.
- `packages/app/src/services/open-in-midnite.ts`.
- `packages/app/src/features/settings/settings-pages/browser-page.tsx`.

**Modified**
- [`packages/app/src/features/browser/browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx)
  — the stub becomes the pane shell: tab strip, chrome row, body switching between the new-tab page,
  the error page and the (invisible, native) view.
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — the `mstudio:browser:*` surface.
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — browser-scoped
  chords and the new palette commands.
- [`packages/desktop/src/main/window.ts`](../../../packages/desktop/src/main/window.ts) — the corrected
  "local content only" comment; view teardown on close.
- [`packages/desktop/src/main/fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts) — confirm
  (or fix) per-session registration.
- [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) — the new browser items.
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — occluder wiring around the pane mount at
  `:847`.
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — the occluder counter.
- [`packages/app/src/features/status-bar/browser-toggle.tsx`](../../../packages/app/src/features/status-bar/browser-toggle.tsx)
  — priority raised off `5`, comment rewritten.
- [`packages/app/src/styles.css`](../../../packages/app/src/styles.css) — the group colour tokens.
- [`packages/app/src/features/markdown/external-link.tsx`](../../../packages/app/src/features/markdown/external-link.tsx),
  [`linkify-rehype.ts`](../../../packages/app/src/features/commit/linkify-rehype.ts),
  [`graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx),
  [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx) — routed through
  `openInMidnite`.
- [`packages/app/e2e/browser-pane.spec.ts`](../../../packages/app/e2e/browser-pane.spec.ts) — its 130 lines
  assert a stub that no longer exists; rewritten, not extended.

**Untouched, deliberately**
- `packages/git-engine` — no git command, no parser, no layout change anywhere in this phase.

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `moon run desktop:start` — the pane loads a real page, the status bar stays visible below it,
      and `Ctrl+`` still reaches the terminal from inside the pane.
- [ ] Unit: `resolve-input.ts` across the full table (scheme, bare host, host with port, localhost,
      IPv4, a query with spaces, a query containing a dot, a single word, empty).
- [ ] Unit: `browser-store` reducers — close-active neighbour selection, reorder across groups,
      `reopenClosed` position restore, derived-group appearance and disappearance.
- [ ] Unit: the occluder counter (nested, unmount-while-open, no negative counts) and the bounds
      function.
- [ ] Unit: `preview-deploy.ts` positives and suffix-boundary negatives; `dev-server.ts` port
      extraction.
- [ ] Unit: `browser-service` lifecycle against a fake view.
- [ ] Security: a test asserting `typeof window.midniteStudio === 'undefined'` inside an embedded view.
- [ ] Security: a test asserting an `mstudio:` URL does not resolve from the `persist:browser` partition.
- [ ] Security: a test asserting every permission request and permission check is denied.
- [ ] e2e: `browser-pane.spec.ts` rewritten — open the pane, open a tab against a local fixture
      server, navigate, back/forward, close, reopen, and assert tab-strip semantics.
- [ ] e2e: a screenshot spec covering the new-tab page in both themes and at both densities.
- [ ] **Open, for a human:** the occlusion sweep. With a page loaded, open in turn the command
      palette, a context menu, a tooltip, a `ConfirmDialog` and the status-bar overflow popover, and
      confirm each renders *above* the pane. This is the phase's most likely regression and no
      automated test covers it convincingly.
- [ ] **Open, for a human:** log in to GitHub and Figma in the pane, quit and relaunch, and confirm
      the sessions survived — the whole justification for the persistent partition.
- [ ] **Open, for a human:** drag the repositories panel and the terminal splitter with a page loaded;
      the view must track the pane without tearing or lag.

## Not in this phase

- **The page console piped into Phase 18 diagnostics.** Considered and cut in the brainstorm: it
  overlaps almost entirely with just opening DevTools, and it is the largest new plumbing of the four
  dev features for the least new capability.
- **Per-site permission prompts.** Theme B denies everything. A consent UI with per-origin storage is
  a phase-sized surface of its own, and nothing in the shortcut set (Google, YouTube, Figma, a dev
  server, a forge) needs a permission to be useful.
- **A downloads manager.** `will-download` cancels loudly. Downloads mean a destination picker, a
  progress surface, a disk-write path outside the fs jail, and a "this file may be dangerous" story.
- **Extensions.** No `loadExtension`, no ad blocking, no user scripts.
- **Bookmarks as a real store.** Editable shortcut tiles and eight recents are the whole persistence
  model; no folders, no tags, no import, no sync.
- **Promoting the browser into the view router.** It stays the content-row overlay Phase 27 built.
  Giving it title-bar nav, a back/forward stack entry and a section-tree home is a coherent later
  phase, and it would fight Theme E's bounds work if attempted at the same time.
- **True device emulation.** Width presets only — see Theme H.
- **Windows and Linux bounds behaviour.** Phase 11 packages macOS arm64 and that is the target.
- **Multiple browser windows**, picture-in-picture, media-key handling, and reader mode.

## Decisions / open questions

- **Resolved — `WebContentsView`, not the `<webview>` tag.** `<webview>` would make Theme E almost
  disappear: an in-DOM element composes with `z-index` and needs no bounds choreography at all. It
  was rejected anyway because Electron discourages it, it carries a documented performance and
  reliability penalty, and it has no guarantee of surviving future majors — building a phase this
  size on it buys a migration later. The cost is paid once, in Theme E, and bought back in process
  isolation and clean DevTools attachment.
- **Resolved — tab groups are both manual and repo-derived.** Manual alone leaves the browser generic;
  derived alone fights the user when they want to organise ad-hoc browsing. Derived groups are
  implicit and non-persisted precisely so they can never become clutter the user has to clean up.
- **Resolved — a persistent `persist:browser` partition, with every permission denied.** Without
  persistence the Figma and GitHub shortcuts are near-useless, since every launch starts logged out.
  Denying all permissions keeps that convenience from widening the security surface, and "Clear
  browsing data" in settings is the escape valve.
- **Resolved — the new-tab page is DOM, not a web page.** No view is mounted for a new tab. It
  inherits tokens, theme, density and reduced-motion for free, and it means the most-seen surface in
  the browser has zero engine dependency.
- **Resolved — DevTools open detached.** A docked panel resizes the view from under Theme E.
- **Resolved — browser chords live in a browser scope, not the app scope.** `Mod+w` is the forcing
  case: app-scoped it closes the window.
- **Open — the default search engine.** Recommend Google, since a Google tile is already in the
  requested shortcut set and it is the least surprising default; make it a setting with DuckDuckGo and
  a custom `%s` template alongside, so the choice costs nothing to change.
- **Open — whether tabs are app-global or per-repo.** Recommend **app-global**, with `originRepoId`
  only driving the derived group. Per-repo tab sets would mean switching repos hides your tabs, which
  is surprising in something that presents itself as a browser.
- **Open — how the pane behaves when the app quits with tabs open.** Recommend restoring tabs as
  *inactive* records and mounting no views until the pane is next opened, so a relaunch never pays for
  a Chromium process the user has not asked for.
- **Open — the preview-deploy host allowlist.** Recommend starting with `vercel.app`, `netlify.app`,
  `pages.dev`, `fly.dev`, `surge.sh` and `onrender.com`, made a setting rather than a constant, since
  self-hosted preview domains are the common case in private repos.
- **Open — whether the address bar shows a security indicator.** Recommend a minimal one: nothing for
  `https:`, an explicit "Not secure" chip for `http:`. Full certificate detail is out of proportion to
  a browser this size, but silently rendering plaintext http identically to https is the one omission
  that would be actively misleading.
