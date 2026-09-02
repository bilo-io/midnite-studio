import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { loopGlowColor, LOOP_WAITING_COLOR } from './loop-glow';

/**
 * The point of this map is that a launcher and its FAB tab are the same colour
 * *by construction* — so the assertion worth having is that every loop in the
 * registry resolves, and that the hex matches the Tailwind class the registry
 * declares. A drifted pair would look fine in isolation and wrong side by side.
 */
const TAILWIND_500: Record<string, string> = {
  'text-blue-500': '#3b82f6',
  'text-green-500': '#22c55e',
  'text-yellow-500': '#eab308',
  'text-red-500': '#ef4444',
};

describe('loopGlowColor', () => {
  it('resolves every loop in DEFAULT_LOOPS', () => {
    for (const loop of DEFAULT_LOOPS) {
      expect(loopGlowColor(loop.id)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('matches the Tailwind class each loop already declares', () => {
    for (const loop of DEFAULT_LOOPS) {
      const expected = TAILWIND_500[loop.color];
      expect(expected, `no mapping for ${loop.color} — add it or fix the registry`).toBeDefined();
      expect(loopGlowColor(loop.id)).toBe(expected);
    }
  });

  /** A wrong colour is cosmetic; a crashed status bar is not. */
  it('falls back to currentColor for an unknown id rather than throwing', () => {
    expect(loopGlowColor('a-loop-from-a-newer-store')).toBe('currentColor');
    expect(loopGlowColor('')).toBe('currentColor');
  });

  /** Amber has to be the same amber in all four places it appears. */
  it('uses the amber .loop-run-glow.is-waiting already uses', () => {
    expect(LOOP_WAITING_COLOR).toBe('#f59e0b');
  });
});
