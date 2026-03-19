import { ipcMain } from 'electron';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const AUDIO_EXTENSIONS = ['.wav', '.ogg', '.mp3', '.flac'];

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

      const entries = Object.entries(keysoundMap);

      // Process in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ([id, filename]) => {
            const audioPath = join(dir, filename);

            // Try original extension first, then fallback
            let resolvedPath: string | null = null;

            if (existsSync(audioPath)) {
              resolvedPath = audioPath;
            } else {
              // Try alternate extensions
              const baseName = filename.replace(/\.[^.]+$/, '');
              for (const ext of AUDIO_EXTENSIONS) {
                const altPath = join(dir, baseName + ext);
                if (existsSync(altPath)) {
                  resolvedPath = altPath;
                  break;
                }
              }
            }

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
