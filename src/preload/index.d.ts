export interface BmsFileInfo {
  name: string;
  path: string;
  size: number;
  ext: string;
}

export interface ElectronAPI {
  file: {
    openBmsFile: () => Promise<string | null>;
    openBmsFolder: () => Promise<string | null>;
    readBms: (filePath: string) => Promise<Uint8Array>;
    saveBms: (filePath: string, content: string) => Promise<boolean>;
    saveAs: (content: string, defaultName?: string) => Promise<string | null>;
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
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
