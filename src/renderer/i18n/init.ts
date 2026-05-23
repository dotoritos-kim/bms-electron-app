/**
 * i18next instance for the renderer.
 *
 * Design constraints:
 *   - Suspense mode is enabled so route-level <Suspense> boundaries can show
 *     a loading shim while the active namespace is fetched.
 *   - Resources are loaded through `i18next-resources-to-backend` which
 *     dynamically `import()`s the JSON files. Vite splits each file into its
 *     own chunk so cold boot loads only the active locale's `common`.
 *   - The initial locale is supplied by main via the `locale:getInitial` IPC
 *     channel; the renderer treats `i18n.init({ lng })` as the source of truth
 *     and never inspects `navigator.language` (Electron's renderer reports the
 *     OS locale unreliably across platforms).
 */

import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  NAMESPACES,
  type Namespace,
  type SupportedLocale,
} from '../../shared/i18n/types';

let initPromise: Promise<I18nInstance> | null = null;

const backend = resourcesToBackend(async (language: string, namespace: string) => {
  // Vite handles the dynamic import — it splits each JSON into a chunk.
  const mod = (await import(`../../shared/i18n/locales/${language}/${namespace}.json`)) as {
    default: Record<string, unknown>;
  };
  return mod.default;
});

const isDev = import.meta.env.DEV;

/**
 * Initialize i18next exactly once. Safe to call multiple times — subsequent
 * calls return the same in-flight promise.
 */
export function initI18n(initialLocale: SupportedLocale): Promise<I18nInstance> {
  if (initPromise) return initPromise;

  const promise = i18next
    .use(backend)
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      fallbackLng: FALLBACK_LOCALE,
      defaultNS: 'app',
      // 5 namespaces total / 정렬된 ko+en 합계 1,078줄 — 모두 preload해도 비용 무시 수준이며
      // E2E에서 dialog 진입 직후 raw key가 노출되는 문제를 막는다.
      ns: ['common', 'app', 'editor', 'errors', 'player'],
      load: 'languageOnly',
      interpolation: { escapeValue: false }, // React already escapes
      react: {
        // Suspense is disabled so the App tree mounts immediately even before
        // namespaces finish loading. The 5 namespaces are preloaded at boot
        // (`ns: [...]` above) so the raw-key window is short, and t() will
        // re-render automatically once each namespace lands.
        useSuspense: false,
      },
      returnNull: false,
      saveMissing: isDev,
      missingKeyHandler: isDev
        ? (lngs: readonly string[], ns: string, key: string) => {
            console.warn(`[i18n] missing key: ${ns}:${key} for locale=${lngs.join(',')}`);
          }
        : undefined,
    })
    .then(() => i18next);

  initPromise = promise;
  return promise;
}

export { DEFAULT_LOCALE, FALLBACK_LOCALE, NAMESPACES };
export type { Namespace, SupportedLocale };
export { i18next };
