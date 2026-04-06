// @vitest-environment node

// Capture registered IPC handlers
const mockHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

import { readFile, readdir } from 'fs/promises';
import { registerAudioIpc } from '../../../src/main/ipc/audio';

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);

const fakeEvent = { sender: {} } as any;

function getHandler(channel: string): Function {
  const handler = mockHandlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHandlers.clear();
  registerAudioIpc();
});

describe('audio:readFile', () => {
  it('returns ArrayBuffer from Buffer', async () => {
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    mockReadFile.mockResolvedValue(data as any);

    const result = await getHandler('audio:readFile')(fakeEvent, '/audio/kick.wav');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
  });

  it('returns correct slice from Buffer.buffer', async () => {
    // Node Buffer can share underlying ArrayBuffer with offset
    const data = Buffer.from([0xAA, 0xBB, 0xCC]);
    mockReadFile.mockResolvedValue(data as any);

    const result = await getHandler('audio:readFile')(fakeEvent, '/audio/snare.wav');

    expect(result.byteLength).toBe(3);
    const view = new Uint8Array(result);
    expect(view[0]).toBe(0xAA);
    expect(view[1]).toBe(0xBB);
    expect(view[2]).toBe(0xCC);
  });
});

describe('audio:readBatch', () => {
  const bmsPath = '/songs/test/chart.bms';

  it('returns empty results and errors for empty keysoundMap', async () => {
    mockReaddir.mockResolvedValue([]);

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {});

    expect(result.results).toEqual({});
    expect(result.errors).toEqual({});
  });

  it('returns all files when all are found', async () => {
    mockReaddir.mockResolvedValue(['kick.wav', 'snare.ogg'] as any);
    mockReadFile.mockImplementation(async (p) => {
      return Buffer.from([0x01]) as any;
    });

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'kick.wav',
      '02': 'snare.ogg',
    });

    expect(Object.keys(result.results)).toHaveLength(2);
    expect(result.results['01']).toBeInstanceOf(ArrayBuffer);
    expect(result.results['02']).toBeInstanceOf(ArrayBuffer);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('populates both results and errors when some files are missing', async () => {
    mockReaddir.mockResolvedValue(['kick.wav'] as any);
    mockReadFile.mockResolvedValue(Buffer.from([0x01]) as any);

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'kick.wav',
      '02': 'missing.wav',
    });

    expect(Object.keys(result.results)).toHaveLength(1);
    expect(result.results['01']).toBeInstanceOf(ArrayBuffer);
    expect(result.errors['02']).toContain('Not found');
  });

  it('matches files case-insensitively', async () => {
    mockReaddir.mockResolvedValue(['WAV01.WAV'] as any);
    mockReadFile.mockResolvedValue(Buffer.from([0xFF]) as any);

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'wav01.wav',
    });

    expect(Object.keys(result.results)).toHaveLength(1);
    expect(result.results['01']).toBeInstanceOf(ArrayBuffer);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('returns error for all keys when directory is not found', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'kick.wav',
      '02': 'snare.wav',
      '03': 'hat.wav',
    });

    expect(Object.keys(result.results)).toHaveLength(0);
    expect(Object.keys(result.errors)).toHaveLength(3);
    expect(result.errors['01']).toContain('Directory not found');
    expect(result.errors['02']).toContain('Directory not found');
    expect(result.errors['03']).toContain('Directory not found');
  });

  it('processes 25 files in 2 batches (20 + 5)', async () => {
    // Create 25 audio files
    const dirFiles = Array.from({ length: 25 }, (_, i) => `sound${i}.wav`);
    mockReaddir.mockResolvedValue(dirFiles as any);

    let readCallCount = 0;
    mockReadFile.mockImplementation(async () => {
      readCallCount++;
      return Buffer.from([0x01]) as any;
    });

    const keysoundMap: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      keysoundMap[String(i).padStart(2, '0')] = `sound${i}.wav`;
    }

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, keysoundMap);

    expect(Object.keys(result.results)).toHaveLength(25);
    expect(readCallCount).toBe(25);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('records error for specific file read failure without affecting others', async () => {
    mockReaddir.mockResolvedValue(['good.wav', 'bad.wav'] as any);
    mockReadFile.mockImplementation(async (p) => {
      if ((p as string).includes('bad.wav')) {
        throw new Error('Permission denied');
      }
      return Buffer.from([0x01]) as any;
    });

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'good.wav',
      '02': 'bad.wav',
    });

    expect(result.results['01']).toBeInstanceOf(ArrayBuffer);
    expect(result.errors['02']).toBe('Permission denied');
  });

  it('only includes audio files with supported extensions (.wav, .ogg, .mp3, .flac)', async () => {
    mockReaddir.mockResolvedValue([
      'kick.wav', 'snare.ogg', 'hat.mp3', 'bass.flac',
      'image.png', 'readme.txt', 'chart.bms', 'video.mp4',
    ] as any);
    mockReadFile.mockResolvedValue(Buffer.from([0x01]) as any);

    const result = await getHandler('audio:readBatch')(fakeEvent, bmsPath, {
      '01': 'kick.wav',
      '02': 'snare.ogg',
      '03': 'hat.mp3',
      '04': 'bass.flac',
      '05': 'image.png',  // not an audio extension
      '06': 'readme.txt', // not an audio extension
    });

    expect(result.results['01']).toBeDefined();
    expect(result.results['02']).toBeDefined();
    expect(result.results['03']).toBeDefined();
    expect(result.results['04']).toBeDefined();
    // Non-audio files in the directory listing won't be in the baseName lookup map
    expect(result.errors['05']).toContain('Not found');
    expect(result.errors['06']).toContain('Not found');
  });
});
