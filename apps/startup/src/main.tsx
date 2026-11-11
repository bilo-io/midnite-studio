import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { StartupHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <StartupHostApp />
    </StrictMode>,
  );
}
