import { contextBridge, ipcRenderer } from 'electron';
import {
  isAllowedRecvChannel,
  type IpcInvokeChannel,
  type IpcInvokeMap,
  type IpcSendChannel,
  type IpcSendMap,
} from '../shared/ipc-contract';

/** Typed invoke wrapper. Channel + arg + return types come from `IpcInvokeMap`. */
function invoke<K extends IpcInvokeChannel>(
  channel: K,
  ...args: IpcInvokeMap[K]['in']
): Promise<IpcInvokeMap[K]['out']> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[K]['out']>;
}

/**
 * Typed listener registration with channel whitelist.
 * Throws synchronously when the renderer attempts to subscribe to a channel
 * that is not declared in `IpcSendMap` / `ALLOWED_RECV_CHANNELS`.
 */
function on<K extends IpcSendChannel>(
  channel: K,
  callback: (...args: IpcSendMap[K]) => void,
): () => void {
  if (!isAllowedRecvChannel(channel)) {
    throw new Error(`[preload] disallowed IPC channel subscription: ${String(channel)}`);
  }
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    (callback as (...a: unknown[]) => void)(...args);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  file: {
    openBmsFile: () => invoke('dialog:openBmsFile'),
    openBmsFolder: () => invoke('dialog:openBmsFolder'),
    readBms: (filePath: string) => invoke('file:readBms', filePath),
    saveBms: (filePath: string, content: string) => invoke('file:saveBms', filePath, content),
    saveAs: (content: string, defaultName?: string) => invoke('file:saveAs', content, defaultName),
    readMeta: (bmsFilePath: string) => invoke('file:readMeta', bmsFilePath),
    saveMeta: (bmsFilePath: string, content: string) => invoke('file:saveMeta', bmsFilePath, content),
    listBmsFolder: (folderPath: string) => invoke('file:listBmsFolder', folderPath),
    importKeysounds: (bmsFilePath: string) => invoke('file:importKeysounds', bmsFilePath),
    writeAutoSave: (filePath: string, content: string) => invoke('file:writeAutoSave', filePath, content),
    checkAutoSave: (filePath: string) => invoke('file:checkAutoSave', filePath),
    deleteAutoSave: (filePath: string) => invoke('file:deleteAutoSave', filePath),
    createNewBms: (opts: { title: string; artist: string; bpm: number; keyMode: string }) =>
      invoke('file:createNewBms', opts),
    openAudioFile: () => invoke('dialog:openAudioFile'),
    saveWavSlice: (
      destPath: string,
      pcmData: Float32Array,
      sampleRate: number,
      channels: number,
    ) => invoke('file:saveWavSlice', destPath, pcmData, sampleRate, channels),
    saveWavSlices: (
      bmsDir: string,
      slices: Array<{ filename: string; pcmData: Float32Array; sampleRate: number; channels: number }>,
    ) => invoke('file:saveWavSlices', bmsDir, slices),
  },
  audio: {
    readFile: (filePath: string) => invoke('audio:readFile', filePath),
    readBatch: (bmsFilePath: string, keysoundMap: Record<string, string>) =>
      invoke('audio:readBatch', bmsFilePath, keysoundMap),
  },
  on,
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
