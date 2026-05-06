import '@testing-library/jest-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Load all ko + en locale JSON files synchronously for tests
import koApp from '../src/shared/i18n/locales/ko/app.json';
import koCommon from '../src/shared/i18n/locales/ko/common.json';
import koEditor from '../src/shared/i18n/locales/ko/editor.json';
import koErrors from '../src/shared/i18n/locales/ko/errors.json';
import enApp from '../src/shared/i18n/locales/en/app.json';
import enCommon from '../src/shared/i18n/locales/en/common.json';
import enEditor from '../src/shared/i18n/locales/en/editor.json';
import enErrors from '../src/shared/i18n/locales/en/errors.json';

i18next.use(initReactI18next).init({
  lng: 'ko',
  fallbackLng: 'en',
  defaultNS: 'app',
  ns: ['app', 'common', 'editor', 'errors'],
  resources: {
    ko: { app: koApp, common: koCommon, editor: koEditor, errors: koErrors },
    en: { app: enApp, common: enCommon, editor: enEditor, errors: enErrors },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
