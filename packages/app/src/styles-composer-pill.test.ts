import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/** jsdom cannot compute the cascade, so read the stylesheet itself. */
const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[-.]/g, '\\$&')} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

describe('Chats composer pills (styles.css)', () => {
  it('adds no horizontal advance, so the overlay stays aligned with the caret', () => {
    const base = rule('.composer-pill');
    expect(base).toContain('border: 1px solid transparent');
    expect(base).toContain('padding: 0 1px');
    expect(base).toContain('margin: 0 -2px');
  });

  it('gives AI skill pills the brand gradient and file pills plain primary', () => {
    const skill = rule('.composer-pill--skill');
    expect(skill).toContain('var(--rainbow-ramp)');
    // The gradient is the glyphs' fill, not a border: clipped to text, bold, no padding-box/border-box paint.
    expect(skill).toContain('background-clip: text');
    expect(skill).toContain('-webkit-text-fill-color: transparent');
    expect(skill).toContain('font-weight: 700');
    expect(skill).not.toContain('border-box');
    const file = rule('.composer-pill--file');
    expect(file).toContain('hsl(var(--primary))');
    expect(file).not.toContain('gradient');
  });
});
