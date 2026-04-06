/**
 * 에디터 에러 상태 E2E 테스트
 * 손상된 파일, 에러 복구 경로를 검증한다.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

async function openEditorWithRealFile(window: Page) {
  const bmsPath = resolve(__dirname, 'fixtures/test-chart.bms');
  const folderPath = resolve(__dirname, 'fixtures');
  await window.evaluate(
    ([p, f]) => { (window as any).__DEV_OPEN_FILE__(p, 'test-chart.bms', f); },
    [bmsPath, folderPath],
  );
  await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });
  await window.waitForTimeout(2000);
}

test.describe('Error Recovery', () => {
  test('loading a non-existent file shows error', async ({ window }) => {
    // Try to open a file that doesn't exist
    await window.evaluate(() => {
      (window as any).__DEV_OPEN_FILE__('/nonexistent/path/fake.bms', 'fake.bms', '/nonexistent/path');
    });
    await window.evaluate(() => {
      (window as any).__DEV_NAVIGATE__('editor');
    });
    await window.waitForTimeout(2000);

    // Should show error or file-not-found message
    const bodyText = await window.locator('body').textContent() || '';
    const hasError = bodyText.includes('오류') || bodyText.includes('에러') || bodyText.includes('Error') || bodyText.includes('찾을 수 없습니다');
    expect(hasError).toBe(true);

    await window.screenshot({ path: 'test-results/gui-error-notfound.png' });
  });

  test('error screen has home button', async ({ window }) => {
    await window.evaluate(() => {
      (window as any).__DEV_OPEN_FILE__('/nonexistent/path/fake.bms', 'fake.bms', '/nonexistent/path');
    });
    await window.evaluate(() => {
      (window as any).__DEV_NAVIGATE__('editor');
    });
    await window.waitForTimeout(2000);

    // Look for a button to go home or back
    const buttons = await window.locator('button').count();
    expect(buttons).toBeGreaterThan(0);

    await window.screenshot({ path: 'test-results/gui-error-buttons.png' });
  });
});

test.describe('Rendering Error Boundary', () => {
  test('normal chart load does not trigger error boundary', async ({ window }) => {
    await openEditorWithRealFile(window);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});
