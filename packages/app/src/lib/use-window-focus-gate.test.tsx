import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useWindowFocusGate } from './use-window-focus-gate';

function Gate({ enabled }: { enabled: boolean }) {
  useWindowFocusGate(enabled);
  return null;
}

const attr = (): string | undefined => document.documentElement.dataset['windowFocused'];

describe('useWindowFocusGate', () => {
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset['windowFocused'];
  });

  it('sets nothing while disabled', () => {
    render(<Gate enabled={false} />);
    expect(attr()).toBeUndefined();
  });

  it('tracks focus and blur while enabled', () => {
    render(<Gate enabled />);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(attr()).toBe('false');
    act(() => window.dispatchEvent(new Event('focus')));
    expect(attr()).toBe('true');
  });

  /**
   * The FAB console and the landing page both gate on this attribute and
   * either can be mounted without the other, so the last host to leave is
   * what clears it — not the first.
   */
  it('keeps the attribute until the last host unmounts', () => {
    const first = render(<Gate enabled />);
    const second = render(<Gate enabled />);

    first.unmount();
    expect(attr()).toBeDefined();

    second.unmount();
    expect(attr()).toBeUndefined();
  });
});
