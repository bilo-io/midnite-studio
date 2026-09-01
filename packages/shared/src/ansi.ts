/**
 * Turning raw pty text into something readable, shared between main's
 * `council-output.ts` (cleaning a member's captured output for the synthesis
 * prompt) and the renderer's council live-output view (a best-effort cleanup
 * of the same stream while it is still arriving, for display only).
 */

/** Matches CSI (`\x1b[...`) and OSC (`\x1b]...BEL|ST`) escape sequences. */
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex -- stripping raw pty escape bytes is the whole point.
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Strip ANSI CSI/OSC escape sequences, leaving the printable text behind. */
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
