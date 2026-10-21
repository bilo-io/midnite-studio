import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { BrowserApp } from './browser-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <BrowserApp />
    </StrictMode>,
  );
}
