import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { create } from 'zustand';

/**
 * The bounds of the main content area: the box a view paints into, i.e. the
 * view column between the nav rail, the right-hand panels, the terminal dock and
 * the status bar. In window coordinates (what `getBoundingClientRect` returns).
 *
 * Content-scoped modals (the confirm/prompt dialogs, `Modal`) centre in this
 * rect instead of the window, so an open terminal never covers them. The
 * backdrop still spans the whole window — see `contentOverlayStyle`.
 */
export type Rect = { left: number; top: number; width: number; height: number };

export type ContentBoundsState = {
  rect: Rect | null;
  viewport: { width: number; height: number };
  set: (rect: Rect | null, viewport: { width: number; height: number }) => void;
};

export const useContentBoundsStore = create<ContentBoundsState>((set) => ({
  rect: null,
  viewport: { width: 0, height: 0 },
  set: (rect, viewport) => set({ rect, viewport }),
}));

/**
 * The content rect = the view stack minus the docked terminal's FINAL size
 * (`terminalSize`, the layout target rather than the animating frame: reading
 * the frame per tween frame both churned the store and disturbed the reveal).
 * Null (closed, detached or maximized, where the terminal covers everything)
 * means the whole stack; the dialog layer sits above the terminal either way.
 */
export function computeContentRect(
  stack: Rect,
  terminalSize: number | null,
  dock: 'bottom' | 'right',
): Rect {
  if (!terminalSize || terminalSize <= 0) return stack;
  if (dock === 'right') {
    const width = stack.width - terminalSize;
    return width > 0 ? { ...stack, width } : stack;
  }
  const height = stack.height - terminalSize;
  return height > 0 ? { ...stack, height } : stack;
}

const MARGIN = 24;

/** Padding that centres a `flex items-center justify-center` overlay on the rect. */
export function contentOverlayStyle(
  rect: Rect | null,
  viewport: { width: number; height: number },
  align: 'center' | 'top' = 'center',
): CSSProperties | undefined {
  if (!rect) return undefined;
  const top = rect.top + (align === 'top' ? rect.height * 0.15 : MARGIN);
  return {
    paddingLeft: rect.left + MARGIN,
    paddingTop: top,
    paddingRight: Math.max(0, viewport.width - (rect.left + rect.width)) + MARGIN,
    paddingBottom: Math.max(0, viewport.height - (rect.top + rect.height)) + MARGIN,
  };
}

const noopSubscribe = () => () => {};

/**
 * What a content-scoped dialog reads: the overlay padding and the panel's
 * height cap. `active` is false for a closed or window-scoped `Modal`: it then
 * does not subscribe, so a bounds change re-renders only dialogs that are
 * actually on screen.
 */
export function useContentOverlay(
  align: 'center' | 'top' = 'center',
  active = true,
): {
  overlayStyle: CSSProperties | undefined;
  panelMaxHeight: number | undefined;
} {
  const state = useSyncExternalStore(
    active ? useContentBoundsStore.subscribe : noopSubscribe,
    useContentBoundsStore.getState,
  );
  const { rect, viewport } = state;
  return {
    overlayStyle: contentOverlayStyle(rect, viewport, align),
    panelMaxHeight: rect ? Math.max(0, rect.height - MARGIN * 2) : undefined,
  };
}

const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/**
 * Keeps the store in step with layout: observes the view stack (ResizeObserver,
 * plus window resize) and re-derives the rect when the terminal's size, dock or
 * presence changes. `terminalSize` is null unless a terminal is docked and not
 * maximized.
 *
 * The DOM is read ONLY from the observer callback (and window resize), where
 * layout is already clean. A terminal-size change recomputes from the cached
 * stack rect without touching the DOM: a `getBoundingClientRect` in an effect
 * right after the terminal mounts forces a layout between the reveal's "from"
 * and "to" styles and changes how the tween plays.
 */
export function useContentBoundsSync(
  stackRef: RefObject<HTMLElement | null>,
  dock: 'bottom' | 'right',
  terminalSize: number | null,
): void {
  const stackRect = useRef<Rect | null>(null);
  const latest = useRef({ dock, terminalSize });
  latest.current = { dock, terminalSize };

  const publish = () => {
    if (!stackRect.current) return;
    const { dock: d, terminalSize: size } = latest.current;
    useContentBoundsStore
      .getState()
      .set(computeContentRect(stackRect.current, size, d), {
        width: window.innerWidth,
        height: window.innerHeight,
      });
  };

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const measure = () => {
      stackRect.current = toRect(stack.getBoundingClientRect());
      publish();
    };
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      // Fires once on `observe`, which is the initial measurement.
      observer = new ResizeObserver(measure);
      observer.observe(stack);
    } else {
      measure();
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [stackRef]);

  // Deferred a frame: a store write from this effect re-renders the mounted
  // dialogs synchronously inside the terminal's own commit, which shifts when
  // the reveal's first frame paints.
  useEffect(() => {
    const raf = requestAnimationFrame(publish);
    return () => cancelAnimationFrame(raf);
  }, [dock, terminalSize]);
}
