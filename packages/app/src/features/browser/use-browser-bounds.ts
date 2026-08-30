import { useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';

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

  useEffect(() => {
    if (!activeTabId || !visible) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    const push = () => {
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
    };

    push();
    const observer = new ResizeObserver(push);
    observer.observe(el);
    window.addEventListener('resize', push);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', push);
    };
  }, [activeTabId, visible]);

  return ref;
}
