import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { CleanerApp } from './cleaner-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CleanerApp />
    </StrictMode>,
  );
}
