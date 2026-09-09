import type { StudioPalette } from '../theme-types';

/**
 * Rosé Pine Dawn — the light variant of the Rosé Pine family (alongside Main
 * and Moon). Colour roles (`base`/`surface`/`overlay`/`muted`/`subtle`/
 * `text`/`love`/`gold`/`rose`/`pine`/`foam`/`iris`/`highlightLow`/`Med`/
 * `High`) and hex values are from the project's own `rose-pine/palette`
 * (mirrored on rosepinetheme.com/palette). `terminal`'s ANSI role mapping —
 * `black`→Overlay, `red`→Love, `green`→Pine, `yellow`→Gold, `blue`→Foam,
 * `magenta`→Iris, `cyan`→Rose, `white`→Text — is copied from the project's
 * own `rose-pine/windows-terminal` scheme (Rosé Pine has no true green or
 * cyan swatch; Pine and Rose fill those slots by the project's own design,
 * not an approximation made here); this file substitutes the palette repo's
 * current `text` hex (`#464261`) for that scheme's `#575279`, which predates
 * a later palette refinement. `chrome`'s `success` reuses `pine` for the
 * same reason — there is no dedicated green token to derive it from.
 */
export const rosePineDawn = {
  id: 'rose-pine-dawn',
  label: 'Rosé Pine Dawn',
  appearance: 'light',
  chrome: {
    '--background': '32 56.5% 95.5%',
    '--foreground': '248 19% 32%',
    '--card': '35 100% 97.6%',
    '--card-foreground': '248 19% 32%',
    '--primary': '197 53.2% 33.5%',
    '--primary-foreground': '32 56.5% 95.5%',
    '--secondary': '28 39.5% 91.6%',
    '--secondary-foreground': '248 19% 32%',
    '--muted': '25 35.3% 93.3%',
    '--muted-foreground': '257 9.1% 61.2%',
    '--accent': '10 8.6% 86.3%',
    '--accent-foreground': '248 19% 32%',
    '--destructive': '343 35.1% 54.7%',
    '--destructive-foreground': '32 56.5% 95.5%',
    '--success': '197 53.2% 33.5%',
    '--success-foreground': '32 56.5% 95.5%',
    '--popover': '35 100% 97.6%',
    '--popover-foreground': '248 19% 32%',
    '--border': '315 3.9% 80%',
    '--input': '315 3.9% 80%',
    '--ring': '197 53.2% 33.5%',
  },
  terminal: {
    background: '#faf4ed',
    foreground: '#464261',
    cursor: '#9893a5',
    cursorAccent: '#faf4ed',
    selectionBackground: '#dfdad9',
    black: '#f2e9e1',
    red: '#b4637a',
    green: '#286983',
    yellow: '#ea9d34',
    blue: '#56949f',
    magenta: '#907aa9',
    cyan: '#d7827e',
    white: '#464261',
    brightBlack: '#797593',
    brightRed: '#b4637a',
    brightGreen: '#286983',
    brightYellow: '#ea9d34',
    brightBlue: '#56949f',
    brightMagenta: '#907aa9',
    brightCyan: '#d7827e',
    brightWhite: '#464261',
  },
  editor: {
    base: 'vs',
    rules: [
      { token: 'comment', foreground: '9893a5', fontStyle: 'italic' },
      { token: 'keyword', foreground: '286983' },
      { token: 'string', foreground: 'ea9d34' },
      { token: 'number', foreground: '907aa9' },
      { token: 'type', foreground: '56949f' },
      { token: 'function', foreground: 'd7827e' },
      { token: 'variable', foreground: 'b4637a' },
    ],
    colors: {
      'editor.background': '#faf4ed',
      'editor.foreground': '#464261',
      'editorLineNumber.foreground': '#cecacd',
      'editorLineNumber.activeForeground': '#464261',
      'editorCursor.foreground': '#d7827e',
      'editor.selectionBackground': '#dfdad9',
      'editor.lineHighlightBackground': '#f4ede8',
      'editorGutter.background': '#faf4ed',
    },
  },
  highlight: 'rose-pine-dawn',
} as const satisfies StudioPalette;
