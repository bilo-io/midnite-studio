import { describe, expect, it } from 'vitest';

import { FAQ, faqFragment, faqSlugFromHash } from './faq';

/**
 * The FAQ's slugs are published URL fragments, so the interesting assertions
 * are about the *data*, not the rendering: a duplicate slug means two questions
 * fight over one deep link and the loser is unreachable, and an empty answer
 * ships a question with a blank panel — which looks like a broken page rather
 * than an unanswered question.
 */
describe('FAQ data', () => {
  it('has between six and eight questions', () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(6);
    expect(FAQ.length).toBeLessThanOrEqual(8);
  });

  it('has unique slugs', () => {
    const slugs = FAQ.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has URL-safe slugs', () => {
    for (const entry of FAQ) {
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('answers every question with real prose', () => {
    for (const entry of FAQ) {
      expect(entry.question.length, entry.slug).toBeGreaterThan(0);
      expect(entry.answer.length, entry.slug).toBeGreaterThan(0);
      for (const paragraph of entry.answer) {
        expect(paragraph.trim().length, entry.slug).toBeGreaterThan(0);
      }
    }
  });

  it('gives every link a label and an href', () => {
    for (const entry of FAQ) {
      for (const link of entry.links ?? []) {
        expect(link.label.trim().length, entry.slug).toBeGreaterThan(0);
        expect(link.href.trim().length, entry.slug).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The site is served from the *public* releases repo and this repo is
   * private, so a link to it is a 404 for every visitor — which reads as a
   * broken site rather than as a permissions problem. Asserted here because the
   * FAQ is where such a link is most tempting to write.
   */
  it('never links to the private repository', () => {
    for (const entry of FAQ) {
      for (const link of entry.links ?? []) {
        expect(link.href, entry.slug).not.toContain('bilo-io/midnite-studio');
      }
    }
  });
});

describe('faqSlugFromHash', () => {
  it('selects the entry a fragment names, with or without the hash', () => {
    const first = FAQ[0]!;
    expect(faqSlugFromHash(`#${faqFragment(first.slug)}`)).toBe(first.slug);
    expect(faqSlugFromHash(faqFragment(first.slug))).toBe(first.slug);
  });

  it('ignores a fragment that is not a FAQ one', () => {
    expect(faqSlugFromHash('#early-access')).toBeNull();
    expect(faqSlugFromHash('')).toBeNull();
  });

  /**
   * A fragment shaped like ours but naming nothing — a slug that was renamed,
   * or a typo in a pasted link — must not select anything, or the panel would
   * try to render an entry that does not exist.
   */
  it('ignores a well-shaped fragment for an unknown slug', () => {
    expect(faqSlugFromHash('#faq-does-not-exist')).toBeNull();
  });
});
