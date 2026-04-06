/**
 * T4: requestId race condition — 구버전 PHASE2_DONE 결과 무시 확인
 *
 * useHomeBmsFile에서 Worker 기반 파싱의 requestId guard 동작을 검증합니다.
 */

import { renderHook, act } from '@testing-library/react';

// ------------------------------------------------------------------
// Worker mock: a class that captures postMessage and exposes helpers
// ------------------------------------------------------------------
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  lastMessage: { type: string; requestId: number } | null = null;

  postMessage(msg: unknown) {
    this.lastMessage = msg as { type: string; requestId: number };
  }
  terminate() { this.terminated = true; }

  simulatePhase1Done(requestId: number) {
    this.onmessage?.({
      data: {
        type: 'PHASE1_DONE', requestId,
        songInfo: { title: 'Mock Song', artist: 'Mock', genre: '', subtitles: [], subartists: [], difficulty: 0, level: 0 },
        bpm: { initial: 130, min: 130, max: 130 },
        keyMode: '7K', lnType: 1,
      },
    } as MessageEvent);
  }

  simulatePhase2Done(requestId: number, totalNotes: number) {
    this.onmessage?.({
      data: {
        type: 'PHASE2_DONE', requestId,
        notes: Array(totalNotes).fill(null).map((_, i) => ({ id: String(i), beat: i, column: 'K1', noteType: 'playable', keysound: '01' })),
        stats: { total: totalNotes, scratch: 0, longNotes: 0, landmines: 0, invisible: 0 },
        bpm: { initial: 130, min: 130, max: 130 },
        bpmChanges: [], stops: [], scrollChanges: [], keysounds: {}, barLines: [], totalBeats: totalNotes + 4,
      },
    } as MessageEvent);
  }

  simulateParseError(requestId: number) {
    this.onmessage?.({ data: { type: 'PARSE_ERROR', requestId, error: 'Parse failed' } } as MessageEvent);
  }
}

// Holds the most recently created MockWorker instance
let mockWorkerInstance: MockWorker | null = null;

// Mock as a class (not a factory fn) so `new BmsParserWorker()` works
vi.mock('../../../src/renderer/workers/bmsParser.worker?worker', () => {
  function BmsParserWorkerMock(this: MockWorker) {
    const instance = new MockWorker();
    mockWorkerInstance = instance;
    // Copy own properties to `this` so the hook can set .onmessage / .onerror
    Object.assign(this, instance);
    // Ensure methods are bound to the shared instance
    this.postMessage = instance.postMessage.bind(instance);
    this.terminate = instance.terminate.bind(instance);
    // When the hook sets .onmessage / .onerror on `this`, proxy to instance
    return instance;
  }
  return { default: BmsParserWorkerMock };
});

// Mock window.api.file.readBms
const mockReadBms = vi.fn();
Object.defineProperty(globalThis, 'window', {
  value: { api: { file: { readBms: mockReadBms } } },
  writable: true,
});

import { useHomeBmsFile } from '../../../src/renderer/hooks/useHomeBmsFile';

describe('useHomeBmsFile — requestId race condition guard', () => {
  beforeEach(() => {
    mockWorkerInstance = null;
    mockReadBms.mockResolvedValue(new ArrayBuffer(8));
  });

  it('T4a: PHASE1_DONE transitions phase to phase1', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('test.bms'); });
    act(() => { mockWorkerInstance?.simulatePhase1Done(1); });

    expect(result.current.phase).toBe('phase1');
    expect(result.current.chart?.songInfo?.title).toBe('Mock Song');
    expect(result.current.isLoading).toBe(true);
  });

  it('T4b: PHASE2_DONE transitions phase to ready', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('test.bms'); });
    act(() => { mockWorkerInstance?.simulatePhase1Done(1); });
    act(() => { mockWorkerInstance?.simulatePhase2Done(1, 5); });

    expect(result.current.phase).toBe('ready');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.chart?.stats.total).toBe(5);
  });

  it('T4c: stale PHASE2_DONE with old requestId is ignored', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('file-a.bms'); });
    await act(async () => { result.current.load('file-b.bms'); });

    // Worker #2 now active with reqId=2
    act(() => { mockWorkerInstance?.simulatePhase1Done(2); });

    // Worker #2 receives stale PHASE2_DONE with requestId=1 (from old request)
    // The guard should reject this since reqId=2 !== 1
    act(() => { mockWorkerInstance?.simulatePhase2Done(1, 999); });

    expect(result.current.chart?.stats?.total).not.toBe(999);
  });

  it('T4d: previous Worker is terminated when new load() is called', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('file-a.bms'); });
    const firstWorker = mockWorkerInstance;
    expect(firstWorker?.terminated).toBe(false);

    await act(async () => { result.current.load('file-b.bms'); });
    expect(firstWorker?.terminated).toBe(true);
  });

  it('T4e: PARSE_ERROR sets error state and phase=idle', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('broken.bms'); });
    act(() => { mockWorkerInstance?.simulateParseError(1); });

    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('Parse failed');
    expect(result.current.chart).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('T4f: stale PARSE_ERROR with old requestId is ignored', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('file-a.bms'); });
    await act(async () => { result.current.load('file-b.bms'); });

    // Worker #2 now active with reqId=2
    act(() => { mockWorkerInstance?.simulatePhase1Done(2); });

    // Worker #2 receives stale PARSE_ERROR with requestId=1 — should be ignored
    act(() => { mockWorkerInstance?.simulateParseError(1); });

    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe('phase1');
  });

  it('T4g: reset() clears state and terminates worker', async () => {
    const { result } = renderHook(() => useHomeBmsFile());

    await act(async () => { result.current.load('test.bms'); });
    act(() => { mockWorkerInstance?.simulatePhase1Done(1); });

    const workerBeforeReset = mockWorkerInstance;
    act(() => { result.current.reset(); });

    expect(workerBeforeReset?.terminated).toBe(true);
    expect(result.current.phase).toBe('idle');
    expect(result.current.chart).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
