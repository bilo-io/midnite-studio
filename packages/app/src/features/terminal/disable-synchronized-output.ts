import type { Terminal } from '@xterm/xterm';

/**
 * Disable DEC mode 2026 (synchronized output) on an xterm instance.
 *
 * Bubble Tea (used by `agy` and other Go TUI tools) queries DECRQM 2026 (`\x1b[?2026$p`).
 * When xterm.js answers that mode 2026 is recognized (`\x1b[?2026;2$y`), Bubble Tea
 * enables synchronized output via `\x1b[?2026h` (DECSET 2026).
 * In xterm.js, setting mode 2026 causes `refreshRows` to buffer row updates in
 * `_syncOutputHandler` until `\x1b[?2026l` (DECRST 2026). In interactive prompts
 * (such as `agy`'s initial workspace trust prompt), Bubble Tea leaves mode 2026
 * active while waiting for user input without resetting it. This causes xterm to
 * indefinitely suppress all row rendering, making the terminal appear frozen or blank.
 *
 * Intercepting DECRQM 2026 to report not recognized (`\x1b[?2026;0$y`) and
 * intercepting `\x1b[?2026h` ensures xterm renders frames immediately without
 * buffering output.
 */
export function disableSynchronizedOutput(term: Terminal): void {
  if (!term.parser) return;

  // Respond to DECRQM 2026 (\x1b[?2026$p) with 0$y (not recognized/unsupported).
  term.parser.registerCsiHandler({ prefix: '?', intermediates: '$', final: 'p' }, (params) => {
    if (params.includes(2026)) {
      term.input('\x1b[?2026;0$y');
      return true;
    }
    return false;
  });

  // Ignore DECSET 2026 (\x1b[?2026h) to prevent locking row rendering.
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    if (params.includes(2026)) {
      return true;
    }
    return false;
  });
}
