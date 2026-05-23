import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeService } from '../services/LocaleService';
import {
  LOCALE_CODES,
  LOCALE_LABELS,
  type SupportedLocale,
} from '../../shared/i18n/types';

interface LanguageSwitcherProps {
  /** Compact = status-bar style (icon + ISO code). Full = labelled dropdown. */
  variant?: 'compact' | 'full';
}

export function LanguageSwitcher({ variant = 'compact' }: LanguageSwitcherProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<SupportedLocale>(() => localeService.getCurrent());
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reflect main-driven changes (other window, persistence rebroadcast)
  useEffect(() => {
    return localeService.subscribe(setCurrent);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = useCallback(async (locale: SupportedLocale) => {
    if (locale === current || busy) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const result = await localeService.change(locale);
      if (result.ok) {
        // current is updated via subscribe()
      } else if (result.reason === 'load-failed') {
        console.warn('[i18n] failed to load locale:', locale, result.error);
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, [current, busy]);

  const enabled = localeService.getEnabled();

  if (variant === 'compact') {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('language.current', { name: LOCALE_LABELS[current] })}
          className="flex items-center gap-1 px-2 h-6 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
        >
          <Globe size={12} />
          <span>{LOCALE_CODES[current]}</span>
        </button>
        {open && (
          <div
            role="listbox"
            aria-label={t('language.label')}
            className="absolute right-0 bottom-full mb-1 min-w-[160px] bg-zinc-900 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50"
          >
            {enabled.map((locale) => (
              <button
                key={locale}
                role="option"
                aria-selected={locale === current}
                onClick={() => void handleSelect(locale)}
                disabled={busy}
                className={`flex items-center justify-between w-full px-3 py-1.5 text-xs text-left transition-colors ${
                  locale === current
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                } disabled:opacity-50`}
              >
                <span>{LOCALE_LABELS[locale]}</span>
                <span className="font-mono text-[10px] text-zinc-500">{LOCALE_CODES[locale]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full variant — used inside the (future) Preferences modal.
  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-zinc-400 mb-1">{t('language.label')}</label>
      <select
        value={current}
        onChange={(e) => void handleSelect(e.target.value as SupportedLocale)}
        disabled={busy}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {enabled.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]} ({LOCALE_CODES[locale]})
          </option>
        ))}
      </select>
    </div>
  );
}
