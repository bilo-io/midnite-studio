import type { Terminal } from '@xterm/xterm';

/**
 * Disable DEC mode 2026 (synchronized output) on an xterm instance.
 *
 * Bubble Tea (used by `agy` and other Go TUI tools) queries DECRQM 2026 (`\x1b[?2026$p`).
 * When xterm.js answers that mode 2026 is recognized (`\x1b[?2026;2$y`), Bubble Tea
 * enables synchronized output via `\x1b[?2026h` (DECSET 2026).
 * In xterm.js, setting mode 2026 causes `refreshRows` to buffer row updates in
 * `_syncOutputHandler` until `\x1b[?2026l` (DECRST 2026).
 *
 * CORRECTION (the `agy` freeze, re-diagnosed). This module was added believing
 * Bubble Tea left mode 2026 enabled while waiting at `agy`'s workspace-trust
 * prompt, and that xterm therefore buffered rows forever. Both halves are
 * wrong, and disabling mode 2026 fixed nothing:
 *
 * - Captured off a real pty, `agy` balances every `\x1b[?2026h` with a
 *   `\x1b[?2026l` — 3 and 3 through sign-in, 2 and 2 at the trust prompt — and
 *   leaves the mode reset.
 * - `SynchronizedOutputHandler` (xterm 6.0.0, `RenderService.ts`) arms a 1s
 *   safety timeout that clears the mode and forces a full refresh, so it cannot
 *   suppress rendering indefinitely even for a program that does leave it on.
 *
 * The freeze was `InputHandler.requestMode` throwing `ReferenceError` in the
 * minified renderer and killing xterm's write loop — see
 * `vite-xterm-decrqm-plugin.ts`. Intercepting DECRQM 2026 here happened to
 * route that one query around the throw, which is why the symptom moved but
 * never went away: `agy` asks for 2027 too, and that one still hit it.
 *
 * What remains below is therefore a workaround for a bug that was not there.
 * It is inert rather than harmful — mode 2026 is an optimisation, and xterm
 * renders correctly without it — but it costs tear-free frames and hides DECRQM
 * 2026 from xterm's own handler, so it wants removing on its own once the real
 * fix has had some road time.
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
