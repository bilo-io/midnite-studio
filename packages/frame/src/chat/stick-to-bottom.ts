/**
 * The stick-to-bottom arithmetic an AI thread scrolls by — Chats' thread and
 * Councils' member and synthesis threads (moved down from Chats in Phase 133).
 */

/** Distance from the bottom, in px, within which a thread counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 96;

/** Whether Settings ▸ Appearance asked for reduced motion — every smooth scroll becomes a jump. */
export const threadMotionReduced = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'reduced';

export function scrollToBottom(el: HTMLElement, smooth: boolean): void {
  const top = el.scrollHeight;
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: smooth && !threadMotionReduced() ? 'smooth' : 'auto' });
  else el.scrollTop = top;
}

export function isNearBottom(el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
