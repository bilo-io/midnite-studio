import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MonitorApp } from './monitor-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MonitorApp />
    </StrictMode>,
  );
}
