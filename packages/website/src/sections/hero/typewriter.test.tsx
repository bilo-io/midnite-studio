import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Typewriter } from './typewriter';

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
