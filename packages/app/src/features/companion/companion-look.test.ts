import { COMPANION_STATES, type CompanionState } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { COMPANION_LOOK, fabCompanionState } from './companion-look';

describe('COMPANION_LOOK', () => {
  it('has a label and a glyph for every state the machine can be in', () => {
    // Total, the same way `transition` is: a state with no row here renders a
    // blank header, and the machine gains states in later themes.
    for (const state of COMPANION_STATES) {
      const look = COMPANION_LOOK[state];
      expect(look.label.length).toBeGreaterThan(0);
      expect(typeof look.icon).toBe('function');
    }
  });

  it('distinguishes the companion thinking from an agent working', () => {
    // The whole reason `handoff` is a separate state (`shared/src/companion.ts`)
    // — if these two read the same, the FAB is lying about which one you can go
    // and look at.
    expect(COMPANION_LOOK.thinking.label).not.toBe(COMPANION_LOOK.handoff.label);
  });
});

describe('fabCompanionState', () => {
  it('sets no attribute at all for off and idle', () => {
    // "No rule — today's look wins" has to mean the attribute is absent, not
    // set to a value with an empty rule: a later CSS refactor of the four
    // states must not be able to reach the resting FAB.
    expect(fabCompanionState('off')).toBeUndefined();
    expect(fabCompanionState('idle')).toBeUndefined();
  });

  it('folds greeting into speaking', () => {
    expect(fabCompanionState('greeting')).toBe('speaking');
  });

  it('passes the four animated states through unchanged', () => {
    expect(fabCompanionState('listening')).toBe('listening');
    expect(fabCompanionState('thinking')).toBe('thinking');
    expect(fabCompanionState('speaking')).toBe('speaking');
    expect(fabCompanionState('handoff')).toBe('handoff');
  });

  it('only ever returns a value styles.css has a rule for', () => {
    const styled = new Set(['listening', 'thinking', 'speaking', 'handoff']);
    for (const state of COMPANION_STATES) {
      const value = fabCompanionState(state as CompanionState);
      if (value !== undefined) expect(styled.has(value)).toBe(true);
    }
  });
});
