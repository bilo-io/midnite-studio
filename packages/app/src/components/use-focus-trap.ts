import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab inside `ref`'s subtree while `active`, and give it focus the
 * moment it activates.
 *
 * Extracted verbatim from `popover.tsx`'s inline effect (Phase 18) rather
 * than rewritten, so `Popover`'s own behaviour — and the e2e coverage that
 * already exercises it (`footer-monitor.spec.ts`'s flyout keyboard
 * assertions) — does not change. A container with nothing focusable inside
 * holds focus on itself rather than letting Tab escape into the document
 * behind it, which is why the container needs `tabIndex={-1}` even when it
 * has focusable children.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        // `preventScroll` — focusing an element the browser considers out of view
    // scrolls an ancestor to reveal it, and a surface that owns a scroll-to-
    // dismiss listener reads its own reveal scroll as the user scrolling away.
    // A focus trap has no business moving the viewport regardless.
    container.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // `preventScroll` — focusing an element the browser considers out of view
    // scrolls an ancestor to reveal it, and a surface that owns a scroll-to-
    // dismiss listener reads its own reveal scroll as the user scrolling away.
    // A focus trap has no business moving the viewport regardless.
    container.focus({ preventScroll: true });
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);
}
