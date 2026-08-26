/**
 * The ANSI a CI log actually contains, and nothing else.
 *
 * Actions output is written by `tsc`, `eslint`, `vitest` and `actions/*`, and
 * between them they use one small corner of xterm's SGR vocabulary: the eight
 * base colours, their eight bright forms, bold, dim, and reset. That corner is
 * worth rendering — a failed vitest run is mostly red and green, and stripping
 * the colour throws away the thing that makes the diff readable — and the rest
 * is worth *removing*, because an unhandled escape rendered literally is worse
 * than one that was never coloured.
 *
 * Colours resolve to Tailwind pairs rather than raw hex, so red reads as red in
 * both themes. A log is dense monospace text on the app's own ground, and a
 * terminal's #cd0000 on this background is a colour you cannot read.
 */

export type AnsiSpan = {
  text: string;
  /** Empty for unstyled text, so the common row renders one bare span. */
  className: string;
};

/**
 * The sixteen, as theme-aware pairs.
 *
 * `black` and `white` are the two that cannot be literal: a log line is drawn
 * on the app's background, so ANSI black means "dimmer than the text" and ANSI
 * white means "the text colour" — in both themes, which is the opposite pair of
 * literal values in each. Everything else keeps its hue and only shifts
 * lightness, following the `text-emerald-600 dark:text-emerald-400` pattern the
 * contributor table established.
 */
const FOREGROUND: readonly string[] = [
  'text-muted-foreground', // 30 black
  'text-red-600 dark:text-red-400', // 31 red
  'text-emerald-600 dark:text-emerald-400', // 32 green
  'text-amber-600 dark:text-amber-400', // 33 yellow
  'text-blue-600 dark:text-blue-400', // 34 blue
  'text-fuchsia-600 dark:text-fuchsia-400', // 35 magenta
  'text-cyan-600 dark:text-cyan-400', // 36 cyan
  'text-foreground', // 37 white
];

/** 90–97. One step brighter in each theme, same hues. */
const FOREGROUND_BRIGHT: readonly string[] = [
  'text-muted-foreground/70',
  'text-red-500 dark:text-red-300',
  'text-emerald-500 dark:text-emerald-300',
  'text-amber-500 dark:text-amber-300',
  'text-blue-500 dark:text-blue-300',
  'text-fuchsia-500 dark:text-fuchsia-300',
  'text-cyan-500 dark:text-cyan-300',
  'text-foreground',
];

type Style = { fg: string | null; bold: boolean; dim: boolean };

const PLAIN: Style = { fg: null, bold: false, dim: false };

const classNameFor = (style: Style): string =>
  [style.fg, style.bold ? 'font-semibold' : null, style.dim ? 'opacity-60' : null]
    .filter((part): part is string => part !== null)
    .join(' ');

/**
 * Apply one SGR parameter list to a style.
 *
 * Anything outside the handled set is *ignored* rather than passed through —
 * including 38/48's extended colour forms, whose 256-index and truecolour
 * arguments would otherwise be misread as further codes and paint the rest of
 * the line at random.
 */
function applySgr(style: Style, params: readonly number[]): Style {
  let next = style;
  for (let at = 0; at < params.length; at += 1) {
    const code = params[at] ?? 0;
    if (code === 0) next = PLAIN;
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 2) next = { ...next, dim: true };
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 39) next = { ...next, fg: null };
    else if (code >= 30 && code <= 37) next = { ...next, fg: FOREGROUND[code - 30] ?? null };
    else if (code >= 90 && code <= 97) {
      next = { ...next, fg: FOREGROUND_BRIGHT[code - 90] ?? null };
    } else if (code === 38 || code === 48) {
      // Extended colour. Skip its arguments so they are not read as codes:
      // `5;n` is a palette index, `2;r;g;b` a truecolour triple.
      const mode = params[at + 1];
      at += mode === 5 ? 2 : mode === 2 ? 4 : 1;
    }
    // 40–47 / 100–107 (background) are deliberately unhandled: a background
    // block inside a pane that already has one reads as a rendering fault, and
    // nothing in Actions output depends on it to be legible.
  }
  return next;
}

/*
  Built with `new RegExp` from an escape-free source string.

  A literal /\u001b/ is still a control character to eslint's `no-control-regex`,
  and disabling the rule per line reads as "the lint is wrong" rather than as
  "this file is about control characters". Composing the pattern from
  `String.fromCharCode` says the same thing to the engine and keeps the rule on
  everywhere else, where it is right.
*/
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/**
 * SGR and every other CSI sequence — parameters, then a final letter.
 *
 * The parameter class has to include `? < = >`, the private-parameter bytes.
 * `ESC[?25l` / `ESC[?25h` (hide and show the cursor) are emitted by npm, pnpm
 * and every spinner that has ever run in CI, and a class of `[0-9;]` does not
 * match them — so they survive into the row and render as literal `[?25l`,
 * which is precisely the outcome this file exists to prevent.
 */
const CSI = new RegExp(`${ESC}\\[([0-9;?<=>]*)([A-Za-z])`, 'g');
/** OSC — a window title or hyperlink, terminated by BEL or ST. */
const OSC = new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`, 'g');

/**
 * Split one log line into styled spans.
 *
 * Carriage returns are resolved first, because a progress bar writes its whole
 * history into a single line and a terminal shows only the last pass. Rendering
 * every pass would turn one npm install into forty columns of `[====>    ]`.
 */
export function parseAnsi(line: string): AnsiSpan[] {
  const text = resolveCarriageReturns(line).replace(OSC, '');

  const spans: AnsiSpan[] = [];
  let style = PLAIN;
  let at = 0;

  CSI.lastIndex = 0;
  for (let match = CSI.exec(text); match !== null; match = CSI.exec(text)) {
    if (match.index > at) {
      spans.push({ text: text.slice(at, match.index), className: classNameFor(style) });
    }
    // SGR only, and only with a purely numeric parameter list: `ESC[?25h` also
    // ends in a letter, and `ESC[>4;2m` is a private SGR-shaped sequence that
    // sets nothing this renderer has an opinion about.
    const params = match[1] ?? '';
    if (match[2] === 'm' && /^[0-9;]*$/.test(params)) {
      style = applySgr(
        style,
        params
          .split(';')
          .map((part) => (part === '' ? 0 : Number.parseInt(part, 10)))
          .filter((value) => Number.isInteger(value)),
      );
    }
    // Every other CSI final byte — cursor moves, erases — is dropped along with
    // the sequence. There is no cursor here to move.
    at = match.index + match[0].length;
  }

  if (at < text.length) spans.push({ text: text.slice(at), className: classNameFor(style) });
  return spans;
}

/** Strip every escape sequence, keeping the text. For search and copy. */
export const stripAnsi = (line: string): string =>
  parseAnsi(line)
    .map((span) => span.text)
    .join('');

/**
 * What a terminal would be showing after the line finished writing.
 *
 * Each `\r` returns to column zero, so a later write overwrites what is there.
 * Approximated as "the last segment wins", which is exact for the case this
 * exists for — a progress bar rewriting the whole line — and harmless for the
 * lone trailing `\r` of CRLF.
 */
function resolveCarriageReturns(line: string): string {
  if (!line.includes('\r')) return line;
  const segments = line.split('\r').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? '';
}
