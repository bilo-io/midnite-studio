import type { FontWeight } from '@xterm/xterm';

/**
 * The terminal's font metrics, written down explicitly (Phase 51 Theme B).
 *
 * Every one of these was previously an xterm default arrived at by
 * omission — `fontSize: 12` was the only metric this repo ever set, with no
 * `lineHeight`, `letterSpacing`, `fontWeight` or `fontWeightBold` anywhere,
 * so xterm computed a fractional cell height the WebGL renderer rounds
 * *per row*, worst at small sizes. The defaults below are xterm's own, so
 * writing them down changes no existing pane's rendering — it only makes
 * each one a decision this repo owns, and a thing `terminalFontOptions`'
 * own test can assert, rather than an implicit fact about whatever version
 * of xterm happens to be installed.
 */

export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"MesloLGS NF", "Hack Nerd Font Mono", "JetBrainsMono Nerd Font Mono", "FiraCode Nerd Font Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
export const DEFAULT_TERMINAL_FONT_SIZE = 12;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1;

export const TERMINAL_FONT_SIZE_MIN = 9;
export const TERMINAL_FONT_SIZE_MAX = 20;
export const TERMINAL_LINE_HEIGHT_MIN = 1;
export const TERMINAL_LINE_HEIGHT_MAX = 1.6;

/** The three metrics `Settings ▸ Terminal` exposes — `fontFamily: ''` means "unset, use the default". */
export type TerminalFontSettings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

/**
 * The full set xterm's constructor (and live `term.options` writes) take —
 * `letterSpacing`/`fontWeight`/`fontWeightBold` are repo-owned decisions,
 * not user-facing settings, which is why they have no counterpart above.
 */
export type TerminalFontOptions = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: FontWeight;
  fontWeightBold: FontWeight;
};

/**
 * Resolves a (possibly partial, possibly blank) settings object into a
 * complete options object with no `undefined` fields — every key is either
 * the user's explicit value or its documented default, never a gap left for
 * xterm's own implicit one. An empty `fontFamily` (the Settings field's
 * "unset" state) falls back to the Nerd Font stack, not to an empty string.
 */
export function terminalFontOptions(settings: Partial<TerminalFontSettings>): TerminalFontOptions {
  const fontFamily = settings.fontFamily?.trim() ? settings.fontFamily : DEFAULT_TERMINAL_FONT_FAMILY;
  const fontSize = settings.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
  const lineHeight = settings.lineHeight ?? DEFAULT_TERMINAL_LINE_HEIGHT;
  return {
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing: 0,
    fontWeight: 'normal',
    fontWeightBold: 'bold',
  };
}
