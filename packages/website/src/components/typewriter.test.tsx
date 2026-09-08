import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE_MS, TYPE_MS, Typewriter, typedLength } from './typewriter';

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

  it('finishes deleting exactly as the window closes', () => {
    expect(typedLength(text, WINDOW - text.length * DELETE_MS, { windowMs: WINDOW })).toBe(
      text.length,
    );
    expect(typedLength(text, WINDOW - 1, { windowMs: WINDOW })).toBeLessThan(text.length);
    expect(typedLength(text, WINDOW, { windowMs: WINDOW })).toBe(0);
  });

  it('scales both ramps down rather than overrunning a short window', () => {
    // Total, not partial: a window too small for the full cadence must still
    // reach the whole name and still be empty at the end.
    const tiny = 300;
    expect(typedLength(text, tiny * 0.7, { windowMs: tiny })).toBe(text.length);
    expect(typedLength(text, tiny, { windowMs: tiny })).toBe(0);
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
