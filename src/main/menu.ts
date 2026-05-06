import { Menu, BrowserWindow } from 'electron';
import { sendToRenderer } from './ipc/handle';
import { t } from './i18n/menu';
import type { SupportedLocale } from '../shared/ipc-contract';

export function createMenu(locale: SupportedLocale = 'en'): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: t(locale, 'menu.file'),
      submenu: [
        {
          label: t(locale, 'menu.openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) sendToRenderer(win.webContents, 'menu:openFile');
          },
        },
        {
          label: t(locale, 'menu.openFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) sendToRenderer(win.webContents, 'menu:openFolder');
          },
        },
        { type: 'separator' },
        {
          label: t(locale, 'menu.save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) sendToRenderer(win.webContents, 'menu:save');
          },
        },
        {
          label: t(locale, 'menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) sendToRenderer(win.webContents, 'menu:saveAs');
          },
        },
        { type: 'separator' },
        { role: 'quit', label: t(locale, 'menu.quit') },
      ],
    },
    {
      label: t(locale, 'menu.edit'),
      submenu: [
        { role: 'undo', label: t(locale, 'menu.undo') },
        { role: 'redo', label: t(locale, 'menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t(locale, 'menu.cut') },
        { role: 'copy', label: t(locale, 'menu.copy') },
        { role: 'paste', label: t(locale, 'menu.paste') },
        { role: 'selectAll', label: t(locale, 'menu.selectAll') },
      ],
    },
    {
      label: t(locale, 'menu.view'),
      submenu: [
        { role: 'reload', label: t(locale, 'menu.reload') },
        { role: 'forceReload', label: t(locale, 'menu.forceReload') },
        { role: 'toggleDevTools', label: t(locale, 'menu.toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t(locale, 'menu.resetZoom') },
        { role: 'zoomIn', label: t(locale, 'menu.zoomIn') },
        { role: 'zoomOut', label: t(locale, 'menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t(locale, 'menu.toggleFullScreen') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
