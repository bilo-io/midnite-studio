/**
 * Whether `data` is xterm's own DEC focus-report escape sequence
 * (`ESC[I` on focus, `ESC[O` on blur) rather than something the user typed.
 *
 * xterm emits these through the same `onData` stream as real keystrokes
 * whenever the hidden textarea gains or loses DOM focus — including a
 * programmatic `.focus()` call, not just a real click into the pane. A
 * caller that treats every `onData` chunk as "the user typed" will fire on
 * a focus change it never asked about, e.g. selecting a session in a
 * sidebar list.
 */
export function isXtermFocusReport(data: string): boolean {
  return data === '\x1b[I' || data === '\x1b[O';
}

/**
 * Whether `data` is one of xterm's mouse-tracking reports rather than
 * something the user typed: SGR (`ESC[<b;x;yM` / `…m`), URXVT
 * (`ESC[b;x;yM`) or the legacy X10/normal form (`ESC[M` + three bytes).
 *
 * An agent's TUI turns mouse tracking on, and the mode stays latched in the
 * xterm after its process dies — a stopped loop's pane keeps it. From then on
 * merely moving the pointer over the pane emits these through `onData`, so a
 * caller that wakes a dead session on any `onData` chunk revives it on hover.
 */
export function isXtermMouseReport(data: string): boolean {
  if (!data.startsWith('\x1b[')) return false;
  const body = data.slice(2);
  // X10/normal: `M` then button, column and row as single bytes.
  if (body.length === 4 && body.startsWith('M')) return true;
  return /^<\d+;\d+;\d+[Mm]$/.test(body) || /^\d+;\d+;\d+M$/.test(body);
}

/**
 * Whether an `onData` chunk reached a dead pane because the user asked for it
 * — a keystroke or a paste — rather than as one of xterm's automatic reports
 * (focus or mouse). Only the former may revive the session.
 */
export function shouldWakeDeadPane(data: string): boolean {
  return !isXtermFocusReport(data) && !isXtermMouseReport(data);
}
