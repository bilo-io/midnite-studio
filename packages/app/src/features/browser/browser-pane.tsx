import { useEffect, useRef, useState, type FormEvent } from 'react';

import { GoArrowLeft, GoArrowRight, GoSync, GoX } from 'react-icons/go';

import { IconButton } from '../../components/icon-button';
import { useFocusTrap } from '../../components/use-focus-trap';
import { motionMs } from '../../components/use-reveal';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { useBrowserStore } from '../../store/browser-store';
import { BrowserTabStrip } from './tab-strip';
import { useBrowserBounds } from './use-browser-bounds';
import { useBrowserTabsEffects } from './use-browser-tabs';

/**
 * The browser pane: real tabs and groups over a `WebContentsView` engine
 * (Themes A–D), with Back/Forward/Reload left disabled — Theme G still owns
 * wiring those and the URL-vs-search resolver. The address bar is a raw-URL
 * minimal version of that: no search fallback, `Enter` navigates the tab
 * verbatim.
 *
 * Mounted exactly where the Phase 27 stub was — `absolute inset-0` over the
 * content row — with the same focus trap, Escape handling and
 * close-focus-restore. Only the toolbar's address field and the body
 * changed from a stub to something real.
 */
export function BrowserPane({ shown }: { shown: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const [draft, setDraft] = useState(activeTab?.url ?? '');
  const [editing, setEditing] = useState(false);

  useBrowserTabsEffects(shown);
  const bodyRef = useBrowserBounds(activeTabId, shown && activeTab?.kind === 'page');

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useUiStore.getState().setBrowserOpen(false);
    };
    // No `stopPropagation`: `Ctrl+`` must still reach the terminal's global
    // escape allow-list while this pane is open.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Restore focus to the toggle the moment the pane stops being shown —
  // Escape, the close button, or Mod+b again all funnel through `shown`
  // flipping false, matching the half of Popover's close() this pane cannot
  // share directly (its trigger lives in a sibling component).
  useEffect(() => {
    if (!shown) return;
    return () => {
      document.querySelector<HTMLButtonElement>('[data-testid="browser-toggle"]')?.focus();
    };
  }, [shown]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setEditing(false);
    if (!activeTab || draft.trim().length === 0) return;
    if (activeTab.kind === 'newtab') {
      useBrowserStore.getState().updateTabState(activeTab.id, { kind: 'page', url: draft });
      void bridge()?.browser.create({ tabId: activeTab.id, url: draft });
    } else {
      bridge()?.browser.navigate({ tabId: activeTab.id, url: draft });
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Browser"
      // z-20: one rung above the terminal frame's z-10 (app.tsx) within this
      // same content row — a local ordering, not the global menu/popover/
      // dialog/tooltip scale in tailwind.config.ts, which is for layers
      // portalled to document.body and unrelated to this row's own stacking.
      className={`absolute inset-0 z-20 flex flex-col bg-background outline-none transition-opacity ${
        shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ transitionDuration: `${motionMs()}ms` }}
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

      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {activeTab?.kind !== 'page' ? (
          <div
            data-testid="browser-newtab"
            className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground"
          >
            <p className="text-sm font-medium text-foreground">New Tab</p>
            <p className="max-w-sm text-xs">Type an address above and press Enter.</p>
          </div>
        ) : null}
        {/* A crashed or unresponsive view is surfaced, never swallowed — the
            native layer is blank at this point, so without this the tab
            would just be an empty rectangle with no way out (Theme A). */}
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
      </div>
    </div>
  );
}
