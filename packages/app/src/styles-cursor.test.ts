import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/** Class-level guard: jsdom cannot compute the cascade, so read the stylesheet itself. */
describe('pointer cursor base rule (styles.css)', () => {
  it('declares a base-layer pointer rule for interactive roles, excluding disabled ones', () => {
    expect(css).toContain("[role='menuitem']:not([aria-disabled='true'])");
    expect(css).toContain("[role='tab']");
    expect(css).toContain('button:not(:disabled)');
    expect(css).toMatch(/summary,[\s\S]*?cursor: pointer;/);
  });
});
