import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { GamerApp } from './gamer-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <GamerApp />
    </StrictMode>,
  );
}
