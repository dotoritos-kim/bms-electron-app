import { readFile, readdir } from 'fs/promises';
import { join, dirname, parse, resolve, sep } from 'path';
import { handle } from './handle';
import { assertAudioPath, assertBmsPath, AUDIO_EXTENSIONS } from './validate';

/** Directory listing indexed for case-insensitive lookups. */
interface DirIndex {
  /** lower-case file name → actual file name */
  byName: Map<string, string>;
  /** lower-case base name (no extension) → actual file names */
  byBase: Map<string, string[]>;
}

/** Extension preference when the #WAV extension doesn't exist (common .wav → .ogg swaps). */
const FALLBACK_EXT_ORDER = ['.ogg', '.wav', '.flac', '.mp3', '.m4a', '.aac', '.opus'];

/**
 * Resolves `#WAV` file names against the chart folder:
 * 1. the exact relative path (subfolders allowed, e.g. `sounds\kick.wav`),
 * 2. the same name with another audio extension in that folder,
 * 3. the base name in the chart root (legacy behaviour).
 * Paths that would leave the chart folder are rejected.
 */
export function createKeysoundResolver(rootDir: string, listDir: (dir: string) => Promise<string[]>) {
  const root = resolve(rootDir);
  const cache = new Map<string, Promise<DirIndex | null>>();

  const indexDir = (dir: string): Promise<DirIndex | null> => {
    let p = cache.get(dir);
    if (!p) {
      p = listDir(dir).then((files) => {
        const byName = new Map<string, string>();
        const byBase = new Map<string, string[]>();
        for (const f of files) {
          const parsed = parse(f);
          if (!AUDIO_EXTENSIONS.has(parsed.ext.toLowerCase())) continue;
          byName.set(f.toLowerCase(), f);
          const key = parsed.name.toLowerCase();
          const list = byBase.get(key);
          if (list) list.push(f); else byBase.set(key, [f]);
        }
        return { byName, byBase };
      }).catch(() => null);
      cache.set(dir, p);
    }
    return p;
  };

  const inRoot = (p: string) => p === root || p.startsWith(root + sep);

  const pick = (idx: DirIndex, name: string): string | undefined => {
    const exact = idx.byName.get(name.toLowerCase());
    if (exact) return exact;
    const parsed = parse(name);
    const candidates = idx.byBase.get(parsed.name.toLowerCase());
    if (!candidates || candidates.length === 0) return undefined;
    const rank = (f: string) => {
      const i = FALLBACK_EXT_ORDER.indexOf(parse(f).ext.toLowerCase());
      return i < 0 ? FALLBACK_EXT_ORDER.length : i;
    };
    return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
  };

  return async (filename: string): Promise<string | null> => {
    const rel = filename.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
    if (!rel) return null;
    const full = resolve(root, rel);
    if (inRoot(full)) {
      const dir = dirname(full);
      const idx = await indexDir(dir);
      const found = idx ? pick(idx, parse(full).base) : undefined;
      if (found) return join(dir, found);
    }
    // Legacy fallback: base name in the chart root.
    const rootIdx = await indexDir(root);
    const found = rootIdx ? pick(rootIdx, parse(rel).base) : undefined;
    return found ? join(root, found) : null;
  };
}

export function registerAudioIpc(): void {
  // Read a single audio file as ArrayBuffer
  handle('audio:readFile', async (_event, rawPath: string) => {
    const filePath = assertAudioPath(rawPath, 'filePath');
    const buffer = await readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  // Batch read audio files from a BMS folder
  // Given the BMS file path and a keysound map { id: filename }, reads all audio files
  handle(
    'audio:readBatch',
    async (_event, rawBmsPath: string, keysoundMap: Record<string, string>) => {
      const bmsFilePath = assertBmsPath(rawBmsPath, 'bmsFilePath');
      if (!keysoundMap || typeof keysoundMap !== 'object') {
        throw new Error('keysoundMap must be an object');
      }
      const dir = dirname(bmsFilePath);
      const results: Record<string, ArrayBuffer> = {};
      const errors: Record<string, string> = {};
      const entries = Object.entries(keysoundMap);

      let rootFiles: string[];
      try {
        rootFiles = await readdir(dir);
      } catch {
        return { results, errors: Object.fromEntries(entries.map(([id]) => [id, `Directory not found: ${dir}`])) };
      }
      // The resolver indexes the chart folder first: hand it the listing just read.
      const root = resolve(dir);
      const resolveKeysound = createKeysoundResolver(dir, (d) => (d === root ? Promise.resolve(rootFiles) : readdir(d)));

      // Several ids may point at the same file: read it once.
      const reads = new Map<string, Promise<ArrayBuffer>>();
      const readOnce = (path: string) => {
        let p = reads.get(path);
        if (!p) {
          p = readFile(path).then((buffer) =>
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
          reads.set(path, p);
        }
        return p;
      };

      const handedOut = new Map<string, number>();

      // Process in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ([id, filename]) => {
            if (typeof filename !== 'string') {
              errors[id] = 'Invalid filename';
              return;
            }
            const resolvedPath = await resolveKeysound(filename);
            if (!resolvedPath) {
              errors[id] = `Not found: ${filename}`;
              return;
            }
            try {
              const data = await readOnce(resolvedPath);
              // Each id needs its own buffer: the renderer decodes (and so
              // detaches) them independently, and IPC cloning keeps identity.
              const uses = handedOut.get(resolvedPath) ?? 0;
              handedOut.set(resolvedPath, uses + 1);
              results[id] = uses === 0 ? data : data.slice(0);
            } catch (err) {
              errors[id] = err instanceof Error ? err.message : 'Read failed';
            }
          }),
        );
      }

      return { results, errors };
    },
  );
}

