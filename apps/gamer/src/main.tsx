import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { GamerHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <GamerHostApp />
    </StrictMode>,
  );
}
