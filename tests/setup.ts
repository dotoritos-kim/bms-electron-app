import '@testing-library/jest-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Load all ko + en + ja locale JSON files synchronously for tests
import koApp from '../src/shared/i18n/locales/ko/app.json';
import koCommon from '../src/shared/i18n/locales/ko/common.json';
import koEditor from '../src/shared/i18n/locales/ko/editor.json';
import koErrors from '../src/shared/i18n/locales/ko/errors.json';
import koPlayer from '../src/shared/i18n/locales/ko/player.json';
import enApp from '../src/shared/i18n/locales/en/app.json';
import enCommon from '../src/shared/i18n/locales/en/common.json';
import enEditor from '../src/shared/i18n/locales/en/editor.json';
import enErrors from '../src/shared/i18n/locales/en/errors.json';
import enPlayer from '../src/shared/i18n/locales/en/player.json';
import jaApp from '../src/shared/i18n/locales/ja/app.json';
import jaCommon from '../src/shared/i18n/locales/ja/common.json';
import jaEditor from '../src/shared/i18n/locales/ja/editor.json';
import jaErrors from '../src/shared/i18n/locales/ja/errors.json';
import jaPlayer from '../src/shared/i18n/locales/ja/player.json';

// init() returns a Promise; Vitest's setup module awaits default exports that
// are async functions, but direct top-level awaits aren't possible here, so we
// use beforeAll in the setup file pattern by exporting the promise for test
// files that need it. For most tests the synchronous resources are available
// immediately after init() is called because i18next resolves them synchronously
// when resources are provided inline (no async backend).
i18next.use(initReactI18next).init({
  lng: 'ko',
  fallbackLng: 'en',
  defaultNS: 'app',
  ns: ['app', 'common', 'editor', 'errors', 'player'],
  resources: {
    ko: { app: koApp, common: koCommon, editor: koEditor, errors: koErrors, player: koPlayer },
    en: { app: enApp, common: enCommon, editor: enEditor, errors: enErrors, player: enPlayer },
    ja: { app: jaApp, common: jaCommon, editor: jaEditor, errors: jaErrors, player: jaPlayer },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
