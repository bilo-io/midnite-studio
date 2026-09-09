import type { StudioPalette } from '../theme-types';

/**
 * Solarized Light — Ethan Schoonover's light variant. All sixteen `terminal`
 * ANSI colours follow Solarized's own documented terminal mapping (published
 * on ethanschoonover.com/solarized): `base02`/`base03` fill the black slots,
 * `base00`/`base01`/`base0`/`base1` fill the bright yellow/green/blue/cyan
 * slots (Solarized deliberately reuses its greyscale for half the ANSI
 * table), and the eight named accents fill the rest. `chrome` is derived
 * from the same base03..base3/accent table; Solarized's light mode only
 * defines two background-adjacent greys (`base2`/`base3`), so several chrome
 * surfaces below intentionally share one of those two values, same as the
 * palette's own famously narrow light-mode contrast range.
 */
export const solarizedLight = {
  id: 'solarized-light',
  label: 'Solarized Light',
  appearance: 'light',
  chrome: {
    '--background': '44 86.7% 94.1%',
    '--foreground': '196 12.9% 45.5%',
    '--card': '46 42.4% 88.4%',
    '--card-foreground': '196 12.9% 45.5%',
    '--primary': '205 69.4% 48.6%',
    '--primary-foreground': '44 86.7% 94.1%',
    '--secondary': '46 42.4% 88.4%',
    '--secondary-foreground': '194 14.1% 40.2%',
    '--muted': '46 42.4% 88.4%',
    '--muted-foreground': '180 6.9% 60.4%',
    '--accent': '46 42.4% 88.4%',
    '--accent-foreground': '194 14.1% 40.2%',
    '--destructive': '1 71.2% 52.4%',
    '--destructive-foreground': '44 86.7% 94.1%',
    '--success': '68 100% 30%',
    '--success-foreground': '44 86.7% 94.1%',
    '--popover': '44 86.7% 94.1%',
    '--popover-foreground': '196 12.9% 45.5%',
    '--border': '180 6.9% 60.4%',
    '--input': '180 6.9% 60.4%',
    '--ring': '205 69.4% 48.6%',
  },
  terminal: {
    background: '#fdf6e3',
    foreground: '#657b83',
    cursor: '#586e75',
    cursorAccent: '#fdf6e3',
    selectionBackground: '#eee8d5',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
  editor: {
    base: 'vs',
    rules: [
      { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' },
      { token: 'string', foreground: '2aa198' },
      { token: 'number', foreground: 'cb4b16' },
      { token: 'type', foreground: 'b58900' },
      { token: 'function', foreground: '268bd2' },
      { token: 'variable', foreground: '6c71c4' },
    ],
    colors: {
      'editor.background': '#fdf6e3',
      'editor.foreground': '#657b83',
      'editorLineNumber.foreground': '#93a1a1',
      'editorLineNumber.activeForeground': '#586e75',
      'editorCursor.foreground': '#586e75',
      'editor.selectionBackground': '#eee8d5',
      'editor.lineHighlightBackground': '#eee8d5',
      'editorGutter.background': '#fdf6e3',
    },
  },
  highlight: 'solarized-light',
} as const satisfies StudioPalette;
