import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { DetachedRoot } from './detached-root';
import { markOnce } from './lib/perf';
import './styles.css';

// Top of the entry module: the earliest moment renderer code runs, so every
// other renderer mark is an offset from something meaningful rather than from
// whenever React happened to boot.
markOnce('renderer-boot');

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

// A popout renderer is a second, entirely separate process from the main
// window's — it learns which panel to show from `windowRole`, set once via
// `additionalArguments` (see `WINDOW_ROLE_ARG`), never from a URL query
// string that would not survive `loadFile` in the packaged build.
const role = window.midniteStudio?.windowRole ?? 'main';

createRoot(container).render(
  <StrictMode>{role === 'main' ? <App /> : <DetachedRoot role={role} />}</StrictMode>,
);
