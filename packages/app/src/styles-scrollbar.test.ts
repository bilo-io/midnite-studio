import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/**
 * Ad hoc task: the nav rail (and other narrow sidebars/rails/lists) hide
 * their own scrollbar chrome without losing scrollability — wheel, trackpad
 * and keyboard scrolling stay untouched; only the track/thumb are hidden.
 *
 * `.hide-scrollbar` (`styles.css`) is the shared utility every narrow view
 * class-applies. The nav rail can't take that class directly — its `<nav>`
 * is `@bilo-io/shell`'s `AppFrame`, an external package with no className
 * passthrough for that inner element — so it gets its own rule targeting
 * the one prop AppFrame threads onto the node instead: `navLabel`, which
 * `app.tsx` sets to `"Views"`. Read through the same `virtual:midnite-styles-raw`
 * seam `styles-motion-guards.test.ts` uses, since Vitest stubs a real CSS
 * import to an empty string.
 */
describe('narrow-view scrollbar hiding (styles.css)', () => {
  it('finds the shared .hide-scrollbar utility — a guard on the guard', () => {
    expect(css).toContain('.hide-scrollbar');
  });

  it('.hide-scrollbar hides scrollbar chrome on both the standards track and webkit', () => {
    const block = css.match(/\.hide-scrollbar\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('scrollbar-width: none');

    const webkitBlock = css.match(/\.hide-scrollbar::-webkit-scrollbar\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(webkitBlock).toContain('display: none');
  });

  it("the nav rail's own rule (nav[aria-label='Views']) hides scrollbar chrome the same way", () => {
    const block = css.match(/nav\[aria-label='Views'\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('scrollbar-width: none');

    const webkitBlock =
      css.match(/nav\[aria-label='Views'\]::-webkit-scrollbar\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(webkitBlock).toContain('display: none');
  });
});
