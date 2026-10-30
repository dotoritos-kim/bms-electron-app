import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { localeService } from './services/LocaleService';
import './global.css';

// Kick off i18next boot in parallel with React render. App mounts immediately
// and holds its tree until init settles (see App.tsx), but its effects run, so
// E2E dev helpers (__DEV_OPEN_FILE__) are reachable from first paint.
void localeService.init().catch((err: unknown) => {
  console.error('[boot] LocaleService.init failed:', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
