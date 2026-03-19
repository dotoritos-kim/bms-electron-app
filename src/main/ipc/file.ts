import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';

const BMS_EXTENSIONS = new Set(['.bms', '.bme', '.bml', '.pms', '.bmson']);

export interface BmsFileInfo {
  name: string;
  path: string;
  size: number;
  ext: string;
}

export function registerFileIpc(): void {
  // Open BMS file dialog
  ipcMain.handle('dialog:openBmsFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: 'Open BMS File',
      filters: [
        { name: 'BMS Files', extensions: ['bms', 'bme', 'bml', 'pms', 'bmson'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Open BMS folder dialog
  ipcMain.handle('dialog:openBmsFolder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: 'Open BMS Folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Read BMS file as buffer
  ipcMain.handle('file:readBms', async (_event, filePath: string) => {
    const buffer = await readFile(filePath);
    return buffer;
  });

  // Save BMS file
  ipcMain.handle('file:saveBms', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8');
    return true;
  });

  // Save As dialog + write
  ipcMain.handle('file:saveAs', async (_event, content: string, defaultName?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showSaveDialog(win, {
      title: 'Save BMS File',
      defaultPath: defaultName,
      filters: [
        { name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, content, 'utf-8');
    return result.filePath;
  });

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
