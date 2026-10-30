import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { GamerApp } from '@midnite/studio-module-gamer/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <GamerApp />
    </StrictMode>,
  );
}
