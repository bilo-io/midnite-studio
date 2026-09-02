import { useCallback, useRef, useState } from 'react';

export type ResizeAxis = 'x' | 'y';

/**
 * What a drag past the far end of the bounds is about to do on release.
 *
 * A splitter that simply stops dead at `min` gives a user who wants the pane
 * *gone* nowhere to go — they have to let go, find the pane's own toggle and
 * press that instead. Dragging past the bound is the gesture they already
 * tried, so it is the one that closes the pane; the same past `max` maximizes
 * it. Nothing commits until pointer-up, and the caller previews the outcome
 * off this value, so a drag that overshoots and comes back is a no-op.
 */
export type SnapIntent = 'collapse' | 'expand' | null;

export type UseResizableOptions = {
  /** Committed size, owned by the caller (the persisted store). */
  size: number;
  onSize: (size: number) => void;
  min: number;
  max: number;
  /** Restored on double-click. */
  initial: number;
  axis: ResizeAxis;
  /**
   * Which side of the handle the panel sits on.
   *
   * A splitter to the RIGHT of its panel grows the panel as the pointer moves
   * right (`start`); one to the LEFT — the commit-detail pane, docked to the
   * window's right edge — grows it as the pointer moves left (`end`). Getting
   * this wrong produces a panel that runs away from the cursor, so it is a
   * required prop rather than a guess from layout.
   */
  edge?: 'start' | 'end';
  /**
   * Close the pane, when given.
   *
   * Fired INSTEAD of `onSize` when a drag ends more than {@link SNAP_SLOP}
   * past `min` — so the size the pane had is left untouched in the store and
   * re-opening it restores the width the user last chose, not the minimum they
   * dragged through on the way out.
   */
  onCollapse?: () => void;
  /** Maximize the pane, when given. Fired instead of `onSize`, past `max`. */
  onExpand?: () => void;
};

export type Resizable = {
  /** The size to render: the live drag value while dragging, else `size`. */
  current: number;
  dragging: boolean;
  /**
   * What releasing right now would do — `null` for the ordinary case of
   * committing `current`.
   *
   * The caller renders the preview: a pane snapping to `collapse` draws at
   * zero, one snapping to `expand` draws at its maximized size. The handle
   * itself keys its own highlight off it.
   */
  snap: SnapIntent;
  handleProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-orientation': 'horizontal' | 'vertical';
  };
};

/** Keyboard nudge, and the coarse step Shift selects. */
const STEP = 8;
const STEP_COARSE = 64;

/**
 * How far past a bound the pointer must travel to arm a snap, in px.
 *
 * Deliberately more than a nudge: the pane has already stopped moving by the
 * time the pointer crosses the bound, so every pixel of this is travel with no
 * feedback but the cursor. Too small and a firm drag to the minimum closes the
 * pane by accident; too large and the gesture stops feeling connected to
 * anything. 64 is roughly a thumb's worth of overshoot.
 */
const SNAP_SLOP = 64;

export const clampSize = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Pointer-driven panel resizing.
 *
 * The live size is local state and only reaches the store on pointer-up. A
 * persisted store write per pointermove would be ~60 localStorage
 * serialisations a second, and every subscriber of the store — the whole app
 * column — would re-render on each one.
 */
export function useResizable({
  size,
  onSize,
  min,
  max,
  initial,
  axis,
  edge = 'start',
  onCollapse,
  onExpand,
}: UseResizableOptions): Resizable {
  const [drag, setDrag] = useState<number | null>(null);
  const [snap, setSnap] = useState<SnapIntent>(null);
  const origin = useRef({ pointer: 0, size: 0 });
  /*
    What a release would commit, held in a ref BESIDE the state that renders it.

    A `pointerup` can land in the same frame as the `pointermove` before it — a
    flick and release, or any synthetic drag — and a handler closed over last
    render's state would then commit the size the pointer had one move ago and
    miss a snap armed on the final one. The state is what renders; this is what
    decides. `active` is here for the same reason at the other end of the drag:
    a `pointermove` arriving before the `pointerdown`'s render commits would
    otherwise be dropped for looking like a move with no drag behind it.
  */
  const live = useRef<{ active: boolean; size: number; snap: SnapIntent }>({
    active: false,
    size: 0,
    snap: null,
  });

  const current = clampSize(drag ?? size, min, max);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Left button only: a right-click on a splitter should be inert, not the
      // start of a drag the user cannot see themselves having begun.
      if (event.button !== 0) return;
      event.preventDefault();
      // Capture so the drag survives the pointer leaving the 5px handle — which
      // it does immediately, because the handle moves and the pointer leads it.
      event.currentTarget.setPointerCapture(event.pointerId);
      // From `current`, not the raw stored `size`: with a bound that depends on
      // the window (the terminal's, the FAB panel's) a persisted value can sit
      // outside today's range, and a drag — or a click that commits without
      // moving — must start from where the pane is actually drawn.
      origin.current = { pointer: axis === 'x' ? event.clientX : event.clientY, size: current };
      live.current = { active: true, size: current, snap: null };
      setDrag(current);
      setSnap(null);
    },
    [axis, current],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!live.current.active) return;
      const pointer = axis === 'x' ? event.clientX : event.clientY;
      const delta = pointer - origin.current.pointer;
      /*
        The RAW position, kept beside the clamped one: `current` reads exactly
        `min` whether the pointer is one pixel past the bound or two hundred, so
        it cannot tell "stopped at the minimum" from "still dragging, and past
        it" — which is the whole distinction a snap turns on.
      */
      const raw = origin.current.size + (edge === 'end' ? -delta : delta);
      const next = clampSize(raw, min, max);
      const intent: SnapIntent =
        onCollapse && raw < min - SNAP_SLOP
          ? 'collapse'
          : onExpand && raw > max + SNAP_SLOP
            ? 'expand'
            : null;
      live.current.size = next;
      live.current.snap = intent;
      setDrag(next);
      setSnap(intent);
    },
    [axis, edge, max, min, onCollapse, onExpand],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!live.current.active) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const { size: settled, snap: intent } = live.current;
      live.current = { active: false, size: 0, snap: null };
      // A snap replaces the size commit rather than joining it: the store keeps
      // the size the pane had, so the toggle that brings it back brings back
      // the width the user chose instead of the bound they dragged through.
      if (intent === 'collapse') onCollapse?.();
      else if (intent === 'expand') onExpand?.();
      else onSize(settled);
      setDrag(null);
      setSnap(null);
    },
    [onCollapse, onExpand, onSize],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? STEP_COARSE : STEP;
      const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';

      // Off `current`, not the raw stored `size`: a persisted value from a
      // wider window can sit outside today's bounds, and nudging from it must
      // start where the pane is actually drawn.
      let next: number | null = null;
      if (event.key === grow) next = current + (edge === 'end' ? -step : step);
      else if (event.key === shrink) next = current - (edge === 'end' ? -step : step);
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      if (next === null) return;

      event.preventDefault();
      /*
        The keyboard's version of dragging past the bound: a nudge from a pane
        already AT its bound, asking to go further, does the snap instead — so
        neither collapse nor maximize is pointer-only. Home and End are excluded
        for free, because they land exactly ON a bound rather than past one.
      */
      if (next < min && current <= min && onCollapse) {
        onCollapse();
        return;
      }
      if (next > max && current >= max && onExpand) {
        onExpand();
        return;
      }
      onSize(clampSize(next, min, max));
    },
    [axis, current, edge, max, min, onCollapse, onExpand, onSize],
  );

  const onDoubleClick = useCallback(() => onSize(initial), [initial, onSize]);

  return {
    current,
    dragging: drag !== null,
    snap,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onKeyDown,
      'aria-valuenow': Math.round(current),
      'aria-valuemin': min,
      'aria-valuemax': max,
      // A splitter that moves along x separates columns, which WAI-ARIA calls a
      // VERTICAL separator. The naming inverts; this is not a typo.
      'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal',
    },
  };
}
