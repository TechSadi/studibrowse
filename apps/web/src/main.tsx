import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/AppRouter';
import { Providers } from './app/Providers';
import { initErrorTracking } from './lib/errorTracking';
import './styles/tokens.css';
import './styles/global.css';

// Before the first render, so errors while starting up are caught too.
initErrorTracking();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
