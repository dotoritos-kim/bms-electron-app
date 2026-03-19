/**
 * LocalAudioWorker
 *
 * A Worker-compatible shim that reads audio files from the local filesystem
 * via Electron IPC instead of fetching over HTTP.
 *
 * Implements the same message protocol as AudioLoader.worker.ts:
 * - Input: { type: 'LOAD_AUDIO', payload: { baseUrl, fileMap } }
 * - Output: PROGRESS, LOADED, DONE, ERROR messages
 */

interface LoadAudioMessage {
  type: 'LOAD_AUDIO';
  payload: {
    baseUrl: string;
    fileMap: Record<string, string>;
  };
}

interface ProgressMessage {
  type: 'PROGRESS';
  payload: {
    key: string;
    fileName: string;
    loadedCount: number;
    total: number;
  };
}

interface LoadedMessage {
  type: 'LOADED';
  payload: {
    key: string;
    fileName: string;
    arrayBuffer: ArrayBuffer;
  };
}

interface DoneMessage {
  type: 'DONE';
  payload: {
    total: number;
    loaded: number;
  };
}

interface ErrorMessage {
  type: 'ERROR';
  payload: {
    key: string;
    fileName: string;
    message: string;
  };
}

type OutgoingMessage = ProgressMessage | LoadedMessage | DoneMessage | ErrorMessage;

/**
 * Creates a fake Worker that loads audio via Electron IPC.
 *
 * @param bmsFilePath - Absolute path to the BMS file (used to resolve audio relative paths)
 */
export function createLocalAudioWorker(bmsFilePath: string): Worker {
  const listeners: Array<(event: MessageEvent) => void> = [];
  let onMessageHandler: ((event: MessageEvent) => void) | null = null;

  const fakeWorker = {
    postMessage(message: LoadAudioMessage) {
      if (message.type === 'LOAD_AUDIO') {
        loadAllViaIPC(message.payload.fileMap, bmsFilePath, (msg) => {
          const event = new MessageEvent('message', { data: msg });
          // Call onmessage handler
          if (onMessageHandler) onMessageHandler(event);
          // Call addEventListener handlers
          for (const listener of listeners) {
            listener(event);
          }
        });
      }
    },

    addEventListener(_type: string, listener: (event: MessageEvent) => void) {
      listeners.push(listener);
    },

    removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },

    terminate() {
      listeners.length = 0;
    },

    set onmessage(handler: ((event: MessageEvent) => void) | null) {
      // Store onmessage handler separately (don't clear addEventListener listeners)
      onMessageHandler = handler;
    },

    get onmessage() {
      return onMessageHandler;
    },

    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    dispatchEvent: () => false,
  };

  return fakeWorker as unknown as Worker;
}

async function loadAllViaIPC(
  fileMap: Record<string, string>,
  bmsFilePath: string,
  emit: (msg: OutgoingMessage) => void,
) {
  const entries = Object.entries(fileMap);
  const total = entries.length;

  if (total === 0) {
    emit({ type: 'DONE', payload: { total: 0, loaded: 0 } });
    return;
  }

  // Batch load all audio files via IPC
  try {
    const { results, errors } = await window.api.audio.readBatch(bmsFilePath, fileMap);

    let loadedCount = 0;

    // Emit LOADED for successful files
    for (const [key, arrayBuffer] of Object.entries(results)) {
      loadedCount++;
      emit({
        type: 'PROGRESS',
        payload: {
          key,
          fileName: fileMap[key] || key,
          loadedCount,
          total,
        },
      });
      emit({
        type: 'LOADED',
        payload: {
          key,
          fileName: fileMap[key] || key,
          arrayBuffer,
        },
      });
    }

    // Emit ERROR for failed files
    for (const [key, message] of Object.entries(errors)) {
      loadedCount++;
      emit({
        type: 'PROGRESS',
        payload: {
          key,
          fileName: fileMap[key] || key,
          loadedCount,
          total,
        },
      });
      emit({
        type: 'ERROR',
        payload: {
          key,
          fileName: fileMap[key] || key,
          message,
        },
      });
    }

    emit({
      type: 'DONE',
      payload: {
        total,
        loaded: Object.keys(results).length,
      },
    });
  } catch (err) {
    // Catastrophic failure - emit error for all keys
    for (const [key, fileName] of entries) {
      emit({
        type: 'ERROR',
        payload: {
          key,
          fileName,
          message: err instanceof Error ? err.message : 'IPC audio loading failed',
        },
      });
    }
    emit({ type: 'DONE', payload: { total, loaded: 0 } });
  }
}
