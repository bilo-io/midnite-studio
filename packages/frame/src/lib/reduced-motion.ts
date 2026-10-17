/**
 * Whether motion should resolve instantly.
 *
 * Both dialects the app honours: `data-motion='reduced'` (Settings ▸
 * Appearance, written on `<html>` by `@bilo-io/shell`) and the OS setting
 * unless the user explicitly asked for full motion — the same pairing every
 * guard in `styles.css` spells as `html[data-motion='reduced']` plus
 * `@media (prefers-reduced-motion: reduce) html:not([data-motion='full'])`.
 *
 * For motion driven from script (the Web Animations API), which no stylesheet
 * guard can reach. Lifted out of `setup-choreography.ts`, its first caller.
 */
export function isReducedMotion(): boolean {
  const motion = document.documentElement.dataset['motion'];
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
