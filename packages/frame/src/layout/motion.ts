/**
 * How long a panel takes to slide open or shut, in ms.
 *
 * The one source of the duration: every reveal-related transition reads
 * {@link motionMs}, which returns this unless reduced motion is on. Nothing
 * pairs it with a Tailwind `duration-*` class by hand any more — `style` is
 * always where the number lives.
 */
export const REVEAL_MS = 200;

/**
 * Whether reveal transitions should run at all.
 *
 * `data-motion="reduced"` is written on `<html>` by `@bilo-io/shell`'s
 * `applyMotion`, never by this repo — read fresh on every call rather than
 * subscribed to, because a preference change re-renders `App` anyway.
 */
export const motionMs = (): number =>
  document.documentElement.dataset['motion'] === 'reduced' ? 0 : REVEAL_MS;
