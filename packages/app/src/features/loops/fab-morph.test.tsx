import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureFabMorphOrigin, useFabMorphEntrance } from './fab-morph';

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

function Target({ rect }: { rect: Rect }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useFabMorphEntrance(ref);
  return (
    <button
      ref={(el) => {
        ref.current = el;
        if (el) stubRect(el, rect);
      }}
    />
  );
}

describe('useFabMorphEntrance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when no counterpart just closed', () => {
    const { container } = render(<Target rect={{ left: 100, top: 100, width: 16, height: 16 }} />);
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
      <Target rect={{ left: 100, top: 100, width: 16, height: 16 }} />,
    );
    const button = container.querySelector('button')!;

    // Center-to-center delta: (920, 40) minus (108, 108).
    expect(button.style.transition).toBe('none');
    expect(button.style.transform).toBe('translate(812px, -68px) scale(2.5, 2.5)');

    await nextFrame();
    expect(button.style.transform).toBe('');
    expect(button.style.transition).toContain('transform');
  });

  it('consumes the origin once — a second mount with none left just appears', () => {
    const from = document.createElement('div');
    stubRect(from, { left: 900, top: 20, width: 40, height: 40 });
    captureFabMorphOrigin(from);
    render(<Target rect={{ left: 100, top: 100, width: 16, height: 16 }} />);

    const { container } = render(<Target rect={{ left: 200, top: 200, width: 16, height: 16 }} />);
    const button = container.querySelector('button')!;
    expect(button.style.transform).toBe('');
  });
});
