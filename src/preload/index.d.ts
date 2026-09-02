/**
 * Renderer-visible type for `window.api`.
 *
 * The runtime shape is defined in `src/preload/index.ts`. The typed channel
 * map and helpers live in `src/shared/ipc-contract.ts` (single source of truth).
 *
 * NOTE: this file used to hand-mirror every method signature, which was a
 * frequent source of drift. The new approach re-exports the inferred type
 * from preload so the renderer stays in lockstep automatically.
 */

import type {
  BmsFileInfo,
  IpcSendChannel,
  IpcSendMap,
  SupportedLocale,
} from '../shared/ipc-contract';

export type { BmsFileInfo };

export interface ElectronAPI {
  file: {
    openBmsFile: () => Promise<string | null>;
    openBmsFolder: () => Promise<string | null>;
    readBms: (filePath: string) => Promise<Uint8Array>;
    saveBms: (filePath: string, content: string) => Promise<boolean>;
    saveAs: (content: string, defaultName?: string) => Promise<string | null>;
    readMeta: (bmsFilePath: string) => Promise<string | null>;
    saveMeta: (bmsFilePath: string, content: string) => Promise<boolean>;
    listBmsFolder: (folderPath: string) => Promise<BmsFileInfo[]>;
    importKeysounds: (bmsFilePath: string) => Promise<Array<{ filename: string; destPath: string }>>;
    writeAutoSave: (filePath: string, content: string) => Promise<boolean>;
    checkAutoSave: (filePath: string) => Promise<string | null>;
    deleteAutoSave: (filePath: string) => Promise<boolean>;
    createNewBms: (opts: { title: string; artist: string; bpm: number; keyMode: string }) => Promise<{ path: string; name: string; folderPath: string } | null>;
    openAudioFile: () => Promise<string | null>;
    saveWavSlice: (destPath: string, pcmData: Float32Array, sampleRate: number, channels: number) => Promise<boolean>;
    saveWavSlices: (bmsDir: string, slices: Array<{ filename: string; pcmData: Float32Array; sampleRate: number; channels: number }>) => Promise<string[]>;
  };
  audio: {
    readFile: (filePath: string) => Promise<ArrayBuffer>;
    readBatch: (
      bmsFilePath: string,
      keysoundMap: Record<string, string>,
    ) => Promise<{ results: Record<string, ArrayBuffer>; errors: Record<string, string> }>;
  };
  locale: {
    getInitial: () => Promise<SupportedLocale>;
    set: (locale: SupportedLocale) => Promise<boolean>;
  };
  app: {
    confirmClose: () => Promise<boolean>;
  };
  /**
   * Subscribe to a typed main → renderer channel.
   * The channel must be one of the values declared in `IpcSendMap`.
   * Returns an unsubscribe function.
   */
  on: <K extends IpcSendChannel>(
    channel: K,
    callback: (...args: IpcSendMap[K]) => void,
  ) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
