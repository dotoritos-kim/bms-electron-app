/**
 * Electron-specific unit tests
 *
 * Verifies behavior unique to the Electron Chrome renderer environment,
 * focusing on areas where web APIs behave differently in Electron:
 * - Preload API type contract (context isolation / IPC bridge shape)
 * - TypedArray serialization across IPC boundaries
 * - localStorage reliability for persistent settings
 * - Worker-like message passing objects
 * - Web Audio API mocking patterns
 * - Large memory allocation patterns
 */

import type { ElectronAPI } from '../../src/preload/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strongly typed no-op that satisfies a function signature at the type level. */
function assertType<T>(_value: T): void {
  // compile-time only
}

/**
 * Build a mock localStorage backed by a Map, matching the subset of the
 * Storage interface that the codebase actually uses.
 */
function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => {
      const keys = [...store.keys()];
      return keys[index] ?? null;
    },
    /** Expose internal store for quota simulation. */
    _store: store,
  };
}

// ===========================================================================
// 1. Context Isolation & IPC Bridge shape
// ===========================================================================

describe('ElectronAPI type contract', () => {
  // We create a minimal runtime stub that satisfies the ElectronAPI interface.
  // If the type changes in a breaking way, these tests fail at compile time
  // (tsc) AND at runtime (the shape assertions).

  const stub: ElectronAPI = {
    file: {
      openBmsFile: async () => null,
      openBmsFolder: async () => null,
      readBms: async (_p: string) => new Uint8Array(),
      saveBms: async (_p: string, _c: string) => true,
      saveAs: async (_c: string, _d?: string) => null,
      listBmsFolder: async (_p: string) => [],
      importKeysounds: async (_p: string) => [],
      writeAutoSave: async (_p: string, _c: string) => true,
      checkAutoSave: async (_p: string) => null,
      deleteAutoSave: async (_p: string) => true,
      createNewBms: async (_o) => null,
      openAudioFile: async () => null,
      saveWavSlice: async (_d, _p, _s, _c) => true,
      saveWavSlices: async (_b, _s) => [],
    },
    audio: {
      readFile: async (_p: string) => new ArrayBuffer(0),
      readBatch: async (_b: string, _k: Record<string, string>) => ({
        results: {},
        errors: {},
      }),
    },
    on: (_channel: string, _cb: (...args: unknown[]) => void) => () => {},
  };

  it('1. file.openBmsFile is a function', () => {
    expect(typeof stub.file.openBmsFile).toBe('function');
    assertType<() => Promise<string | null>>(stub.file.openBmsFile);
  });

  it('2. file.readBms is a function', () => {
    expect(typeof stub.file.readBms).toBe('function');
    assertType<(filePath: string) => Promise<Uint8Array>>(stub.file.readBms);
  });

  it('3. file.saveBms is a function', () => {
    expect(typeof stub.file.saveBms).toBe('function');
    assertType<(filePath: string, content: string) => Promise<boolean>>(stub.file.saveBms);
  });

  it('4. audio.readFile is a function', () => {
    expect(typeof stub.audio.readFile).toBe('function');
    assertType<(filePath: string) => Promise<ArrayBuffer>>(stub.audio.readFile);
  });

  it('5. audio.readBatch is a function', () => {
    expect(typeof stub.audio.readBatch).toBe('function');
  });

  it('6. file.createNewBms is a function', () => {
    expect(typeof stub.file.createNewBms).toBe('function');
  });

  it('7. on() returns an unsubscribe function', () => {
    const unsub = stub.on('test-channel', () => {});
    expect(typeof unsub).toBe('function');
    // Calling unsub should not throw
    expect(() => unsub()).not.toThrow();
  });
});

// ===========================================================================
// 2. TypedArray serialization safety
// ===========================================================================

describe('TypedArray serialization across IPC boundaries', () => {
  it('8. Float32 to Int16 conversion preserves values', () => {
    const float32 = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const int16 = new Int16Array(float32.length);

    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
    }

    expect(int16[0]).toBe(0);
    expect(int16[1]).toBe(16384); // 0.5 * 32767 rounded
    expect(int16[2]).toBe(-16384);
    expect(int16[3]).toBe(32767);
    expect(int16[4]).toBe(-32768);
  });

  it('9. Float32Array clamping at -1/+1 boundaries', () => {
    const overdriven = new Float32Array([2.5, -3.0, 999, -Infinity, Infinity]);
    const clamped = overdriven.map((v) => Math.max(-1, Math.min(1, v)));

    expect(clamped[0]).toBe(1);
    expect(clamped[1]).toBe(-1);
    expect(clamped[2]).toBe(1);
    // Infinity clamped
    expect(clamped[3]).toBe(-1);
    expect(clamped[4]).toBe(1);
  });

  it('10. Buffer.from(float32Array.buffer) creates a valid buffer', () => {
    const float32 = new Float32Array([1.0, -1.0]);
    const buf = Buffer.from(float32.buffer);

    expect(buf.length).toBe(float32.byteLength); // 8 bytes
    // Round-trip: reconstruct from buffer
    const restored = new Float32Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    expect(restored[0]).toBeCloseTo(1.0);
    expect(restored[1]).toBeCloseTo(-1.0);
  });

  it('11. Large Float32Array (1M samples) does not throw', () => {
    expect(() => {
      const large = new Float32Array(1_000_000);
      // Simulate the conversion loop used in saveWavSlice
      for (let i = 0; i < large.length; i++) {
        large[i] = Math.sin(i / 100);
      }
      const buf = Buffer.from(large.buffer);
      expect(buf.length).toBe(4_000_000);
    }).not.toThrow();
  });

  it('12. Uint8Array to string decoding for BMS files', () => {
    // BMS files are Shift_JIS or UTF-8; test the UTF-8 path
    const text = '#TITLE テスト\n#ARTIST アーティスト\n';
    const encoded = new TextEncoder().encode(text);
    // jsdom may use a different Uint8Array realm, so check structurally
    expect(encoded.constructor.name).toBe('Uint8Array');
    expect(encoded.byteLength).toBeGreaterThan(0);

    const decoded = new TextDecoder('utf-8').decode(encoded);
    expect(decoded).toBe(text);
    expect(decoded).toContain('テスト');
  });
});

// ===========================================================================
// 3. localStorage reliability
// ===========================================================================

describe('localStorage reliability', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('13. Save and load large data (~4 MB string)', () => {
    // Simulate large pattern library or undo history
    const largePayload = 'x'.repeat(4 * 1024 * 1024);
    localStorage.setItem('large-key', largePayload);

    const retrieved = localStorage.getItem('large-key');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.length).toBe(4 * 1024 * 1024);
  });

  it('14. JSON.parse error recovery for corrupt data', () => {
    localStorage.setItem('settings', '{broken json!!!');

    // Mirrors the loadMidiMapping() pattern: try/catch returning null
    let result: unknown = 'not-set';
    try {
      result = JSON.parse(localStorage.getItem('settings')!);
    } catch {
      result = null;
    }

    expect(result).toBeNull();
  });

  it('15. Map serialization via entries array (MIDI mapping pattern)', () => {
    // Exactly mirrors saveMidiMapping / loadMidiMapping from midiInput.ts
    const original = new Map<number, string>([
      [60, 'SC'],
      [61, '1'],
      [62, '2'],
      [63, '3'],
    ]);

    const data = {
      entries: Array.from(original.entries()),
      presetName: 'Piano Keyboard',
    };
    localStorage.setItem('midi-mapping', JSON.stringify(data));

    const raw = localStorage.getItem('midi-mapping');
    const parsed = JSON.parse(raw!);
    const restored = new Map<number, string>(parsed.entries);

    expect(restored.size).toBe(4);
    expect(restored.get(60)).toBe('SC');
    expect(restored.get(63)).toBe('3');
    expect(parsed.presetName).toBe('Piano Keyboard');
  });

  it('16. Concurrent read/write to same key', () => {
    // Electron renderer is single-threaded, but verify no tearing
    localStorage.setItem('counter', '0');
    for (let i = 0; i < 1000; i++) {
      const current = parseInt(localStorage.getItem('counter')!, 10);
      localStorage.setItem('counter', String(current + 1));
    }
    expect(localStorage.getItem('counter')).toBe('1000');
  });

  it('17. Storage quota exceeded behavior', () => {
    // Simulate quota exceeded by overriding setItem after a threshold
    const original = localStorage.setItem.bind(localStorage);
    let totalSize = 0;
    const QUOTA = 5 * 1024 * 1024; // 5 MB

    vi.stubGlobal('localStorage', {
      ...mockStorage,
      setItem: (key: string, value: string) => {
        if (totalSize + value.length > QUOTA) {
          throw new DOMException(
            'Failed to execute \'setItem\' on \'Storage\': Setting the value exceeded the quota.',
            'QuotaExceededError',
          );
        }
        totalSize += value.length;
        original(key, value);
      },
      getItem: mockStorage.getItem,
    });

    // First write should succeed
    const smallData = 'a'.repeat(1024);
    expect(() => localStorage.setItem('ok', smallData)).not.toThrow();

    // Quota-busting write should throw
    const hugeData = 'b'.repeat(QUOTA + 1);
    expect(() => localStorage.setItem('boom', hugeData)).toThrow(/quota/i);
  });
});

// ===========================================================================
// 4. Worker-like message passing objects
// ===========================================================================

describe('Worker-like message objects', () => {
  it('18. MessageEvent construction works', () => {
    const event = new MessageEvent('message', {
      data: { type: 'audio-decoded', sampleRate: 44100 },
    });

    expect(event.type).toBe('message');
    expect(event.data.type).toBe('audio-decoded');
    expect(event.data.sampleRate).toBe(44100);
  });

  it('19. postMessage / onmessage protocol works synchronously', () => {
    // Simulate minimal Worker-like channel used in audio processing
    const received: unknown[] = [];

    const channel = {
      onmessage: null as ((ev: MessageEvent) => void) | null,
      postMessage(data: unknown) {
        if (this.onmessage) {
          this.onmessage(new MessageEvent('message', { data }));
        }
      },
    };

    channel.onmessage = (ev: MessageEvent) => {
      received.push(ev.data);
    };

    channel.postMessage({ cmd: 'decode', file: 'kick.wav' });
    channel.postMessage({ cmd: 'decode', file: 'snare.wav' });

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ cmd: 'decode', file: 'kick.wav' });
  });

  it('20. addEventListener / removeEventListener lifecycle', () => {
    const target = new EventTarget();
    const calls: string[] = [];

    const handler = (e: Event) => {
      calls.push((e as MessageEvent).data ?? 'fired');
    };

    target.addEventListener('message', handler);
    target.dispatchEvent(new MessageEvent('message', { data: 'first' }));
    expect(calls).toEqual(['first']);

    target.removeEventListener('message', handler);
    target.dispatchEvent(new MessageEvent('message', { data: 'second' }));
    // Handler was removed, so 'second' should NOT appear
    expect(calls).toEqual(['first']);
  });
});

// ===========================================================================
// 5. Web Audio API (mock-based)
// ===========================================================================

describe('Web Audio API mock patterns', () => {
  it('21. AudioContext state machine (suspended -> running -> closed)', async () => {
    // jsdom does not provide AudioContext; mock it
    let state: AudioContextState = 'suspended';

    const mockCtx = {
      get state() {
        return state;
      },
      resume: vi.fn(async () => {
        state = 'running';
      }),
      close: vi.fn(async () => {
        state = 'closed';
      }),
      createGain: vi.fn(() => ({
        gain: { value: 1 },
        connect: vi.fn(),
      })),
      destination: {},
    };

    expect(mockCtx.state).toBe('suspended');

    await mockCtx.resume();
    expect(mockCtx.state).toBe('running');
    expect(mockCtx.resume).toHaveBeenCalledOnce();

    await mockCtx.close();
    expect(mockCtx.state).toBe('closed');
    expect(mockCtx.close).toHaveBeenCalledOnce();
  });

  it('22. Graceful fallback when AudioContext unavailable', () => {
    // Simulate an environment where AudioContext does not exist
    const origAC = globalThis.AudioContext;
    // @ts-expect-error -- intentionally deleting for test
    delete globalThis.AudioContext;

    // The pattern used in the codebase: check before constructing
    function createAudioContext(): { ctx: unknown } | null {
      if (typeof globalThis.AudioContext === 'undefined') {
        return null;
      }
      return { ctx: new globalThis.AudioContext() };
    }

    expect(createAudioContext()).toBeNull();

    // Restore
    if (origAC) {
      globalThis.AudioContext = origAC;
    }
  });
});

// ===========================================================================
// 6. Memory patterns
// ===========================================================================

describe('Memory allocation patterns', () => {
  it('23. Large array allocation (~100 MB) does not throw', () => {
    // Electron apps load entire WAV files and decoded audio into memory.
    // Verify the JS engine can allocate ~100 MB in a single TypedArray.
    expect(() => {
      // 25M float32 entries = 100 MB
      const big = new Float32Array(25_000_000);
      // Touch first and last to ensure allocation is real
      big[0] = 1.0;
      big[big.length - 1] = -1.0;
      expect(big[0]).toBe(1.0);
      expect(big[big.length - 1]).toBe(-1.0);
    }).not.toThrow();
  });
});
