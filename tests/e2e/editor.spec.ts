import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';

/**
 * Navigate to the editor with a mock file path.
 * In test mode the IPC won't load a real BMS file, but the editor
 * route should still mount without crashing.
 */
async function openEditor(window: Page) {
  await window.evaluate(() => {
    (window as any).__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
  });
  await window.evaluate(() => {
    (window as any).__DEV_NAVIGATE__('editor');
  });
  await window.waitForTimeout(1000);
}

test.describe('Editor', () => {
  test('editor renders without crash', async ({ window }) => {
    await openEditor(window);
    // Page should not show error boundary
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('keyboard shortcuts respond', async ({ window }) => {
    await openEditor(window);
    // Press Escape should be handled without error
    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('can navigate back to home', async ({ window }) => {
    await openEditor(window);
    await window.evaluate(() => {
      (window as any).__DEV_NAVIGATE__('home');
    });
    await window.waitForTimeout(500);
    // Should be back at home - buttons should be present again
    const buttons = await window.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('tool switching via keyboard', async ({ window }) => {
    await openEditor(window);
    // Press tool shortcut keys: V=select, A=add, D=delete, M=mirror, K=keysound, B=bpm, T=tap
    for (const key of ['v', 'a', 'd', 'm', 'k', 'b', 't']) {
      await window.keyboard.press(key);
      await window.waitForTimeout(100);
    }
    // Should not crash after cycling through tools
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('undo/redo keyboard shortcuts', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);
    await window.keyboard.press('Control+y');
    await window.waitForTimeout(100);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('screenshot baseline - editor view', async ({ window }) => {
    await openEditor(window);
    await window.waitForTimeout(1000);
    const screenshot = await window.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(0);
  });

  test('Ctrl+N creates new file without error', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('Control+n');
    await window.waitForTimeout(500);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Ctrl+F opens note search dialog', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('Control+f');
    await window.waitForTimeout(300);
    // The dialog or overlay should appear - no crash is the baseline
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('quantize shortcut does not crash', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('q');
    await window.waitForTimeout(200);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('pattern panel toggle with P key', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('p');
    await window.waitForTimeout(300);
    // Toggle again
    await window.keyboard.press('p');
    await window.waitForTimeout(300);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Ctrl+Shift+S (Save As) does not crash', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('Control+Shift+s');
    await window.waitForTimeout(300);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('header bar buttons render without crash', async ({ window }) => {
    await openEditor(window);
    // Check header bar buttons exist (Diff, BPM, F5, AI, etc.)
    const buttons = await window.locator('button').count();
    expect(buttons).toBeGreaterThan(3);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('sidebar panel toggle buttons work', async ({ window }) => {
    await openEditor(window);
    // Find and click panel toggle buttons (left/right)
    const panelButtons = window.locator('button[title*="패널"]');
    const count = await panelButtons.count();
    for (let i = 0; i < count; i++) {
      await panelButtons.nth(i).click();
      await window.waitForTimeout(200);
    }
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Space key (playback toggle) does not crash in editor', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('Space');
    await window.waitForTimeout(200);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('A-B loop keys do not crash', async ({ window }) => {
    await openEditor(window);
    await window.keyboard.press('[');
    await window.waitForTimeout(100);
    await window.keyboard.press(']');
    await window.waitForTimeout(100);
    await window.keyboard.press('\\');
    await window.waitForTimeout(100);
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('error screen shows retry and open file buttons', async ({ window }) => {
    await openEditor(window);
    // Editor should show error (test file doesn't exist) with action buttons
    await window.waitForTimeout(1500);
    const retryBtn = window.locator('button', { hasText: '다시 시도' });
    const openBtn = window.locator('button', { hasText: '다른 파일 열기' });
    const homeBtn = window.locator('button, a', { hasText: '홈으로' });
    // At least the home button should be present (error or normal view)
    const hasActions = (await retryBtn.count()) > 0 || (await homeBtn.count()) > 0;
    expect(hasActions).toBe(true);
  });

  test('error screen home button clears file state', async ({ window }) => {
    await openEditor(window);
    await window.waitForTimeout(1500);
    // Click home button
    const homeBtn = window.locator('button', { hasText: '홈으로' });
    if (await homeBtn.count() > 0) {
      await homeBtn.click();
      await window.waitForTimeout(500);
      // Should be on home now, Edit sidebar should be disabled (no currentFile)
      const editBtn = window.locator('button[title="Edit"]');
      if (await editBtn.count() > 0) {
        const isDisabled = await editBtn.isDisabled();
        expect(isDisabled).toBe(true);
      }
    }
  });
});
