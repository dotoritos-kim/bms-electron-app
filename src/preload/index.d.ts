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
