import { Unicode11Addon } from '@xterm/addon-unicode11';
import type { Terminal } from '@xterm/xterm';

/**
 * Measure characters by Unicode 11 widths instead of xterm's default Unicode 6.
 *
 * xterm.js ships only the Unicode 6 width table, where most emoji — `📁`, `✅`,
 * `🚀` — are one cell. Every modern TUI measures them as two: Ink (Claude Code)
 * via `string-width`, Bubble Tea via `go-runewidth`, anything on `wcwidth` from
 * a current libc. When the two disagree, everything after the emoji on that row
 * sits one cell left of where the program believes it is. A full repaint hides
 * that; a partial one does not — the program moves the cursor to the column it
 * computed and rewrites only what changed, so the stale cell survives beside the
 * new one. Claude Code's status line (`📁 repo · … 7d ▰▱▱ 17%`) rendered as
 * `1%7%` until a resize forced a full redraw.
 *
 * `term.unicode` is proposed API, so the terminal must be constructed with
 * `allowProposedApi: true`. Guarded because test doubles do not carry it.
 */
export function enableUnicode11(term: Terminal): void {
  if (!term.unicode) return;
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
}
