import type { StudioPalette } from '../theme-types';

/**
 * Tokyo Night — the "Night" variant of folke/tokyonight.nvim (the darkest of
 * its four variants; Storm/Moon/Day are siblings). `terminal` is copied
 * verbatim from the project's own published Alacritty scheme
 * (`extras/alacritty/tokyonight_night.toml`); `chrome` and `editor` are
 * derived from the same `night.lua` palette (which itself extends
 * `storm.lua`, overriding only `bg`/`bg_dark`/`bg_dark1`).
 */
export const tokyoNight = {
  id: 'tokyo-night',
  label: 'Tokyo Night',
  appearance: 'dark',
  chrome: {
    '--background': '235 18.8% 12.5%',
    '--foreground': '229 72.6% 85.7%',
    '--card': '228 23.4% 21%',
    '--card-foreground': '229 72.6% 85.7%',
    '--primary': '221 88.7% 72.4%',
    '--primary-foreground': '240 15.4% 10.2%',
    '--secondary': '229 23.1% 33.1%',
    '--secondary-foreground': '229 72.6% 85.7%',
    '--muted': '229 24.4% 30.6%',
    '--muted-foreground': '229 22.9% 43.7%',
    '--accent': '220 32.5% 33.1%',
    '--accent-foreground': '229 72.6% 85.7%',
    '--destructive': '349 89% 71.6%',
    '--destructive-foreground': '240 15.4% 10.2%',
    '--success': '89 50.5% 61.2%',
    '--success-foreground': '240 15.4% 10.2%',
    '--popover': '240 15.4% 10.2%',
    '--popover-foreground': '229 72.6% 85.7%',
    '--border': '229 24.4% 30.6%',
    '--input': '229 24.4% 30.6%',
    '--ring': '221 88.7% 72.4%',
  },
  terminal: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    cursorAccent: '#1a1b26',
    selectionBackground: '#283457',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#ff899d',
    brightGreen: '#9fe044',
    brightYellow: '#faba4a',
    brightBlue: '#8db0ff',
    brightMagenta: '#c7a9ff',
    brightCyan: '#a4daff',
    brightWhite: '#c0caf5',
  },
  editor: {
    base: 'vs-dark',
    rules: [
      { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'bb9af7' },
      { token: 'string', foreground: '9ece6a' },
      { token: 'number', foreground: 'ff9e64' },
      { token: 'type', foreground: '2ac3de' },
      { token: 'function', foreground: '7aa2f7' },
      { token: 'variable', foreground: 'c0caf5' },
    ],
    colors: {
      'editor.background': '#1a1b26',
      'editor.foreground': '#a9b1d6',
      'editorLineNumber.foreground': '#3b4261',
      'editorLineNumber.activeForeground': '#c0caf5',
      'editorCursor.foreground': '#c0caf5',
      'editor.selectionBackground': '#283457',
      'editor.lineHighlightBackground': '#292e42',
      'editorGutter.background': '#1a1b26',
    },
  },
  highlight: 'tokyo-night',
} as const satisfies StudioPalette;
