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

  it('tells a slide whether it has settled, so it can hold its own motion', () => {
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

  /**
   * The key-repeat regression. `goTo` cancels the pending `setIndex` and
   * re-reads `index`, which has not advanced yet, so without the in-flight
   * guard a held arrow key cancelled the swap on every repeat while the
   * outgoing slide's `forwards` animation stayed parked at `opacity: 0` —
   * a page that was blank until the key came up.
   */
  it('ignores a repeat while a change is in flight, and never parks mid-transition', () => {
    render(<LandingCarousel slides={SLIDES} />);

    // A held key: five repeats well inside the 170ms exit.
    for (const _ of [0, 1, 2, 3, 4]) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      advance(30);
    }

    advance(SETTLE_MS);
    // Exactly one slide moved, and the stage settled rather than sticking.
    expect(screen.getByText('second')).toBeTruthy();
    expect(screen.getByTestId('landing-slide').dataset['landingPhase']).toBe('idle');
    expect(screen.getByTestId('landing-slide').className).not.toContain('landing-slide-out');
  });

  it('leaves the arrow keys to a text field, a tree, a terminal, a splitter and the session list', () => {
    render(
      <>
        <input data-testid="field" />
        <div role="tree" data-testid="tree" tabIndex={-1} />
        <div className="xterm" data-testid="term" tabIndex={-1} />
        {/* The resize handles and the terminal's session list both mean
            something else by a horizontal arrow, and both can be on screen
            beside the landing view. */}
        <div role="separator" data-testid="splitter" tabIndex={-1} />
        <div data-session-list data-testid="sessions" tabIndex={-1} />
        <LandingCarousel slides={SLIDES} />
      </>,
    );

    for (const id of ['field', 'tree', 'term', 'splitter', 'sessions']) {
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
