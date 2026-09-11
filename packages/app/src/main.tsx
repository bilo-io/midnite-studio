import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { markOnce } from './lib/perf';
import { installGlobalErrorReporting } from './lib/report';
import './styles.css';

// Top of the entry module: the earliest moment renderer code runs, so every
// other renderer mark is an offset from something meaningful rather than from
// whenever React happened to boot.
markOnce('renderer-boot');

/*
  Before `createRoot`, deliberately — Phase 65 Theme C.

  A throw during the very first render is the failure a user is most likely to
  see (a blank window) and the one an error boundary cannot catch on its own,
  because there is no mounted tree yet. Installed here rather than inside `App`
  for a second reason too: this module is the shared entry for BOTH roles, so a
  popout is covered by the same one line and reports itself as `role: 'popout'`.
*/
installGlobalErrorReporting();

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

// A popout renderer is a second, entirely separate process from the main
// window's — it learns which panel to show from `windowRole`, set once via
// `additionalArguments` (see `WINDOW_ROLE_ARG`), never from a URL query
// string that would not survive `loadFile` in the packaged build.
const role = window.midniteStudio?.windowRole ?? 'main';

/*
  Which tree this window needs is known BEFORE either one is imported —
  Phase 84 Theme H.1's "popout diet". `App` (`app.tsx`) is the main window's
  whole shell: the title bar, the FAB, the command palette, an idle preload of
  the terminal chunk, and the companion's voice/audio bootstrap (real
  recorder/WAV-encoding machinery, imported for its module-scope side effect).
  None of that is reachable from a popout, which renders `DetachedRoot` and
  nothing else — `DetachedContent` picks exactly one panel from `role` and
  never the multi-view `Shell`.

  Before this, both `App` and `DetachedRoot` were static imports at the top of
  this module, so EVERY window's renderer process — main and every popout
  alike — loaded and ran all of `app.tsx`'s module-scope work regardless of
  which tree it went on to render; a popout paid main's own boot cost and then
  never used most of it. Branching on `role` before either `import()` resolves
  is what makes a popout's bundle only ever pull in `detached-root.tsx`'s own,
  much smaller module graph.
*/
if (role === 'main') {
  void import('./app').then(({ App }) => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
} else {
  void import('./detached-root').then(({ DetachedRoot }) => {
    createRoot(container).render(
      <StrictMode>
        <DetachedRoot role={role} />
      </StrictMode>,
    );
  });
}
