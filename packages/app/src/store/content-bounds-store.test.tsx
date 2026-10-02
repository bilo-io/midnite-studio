import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Modal } from '../components/modal';
import {
  computeContentRect,
  contentOverlayStyle,
  useContentBoundsStore,
  useContentBoundsSync,
} from './content-bounds-store';

const stack = { left: 100, top: 40, width: 800, height: 600 };

describe('computeContentRect', () => {
  it('removes a bottom-docked terminal from the height', () => {
    expect(computeContentRect(stack, 200, 'bottom')).toEqual({ ...stack, height: 400 });
  });
  it('removes a right-docked terminal from the width', () => {
    expect(computeContentRect(stack, 300, 'right')).toEqual({ ...stack, width: 500 });
  });
  it('falls back to the stack with no terminal or one that fills it', () => {
    expect(computeContentRect(stack, null, 'bottom')).toEqual(stack);
    expect(computeContentRect(stack, 600, 'bottom')).toEqual(stack);
  });
});

describe('contentOverlayStyle', () => {
  it('pads the overlay so its centre is the content rect centre', () => {
    const rect = { left: 100, top: 40, width: 800, height: 400 };
    const s = contentOverlayStyle(rect, { width: 1000, height: 700 })!;
    expect(s.paddingLeft).toBe(124);
    expect(s.paddingRight).toBe(124);
    expect(s.paddingTop).toBe(64);
    expect(s.paddingBottom).toBe(284);
  });
  it('is undefined without bounds', () => {
    expect(contentOverlayStyle(null, { width: 1, height: 1 })).toBeUndefined();
  });
});

describe('useContentBoundsSync', () => {
  const originalRO = globalThis.ResizeObserver;
  let trigger: () => void = () => {};
  beforeEach(() => {
    useContentBoundsStore.setState({ rect: null });
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        trigger = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = originalRO;
  });

  it('re-measures when the observer fires', () => {
    const el = document.createElement('div');
    let height = 500;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height }) as DOMRect;
    const ref = createRef<HTMLElement>() as { current: HTMLElement | null };
    ref.current = el;
    function Probe() {
      useContentBoundsSync(ref, 'bottom', null);
      return null;
    }
    render(<Probe />);
    act(() => trigger());
    expect(useContentBoundsStore.getState().rect?.height).toBe(500);
    height = 320;
    act(() => trigger());
    expect(useContentBoundsStore.getState().rect?.height).toBe(320);
  });
});

describe('Modal scope', () => {
  beforeEach(() => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    useContentBoundsStore.setState({
      rect: { left: 100, top: 40, width: 800, height: 400 },
      viewport: { width: 1000, height: 700 },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useContentBoundsStore.setState({ rect: null });
  });

  it('content scope centres in the rect and caps height', () => {
    const { getByRole, getByTestId } = render(
      <Modal open onClose={() => {}} testId="p">
        x
      </Modal>,
    );
    const overlay = getByRole('dialog');
    expect(overlay.style.paddingLeft).toBe('124px');
    expect(overlay.style.paddingBottom).toBe('284px');
    expect(getByTestId('p').style.maxHeight).toBe('352px');
  });

  it('window scope ignores the bounds', () => {
    const { getByRole } = render(
      <Modal open onClose={() => {}} scope="window">
        x
      </Modal>,
    );
    expect(getByRole('dialog').style.paddingLeft).toBe('');
    expect(getByRole('dialog').className).toContain('p-6');
  });
});
