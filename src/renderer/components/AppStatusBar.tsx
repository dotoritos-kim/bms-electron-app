import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Slim status bar pinned to the bottom of the app shell. Right-aligned
 * controls live here (today: language switcher; future: connection state,
 * sync indicator, etc.).
 */
export function AppStatusBar() {
  return (
    <div className="flex items-center justify-end h-6 px-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-400 select-none">
      <LanguageSwitcher variant="compact" />
    </div>
  );
}
