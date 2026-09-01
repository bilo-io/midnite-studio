import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { markOnce } from './lib/perf';
import './styles.css';

// Top of the entry module: the earliest moment renderer code runs, so every
// other renderer mark is an offset from something meaningful rather than from
// whenever React happened to boot.
markOnce('renderer-boot');

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
