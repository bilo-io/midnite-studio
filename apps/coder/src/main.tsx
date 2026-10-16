import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { CoderApp } from './coder-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CoderApp />
    </StrictMode>,
  );
}
