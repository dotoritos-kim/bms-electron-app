import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile, readdir, stat, copyFile, rename, unlink } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';

const BMS_EXTENSIONS = new Set(['.bms', '.bme', '.bml', '.pms', '.bmson']);

export interface BmsFileInfo {
  name: string;
  path: string;
  size: number;
  ext: string;
}

function getWindowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function refocusWindow(win: BrowserWindow): void {
  // On Windows, the parent window can lose focus/input after a modal dialog is dismissed
  if (process.platform === 'win32') {
    win.focus();
  }
}

export function registerFileIpc(): void {
  // Open BMS file dialog
  ipcMain.handle('dialog:openBmsFile', async (event) => {
    const win = getWindowFromEvent(event);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: 'Open BMS File',
      filters: [
        { name: 'BMS Files', extensions: ['bms', 'bme', 'bml', 'pms', 'bmson'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    refocusWindow(win);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Open BMS folder dialog
  ipcMain.handle('dialog:openBmsFolder', async (event) => {
    const win = getWindowFromEvent(event);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: 'Open BMS Folder',
      properties: ['openDirectory'],
    });

    refocusWindow(win);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Read BMS file as buffer
  ipcMain.handle('file:readBms', async (_event, filePath: string) => {
    const buffer = await readFile(filePath);
    return buffer;
  });

  // Save BMS file (atomic: write to temp, then rename)
  ipcMain.handle('file:saveBms', async (_event, filePath: string, content: string) => {
    const tmpPath = filePath + '.tmp';
    await writeFile(tmpPath, content, 'utf-8');
    try {
      await rename(tmpPath, filePath);
    } catch {
      // rename can fail across drives on Windows; fall back to direct write + cleanup
      await writeFile(filePath, content, 'utf-8');
      await unlink(tmpPath).catch(() => {});
    }
    return true;
  });

  // Save As dialog + write
  ipcMain.handle('file:saveAs', async (event, content: string, defaultName?: string) => {
    const win = getWindowFromEvent(event);
    if (!win) return null;

    const result = await dialog.showSaveDialog(win, {
      title: 'Save BMS File',
      defaultPath: defaultName,
      filters: [
        { name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    refocusWindow(win);
    if (result.canceled || !result.filePath) return null;
    const tmpPath = result.filePath + '.tmp';
    await writeFile(tmpPath, content, 'utf-8');
    try {
      await rename(tmpPath, result.filePath);
    } catch {
      await writeFile(result.filePath, content, 'utf-8');
      await unlink(tmpPath).catch(() => {});
    }
    return result.filePath;
  });

  // Import keysound files: open dialog to pick audio files, copy them to BMS directory
  ipcMain.handle('file:importKeysounds', async (event, bmsFilePath: string) => {
    const win = getWindowFromEvent(event);
    if (!win) return [];

    const result = await dialog.showOpenDialog(win, {
      title: '키음 파일 가져오기',
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'ogg', 'mp3', 'flac'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    refocusWindow(win);
    if (result.canceled || result.filePaths.length === 0) return [];

    const bmsDir = dirname(bmsFilePath);
    const imported: Array<{ filename: string; destPath: string }> = [];

    for (const srcPath of result.filePaths) {
      const filename = basename(srcPath);
      const destPath = join(bmsDir, filename);
      // Don't overwrite if src === dest
      if (srcPath !== destPath) {
        await copyFile(srcPath, destPath);
      }
      imported.push({ filename, destPath });
    }

    return imported;
  });

  // Write autosave file
  ipcMain.handle('file:writeAutoSave', async (_event, filePath: string, content: string) => {
    const autoPath = filePath + '.autosave';
    await writeFile(autoPath, content, 'utf-8');
    return true;
  });

  // Check for autosave file (returns content if newer than main file, null otherwise)
  ipcMain.handle('file:checkAutoSave', async (_event, filePath: string) => {
    const autoPath = filePath + '.autosave';
    try {
      const [mainStat, autoStat] = await Promise.all([
        stat(filePath).catch(() => null),
        stat(autoPath).catch(() => null),
      ]);
      if (!autoStat) return null;
      if (!mainStat || autoStat.mtimeMs > mainStat.mtimeMs) {
        const content = await readFile(autoPath, 'utf-8');
        return content;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Delete autosave file
  ipcMain.handle('file:deleteAutoSave', async (_event, filePath: string) => {
    const autoPath = filePath + '.autosave';
    await unlink(autoPath).catch(() => {});
    return true;
  });

  // Create new BMS file
  ipcMain.handle(
    'file:createNewBms',
    async (
      event,
      opts: { title: string; artist: string; bpm: number; keyMode: string },
    ) => {
      const win = getWindowFromEvent(event);
      if (!win) return null;

      const result = await dialog.showSaveDialog(win, {
        title: '새 BMS 파일 만들기',
        defaultPath: `${opts.title || 'untitled'}.bms`,
        filters: [
          { name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] },
        ],
      });

      refocusWindow(win);
      if (result.canceled || !result.filePath) return null;

      // Determine player mode from keyMode
      const player = opts.keyMode === '10K' || opts.keyMode === '14K' ? 2 : 1;

      // Generate minimal BMS content
      const lines: string[] = [
        `#PLAYER ${player}`,
        `#GENRE `,
        `#TITLE ${opts.title || 'Untitled'}`,
        `#ARTIST ${opts.artist || ''}`,
        `#BPM ${opts.bpm || 130}`,
        `#PLAYLEVEL 1`,
        `#RANK 3`,
        '',
        '*---------------------- HEADER FIELD',
        '',
        '*---------------------- MAIN DATA FIELD',
        '',
      ];
      const content = lines.join('\n');

      const tmpPath = result.filePath + '.tmp';
      await writeFile(tmpPath, content, 'utf-8');
      try {
        await rename(tmpPath, result.filePath);
      } catch {
        await writeFile(result.filePath, content, 'utf-8');
        await unlink(tmpPath).catch(() => {});
      }

      return {
        path: result.filePath,
        name: basename(result.filePath),
        folderPath: dirname(result.filePath),
      };
    },
  );

  // List BMS files in folder (recursive)
  ipcMain.handle('file:listBmsFolder', async (_event, folderPath: string) => {
    const files: BmsFileInfo[] = [];
    await scanDir(folderPath, files);
    return files;
  });
}

async function scanDir(dirPath: string, results: BmsFileInfo[], depth = 0): Promise<void> {
  if (depth > 5) return; // Limit recursion depth

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await scanDir(fullPath, results, depth + 1);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (BMS_EXTENSIONS.has(ext)) {
        const info = await stat(fullPath);
        results.push({
          name: basename(entry.name),
          path: fullPath,
          size: info.size,
          ext,
        });
      }
    }
  }
}
