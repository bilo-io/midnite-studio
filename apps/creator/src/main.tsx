import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { CreatorApp } from './creator-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CreatorApp />
    </StrictMode>,
  );
}
