import {
  loadRecentFiles,
  addRecentFile,
  removeRecentFile,
  togglePinRecentFile,
  loadSession,
  saveSession,
} from '../../../src/renderer/lib/sessionStorage';

describe('sessionStorage — recentFiles', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty array when no data', () => {
    expect(loadRecentFiles()).toEqual([]);
  });

  it('adds a recent file', () => {
    const result = addRecentFile({ path: '/a.bms', name: 'a.bms', folderPath: '/' });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/a.bms');
    expect(result[0].lastOpened).toBeGreaterThan(0);
  });

  it('moves duplicate to front', () => {
    addRecentFile({ path: '/a.bms', name: 'a.bms', folderPath: '/' });
    addRecentFile({ path: '/b.bms', name: 'b.bms', folderPath: '/' });
    const result = addRecentFile({ path: '/a.bms', name: 'a.bms', folderPath: '/' });
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/a.bms');
  });

  it('limits to 10 unpinned entries', () => {
    for (let i = 0; i < 15; i++) {
      addRecentFile({ path: `/${i}.bms`, name: `${i}.bms`, folderPath: '/' });
    }
    const result = loadRecentFiles();
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('pinned files survive re-add after pinning', () => {
    addRecentFile({ path: '/pinme.bms', name: 'pinme.bms', folderPath: '/' });
    togglePinRecentFile('/pinme.bms');
    // Re-add the same file — should keep pinned status
    const result = addRecentFile({ path: '/pinme.bms', name: 'pinme.bms', folderPath: '/' });
    expect(result[0].pinned).toBe(true);
  });

  it('removes a file', () => {
    addRecentFile({ path: '/a.bms', name: 'a.bms', folderPath: '/' });
    addRecentFile({ path: '/b.bms', name: 'b.bms', folderPath: '/' });
    const result = removeRecentFile('/a.bms');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/b.bms');
  });

  it('toggles pin', () => {
    addRecentFile({ path: '/a.bms', name: 'a.bms', folderPath: '/' });
    let result = togglePinRecentFile('/a.bms');
    expect(result[0].pinned).toBe(true);
    result = togglePinRecentFile('/a.bms');
    expect(result[0].pinned).toBe(false);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('bms-recent-files', '{bad json');
    expect(loadRecentFiles()).toEqual([]);
  });
});

describe('sessionStorage — session', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no session', () => {
    expect(loadSession()).toBeNull();
  });

  it('saves and loads session', () => {
    const data = { lastRoute: 'editor' as const, lastFile: { path: '/a.bms', name: 'a.bms', folderPath: '/' } };
    saveSession(data);
    expect(loadSession()).toEqual(data);
  });

  it('handles corrupted session gracefully', () => {
    localStorage.setItem('bms-session', 'not json');
    expect(loadSession()).toBeNull();
  });
});
