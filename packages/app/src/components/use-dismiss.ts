import { useEffect, useRef } from 'react';

import { useUiStore } from '../store/ui-store';

/**
 * Dismissal layers, lowest first. Named after `tailwind.config.ts`'s z-index
 * scale (`z-menu` 80 · `z-popover` 85 · `z-dialog` 90 · `z-toast` 92 ·
 * `z-tooltip` 95) because paint order is what a reader will reach for — but
 * `blocking` is what actually decides delivery, and for `toast`/`tooltip` the
 * two deliberately disagree. See `DismissOptions.blocking`.
 */
const LAYER_ORDER = ['inline', 'menu', 'popover', 'dialog', 'toast', 'tooltip'] as const;

export type DismissLayer = (typeof LAYER_ORDER)[number];

export type DismissOptions = {
  /** Where this surface sits in the dismissal order. Defaults to `'dialog'`. */
  layer?: DismissLayer;
  /**
   * Whether this surface consumes Escape and hides the native browser view
   * beneath it. Defaults to `true`; only `toast` and `tooltip` pass `false`.
   */
  blocking?: boolean;
};

type DismissEntry = {
  rank: number;
  blocking: boolean;
  /** Registration order, so equal ranks resolve to the one that opened last. */
  seq: number;
  dismiss: () => void;
};

const stack: DismissEntry[] = [];
let nextSeq = 0;
let listening = false;

/** Topmost = highest layer, then latest registration. */
function topmost(blocking: boolean): DismissEntry | null {
  let best: DismissEntry | null = null;
  for (const entry of stack) {
    if (entry.blocking !== blocking) continue;
    if (!best || entry.rank > best.rank || (entry.rank === best.rank && entry.seq > best.seq)) {
      best = entry;
    }
  }
  return best;
}

/**
 * The delivery rule, stated once and implemented once: Escape goes to the
 * topmost **blocking** entry; failing that, to the topmost **passive** one; and
 * if the stack is empty the event is left entirely alone.
 */
function onWindowKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const entry = topmost(true) ?? topmost(false);
  if (!entry) return;
  event.preventDefault();
  // `stopImmediatePropagation`, not `stopPropagation`: every handler this
  // replaces is also on `window`, and `stopPropagation` does not stop *sibling*
  // listeners on the same target. This is the migration safety net — an
  // un-migrated handler cannot also fire, so call sites can move over one at a
  // time without an intermediate state where Escape dismisses two things. The
  // one gap is a listener already on `window` before the stack became non-empty
  // — DOM order is registration order and nothing can reach backwards — which
  // in practice means `toast-host`'s app-lifetime handler and nothing else,
  // since every other un-migrated listener goes up with the overlay that owns it.
  event.stopImmediatePropagation();
  entry.dismiss();
}

/**
 * One listener for the whole app, installed when the stack goes from empty to
 * non-empty and removed when it empties. Bubble phase, matching the handlers it
 * replaces: a capture-phase listener on `window` would run before the focused
 * element's own handler and `stopImmediatePropagation` would then eat the
 * Escape a rename input or the find bar had every right to.
 */
function syncListener(): void {
  if (stack.length > 0 && !listening) {
    window.addEventListener('keydown', onWindowKeyDown);
    listening = true;
  } else if (stack.length === 0 && listening) {
    window.removeEventListener('keydown', onWindowKeyDown);
    listening = false;
  }
}

/**
 * Register a dismissable surface for as long as `active`, and be told when
 * Escape is meant for *it* — exactly one surface per keypress, the topmost.
 *
 * Ref-free on purpose: three of the handlers this replaces (`graph-view`,
 * `board-view`, `browser-pane`) have no overlay element at all, so a
 * `useFocusTrap`-style ref parameter would exclude precisely the cases that
 * need it. The two hooks stay separate for the same reason they answer
 * different questions: focus trapping is answerable from a single ref, and "am
 * I topmost" is not.
 *
 * **A blocking registration is also an occluder registration.** Every overlay
 * that consumes Escape is an overlay that should hide the native
 * `WebContentsView` painted over the top of it (`use-browser-bounds.ts` keys on
 * `occluders > 0`), so the two duties are one call rather than a second piece of
 * bookkeeping at each site.
 *
 * **Not for a handler on a focused input.** Escape on a focused rename input,
 * find bar or comment composer belongs to that input: it handles the key on the
 * element and stops it there. `useDismiss` is for overlays whose dismissal is
 * *not* a property of what has focus. Migrating an input's handler onto this
 * hook would make a rename cancellable from anywhere in the app.
 *
 * @param active   register while true, unregister on false or unmount
 * @param onDismiss called with no arguments when Escape is delivered here; may
 *   be an inline arrow (it is read through a ref, so it never re-registers) and
 *   may do more than one thing — a menu that closes its submenu first, say
 * @param options  `layer` and `blocking`; see `DismissOptions`
 */
export function useDismiss(
  active: boolean,
  onDismiss: () => void,
  options?: DismissOptions,
): void {
  const layer = options?.layer ?? 'dialog';
  const blocking = options?.blocking ?? true;

  // Read through a ref so an inline arrow does not re-register the entry on
  // every render. `useFocusTrap`'s deps work because both of its arguments are
  // stable; a callback is not, and a stack that re-orders itself on every
  // keystroke would silently break the topmost rule.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;

    const entry: DismissEntry = {
      rank: LAYER_ORDER.indexOf(layer),
      blocking,
      seq: (nextSeq += 1),
      dismiss: () => onDismissRef.current(),
    };
    stack.push(entry);
    if (blocking) useUiStore.getState().incrementOccluders();
    syncListener();

    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      if (blocking) useUiStore.getState().decrementOccluders();
      syncListener();
    };
  }, [active, blocking, layer]);
}
