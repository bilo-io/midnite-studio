import { useEffect } from 'react';

import { useWindowFocused } from './use-window-focus';

/**
 * Publishes window focus as `html[data-window-focused]`, for the CSS that
 * freezes the rotating rainbow panels while the OS has focus elsewhere.
 *
 * There is no window-focus media query, so the one signal that distinguishes
 * "blurred behind another app" from "hidden" (see
 * [`use-window-focus.ts`](./use-window-focus.ts)) has to reach the stylesheet
 * as an attribute. This is that bridge, and it reads the same shared
 * listener pair every other focus consumer does rather than installing its
 * own.
 *
 * `enabled` scopes it to while a gated surface is actually mounted — nothing
 * needs the attribute set before there is an animation to gate. Two surfaces
 * gate on it now (the FAB's loop console and the landing page), and either
 * may be mounted without the other, so the hosts are counted: the attribute
 * is removed by the last one to leave, not the first, or opening the FAB from
 * the landing page and closing it again would strip the landing page's own
 * gate.
 */
let hosts = 0;

export function useWindowFocusGate(enabled: boolean): void {
  const focused = useWindowFocused();

  useEffect(() => {
    if (!enabled) return;
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts === 0) delete document.documentElement.dataset['windowFocused'];
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset['windowFocused'] = focused ? 'true' : 'false';
  }, [enabled, focused]);
}
