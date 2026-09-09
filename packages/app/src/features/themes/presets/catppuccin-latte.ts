import type { StudioPalette } from '../theme-types';

/**
 * Catppuccin Latte — the one light flavour of the four Catppuccin ships
 * (Latte/Frappé/Macchiato/Mocha). `terminal` is copied verbatim from the
 * project's own published Alacritty scheme (`catppuccin/alacritty`'s
 * `catppuccin-latte.toml`) — including its documented ANSI 0/7 inversion
 * (`black` is the light `surface1` swatch, `white` is the darker `subtext1`),
 * which is Catppuccin's own deliberate mapping, not an error here. `chrome`
 * and `editor` are derived from `catppuccin/palette`'s Latte colour table.
 */
export const catppuccinLatte = {
  id: 'catppuccin-latte',
  label: 'Catppuccin Latte',
  appearance: 'light',
  chrome: {
    '--background': '220 23.1% 94.9%',
    '--foreground': '234 16% 35.5%',
    '--card': '220 22% 92%',
    '--card-foreground': '234 16% 35.5%',
    '--primary': '220 91.5% 53.9%',
    '--primary-foreground': '220 23.1% 94.9%',
    '--secondary': '223 15.9% 82.7%',
    '--secondary-foreground': '234 16% 35.5%',
    '--muted': '220 20.7% 88.6%',
    '--muted-foreground': '233 10.4% 47.3%',
    '--accent': '225 13.6% 76.9%',
    '--accent-foreground': '234 16% 35.5%',
    '--destructive': '347 86.7% 44.1%',
    '--destructive-foreground': '220 23.1% 94.9%',
    '--success': '109 57.6% 39.8%',
    '--success-foreground': '220 23.1% 94.9%',
    '--popover': '220 22% 92%',
    '--popover-foreground': '234 16% 35.5%',
    '--border': '225 13.6% 76.9%',
    '--input': '225 13.6% 76.9%',
    '--ring': '220 91.5% 53.9%',
  },
  terminal: {
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    cursorAccent: '#eff1f5',
    selectionBackground: '#dc8a78',
    black: '#bcc0cc',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#5c5f77',
    brightBlack: '#acb0be',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#6c6f85',
  },
  editor: {
    base: 'vs',
    rules: [
      { token: 'comment', foreground: '7c7f93', fontStyle: 'italic' },
      { token: 'keyword', foreground: '8839ef' },
      { token: 'string', foreground: '40a02b' },
      { token: 'number', foreground: 'fe640b' },
      { token: 'type', foreground: 'df8e1d' },
      { token: 'function', foreground: '1e66f5' },
      { token: 'variable', foreground: 'dd7878' },
    ],
    colors: {
      'editor.background': '#eff1f5',
      'editor.foreground': '#4c4f69',
      'editorLineNumber.foreground': '#9ca0b0',
      'editorLineNumber.activeForeground': '#4c4f69',
      'editorCursor.foreground': '#dc8a78',
      'editor.selectionBackground': '#ccd0da',
      'editor.lineHighlightBackground': '#e6e9ef',
      'editorGutter.background': '#eff1f5',
    },
  },
  highlight: 'catppuccin-latte',
} as const satisfies StudioPalette;
