import {
  ENABLED_LOCALES,
  LOCALE_LABELS,
  LOCALE_CODES,
  isSupportedLocale,
  isEnabledLocale,
} from '../../src/shared/i18n/types';

describe('i18n type guards', () => {
  it('recognizes every supported locale', () => {
    for (const locale of ['ko', 'en', 'ja', 'zh', 'es', 'de', 'ru']) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it('rejects unsupported locales and non-strings', () => {
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('KO')).toBe(false); // case-sensitive
    expect(isSupportedLocale(123)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('isEnabledLocale gates dark languages', () => {
    expect(isEnabledLocale('ko')).toBe(true);
    expect(isEnabledLocale('en')).toBe(true);
    // ja is supported but not yet enabled in phase i18n-1
    expect(isEnabledLocale('ja')).toBe(ENABLED_LOCALES.includes('ja'));
  });

  it('every supported locale has a label and code', () => {
    for (const locale of ['ko', 'en', 'ja', 'zh', 'es', 'de', 'ru'] as const) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(LOCALE_CODES[locale]).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('ENABLED_LOCALES is non-empty and contains only supported locales', () => {
    expect(ENABLED_LOCALES.length).toBeGreaterThan(0);
    for (const locale of ENABLED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });
});
