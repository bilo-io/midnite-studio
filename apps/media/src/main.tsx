import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MediaApp } from './media-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MediaApp />
    </StrictMode>,
  );
}
