/**
 * T5 (AudioPreloader): abort() 메서드 동작 검증
 *
 * - abort() 호출 후 decodeAll()이 즉시 반환됨
 * - abort() 호출 후 in-flight decode가 완료되어도 결과가 저장되지 않음
 */

// AudioPreloader needs AudioContext and Worker — mock both
class MockAudioLoaderWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  terminated = false;
  postMessage(_msg: unknown) {}
  terminate() { this.terminated = true; }
  addEventListener(_: string, cb: (e: MessageEvent) => void) {
    this.onmessage = cb;
  }
  removeEventListener(_: string, _cb: unknown) {
    this.onmessage = null;
  }
}

// Mock AudioContext
class MockAudioContext {
  state: string = 'running';
  sampleRate = 44100;
  destination = {};
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };
  decodeCount = 0;
  resolveCallbacks: Array<(buf: AudioBuffer) => void> = [];

  createBuffer(channels: number, length: number, _sr: number): AudioBuffer {
    return {
      numberOfChannels: channels,
      length,
      duration: length / this.sampleRate,
      sampleRate: this.sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length)),
    } as unknown as AudioBuffer;
  }

  // Tracks pending decodeAudioData calls so tests can resolve/reject them
  decodeAudioData(_buf: ArrayBuffer): Promise<AudioBuffer> {
    this.decodeCount++;
    return new Promise((resolve) => {
      this.resolveCallbacks.push(resolve);
    });
  }

  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() }; }
  createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  AudioWorkletNode = vi.fn(() => ({
    port: { onmessage: null, postMessage: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(),
  }));
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);

  // Resolve all pending decodeAudioData calls
  resolveAllPending() {
    const mockBuf = this.createBuffer(1, 1024, this.sampleRate);
    for (const resolve of this.resolveCallbacks) {
      resolve(mockBuf);
    }
    this.resolveCallbacks = [];
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('AudioWorkletNode', vi.fn(() => ({
  port: { onmessage: null, postMessage: vi.fn() },
  connect: vi.fn(), disconnect: vi.fn(),
})));

import { AudioPreloader } from '../../../../bms-player/src/audio/loader/AudioPreloader';

describe('AudioPreloader.abort()', () => {
  it('abort() resolves decodeAll() immediately without waiting for pending decodes', async () => {
    const worker = new MockAudioLoaderWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { a: 'a.wav', b: 'b.wav' }, worker);

    // Manually populate audioDataMap with fake buffers (bypass loadAll)
    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('a', new ArrayBuffer(8));
    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('b', new ArrayBuffer(8));

    // Start decodeAll — it will hang waiting for mock decodeAudioData
    const decodePromise = preloader.decodeAll();

    // Abort immediately
    preloader.abort();

    // decodeAll should resolve quickly (not hang)
    await expect(decodePromise).resolves.toBeUndefined();
  });

  it('abort() before decodeAll() causes immediate return', async () => {
    const worker = new MockAudioLoaderWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { x: 'x.wav' }, worker);

    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('x', new ArrayBuffer(8));

    preloader.abort(); // abort before decodeAll

    const start = Date.now();
    await preloader.decodeAll();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100); // Should return immediately
  });

  it('decoded results are not stored after abort()', async () => {
    const worker = new MockAudioLoaderWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { c: 'c.wav' }, worker);
    const ctx = (preloader as unknown as { audioContext: MockAudioContext }).audioContext;

    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('c', new ArrayBuffer(8));

    // Start decode — hangs in pending
    const decodePromise = preloader.decodeAll();

    // Abort
    preloader.abort();
    await decodePromise;

    // Resolve any pending decode after abort — result should NOT be stored
    ctx.resolveAllPending();
    await Promise.resolve(); // yield to micro-tasks

    const audioBuffers = (preloader as unknown as { audioBuffers: Map<string, AudioBuffer> }).audioBuffers;
    expect(audioBuffers.has('c')).toBe(false);
  });

  it('abort() is idempotent — calling twice does not throw', () => {
    const worker = new MockAudioLoaderWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', {}, worker);

    expect(() => {
      preloader.abort();
      preloader.abort();
    }).not.toThrow();
  });

  it('new AudioPreloader instance is independent — not affected by previous abort', async () => {
    const worker1 = new MockAudioLoaderWorker() as unknown as Worker;
    const p1 = new AudioPreloader('', { x: 'x.wav' }, worker1);
    p1.abort();

    const worker2 = new MockAudioLoaderWorker() as unknown as Worker;
    const p2 = new AudioPreloader('', {}, worker2);

    // p2 should not be aborted
    const aborted = (p2 as unknown as { aborted: boolean }).aborted;
    expect(aborted).toBe(false);
  });
});
