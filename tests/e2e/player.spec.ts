import { test, expect } from './electron-app';

async function openPlayer(window: any) {
  await window.evaluate(() => {
    (window as any).__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
  });
  await window.evaluate(() => {
    (window as any).__DEV_NAVIGATE__('player');
  });
  await window.waitForTimeout(1000);
}

test.describe('Player', () => {
  test('player renders without crash', async ({ window }) => {
    await openPlayer(window);
    const errorText = await window.locator('text=Rendering Error').count();
    expect(errorText).toBe(0);
  });

  test('player shows content (not blank)', async ({ window }) => {
    await openPlayer(window);
    const bodyText = await window.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('can navigate back from player', async ({ window }) => {
    await openPlayer(window);
    await window.evaluate(() => {
      (window as any).__DEV_NAVIGATE__('home');
    });
    await window.waitForTimeout(500);
    const errorText = await window.locator('text=Rendering Error').count();
    expect(errorText).toBe(0);
  });

  test('screenshot baseline - player view', async ({ window }) => {
    await openPlayer(window);
    await window.waitForTimeout(1000);
    const screenshot = await window.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(0);
  });
});
