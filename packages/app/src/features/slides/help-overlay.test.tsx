import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HelpOverlay } from './help-overlay';

/**
 * Phase 68 Theme D — the overlay already said `role="dialog"` and autofocused
 * its Close button, but without a trap Tab walked out of it and into the deck
 * behind, where every keystroke drives the presentation.
 */
describe('HelpOverlay focus trap', () => {
  afterEach(cleanup);

  it('keeps focus on its one control instead of letting Tab reach the deck', () => {
    render(<HelpOverlay onClose={() => {}} />);

    const close = screen.getByRole('button', { name: 'Close' });
    // `autoFocus` still wins: the trap only claims the container when nothing
    // inside it already holds focus.
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});
