import { ipcMain } from 'electron';
import { readFile, readdir } from 'fs/promises';
import { join, dirname, parse } from 'path';

const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3', '.flac']);

export function registerAudioIpc(): void {
  // Read a single audio file as ArrayBuffer
  ipcMain.handle('audio:readFile', async (_event, filePath: string) => {
    const buffer = await readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  // Batch read audio files from a BMS folder
  // Given the BMS file path and a keysound map { id: filename }, reads all audio files
  ipcMain.handle(
    'audio:readBatch',
    async (_event, bmsFilePath: string, keysoundMap: Record<string, string>) => {
      const dir = dirname(bmsFilePath);
      const results: Record<string, ArrayBuffer> = {};
      const errors: Record<string, string> = {};

      // Build a baseName (lowercase, no ext) → actual file path lookup from directory listing
      let dirFiles: string[];
      try {
        dirFiles = await readdir(dir);
      } catch {
        return { results, errors: Object.fromEntries(entries.map(([id, f]) => [id, `Directory not found: ${dir}`])) };
      }
      const baseNameToPath = new Map<string, string>();
      for (const f of dirFiles) {
        const parsed = parse(f);
        if (AUDIO_EXTENSIONS.has(parsed.ext.toLowerCase())) {
          baseNameToPath.set(parsed.name.toLowerCase(), join(dir, f));
        }
      }

      const entries = Object.entries(keysoundMap);

      // Process in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ([id, filename]) => {
            const baseName = parse(filename).name.toLowerCase();
            const resolvedPath = baseNameToPath.get(baseName);

            if (resolvedPath) {
              try {
                const buffer = await readFile(resolvedPath);
                results[id] = buffer.buffer.slice(
                  buffer.byteOffset,
                  buffer.byteOffset + buffer.byteLength,
                );
              } catch (err) {
                errors[id] = err instanceof Error ? err.message : 'Read failed';
              }
            } else {
              errors[id] = `Not found: ${filename}`;
            }
          }),
        );
      }

      return { results, errors };
    },
  );
}
