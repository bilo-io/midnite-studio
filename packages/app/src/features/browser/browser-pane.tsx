import { useEffect, useRef, useState, type FormEvent } from 'react';

import { GoArrowLeft, GoArrowRight, GoSync, GoX } from 'react-icons/go';

import { IconButton } from '../../components/icon-button';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { motionMs } from '../../components/use-reveal';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { originOf, useBrowserStore, type BrowserViewportPreset } from '../../store/browser-store';
import { BROWSER_LAYOUT_OPTIONS } from './browser-layouts';
import { BrowserErrorPage } from './error-page';
import { BrowserLayoutIllustration } from './layout-illustration';
import { BrowserTabStrip } from './tab-strip';
import { NewTabPage } from './new-tab-page';
import { useBrowserBounds } from './use-browser-bounds';
import { useBrowserTabsEffects } from './use-browser-tabs';
import { resolveInput, trimUrlForDisplay } from './resolve-input';
import { FindBar } from './find-bar';

/**
 * The browser pane: real tabs and groups over a `WebContentsView` engine
 * (Themes A–D), with Back/Forward/Reload wired to Theme A's channels and the
 * address bar resolving through `resolveInput` (Theme G).
 *
 * Two shapes, chosen by `browserLayout`, and the difference is structural
 * rather than cosmetic:
 *
 * - **Full screen** keeps the original `absolute` overlay, extended LEFT past
 *   its own containing block by `--nav-offset` so it covers the nav rail as
 *   well as the content row (`z-browser` clears the rail's `z-40`). It stops
 *   at the bottom of the content row, which is what leaves the footer alone —
 *   the status bar is a sibling of that row, not inside it. Before this the
 *   pane respected the rail's padding, so the right edge of the page was
 *   clipped by exactly the rail's width for no benefit: nothing in the rail
 *   is reachable while a full-screen browser is what you are looking at.
 * - **Side by side** is not positioned at all — `app.tsx` renders it as a real
 *   flex child of the content row, so the view beside it REFLOWS into the
 *   other half rather than being covered by an overlay and cropped.
 *
 * The focus trap, Escape handling and close-focus-restore are the same in
 * both.
 */
export function BrowserPane({
  shown,
  settled = true,
}: {
  shown: boolean;
  /**
   * Whether the pane's own SIZE has finished changing — distinct from
   * `shown`, which only ever gates the CHROME (opacity, focus trap, the
   * "new tab" address-bar focus): the toolbar and address bar must stay
   * live from the instant `shown` goes true, or a user cannot even type a
   * URL until an open animation finishes. `false` for exactly as long as
   * the side-by-side column's width tween takes (`app.tsx`'s
   * `browserTween.settled`) — see `useBrowserBounds`/`useBrowserTabsEffects`
   * below for why the NATIVE view specifically has to wait for it.
   * Defaults to `true` for the full-screen overlay, which is always at its
   * final size the instant it mounts and so has nothing to wait for.
   */
  settled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const zoomByOrigin = useBrowserStore((s) => s.zoomByOrigin);
  const findOpen = useBrowserStore((s) => s.findOpen);

  const [draft, setDraft] = useState(activeTab ? trimUrlForDisplay(activeTab.url) : '');
  const [editing, setEditing] = useState(false);

  /*
    The pane's chrome (below) reacts to `shown` alone — a `WebContentsView`
    is a native layer, not clipped by the side-by-side column's still-
    animating outer box the way that chrome is, so pushing its bounds/
    visibility before the tween settles would paint the real page past the
    column's current (narrower) edge. `nativeVisible` is what actually
    reaches the engine; `shown` on its own only controls this component's
    own DOM.

    A `navError` (Theme G) hides it too, the same way `crashed`/`newtab`
    already do — `error-page.tsx` renders in its place, and Chromium's own
    unstyled error page must never show through.
  */
  const hasNavError = activeTab?.kind === 'page' && Boolean(activeTab.navError);
  const nativeVisible = shown && settled && activeTab?.kind === 'page' && !hasNavError;
  const { ref: bodyRef, sync: syncBrowserView } = useBrowserBounds(activeTabId, nativeVisible);
  useBrowserTabsEffects(shown, settled, syncBrowserView);

  useFocusTrap(containerRef, shown);

  // Ensure there is always at least one tab once the pane is first shown —
  // "browser.toggle opening with zero tabs creates one new tab" (Theme C).
  // The emptiness check lives in the store, so StrictMode's double-invoked
  // effect still yields exactly one tab.
  useEffect(() => {
    if (shown) useBrowserStore.getState().ensureTab();
  }, [shown, tabs.length]);

  // Blurred (or not editing at all): the trimmed `host + pathname` display
  // form. Focused: the full raw URL — see the `onFocus` handler below,
  // which sets both `editing` and the full-URL draft together so this
  // effect (keyed on `editing`) does not immediately overwrite it back to
  // the trimmed form on the very render that opens editing.
  useEffect(() => {
    if (!editing) setDraft(activeTab?.url ? trimUrlForDisplay(activeTab.url) : '');
  }, [activeTab?.url, activeTab?.id, editing]);

  // Focus selects the full URL — runs after the DOM has the full-URL value
  // `onFocus` just set, so `.select()` selects the real thing rather than
  // whatever the trimmed display still held mid-render.
  useEffect(() => {
    if (editing) addressRef.current?.select();
  }, [editing]);

  // A brand new tab focuses the address bar automatically — the whole
  // surface of a blank tab is "type something here", alongside the fuller
  // new-tab page itself (Theme F: recents, shortcut tiles, a repo row).
  useEffect(() => {
    if (shown && activeTab?.kind === 'newtab') {
      const raf = requestAnimationFrame(() => {
        addressRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [shown, activeTab?.id, activeTab?.kind]);

  /*
    Escape closes the pane, through the shared dismissal stack (Phase 62), and
    only while the pane is actually `shown` — the listener this replaces had
    `[]` deps and was live for every Escape ever pressed, open or not.

    PASSIVE, and this is the one place in the app where that is not a style
    choice. `blocking` is one flag with two duties: it consumes Escape, and it
    registers an occluder — and an occluder is precisely what hides this pane's
    own native `WebContentsView` (`use-browser-bounds.ts` keys on
    `occluders > 0`). A blocking registration here would blank the page for as
    long as the browser was open, i.e. always. Passive is also the right answer
    for delivery: a menu, popover or dialog raised over the pane is blocking, so
    it takes Escape first and the pane survives — which is the rule this phase
    is for.
  */
  useDismiss(shown, () => useUiStore.getState().setBrowserOpen(false), {
    layer: 'inline',
    blocking: false,
  });

  /*
    Restoring focus to the toggle is `useFocusTrap(containerRef, shown)`'s job
    now (Phase 68 Theme A), which is why there is no effect here any more. What
    stood here reached for the toggle with
    `document.querySelector('[data-testid="browser-toggle"]')` — a test id used
    as production wiring — and focused it without `preventScroll`.

    This pane is the reason that hook captures on its own first render as well
    as on the false→true flip: `useReveal` mounts it with `shown={false}` so the
    fade has a painted frame to travel from, and `NewTabPage`'s autoFocus search
    box takes focus in that frame. By the time `shown` turns true, the toggle is
    already a commit out of `document.activeElement`'s reach.

    Its one piece of real logic, "don't restore if the pane is only being
    re-parented between `app.tsx`'s overlay and in-flow slots", is subsumed:
    the layout swap unmounts and remounts this component in the same commit, so
    the fresh trap re-focuses its own container immediately afterwards and the
    keyboard stays in the browser either way.
  */

  /*
    Per tab and persisted (Phase 71 Theme C), where this was component-local
    `useState` and reset every time the pane closed. A tab restored from a
    pre-Phase-71 blob carries no preset, which reads as `'full'`.
  */
  const viewportPreset = activeTab?.viewportPreset ?? 'full';
  const browserLayout = useUiStore((s) => s.browserLayout);
  const fullScreen = browserLayout === 'full';

  /*
    An explicit "Not secure" chip for `http:`, nothing at all for `https:`
    (Theme G, resolved deliberately — see the phase doc's `## Decisions`).
    No padlock for the secure case: one that is always there teaches
    nothing, and the one omission that would actively mislead is rendering
    plaintext http identically to https.
  */
  const activeScheme =
    activeTab?.kind === 'page' && activeTab.url
      ? (() => {
          try {
            return new URL(activeTab.url).protocol;
          } catch {
            return null;
          }
        })()
      : null;
  const notSecure = activeScheme === 'http:';

  // The tab's own zoom (Theme G) — rendered only when it is not 1, so a
  // permanently-visible "100%" is not noise on every tab, every time.
  const activeOrigin = activeTab?.kind === 'page' ? originOf(activeTab.url) : null;
  const zoomFactor = activeOrigin ? (zoomByOrigin[activeOrigin] ?? 1) : 1;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setEditing(false);
    if (!activeTab || draft.trim().length === 0) return;
    const resolvedUrl = resolveInput(draft);
    if (activeTab.kind === 'newtab') {
      useBrowserStore.getState().updateTabState(activeTab.id, { kind: 'page', url: resolvedUrl });
      void bridge()?.browser.create({ tabId: activeTab.id, url: resolvedUrl });
    } else {
      bridge()?.browser.navigate({ tabId: activeTab.id, url: resolvedUrl });
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Browser"
      /*
        Full screen: an overlay of the content row, stretched left over the nav
        rail. `z-browser` (45) is the one entry in the app's z scale that is
        not a portalled layer — it exists solely to clear the shell rail's
        fixed `z-40`, and stays below `menu`/`dialog` so a context menu raised
        inside the browser still lands on top.

        Side by side: no positioning of its own. It fills the flex child
        `app.tsx` gives it, and `z-20` keeps the old ordering — one rung above
        the terminal frame's `z-10` within this same row.
      */
      className={`${
        fullScreen ? 'absolute inset-y-0 right-0 z-browser' : 'relative h-full w-full z-20'
      } flex flex-col bg-background outline-none transition-opacity ${
        shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{
        transitionDuration: `${motionMs()}ms`,
        /*
          The pane's containing block starts at `<main>`'s content edge, which
          `@bilo-io/shell` pads by `--nav-offset` for the fixed rail. Pulling
          the left edge back by the same amount is what puts it at the window
          edge — measured from the variable the shell itself writes, so a
          locked-open (16rem) rail is covered as exactly as a collapsed one.
        */
        ...(fullScreen ? { left: 'calc(-1 * var(--nav-offset, 0px))' } : null),
      }}
    >
      <BrowserTabStrip />

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <IconButton
          icon={GoArrowLeft}
          label="Back"
          disabled={!activeTab?.canGoBack}
          size="sm"
          onClick={() => activeTab && bridge()?.browser.back({ tabId: activeTab.id })}
        />
        <IconButton
          icon={GoArrowRight}
          label="Forward"
          disabled={!activeTab?.canGoForward}
          size="sm"
          onClick={() => activeTab && bridge()?.browser.forward({ tabId: activeTab.id })}
        />
        {activeTab?.loading ? (
          <IconButton
            icon={GoX}
            label="Stop loading"
            size="sm"
            onClick={() => activeTab && bridge()?.browser.stop({ tabId: activeTab.id })}
          />
        ) : (
          <IconButton
            icon={GoSync}
            label="Reload"
            disabled={!activeTab || activeTab.kind !== 'page'}
            size="sm"
            onClick={() => activeTab && bridge()?.browser.reload({ tabId: activeTab.id })}
          />
        )}
        <form onSubmit={onSubmit} className="relative min-w-0 flex-1">
          <div className="gradient-border gradient-border--glow browser-search-sync relative flex items-center rounded border border-border bg-card">
            {notSecure ? (
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-[hsl(var(--browser-insecure)/0.15)] px-1 py-0.5 text-[10px] font-medium leading-none text-[hsl(var(--browser-insecure))] z-10">
                Not secure
              </span>
            ) : null}
            <input
              ref={addressRef}
              type="text"
              value={draft}
              onFocus={() => {
                setEditing(true);
                setDraft(activeTab?.url ?? '');
              }}
              onBlur={() => setEditing(false)}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                // Belongs to this field, not to the pane: stop it here before
                // `use-dismiss`'s window listener sees it and closes the
                // pane out from under an aborted edit.
                event.stopPropagation();
                setEditing(false);
                addressRef.current?.blur();
              }}
              placeholder="Search or enter address"
              aria-label="Address"
              className={`w-full rounded border-0 bg-transparent py-1 pr-2 text-xs outline-none ${
                notSecure ? 'pl-[4.75rem]' : 'pl-2'
              }`}
            />
            {editing && draft.trim().length > 0 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 max-w-[45%] -translate-y-1/2 truncate text-[10px] text-muted-foreground/70"
              >
                {resolveInput(draft)}
              </span>
            ) : null}
          </div>
        </form>
        {zoomFactor !== 1 ? (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title="Browser zoom">
            {Math.round(zoomFactor * 100)}%
          </span>
        ) : null}
        <select
          aria-label="Responsive viewport preset"
          value={viewportPreset}
          disabled={!activeTab}
          onChange={(e) =>
            activeTab &&
            useBrowserStore
              .getState()
              .setViewportPreset(activeTab.id, e.target.value as BrowserViewportPreset)
          }
          className="rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="full">Full width</option>
          <option value="390">Mobile (390px)</option>
          <option value="834">Tablet (834px)</option>
          <option value="1280">Laptop (1280px)</option>
        </select>
        <button
          type="button"
          title="Find in page (Mod+F)"
          disabled={!activeTab || activeTab.kind !== 'page'}
          onClick={() => useBrowserStore.getState().toggleFind()}
          className="rounded px-2 py-1 text-xs border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Find
        </button>
        {/*
          The same three drawings the launcher offers, at toolbar size — so
          changing your mind about the layout costs one click rather than
          closing the pane and re-answering the launcher. `aria-pressed`
          rather than a radiogroup: these are three toggles in a toolbar, and
          a group would claim a keyboard convention (arrow-key roving) the
          surrounding toolbar does not follow.
        */}
        <div role="group" aria-label="Browser layout" className="flex shrink-0 items-center gap-0.5">
          {BROWSER_LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.layout}
              type="button"
              title={option.short}
              aria-label={option.short}
              aria-pressed={option.layout === browserLayout}
              data-testid={`browser-layout-pick-${option.layout}`}
              onClick={() => useUiStore.getState().setBrowserLayout(option.layout)}
              className={`rounded border p-0.5 transition-colors ${
                option.layout === browserLayout
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-accent'
              }`}
            >
              <BrowserLayoutIllustration layout={option.layout} className="h-4 w-6" />
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Toggle DevTools (detached / embedded)"
          disabled={!activeTab || activeTab.kind !== 'page'}
          onClick={() => activeTab && bridge()?.browser.devtools({ tabId: activeTab.id, mode: 'detach' })}
          className="rounded px-2 py-1 text-xs font-mono border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          DevTools
        </button>
        <IconButton
          icon={GoX}
          label="Close browser"
          size="sm"
          onClick={() => useUiStore.getState().setBrowserOpen(false)}
        />
      </div>

      {/*
        An indeterminate 2px bar under the chrome row while the active tab is
        loading (Theme G) — `h-0.5` on an empty div rather than an actual
        progress element, since there is no real percentage to report.
        `browser-loading-bar` is a no-op under reduced motion by way of the
        shell's own blanket animation reset — see its comment in styles.css.
      */}
      {activeTab?.loading ? (
        <div className="h-0.5 shrink-0 bg-border">
          <div className="browser-loading-bar h-full w-full bg-primary" />
        </div>
      ) : null}

      {/*
        The emulation limit, written where a user sees it rather than only in
        a comment (Phase 71 Theme C). The preset changes WIDTH ONLY:
        `devicePixelRatio` and the user-agent string are untouched, so a page
        that branches on either is not fooled by it. True device emulation
        needs `Emulation.setDeviceMetricsOverride` through the debugger
        protocol and is deliberately out of scope — a control that silently
        did half of what its label implied would be worse than one that says
        so. Shown only while a preset is active: with no constraint applied
        there is no limit to warn about.
      */}
      {viewportPreset !== 'full' ? (
        <p className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
          Width only — the device pixel ratio and user agent are unchanged, so a page that
          branches on either still sees a desktop.
        </p>
      ) : null}

      <div
        ref={bodyRef}
        className={`relative min-h-0 flex-1 ${
          viewportPreset !== 'full' ? 'mx-auto border-x border-border shadow-2xl' : ''
        }`}
        style={{
          width: viewportPreset === 'full' ? '100%' : `${viewportPreset}px`,
        }}
      >
        {activeTab?.kind !== 'page' ? <NewTabPage /> : null}
        {activeTab?.kind === 'page' && activeTab.crashed ? (
          <div
            data-testid="browser-crashed"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background text-center"
          >
            <p className="text-sm font-medium text-foreground">This page stopped responding</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Its renderer crashed or stopped answering. Reloading starts it again.
            </p>
            <button
              type="button"
              onClick={() => {
                useBrowserStore.getState().updateTabState(activeTab.id, { crashed: false, loading: true });
                bridge()?.browser.reload({ tabId: activeTab.id });
              }}
              className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              Reload page
            </button>
          </div>
        ) : null}
        {activeTab?.kind === 'page' && !activeTab.crashed && activeTab.navError ? (
          <BrowserErrorPage tabId={activeTab.id} error={activeTab.navError} />
        ) : null}
        {findOpen && <FindBar onClose={() => useBrowserStore.getState().closeFind()} />}
      </div>
    </div>
  );
}
