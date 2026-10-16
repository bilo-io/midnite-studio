import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { AgentsApp } from './agents-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AgentsApp />
    </StrictMode>,
  );
}
