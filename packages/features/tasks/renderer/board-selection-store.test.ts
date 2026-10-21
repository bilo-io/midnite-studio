import { beforeEach, describe, expect, it } from 'vitest';

import { selectedCardFor, useBoardSelectionStore } from './board-selection-store';

describe('board selection store (Phase 112 Theme D)', () => {
  beforeEach(() => useBoardSelectionStore.setState({ selected: null, revealNonce: 0 }));

  it('a click selects without asking for a scroll; clearing drops it', () => {
    const { select } = useBoardSelectionStore.getState();
    select('r1', 'card-1');
    expect(useBoardSelectionStore.getState().revealNonce).toBe(0);
    expect(selectedCardFor('r1')(useBoardSelectionStore.getState())).toBe('card-1');
    select('r1', null);
    expect(selectedCardFor('r1')(useBoardSelectionStore.getState())).toBeNull();
  });

  it('a selection belongs to its repo only', () => {
    useBoardSelectionStore.getState().select('r1', 'card-1');
    expect(selectedCardFor('r2')(useBoardSelectionStore.getState())).toBeNull();
    expect(selectedCardFor(null)(useBoardSelectionStore.getState())).toBeNull();
  });

  it('a reveal selects and bumps the nonce every time, even for the same card', () => {
    const { revealCard } = useBoardSelectionStore.getState();
    revealCard('r1', 'card-1');
    revealCard('r1', 'card-1');
    expect(useBoardSelectionStore.getState().revealNonce).toBe(2);
    expect(selectedCardFor('r1')(useBoardSelectionStore.getState())).toBe('card-1');
  });
});
