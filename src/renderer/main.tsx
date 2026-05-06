import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { localeService } from './services/LocaleService';
import './global.css';

// Kick off i18next boot in parallel with React render. With useSuspense:false
// (see i18n/init.ts), App mounts immediately — t() returns raw keys for the
// brief window before namespaces land, then re-renders with translations.
// This keeps E2E dev helpers (__DEV_OPEN_FILE__) reachable from first paint.
void localeService.init().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- boot diagnostic
  console.error('[boot] LocaleService.init failed:', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
