import { useEffect, type CSSProperties, type RefObject } from 'react';
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
 * The content rect = the view stack minus the docked terminal. A maximized
 * terminal leaves nothing, so fall back to the whole stack (the modal then
 * floats over the terminal, which sits below the dialog layer).
 */
export function computeContentRect(
  stack: Rect,
  terminal: Rect | null,
  dock: 'bottom' | 'right',
): Rect {
  if (!terminal || terminal.width <= 0 || terminal.height <= 0) return stack;
  if (dock === 'right') {
    const width = Math.min(stack.width, terminal.left - stack.left);
    return width > 0 ? { ...stack, width } : stack;
  }
  const height = Math.min(stack.height, terminal.top - stack.top);
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

/** What a content-scoped dialog reads: the overlay padding and the panel's height cap. */
export function useContentOverlay(align: 'center' | 'top' = 'center'): {
  overlayStyle: CSSProperties | undefined;
  panelMaxHeight: number | undefined;
} {
  const rect = useContentBoundsStore((s) => s.rect);
  const viewport = useContentBoundsStore((s) => s.viewport);
  return {
    overlayStyle: contentOverlayStyle(rect, viewport, align),
    panelMaxHeight: rect ? Math.max(0, rect.height - MARGIN * 2) : undefined,
  };
}

const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/**
 * Keeps the store in step with layout. Observes the view stack and the terminal
 * frame (which animates between sizes, so the observer fires per frame) and
 * re-measures on window resize. `deps` are the layout inputs that attach or
 * move those elements (terminal mounted, dock, maximized).
 */
export function useContentBoundsSync(
  stackRef: RefObject<HTMLElement | null>,
  dock: 'bottom' | 'right',
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const frame = stack.querySelector<HTMLElement>(':scope > [data-terminal-frame]');
    const measure = () => {
      const rect = computeContentRect(
        toRect(stack.getBoundingClientRect()),
        frame ? toRect(frame.getBoundingClientRect()) : null,
        dock,
      );
      useContentBoundsStore
        .getState()
        .set(rect, { width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(stack);
      if (frame) observer.observe(frame);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackRef, dock, ...deps]);
}
