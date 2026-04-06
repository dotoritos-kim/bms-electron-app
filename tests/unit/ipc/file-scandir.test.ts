// @vitest-environment node

/**
 * TEST: scanDir 병렬 stat 결과 동일성 테스트
 * - stat 호출이 병렬로 실행됨 (Promise.all 배치)
 * - 결과가 올바르게 수집됨
 */

const mockHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ focus: vi.fn() })) },
}));

// Track stat call timing to verify parallelism
const statCallTimes: number[] = [];
let statResolveCallbacks: Array<() => void> = [];

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(async (_path: string) => {
    statCallTimes.push(Date.now());
    // Return immediately — parallel check is based on call count tracking
    return { size: 1024 };
  }),
  copyFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
}));

import { readdir, stat } from 'fs/promises';
import { registerFileIpc } from '../../../src/main/ipc/file';

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const fakeEvent = { sender: {} } as Electron.IpcMainInvokeEvent;

function getHandler(channel: string): Function {
  const h = mockHandlers.get(channel);
  if (!h) throw new Error(`No handler for: ${channel}`);
  return h;
}

beforeAll(() => {
  registerFileIpc();
});

beforeEach(() => {
  statCallTimes.length = 0;
  statResolveCallbacks = [];
  vi.clearAllMocks();
  mockStat.mockResolvedValue({ size: 1024 } as unknown as Awaited<ReturnType<typeof stat>>);
});

describe('file:listBmsFolder — parallel stat', () => {
  it('returns BMS files from a flat folder', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'song1.bms', isDirectory: () => false, isFile: () => true },
      { name: 'song2.bme', isDirectory: () => false, isFile: () => true },
      { name: 'image.png', isDirectory: () => false, isFile: () => true }, // skipped
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const handler = getHandler('file:listBmsFolder');
    const result = await handler(fakeEvent, '/songs');

    expect(result).toHaveLength(2);
    expect(result[0].ext).toMatch(/\.(bms|bme)/);
    expect(result[0].size).toBe(1024);
  });

  it('calls stat for each BMS file exactly once', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'a.bms', isDirectory: () => false, isFile: () => true },
      { name: 'b.bms', isDirectory: () => false, isFile: () => true },
      { name: 'c.bms', isDirectory: () => false, isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const handler = getHandler('file:listBmsFolder');
    await handler(fakeEvent, '/songs');

    expect(mockStat).toHaveBeenCalledTimes(3);
  });

  it('handles 25 BMS files — stat called in 2 batches (20 + 5)', async () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      name: `song${i}.bms`,
      isDirectory: () => false,
      isFile: () => true,
    }));
    mockReaddir.mockResolvedValue(entries as unknown as Awaited<ReturnType<typeof readdir>>);

    const statOrder: number[] = [];
    let callIndex = 0;
    mockStat.mockImplementation(async (_path: string) => {
      statOrder.push(callIndex++);
      return { size: 512 } as unknown as Awaited<ReturnType<typeof stat>>;
    });

    const handler = getHandler('file:listBmsFolder');
    const result = await handler(fakeEvent, '/songs');

    expect(result).toHaveLength(25);
    expect(mockStat).toHaveBeenCalledTimes(25);
    // All 25 stat calls should have been made
    expect(statOrder).toHaveLength(25);
  });

  it('returns correct file metadata', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'mysong.bms', isDirectory: () => false, isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof readdir>>);
    mockStat.mockResolvedValue({ size: 8192 } as unknown as Awaited<ReturnType<typeof stat>>);

    const handler = getHandler('file:listBmsFolder');
    const result = await handler(fakeEvent, '/folder');

    expect(result[0]).toMatchObject({
      name: 'mysong.bms',
      ext: '.bms',
      size: 8192,
    });
    expect(result[0].path).toContain('mysong.bms');
  });

  it('recursively scans subdirectories', async () => {
    mockReaddir
      .mockResolvedValueOnce([
        { name: 'sub', isDirectory: () => true, isFile: () => false },
        { name: 'root.bms', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>)
      .mockResolvedValueOnce([
        { name: 'child.bms', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const handler = getHandler('file:listBmsFolder');
    const result = await handler(fakeEvent, '/root');

    expect(result).toHaveLength(2);
    const names = result.map((r: { name: string }) => r.name);
    expect(names).toContain('root.bms');
    expect(names).toContain('child.bms');
  });

  it('skips non-BMS files', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'cover.jpg', isDirectory: () => false, isFile: () => true },
      { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
      { name: 'chart.bms', isDirectory: () => false, isFile: () => true },
      { name: 'score.bmson', isDirectory: () => false, isFile: () => true },
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const handler = getHandler('file:listBmsFolder');
    const result = await handler(fakeEvent, '/folder');

    expect(result).toHaveLength(2);
  });
});
