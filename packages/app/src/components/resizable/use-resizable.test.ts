import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { clampSize, useResizable, type ResizeAxis } from './use-resizable';

/** A pointer event carrying only what the hook reads. */
const pointer = (x: number, y = 0) =>
  ({
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
  }) as unknown as React.PointerEvent<HTMLElement>;

const key = (k: string, shiftKey = false) =>
  ({ key: k, shiftKey, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent<HTMLElement>;

const setup = (overrides: Partial<Parameters<typeof useResizable>[0]> = {}) => {
  const onSize = vi.fn();
  const hook = renderHook(() =>
    useResizable({
      size: 256,
      onSize,
      min: 180,
      max: 560,
      initial: 256,
      axis: 'x' as ResizeAxis,
      ...overrides,
    }),
  );
  return { hook, onSize };
};

describe('clampSize', () => {
  it('holds the value inside the bounds', () => {
    expect(clampSize(100, 180, 560)).toBe(180);
    expect(clampSize(900, 180, 560)).toBe(560);
    expect(clampSize(300, 180, 560)).toBe(300);
  });

  it('survives inverted bounds rather than returning a value below min', () => {
    // A max that has fallen below min (a pane in a window narrower than its own
    // minimum) must still produce min, not a silently negative size.
    expect(clampSize(300, 400, 100)).toBe(400);
  });
});

describe('useResizable', () => {
  it('tracks the pointer during a drag and commits once on release', () => {
    const { hook, onSize } = setup();

    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(40)));

    // Live size updates, but the store is untouched — a write per pointermove
    // would be ~60 localStorage serialisations a second.
    expect(hook.result.current.current).toBe(296);
    expect(hook.result.current.dragging).toBe(true);
    expect(onSize).not.toHaveBeenCalled();

    act(() => hook.result.current.handleProps.onPointerUp(pointer(40)));
    expect(onSize).toHaveBeenCalledExactlyOnceWith(296);
    expect(hook.result.current.dragging).toBe(false);
  });

  it('clamps a drag that runs past the bounds', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(9999)));
    expect(hook.result.current.current).toBe(560);
  });

  it('inverts the delta for a pane docked to the right edge', () => {
    // The commit-detail pane's splitter is to its LEFT, so moving the pointer
    // left must GROW it. Getting this backwards makes the panel flee the cursor.
    const { hook } = setup({ edge: 'end' });
    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-40)));
    expect(hook.result.current.current).toBe(296);
  });

  it('ignores a non-primary button', () => {
    const { hook } = setup();
    const right = { ...pointer(0), button: 2 } as unknown as React.PointerEvent<HTMLElement>;
    act(() => hook.result.current.handleProps.onPointerDown(right));
    expect(hook.result.current.dragging).toBe(false);
  });

  it('nudges by keyboard, coarsely with shift', () => {
    const { hook, onSize } = setup();
    act(() => hook.result.current.handleProps.onKeyDown(key('ArrowRight')));
    expect(onSize).toHaveBeenLastCalledWith(264);

    act(() => hook.result.current.handleProps.onKeyDown(key('ArrowLeft', true)));
    expect(onSize).toHaveBeenLastCalledWith(192);

    act(() => hook.result.current.handleProps.onKeyDown(key('Home')));
    expect(onSize).toHaveBeenLastCalledWith(180);
    act(() => hook.result.current.handleProps.onKeyDown(key('End')));
    expect(onSize).toHaveBeenLastCalledWith(560);
  });

  it('commits the last pointer position even when the release lands in the same frame', () => {
    // All three events inside ONE act(): React batches them, so nothing
    // re-renders in between and a handler reading render state would commit the
    // size the drag STARTED at and miss a snap armed on the final move. Real
    // pointers do this too — a flick and release inside one frame.
    const onCollapse = vi.fn();
    const { hook, onSize } = setup({ onCollapse });

    act(() => {
      hook.result.current.handleProps.onPointerDown(pointer(0));
      hook.result.current.handleProps.onPointerMove(pointer(40));
      hook.result.current.handleProps.onPointerUp(pointer(40));
    });
    expect(onSize).toHaveBeenCalledExactlyOnceWith(296);
    expect(onCollapse).not.toHaveBeenCalled();

    const flick = setup({ onCollapse });
    act(() => {
      flick.hook.result.current.handleProps.onPointerDown(pointer(0));
      flick.hook.result.current.handleProps.onPointerMove(pointer(-400));
      flick.hook.result.current.handleProps.onPointerUp(pointer(-400));
    });
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(flick.onSize).not.toHaveBeenCalled();
  });

  it('arms a collapse once a drag runs far enough past the minimum, and fires it on release', () => {
    const onCollapse = vi.fn();
    const { hook, onSize } = setup({ onCollapse });

    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    // At the minimum exactly: clamped, but nothing armed — a firm drag to the
    // bound must not close the pane.
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-76)));
    expect(hook.result.current.current).toBe(180);
    expect(hook.result.current.snap).toBeNull();

    // Past it by more than the slop.
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-200)));
    expect(hook.result.current.snap).toBe('collapse');
    expect(hook.result.current.current).toBe(180);

    act(() => hook.result.current.handleProps.onPointerUp(pointer(-200)));
    expect(onCollapse).toHaveBeenCalledOnce();
    // The size is deliberately NOT committed: re-opening the pane restores the
    // width the user chose, not the minimum they dragged through on the way out.
    expect(onSize).not.toHaveBeenCalled();
  });

  it('disarms a snap the drag comes back from', () => {
    const onCollapse = vi.fn();
    const { hook, onSize } = setup({ onCollapse });

    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-300)));
    expect(hook.result.current.snap).toBe('collapse');
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-56)));
    expect(hook.result.current.snap).toBeNull();

    act(() => hook.result.current.handleProps.onPointerUp(pointer(-56)));
    expect(onCollapse).not.toHaveBeenCalled();
    expect(onSize).toHaveBeenCalledExactlyOnceWith(200);
  });

  it('arms an expand past the maximum, and only when the caller offers one', () => {
    const onExpand = vi.fn();
    const { hook, onSize } = setup({ onExpand });

    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(9999)));
    expect(hook.result.current.snap).toBe('expand');
    act(() => hook.result.current.handleProps.onPointerUp(pointer(9999)));
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onSize).not.toHaveBeenCalled();

    // Without the callback the same drag is the old behaviour — clamped, and
    // committed at the bound.
    const plain = setup();
    act(() => plain.hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => plain.hook.result.current.handleProps.onPointerMove(pointer(9999)));
    expect(plain.hook.result.current.snap).toBeNull();
    act(() => plain.hook.result.current.handleProps.onPointerUp(pointer(9999)));
    expect(plain.onSize).toHaveBeenCalledExactlyOnceWith(560);
  });

  it('reads the snap off the pointer, not the clamped size, for an inverted edge', () => {
    // `edge: 'end'` inverts the delta, so the terminal's splitter collapses the
    // panel on a drag DOWN and maximizes it on a drag UP. Getting the sign
    // wrong here would close the panel at exactly the moment it should fill.
    const onCollapse = vi.fn();
    const onExpand = vi.fn();
    const { hook } = setup({ edge: 'end', onCollapse, onExpand });

    act(() => hook.result.current.handleProps.onPointerDown(pointer(0)));
    act(() => hook.result.current.handleProps.onPointerMove(pointer(400)));
    expect(hook.result.current.snap).toBe('collapse');
    act(() => hook.result.current.handleProps.onPointerMove(pointer(-400)));
    expect(hook.result.current.snap).toBe('expand');
  });

  it('snaps from the keyboard when the pane is already at the bound', () => {
    const onCollapse = vi.fn();
    const onExpand = vi.fn();

    const atMin = setup({ size: 180, onCollapse, onExpand });
    act(() => atMin.hook.result.current.handleProps.onKeyDown(key('ArrowLeft')));
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(atMin.onSize).not.toHaveBeenCalled();

    // Home means "go to the minimum", not "go past it" — it never collapses.
    act(() => atMin.hook.result.current.handleProps.onKeyDown(key('Home')));
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(atMin.onSize).toHaveBeenCalledExactlyOnceWith(180);

    const atMax = setup({ size: 560, onCollapse, onExpand });
    act(() => atMax.hook.result.current.handleProps.onKeyDown(key('ArrowRight')));
    expect(onExpand).toHaveBeenCalledOnce();
    expect(atMax.onSize).not.toHaveBeenCalled();
  });

  it('restores the default on double-click', () => {
    const { hook, onSize } = setup({ size: 400 });
    act(() => hook.result.current.handleProps.onDoubleClick());
    expect(onSize).toHaveBeenCalledExactlyOnceWith(256);
  });

  it('reports a vertical separator for a horizontal drag', () => {
    // WAI-ARIA names a separator by the line it draws, not the axis it moves
    // along: a splitter between columns is `vertical`.
    const { hook } = setup();
    expect(hook.result.current.handleProps['aria-orientation']).toBe('vertical');
    const { hook: rows } = setup({ axis: 'y' });
    expect(rows.result.current.handleProps['aria-orientation']).toBe('horizontal');
  });
});
