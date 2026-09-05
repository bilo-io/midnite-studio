import { useEffect, useRef, type RefObject } from 'react';

/**
 * `inert` hides a whole subtree from focus, and the attribute sits on the
 * *container* of that subtree — `@bilo-io/ui`'s `Collapse` marks its clipped
 * region, not the buttons inside it — so excluding only elements that carry the
 * attribute themselves would still Tab-wrap a trapped dialog through a closed
 * accordion's invisible controls. Hence both clauses.
 *
 * Both are pure selector matching, deliberately: the trap re-queries on every
 * Tab, so `getComputedStyle`-based visibility filtering would be per-element
 * style resolution per keypress in a fifty-row menu. Visibility and
 * `aria-hidden` therefore stay out (Phase 68 Decision 6).
 */
const NOT_INERT = ':not([inert]):not([inert] *)';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
]
  .map((selector) => `${selector}${NOT_INERT}`)
  .join(', ');

/**
 * What restoration will accept as a destination — `FOCUSABLE` plus explicitly
 * programmatic holders (`tabindex="-1"`), which `.focus()` works on even though
 * Tab cannot reach them. Every dialog container in the app is one of those.
 */
const RESTORABLE = `${FOCUSABLE}, [tabindex]${NOT_INERT}`;

/**
 * The mount-time capture, but only if it is still worth restoring to:
 * connected, and outside the surface that is opening.
 */
function usableOpener(
  container: HTMLElement | null,
  opener: HTMLElement | null | undefined,
): HTMLElement | null {
  if (!opener || !opener.isConnected) return null;
  if (container?.contains(opener)) return null;
  return opener;
}

/**
 * The element focus should return to when the surface closes, or `null` for
 * "nothing worth returning to".
 *
 * `<body>` is never captured: restoring to it is indistinguishable from doing
 * nothing, and dressing a no-op up as a restore hides that nothing was ever
 * captured (Phase 68 Decision 3).
 *
 * `opener` is the fallback for a surface that mounted BEFORE it activated —
 * see {@link useFocusTrap}. It is consulted in exactly one case, focus already
 * being inside the surface, because that is the signature of the lag: whatever
 * the surface's own `autoFocus` child grabbed in between says nothing about
 * where the user came from, and the element that does is a commit out of
 * reach of `document.activeElement` by then.
 */
function captureRestoreTarget(
  container: HTMLElement | null,
  opener?: HTMLElement | null,
): HTMLElement | null {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return null;
  if (focused === document.body) return null;
  // Already inside the surface that is opening — not somewhere to come back to.
  if (container?.contains(focused)) return usableOpener(container, opener);
  return focused;
}

/**
 * A detached trigger's ancestors are detached with it (removing a node clears
 * its `parentElement`), so this walk usually finds nothing — which is the
 * correct answer, and the point: leave focus where it is rather than forcing it
 * onto `<body>`.
 */
function nearestConnectedFocusable(target: HTMLElement): HTMLElement | null {
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (node.isConnected && node !== document.body && node.matches(RESTORABLE)) return node;
  }
  return null;
}

function restoreFocus(container: HTMLElement, target: HTMLElement | null): void {
  if (!target) return;

  // Don't fight a deliberate move. At cleanup time focus is either still inside
  // the closing surface or — the usual case, since the browser resets to
  // `<body>` when the focused node is removed — on `<body>`. Anything else means
  // something claimed focus while this surface was open: a second overlay, a
  // toast action, a re-opening pane. Stealing it back is worse than doing
  // nothing, and this clause is what makes the hook safe to switch on for every
  // consumer at once rather than one at a time.
  const holder = document.activeElement;
  if (holder && holder !== document.body && !container.contains(holder)) return;

  const destination = target.isConnected ? target : nearestConnectedFocusable(target);
  if (!destination) return;
  destination.focus({ preventScroll: true });
}

/**
 * Keep Tab inside `ref`'s subtree while `active`, give it focus the moment it
 * activates, and hand focus back to wherever it came from when it deactivates.
 *
 * Extracted verbatim from `popover.tsx`'s inline effect (Phase 18) rather
 * than rewritten, so `Popover`'s own behaviour — and the e2e coverage that
 * already exercises it (`footer-monitor.spec.ts`'s flyout keyboard
 * assertions) — does not change. A container with nothing focusable inside
 * holds focus on itself rather than letting Tab escape into the document
 * behind it, which is why the container needs `tabIndex={-1}` even when it
 * has focusable children.
 *
 * Restoration lives *here* rather than in a companion hook because the eight
 * overlays that dropped focus on the floor were broken precisely by not calling
 * an extra thing — every one of them was copied from `ConfirmDialog`, which did
 * not restore. The only fix that survives the next copy-paste is one that
 * arrives with the line the author already writes, which is why the signature
 * is unchanged (Phase 68 Theme A, Decision 1).
 *
 * That signature carries no explicit "restore to this" target and does not
 * need one: a surface whose `active` lags its own mount is handled by the
 * mount-time capture below rather than by the caller naming a node it does not
 * own. The browser pane's toggle lives in the status bar, three trees away —
 * the deleted bespoke version reached it with
 * `document.querySelector('[data-testid=…]')`, and there is no honest ref to
 * replace that with.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  const restoreTargetRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef(false);
  // `undefined` is the "not captured yet" sentinel, because `null` — nothing
  // worth returning to — is a real captured value. Written on the first render
  // only, and NOT through `useRef`'s initializer, which re-evaluates every
  // render.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);

  // Where focus was when this surface came into being.
  //
  // `active` is not always the moment the surface appears. A panel with an
  // entrance animation mounts first and flips `active` a frame later — the
  // browser pane is rendered by `useReveal` as `shown={false}` so the fade has
  // a painted frame to travel from, and only the next quiet frame turns it
  // true. By then the pane's own DOM exists and its `autoFocus` child (the new
  // tab page's search box) has taken focus, so the transition-time capture
  // below correctly finds focus already inside the surface and the toggle that
  // opened it is one commit out of reach. Reading it here, before this hook's
  // container is committed at all, is what keeps it.
  if (openerRef.current === undefined) openerRef.current = captureRestoreTarget(ref.current);

  // Captured during render, not in the effect, and only on the false→true
  // transition. A child's `autoFocus` is applied in React's commit phase, which
  // finishes before *any* effect — layout effects included — so by the time an
  // effect could look, `document.activeElement` is already inside the surface
  // and the element that held focus before it opened is unrecoverable. Reading
  // `document.activeElement` is a DOM read, not a mutation, so it is safe to do
  // while rendering. It is deliberately not `useRef`'s initializer either: that
  // re-evaluates on every render, and for a consumer whose `active` is a state
  // flag it would capture something from mount time.
  if (active !== wasActiveRef.current) {
    wasActiveRef.current = active;
    if (active) restoreTargetRef.current = captureRestoreTarget(ref.current, openerRef.current);
  }

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

    // `preventScroll` — see above.
    //
    // Only when nothing inside already has it: `autoFocus` on a child (the
    // Cancel button in a destructive `ConfirmDialog`, say) runs during React's
    // commit, which finishes before this effect does — so unconditionally
    // stealing focus onto the container here would override it every time,
    // landing Tab/Return on the dialog shell instead of the button the caller
    // deliberately asked to hold focus. Popover, the effect's original owner,
    // has no such child, so its own focus-on-open behaviour is unaffected.
    if (!container.contains(document.activeElement)) {
      container.focus({ preventScroll: true });
    }
    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // The captured target is deliberately *not* cleared: React's StrictMode
      // remounts effects in development, and clearing here would leave the real
      // close with nothing to restore to. A genuine re-activation recaptures
      // during render anyway.
      restoreFocus(container, restoreTargetRef.current);
    };
  }, [ref, active]);
}
