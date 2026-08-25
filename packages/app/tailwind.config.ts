import type { Config } from 'tailwindcss';

/**
 * Tailwind config for the renderer.
 *
 * `@bilo-io/ui` and `@bilo-io/shell` ship **only token CSS variables** — no
 * compiled utility stylesheet and no Tailwind preset. The consuming app runs
 * Tailwind itself and generates the utility classes the library components use,
 * keyed off those tokens.
 *
 * Which makes the `content` globs load-bearing in a way that is easy to miss:
 * Tailwind only emits a class it has SEEN in a scanned file, and the library's
 * layout classes live inside its published `dist/*.js`. Miss either glob and the
 * build stays green, the app renders, and the layout silently collapses — no
 * error anywhere, only a screenshot shows it. Scanning `node_modules` for class
 * names is a CSS-generation concern, not a module import, so this does not
 * cross the package boundary the eslint rules enforce.
 *
 * The token→hsl map is copied from ~/Dev/midnite-ui/packages/docs/tailwind.config.ts,
 * which is itself the canonical mapping from packages/ui/tailwind.config.ts.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@bilo-io/ui/dist/**/*.js',
    './node_modules/@bilo-io/shell/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      /**
       * The motion vocabulary. Two keyframes cover every animated entrance in
       * the app: a plain fade for containers, and a fade with a 3px rise for
       * list items, which reads as "arriving" without the travel being loud
       * enough to notice on the tenth repeat.
       *
       * `both` fill mode matters — list items are staggered by an
       * `animation-delay`, and without a backwards fill they paint at full
       * opacity for the length of their own delay before snapping to
       * transparent and fading in. That flash is the whole bug the cascade is
       * meant to avoid.
       *
       * Every duration lives in the 160-220ms band and every curve is
       * ease-in-out, so nothing in the UI moves on a timing the rest doesn't
       * share. `html[data-motion='reduced']` (set by applyMotion in app.tsx)
       * disarms all of it via the shell's appearance.css reset.
       */
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(3px)' },
          to: { opacity: '1', transform: 'none' },
        },
        /**
         * The halo around a branch's status dot. Scale and opacity only — both
         * are compositor-only properties, so a dot per repository row costs
         * nothing on the main thread, which a `box-shadow` animation would not.
         */
        'halo-breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.7)', opacity: '0.12' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-in-out both',
        'fade-in-up': 'fade-in-up 180ms ease-in-out both',
        /**
         * The one ambient loop in the app, and the only animation outside the
         * 160-220ms entrance band. It is not an entrance: it marks the live
         * checkout for as long as the sidebar is open, so it has to breathe
         * slowly enough to read as a state rather than a notification. Reduced
         * motion stops it dead along with everything else.
         */
        'halo-breathe': 'halo-breathe 2600ms ease-in-out infinite',
      },
      transitionTimingFunction: {
        // Tailwind's default `transition` curve is cubic-bezier(0.4,0,0.2,1)
        // already; naming it makes `ease-in-out` the explicit house style at
        // every call site rather than an accident of the default.
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
        // The wordmark face. Declared as a var in styles.css so the @font-face
        // and the utility stay in one place; keep the three in sync.
        brand: ['var(--font-brand)', 'sans-serif'],
      },
    },
  },
};

export default config;
