import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles/site.css';

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
