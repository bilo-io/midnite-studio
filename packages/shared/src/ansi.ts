/**
 * Turning raw pty text into something readable, shared between main's
 * `council-output.ts` (cleaning a member's captured output for the synthesis
 * prompt), the renderer's council live-output view (a best-effort cleanup of
 * the same stream while it is still arriving, for display only), and — since
 * Phase 79 Theme E — the companion's read-back, which strips a whole agent
 * scrollback before speaking any of it.
 *
 * That third caller is why {@link ANSI_PATTERN} grew. The first two only ever
 * had to make output *readable*; the companion has to make it **speakable**,
 * and a leftover `?1049h` or a stray 0x0F read out loud by a synthesiser is
 * not a cosmetic problem. Every alternative below is additive — nothing the
 * old pattern stripped is left behind now — so the council paths get a
 * strictly cleaner string than before and needed no change.
 */

/**
 * Every escape form a TUI agent actually emits.
 *
 * In order, and each one is here because a real frame contains it:
 *
 * - **CSI** — `ESC [ … final`. Colour, cursor moves, erases, and the DEC
 *   private modes (`?25l` hides the cursor, `?1049h` switches to the alternate
 *   screen). The parameter class is `0-?` rather than `0-9;?` so `>`, `<` and
 *   `=` private forms are covered too, and the intermediate class `[ -/]` is
 *   what makes `ESC [ ? 1 0 4 9 h` and `ESC [ 1 $ p` both terminate correctly.
 * - **OSC** — `ESC ] … terminator`, where the terminator may be BEL, `ESC \`
 *   or the 8-bit ST (0x9C). All three are legal and different CLIs emit
 *   different ones, which is exactly the sort of thing that leaves half a
 *   window title in a spoken sentence.
 * - **DCS / SOS / PM / APC** — `ESC P|X|^|_ … ST`. Rare, but Kitty's and
 *   iTerm's image protocols ride on them and the payload is base64.
 * - **The 8-bit C1 forms** of CSI and OSC (0x9B, 0x9D), which a pty in a UTF-8
 *   locale can still produce.
 * - **Charset selection** (`ESC ( B`), keypad and cursor-key modes (`ESC =`,
 *   `ESC >`), save/restore cursor (`ESC 7`, `ESC 8`), `RIS` (`ESC c`), and the
 *   two single shifts (`ESC N`, `ESC O`) — the two- and three-byte escapes the
 *   original pattern's `[@-Z\\-_]` class did not reach.
 */
const ANSI_PATTERN = new RegExp(
  [
    // CSI, 7-bit and 8-bit.
    '\\u001B\\[[0-?]*[ -/]*[@-~]',
    '\\u009B[0-?]*[ -/]*[@-~]',
    // OSC, 7-bit and 8-bit, with all three terminators.
    '\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\|\\u009C)',
    '\\u009D[\\s\\S]*?(?:\\u0007|\\u001B\\\\|\\u009C)',
    // DCS / SOS / PM / APC.
    '\\u001B[P^_X][\\s\\S]*?(?:\\u001B\\\\|\\u009C)',
    // Charset selection and the other three-byte escapes.
    '\\u001B[()#][ -~]',
    // Single shifts.
    '\\u001B[NO][ -~]',
    // ESC with an intermediate, then a final.
    '\\u001B[ -/][0-~]',
    // Bare two-byte escapes — ESC 7, ESC =, ESC c, and the C1 aliases.
    '\\u001B[0-~]',
  ].join('|'),
  'g',
);

/**
 * Control characters that are never content.
 *
 * Tab (0x09), newline (0x0A) and carriage return (0x0D) are deliberately
 * absent: the first two are layout and the third is what
 * {@link collapseCarriageReturns} exists to interpret, so removing it here
 * would silently turn a spinner's redraws into one very long line.
 *
 * The C1 range (0x80-0x9F) is included, and it has to run *after*
 * {@link ANSI_PATTERN} for that reason — 0x9B and 0x9D are escape
 * introducers, and deleting them before their payload is read would leave the
 * payload behind as text.
 */
const CONTROL_PATTERN = new RegExp(
  // eslint-disable-next-line no-control-regex -- stripping raw pty control bytes is the whole point, exactly as ANSI_PATTERN above.
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]',
  'g',
);

/** Strip ANSI escape sequences, leaving the printable text behind. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Collapse `\r`-based in-place redraws (progress bars, spinners) to what
 * would actually be showing at the end of each line — the segment after the
 * *last* `\r` on that line, since each `\r` returns the cursor to column 0 and
 * subsequent characters overwrite whatever was there. Not a full terminal
 * emulator (a shorter overwrite leaves stale trailing characters in a real
 * terminal too, which this does not attempt to reproduce), but it turns a
 * spinner's dozens of redraw frames into its last one.
 */
export function collapseCarriageReturns(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const parts = line.split('\r');
      return parts[parts.length - 1] ?? '';
    })
    .join('\n');
}

/**
 * The whole cleanup, in the one order that works — Phase 79 Theme E.
 *
 * Escapes first, then the leftover control bytes, then the carriage-return
 * redraws, then trailing whitespace per line. The ordering is not incidental:
 * strip the C1 bytes before the escapes and an 8-bit CSI's parameters survive
 * as digits; collapse the carriage returns before stripping the escapes and a
 * cursor move split across the `\r` boundary survives as text.
 *
 * Trailing whitespace goes because a TUI pads every line out to the terminal
 * width, and a speech synthesiser given a 120-column-padded paragraph pauses
 * in all the wrong places.
 */
export function cleanPtyText(text: string): string {
  return collapseCarriageReturns(stripAnsi(text).replace(CONTROL_PATTERN, ''))
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}
