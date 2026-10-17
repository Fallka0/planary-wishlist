import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/unbounded/300.css';
import '@fontsource/unbounded/400.css';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { absorbSessionFromHash } from './lib/session';

// Coming back from auth.planary.ch: keep the tokens and clean the URL before anything renders.
absorbSessionFromHash();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
