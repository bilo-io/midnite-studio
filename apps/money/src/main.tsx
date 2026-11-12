import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MoneyHostApp } from './host-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MoneyHostApp />
    </StrictMode>,
  );
}
