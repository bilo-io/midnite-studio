import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MindApp } from './mind-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MindApp />
    </StrictMode>,
  );
}
