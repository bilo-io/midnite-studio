import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { VaultApp } from '@midnite/studio-module-vault/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <VaultApp />
    </StrictMode>,
  );
}
