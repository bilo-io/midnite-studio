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
      spacing: {
        // Tailwind's default scale has no `17` — it jumps 14 → 16 → 20 — so
        // `pl-17` (`TREE_INDENT`'s rung 4, Phase 28 Theme B) would silently
        // generate no CSS without this. 4.25rem = 68px continues the ladder's
        // +12px step past `pl-14` (56px) the same way `pl-11`/`pl-14` do.
        17: '4.25rem',
      },
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
       * The stacking order, named — because the numbers alone cannot be
       * reasoned about locally.
       *
       * `@bilo-io/shell` puts its own chrome high: `<TitleBar>` is
       * `fixed ... z-[60]` and `<DragRegion>` is `z-[70]`. Anything this app
       * floats OVER that chrome therefore has to clear 70, and a hand-written
       * `z-50` — the value that reads as "on top" in a plain Tailwind app — is
       * silently BELOW the title bar. That is exactly how the breadcrumb and
       * theme-toggle dropdowns ended up sliding under it.
       *
       * So overlays take these tokens, never a literal:
       *   menu    — dropdowns and context menus anchored to a trigger
       *   popover — richer anchored panels (Popover, the expanded ref badge)
       *   dialog  — modals, whose backdrop is meant to dim the title bar too
       *   toast   — non-modal op notifications (Phase 22 Theme H), above a
       *             dialog's backdrop: an Undo toast for something done
       *             elsewhere must stay visible even while a confirm is open
       *   tooltip — always last, including over a dialog's own controls
       *
       * The gaps are deliberate: a one-off layer can be slotted between two
       * named ones without renumbering the scale, and the whole range stays
       * under the shell's own `z-[200]` full-screen states (lock, screensaver),
       * which are meant to cover the app entirely.
       */
      zIndex: {
        /*
          The full-screen browser pane, and the one entry in here that is NOT
          a portalled layer: it stays inside the content row, but has to paint
          over `@bilo-io/shell`'s nav rail — a `position: fixed`, `z-40`
          element outside this app's tree. 45 clears it and still sits under
          every menu/dialog below, so a context menu raised from inside the
          browser is still on top.
        */
        browser: '45',
        menu: '80',
        popover: '85',
        dialog: '90',
        toast: '92',
        tooltip: '95',
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
        /**
         * The checked-out branch chip's gradient border, sweeping around it.
         *
         * `background-position` on an over-wide linear gradient rather than a
         * rotating conic one: a conic gradient has to be re-rasterised at every
         * angle, and this runs on every visible HEAD chip in a virtualized
         * table for as long as the graph is open. Sliding a background is a
         * compositor job.
         *
         * 200% travel, so the gradient's two ends meet and the loop has no
         * visible seam where it restarts.
         */
        'lane-sweep': {
          from: { backgroundPosition: '0% 50%' },
          to: { backgroundPosition: '200% 50%' },
        },
        /**
         * A terminal session's connection dot, marking it live.
         *
         * `box-shadow` rather than `halo-breathe`'s separate scaled element: the
         * dot is a plain circle with no room for a second layer underneath it in
         * a text-height row, and at 6px the paint cost is negligible even though
         * box-shadow is a main-thread property. The two colour stops
         * (`--pulse-a`/`--pulse-b`) are set inline per state — emerald for open,
         * amber for starting — because the ring is a state colour, not a theme
         * token.
         */
        'dot-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--pulse-a)' },
          '70%': { boxShadow: '0 0 0 4px var(--pulse-b)' },
        },
        /**
         * One dot of the "waiting on you" ellipsis. Three of them share the
         * keyframe and are staggered by a negative `animation-delay`, so the
         * wave is already mid-travel on the first frame instead of starting
         * with all three at rest.
         *
         * Transform and opacity only, for the same reason `halo-breathe` uses
         * them: this runs once per idle agent row, forever.
         */
        'dot-wave': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-2px)', opacity: '1' },
        },
        /**
         * The idle caret. A hard on/off with no in-between — a terminal cursor
         * that fades is a terminal cursor that reads as a loading state, which
         * is exactly the thing the other two glyphs here mean.
         */
        'caret-blink': {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
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
        /**
         * Slow and linear, unlike everything else here. A sweep that eases is a
         * sweep that appears to stop twice per cycle, which turns an ambient
         * marker into something that keeps catching the eye — the opposite of
         * what "you are here" should do while you read the rest of the table.
         *
         * Reduced motion stops it dead, which is why the chip's halo underneath
         * it is styled to stand on its own rather than to be a keyframe's
         * starting position (see `ref-badge.tsx`).
         */
        'lane-sweep': 'lane-sweep 3600ms linear infinite',
        'dot-pulse': 'dot-pulse 1800ms ease-out infinite',
        'dot-wave': 'dot-wave 1200ms ease-in-out infinite',
        // 1060ms rather than a round 1000ms so the caret and the wave beside it
        // in the same list never settle into a shared beat.
        'caret-blink': 'caret-blink 1060ms steps(1, end) infinite',
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
