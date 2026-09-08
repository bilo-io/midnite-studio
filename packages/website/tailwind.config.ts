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
 */
const config: Config = {
  content: ['./index.html', './download/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--ws-bg)',
        'bg-elevated': 'var(--ws-bg-elevated)',
        'bg-sunken': 'var(--ws-bg-sunken)',
        fg: 'var(--ws-fg)',
        'fg-muted': 'var(--ws-fg-muted)',
        'fg-subtle': 'var(--ws-fg-subtle)',
        line: 'var(--ws-border)',
        'line-strong': 'var(--ws-border-strong)',
        accent: 'var(--ws-accent)',
        'accent-fg': 'var(--ws-accent-fg)',
        'accent-soft': 'var(--ws-accent-soft)',
        // The commit graph's lane palette, for decoration only — the hero's
        // background grid draws its edges in these so the site's one piece of
        // motion is recognisably the product's own.
        'lane-1': 'var(--ws-lane-1)',
        'lane-2': 'var(--ws-lane-2)',
        'lane-3': 'var(--ws-lane-3)',
        'lane-4': 'var(--ws-lane-4)',
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
