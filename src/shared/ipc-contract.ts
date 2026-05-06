/**
 * IPC Channel Single Source of Truth.
 *
 * Defines the typed contracts for every IPC channel between main/preload/renderer.
 * Used by:
 *   - main: `handle<K>(ch, fn)` to register typed handlers
 *   - preload: `invoke<K>(ch, ...args)` and the `on()` whitelist for menu channels
 *   - renderer: `window.api` types are derived from these maps via preload
 *
 * Adding a new channel:
 *   1. Add an entry to `IpcInvokeMap` (renderer → main, awaits a result) or
 *      `IpcSendMap` (main → renderer, fire-and-forget).
 *   2. Implement the handler in main using `handle('channel', ...)`.
 *   3. Expose it through `window.api` in preload using the typed `invoke` helper.
 */

export type SupportedLocale = 'ko' | 'en' | 'ja' | 'zh' | 'es' | 'de' | 'ru';

export interface BmsFileInfo {
  name: string;
  path: string;
  size: number;
  ext: string;
}

export interface KeysoundImportResult {
  filename: string;
  destPath: string;
}

export interface CreateNewBmsOptions {
  title: string;
  artist: string;
  bpm: number;
  keyMode: string;
}

export interface CreateNewBmsResult {
  path: string;
  name: string;
  folderPath: string;
}

export interface WavSlicePayload {
  filename: string;
  pcmData: Float32Array;
  sampleRate: number;
  channels: number;
}

export interface AudioReadBatchResult {
  results: Record<string, ArrayBuffer>;
  errors: Record<string, string>;
}

/**
 * renderer → main → renderer (request/response).
 * `in` is the tuple of arguments after the IpcMainInvokeEvent.
 * `out` is the resolved value of the returned Promise.
 *
 * NOTE: `file:readBms` is declared with `Uint8Array` here because that is the
 * type observed by renderer code. Electron's IPC layer transparently converts
 * a Node Buffer returned from main into a Uint8Array on the renderer side.
 */
export interface IpcInvokeMap {
  // dialogs
  'dialog:openBmsFile': { in: []; out: string | null };
  'dialog:openBmsFolder': { in: []; out: string | null };
  'dialog:openAudioFile': { in: []; out: string | null };

  // bms file io
  'file:readBms': { in: [filePath: string]; out: Uint8Array };
  'file:saveBms': { in: [filePath: string, content: string]; out: boolean };
  'file:saveAs': { in: [content: string, defaultName?: string]; out: string | null };

  // sidecar meta
  'file:readMeta': { in: [bmsFilePath: string]; out: string | null };
  'file:saveMeta': { in: [bmsFilePath: string, content: string]; out: boolean };

  // autosave
  'file:writeAutoSave': { in: [filePath: string, content: string]; out: boolean };
  'file:checkAutoSave': { in: [filePath: string]; out: string | null };
  'file:deleteAutoSave': { in: [filePath: string]; out: boolean };

  // folder + keysounds
  'file:listBmsFolder': { in: [folderPath: string]; out: BmsFileInfo[] };
  'file:importKeysounds': { in: [bmsFilePath: string]; out: KeysoundImportResult[] };

  // creation
  'file:createNewBms': { in: [opts: CreateNewBmsOptions]; out: CreateNewBmsResult | null };

  // wav slicer
  'file:saveWavSlice': {
    in: [destPath: string, pcmData: Float32Array, sampleRate: number, channels: number];
    out: boolean;
  };
  'file:saveWavSlices': {
    in: [bmsDir: string, slices: WavSlicePayload[]];
    out: string[];
  };

  // audio
  'audio:readFile': { in: [filePath: string]; out: ArrayBuffer };
  'audio:readBatch': {
    in: [bmsFilePath: string, keysoundMap: Record<string, string>];
    out: AudioReadBatchResult;
  };

  // locale
  'locale:getInitial': { in: []; out: SupportedLocale };
  'locale:set': { in: [locale: SupportedLocale]; out: boolean };
}

/**
 * main → renderer (fire-and-forget).
 * Tuple = arguments delivered to the renderer-side listener.
 * All current menu channels carry no payload; declare future args here.
 */
export interface IpcSendMap {
  'menu:openFile': [];
  'menu:openFolder': [];
  'menu:save': [];
  'menu:saveAs': [];
  'locale:changed': [locale: SupportedLocale];
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcSendChannel = keyof IpcSendMap;

/**
 * Whitelist used by preload's `on()` helper to limit which main→renderer
 * channels the renderer is allowed to subscribe to. Keep in sync with `IpcSendMap`.
 */
export const ALLOWED_RECV_CHANNELS: readonly IpcSendChannel[] = [
  'menu:openFile',
  'menu:openFolder',
  'menu:save',
  'menu:saveAs',
  'locale:changed',
] as const;

export function isAllowedRecvChannel(channel: string): channel is IpcSendChannel {
  return (ALLOWED_RECV_CHANNELS as readonly string[]).includes(channel);
}
