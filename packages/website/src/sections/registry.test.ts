import { describe, expect, it } from 'vitest';

import { NAV_SECTIONS, SECTIONS } from './registry';

/**
 * The registry is a contract several agents append to in parallel, so what is
 * asserted here is the shape they have to keep — not the current contents.
 * A test that pinned the exact list would fail on every wave-2 landing, which
 * teaches everyone to delete it.
 */
describe('the section registry', () => {
  it('starts with the hero and ends with the footer', () => {
    expect(SECTIONS[0]?.id).toBe('hero');
    expect(SECTIONS.at(-1)?.id).toBe('footer');
  });

  it('has no duplicate ids', () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry an id, a label and a component', () => {
    for (const section of SECTIONS) {
      expect(section.id, JSON.stringify(section)).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(section.label.length).toBeGreaterThan(0);
      expect(typeof section.Component).toBe('function');
    }
  });

  it('keeps the hero and the footer out of the nav', () => {
    // Both are reachable without a nav item — the logo goes home, and nobody
    // navigates to a footer — and a "Hero" link means nothing to a visitor.
    const navIds = NAV_SECTIONS.map((section) => section.id);
    expect(navIds).not.toContain('hero');
    expect(navIds).not.toContain('footer');
  });

  it('derives NAV_SECTIONS from the registry, in page order', () => {
    expect(NAV_SECTIONS).toEqual(SECTIONS.filter((section) => section.nav));
  });
});
