import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';
import { MoneyApp } from './money-app';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MoneyApp />
    </StrictMode>,
  );
}
