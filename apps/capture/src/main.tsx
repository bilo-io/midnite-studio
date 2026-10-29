import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { CaptureApp } from '@midnite/studio-module-capture/renderer';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CaptureApp />
    </StrictMode>,
  );
}
