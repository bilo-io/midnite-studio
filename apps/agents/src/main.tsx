import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { AgentsHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AgentsHostApp />
    </StrictMode>,
  );
}
