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

// Guard against concurrent dialog calls (Windows queues multiple native dialogs)
let dialogOpen = false;

export function registerFileIpc(): void {
  // Open BMS file dialog
  ipcMain.handle('dialog:openBmsFile', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) { dialogOpen = false; return null; }

    try {
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
    } finally {
      dialogOpen = false;
    }
  });

  // Open BMS folder dialog
  ipcMain.handle('dialog:openBmsFolder', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) { dialogOpen = false; return null; }

    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Open BMS Folder',
        properties: ['openDirectory'],
      });

      refocusWindow(win);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } finally {
      dialogOpen = false;
    }
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

  // Read .bms.meta sidecar file
  ipcMain.handle('file:readMeta', async (_event, bmsFilePath: string) => {
    try {
      const metaPath = bmsFilePath + '.meta';
      const content = await readFile(metaPath, 'utf-8');
      return content;
    } catch {
      return null; // File doesn't exist or unreadable
    }
  });

  // Write .bms.meta sidecar file
  ipcMain.handle('file:saveMeta', async (_event, bmsFilePath: string, content: string) => {
    const metaPath = bmsFilePath + '.meta';
    await writeFile(metaPath, content, 'utf-8');
    return true;
  });

  // Save As dialog + write
  ipcMain.handle('file:saveAs', async (event, content: string, defaultName?: string) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) { dialogOpen = false; return null; }

    try {
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
    } finally {
      dialogOpen = false;
    }
  });

  // Import keysound files: open dialog to pick audio files, copy them to BMS directory
  ipcMain.handle('file:importKeysounds', async (event, bmsFilePath: string) => {
    if (dialogOpen) return [];
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) { dialogOpen = false; return []; }

    try {
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
        if (srcPath !== destPath) {
          await copyFile(srcPath, destPath);
        }
        imported.push({ filename, destPath });
      }

      return imported;
    } finally {
      dialogOpen = false;
    }
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
      if (dialogOpen) return null;
      dialogOpen = true;
      const win = getWindowFromEvent(event);
      if (!win) { dialogOpen = false; return null; }

      try {
        const result = await dialog.showSaveDialog(win, {
          title: '새 BMS 파일 만들기',
          defaultPath: `${opts.title || 'untitled'}.bms`,
          filters: [
            { name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] },
          ],
        });

        refocusWindow(win);
        if (result.canceled || !result.filePath) return null;

        const player = opts.keyMode === '10K' || opts.keyMode === '14K' ? 2 : 1;

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
      } finally {
        dialogOpen = false;
      }
    },
  );

  // Open audio file for slicer
  ipcMain.handle('dialog:openAudioFile', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) { dialogOpen = false; return null; }

    try {
      const result = await dialog.showOpenDialog(win, {
        title: '오디오 파일 열기',
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      refocusWindow(win);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } finally {
      dialogOpen = false;
    }
  });

  // Save WAV slice: receives PCM float32 data and writes as WAV file
  ipcMain.handle(
    'file:saveWavSlice',
    async (
      _event,
      destPath: string,
      pcmData: Float32Array,
      sampleRate: number,
      channels: number,
    ) => {
      const numSamples = pcmData.length / channels;
      const byteRate = sampleRate * channels * 2; // 16-bit
      const blockAlign = channels * 2;
      const dataSize = numSamples * channels * 2;

      const buffer = Buffer.alloc(44 + dataSize);
      // RIFF header
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + dataSize, 4);
      buffer.write('WAVE', 8);
      // fmt chunk
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20); // PCM
      buffer.writeUInt16LE(channels, 22);
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(byteRate, 28);
      buffer.writeUInt16LE(blockAlign, 32);
      buffer.writeUInt16LE(16, 34); // bits per sample
      // data chunk
      buffer.write('data', 36);
      buffer.writeUInt32LE(dataSize, 40);

      // Convert float32 to int16
      for (let i = 0; i < pcmData.length; i++) {
        const val = Math.max(-1, Math.min(1, pcmData[i]));
        const int16 = val < 0 ? val * 0x8000 : val * 0x7fff;
        buffer.writeInt16LE(Math.round(int16), 44 + i * 2);
      }

      await writeFile(destPath, buffer);
      return true;
    },
  );

  // Save multiple WAV slices at once (batch)
  ipcMain.handle(
    'file:saveWavSlices',
    async (
      _event,
      bmsDir: string,
      slices: Array<{ filename: string; pcmData: Float32Array; sampleRate: number; channels: number }>,
    ) => {
      const saved: string[] = [];
      for (const slice of slices) {
        const destPath = join(bmsDir, slice.filename);
        const numSamples = slice.pcmData.length / slice.channels;
        const byteRate = slice.sampleRate * slice.channels * 2;
        const blockAlign = slice.channels * 2;
        const dataSize = numSamples * slice.channels * 2;

        const buffer = Buffer.alloc(44 + dataSize);
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(slice.channels, 22);
        buffer.writeUInt32LE(slice.sampleRate, 24);
        buffer.writeUInt32LE(byteRate, 28);
        buffer.writeUInt16LE(blockAlign, 32);
        buffer.writeUInt16LE(16, 34);
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        for (let i = 0; i < slice.pcmData.length; i++) {
          const val = Math.max(-1, Math.min(1, slice.pcmData[i]));
          const int16 = val < 0 ? val * 0x8000 : val * 0x7fff;
          buffer.writeInt16LE(Math.round(int16), 44 + i * 2);
        }

        await writeFile(destPath, buffer);
        saved.push(slice.filename);
      }
      return saved;
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
