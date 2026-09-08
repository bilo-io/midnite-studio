import type { Config } from 'tailwindcss';

/**
 * Tailwind for the marketing site.
 *
 * Unlike the renderer's config this one owns no design system: every colour,
 * radius, shadow and duration below is a *reference* to a custom property
 * declared in `src/styles/tokens.css`. That indirection is what makes the light
 * variant a media query in one file rather than a `dark:` prefix on every
 * element — the tokens flip, the utilities do not change.
 *
 * The site has no `darkMode` strategy for the same reason: it is dark-first and
 * follows `prefers-color-scheme`, with no in-page theme switch to key a class
 * off. Wave 2 sections should reach for these utility names and never a hex.
 *
 * **Colours go through `channel()`, and that is not cosmetic.** A colour
 * declared as the finished string `var(--ws-bg)` is opaque to Tailwind: it has
 * nowhere to insert an alpha, so every opacity modifier on it — `bg-bg/80`,
 * `border-line/70`, `from-fg/25` — is dropped and **emits no rule at all**.
 * Not a wrong opacity: no declaration, so the element keeps whatever it had.
 * That is how the sticky nav shipped fully transparent over the hero instead of
 * 80% opaque, and how `Button`'s ghost variant lost its fill. So `tokens.css`
 * declares each colour as a bare channel triplet (`--ws-bg-hsl: 240 18% 6%`)
 * and this config wraps it in the `hsl()` itself, leaving Tailwind's
 * `<alpha-value>` placeholder where the alpha belongs. Tailwind substitutes `1`
 * for a bare utility and the modifier's fraction for a sliced one.
 *
 * Adding a colour therefore means three edits, all required: the `--ws-*-hsl`
 * triplet, the derived `--ws-*` for hand-written CSS, and a `channel()` entry
 * here. `colour-tokens.test.ts` compiles this config against every class in
 * `src/` and fails if an opacity modifier resolves to nothing.
 */

/**
 * One colour token, sliceable.
 *
 * `channel('bg')` → `hsl(var(--ws-bg-hsl) / <alpha-value>)`. The token name is
 * the `--ws-` suffix, not the Tailwind utility name — `line` maps to
 * `--ws-border-hsl`, so the two vocabularies stay independent.
 */
const channel = (token: string) => `hsl(var(--ws-${token}-hsl) / <alpha-value>)`;
const config: Config = {
  content: ['./index.html', './download/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: channel('bg'),
        'bg-elevated': channel('bg-elevated'),
        'bg-sunken': channel('bg-sunken'),
        fg: channel('fg'),
        'fg-muted': channel('fg-muted'),
        'fg-subtle': channel('fg-subtle'),
        line: channel('border'),
        'line-strong': channel('border-strong'),
        accent: channel('accent'),
        'accent-fg': channel('accent-fg'),
        'accent-soft': channel('accent-soft'),
        // The commit graph's lane palette, for decoration only — the hero's
        // background grid draws its edges in these so the site's one piece of
        // motion is recognisably the product's own.
        'lane-1': channel('lane-1'),
        'lane-2': channel('lane-2'),
        'lane-3': channel('lane-3'),
        'lane-4': channel('lane-4'),
      },
      borderRadius: {
        sm: 'var(--ws-radius-sm)',
        md: 'var(--ws-radius-md)',
        lg: 'var(--ws-radius-lg)',
        full: 'var(--ws-radius-full)',
      },
      boxShadow: {
        glow: 'var(--ws-glow-accent)',
        'glow-soft': 'var(--ws-glow-soft)',
        'glow-lane': 'var(--ws-glow-lane)',
        // Lanes 2-4 of the same set. `glow-lane` is lane 1, kept under its
        // original name so nothing that already uses it has to change.
        'glow-lane-2': 'var(--ws-glow-lane-2)',
        'glow-lane-3': 'var(--ws-glow-lane-3)',
        'glow-lane-4': 'var(--ws-glow-lane-4)',
      },
      transitionDuration: {
        fast: 'var(--ws-dur-fast)',
        base: 'var(--ws-dur-base)',
        slow: 'var(--ws-dur-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ws-ease)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Inter',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      maxWidth: {
        prose: '65ch',
      },
    },
  },
};

export default config;
