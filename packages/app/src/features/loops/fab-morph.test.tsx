import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureFabMorphOrigin, useFabMorphRef } from './fab-morph';

type Rect = { left: number; top: number; width: number; height: number };

function stubRect(el: HTMLElement, rect: Rect): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * `shown` toggles the button in and out — the shape that matters, since the
 * bug this hook fixed was a `useLayoutEffect` tied to `Outer`'s own mount
 * (once for its whole life) rather than the button's, which stays mounted
 * across every toggle in `app.tsx`/`assistant-menu.tsx` while the button
 * itself mounts and unmounts underneath it.
 */
function Outer({ shown, rect }: { shown: boolean; rect: Rect }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const morphRef = useFabMorphRef(ref);
  if (!shown) return null;
  return (
    <button
      ref={(el) => {
        if (el) stubRect(el, rect);
        return morphRef(el);
      }}
    />
  );
}

describe('useFabMorphRef', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when no counterpart just closed', () => {
    const { container } = render(
      <Outer shown rect={{ left: 100, top: 100, width: 16, height: 16 }} />,
    );
    const button = container.querySelector('button')!;
    expect(button.style.transform).toBe('');
    expect(button.style.transition).toBe('');
  });

  /**
   * The FLIP dance: invert to where the origin used to be (synchronously, so
   * there is a frame to animate away from), then release it under a
   * transition once the browser has had a chance to paint that frame.
   */
  it('inverts to the captured origin, then releases the transform under a transition', async () => {
    const from = document.createElement('div');
    stubRect(from, { left: 900, top: 20, width: 40, height: 40 });
    captureFabMorphOrigin(from);

    const { container } = render(
      <Outer shown rect={{ left: 100, top: 100, width: 16, height: 16 }} />,
    );
    const button = container.querySelector('button')!;

    // Center-to-center delta: (920, 40) minus (108, 108).
    expect(button.style.transition).toBe('none');
    expect(button.style.transform).toBe('translate(812px, -68px) scale(2.5, 2.5)');

    await nextFrame();
    expect(button.style.transform).toBe('');
    expect(button.style.transition).toContain('transform');
  });

  it('moves focus to the button it just took over from', () => {
    const from = document.createElement('div');
    document.body.appendChild(from);
    stubRect(from, { left: 900, top: 20, width: 40, height: 40 });
    captureFabMorphOrigin(from);

    const { container } = render(
      <Outer shown rect={{ left: 100, top: 100, width: 16, height: 16 }} />,
    );
    expect(document.activeElement).toBe(container.querySelector('button'));
    from.remove();
  });

  it('consumes the origin once — a second mount with none left just appears', () => {
    const from = document.createElement('div');
    stubRect(from, { left: 900, top: 20, width: 40, height: 40 });
    captureFabMorphOrigin(from);
    render(<Outer shown rect={{ left: 100, top: 100, width: 16, height: 16 }} />);

    const { container } = render(
      <Outer shown rect={{ left: 200, top: 200, width: 16, height: 16 }} />,
    );
    const button = container.querySelector('button')!;
    expect(button.style.transform).toBe('');
  });

  /**
   * The regression this hook exists to fix: the button mounts and unmounts
   * repeatedly under a container that stays mounted for the app's whole
   * life (`Shell`, `AssistantMenu`). A `useLayoutEffect` keyed to that
   * OUTER component's own mount would only ever see the first of these —
   * every later toggle has to re-run the dance too.
   */
  it('re-runs the FLIP entrance on every remount, not just the first', async () => {
    const rectA = { left: 100, top: 100, width: 16, height: 16 };
    const rectB = { left: 400, top: 40, width: 40, height: 40 };
    const { container, rerender } = render(<Outer shown={false} rect={rectA} />);
    expect(container.querySelector('button')).toBeNull();

    const originA = document.createElement('div');
    stubRect(originA, { left: 900, top: 20, width: 40, height: 40 });
    captureFabMorphOrigin(originA);
    rerender(<Outer shown rect={rectA} />);
    expect(container.querySelector('button')!.style.transform).not.toBe('');
    await nextFrame();

    rerender(<Outer shown={false} rect={rectA} />);
    expect(container.querySelector('button')).toBeNull();

    const originB = document.createElement('div');
    stubRect(originB, { left: 10, top: 10, width: 16, height: 16 });
    captureFabMorphOrigin(originB);
    rerender(<Outer shown rect={rectB} />);
    const second = container.querySelector('button')!;
    expect(second.style.transform).not.toBe('');
    expect(second.style.transition).toBe('none');
  });
});
