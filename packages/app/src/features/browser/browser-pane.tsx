import { useEffect, useRef, useState, type FormEvent } from 'react';

import { GoArrowLeft, GoArrowRight, GoSync, GoX } from 'react-icons/go';

import { IconButton } from '../../components/icon-button';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { motionMs } from '../../components/use-reveal';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { useBrowserStore } from '../../store/browser-store';
import { BROWSER_LAYOUT_OPTIONS } from './browser-layouts';
import { BrowserLayoutIllustration } from './layout-illustration';
import { BrowserTabStrip } from './tab-strip';
import { NewTabPage } from './new-tab-page';
import { useBrowserBounds } from './use-browser-bounds';
import { useBrowserTabsEffects } from './use-browser-tabs';
import { resolveInput } from './resolve-input';
import { FindBar } from './find-bar';

/**
 * The browser pane: real tabs and groups over a `WebContentsView` engine
 * (Themes A–D), with Back/Forward/Reload left disabled — Theme G still owns
 * wiring those and the URL-vs-search resolver. The address bar is a raw-URL
 * minimal version of that: no search fallback, `Enter` navigates the tab
 * verbatim.
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

  const [draft, setDraft] = useState(activeTab?.url ?? '');
  const [editing, setEditing] = useState(false);

  /*
    The pane's chrome (below) reacts to `shown` alone — a `WebContentsView`
    is a native layer, not clipped by the side-by-side column's still-
    animating outer box the way that chrome is, so pushing its bounds/
    visibility before the tween settles would paint the real page past the
    column's current (narrower) edge. `nativeVisible` is what actually
    reaches the engine; `shown` on its own only controls this component's
    own DOM.
  */
  const nativeVisible = shown && settled && activeTab?.kind === 'page';
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

  useEffect(() => {
    if (!editing) setDraft(activeTab?.url ?? '');
  }, [activeTab?.url, activeTab?.id, editing]);

  // A brand new tab focuses the address bar automatically — the whole
  // surface of a blank tab is "type something here" (Theme F's new-tab
  // page owns the fuller version; this is the minimal stand-in).
  useEffect(() => {
    if (shown && activeTab?.kind === 'newtab') addressRef.current?.focus();
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

  // Restore focus to the toggle the moment the pane stops being shown —
  // Escape, the close button, or Mod+b again all funnel through `shown`
  // flipping false, matching the half of Popover's close() this pane cannot
  // share directly (its trigger lives in a sibling component).
  useEffect(() => {
    if (!shown) return;
    return () => {
      /*
        Unless the pane is only being re-parented. Switching layout swaps the
        pane between `app.tsx`'s overlay slot and its in-flow one, which is an
        unmount and a fresh mount of THIS component with the browser still
        open — and restoring focus to the status bar there would throw the
        keyboard out of the browser on every use of the toolbar's layout
        picker. `browserOpen` is the difference between the two cases.
      */
      if (useUiStore.getState().browserOpen) return;
      document.querySelector<HTMLButtonElement>('[data-testid="browser-toggle"]')?.focus();
    };
  }, [shown]);

  const [findOpen, setFindOpen] = useState(false);
  const [viewportPreset, setViewportPreset] = useState<'full' | '390' | '834' | '1280'>('full');
  const browserLayout = useUiStore((s) => s.browserLayout);
  const fullScreen = browserLayout === 'full';

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
        <IconButton
          icon={GoSync}
          label="Reload"
          disabled={!activeTab || activeTab.kind !== 'page'}
          size="sm"
          onClick={() => activeTab && bridge()?.browser.reload({ tabId: activeTab.id })}
        />
        <form onSubmit={onSubmit} className="min-w-0 flex-1">
          <input
            ref={addressRef}
            type="text"
            value={draft}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search or enter address"
            aria-label="Address"
            className="w-full rounded border border-border bg-card px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </form>
        <select
          aria-label="Responsive viewport preset"
          value={viewportPreset}
          onChange={(e) => setViewportPreset(e.target.value as 'full' | '390' | '834' | '1280')}
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
          onClick={() => setFindOpen((v) => !v)}
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
        {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      </div>
    </div>
  );
}
