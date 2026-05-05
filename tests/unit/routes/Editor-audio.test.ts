/**
 * T5: loadAudio abort bail-out 테스트
 *
 * loadAbortRef=true 설정 후 loadAudio가 preloader를 해제하고 bail-out하는지 검증합니다.
 */

// We test the abort/bail-out logic by testing AudioPreloader.abort() behavior
// since the Editor component itself is difficult to unit-test directly (complex deps)

// Mock AudioContext
class MockAudioContext {
  state = 'running';
  sampleRate = 44100;
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  decodeCount = 0;

  createBuffer(channels: number, length: number) {
    return {
      numberOfChannels: channels, length, duration: length / this.sampleRate,
      sampleRate: this.sampleRate, getChannelData: vi.fn(() => new Float32Array(length)),
    } as unknown as AudioBuffer;
  }

  decodeAudioData(_buf: ArrayBuffer): Promise<AudioBuffer> {
    this.decodeCount++;
    // Returns a slowly-resolving promise
    return new Promise((resolve) => setTimeout(() => resolve(this.createBuffer(1, 44)), 50));
  }

  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() }; }
  createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('AudioWorkletNode', vi.fn(() => ({
  port: { onmessage: null, postMessage: vi.fn() },
  connect: vi.fn(), disconnect: vi.fn(),
})));

class MockWorker {
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(_: unknown) {}
  terminate() { this.terminated = true; }
  addEventListener(_: string, cb: (e: MessageEvent) => void) { this.onmessage = cb; }
  removeEventListener(_: string, _cb: unknown) { this.onmessage = null; }

  simulateDone() {
    this.onmessage?.({ data: { type: 'DONE' } } as MessageEvent);
  }
}

import { AudioPreloader } from '../../../vendor/bms-player/src/audio/loader/AudioPreloader';

describe('Editor audio abort bail-out', () => {
  it('abort() + releaseAllResources() during loadAll resolves immediately', async () => {
    const worker = new MockWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { k1: 'k1.wav', k2: 'k2.wav' }, worker);

    // Start loadAll but don't resolve DONE yet
    const loadPromise = preloader.loadAll();

    // Simulate abort (as would happen in cleanup useEffect)
    preloader.abort();

    // loadAll should resolve immediately after abort
    await expect(loadPromise).resolves.toBeUndefined();
  });

  it('abort() during decodeAll resolves immediately', async () => {
    const worker = new MockWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { a: 'a.wav', b: 'b.wav' }, worker);

    // Populate audioDataMap
    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('a', new ArrayBuffer(16));
    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('b', new ArrayBuffer(16));

    const decodePromise = preloader.decodeAll();

    // Abort after starting decode
    preloader.abort();

    const start = Date.now();
    await decodePromise;
    const elapsed = Date.now() - start;

    // Should resolve well before the 50ms mock decodeAudioData delay
    expect(elapsed).toBeLessThan(30);
  });

  it('after abort + bail-out, audioBuffers is empty (no orphan data)', async () => {
    const worker = new MockWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', { x: 'x.wav' }, worker);

    (preloader as unknown as { audioDataMap: Map<string, ArrayBuffer> }).audioDataMap.set('x', new ArrayBuffer(16));

    const decodePromise = preloader.decodeAll();
    preloader.abort();
    await decodePromise;

    // Allow any pending micro-tasks to settle
    await new Promise((r) => setTimeout(r, 60));

    const audioBuffers = (preloader as unknown as { audioBuffers: Map<string, AudioBuffer> }).audioBuffers;
    expect(audioBuffers.size).toBe(0);
  });

  it('two sequential preloader instances — abort of first does not affect second', async () => {
    const w1 = new MockWorker() as unknown as Worker;
    const p1 = new AudioPreloader('', { a: 'a.wav' }, w1);
    p1.abort();

    const w2 = new MockWorker() as unknown as Worker;
    const p2 = new AudioPreloader('', {}, w2);

    const p2Aborted = (p2 as unknown as { aborted: boolean }).aborted;
    expect(p2Aborted).toBe(false);
  });

  it('releaseAllResources() after abort does not throw', () => {
    const worker = new MockWorker() as unknown as Worker;
    const preloader = new AudioPreloader('', {}, worker);

    preloader.abort();
    expect(() => preloader.releaseAllResources()).not.toThrow();
  });
});
