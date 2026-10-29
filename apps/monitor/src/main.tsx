import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MonitorApp } from '@midnite/studio-module-monitor/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MonitorApp />
    </StrictMode>,
  );
}
