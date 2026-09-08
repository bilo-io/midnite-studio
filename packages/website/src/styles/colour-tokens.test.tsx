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
    // rather than quietly asserting nothing. Four distinct classes today — the
    // nav's two, the ghost button's and the FAQ panel's shared
    // `bg-bg-elevated/60`, and the empty testimonial card's
    // `bg-bg-elevated/40`.
    //
    // It was six until the footer's wordmark comment stopped naming
    // `from-fg/25 via-accent/40` as the thing it was avoiding. The scanner
    // reads raw source, comments included, so those two were counted as uses
    // and never were — which is the same trap this floor exists to catch, one
    // level up. If it rises again, check that the new classes are in markup.
    expect(classes.length).toBeGreaterThanOrEqual(4);

    const css = await compile(classes.map((c) => c.cls));
    for (const { cls, modifier } of classes) {
      expect(css, `${cls} emitted no rule`).toContain(selectorFor(cls));
      expect(css, `${cls} lost its alpha`).toContain(`-hsl) / ${alphaFor(modifier)})`);
    }
  });

  it('resolves the same light colours from data-theme="light" and from .ws-auto-light', () => {
    // tokens.css declares the light triplets once, under a single rule whose
    // selector list is `:root[data-theme="light"], :root.ws-auto-light` (see
    // its file-level comment) \u2014 an explicit choice reaches the first
    // selector, a resolved `system` preference the second, and neither is a
    // copy of the other. `vite`'s CSS pipeline returns an empty module for a
    // `.css` import under Vitest's SSR transform (true even with `?raw`), so
    // this cannot read tokens.css's text directly; instead it reproduces the
    // exact selector list (values copied from tokens.css) in a real
    // stylesheet and lets jsdom's own cascade resolve both selectors \u2014 which
    // is the mechanism the theme toggle actually depends on working.
    const style = document.createElement('style');
    style.textContent = `
      :root[data-theme='light'], :root.ws-auto-light {
        --ws-bg-hsl: 240 20% 99%;
        --ws-accent-hsl: 265 62% 48%;
      }
    `;
    document.head.appendChild(style);
    const root = document.documentElement;

    try {
      root.setAttribute('data-theme', 'light');
      const viaAttribute = getComputedStyle(root).getPropertyValue('--ws-bg-hsl').trim();
      root.removeAttribute('data-theme');

      root.classList.add('ws-auto-light');
      const viaSystemClass = getComputedStyle(root).getPropertyValue('--ws-bg-hsl').trim();

      expect(viaAttribute).toBe('240 20% 99%');
      expect(viaSystemClass).toBe('240 20% 99%');
      expect(viaAttribute).toBe(viaSystemClass);
    } finally {
      root.removeAttribute('data-theme');
      root.classList.remove('ws-auto-light');
      style.remove();
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

/* -------------------------------------------------------------------------- */
/*  The rainbow                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The stylesheets themselves, as text, parsed with postcss.
 *
 * `site.css` cannot be compiled here the way the utilities above are — it opens
 * with `@import './tokens.css'`, which needs postcss-import, and running the
 * whole Tailwind pipeline would only put the same declarations back in a
 * different order. What these assertions are about is the *authored* CSS: that
 * the tokens exist, that the pulse is declared once and gated in the two places
 * it has to be, and that its amplitude is the restrained one. So the files are
 * parsed rather than compiled, and walked as a tree rather than matched with a
 * regex, which is what makes "inside a reduced-motion query" a thing a test can
 * actually tell apart from "next to one".
 */
const STYLESHEETS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./*.css', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  ).map(([path, css]) => [path.replace('./', ''), css]),
);

const sheet = (name: string): string => {
  const css = STYLESHEETS[name];
  if (css === undefined) throw new Error(`no ${name} — the glob stopped matching`);
  return css;
};

/** Every at-rule wrapping a node, innermost last, as `name params` strings. */
const enclosing = (node: postcss.Node): string[] => {
  const chain: string[] = [];
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (at.type === 'atrule') chain.unshift(`${(at as postcss.AtRule).name} ${(at as postcss.AtRule).params}`);
  }
  return chain;
};

/**
 * The custom properties in effect for one theme.
 *
 * The light theme is the dark one with the light rule laid over it — which is
 * how the cascade reads it, and the reason that rule only has to redeclare the
 * triplets it changes.
 *
 * The light rule is a **selector**, `:root[data-theme='light'], :root.ws-auto-light`,
 * not a `prefers-color-scheme` media query: #285's theme switcher resolves the
 * system preference in JS and stamps a class, so the light values live in one
 * place rather than two. Matched by name rather than by "is it inside a media
 * query", which is what that switcher changed underneath this.
 */
const LIGHT_SELECTOR = ":root[data-theme='light']";

const tokensFor = (theme: 'dark' | 'light'): Map<string, string> => {
  const declarations = new Map<string, string>();
  let sawLight = false;

  postcss.parse(sheet('tokens.css')).walkRules((rule) => {
    if (enclosing(rule).some((query) => query.includes('prefers-reduced-motion'))) return;

    const isBase = rule.selectors.includes(':root');
    const isLight = rule.selectors.includes(LIGHT_SELECTOR);
    if (isLight) sawLight = true;
    if (!isBase && !isLight) return;
    if (isLight && theme !== 'light') return;

    rule.walkDecls(/^--ws-/, (decl) => {
      declarations.set(decl.prop, decl.value.trim());
    });
  });

  // Without this the light assertions would silently re-test the dark values
  // if the selector were ever renamed again.
  if (!sawLight) throw new Error(`no ${LIGHT_SELECTOR} rule in tokens.css`);
  return declarations;
};

/** `350 89% 60%` → sRGB in 0..1. */
const hslToRgb = (triplet: string): [number, number, number] => {
  const match = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(triplet);
  if (match === null) throw new Error(`not an HSL triplet: ${triplet}`);
  const [hue, saturation, lightness] = [
    Number(match[1]),
    Number(match[2]) / 100,
    Number(match[3]) / 100,
  ];
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base: [number, number, number] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][Math.floor(sector) % 6] as [number, number, number];
  const lift = lightness - chroma / 2;
  return [base[0] + lift, base[1] + lift, base[2] + lift];
};

/**
 * Resolve a token to an HSL triplet.
 *
 * Two forms appear: a bare triplet (`--ws-bg-hsl`) and a colour derived from
 * one (`--ws-rainbow-ink: hsl(var(--ws-bg-sunken-hsl))`, or a literal
 * `hsl(0 0% 100%)`). Both have to be followed, because the ink is declared each
 * way in one theme apiece.
 */
const tripletFor = (tokens: Map<string, string>, prop: string): string => {
  const value = tokens.get(prop);
  if (value === undefined) throw new Error(`${prop} is not declared`);
  const viaVar = /^hsl\(\s*var\((--ws-[a-z0-9-]+)\)\s*\)$/.exec(value);
  if (viaVar !== null) return tripletFor(tokens, viaVar[1]!);
  const literal = /^hsl\(([^)]+)\)$/.exec(value);
  return (literal !== null ? literal[1]! : value).trim();
};

/** WCAG 2.1 relative luminance. */
const luminance = (triplet: string): number => {
  const linear = hslToRgb(triplet).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
};

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

const STOPS = [0, 1, 2, 3, 4, 5] as const;

describe('the rainbow tokens', () => {
  it.each(['dark', 'light'] as const)('declares all six stops, the ramp and the ink (%s)', (theme) => {
    const tokens = tokensFor(theme);
    for (const stop of STOPS) {
      expect(tokens.has(`--ws-rainbow-${stop}-hsl`), `--ws-rainbow-${stop}-hsl`).toBe(true);
      // The derived half is declared once, at bare `:root`, and re-resolves
      // under the light theme from the overridden triplet — so it must be
      // present in both maps and must point at the triplet, not repeat it.
      expect(tokens.get(`--ws-rainbow-${stop}`)).toBe(`hsl(var(--ws-rainbow-${stop}-hsl))`);
      expect(() => hslToRgb(tripletFor(tokens, `--ws-rainbow-${stop}-hsl`))).not.toThrow();
    }
    expect(tokens.get('--ws-rainbow-ramp')).toContain('var(--ws-rainbow-0)');
    // Seven stops, closing on the first: what makes a rotating conic seamless.
    expect(tokens.get('--ws-rainbow-ramp')?.match(/var\(--ws-rainbow-\d\)/g)).toHaveLength(7);
    expect(tokens.has('--ws-rainbow-ink')).toBe(true);
  });

  it('is a blue → violet → pink subspectrum, not the app’s own six stops', () => {
    // Tailwind blue/indigo/violet/purple/fuchsia/pink 500, in increasing hue
    // order (217°→330°) — a website-only re-cut, not a copy of the app's
    // `--rainbow-0..5` (which keeps its full six). Indigo is lifted 1pt of
    // lightness off Tailwind's own value to clear the 4.5:1 floor below.
    const tokens = tokensFor('dark');
    expect(STOPS.map((stop) => tripletFor(tokens, `--ws-rainbow-${stop}-hsl`))).toEqual([
      '217 91% 60%',
      '239 84% 68%',
      '258 90% 66%',
      '271 91% 65%',
      '292 84% 61%',
      '330 81% 60%',
    ]);
  });

  it('stays inside the blue-to-pink range — no green, yellow, orange or red', () => {
    const tokens = tokensFor('dark');
    const hues = STOPS.map((stop) => {
      const triplet = tripletFor(tokens, `--ws-rainbow-${stop}-hsl`);
      return Number(/^(-?[\d.]+)/.exec(triplet)?.[1]);
    });
    for (const hue of hues) {
      expect(hue, `hue ${hue} is outside 217°–330°`).toBeGreaterThanOrEqual(217);
      expect(hue, `hue ${hue} is outside 217°–330°`).toBeLessThanOrEqual(330);
    }
  });

  it.each(['dark', 'light'] as const)(
    'keeps every stop legible as gradient text (%s)',
    (theme) => {
      const tokens = tokensFor(theme);
      const background = tripletFor(tokens, '--ws-bg-hsl');
      for (const stop of STOPS) {
        const ratio = contrast(tripletFor(tokens, `--ws-rainbow-${stop}-hsl`), background);
        expect(ratio, `--ws-rainbow-${stop} on --ws-bg is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(['dark', 'light'] as const)('keeps the ink legible on every stop (%s)', (theme) => {
    const tokens = tokensFor(theme);
    const ink = tripletFor(tokens, '--ws-rainbow-ink');
    for (const stop of STOPS) {
      const ratio = contrast(ink, tripletFor(tokens, `--ws-rainbow-${stop}-hsl`));
      expect(ratio, `ink on --ws-rainbow-${stop} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the neon pulse', () => {
  const site = () => postcss.parse(sheet('site.css'));

  /** Every rule whose selector mentions `.ws-neon`, with its at-rule chain. */
  const neonRules = () => {
    const found: { selector: string; at: string[]; decls: Map<string, string> }[] = [];
    site().walkRules((rule) => {
      if (!rule.selector.includes('.ws-neon')) return;
      const decls = new Map<string, string>();
      rule.walkDecls((decl) => {
        decls.set(decl.prop, decl.value.trim());
      });
      found.push({ selector: rule.selector, at: enclosing(rule), decls });
    });
    return found;
  };

  it('declares the utility, with a resting glow and the pulse', () => {
    const base = neonRules().find((rule) => rule.at.some((query) => query.startsWith('layer utilities')));
    expect(base, '.ws-neon is not declared in @layer utilities').not.toBeUndefined();
    expect(base?.decls.get('animation')).toContain('ws-neon-pulse');
    // The resting shadow is the mid-cycle value — what a visitor sees when the
    // animation is disarmed. Without it, reduced motion means no glow at all.
    expect(base?.decls.get('box-shadow')).toContain('var(--ws-neon-color)');
    expect(base?.decls.get('--ws-neon-color')).toContain('var(--ws-angle)');
    // The hue is the angle's; the saturation and lightness are the theme's, so
    // the light theme can dial the same glow down to a coloured shadow.
    expect(base?.decls.get('--ws-neon-color')).toContain('var(--ws-neon-sat)');
    expect(base?.decls.get('--ws-neon-color')).toContain('var(--ws-neon-lum)');
    for (const theme of ['dark', 'light'] as const) {
      const tokens = tokensFor(theme);
      expect(tokens.get('--ws-neon-sat'), `--ws-neon-sat (${theme})`).toMatch(/^\d+%$/);
      expect(tokens.get('--ws-neon-lum'), `--ws-neon-lum (${theme})`).toMatch(/^\d+%$/);
    }
    expect(base?.decls.get('will-change')).toBe('box-shadow');
  });

  it('is applied to at most four surfaces, so the page never reads as a casino', () => {
    // The button, the active nav tab's underline, the hero's logo halo and the
    // early-access field while focused. Adding a fifth is a design decision,
    // not a refactor, so it has to come past this number.
    const users = Object.entries(SOURCES).filter(([, source]) => /\bws-neon\b/.test(source));
    expect(users.map(([path]) => path).sort()).toEqual([
      '../components/button.tsx',
      '../sections/early-access/early-access.tsx',
      '../sections/hero/hero.tsx',
    ]);
    // The fourth is the nav tab, which takes the glow on a pseudo-element and so
    // names no class in the markup at all.
    expect(sheet('site.css')).toContain(".ws-nav-tab[data-active='true']::after");
  });

  it('breathes gently: 12px to 24px, 0.35 to 0.6, over 3.2 seconds', () => {
    const base = neonRules().find((rule) => rule.at.some((query) => query.startsWith('layer utilities')));
    expect(base?.decls.get('animation')).toContain('3.2s');

    let pulse: postcss.AtRule | undefined;
    site().walkAtRules('keyframes', (at) => {
      if (at.params === 'ws-neon-pulse') pulse = at;
    });
    expect(pulse, '@keyframes ws-neon-pulse is missing').toBeDefined();

    const shadows: string[] = [];
    pulse?.walkDecls('box-shadow', (decl) => {
      shadows.push(decl.value);
    });
    expect(shadows).toHaveLength(2);
    const [rest, peak] = shadows;
    expect(rest).toContain('12px');
    expect(rest).toContain('35%');
    expect(peak).toContain('24px');
    expect(peak).toContain('60%');
    // Never off, never opaque: every mix stays inside a narrow band, and the
    // amplitude is the whole difference between "premium" and "flashing".
    const mixes = shadows
      .flatMap((shadow) => [...shadow.matchAll(/(\d+)%/g)])
      .map((match) => Number(match[1]));
    expect(mixes.length).toBeGreaterThanOrEqual(4);
    for (const mix of mixes) {
      expect(mix, `a ${mix}% glow is outside the calm band`).toBeGreaterThanOrEqual(25);
      expect(mix, `a ${mix}% glow is outside the calm band`).toBeLessThanOrEqual(70);
    }
  });

  it('drops the compositor hint under prefers-reduced-motion', () => {
    const reduced = neonRules().filter((rule) =>
      rule.at.some((query) => query.includes('prefers-reduced-motion: reduce')),
    );
    expect(reduced, '.ws-neon is not mentioned under a reduced-motion query').not.toHaveLength(0);
    expect(reduced.some((rule) => rule.decls.get('will-change') === 'auto')).toBe(true);

    // The animation itself is disarmed by tokens.css, for the whole site at
    // once — so the guard belongs there, not on this utility.
    const tokens = postcss.parse(sheet('tokens.css'));
    let disarmed = false;
    tokens.walkAtRules('media', (at) => {
      if (!at.params.includes('prefers-reduced-motion: reduce')) return;
      at.walkDecls('animation-duration', () => {
        disarmed = true;
      });
    });
    expect(disarmed, 'tokens.css no longer zeroes animation-duration').toBe(true);
  });

  it('pauses everything infinite while the tab is hidden', () => {
    const paused = new Set<string>();
    site().walkRules((rule) => {
      if (!rule.selector.includes("html[data-page-hidden='true']")) return;
      rule.walkDecls('animation-play-state', (decl) => {
        if (decl.value.trim() === 'paused') {
          for (const selector of rule.selectors) paused.add(selector);
        }
      });
    });
    expect([...paused].some((selector) => selector.includes('.ws-neon'))).toBe(true);
    expect([...paused].some((selector) => selector.includes('.ws-marquee-track'))).toBe(true);
  });
});

describe('the rainbow text drift', () => {
  const site = () => postcss.parse(sheet('site.css'));

  /** Every rule whose selector mentions `.ws-rainbow-text`, with its at-rule chain. */
  const rainbowTextRules = () => {
    const found: { selector: string; at: string[]; decls: Map<string, string> }[] = [];
    site().walkRules((rule) => {
      if (!rule.selector.includes('.ws-rainbow-text')) return;
      const decls = new Map<string, string>();
      rule.walkDecls((decl) => {
        decls.set(decl.prop, decl.value.trim());
      });
      found.push({ selector: rule.selector, at: enclosing(rule), decls });
    });
    return found;
  };

  it('drifts the ramp via background-position, not a re-declared gradient', () => {
    const base = rainbowTextRules().find((rule) =>
      rule.at.some((query) => query.startsWith('layer utilities')),
    );
    expect(base, '.ws-rainbow-text is not declared in @layer utilities').not.toBeUndefined();
    expect(base?.decls.get('animation')).toContain('ws-rainbow-drift');
    expect(base?.decls.get('background-size')).toBe('200% 100%');

    let drift: postcss.AtRule | undefined;
    site().walkAtRules('keyframes', (at) => {
      if (at.params === 'ws-rainbow-drift') drift = at;
    });
    expect(drift, '@keyframes ws-rainbow-drift is missing').toBeDefined();
    // The one declaration in the keyframe, so the browser repositions an
    // existing paint rather than recomputing the six-stop gradient.
    const props = new Set<string>();
    drift?.walkDecls((decl) => props.add(decl.prop));
    expect([...props]).toEqual(['background-position']);
  });

  it('falls back to a single, uncropped pass under prefers-reduced-motion', () => {
    const reduced = rainbowTextRules().filter((rule) =>
      rule.at.some((query) => query.includes('prefers-reduced-motion: reduce')),
    );
    expect(reduced, '.ws-rainbow-text is not mentioned under a reduced-motion query').not.toHaveLength(
      0,
    );
    // Resets the crop `background-size: 200% 100%` puts in place, so a
    // reduced-motion visitor sees the full ramp across the text, not half of
    // it frozen mid-drift.
    expect(reduced.some((rule) => rule.decls.get('background-size') === 'auto')).toBe(true);
  });

  it('pauses while the tab is hidden, alongside the rest of the rainbow', () => {
    const paused = new Set<string>();
    site().walkRules((rule) => {
      if (!rule.selector.includes("html[data-page-hidden='true']")) return;
      rule.walkDecls('animation-play-state', (decl) => {
        if (decl.value.trim() === 'paused') {
          for (const selector of rule.selectors) paused.add(selector);
        }
      });
    });
    expect([...paused].some((selector) => selector.includes('.ws-rainbow-text'))).toBe(true);
  });
});
