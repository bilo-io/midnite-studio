import { COMMANDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { SHORTCUT_BATCHES } from './landing-shortcuts';

/**
 * The cheat sheet's contract: two batches, every row bound, and every label
 * and chord read from `COMMANDS` rather than written out here.
 *
 * The last of those is the one worth a test — the whole reason this page
 * reads the registry is that a rebound or renamed command must not be able to
 * leave a lie on the landing page.
 */
describe('SHORTCUT_BATCHES', () => {
  it('is two batches, each with rows', () => {
    expect(SHORTCUT_BATCHES).toHaveLength(2);
    for (const batch of SHORTCUT_BATCHES) {
      expect(batch.cards.length).toBeGreaterThan(0);
      expect(batch.title).toBeTruthy();
    }
  });

  it('names only real commands, and takes their labels from the registry', () => {
    for (const card of SHORTCUT_BATCHES.flatMap((b) => b.cards)) {
      const command = COMMANDS.find((c) => c.id === card.id);
      expect(command, card.id).toBeDefined();
      expect(card.label).toBe(command?.label);
    }
  });

  it('shows a chord on every row — a row that cannot name a key is dropped', () => {
    for (const card of SHORTCUT_BATCHES.flatMap((b) => b.cards)) {
      expect(card.chord, card.id).not.toBe('');
      expect(card.chord, card.id).not.toContain('Mod');
    }
  });

  it('never lists the same command twice', () => {
    const ids = SHORTCUT_BATCHES.flatMap((b) => b.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every row a glyph', () => {
    for (const card of SHORTCUT_BATCHES.flatMap((b) => b.cards)) {
      expect(card.icon, card.id).toBeTruthy();
    }
  });
});
