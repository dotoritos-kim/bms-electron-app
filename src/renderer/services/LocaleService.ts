/**
 * LocaleService — orchestrates language changes from the renderer side.
 *
 * Responsibilities:
 *   - Boot i18next with the locale supplied by main.
 *   - Apply user-initiated language changes with three guards:
 *       1. requestId — only the most recent change wins (rapid clicks).
 *       2. composition — IME composition is in progress: defer until end.
 *       3. lazy load failure — abort and revert; surface a toast via caller.
 *   - Reflect main-side broadcasts (`locale:changed`) so a change made in one
 *     window propagates to others.
 *
 * The service is a singleton; it owns the in-flight requestId counter and the
 * pending-locale slot used to coalesce composition events.
 */

import { i18next, initI18n } from '../i18n/init';
import {
  ENABLED_LOCALES,
  isEnabledLocale,
  type SupportedLocale,
} from '../../shared/i18n/types';

type LocaleListener = (locale: SupportedLocale) => void;

class LocaleServiceImpl {
  private current: SupportedLocale = 'en';
  private requestId = 0;
  private pendingLocale: SupportedLocale | null = null;
  private isComposing = false;
  private listeners = new Set<LocaleListener>();
  private initialized = false;
  private _initPromise: Promise<void> | null = null;

  /**
   * Boot the service. Must be awaited before any UI renders that depends on
   * translations. Idempotent.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this._initPromise = (async () => {
      const initialLocale = await window.api.locale.getInitial();
      this.current = initialLocale;
      await initI18n(initialLocale);

      // Listen for IME composition globally so a switch mid-input is deferred.
      window.addEventListener('compositionstart', this.onCompositionStart);
      window.addEventListener('compositionend', this.onCompositionEnd);

      // Reflect changes initiated from main (e.g., another window).
      window.api.on('locale:changed', (locale) => {
        if (locale !== this.current) {
          void this.applyLocaleInternal(locale, /* persist */ false);
        }
      });
    })();

    await this._initPromise;
  }

  /** Resolves once init() has fully completed. Safe to call before init(). */
  waitReady(): Promise<void> {
    return this._initPromise ?? Promise.resolve();
  }

  getCurrent(): SupportedLocale {
    return this.current;
  }

  getEnabled(): readonly SupportedLocale[] {
    return ENABLED_LOCALES;
  }

  /** Subscribe to locale changes. Returns an unsubscribe function. */
  subscribe(fn: LocaleListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Change the active locale. Resolves with `true` if the change took effect,
   * `false` if it was superseded, deferred for composition, or rejected.
   */
  async change(
    locale: SupportedLocale,
  ): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'stale' | 'deferred' | 'load-failed'; error?: unknown }> {
    if (!isEnabledLocale(locale)) {
      return { ok: false, reason: 'invalid' };
    }
    if (locale === this.current) {
      return { ok: true };
    }

    if (this.isComposing) {
      this.pendingLocale = locale;
      return { ok: false, reason: 'deferred' };
    }

    return this.applyLocaleInternal(locale, /* persist */ true);
  }

  private async applyLocaleInternal(
    locale: SupportedLocale,
    persist: boolean,
  ): Promise<{ ok: true } | { ok: false; reason: 'stale' | 'load-failed'; error?: unknown }> {
    const reqId = ++this.requestId;

    try {
      // Pre-load namespaces for the target locale before flipping the active
      // language. If this throws, we revert without disturbing the UI.
      await i18next.loadLanguages(locale);
    } catch (err) {
      return { ok: false, reason: 'load-failed', error: err };
    }

    if (reqId !== this.requestId) {
      // Superseded by a newer change() call.
      return { ok: false, reason: 'stale' };
    }

    await i18next.changeLanguage(locale);
    this.current = locale;

    if (persist) {
      // Fire-and-forget; persistence failure is surfaced via the renderer's
      // toast layer using `errors:locale.persistFailed`. Do not block the UI.
      void window.api.locale.set(locale);
    }

    for (const fn of this.listeners) {
      try {
        fn(locale);
      } catch {
        // listener errors are isolated
      }
    }

    return { ok: true };
  }

  private onCompositionStart = (): void => {
    this.isComposing = true;
  };

  private onCompositionEnd = (): void => {
    this.isComposing = false;
    if (this.pendingLocale) {
      const target = this.pendingLocale;
      this.pendingLocale = null;
      void this.applyLocaleInternal(target, true);
    }
  };
}

export const localeService = new LocaleServiceImpl();
