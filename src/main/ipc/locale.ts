import { BrowserWindow } from 'electron';
import { handle, sendToRenderer } from './handle';
import {
  getStoredLocale,
  resolveInitialLocale,
  setStoredLocale,
} from '../store/localeStore';
import { isEnabledLocale } from '../../shared/i18n/types';
import { createMenu } from '../menu';

/**
 * Register locale-related IPC handlers and broadcast helpers.
 *
 * Channels:
 *   - `locale:getInitial`  invoke   → resolves stored | OS | 'en'
 *   - `locale:set`         invoke   → persists, rebuilds menu, broadcasts
 *   - `locale:changed`     send     ← broadcast to all windows
 */
export function registerLocaleIpc(): void {
  handle('locale:getInitial', async () => {
    return resolveInitialLocale();
  });

  handle('locale:set', async (_event, locale) => {
    if (!isEnabledLocale(locale)) {
      // Renderer shouldn't ask for a disabled locale, but be defensive.
      return false;
    }
    const persisted = await setStoredLocale(locale);
    // Rebuild the native menu so accelerators stay attached but labels update.
    createMenu(locale);
    // Broadcast to every renderer window.
    for (const win of BrowserWindow.getAllWindows()) {
      sendToRenderer(win.webContents, 'locale:changed', locale);
    }
    return persisted;
  });
}

export { getStoredLocale, resolveInitialLocale };
