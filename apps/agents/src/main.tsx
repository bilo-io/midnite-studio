import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { AgentsApp } from '@midnite/studio-module-agents/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AgentsApp />
    </StrictMode>,
  );
}
