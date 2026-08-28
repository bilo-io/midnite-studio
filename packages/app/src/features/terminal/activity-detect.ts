import type { SessionActivity } from './terminal-store';

/**
 * Claude Code's spinner frames, as it cycles them: `✢ ✳ ✶ ✻ ✽`.
 *
 * The set it actually animates also contains `·` and, in its ASCII variant,
 * `*` — both left out here deliberately. A middle dot is the separator in
 * every footer segment ("main *2 ?1 · Opus 5 · high thinking") and an asterisk
 * is in half the text a terminal ever prints; either would mean "thinking"
 * fires on output that says nothing of the sort. The four glyphs kept are ones
 * nothing else in a terminal draws, and the spinner passes through them on
 * four of every six ticks, so a frame is never missed for long.
 */
const SPINNER_FRAMES = '\\u2722\\u2733\\u2736\\u273B\\u273D';

/**
 * The agent is working.
 *
 * Three independent tells, because Claude Code's spinner row grows and shrinks
 * with the width it is given and with how long the turn has run:
 *
 * 1. The spinner glyph followed by the verb, which always ends in an ellipsis
 *    — `✳ Kneading…`. This is the one part of the row that is always there.
 * 2. The `↓ 4.5k tokens` counter, which only that row prints.
 * 3. The words "esc to interrupt", which older builds put in the row's
 *    parenthetical and current ones keep only in the retry banner.
 *
 * The parenthetical is NOT a tell on its own: `(1m 38s · ↓ 4.5k tokens)` is
 * assembled from whichever parts fit, and at a narrow width it is dropped
 * entirely. Keying on "esc to interrupt" alone — which is what this used to do
 * — meant that from 2.1.x onward the thinking state was never once detected.
 */
const THINKING_MARKER = new RegExp(
  `[${SPINNER_FRAMES}][^\\n]{0,200}\\u2026|\\u2193[^\\n]{0,40}tokens|esc to interrupt`,
  'i',
);

/**
 * The last line of Claude Code's frame — the mode footer, or the shortcut hint
 * that stands in for it in the default mode.
 *
 * Read as a FRAME BOUNDARY first and as "waiting on you" second, which is the
 * fix for the thing that made this whole guess wrong. The footer is printed on
 * every repaint, generating or not (the screenshot that prompted this shows
 * "Kneading…" and "auto mode on (shift+tab to cycle)" at the same time), so
 * treating its arrival as evidence of idleness makes every busy agent look
 * idle. What it actually marks is the END of a frame: the spinner row is drawn
 * above it, so a frame that reaches its footer WITHOUT one is a frame with no
 * spinner in it, and that — the absence — is what means the agent is waiting.
 */
const FRAME_END_MARKER = /shift\+tab to cycle|auto mode on|\? for shortcuts/gi;

/** Enough to hold one repaint; a frame is a couple of kilobytes of escapes. */
const MAX_FRAME_CHARS = 8000;

export type ActivityState = { frame: string };

export const createActivityState = (): ActivityState => ({ frame: '' });

/**
 * Guesses at what an agent is doing, read off the same text a human would.
 *
 * There is no structured signal for this — an agent CLI is just a process
 * writing bytes to a pty — so the guess is keyed on what Claude Code's own TUI
 * draws. It cannot be keyed on one CHUNK of that, though: a repaint is a few
 * kilobytes and a macOS pty hands it over in pieces, so the spinner row and
 * the footer under it routinely arrive separately. Judged chunk by chunk, the
 * same repaint says "thinking" and then "waiting" a millisecond later, and the
 * indicator flickers between the two for as long as the turn runs.
 *
 * So `state` carries the bytes since the last frame boundary, and the guess is
 * made over that instead: spinner seen since the last footer → thinking; a
 * footer reached with none → waiting. `undefined` means "no change" rather
 * than "unknown" — most chunks are transcript text that ends no frame and says
 * nothing either way, and the caller keeps its previous guess.
 */
export function detectActivity(state: ActivityState, text: string): SessionActivity | undefined {
  const buffer = state.frame + text;

  // Only the text after the LAST footer belongs to the frame still being
  // drawn. Slicing there rather than clearing the buffer wholesale is what
  // keeps a chunk that carries the tail of one frame and the head of the next
  // from crediting the older frame with the newer one's spinner.
  let framed = false;
  let current = buffer;
  for (const match of buffer.matchAll(FRAME_END_MARKER)) {
    framed = true;
    current = buffer.slice((match.index ?? 0) + match[0].length);
  }

  state.frame = current.slice(-MAX_FRAME_CHARS);

  // The frame still being drawn wins: it is the newer of the two, so an agent
  // that has just been given something to do says so on the first repaint
  // rather than one frame later.
  if (THINKING_MARKER.test(current)) return 'thinking';
  if (!framed) return undefined;
  if (THINKING_MARKER.test(buffer.slice(0, buffer.length - current.length))) return 'thinking';
  return 'waiting';
}
