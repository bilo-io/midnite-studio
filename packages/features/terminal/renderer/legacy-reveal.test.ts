// vitest: the once-per-launch gate behind the previous-build session-list reveal.
import { describe, expect, it } from 'vitest';

import { createRevealOnce } from './legacy-reveal';

describe('createRevealOnce', () => {
  it('waits until ready, fires once, and never again after that', () => {
    const reveal = createRevealOnce();
    expect(reveal(false)).toBe(false);
    expect(reveal(true)).toBe(true);
    expect(reveal(true)).toBe(false);
    expect(reveal(false)).toBe(false);
    expect(reveal(true)).toBe(false);
  });

  it('is not burned by a not-ready check', () => {
    const reveal = createRevealOnce();
    for (let i = 0; i < 3; i++) expect(reveal(false)).toBe(false);
    expect(reveal(true)).toBe(true);
  });
});
