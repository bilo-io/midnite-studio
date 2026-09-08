import { useEffect, useState } from 'react';

import { SiteNav } from './components/site-nav';
import { useHashLanding } from './hooks/use-hash-landing';
import { DownloadPage } from './pages/download-page';
import { routeFor, type Route } from './routes';
import { SECTIONS } from './sections/registry';

/**
 * The landing page: the registry, rendered in order.
 *
 * There is nothing else to it, and that is the contract wave 2 builds on — a
 * section is added by appending to `sections/registry.ts`, never by editing
 * this component.
 */
const Landing = () => {
  // The sections only exist once this has rendered, which is why the browser's
  // own fragment scroll misses them — see `useHashLanding`. It runs here rather
  // than in `SiteNav` so it fires after the whole page is committed, and so a
  // deep link works whether or not the nav happens to be on screen.
  useHashLanding();

  return (
    <>
      <SiteNav />
      <main>
        {SECTIONS.map(({ id, Component }) => (
          <Component key={id} />
        ))}
      </main>
    </>
  );
};

/**
 * The site's two pages.
 *
 * Both are real HTML files on disk (`index.html`, `download/index.html`), so the
 * initial route comes from the URL the server already resolved and no history
 * rewriting is needed — every link between them is a plain `<a>` and a full
 * navigation. `popstate` is still handled, because the browser's Back button
 * after such a navigation can restore this document from the page cache, and a
 * component that only read the path once would then render the wrong page.
 */
export const App = () => {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'landing' : routeFor(window.location.pathname),
  );

  useEffect(() => {
    const onPopState = () => setRoute(routeFor(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return route === 'download' ? <DownloadPage /> : <Landing />;
};
