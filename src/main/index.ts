import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { registerFileIpc } from './ipc/file';
import { registerAudioIpc } from './ipc/audio';
import { registerLocaleIpc, resolveInitialLocale } from './ipc/locale';
import { createMenu } from './menu';

let mainWindow: BrowserWindow | null = null;

function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in the system browser — http(s) only. Any other
  // scheme (file:, javascript:, custom protocol handlers) is dropped so a
  // crafted chart cannot launch local programs through the renderer.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  // Keep the renderer on the app's own document: block full-page navigation
  // away from it and hand safe external URLs to the system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (url === current) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });

  // Dev: load from vite dev server. Prod: load built HTML.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // Register IPC handlers
  registerFileIpc();
  registerAudioIpc();
  registerLocaleIpc();

  // Create app menu in the resolved locale
  const initialLocale = await resolveInitialLocale();
  createMenu(initialLocale);

  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
