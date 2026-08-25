import { useCallback, useRef, useState } from 'react';

export type ResizeAxis = 'x' | 'y';

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
};

export type Resizable = {
  /** The size to render: the live drag value while dragging, else `size`. */
  current: number;
  dragging: boolean;
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
}: UseResizableOptions): Resizable {
  const [drag, setDrag] = useState<number | null>(null);
  const origin = useRef({ pointer: 0, size: 0 });

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
      origin.current = { pointer: axis === 'x' ? event.clientX : event.clientY, size };
      setDrag(size);
    },
    [axis, size],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (drag === null) return;
      const pointer = axis === 'x' ? event.clientX : event.clientY;
      const delta = pointer - origin.current.pointer;
      setDrag(clampSize(origin.current.size + (edge === 'end' ? -delta : delta), min, max));
    },
    [axis, drag, edge, max, min],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (drag === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      onSize(drag);
      setDrag(null);
    },
    [drag, onSize],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? STEP_COARSE : STEP;
      const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';

      let next: number | null = null;
      if (event.key === grow) next = size + (edge === 'end' ? -step : step);
      else if (event.key === shrink) next = size - (edge === 'end' ? -step : step);
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      if (next === null) return;

      event.preventDefault();
      onSize(clampSize(next, min, max));
    },
    [axis, edge, max, min, onSize, size],
  );

  const onDoubleClick = useCallback(() => onSize(initial), [initial, onSize]);

  return {
    current,
    dragging: drag !== null,
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
