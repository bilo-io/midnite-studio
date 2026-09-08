import { render } from '@testing-library/react';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import tailwindConfig from '../../tailwind.config';
import { SiteNav } from '../components/site-nav';

/**
 * The regression guard for the site's colour tokens.
 *
 * A Tailwind colour declared as a finished string — `bg: 'var(--ws-bg)'` — has
 * nowhere for Tailwind to put an alpha, so it does not merely render `bg-bg/80`
 * at the wrong opacity: it **emits no rule for it at all**. The class stays in
 * the markup, nothing in the build warns, and the element quietly keeps
 * whatever it had. That is a failure mode no snapshot and no rendering test can
 * see, because the DOM is identical either way — the difference is entirely in
 * the compiled stylesheet, which is why this file compiles one.
 *
 * `tokens.css` therefore declares bare channel triplets (`--ws-bg-hsl: 240 18%
 * 6%`) and `tailwind.config.ts` wraps them as `hsl(var(--ws-bg-hsl) /
 * <alpha-value>)`. Three checks keep that true:
 *
 * 1. every colour in the config carries the `<alpha-value>` placeholder;
 * 2. every `/NN` colour class **actually written in `src/`** compiles to a rule
 *    with that alpha in it — the sweep, so a new section is covered the moment
 *    it is written rather than when someone remembers to extend this list;
 * 3. the sticky nav's own rendered class list compiles, taken off the rendered
 *    DOM rather than retyped, since it is the surface the bug shipped on.
 */

/**
 * The site's shipped sources, read through Vite so this needs no node builtins
 * (which `eslint.config.mjs` denies under `src/` anyway).
 *
 * Test files are filtered out deliberately: this file names several of these
 * classes in its own assertions, and counting those would let the sweep keep
 * passing after the last real use of one was deleted.
 */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../**/*.{ts,tsx}', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  ).filter(([path]) => !/\.test\.tsx?$/.test(path)),
);

const COLOUR_NAMES = Object.keys(
  (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>,
);

/**
 * Compile a set of classes through the real config and return the CSS.
 *
 * Tailwind is content-driven, so the classes are handed to it as a raw
 * "template" rather than listed in a safelist — that is the same path a real
 * build takes, including the class-name scanner.
 */
const compile = async (classes: readonly string[]): Promise<string> => {
  const result = await postcss([
    tailwindcss({
      presets: [tailwindConfig],
      content: [{ raw: `<div class="${classes.join(' ')}"></div>`, extension: 'html' }],
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
};

/** `bg-bg/80` → the CSS selector Tailwind escapes it to. */
const selectorFor = (cls: string) => `.${cls.replace('/', '\\/')}`;

/** `80` → `0.8`, the alpha Tailwind substitutes for `<alpha-value>`. */
const alphaFor = (modifier: string) => `${Number(modifier) / 100}`;

/**
 * Every `<utility>-<colour>/<NN>` class written anywhere in `src/`.
 *
 * The colour half is matched against the config's own names rather than a
 * pattern, so `bg-bg-elevated/60` is read as the `bg` utility on the
 * `bg-elevated` colour and not as some `bg-bg` colour that does not exist.
 */
const findModifiedColourClasses = (): { cls: string; modifier: string }[] => {
  const found = new Map<string, string>();
  const pattern = new RegExp(
    `\\b([a-z]+(?:-[a-z]+)*)-(${COLOUR_NAMES.map((n) => n.replace(/[-]/g, '\\-')).join('|')})/(\\d{1,3})\\b`,
    'g',
  );
  for (const source of Object.values(SOURCES)) {
    for (const [, utility, colour, modifier] of source.matchAll(pattern)) {
      found.set(`${utility}-${colour}/${modifier}`, modifier!);
    }
  }
  return [...found].map(([cls, modifier]) => ({ cls, modifier }));
};

describe('the colour tokens', () => {
  it('declares every colour so Tailwind can insert an alpha', () => {
    expect(COLOUR_NAMES.length).toBeGreaterThan(0);
    const colours = tailwindConfig.theme?.extend?.colors as Record<string, string>;
    for (const name of COLOUR_NAMES) {
      expect(colours[name], `colours.${name}`).toContain('<alpha-value>');
      expect(colours[name], `colours.${name}`).toMatch(/^hsl\(var\(--ws-[a-z0-9-]+-hsl\) \//);
    }
  });

  it('still resolves a colour utility with no modifier', async () => {
    const css = await compile(['bg-bg', 'text-fg', 'border-line']);
    expect(css).toContain('hsl(var(--ws-bg-hsl)');
    expect(css).toContain('hsl(var(--ws-fg-hsl)');
    expect(css).toContain('hsl(var(--ws-border-hsl)');
  });

  it('compiles every /NN colour class the site actually uses', async () => {
    const classes = findModifiedColourClasses();

    // Guards the sweep against passing vacuously: if the scanner stops finding
    // classes (a glob that no longer matches, a renamed colour) this fails
    // rather than quietly asserting nothing. Ten uses across six distinct
    // classes today — the nav's two, the ghost button's and the FAQ panel's
    // shared `bg-bg-elevated/60`, the footer's three, the empty
    // testimonial card's one.
    expect(classes.length).toBeGreaterThanOrEqual(6);

    const css = await compile(classes.map((c) => c.cls));
    for (const { cls, modifier } of classes) {
      expect(css, `${cls} emitted no rule`).toContain(selectorFor(cls));
      expect(css, `${cls} lost its alpha`).toContain(`-hsl) / ${alphaFor(modifier)})`);
    }
  });

  it('resolves the sticky nav\u2019s own translucency', async () => {
    const { container } = render(<SiteNav />);
    const header = container.querySelector('header');
    const classes = (header?.className ?? '').split(/\s+/).filter(Boolean);

    // The two the bug was visible on: without them the bar is fully
    // transparent over the moving hero rather than a blurred 80%.
    expect(classes).toContain('bg-bg/80');
    expect(classes).toContain('border-line/70');

    const css = await compile(classes);
    expect(css).toContain('.bg-bg\\/80');
    expect(css).toContain('hsl(var(--ws-bg-hsl) / 0.8)');
    expect(css).toContain('.border-line\\/70');
    expect(css).toContain('hsl(var(--ws-border-hsl) / 0.7)');
  });
});
