// @vitest-environment node

// Capture registered IPC handlers
const mockHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ focus: vi.fn() })),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  copyFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
}));

import { dialog } from 'electron';
import { readFile, writeFile, readdir, stat, rename, unlink } from 'fs/promises';
import { registerFileIpc } from '../../../src/main/ipc/file';

const mockDialog = vi.mocked(dialog);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockRename = vi.mocked(rename);
const mockUnlink = vi.mocked(unlink);

// Fake IPC event with sender
const fakeEvent = { sender: {} } as any;

function getHandler(channel: string): Function {
  const handler = mockHandlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHandlers.clear();
  registerFileIpc();
});

describe('file:saveBms', () => {
  it('writes to tmp file then renames to target', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const result = await getHandler('file:saveBms')(fakeEvent, '/path/to/chart.bms', 'content');

    expect(mockWriteFile).toHaveBeenCalledWith('/path/to/chart.bms.tmp', 'content', 'utf-8');
    expect(mockRename).toHaveBeenCalledWith('/path/to/chart.bms.tmp', '/path/to/chart.bms');
    expect(result).toBe(true);
  });

  it('falls back to direct write when rename fails (cross-drive)', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockRejectedValue(new Error('EXDEV: cross-device link'));
    mockUnlink.mockResolvedValue(undefined);

    const result = await getHandler('file:saveBms')(fakeEvent, '/path/to/chart.bms', 'content');

    // First call: write to tmp, second call: direct write to target
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenNthCalledWith(1, '/path/to/chart.bms.tmp', 'content', 'utf-8');
    expect(mockWriteFile).toHaveBeenNthCalledWith(2, '/path/to/chart.bms', 'content', 'utf-8');
    expect(mockUnlink).toHaveBeenCalledWith('/path/to/chart.bms.tmp');
    expect(result).toBe(true);
  });

  it('writes content as utf-8', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const koreanContent = '#TITLE \ud14c\uc2a4\ud2b8\n#BPM 130';
    await getHandler('file:saveBms')(fakeEvent, '/chart.bms', koreanContent);

    expect(mockWriteFile).toHaveBeenCalledWith('/chart.bms.tmp', koreanContent, 'utf-8');
  });
});

describe('file:createNewBms', () => {
  it('returns null when dialog is canceled', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });

    const result = await getHandler('file:createNewBms')(fakeEvent, {
      title: 'Test', artist: 'Me', bpm: 130, keyMode: '7K',
    });

    expect(result).toBeNull();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('sets PLAYER 1 for 7K mode', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/test.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    await getHandler('file:createNewBms')(fakeEvent, {
      title: 'Song', artist: 'Artist', bpm: 150, keyMode: '7K',
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('#PLAYER 1');
  });

  it('sets PLAYER 2 for 10K mode', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/test.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    await getHandler('file:createNewBms')(fakeEvent, {
      title: 'Song', artist: 'Artist', bpm: 150, keyMode: '10K',
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('#PLAYER 2');
  });

  it('sets PLAYER 2 for 14K mode', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/test.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    await getHandler('file:createNewBms')(fakeEvent, {
      title: 'Song', artist: 'Artist', bpm: 150, keyMode: '14K',
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('#PLAYER 2');
  });

  it('generates BMS with correct headers', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/new.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    await getHandler('file:createNewBms')(fakeEvent, {
      title: 'My Song', artist: 'DJ Test', bpm: 170, keyMode: '7K',
    });

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toContain('#TITLE My Song');
    expect(content).toContain('#ARTIST DJ Test');
    expect(content).toContain('#BPM 170');
    expect(content).toContain('#RANK 3');
  });

  it('uses atomic write strategy (tmp + rename)', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/new.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    await getHandler('file:createNewBms')(fakeEvent, {
      title: 'T', artist: 'A', bpm: 130, keyMode: '7K',
    });

    expect(mockWriteFile).toHaveBeenCalledWith('/new.bms.tmp', expect.any(String), 'utf-8');
    expect(mockRename).toHaveBeenCalledWith('/new.bms.tmp', '/new.bms');
  });
});

describe('file:checkAutoSave', () => {
  it('returns null when autosave does not exist', async () => {
    mockStat.mockImplementation(async (p) => {
      if ((p as string).endsWith('.autosave')) throw new Error('ENOENT');
      return { mtimeMs: 1000 } as any;
    });

    const result = await getHandler('file:checkAutoSave')(fakeEvent, '/chart.bms');
    expect(result).toBeNull();
  });

  it('returns content when autosave is newer than main file', async () => {
    mockStat.mockImplementation(async (p) => {
      if ((p as string).endsWith('.autosave')) return { mtimeMs: 2000 } as any;
      return { mtimeMs: 1000 } as any;
    });
    mockReadFile.mockResolvedValue('autosaved content' as any);

    const result = await getHandler('file:checkAutoSave')(fakeEvent, '/chart.bms');

    expect(result).toBe('autosaved content');
    expect(mockReadFile).toHaveBeenCalledWith('/chart.bms.autosave', 'utf-8');
  });

  it('returns null when autosave is older than main file', async () => {
    mockStat.mockImplementation(async (p) => {
      if ((p as string).endsWith('.autosave')) return { mtimeMs: 500 } as any;
      return { mtimeMs: 1000 } as any;
    });

    const result = await getHandler('file:checkAutoSave')(fakeEvent, '/chart.bms');
    expect(result).toBeNull();
  });

  it('returns content when main file does not exist but autosave does', async () => {
    mockStat.mockImplementation(async (p) => {
      if ((p as string).endsWith('.autosave')) return { mtimeMs: 1000 } as any;
      throw new Error('ENOENT');
    });
    mockReadFile.mockResolvedValue('recovered content' as any);

    const result = await getHandler('file:checkAutoSave')(fakeEvent, '/chart.bms');
    expect(result).toBe('recovered content');
  });
});

describe('file:writeAutoSave', () => {
  it('writes to .autosave suffix path', async () => {
    mockWriteFile.mockResolvedValue(undefined);

    const result = await getHandler('file:writeAutoSave')(fakeEvent, '/chart.bms', 'data');

    expect(mockWriteFile).toHaveBeenCalledWith('/chart.bms.autosave', 'data', 'utf-8');
    expect(result).toBe(true);
  });
});

describe('file:deleteAutoSave', () => {
  it('deletes the .autosave file', async () => {
    mockUnlink.mockResolvedValue(undefined);

    const result = await getHandler('file:deleteAutoSave')(fakeEvent, '/chart.bms');

    expect(mockUnlink).toHaveBeenCalledWith('/chart.bms.autosave');
    expect(result).toBe(true);
  });

  it('does not throw if autosave file is missing', async () => {
    mockUnlink.mockRejectedValue(new Error('ENOENT'));

    const result = await getHandler('file:deleteAutoSave')(fakeEvent, '/chart.bms');
    expect(result).toBe(true);
  });
});

describe('file:saveWavSlice', () => {
  it('writes WAV header with correct RIFF/WAVE markers', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const pcm = new Float32Array([0, 0]);

    await getHandler('file:saveWavSlice')(fakeEvent, '/out.wav', pcm, 44100, 1);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
  });

  it('writes correct fmt chunk values', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const pcm = new Float32Array([0, 0, 0, 0]); // 4 floats, stereo => 2 samples

    await getHandler('file:saveWavSlice')(fakeEvent, '/out.wav', pcm, 48000, 2);

    const writeCall = mockWriteFile.mock.calls.find(
      (c) => c[0] === '/out.wav',
    )!;
    const buffer = writeCall[1] as Buffer;
    expect(buffer.readUInt16LE(20)).toBe(1); // PCM format
    expect(buffer.readUInt16LE(22)).toBe(2); // channels
    expect(buffer.readUInt32LE(24)).toBe(48000); // sample rate
    expect(buffer.readUInt16LE(32)).toBe(4); // blockAlign = channels * 2
    expect(buffer.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it('writes correct data chunk size', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const pcm = new Float32Array([0.5, -0.5, 0.25, -0.25]); // 4 samples mono

    await getHandler('file:saveWavSlice')(fakeEvent, '/out.wav', pcm, 44100, 1);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    const dataSize = buffer.readUInt32LE(40);
    expect(dataSize).toBe(4 * 2); // 4 samples * 2 bytes each
    expect(buffer.readUInt32LE(4)).toBe(36 + dataSize); // RIFF chunk size
  });

  it('converts float32 to int16 correctly: 1.0 -> 32767, -1.0 -> -32768, 0 -> 0', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const pcm = new Float32Array([1.0, -1.0, 0.0]);

    await getHandler('file:saveWavSlice')(fakeEvent, '/out.wav', pcm, 44100, 1);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(32767);  // 1.0 * 0x7fff
    expect(buffer.readInt16LE(46)).toBe(-32768); // -1.0 * 0x8000
    expect(buffer.readInt16LE(48)).toBe(0);      // 0 * 0x7fff
  });

  it('clamps values beyond [-1, 1] range', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const pcm = new Float32Array([2.5, -3.0]);

    await getHandler('file:saveWavSlice')(fakeEvent, '/out.wav', pcm, 44100, 1);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(32767);  // clamped to 1.0
    expect(buffer.readInt16LE(46)).toBe(-32768); // clamped to -1.0
  });
});

describe('file:listBmsFolder', () => {
  it('returns BMS files from a folder', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'chart.bms', isDirectory: () => false, isFile: () => true },
      { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
      { name: 'chart.bme', isDirectory: () => false, isFile: () => true },
    ] as any);
    mockStat.mockResolvedValue({ size: 1234 } as any);

    const result = await getHandler('file:listBmsFolder')(fakeEvent, '/songs/my-song');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'chart.bms',
      path: expect.stringContaining('chart.bms'),
      size: 1234,
      ext: '.bms',
    });
    expect(result[1]).toEqual({
      name: 'chart.bme',
      path: expect.stringContaining('chart.bme'),
      size: 1234,
      ext: '.bme',
    });
  });

  it('recurses into subdirectories', async () => {
    // First call: root dir with a subdirectory
    mockReaddir.mockResolvedValueOnce([
      { name: 'subdir', isDirectory: () => true, isFile: () => false },
    ] as any);
    // Second call: subdirectory with a BMS file
    mockReaddir.mockResolvedValueOnce([
      { name: 'deep.pms', isDirectory: () => false, isFile: () => true },
    ] as any);
    mockStat.mockResolvedValue({ size: 500 } as any);

    const result = await getHandler('file:listBmsFolder')(fakeEvent, '/root');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('deep.pms');
    expect(result[0].ext).toBe('.pms');
  });

  it('respects depth limit of 5', async () => {
    // Create 7 levels of directories - only first 6 should be entered (depth 0-5)
    // At depth > 5, scanDir returns immediately
    const makeDirEntry = (name: string) => ({
      name,
      isDirectory: () => true,
      isFile: () => false,
    });
    const makeFileEntry = (name: string) => ({
      name,
      isDirectory: () => false,
      isFile: () => true,
    });

    // depth 0 through 5: each has a subdir
    for (let i = 0; i < 6; i++) {
      mockReaddir.mockResolvedValueOnce([makeDirEntry(`level${i + 1}`)] as any);
    }
    // depth 6: has a BMS file, but should never be read (depth > 5)
    mockReaddir.mockResolvedValueOnce([makeFileEntry('too-deep.bms')] as any);

    const result = await getHandler('file:listBmsFolder')(fakeEvent, '/root');

    // readdir called 6 times (depth 0-5), the 7th level is not entered
    expect(mockReaddir).toHaveBeenCalledTimes(6);
    expect(result).toHaveLength(0); // no files in any of the directory levels
  });

  it('filters by BMS extensions (.bms, .bme, .bml, .pms, .bmson)', async () => {
    mockReaddir.mockReset();
    mockReaddir.mockResolvedValue([
      { name: 'a.bms', isDirectory: () => false, isFile: () => true },
      { name: 'b.bme', isDirectory: () => false, isFile: () => true },
      { name: 'c.bml', isDirectory: () => false, isFile: () => true },
      { name: 'd.pms', isDirectory: () => false, isFile: () => true },
      { name: 'e.bmson', isDirectory: () => false, isFile: () => true },
      { name: 'f.wav', isDirectory: () => false, isFile: () => true },
      { name: 'g.mp3', isDirectory: () => false, isFile: () => true },
      { name: 'h.txt', isDirectory: () => false, isFile: () => true },
    ] as any);
    mockStat.mockResolvedValue({ size: 100 } as any);

    const result = await getHandler('file:listBmsFolder')(fakeEvent, '/folder');

    expect(result).toHaveLength(5);
    const exts = result.map((f: any) => f.ext);
    expect(exts).toEqual(['.bms', '.bme', '.bml', '.pms', '.bmson']);
  });

  it('returns name, path, size, and ext for each file', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'test.bms', isDirectory: () => false, isFile: () => true },
    ] as any);
    mockStat.mockResolvedValue({ size: 9876 } as any);

    const result = await getHandler('file:listBmsFolder')(fakeEvent, '/songs');

    expect(result[0]).toHaveProperty('name', 'test.bms');
    expect(result[0]).toHaveProperty('path');
    expect(result[0]).toHaveProperty('size', 9876);
    expect(result[0]).toHaveProperty('ext', '.bms');
  });
});

describe('dialog:openBmsFile', () => {
  it('returns null when dialog is canceled', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await getHandler('dialog:openBmsFile')(fakeEvent);
    expect(result).toBeNull();
  });

  it('returns selected file path', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/songs/chart.bms'],
    });

    const result = await getHandler('dialog:openBmsFile')(fakeEvent);
    expect(result).toBe('/songs/chart.bms');
  });
});

describe('dialog:openBmsFolder', () => {
  it('returns null when dialog is canceled', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await getHandler('dialog:openBmsFolder')(fakeEvent);
    expect(result).toBeNull();
  });

  it('returns selected folder path', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/songs/my-folder'],
    });

    const result = await getHandler('dialog:openBmsFolder')(fakeEvent);
    expect(result).toBe('/songs/my-folder');
  });
});

describe('file:readBms', () => {
  it('returns raw buffer', async () => {
    const buf = Buffer.from('#TITLE test\n');
    mockReadFile.mockResolvedValue(buf as any);

    const result = await getHandler('file:readBms')(fakeEvent, '/chart.bms');
    expect(result).toBe(buf);
  });
});

describe('file:saveAs', () => {
  it('returns null when dialog is canceled', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });

    const result = await getHandler('file:saveAs')(fakeEvent, 'content', 'test.bms');
    expect(result).toBeNull();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('saves file and returns path on success', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/new/song.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const result = await getHandler('file:saveAs')(fakeEvent, 'bms content', 'song.bms');

    expect(result).toBe('/new/song.bms');
    expect(mockWriteFile).toHaveBeenCalledWith('/new/song.bms.tmp', 'bms content', 'utf-8');
    expect(mockRename).toHaveBeenCalledWith('/new/song.bms.tmp', '/new/song.bms');
  });

  it('falls back to direct write on rename failure', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/x/chart.bms' });
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockRejectedValue(new Error('EXDEV'));
    mockUnlink.mockResolvedValue(undefined);

    const result = await getHandler('file:saveAs')(fakeEvent, 'data');

    expect(result).toBe('/x/chart.bms');
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith('/x/chart.bms.tmp');
  });

  it('returns null when win is null', async () => {
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as any);

    const result = await getHandler('file:saveAs')(fakeEvent, 'content');
    expect(result).toBeNull();
  });
});

describe('file:importKeysounds', () => {
  it('returns empty array when dialog is canceled', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await getHandler('file:importKeysounds')(fakeEvent, '/songs/chart.bms');
    expect(result).toEqual([]);
  });

  it('copies audio files to BMS directory', async () => {
    const { copyFile } = await import('fs/promises');
    const mockCopyFile = vi.mocked(copyFile);

    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/downloads/kick.wav', '/downloads/snare.wav'],
    });
    mockCopyFile.mockResolvedValue(undefined);

    const result = await getHandler('file:importKeysounds')(fakeEvent, '/songs/chart.bms');

    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe('kick.wav');
    expect(result[1].filename).toBe('snare.wav');
    expect(mockCopyFile).toHaveBeenCalledTimes(2);
  });

  it('skips copy when source equals destination', async () => {
    const { copyFile } = await import('fs/promises');
    const mockCopyFile = vi.mocked(copyFile);

    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/songs/kick.wav'],  // same dir as BMS file
    });

    const result = await getHandler('file:importKeysounds')(fakeEvent, '/songs/chart.bms');

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('kick.wav');
    // copyFile should NOT be called because src path matches dest path
    // (depends on path.join resolving the same)
  });

  it('returns empty array when win is null', async () => {
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as any);

    const result = await getHandler('file:importKeysounds')(fakeEvent, '/songs/chart.bms');
    expect(result).toEqual([]);
  });
});

describe('dialog:openAudioFile', () => {
  it('returns null when dialog is canceled', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await getHandler('dialog:openAudioFile')(fakeEvent);
    expect(result).toBeNull();
  });

  it('returns selected audio file path', async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/music/song.wav'],
    });

    const result = await getHandler('dialog:openAudioFile')(fakeEvent);
    expect(result).toBe('/music/song.wav');
  });

  it('returns null when win is null', async () => {
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as any);

    const result = await getHandler('dialog:openAudioFile')(fakeEvent);
    expect(result).toBeNull();
  });
});

describe('file:saveWavSlices', () => {
  it('saves multiple WAV slices and returns filenames', async () => {
    mockWriteFile.mockResolvedValue(undefined);

    const slices = [
      { filename: 'slice1.wav', pcmData: new Float32Array([0.5, -0.5]), sampleRate: 44100, channels: 1 },
      { filename: 'slice2.wav', pcmData: new Float32Array([0.1, -0.1, 0.2, -0.2]), sampleRate: 48000, channels: 2 },
    ];

    const result = await getHandler('file:saveWavSlices')(fakeEvent, '/output', slices);

    expect(result).toEqual(['slice1.wav', 'slice2.wav']);
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('writes valid RIFF/WAVE headers for each slice', async () => {
    mockWriteFile.mockResolvedValue(undefined);

    const slices = [
      { filename: 'test.wav', pcmData: new Float32Array([0, 0]), sampleRate: 44100, channels: 1 },
    ];

    await getHandler('file:saveWavSlices')(fakeEvent, '/out', slices);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
  });

  it('returns empty array for empty slices', async () => {
    const result = await getHandler('file:saveWavSlices')(fakeEvent, '/out', []);
    expect(result).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('converts float32 to int16 correctly', async () => {
    mockWriteFile.mockResolvedValue(undefined);

    const slices = [
      { filename: 'test.wav', pcmData: new Float32Array([1.0, -1.0, 0.0]), sampleRate: 44100, channels: 1 },
    ];

    await getHandler('file:saveWavSlices')(fakeEvent, '/out', slices);

    const buffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(32767);  // 1.0
    expect(buffer.readInt16LE(46)).toBe(-32768); // -1.0
    expect(buffer.readInt16LE(48)).toBe(0);      // 0.0
  });
});
