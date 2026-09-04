import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LockScreen } from './lock-screen';

/**
 * The `.gradient-frame` inner glow (styles.css's `.screensaver-panel-gradient`)
 * that lights the whole screensaver container while any loop is running — the
 * same `data-loops-running` switch the FAB console and `useWindowFocusGate`
 * (blur-pause) wiring `landing-view.test.tsx` covers for that surface.
 */
let running = false;

vi.mock('../loops/fab-loop-halo', () => ({
  useAnyLoopRunning: () => ({ running, waiting: false, thinking: false }),
}));

beforeEach(() => {
  running = false;
  // The neural-cloud background asks for a 2D context, which jsdom answers
  // with a "Not implemented" throw rather than `null` — same workaround
  // `screensaver.test.tsx`/`landing-view.test.tsx` use for the same tree.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset['windowFocused'];
});

describe('LockScreen loop glow', () => {
  it('wears the shared gradient-frame class but reports no loop running while idle', () => {
    render(<LockScreen />);
    const dialog = screen.getByRole('dialog');

    expect(dialog.className).toContain('gradient-frame');
    expect(dialog.className).toContain('screensaver-panel-gradient');
    expect(dialog.dataset['loopsRunning']).toBe('false');
    // Not a gated host while there is nothing to animate.
    expect(document.documentElement.dataset['windowFocused']).toBeUndefined();
  });

  it('flips data-loops-running to true and joins the window-focus gate once a loop is live', () => {
    running = true;
    render(<LockScreen />);
    const dialog = screen.getByRole('dialog');

    expect(dialog.dataset['loopsRunning']).toBe('true');
    expect(document.documentElement.dataset['windowFocused']).toBeDefined();
  });
});
