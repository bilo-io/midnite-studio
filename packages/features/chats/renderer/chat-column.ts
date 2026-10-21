/**
 * Shared layout constants for the chats thread, dock, and composer.
 *
 * The thread width, gutter, and max-width are derived from the same
 * source of truth so their left and right edges align exactly.
 */

/** Horizontal padding for clearance (e.g. for the floating launcher). */
export const CHAT_GUTTER = 'px-16';

/** Centered column layout applied to thread, dock, and composer. */
export const CHAT_COLUMN = 'mx-auto w-full max-w-2xl';

/**
 * The thread column is wider than the composer's by one avatar plus its gap
 * (24px + 12px) on each side, so the avatars sit just outside the composer's
 * edges while message bodies line up with it. The composer keeps `CHAT_COLUMN`.
 */
export const CHAT_THREAD_COLUMN = 'mx-auto w-full max-w-[calc(42rem+4.5rem)]';
