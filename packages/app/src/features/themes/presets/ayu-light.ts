import type { StudioPalette } from '../theme-types';

/**
 * Ayu Light — the light variant of the `dempfi/ayu` theme family. `editor`'s
 * colours and token rules, and `terminal`'s five base keys, are taken
 * verbatim from the project's own `ayu-light.sublime-color-scheme` (its
 * `caret`/`accent` is `#ffaa33`, reused below as `primary`/`ring`). Ayu never
 * published a terminal ANSI (16-colour) scheme, so those are derived from
 * that same source's syntax-rule colours (`string`→green, `keyword`→orange,
 * `entity.name`→blue, `tag`→cyan, `constant`→purple, `invalid`→red), with
 * `black`/`white` oriented for readability against the light background
 * (mirroring this file's own `github-light` convention) rather than a bare
 * dark-terminal default. `chrome`'s neutral surfaces (`card`/`secondary`/
 * `muted`/`accent`/`border`/`input`) are derived light-grey steps, since Ayu
 * has no published shadcn-style UI chrome token set — `highlight` is the one
 * exact match among this batch's harder cases (shiki bundles `ayu-light`
 * itself).
 */
export const ayuLight = {
  id: 'ayu-light',
  label: 'Ayu Light',
  appearance: 'light',
  chrome: {
    '--background': '0 0% 98.8%',
    '--foreground': '210 5.2% 38%',
    '--card': '210 14.3% 97.3%',
    '--card-foreground': '210 5.2% 38%',
    '--primary': '35 100% 60%',
    '--primary-foreground': '0 0% 98.8%',
    '--secondary': '200 9.7% 93.9%',
    '--secondary-foreground': '210 5.2% 38%',
    '--muted': '210 9.1% 95.7%',
    '--muted-foreground': '212 6.8% 57.1%',
    '--accent': '200 6.7% 91.2%',
    '--accent-foreground': '210 5.2% 38%',
    '--destructive': '0 75% 60.8%',
    '--destructive-foreground': '0 0% 98.8%',
    '--success': '75 100% 35.1%',
    '--success-foreground': '0 0% 98.8%',
    '--popover': '0 0% 98.8%',
    '--popover-foreground': '210 5.2% 38%',
    '--border': '200 5.7% 89.6%',
    '--input': '200 5.7% 89.6%',
    '--ring': '35 100% 60%',
  },
  terminal: {
    background: '#fcfcfc',
    foreground: '#5c6166',
    cursor: '#ffaa33',
    cursorAccent: '#fcfcfc',
    selectionBackground: '#036dd626',
    black: '#5c6166',
    red: '#e65050',
    green: '#86b300',
    yellow: '#f2ae49',
    blue: '#22a4e6',
    magenta: '#a37acc',
    cyan: '#55b4d4',
    white: '#787b80',
    brightBlack: '#8a9199',
    brightRed: '#ff7383',
    brightGreen: '#6cbf43',
    brightYellow: '#ffaa33',
    brightBlue: '#478acc',
    brightMagenta: '#c594c5',
    brightCyan: '#4cbf99',
    brightWhite: '#fcfcfc',
  },
  editor: {
    base: 'vs',
    rules: [
      { token: 'comment', foreground: '787b80', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'fa8d3e' },
      { token: 'string', foreground: '86b300' },
      { token: 'number', foreground: 'ffaa33' },
      { token: 'type', foreground: '55b4d4' },
      { token: 'function', foreground: 'f2ae49' },
      { token: 'variable', foreground: '5c6166' },
    ],
    colors: {
      'editor.background': '#fcfcfc',
      'editor.foreground': '#5c6166',
      'editorLineNumber.foreground': '#8a9199',
      'editorLineNumber.activeForeground': '#5c6166',
      'editorCursor.foreground': '#ffaa33',
      'editor.selectionBackground': '#036dd626',
      'editor.lineHighlightBackground': '#f3f4f5',
      'editorGutter.background': '#fcfcfc',
    },
  },
  highlight: 'ayu-light',
} as const satisfies StudioPalette;
