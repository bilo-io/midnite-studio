import { useCallback, useEffect, useRef } from 'react';

import type { BrowserBounds } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * `getBoundingClientRect()` → the `BrowserBounds` payload `setBounds` sends —
 * a pure function so the rounding and the zero-size guard are each testable
 * without a DOM (Theme E).
 *
 * Rounds rather than truncates: a `199.6px`-wide box is `200`, not `199` —
 * Electron's `setBounds` takes integers, and floor-rounding down would leave
 * a sub-pixel sliver of the pane showing past the view's right/bottom edge
 * on every fractional-DPI display.
 *
 * `null` for a zero-size rect (a pane mid-tween can measure `0×0` for a
 * frame) — Electron parks a `0×0` view at the origin rather than leaving it
 * wherever it last was, which is the exact bug `4b1a51f fix(browser): stop
 * the native browser view from showing at stale/zero bounds` fixed once; the
 * fix here is the same one, at the one other place a bad rect could reach
 * `setBounds`.
 */
export function boundsFromRect(rect: DOMRect): BrowserBounds | null {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width === 0 || height === 0) return null;
  return { x: Math.round(rect.x), y: Math.round(rect.y), width, height };
}

/**
 * Keeps the active tab's `WebContentsView` sized to the pane's web area.
 *
 * Tracks resize (`ResizeObserver` + a window `resize` fallback for
 * display-scale changes `ResizeObserver` alone can miss) so the view does
 * not desync from the pane as it grows and shrinks. The occluder registry
 * itself (`useUiStore`'s `occluders`, incremented by every blocking
 * `useDismiss` registration) lives in `use-dismiss.ts`/`use-occluder.ts`,
 * not here — this hook only reads the counter (`effectiveVisible` below) to
 * decide whether the native view should currently be showing at all.
 * `boundsFromRect` above is this hook's own contribution to Theme E: the
 * arithmetic that turns a measured rect into what `setBounds` actually
 * sends, extracted so it can be unit-tested without mounting a component.
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
    const bounds = boundsFromRect(el.getBoundingClientRect());
    // A mid-tween 0×0 measurement is skipped, not sent — see `boundsFromRect`.
    if (!bounds) return;
    bridge()?.browser.setBounds({ tabId: activeTabId, bounds });
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
