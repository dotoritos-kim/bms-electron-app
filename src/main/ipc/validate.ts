import { isAbsolute, extname, basename, normalize } from 'path';

/**
 * Runtime validation for path arguments crossing the IPC boundary.
 *
 * The renderer runs with `contextIsolation` but without `sandbox`, so every
 * `file:*` / `audio:*` handler must treat its arguments as untrusted input.
 * TypeScript types only hold at compile time; these guards enforce them at
 * runtime and narrow the reachable filesystem surface to the file kinds the
 * app works with (QA SEC-001 / SEC-005).
 */

export const BMS_EXTENSIONS = new Set(['.bms', '.bme', '.bml', '.pms', '.bmson']);
export const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3', '.flac', '.m4a']);

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

/** Basic shape check shared by every path argument. */
export function assertPathString(value: unknown, label = 'path'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new IpcValidationError(`${label} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new IpcValidationError(`${label} contains a NUL byte`);
  }
  if (!isAbsolute(value)) {
    throw new IpcValidationError(`${label} must be absolute`);
  }
  // Reject traversal segments outright rather than silently rewriting the
  // path: the renderer only ever hands us paths that came from a native
  // dialog or a directory listing, so `..` never appears legitimately.
  const segments = normalize(value).split(/[\\/]+/);
  if (segments.includes('..')) {
    throw new IpcValidationError(`${label} must not contain '..' segments`);
  }
  return value;
}

/** Absolute path to a chart file (`.bms`, `.bme`, `.bml`, `.pms`, `.bmson`). */
export function assertBmsPath(value: unknown, label = 'bmsPath'): string {
  const p = assertPathString(value, label);
  if (!BMS_EXTENSIONS.has(extname(p).toLowerCase())) {
    throw new IpcValidationError(`${label} must point to a BMS chart file`);
  }
  return p;
}

/**
 * Extensions the writer produces (BMS text). `.bmson` is a JSON chart format
 * the app only reads (and refuses to open); it must never be written to.
 */
export const WRITABLE_BMS_EXTENSIONS = new Set(['.bms', '.bme', '.bml', '.pms']);

/** Absolute path to a chart file the writer may replace (BMS text, not `.bmson`). */
export function assertWritableBmsPath(value: unknown, label = 'bmsPath'): string {
  const p = assertPathString(value, label);
  if (!WRITABLE_BMS_EXTENSIONS.has(extname(p).toLowerCase())) {
    throw new IpcValidationError(`${label} must point to a BMS text chart file`);
  }
  return p;
}

/** Absolute path to an audio file. */
export function assertAudioPath(value: unknown, label = 'audioPath'): string {
  const p = assertPathString(value, label);
  if (!AUDIO_EXTENSIONS.has(extname(p).toLowerCase())) {
    throw new IpcValidationError(`${label} must point to an audio file`);
  }
  return p;
}

/** Absolute directory path (existence is checked by the caller). */
export function assertDirPath(value: unknown, label = 'dirPath'): string {
  return assertPathString(value, label);
}

/**
 * A bare file name that stays inside its parent directory: no separators,
 * no `..`, no NUL. Returned unchanged when valid.
 */
export function assertFileName(value: unknown, label = 'filename'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new IpcValidationError(`${label} must be a non-empty string`);
  }
  if (value.includes('\0') || value === '.' || value === '..' || basename(value) !== value) {
    throw new IpcValidationError(`${label} must be a plain file name`);
  }
  return value;
}

/**
 * Chart file contents: text (written as UTF-8) or already-encoded bytes (e.g.
 * Shift_JIS / EUC-KR produced by the renderer to keep the source encoding).
 */
export function assertFileContent(value: unknown, label = 'content'): string | Uint8Array {
  if (typeof value === 'string' || value instanceof Uint8Array) return value;
  throw new IpcValidationError(`${label} must be a string or Uint8Array`);
}

export function assertString(value: unknown, label = 'value'): string {
  if (typeof value !== 'string') {
    throw new IpcValidationError(`${label} must be a string`);
  }
  return value;
}
