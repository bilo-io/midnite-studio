import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { trackPageVisibility } from './page-visibility';
import './styles/site.css';

// Before the first paint, so the pulse never runs a frame in a hidden tab.
trackPageVisibility();

const container = document.getElementById('root');
if (!container) {
  // Both HTML entries ship the div; if it is gone, the build is broken in a way
  // no fallback should paper over.
  throw new Error('#root is missing from the document');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
