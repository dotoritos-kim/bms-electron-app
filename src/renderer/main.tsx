import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { localeService } from './services/LocaleService';
import './global.css';

// Boot i18next before first render so useTranslation() resolves keys instead
// of returning raw `<ns>:<key>` strings. Without this, every t() call leaks
// the raw key into the DOM and E2E selectors targeting localized text break.
async function boot() {
  try {
    await localeService.init();
  } catch (err) {
    // eslint-disable-next-line no-console -- boot diagnostic
    console.error('[boot] LocaleService.init failed:', err);
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
