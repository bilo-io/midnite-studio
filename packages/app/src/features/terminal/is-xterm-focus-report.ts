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
