import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearanceStore } from '../../store/appearance-store';
import { LandingView } from './landing-view';

/**
 * The page as a whole: the FAB's rotating gradient, the lock-screen frame
 * around a paginating middle, and the focus attribute that freezes both
 * animations when the window loses focus.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('LandingView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The spinner asks the platform about reduced motion on mount, and jsdom
    // ships no `matchMedia`.
    // The neural-cloud background asks for a 2D context, which jsdom answers
    // with a "Not implemented" throw rather than `null`; the component's own
    // null guard is the path this takes instead.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    useAppearanceStore.setState({ motion: 'full' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.documentElement.dataset['windowFocused'];
  });

  it('wears the FAB console’s own rotating gradient', () => {
    render(<LandingView />, { wrapper });
    expect(screen.getByTestId('landing-view').className).toContain('landing-panel-gradient');
  });

  it('keeps the lock screen’s corners and widgets around the carousel', () => {
    render(<LandingView />, { wrapper });
    expect(screen.getByTestId('lock-screen-widgets')).toBeTruthy();
    expect(screen.getByTestId('landing-carousel')).toBeTruthy();
    expect(screen.getByText('Local Time')).toBeTruthy();
  });

  it('renders the brand wordmark logo at the center top', () => {
    render(<LandingView />, { wrapper });
    expect(screen.getByTestId('landing-brand')).toBeTruthy();
    expect(screen.getByText('Midnite')).toBeTruthy();
    expect(screen.getByText('Studio')).toBeTruthy();
  });

  it('paginates four slides — the screensaver stage, two shortcut batches, the loop console', () => {
    render(<LandingView />, { wrapper });
    const dots = screen.getAllByRole('tab');
    expect(dots).toHaveLength(4);
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'Workspace status',
      'Getting around',
      'Getting work done',
      'The loop console',
    ]);
  });

  it('publishes window focus for the CSS that freezes the rotation', () => {
    render(<LandingView />, { wrapper });
    expect(document.documentElement.dataset['windowFocused']).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(document.documentElement.dataset['windowFocused']).toBe('false');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(document.documentElement.dataset['windowFocused']).toBe('true');
  });
});
