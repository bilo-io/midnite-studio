import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { BrowserApp } from '@midnite/studio-module-browser/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <BrowserApp />
    </StrictMode>,
  );
}
