import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserApp } from './browser-app';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <BrowserApp />
    </StrictMode>,
  );
}
