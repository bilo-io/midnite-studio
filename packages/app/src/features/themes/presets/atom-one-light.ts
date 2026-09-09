import type { StudioPalette } from '../theme-types';

/**
 * Atom One Light — the light sibling of `atom-one-dark.ts`. `chrome` and
 * `editor` are derived from `atom/one-light-syntax`'s own `colors.less`
 * (mono-1/2/3 and hue-1..hue-6-2), independently confirmed against the
 * community `tinted-theming/schemes` base16 port (`base16/one-light.yaml`),
 * which the two agree on exactly. Atom never published a terminal ANSI
 * scheme for One Light, so `terminal`'s 16 colours are derived from those
 * same swatches; `black`/`white` are oriented for readability against the
 * light background (mirroring this file's own `github-light` convention)
 * rather than a naive dark-terminal default. `highlight` has no exact
 * bundled match — shiki ships `one-light` (Atom's underlying syntax theme,
 * same author, same colours) rather than an id literally named
 * `atom-one-light`.
 */
export const atomOneLight = {
  id: 'atom-one-light',
  label: 'Atom One Light',
  appearance: 'light',
  chrome: {
    '--background': '0 0% 98%',
    '--foreground': '228 8.2% 23.9%',
    '--card': '0 0% 100%',
    '--card-foreground': '228 8.2% 23.9%',
    '--primary': '221 87.3% 60%',
    '--primary-foreground': '0 0% 98%',
    '--secondary': '240 2% 90%',
    '--secondary-foreground': '228 8.2% 23.9%',
    '--muted': '240 3.4% 94.3%',
    '--muted-foreground': '231 3.8% 64.1%',
    '--accent': '240 2% 90%',
    '--accent-foreground': '228 8.2% 23.9%',
    '--destructive': '344 83.6% 43.1%',
    '--destructive-foreground': '0 0% 98%',
    '--success': '119 34.2% 47.1%',
    '--success-foreground': '0 0% 98%',
    '--popover': '0 0% 100%',
    '--popover-foreground': '228 8.2% 23.9%',
    '--border': '240 2% 90%',
    '--input': '240 2% 90%',
    '--ring': '221 87.3% 60%',
  },
  terminal: {
    background: '#fafafa',
    foreground: '#383a42',
    cursor: '#526eff',
    cursorAccent: '#fafafa',
    selectionBackground: '#e5e5e6',
    black: '#383a42',
    red: '#ca1243',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#a0a1a7',
    brightBlack: '#696c77',
    brightRed: '#ca1243',
    brightGreen: '#50a14f',
    brightYellow: '#c18401',
    brightBlue: '#4078f2',
    brightMagenta: '#a626a4',
    brightCyan: '#0184bc',
    brightWhite: '#e5e5e6',
  },
  editor: {
    base: 'vs',
    rules: [
      { token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a626a4' },
      { token: 'string', foreground: '50a14f' },
      { token: 'number', foreground: '986801' },
      { token: 'type', foreground: 'c18401' },
      { token: 'function', foreground: '4078f2' },
      { token: 'variable', foreground: 'e45649' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#383a42',
      'editorLineNumber.foreground': '#a0a1a7',
      'editorLineNumber.activeForeground': '#383a42',
      'editorCursor.foreground': '#526eff',
      'editor.selectionBackground': '#e5e5e6',
      'editor.lineHighlightBackground': '#f0f0f1',
      'editorGutter.background': '#fafafa',
    },
  },
  highlight: 'one-light',
} as const satisfies StudioPalette;
