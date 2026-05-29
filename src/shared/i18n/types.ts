/**
 * i18n type definitions shared between main, preload, and renderer.
 *
 * The `SupportedLocale` universe is duplicated in `ipc-contract.ts` to avoid
 * circular shared-package layering. Keep them in sync — the `_assert` line
 * below produces a compile error if they drift.
 */

import type { SupportedLocale as IpcSupportedLocale } from '../ipc-contract';

export type SupportedLocale = IpcSupportedLocale;

/**
 * Locales surfaced to users at runtime. Phase i18n-1 ships ko + en;
 * additional locales are gated until their translations are reviewed.
 *
 * Mutate this constant — never `SupportedLocale` — to enable a new language.
 */
export const ENABLED_LOCALES: readonly SupportedLocale[] = ['ko', 'en', 'ja'] as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** Native-script display names — never translated. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
  de: 'Deutsch',
  ru: 'Русский',
};

/** ISO codes shown in the compact status-bar indicator. */
export const LOCALE_CODES: Record<SupportedLocale, string> = {
  ko: 'KO',
  en: 'EN',
  ja: 'JA',
  zh: 'ZH',
  es: 'ES',
  de: 'DE',
  ru: 'RU',
};

/**
 * Namespaces. Loaded lazily per route. Keep namespaces small and
 * orthogonal — duplicate keys across namespaces force a fallback chain.
 *
 * - `common`  — shared UI vocabulary (actions, status, language switcher)
 * - `app`     — shell-level strings (App.tsx navigation, errors)
 * - `errors`  — runtime error messages surfaced as toasts
 * - `editor`  — strings owned by the bms-editor library (forwarded to its I18nContext)
 * - `player`  — strings owned by the bms-player library
 */
export const NAMESPACES = ['common', 'app', 'errors', 'editor', 'player'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === 'string' &&
    (['ko', 'en', 'ja', 'zh', 'es', 'de', 'ru'] satisfies SupportedLocale[]).includes(
      value as SupportedLocale,
    )
  );
}

export function isEnabledLocale(value: unknown): value is SupportedLocale {
  return isSupportedLocale(value) && ENABLED_LOCALES.includes(value);
}
