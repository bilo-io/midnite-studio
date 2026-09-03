import { describe, expect, it } from 'vitest';

import { BROWSER_LAYOUT_OPTIONS, browserLayoutIndex, stepBrowserLayout } from './browser-layouts';

describe('browser layout options', () => {
  it('lists full screen first — the default, and the simplest to explain', () => {
    expect(BROWSER_LAYOUT_OPTIONS.map((option) => option.layout)).toEqual([
      'full',
      'left',
      'right',
    ]);
  });

  it('gives every option a description that says what changes, not a re-label', () => {
    for (const option of BROWSER_LAYOUT_OPTIONS) {
      expect(option.description).not.toBe(option.label);
      expect(option.description.length).toBeGreaterThan(option.label.length);
    }
  });

  it('steps through the row, clamped at both ends rather than wrapping', () => {
    expect(stepBrowserLayout('full', 1)).toBe('left');
    expect(stepBrowserLayout('left', 1)).toBe('right');
    expect(stepBrowserLayout('right', 1)).toBe('right');
    expect(stepBrowserLayout('right', -1)).toBe('left');
    expect(stepBrowserLayout('full', -1)).toBe('full');
    // A jump longer than the row still lands inside it.
    expect(stepBrowserLayout('full', 9)).toBe('right');
  });

  it('indexes a known layout, and falls back to the first for anything else', () => {
    expect(browserLayoutIndex('right')).toBe(2);
    // Cast: the point is what a persisted value from a future (or older)
    // build does here, which the type system cannot express.
    expect(browserLayoutIndex('nonsense' as 'full')).toBe(0);
  });
});
