import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { VanguardHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <VanguardHostApp />
    </StrictMode>,
  );
}
