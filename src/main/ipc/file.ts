import { dialog, BrowserWindow } from 'electron';
import { readFile, writeFile, readdir, stat, copyFile, rename, unlink } from 'fs/promises';
import { join, extname, basename, dirname, resolve } from 'path';
import { handle } from './handle';
import type { BmsFileInfo } from '../../shared/ipc-contract';
import { t as tMenu } from '../i18n/menu';
import {
  assertBmsPath,
  assertDirPath,
  assertFileContent,
  assertFileName,
  assertPathString,
  assertString,
  assertWritableBmsPath,
  AUDIO_EXTENSIONS,
  BMS_EXTENSIONS,
  IpcValidationError,
  WRITABLE_BMS_EXTENSIONS,
} from './validate';
import { resolveInitialLocale } from '../store/localeStore';

/** Text is written as UTF-8; bytes (an already-encoded chart) as they are. */
function writeContent(path: string, content: string | Uint8Array): Promise<void> {
  return typeof content === 'string' ? writeFile(path, content, 'utf-8') : writeFile(path, content);
}

/**
 * Replaces `filePath` through `<filePath>.tmp`. The temp file is removed in
 * every outcome, so a save that fails (read-only or locked chart) leaves
 * nothing behind in the chart folder.
 */
async function writeChartAtomically(filePath: string, content: string | Uint8Array): Promise<void> {
  const tmpPath = filePath + '.tmp';
  let renamed = false;
  try {
    await writeContent(tmpPath, content);
    try {
      await rename(tmpPath, filePath);
      renamed = true;
    } catch {
      // rename can fail across drives on Windows; fall back to a direct write
      await writeContent(filePath, content);
    }
  } finally {
    // After a successful rename the temp name no longer exists; otherwise remove it
    if (!renamed) await unlink(tmpPath).catch(() => {});
  }
}

/**
 * The name a chart is written under. The writer only produces BMS text, so a
 * name with another extension (`.bmson`, `.txt`, none) gets `.bms` in place
 * of it. A name that already ends in a chart extension is kept as it is.
 */
function toWritableChartPath(filePath: string): string {
  if (WRITABLE_BMS_EXTENSIONS.has(extname(filePath).toLowerCase())) return filePath;
  return join(dirname(filePath), basename(filePath, extname(filePath)) + '.bms');
}

/**
 * Where a Save As / New File write goes. When the extension had to change, the
 * adjusted name must not silently replace another chart the dialog did not show.
 */
async function resolveSaveTarget(dialogPath: string): Promise<string> {
  const target = toWritableChartPath(dialogPath);
  if (target !== dialogPath && (await stat(target).then(() => true, () => false))) {
    throw new IpcValidationError(`${basename(target)} already exists`);
  }
  return target;
}

/** Upper bound for the `name (n)` search, so a crowded folder cannot loop forever. */
const MAX_FREE_NAME_TRIES = 999;

/** Lower-cased names already in the folder (case-insensitive on Windows). */
async function folderNames(dir: string): Promise<Set<string>> {
  try {
    return new Set(((await readdir(dir)) ?? []).map((n) => String(n).toLowerCase()));
  } catch {
    return new Set(); // unreadable folder: nothing to collide with
  }
}

/**
 * `name` if it is not in `taken`, otherwise `name (2)`, `name (3)` ... The chosen
 * name is added to `taken`, so one batch never reuses a name.
 */
function freeFileName(name: string, taken: Set<string>): string {
  const ext = extname(name);
  const base = basename(name, ext);
  for (let n = 1; n <= MAX_FREE_NAME_TRIES; n++) {
    const candidate = n === 1 ? name : `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  throw new IpcValidationError(`no free file name left for ${name}`);
}

export type { BmsFileInfo };

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

/** Same file system path (case-insensitive where the OS file system is). */
function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? ra.toLowerCase() === rb.toLowerCase()
    : ra === rb;
}

/** True when both files have identical bytes (cheap size check first). */
async function sameContent(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([stat(a), stat(b)]);
    if (sa.size !== sb.size) return false;
    const [ba, bb] = await Promise.all([readFile(a), readFile(b)]);
    return ba.equals(bb);
  } catch {
    return false;
  }
}

export function registerFileIpc(): void {
  // Open BMS file dialog
  handle('dialog:openBmsFile', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) {
      dialogOpen = false;
      return null;
    }

    try {
      const locale = await resolveInitialLocale();
      const result = await dialog.showOpenDialog(win, {
        title: tMenu(locale, 'dialog.openBmsFile'),
        filters: [
          { name: 'BMS Files', extensions: ['bms', 'bme', 'bml', 'pms', 'bmson'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      refocusWindow(win);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    } finally {
      dialogOpen = false;
    }
  });

  // Open BMS folder dialog
  handle('dialog:openBmsFolder', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) {
      dialogOpen = false;
      return null;
    }

    try {
      const locale = await resolveInitialLocale();
      const result = await dialog.showOpenDialog(win, {
        title: tMenu(locale, 'dialog.openBmsFolder'),
        properties: ['openDirectory'],
      });

      refocusWindow(win);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    } finally {
      dialogOpen = false;
    }
  });

  // Read BMS file as buffer (Electron serialises Buffer→Uint8Array on the renderer side)
  handle('file:readBms', async (_event, rawPath: string) => {
    const filePath = assertBmsPath(rawPath, 'filePath');
    const buffer = await readFile(filePath);
    return buffer as unknown as Uint8Array;
  });

  // Save BMS file (atomic: write to temp, then rename)
  handle('file:saveBms', async (_event, rawPath: string, rawContent: string | Uint8Array) => {
    const filePath = assertWritableBmsPath(rawPath, 'filePath');
    const content = assertFileContent(rawContent, 'content');
    await writeChartAtomically(filePath, content);
    return true;
  });

  // Read .bms.meta sidecar file
  handle('file:readMeta', async (_event, rawPath: string) => {
    const bmsFilePath = assertBmsPath(rawPath, 'bmsFilePath');
    try {
      const metaPath = bmsFilePath + '.meta';
      const content = await readFile(metaPath, 'utf-8');
      return content;
    } catch {
      return null; // File doesn't exist or unreadable
    }
  });

  // Write .bms.meta sidecar file
  handle('file:saveMeta', async (_event, rawPath: string, rawContent: string) => {
    const bmsFilePath = assertWritableBmsPath(rawPath, 'bmsFilePath');
    const content = assertString(rawContent, 'content');
    const metaPath = bmsFilePath + '.meta';
    await writeFile(metaPath, content, 'utf-8');
    return true;
  });

  // Save As dialog + write
  handle('file:saveAs', async (event, rawContent: string | Uint8Array, defaultName?: string) => {
    const content = assertFileContent(rawContent, 'content');
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) {
      dialogOpen = false;
      return null;
    }

    try {
      const locale = await resolveInitialLocale();
      const result = await dialog.showSaveDialog(win, {
        title: tMenu(locale, 'dialog.saveBmsFile'),
        defaultPath: defaultName,
        filters: [
          { name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      refocusWindow(win);
      if (result.canceled || !result.filePath) return null;
      const target = await resolveSaveTarget(result.filePath);
      await writeChartAtomically(target, content);
      return target;
    } finally {
      dialogOpen = false;
    }
  });

  // Import keysound files: open dialog to pick audio files, copy them to BMS directory
  handle('file:importKeysounds', async (event, rawPath: string) => {
    const bmsFilePath = assertBmsPath(rawPath, 'bmsFilePath');
    if (dialogOpen) return [];
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) {
      dialogOpen = false;
      return [];
    }

    try {
      const locale = await resolveInitialLocale();
      const result = await dialog.showOpenDialog(win, {
        title: tMenu(locale, 'dialog.importKeysound'),
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
      // Keysounds are resolved by base name (kick.wav ≈ kick.ogg), so a new
      // file must not take a base name another audio file already uses.
      let dirEntries: string[] = [];
      try {
        dirEntries = (await readdir(bmsDir)) ?? [];
      } catch {
        // Unreadable folder: nothing to collide with.
      }
      const takenBases = new Map<string, string>(); // lower base → actual file name
      for (const f of dirEntries) {
        if (AUDIO_EXTENSIONS.has(extname(f).toLowerCase())) {
          takenBases.set(basename(f, extname(f)).toLowerCase(), f);
        }
      }

      for (const srcPath of result.filePaths) {
        // Only audio is copied: a select-all pick must not bring charts or other files into the folder
        if (!AUDIO_EXTENSIONS.has(extname(srcPath).toLowerCase())) continue;
        const original = basename(srcPath);
        const ext = extname(original);
        const base = basename(original, ext);
        const samePlace = (p: string) => samePath(p, srcPath);

        let filename = original;
        const existing = takenBases.get(base.toLowerCase());
        if (existing !== undefined) {
          const existingPath = join(bmsDir, existing);
          if (samePlace(existingPath) || (await sameContent(srcPath, existingPath))) {
            // Already in the chart folder (or an identical copy): reuse it.
            imported.push({ filename: existing, destPath: existingPath });
            continue;
          }
          // Different audio under the same name: never overwrite. Pick a free name.
          let n = 2;
          while (takenBases.has(`${base}_${n}`.toLowerCase())) n++;
          filename = `${base}_${n}${ext}`;
        }
        const destPath = join(bmsDir, filename);
        if (!samePlace(destPath)) {
          await copyFile(srcPath, destPath);
        }
        takenBases.set(basename(filename, ext).toLowerCase(), filename);
        imported.push({ filename, destPath });
      }

      return imported;
    } finally {
      dialogOpen = false;
    }
  });

  // Write autosave file
  handle('file:writeAutoSave', async (_event, rawPath: string, rawContent: string) => {
    // Autosave stays UTF-8 text: it is read back with checkAutoSave as text and
    // re-encoded on recovery like any other save.
    const filePath = assertWritableBmsPath(rawPath, 'filePath');
    const content = assertString(rawContent, 'content');
    const autoPath = filePath + '.autosave';
    await writeFile(autoPath, content, 'utf-8');
    return true;
  });

  // Check for autosave file (returns content if newer than main file, null otherwise)
  handle('file:checkAutoSave', async (_event, rawPath: string) => {
    const filePath = assertBmsPath(rawPath, 'filePath');
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
  handle('file:deleteAutoSave', async (_event, rawPath: string) => {
    const filePath = assertBmsPath(rawPath, 'filePath');
    const autoPath = filePath + '.autosave';
    await unlink(autoPath).catch(() => {});
    return true;
  });

  // Create new BMS file
  handle(
    'file:createNewBms',
    async (event, opts: { title: string; artist: string; bpm: number; keyMode: string }) => {
      if (dialogOpen) return null;
      dialogOpen = true;
      const win = getWindowFromEvent(event);
      if (!win) {
        dialogOpen = false;
        return null;
      }

      try {
        const locale = await resolveInitialLocale();
        const result = await dialog.showSaveDialog(win, {
          title: tMenu(locale, 'dialog.newBms'),
          defaultPath: `${opts.title || 'untitled'}.bms`,
          filters: [{ name: 'BMS Files', extensions: ['bms', 'bme', 'bml'] }],
        });

        refocusWindow(win);
        if (result.canceled || !result.filePath) return null;

        const player = opts.keyMode === '10K' || opts.keyMode === '14K' ? 2 : 1;

        const lines: string[] = [
          `#PLAYER ${player}`,
          `#KEYMODE ${opts.keyMode}`,
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

        const target = await resolveSaveTarget(result.filePath);
        await writeChartAtomically(target, content);
        // The replaced chart's sidecar and autosave belong to the old chart;
        // the new one must not inherit its bookmarks, colours or key mode.
        await Promise.all([target + '.meta', target + '.autosave'].map((p) => unlink(p).catch(() => {})));

        return {
          path: target,
          name: basename(target),
          folderPath: dirname(target),
        };
      } finally {
        dialogOpen = false;
      }
    },
  );

  // Open audio file for slicer
  handle('dialog:openAudioFile', async (event) => {
    if (dialogOpen) return null;
    dialogOpen = true;
    const win = getWindowFromEvent(event);
    if (!win) {
      dialogOpen = false;
      return null;
    }

    try {
      const locale = await resolveInitialLocale();
      const result = await dialog.showOpenDialog(win, {
        title: tMenu(locale, 'dialog.openAudio'),
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      refocusWindow(win);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    } finally {
      dialogOpen = false;
    }
  });

  // Save WAV slice: receives PCM float32 data and writes as WAV file
  handle(
    'file:saveWavSlice',
    async (
      _event,
      rawDestPath: string,
      pcmData: Float32Array,
      sampleRate: number,
      channels: number,
    ) => {
      const destPath = assertPathString(rawDestPath, 'destPath');
      if (!AUDIO_EXTENSIONS.has(extname(destPath).toLowerCase())) {
        throw new Error('destPath must have an audio extension');
      }
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
  handle(
    'file:saveWavSlices',
    async (
      _event,
      rawBmsDir: string,
      slices: Array<{
        filename: string;
        pcmData: Float32Array;
        sampleRate: number;
        channels: number;
      }>,
    ) => {
      const bmsDir = assertDirPath(rawBmsDir, 'bmsDir');
      const saved: string[] = [];
      const taken = await folderNames(bmsDir);
      for (const slice of slices) {
        // Never replace a file that is already in the chart folder: take the next free name.
        const destName = freeFileName(assertFileName(slice.filename, 'slice.filename'), taken);
        const destPath = join(bmsDir, destName);
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
        saved.push(destName);
      }
      return saved;
    },
  );

  // List BMS files in folder (recursive)
  handle('file:listBmsFolder', async (_event, rawFolderPath: string) => {
    const folderPath = assertDirPath(rawFolderPath, 'folderPath');
    // Phase 1: collect all BMS paths (readdir only, no stat)
    const paths: Array<{ name: string; path: string; ext: string }> = [];
    await collectBmsPaths(folderPath, paths);

    // Phase 2: stat in parallel batches of 20
    const BATCH_SIZE = 20;
    const results: BmsFileInfo[] = [];
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE);
      const statted = await Promise.all(
        batch.map(async (p) => {
          const info = await stat(p.path);
          return { name: p.name, path: p.path, size: info.size, ext: p.ext };
        }),
      );
      results.push(...statted);
    }
    return results;
  });
}

async function collectBmsPaths(
  dirPath: string,
  results: Array<{ name: string; path: string; ext: string }>,
  depth = 0,
): Promise<void> {
  if (depth > 5) return; // Limit recursion depth

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectBmsPaths(fullPath, results, depth + 1);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (BMS_EXTENSIONS.has(ext)) {
        results.push({ name: basename(entry.name), path: fullPath, ext });
      }
    }
  }
}
