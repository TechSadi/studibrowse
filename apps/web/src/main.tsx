import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/Providers';
import { AppRouter } from './app/AppRouter';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
