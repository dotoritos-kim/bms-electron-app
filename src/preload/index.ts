import { contextBridge, ipcRenderer } from 'electron';

const api = {
  file: {
    openBmsFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openBmsFile'),
    openBmsFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openBmsFolder'),
    readBms: (filePath: string): Promise<Uint8Array> => ipcRenderer.invoke('file:readBms', filePath),
    saveBms: (filePath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('file:saveBms', filePath, content),
    saveAs: (content: string, defaultName?: string): Promise<string | null> =>
      ipcRenderer.invoke('file:saveAs', content, defaultName),
    listBmsFolder: (
      folderPath: string,
    ): Promise<Array<{ name: string; path: string; size: number; ext: string }>> =>
      ipcRenderer.invoke('file:listBmsFolder', folderPath),
  },
  audio: {
    readFile: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('audio:readFile', filePath),
    readBatch: (
      bmsFilePath: string,
      keysoundMap: Record<string, string>,
    ): Promise<{ results: Record<string, ArrayBuffer>; errors: Record<string, string> }> =>
      ipcRenderer.invoke('audio:readBatch', bmsFilePath, keysoundMap),
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    return () => {
      ipcRenderer.removeAllListeners(channel);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
