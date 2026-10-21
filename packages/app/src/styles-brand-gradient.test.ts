import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/** jsdom cannot compute the cascade, so read the stylesheet itself. */
describe('setup wordmark gradient (styles.css)', () => {
  it("paints the setup wordmark with the shell's brand gradient, not the rainbow ramp", () => {
    const rule = css.match(/\.setup-brand-gradient \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(rule).toContain('var(\n    --brand-gradient,');
    expect(rule).not.toContain('--rainbow-ramp');
  });
});
