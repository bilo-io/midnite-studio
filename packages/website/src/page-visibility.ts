/**
 * Mirror `document.hidden` onto the root element, for CSS to key off.
 *
 * The site's neon pulse and its rotating rainbow are `infinite` CSS animations.
 * A background tab still runs them: the compositor throttles what it can, but a
 * `box-shadow` keyframe is a paint on the main thread, and a laptop with this
 * page parked in a tab it cannot see has no business spending anything on it.
 * `styles/site.css` pauses every one of them under
 * `html[data-page-hidden='true']`.
 *
 * **One listener for the whole page, outside React.** This is a property of the
 * document, not of any component: a hook would mean one listener and one state
 * update per animated element, all re-rendering in lockstep to say the same
 * thing, and the thing they would say is not something React needs to know.
 * `animation-play-state` resumes an animation mid-cycle rather than restarting
 * it, so nothing jumps when the tab comes back.
 *
 * Returns its own teardown, which nothing in the app calls — the listener is
 * meant to live as long as the document. It exists so a test can install and
 * remove it without leaking into the next one.
 */
export const trackPageVisibility = (): (() => void) => {
  if (typeof document === 'undefined') return () => {};

  const sync = () => {
    document.documentElement.dataset.pageHidden = document.hidden ? 'true' : 'false';
  };

  sync();
  document.addEventListener('visibilitychange', sync);
  return () => document.removeEventListener('visibilitychange', sync);
};
