import { createLocalAudioWorker } from '../../../src/renderer/lib/LocalAudioWorker';

describe('LocalAudioWorker', () => {
  let mockReadBatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadBatch = vi.fn();
    (globalThis as any).window = {
      ...globalThis.window,
      api: {
        audio: {
          readBatch: mockReadBatch,
        },
      },
    };
  });

  describe('createLocalAudioWorker', () => {
    it('returns a Worker-like object with postMessage, addEventListener, terminate, onmessage', () => {
      const worker = createLocalAudioWorker('/path/to/file.bms');
      expect(typeof worker.postMessage).toBe('function');
      expect(typeof worker.addEventListener).toBe('function');
      expect(typeof worker.removeEventListener).toBe('function');
      expect(typeof worker.terminate).toBe('function');
      expect(worker.onmessage).toBeNull();
    });

    it('empty fileMap sends immediate DONE message (total: 0, loaded: 0)', async () => {
      // readBatch should not be called for empty fileMap
      const worker = createLocalAudioWorker('/path/to/file.bms');
      const messages: any[] = [];
      worker.onmessage = (e: MessageEvent) => messages.push(e.data);

      worker.postMessage({ type: 'LOAD_AUDIO', payload: { baseUrl: '', fileMap: {} } });

      // Wait for async processing
      await vi.waitFor(() => {
        expect(messages.length).toBe(1);
      });

      expect(messages[0]).toEqual({ type: 'DONE', payload: { total: 0, loaded: 0 } });
      expect(mockReadBatch).not.toHaveBeenCalled();
    });

    it('successful load emits PROGRESS + LOADED for each file, then DONE', async () => {
      const buf1 = new ArrayBuffer(10);
      const buf2 = new ArrayBuffer(20);
      mockReadBatch.mockResolvedValue({
        results: { key1: buf1, key2: buf2 },
        errors: {},
      });

      const worker = createLocalAudioWorker('/path/to/file.bms');
      const messages: any[] = [];
      worker.onmessage = (e: MessageEvent) => messages.push(e.data);

      worker.postMessage({
        type: 'LOAD_AUDIO',
        payload: { baseUrl: '', fileMap: { key1: 'sound1.wav', key2: 'sound2.wav' } },
      });

      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'DONE')).toBe(true);
      });

      // Should have: PROGRESS, LOADED, PROGRESS, LOADED, DONE = 5 messages
      const progressMsgs = messages.filter((m) => m.type === 'PROGRESS');
      const loadedMsgs = messages.filter((m) => m.type === 'LOADED');
      const doneMsgs = messages.filter((m) => m.type === 'DONE');

      expect(progressMsgs.length).toBe(2);
      expect(loadedMsgs.length).toBe(2);
      expect(doneMsgs.length).toBe(1);
      expect(doneMsgs[0].payload).toEqual({ total: 2, loaded: 2 });
    });

    it('partial failure emits LOADED for success, ERROR for failures, then DONE', async () => {
      const buf = new ArrayBuffer(10);
      mockReadBatch.mockResolvedValue({
        results: { ok: buf },
        errors: { bad: 'File not found' },
      });

      const worker = createLocalAudioWorker('/path/to/file.bms');
      const messages: any[] = [];
      worker.onmessage = (e: MessageEvent) => messages.push(e.data);

      worker.postMessage({
        type: 'LOAD_AUDIO',
        payload: { baseUrl: '', fileMap: { ok: 'good.wav', bad: 'missing.wav' } },
      });

      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'DONE')).toBe(true);
      });

      const loadedMsgs = messages.filter((m) => m.type === 'LOADED');
      const errorMsgs = messages.filter((m) => m.type === 'ERROR');
      const doneMsgs = messages.filter((m) => m.type === 'DONE');

      expect(loadedMsgs.length).toBe(1);
      expect(loadedMsgs[0].payload.key).toBe('ok');
      expect(errorMsgs.length).toBe(1);
      expect(errorMsgs[0].payload.key).toBe('bad');
      expect(errorMsgs[0].payload.message).toBe('File not found');
      expect(doneMsgs[0].payload).toEqual({ total: 2, loaded: 1 });
    });

    it('catastrophic IPC failure emits ERROR for all keys, then DONE (loaded: 0)', async () => {
      mockReadBatch.mockRejectedValue(new Error('IPC channel closed'));

      const worker = createLocalAudioWorker('/path/to/file.bms');
      const messages: any[] = [];
      worker.onmessage = (e: MessageEvent) => messages.push(e.data);

      worker.postMessage({
        type: 'LOAD_AUDIO',
        payload: { baseUrl: '', fileMap: { a: 'a.wav', b: 'b.wav', c: 'c.wav' } },
      });

      await vi.waitFor(() => {
        expect(messages.some((m) => m.type === 'DONE')).toBe(true);
      });

      const errorMsgs = messages.filter((m) => m.type === 'ERROR');
      const doneMsgs = messages.filter((m) => m.type === 'DONE');

      expect(errorMsgs.length).toBe(3);
      expect(errorMsgs[0].payload.message).toBe('IPC channel closed');
      expect(doneMsgs[0].payload).toEqual({ total: 3, loaded: 0 });
    });

    it('onmessage handler receives events', async () => {
      const worker = createLocalAudioWorker('/path/to/file.bms');
      const handler = vi.fn();
      worker.onmessage = handler;

      worker.postMessage({ type: 'LOAD_AUDIO', payload: { baseUrl: '', fileMap: {} } });

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
      });

      expect(handler.mock.calls[0][0]).toBeInstanceOf(MessageEvent);
      expect(handler.mock.calls[0][0].data.type).toBe('DONE');
    });

    it('addEventListener handler receives events', async () => {
      const worker = createLocalAudioWorker('/path/to/file.bms');
      const handler = vi.fn();
      worker.addEventListener('message', handler);

      worker.postMessage({ type: 'LOAD_AUDIO', payload: { baseUrl: '', fileMap: {} } });

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
      });

      expect(handler.mock.calls[0][0]).toBeInstanceOf(MessageEvent);
    });

    it('both onmessage and addEventListener work simultaneously', async () => {
      const worker = createLocalAudioWorker('/path/to/file.bms');
      const onmessageHandler = vi.fn();
      const listenerHandler = vi.fn();
      worker.onmessage = onmessageHandler;
      worker.addEventListener('message', listenerHandler);

      worker.postMessage({ type: 'LOAD_AUDIO', payload: { baseUrl: '', fileMap: {} } });

      await vi.waitFor(() => {
        expect(onmessageHandler).toHaveBeenCalled();
        expect(listenerHandler).toHaveBeenCalled();
      });
    });

    it('terminate() clears listeners', async () => {
      mockReadBatch.mockResolvedValue({ results: {}, errors: {} });

      const worker = createLocalAudioWorker('/path/to/file.bms');
      const handler = vi.fn();
      worker.addEventListener('message', handler);
      worker.terminate();

      // After terminate, addEventListener listeners should be cleared
      // But postMessage still processes internally; listeners just won't fire
      worker.postMessage({
        type: 'LOAD_AUDIO',
        payload: { baseUrl: '', fileMap: { k: 'v.wav' } },
      });

      // Give some time for async to settle
      await new Promise((r) => setTimeout(r, 50));
      expect(handler).not.toHaveBeenCalled();
    });

    it('removeEventListener removes a specific listener', async () => {
      const worker = createLocalAudioWorker('/path/to/file.bms');
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      worker.addEventListener('message', handler1);
      worker.addEventListener('message', handler2);
      worker.removeEventListener('message', handler1);

      worker.postMessage({ type: 'LOAD_AUDIO', payload: { baseUrl: '', fileMap: {} } });

      await vi.waitFor(() => {
        expect(handler2).toHaveBeenCalled();
      });

      expect(handler1).not.toHaveBeenCalled();
    });
  });
});
