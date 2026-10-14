import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { applyTheme, readTheme } from './theme';
import './styles.css';

applyTheme(readTheme());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
