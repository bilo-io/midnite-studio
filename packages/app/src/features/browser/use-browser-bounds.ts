import { useCallback, useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * Keeps the active tab's `WebContentsView` sized to the pane's web area.
 *
 * A pulled-forward slice of Theme E's bounds work — not the whole theme.
 * This hook tracks resize (`ResizeObserver` + a window `resize` fallback for
 * display-scale changes `ResizeObserver` alone can miss) so the view does
 * not desync from the pane as it grows and shrinks, but it does NOT install
 * Theme E's occluder registry: a popover, the command palette or a tooltip
 * opened while a page is loaded will still paint BENEATH the native view
 * until that theme wires every overlay as an occluder. Known, accepted gap
 * for this batch — see todo/phase-32-browser-engine-and-tabs.md Theme E.
 */
export function useBrowserBounds(activeTabId: string | null, visible: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const occluders = useUiStore((s) => s.occluders);
  const effectiveVisible = visible && occluders === 0;

  // Mirrored into a ref so `sync` keeps a stable identity across renders
  // (safe to hand to `useBrowserTabsEffects`'s effect deps) while still
  // reading the CURRENT tab/visibility rather than whichever render created it.
  const latest = useRef({ activeTabId, effectiveVisible });
  latest.current = { activeTabId, effectiveVisible };

  /**
   * Re-sends `setVisible`/`setBounds` for whatever tab and occlusion state
   * are current right now.
   *
   * Exposed (not just run from this hook's own effect) because the effect
   * below fires once per `[activeTabId, effectiveVisible]` change and talks
   * to whatever `WebContentsView` exists in main AT THAT INSTANT — a silent
   * no-op if the tab was only just requested and its view hasn't been
   * created yet (background tabs are lazy, see `browser-service.ts`). That
   * left a newly-activated tab visible at Electron's default zero bounds
   * forever, since nothing re-ran this push once the view actually showed
   * up. `useBrowserTabsEffects` calls this again once `browser.create`
   * resolves, so the real bounds land the moment the view exists — and
   * because it re-reads `effectiveVisible` fresh, it also can't force a tab
   * visible over an open context menu the way an unconditional
   * `browser.activate()` alone would.
   */
  const sync = useCallback(() => {
    const { activeTabId, effectiveVisible } = latest.current;
    if (!activeTabId) return;
    bridge()?.browser.setVisible({ tabId: activeTabId, visible: effectiveVisible });
    if (!effectiveVisible) return;

    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    bridge()?.browser.setBounds({
      tabId: activeTabId,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }, []);

  useEffect(() => {
    if (!activeTabId) return undefined;
    sync();
    if (!effectiveVisible) return undefined;

    const el = ref.current;
    if (!el) return undefined;

    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [activeTabId, effectiveVisible, sync]);

  return { ref, sync };
}
