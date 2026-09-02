import { useEffect } from 'react';

/**
 * Publishes window focus as `html[data-window-focused]`, for the CSS that
 * freezes the rotating rainbow panels while the OS has focus elsewhere.
 *
 * There is no window-focus media query, so the one signal that distinguishes
 * "blurred behind another app" from "hidden" (see
 * [`use-window-focus.ts`](./use-window-focus.ts), which answers the same
 * question for React state) has to reach the stylesheet as an attribute.
 * This is that bridge.
 *
 * **Imperative on purpose — it deliberately does not use
 * `useWindowFocused()`.** That hook is a `useSyncExternalStore` subscription,
 * so reading it here would re-render every host on every focus and blur:
 * `FabPanel` is permanently mounted (its whole loop-tab and terminal subtree
 * with it) and `LandingView` rebuilds its slide list. The gated animations
 * are pure CSS; the render would buy nothing at all. So this owns its own
 * listener pair and writes the attribute directly, which is what the
 * FAB-local version it replaced did before two surfaces needed it.
 *
 * `enabled` scopes it to while a gated surface is actually mounted — nothing
 * needs the attribute set before there is an animation to gate. Two surfaces
 * gate on it now and either may be mounted without the other, so the hosts
 * are counted: the listeners are installed by the first and the attribute
 * removed by the last, not by the first to leave, or opening the FAB from
 * the landing page and closing it again would strip the landing page's gate.
 */
let hosts = 0;

function write(focused: boolean): void {
  document.documentElement.dataset['windowFocused'] = focused ? 'true' : 'false';
}

const onFocus = (): void => write(true);
const onBlur = (): void => write(false);

export function useWindowFocusGate(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    hosts += 1;
    if (hosts === 1) {
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
    }
    // Every host writes on mount, not only the first: `document.hasFocus()`
    // may have changed since the listeners went on, and a host mounting into
    // an already-blurred window must not inherit a stale `true`.
    write(document.hasFocus());

    return () => {
      hosts -= 1;
      if (hosts === 0) {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
        delete document.documentElement.dataset['windowFocused'];
      }
    };
  }, [enabled]);
}
