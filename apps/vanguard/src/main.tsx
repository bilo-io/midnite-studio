import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { VanguardApp } from '@midnite/studio-module-vanguard/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <VanguardApp />
    </StrictMode>,
  );
}
