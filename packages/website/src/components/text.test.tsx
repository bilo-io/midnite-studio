import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Heading, Lede } from './text';
import { typeInCharMs } from './typewriter';

afterEach(() => {
  vi.useRealTimers();
});

describe('Heading', () => {
  it('renders children whole, with no animation, when typeIn is not set', () => {
    const { container } = render(<Heading level={2}>Three surfaces, one window</Heading>);
    expect(container.textContent).toBe('Three surfaces, one window');
    expect(container.querySelector('.sr-only')).toBeNull();
  });

  it('types the text in when typeIn is set, and gives it the level 2 tag', () => {
    const { container } = render(
      <Heading level={2} typeIn>
        Three surfaces, one window
      </Heading>,
    );
    expect(container.querySelector('h2')).not.toBeNull();
    // The accessible name is the full string from the first render, whatever
    // the animation has typed so far — see `TypeIn`'s own tests for the
    // character-by-character behaviour this delegates to.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Three surfaces, one window' }),
    ).toBeDefined();
  });

  it('falls back to plain children when they are not plain text', () => {
    // `typeIn` types characters, not markup — a heading with an element child
    // (unusual, but not one `typeInText` should silently mangle into
    // "[object Object]") renders exactly as it would with typeIn unset.
    const { container } = render(
      <Heading level={2} typeIn>
        Ships <code>v1</code>
      </Heading>,
    );
    expect(container.textContent).toBe('Ships v1');
    expect(container.querySelector('.sr-only')).toBeNull();
  });
});

describe('Lede', () => {
  it('renders children whole, with no animation, when typeIn is not set', () => {
    // This is `download-page.tsx`'s own case: a `<Lede>` with an inline
    // `<code>` child must keep rendering that markup rather than losing it to
    // a flattened string, which is exactly why it never opts in.
    const { container } = render(
      <Lede>
        Installs to <code>/Applications</code>.
      </Lede>,
    );
    expect(container.querySelector('code')).not.toBeNull();
    expect(container.textContent).toBe('Installs to /Applications.');
  });

  it('flattens a string mixed with a number, as trusted.tsx does', () => {
    const { container } = render(<Lede typeIn>{10} coding agents ship in the roster.</Lede>);
    expect(
      screen.getByText('10 coding agents ship in the roster.', { selector: '.sr-only' }),
    ).toBeDefined();
    expect(container.querySelector('p')).not.toBeNull();
  });

  describe('with motion', () => {
    beforeEach(() => vi.useFakeTimers());

    it('leads with TYPE_IN_HEADING_MS by default, so it starts after a sibling heading', () => {
      const text = 'A lede under a heading.';
      render(<Lede typeIn>{text}</Lede>);
      const typed = () => screen.getByTestId('type-in-text').textContent;
      const charMs = typeInCharMs(text.length, 1400);

      // TYPE_IN_HEADING_MS is 600 — short of the full lead + first character,
      // nothing has typed yet.
      act(() => void vi.advanceTimersByTime(600 + charMs - 1));
      expect(typed()).toBe('');
      act(() => void vi.advanceTimersByTime(1));
      expect(typed()).toBe('A');
    });

    it('starts immediately when typeInLeadMs is 0', () => {
      const text = 'No heading above this one.';
      render(
        <Lede typeIn typeInLeadMs={0}>
          {text}
        </Lede>,
      );
      const typed = () => screen.getByTestId('type-in-text').textContent;
      const charMs = typeInCharMs(text.length, 1400);

      act(() => void vi.advanceTimersByTime(charMs));
      expect(typed()).toBe('N');
    });
  });
});
