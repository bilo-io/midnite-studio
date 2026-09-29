import { useEffect, useRef } from 'react';

import { useUiStore } from '../store/ui-store';

/**
 * Dismissal layers, lowest first — in DISMISSAL order, which is not paint
 * order. The two agree in the middle and disagree at both ends.
 *
 * `inline` → `menu` → `popover` → `dialog` climbs with `tailwind.config.ts`'s
 * z scale (`z-menu` 80 · `z-popover` 85 · `z-dialog` 90), because for those the
 * surface painted on top is the surface Escape means. `toast` (`z-toast` 92)
 * and `tooltip` (`z-tooltip` 95) paint above all of them and mean least, so
 * they sit at the BOTTOM of this list rather than the top.
 *
 * `blocking` gets half of that inversion on its own: a passive toast never
 * takes the Escape a blocking confirm dialog wanted, which is the case both
 * `toast-host.tsx` and `tooltip.tsx` describe in their own comments. It cannot
 * get the other half, because `inline` surfaces are passive too — they are the
 * ones with no overlay to occlude anything with (the browser pane, a graph
 * selection). Ranked top of this list, as they were when Phase 62 first drew it
 * from the z scale, a tooltip left open by the pointer resting on the browser
 * toggle swallowed the Escape that should have closed the browser pane, and a
 * toast did the same to a graph selection. Ordering is what fixes that;
 * `blocking` cannot.
 */
const LAYER_ORDER = ['tooltip', 'toast', 'inline', 'menu', 'popover', 'dialog'] as const;

export type DismissLayer = (typeof LAYER_ORDER)[number];

export type DismissOptions = {
  /** Where this surface sits in the dismissal order. Defaults to `'dialog'`. */
  layer?: DismissLayer;
  /**
   * Whether this surface consumes Escape. Defaults to `true`; only `toast`
   * and `tooltip` pass `false` — see `use-dismiss.ts:5–25`'s ordering
   * comment for why (a tooltip left open by a pointer resting on the
   * browser toggle used to swallow the Escape that should have closed the
   * pane).
   */
  blocking?: boolean;
  /**
   * Whether this surface hides the native `WebContentsView` beneath it
   * (Phase 32 Theme E). Defaults to `blocking` — every existing call site is
   * unchanged by this option existing — but `blocking` and "is an occluder"
   * are genuinely two different axes: a tooltip or a toast is deliberately
   * NOT blocking (it must not win Escape against a dialog), but IS still
   * something painted over a loaded page, and a page has no idea it should
   * render underneath one. Making tooltips/toasts blocking again would fix
   * that paint order and re-break the Escape ordering this file's own
   * comment describes — this option is the fix that does neither.
   */
  occludes?: boolean;
};

type DismissEntry = {
  /**
   * Read at keypress time rather than fixed at registration, because a nested
   * surface's rank is its parent's when that is higher (`use-dismissable.ts`)
   * and its parent may only be known after it has registered.
   */
  rank: () => number;
  /**
   * Nesting depth inside a `useDismissable` menu tree; `0` for everything
   * else. Breaks rank ties ahead of `seq`: React runs a child's effects before
   * its parent's, so a submenu mounted in the same commit as its menu would
   * otherwise register *first* and lose Escape to the menu it lives in.
   */
  depth: () => number;
  blocking: boolean;
  /** Registration order, so equal ranks resolve to the one that opened last. */
  seq: number;
  dismiss: () => void;
};

const stack: DismissEntry[] = [];
let nextSeq = 0;
let listening = false;

/** Topmost = highest layer, then deepest nesting, then latest registration. */
function topmost(blocking: boolean): DismissEntry | null {
  let best: DismissEntry | null = null;
  let bestKey: readonly [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const entry of stack) {
    if (entry.blocking !== blocking) continue;
    const key = [entry.rank(), entry.depth(), entry.seq] as const;
    if (
      !best ||
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))
    ) {
      best = entry;
      bestKey = key;
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
 * **A registration is an occluder registration too, by default.** Most
 * overlays that consume Escape should also hide the native `WebContentsView`
 * painted over the top of them (`use-browser-bounds.ts` keys on
 * `occluders > 0`), so `occludes` defaults to `blocking` and the common case
 * is one call rather than a second piece of bookkeeping at each site. The two
 * axes split for `tooltip`/`toast` (Phase 32 Theme E): passive, so they
 * cannot win Escape from a dialog, but still painted over a loaded page and
 * so still an occluder — pass `occludes: true` explicitly alongside
 * `blocking: false` for exactly that pair.
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
  const occludes = options?.occludes ?? blocking;

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
    return registerDismiss({ layer, blocking, occludes, dismiss: () => onDismissRef.current() });
  }, [active, blocking, layer, occludes]);
}

/**
 * The imperative half of `useDismiss`: push one entry onto the shared stack
 * and get back the function that pops it.
 *
 * Exported for `use-dismissable.ts`, which cannot know a surface's layer at
 * render time — a menu opened from inside a popover inherits the popover's
 * layer, and which popover that is only becomes answerable once the menu has
 * mounted and can ask what its trigger sits inside. Everything else should
 * use the hook.
 */
export function registerDismiss(options: {
  /** A function when the layer can change after registering; see `DismissEntry.rank`. */
  layer: DismissLayer | (() => DismissLayer);
  blocking: boolean;
  occludes: boolean;
  dismiss: () => void;
  depth?: () => number;
}): () => void {
  const { layer } = options;
  const entry: DismissEntry = {
    rank: typeof layer === 'function' ? () => layerRank(layer()) : () => layerRank(layer),
    depth: options.depth ?? (() => 0),
    blocking: options.blocking,
    seq: (nextSeq += 1),
    dismiss: options.dismiss,
  };
  stack.push(entry);
  if (options.occludes) useUiStore.getState().incrementOccluders();
  syncListener();

  return () => {
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    if (options.occludes) useUiStore.getState().decrementOccluders();
    syncListener();
  };
}

/** A layer's position in the dismissal order — higher wins Escape. */
export function layerRank(layer: DismissLayer): number {
  return LAYER_ORDER.indexOf(layer);
}
