import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE_MS,
  GAP_MS,
  TYPE_IN_MAX_CHAR_MS,
  TYPE_IN_MIN_CHAR_MS,
  TYPE_MS,
  typeInCharMs,
  TypeIn,
  Typewriter,
  typedLength,
} from './typewriter';

const PHRASES = ['One window.', 'Your git client.'] as const;

const setReducedMotion = (reduced: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('typedLength', () => {
  const WINDOW = 2850;
  const text = 'Antigravity';

  it('types at the site cadence from the start of the pass', () => {
    expect(typedLength(text, 0, { windowMs: WINDOW })).toBe(0);
    expect(typedLength(text, TYPE_MS, { windowMs: WINDOW })).toBe(1);
    expect(typedLength(text, TYPE_MS * 4, { windowMs: WINDOW })).toBe(4);
  });

  it('holds the whole name through the middle of the pass', () => {
    // The hold is the term that stretches when the window grows — the typing
    // keeps the hero's cadence, so a slower marquee reads the name for longer
    // rather than typing it more slowly.
    expect(typedLength(text, WINDOW / 2, { windowMs: WINDOW })).toBe(text.length);
  });

  it('deletes into an empty beat, so a handover lands on a blank line', () => {
    const emptyAt = WINDOW - GAP_MS;
    expect(typedLength(text, emptyAt - text.length * DELETE_MS, { windowMs: WINDOW })).toBe(
      text.length,
    );
    expect(typedLength(text, emptyAt - 1, { windowMs: WINDOW })).toBeLessThan(text.length);

    // Empty for the whole gap, not merely at the last instant — a caption that
    // reached zero exactly on the boundary would never be seen empty at all.
    expect(typedLength(text, emptyAt, { windowMs: WINDOW })).toBe(0);
    expect(typedLength(text, WINDOW - 1, { windowMs: WINDOW })).toBe(0);
  });

  it('scales both ramps down rather than overrunning a short window', () => {
    // Total, not partial: a window too small for the full cadence must still
    // reach the whole name and still be empty at the end.
    const tiny = 300;
    expect(typedLength(text, tiny * 0.6, { windowMs: tiny })).toBe(text.length);
    expect(typedLength(text, tiny * 0.95, { windowMs: tiny })).toBe(0);
  });

  it('is zero for an empty string or a zero window', () => {
    expect(typedLength('', 100, { windowMs: WINDOW })).toBe(0);
    expect(typedLength(text, 100, { windowMs: 0 })).toBe(0);
  });
});

describe('Typewriter', () => {
  it('shows only the first phrase, with no caret, under reduced motion', () => {
    setReducedMotion(true);
    const { container } = render(<Typewriter phrases={PHRASES} />);
    expect(container.textContent).toBe('One window.');
    expect(container.querySelector('.ws-caret')).toBeNull();
  });

  describe('with motion', () => {
    beforeEach(() => {
      setReducedMotion(false);
      vi.useFakeTimers();
    });

    it('types the first phrase one character at a time', () => {
      render(<Typewriter phrases={PHRASES} />);
      const text = () => screen.getByTestId('typewriter-text').textContent;

      expect(text()).toBe('');
      act(() => void vi.advanceTimersByTime(70));
      expect(text()).toBe('O');
      act(() => void vi.advanceTimersByTime(70));
      expect(text()).toBe('On');
    });

    it('offers the whole phrase list to assistive tech as static text', () => {
      // The animated span is aria-hidden; announcing a partial word per tick
      // would be unusable, so the sr-only copy is the accessible content.
      const { container } = render(<Typewriter phrases={PHRASES} />);
      expect(container.querySelector('.sr-only')?.textContent).toBe(
        'One window. Your git client.',
      );
    });
  });
});

describe('typeInCharMs', () => {
  it('scales the per-character delay so the target duration holds', () => {
    expect(typeInCharMs(20, 600)).toBeCloseTo(30);
    expect(typeInCharMs(200, 1400)).toBeCloseTo(7);
  });

  it('clamps to the floor for a very long string', () => {
    // The hero's own paragraph is ~350 characters, and 1400 / 350 = 4 is below
    // the floor — the floor is what stops it crawling any further than that.
    expect(typeInCharMs(350, 1400)).toBe(TYPE_IN_MIN_CHAR_MS);
  });

  it('clamps to the ceiling for a very short string', () => {
    expect(typeInCharMs(1, 600)).toBe(TYPE_IN_MAX_CHAR_MS);
  });

  it('is total for an empty string', () => {
    expect(typeInCharMs(0, 600)).toBe(TYPE_IN_MAX_CHAR_MS);
  });
});

describe('TypeIn', () => {
  const TEXT = 'Three surfaces, one window';

  it('shows the full text immediately, with no caret, under reduced motion', () => {
    setReducedMotion(true);
    const { container } = render(<TypeIn text={TEXT} />);
    expect(container.textContent).toBe(TEXT);
    expect(container.querySelector('.ws-caret')).toBeNull();
  });

  describe('with motion', () => {
    beforeEach(() => {
      setReducedMotion(false);
      vi.useFakeTimers();
    });

    /*
      No `installFakeIntersectionObserver` here: `useInView` falls open when
      `IntersectionObserver` is undefined (true, from mount) — which jsdom
      leaves undefined by default — so these exercise the same "already in
      view" path the site takes on any browser that lacks one, without a
      second observer to wire up.
    */
    it('types the text one character at a time, once in view', () => {
      render(<TypeIn text={TEXT} leadMs={0} />);
      const typed = () => screen.getByTestId('type-in-text').textContent;

      expect(typed()).toBe('');
      const charMs = typeInCharMs(TEXT.length, 1400);
      act(() => void vi.advanceTimersByTime(charMs));
      expect(typed()).toBe('T');
      act(() => void vi.advanceTimersByTime(charMs));
      expect(typed()).toBe('Th');
    });

    it('waits `leadMs` before the first character, not before the rest', () => {
      render(<TypeIn text={TEXT} leadMs={500} />);
      const typed = () => screen.getByTestId('type-in-text').textContent;
      const charMs = typeInCharMs(TEXT.length, 1400);

      act(() => void vi.advanceTimersByTime(500 + charMs - 1));
      expect(typed()).toBe('');
      act(() => void vi.advanceTimersByTime(1));
      expect(typed()).toBe('T');
    });

    it('offers the full string to assistive tech from the first render', () => {
      // Accessibility is the static string, not the animation — the same rule
      // `Typewriter` follows. The sr-only copy must not wait for the type-in
      // to finish, or a screen reader gets nothing until it does.
      const { container } = render(<TypeIn text={TEXT} />);
      expect(container.querySelector('.sr-only')?.textContent).toBe(TEXT);
    });

    it('drops the caret once the text has finished typing', () => {
      render(<TypeIn text={TEXT} leadMs={0} />);
      const charMs = typeInCharMs(TEXT.length, 1400);
      // One `act` per character: each timer's callback sets state, and the
      // effect that schedules the *next* timer only runs once React flushes
      // that update, at the end of the `act` boundary it happened in — the
      // same reason `Typewriter`'s own test above steps rather than jumping.
      for (let i = 0; i < TEXT.length; i += 1) {
        act(() => void vi.advanceTimersByTime(charMs));
      }
      expect(screen.getByTestId('type-in-text').textContent).toBe(TEXT);
      expect(screen.queryByTestId('typewriter-caret')).toBeNull();
    });

    it('pauses while the tab is hidden, and resumes once it is visible again', () => {
      render(<TypeIn text={TEXT} leadMs={0} />);
      const typed = () => screen.getByTestId('type-in-text').textContent;
      const charMs = typeInCharMs(TEXT.length, 1400);

      act(() => void vi.advanceTimersByTime(charMs));
      expect(typed()).toBe('T');

      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      act(() => void vi.advanceTimersByTime(charMs * 5));
      expect(typed()).toBe('T');

      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      act(() => void vi.advanceTimersByTime(charMs));
      expect(typed()).toBe('Th');
    });
  });
});
