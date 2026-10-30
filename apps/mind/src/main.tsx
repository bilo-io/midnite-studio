import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MindHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MindHostApp />
    </StrictMode>,
  );
}
