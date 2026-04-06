import { test, expect } from './electron-app';

test.describe('Navigation', () => {
  test('full route cycle: home -> editor -> home -> player -> home', async ({ window }) => {
    // Start at home
    await window.waitForTimeout(500);

    // Set a file
    await window.evaluate(() => {
      (window as any).__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
    });

    // Go to editor
    await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });
    await window.waitForTimeout(500);
    let errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    // Back to home
    await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('home'); });
    await window.waitForTimeout(500);
    errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    // Go to player
    await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('player'); });
    await window.waitForTimeout(500);
    errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    // Back to home
    await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('home'); });
    await window.waitForTimeout(500);
    errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('preload API is exposed correctly', async ({ window }) => {
    const hasApi = await window.evaluate(() => {
      return typeof (window as any).api === 'object' &&
        typeof (window as any).api.file === 'object' &&
        typeof (window as any).api.audio === 'object' &&
        typeof (window as any).api.file.openBmsFile === 'function' &&
        typeof (window as any).api.file.readBms === 'function' &&
        typeof (window as any).api.file.saveBms === 'function' &&
        typeof (window as any).api.audio.readFile === 'function' &&
        typeof (window as any).api.audio.readBatch === 'function';
    });
    expect(hasApi).toBe(true);
  });

  test('window.api IPC bridge has all expected methods', async ({ window }) => {
    const methods = await window.evaluate(() => {
      const api = (window as any).api;
      return {
        file: Object.keys(api.file),
        audio: Object.keys(api.audio),
        hasOn: typeof api.on === 'function',
      };
    });

    expect(methods.file).toContain('openBmsFile');
    expect(methods.file).toContain('readBms');
    expect(methods.file).toContain('saveBms');
    expect(methods.file).toContain('saveAs');
    expect(methods.file).toContain('listBmsFolder');
    expect(methods.file).toContain('createNewBms');
    expect(methods.file).toContain('writeAutoSave');
    expect(methods.file).toContain('checkAutoSave');
    expect(methods.file).toContain('deleteAutoSave');
    expect(methods.file).toContain('importKeysounds');
    expect(methods.file).toContain('saveWavSlice');
    expect(methods.file).toContain('saveWavSlices');
    expect(methods.file).toContain('openAudioFile');
    expect(methods.audio).toContain('readFile');
    expect(methods.audio).toContain('readBatch');
    expect(methods.hasOn).toBe(true);
  });

  test('dev helpers exist on window', async ({ window }) => {
    await window.waitForTimeout(500);
    const hasHelpers = await window.evaluate(() => {
      return typeof (window as any).__DEV_OPEN_FILE__ === 'function' &&
        typeof (window as any).__DEV_NAVIGATE__ === 'function';
    });
    expect(hasHelpers).toBe(true);
  });

  test('rapid navigation does not crash', async ({ window }) => {
    await window.evaluate(() => {
      (window as any).__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
    });

    // Rapidly switch routes
    for (const route of ['editor', 'home', 'player', 'home', 'editor', 'home']) {
      await window.evaluate((r) => { (window as any).__DEV_NAVIGATE__(r); }, route);
      await window.waitForTimeout(100);
    }

    await window.waitForTimeout(500);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('localStorage is accessible and persistent', async ({ window }) => {
    // Write a value
    await window.evaluate(() => {
      localStorage.setItem('test-key', 'test-value');
    });

    // Read it back
    const value = await window.evaluate(() => {
      return localStorage.getItem('test-key');
    });
    expect(value).toBe('test-value');

    // Cleanup
    await window.evaluate(() => {
      localStorage.removeItem('test-key');
    });
  });
});
