import type { editor } from 'monaco-editor';
import type { BundledTheme } from 'shiki';

import type { ITheme } from '@xterm/xterm';

/**
 * The 22 CSS custom properties `@bilo-io/ui/dist/tokens.css` defines — the
 * full `chrome` surface a `StudioPalette` can retint. `--radius` is a bare
 * length (`0.5rem`), not a colour — `tailwind.config.ts` consumes it as
 * `var(--radius)`, never `hsl(var(--radius))` — so no built-in preset sets it;
 * it exists in the union for completeness and for a future importer that
 * genuinely wants to touch it.
 */
export const STUDIO_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--success',
  '--success-foreground',
  '--popover',
  '--popover-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
] as const;

export type StudioToken = (typeof STUDIO_TOKENS)[number];

/**
 * A palette dimension orthogonal to `@bilo-io/ui`'s `ThemeProvider` (Decision
 * 7) — light/dark, `system` and `time` stay that library's job; this reaches
 * the five surfaces the app actually paints code and chrome on: the app
 * chrome itself, xterm, Monaco, the read-only Shiki preview, and (via the
 * same Shiki instance) diff rows and slide code blocks.
 */
export type StudioPalette = {
  id: string;
  label: string;
  /** Which of `@bilo-io/ui`'s two resolved modes this palette is designed against. */
  appearance: 'dark' | 'light';
  /**
   * `Partial` because a palette need not restate every token — `use-palette-
   * sync.ts` clears (via `removeProperty`) any token it omits, restoring
   * `@bilo-io/ui`'s own value rather than stranding a previous palette's.
   * Values are HSL triplets without the `hsl()` wrapper (`"240 6% 10%"`),
   * matching `tailwind.config.ts`'s `hsl(var(--token))` wrapping.
   */
  chrome: Partial<Record<StudioToken, string>>;
  /** The full xterm shape, including all 16 ANSI keys — net-new; today's
   * `DARK_THEME`/`LIGHT_THEME` in `terminal-view.tsx` have four keys and no
   * ANSI palette at all. */
  terminal: ITheme;
  /** The `monaco.editor.defineTheme` payload. */
  editor: {
    base: 'vs' | 'vs-dark' | 'hc-black';
    rules: editor.ITokenThemeRule[];
    colors: Record<string, string>;
  };
  /** The fifth surface (Decision 8) — the bundled Shiki theme id this palette
   * maps to, for the read-only preview, diff rows and slide code blocks. */
  highlight: BundledTheme;
};

const HSL_TRIPLET = /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/;

/** Whether a string is an HSL triplet without the `hsl()` wrapper (`"240 6% 10%"`). */
export function isHslTriplet(value: string): boolean {
  return HSL_TRIPLET.test(value);
}

/** The 16 ANSI keys an `ITheme` must carry for a palette to be complete. */
export const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const satisfies readonly (keyof ITheme)[];
