/**
 * Persistent locale storage backed by electron-store.
 *
 * Main is the SSOT for the user's chosen locale. The renderer reads the
 * initial value via the `locale:getInitial` IPC channel and any subsequent
 * change goes back through `locale:set` so this module always reflects truth.
 *
 * Failure modes:
 *   - First boot, no stored value: `app.getLocale()` is normalized to a
 *     SupportedLocale; if that fails too we fall back to en.
 *   - electron-store write fails (rare; disk full / EPERM): we log and keep
 *     the value in memory so the session continues. The renderer surfaces a
 *     toast warning via the `locale.persistFailed` error key.
 */

import { app } from 'electron';
import { isSupportedLocale, type SupportedLocale } from '../../shared/i18n/types';

interface StoreShape {
  locale?: SupportedLocale;
}

type ElectronStore = {
  get<K extends keyof StoreShape>(key: K): StoreShape[K];
  set<K extends keyof StoreShape>(key: K, value: StoreShape[K]): void;
};

let storePromise: Promise<ElectronStore> | null = null;

async function getStore(): Promise<ElectronStore> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    // electron-store v10+ is ESM-only. Dynamic import works from CJS main.
    const mod = (await import('electron-store')) as unknown as {
      default: new (opts?: unknown) => ElectronStore;
    };
    return new mod.default({ name: 'preferences' });
  })();
  return storePromise;
}

/**
 * Map an arbitrary OS locale string to a SupportedLocale.
 * Examples: "ko-KR" → "ko", "en-US" → "en", "fr-FR" → fallback.
 */
function normalizeOsLocale(raw: string | undefined): SupportedLocale | null {
  if (!raw) return null;
  const lang = raw.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(lang) ? lang : null;
}

export async function getStoredLocale(): Promise<SupportedLocale | null> {
  try {
    const store = await getStore();
    const value = store.get('locale');
    return value && isSupportedLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export async function setStoredLocale(locale: SupportedLocale): Promise<boolean> {
  try {
    const store = await getStore();
    store.set('locale', locale);
    return true;
  } catch (err) {
    console.warn('[localeStore] persist failed:', err);
    return false;
  }
}

/**
 * Resolve the initial locale at boot:
 *   1. value persisted by a previous session
 *   2. --lang CLI switch (e.g. tests pass --lang=ja; Electron itself doesn't
 *      surface this through app.getLocale() on all platforms)
 *   3. OS locale, if it maps to a SupportedLocale
 *   4. fallback to 'en'
 */
export async function resolveInitialLocale(): Promise<SupportedLocale> {
  const stored = await getStoredLocale();
  if (stored) return stored;

  try {
    const cliLang = app.commandLine?.getSwitchValue('lang');
    const fromCli = normalizeOsLocale(cliLang);
    if (fromCli) return fromCli;
  } catch {
    // commandLine may be unavailable in unit-test mocks
  }

  try {
    const fromOs = normalizeOsLocale(app.getLocale());
    if (fromOs) return fromOs;
  } catch {
    // app may be unavailable in unit-test contexts where electron is mocked
    // without an `app` export. Fall through to the en default.
  }

  return 'en';
}
