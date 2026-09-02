import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearanceStore } from '../../store/appearance-store';
import { LandingCarousel, type CarouselSlide } from './landing-carousel';

/**
 * The carousel's machinery, at the level the page actually depends on: which
 * slide is showing, which dot is selected, and that a change goes through the
 * out→in pair rather than swapping outright.
 *
 * The *motion* is CSS (`.landing-slide-out` / `.landing-slide-in`) and is
 * asserted only as the class the phase applies — jsdom computes no animation,
 * so anything past that would be testing the assertion itself.
 */

const SLIDES: readonly CarouselSlide[] = [
  { key: 'a', label: 'First', render: (active) => <p>first {active ? 'live' : 'idle'}</p> },
  { key: 'b', label: 'Second', render: () => <p>second</p> },
  { key: 'c', label: 'Third', render: () => <p>third</p> },
];

/** Long enough to clear both phases (170ms + 420ms). */
const SETTLE_MS = 700;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('LandingCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppearanceStore.setState({ motion: 'full' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts on the first slide with its dot selected', () => {
    render(<LandingCarousel slides={SLIDES} />);
    expect(screen.getByText(/^first/)).toBeTruthy();
    expect(screen.getByTestId('landing-dot-0').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('landing-dot-2').getAttribute('aria-selected')).toBe('false');
  });

  it('tells the active slide it is active, so off-screen slides can idle', () => {
    render(<LandingCarousel slides={SLIDES} />);
    expect(screen.getByText('first live')).toBeTruthy();
  });

  it('a dot click leaves through the out phase and arrives through the in phase', () => {
    render(<LandingCarousel slides={SLIDES} />);
    act(() => {
      screen.getByTestId('landing-dot-2').click();
    });

    // Still the old slide, now leaving.
    expect(screen.getByTestId('landing-slide').dataset['landingPhase']).toBe('out');
    expect(screen.getByText(/^first/)).toBeTruthy();

    advance(200);
    expect(screen.getByTestId('landing-slide').dataset['landingPhase']).toBe('in');
    expect(screen.getByText('third')).toBeTruthy();

    advance(SETTLE_MS);
    expect(screen.getByTestId('landing-slide').dataset['landingPhase']).toBe('idle');
    expect(screen.getByTestId('landing-dot-2').getAttribute('aria-selected')).toBe('true');
  });

  it('wraps past the last slide and back before the first', () => {
    render(<LandingCarousel slides={SLIDES} />);

    // Right three times from slide 0 lands back on slide 0.
    for (const _ of [0, 1, 2]) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      advance(SETTLE_MS);
    }
    expect(screen.getByText(/^first/)).toBeTruthy();

    // And left once from slide 0 lands on the last.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    advance(SETTLE_MS);
    expect(screen.getByText('third')).toBeTruthy();
  });

  it('advances itself until the first interaction, then never again', () => {
    render(<LandingCarousel slides={SLIDES} />);

    advance(8000 + SETTLE_MS);
    expect(screen.getByText('second')).toBeTruthy();

    // A dot click is the interaction that retires autoplay.
    act(() => {
      screen.getByTestId('landing-dot-0').click();
    });
    advance(SETTLE_MS);
    expect(screen.getByText(/^first/)).toBeTruthy();

    advance(8000 * 3);
    expect(screen.getByText(/^first/)).toBeTruthy();
  });

  it('leaves the arrow keys to a text field, a tree and a terminal', () => {
    render(
      <>
        <input data-testid="field" />
        <div role="tree" data-testid="tree" tabIndex={-1} />
        <div className="xterm" data-testid="term" tabIndex={-1} />
        <LandingCarousel slides={SLIDES} />
      </>,
    );

    for (const id of ['field', 'tree', 'term']) {
      act(() => {
        screen
          .getByTestId(id)
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      advance(SETTLE_MS);
      expect(screen.getByText(/^first/)).toBeTruthy();
    }
  });

  it('swaps outright under reduced motion — no phases, no autoplay', () => {
    useAppearanceStore.setState({ motion: 'reduced' });
    render(<LandingCarousel slides={SLIDES} />);

    act(() => {
      screen.getByTestId('landing-dot-1').click();
    });
    expect(screen.getByText('second')).toBeTruthy();
    expect(screen.getByTestId('landing-slide').dataset['landingPhase']).toBe('idle');
    expect(screen.getByTestId('landing-slide').className).not.toContain('landing-slide');

    advance(8000 * 2);
    expect(screen.getByText('second')).toBeTruthy();
  });
});
