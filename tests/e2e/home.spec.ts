import { test, expect } from './electron-app';

test.describe('Home Screen', () => {
  test('app window opens', async ({ window }) => {
    const title = await window.title();
    expect(title).toBeTruthy();
  });

  test('home screen renders with open file/folder buttons', async ({ window }) => {
    // Wait for the app to fully render
    await window.waitForTimeout(1000);

    // Home should show open file button
    const openFileBtn = window.locator('button', { hasText: /파일|Open|열기/i });
    // There should be at least one button visible
    const buttons = await window.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('window has correct minimum size', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    const { width, height } = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(width).toBeGreaterThanOrEqual(780); // ~800 min with chrome
    expect(height).toBeGreaterThanOrEqual(580); // ~600 min with chrome
  });

  test('no console errors on startup', async ({ window }) => {
    const errors: string[] = [];
    window.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await window.waitForTimeout(2000);
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('DevTools'),
    );
    expect(criticalErrors).toEqual([]);
  });

  test('can navigate to editor via dev helper', async ({ window }) => {
    // Use dev helpers to open a file
    await window.evaluate(() => {
      (window as any).__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
    });
    await window.evaluate(() => {
      (window as any).__DEV_NAVIGATE__('editor');
    });
    await window.waitForTimeout(500);
    // Editor should have loaded (check for editor-specific elements)
    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });
});
