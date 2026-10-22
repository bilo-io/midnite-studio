import type { ChatWidthMode } from '@midnite/studio-shared';

/**
 * Shared layout constants for the chats thread, dock, and composer.
 *
 * The thread width, gutter, and max-width are derived from the same
 * source of truth so their left and right edges align exactly — and all of
 * them are keyed by the viewer's width mode (`ChatWidthMode`), so a mode
 * change moves every column together.
 */

/** Horizontal padding for clearance (e.g. for the floating launcher). */
export const CHAT_GUTTER = 'px-16';

/**
 * The thread's gutter at full width: the pane's own padding token (the chat
 * header's `px-4`), so the avatars land at the panel edge with a sensible
 * margin. The composer keeps `CHAT_GUTTER` in every mode — it is the floating
 * launcher's clearance that gutter exists for.
 */
export const CHAT_FULL_GUTTER = 'px-4';

/**
 * Centered column layout applied to the composer. 50rem is a fifth wider than
 * the 42rem it was before the width modes landed; `wider` and `full` leave it
 * here, only the thread moves.
 */
export const CHAT_COLUMN = 'mx-auto w-full max-w-[50rem]';

/**
 * One avatar plus its gap (24px + 12px = 4.5rem), allowed on each side of the thread.
 * In `default` that is the whole difference from the composer, so the avatars
 * sit just outside the composer's edges and message bodies line up with it.
 * `wider` and `full` break that alignment on purpose — the thread opens while
 * the composer stays at `CHAT_COLUMN` — so do not "fix" the composer to match.
 */
/**
 * The 4.5rem is that allowance. Spelled as whole literals, never interpolated
 * from a constant: Tailwind's scanner extracts class names from source text,
 * so a template string would leave the rule ungenerated and the column edge
 * to edge.
 */
const THREAD_MAX_WIDTH: Record<ChatWidthMode, string> = {
  default: 'max-w-[calc(50rem+4.5rem)]',
  wider: 'max-w-[calc(64rem+4.5rem)]',
  full: 'max-w-full',
};

/**
 * The glide between modes: ~250ms ease-out on the properties a mode changes
 * (the column's max-width, the gutter's padding), so the avatars slide outward
 * rather than jump. Instant under reduced motion in both dialects the app
 * honours — `html[data-motion='reduced']` (Settings ▸ Appearance) and the OS
 * preference unless the user explicitly asked for full motion — spelled as
 * Tailwind arbitrary variants so the rule travels with the feature into every
 * app that composes it, not just the one whose stylesheet it was written in.
 */
export const CHAT_WIDTH_GLIDE =
  'transition-[max-width,padding] duration-[250ms] ease-out [html[data-motion=reduced]_&]:transition-none motion-reduce:[html:not([data-motion=full])_&]:transition-none';

/** The thread's gutter for a mode: the launcher clearance, or the pane's padding at full width. */
export function chatThreadGutter(mode: ChatWidthMode): string {
  return `${mode === 'full' ? CHAT_FULL_GUTTER : CHAT_GUTTER} ${CHAT_WIDTH_GLIDE}`;
}

/** The thread's centred column for a mode. */
export function chatThreadColumn(mode: ChatWidthMode): string {
  return `mx-auto w-full ${THREAD_MAX_WIDTH[mode]} ${CHAT_WIDTH_GLIDE}`;
}
