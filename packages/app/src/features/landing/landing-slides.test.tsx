import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SHORTCUT_BATCHES } from './landing-shortcuts';
import { FabSlide, ShortcutSlide } from './landing-slides';

describe('landing slides', () => {
  afterEach(cleanup);

  it('renders a card per shortcut, each with its key', () => {
    const batch = SHORTCUT_BATCHES[0]!;
    render(<ShortcutSlide batch={batch} />);

    expect(screen.getByText(batch.title)).toBeTruthy();
    for (const card of batch.cards) {
      const row = screen.getByTestId(`landing-shortcut-${card.id}`);
      expect(row.textContent, card.id).toContain(card.label);
      expect(row.textContent, card.id).toContain(card.chord);
    }
  });

  it('explains the loop console with its chord and all four tabs', () => {
    render(<FabSlide />);

    // The chord comes from the keymap; `Mod` must never reach the screen.
    expect(screen.getByText(/⌘M|Ctrl\+M/)).toBeTruthy();

    for (const loop of DEFAULT_LOOPS) {
      const tab = screen.getByTestId(`landing-loop-${loop.id}`);
      expect(tab.textContent, loop.id).toContain(loop.label);
    }
    expect(DEFAULT_LOOPS).toHaveLength(4);
  });
});
