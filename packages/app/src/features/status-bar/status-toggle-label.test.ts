import { describe, expect, it } from 'vitest';

import { showsName, showsNameAt } from './status-toggle-label';

describe('showsName', () => {
  it('is false at rest — the chord is what you read', () => {
    expect(showsName({ active: false, hovered: false })).toBe(false);
  });

  it('is true while the surface is open', () => {
    expect(showsName({ active: true, hovered: false })).toBe(true);
  });

  it('is true while hovered or focused, so the rail is discoverable', () => {
    expect(showsName({ active: false, hovered: true })).toBe(true);
  });

  it('is true when both', () => {
    expect(showsName({ active: true, hovered: true })).toBe(true);
  });
});

describe('showsNameAt', () => {
  /**
   * Density wins over state. An active label appearing in a narrow window
   * could re-trigger the very overflow that produced the narrow window, and
   * `.status-label` already gives every segment this behaviour for free — an
   * exception here would be the one carve-out in a rule the whole bar depends
   * on.
   */
  it('hides the name at compact and collapsed even when active', () => {
    expect(showsNameAt({ active: true, hovered: true }, 'compact')).toBe(false);
    expect(showsNameAt({ active: true, hovered: true }, 'collapsed')).toBe(false);
  });

  it('defers to state at full density', () => {
    expect(showsNameAt({ active: false, hovered: false }, 'full')).toBe(false);
    expect(showsNameAt({ active: true, hovered: false }, 'full')).toBe(true);
  });
});
