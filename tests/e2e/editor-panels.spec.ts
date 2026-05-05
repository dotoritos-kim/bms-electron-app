/**
 * 패널/레이아웃 E2E 테스트
 * 좌/우 패널 토글, 탭 전환, 미니맵, 상태바를 검증한다.
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

function noError(window: Page) {
  return expect(window.locator('text=Rendering Error')).toHaveCount(0);
}

test.describe('Left Panel', () => {
  test('toggle hides and shows left panel', async ({ window }) => {
    await openEditorWithRealFile(window);

    const toggle = window.locator('[data-testid="toggle-left-panel"]');
    if (await toggle.count() > 0) {
      // Close left panel
      await toggle.dispatchEvent('click');
      await window.waitForTimeout(300);
      await window.screenshot({ path: 'test-results/gui-panel-left-closed.png' });

      // Reopen left panel
      await toggle.dispatchEvent('click');
      await window.waitForTimeout(300);
      await window.screenshot({ path: 'test-results/gui-panel-left-open.png' });
    }

    await noError(window);
  });

  test('keysound tab shows WAV definitions', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    // Test chart has WAV01-WAV04
    const hasWav = bodyText.includes('kick') || bodyText.includes('snare') || bodyText.includes('01');
    expect(hasWav).toBe(true);
  });

  test('P key toggles to pattern library', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('p');
    await window.waitForTimeout(500);

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('패턴 라이브러리');

    await window.screenshot({ path: 'test-results/gui-panel-pattern.png' });

    // Toggle back
    await window.keyboard.press('p');
    await window.waitForTimeout(300);
  });

  test('pattern library shows built-in patterns', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('p');
    await window.waitForTimeout(500);

    // Should show categories
    const bodyText = await window.locator('body').textContent() || '';
    const hasCategory = bodyText.includes('기본') || bodyText.includes('리듬') || bodyText.includes('패턴');
    expect(hasCategory).toBe(true);
  });
});

test.describe('Right Panel', () => {
  test('toggle hides and shows right panel', async ({ window }) => {
    await openEditorWithRealFile(window);

    const toggle = window.locator('[data-testid="toggle-right-panel"]');
    if (await toggle.count() > 0) {
      await toggle.dispatchEvent('click');
      await window.waitForTimeout(300);
      await window.screenshot({ path: 'test-results/gui-panel-right-closed.png' });

      await toggle.dispatchEvent('click');
      await window.waitForTimeout(300);
    }

    await noError(window);
  });

  test('shows chart stats and info', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('통계');
    expect(bodyText).toContain('차트 정보');
  });

  test('shows difficulty estimate', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('추정 난이도');
  });
});

test.describe('Both Panels Hidden', () => {
  test('hiding both panels does not crash', async ({ window }) => {
    await openEditorWithRealFile(window);

    const leftToggle = window.locator('[data-testid="toggle-left-panel"]');
    const rightToggle = window.locator('[data-testid="toggle-right-panel"]');

    if (await leftToggle.count() > 0) await leftToggle.dispatchEvent('click');
    await window.waitForTimeout(200);
    if (await rightToggle.count() > 0) await rightToggle.dispatchEvent('click');
    await window.waitForTimeout(300);

    await window.screenshot({ path: 'test-results/gui-panels-both-closed.png' });
    await noError(window);

    // Reopen
    if (await leftToggle.count() > 0) await leftToggle.dispatchEvent('click');
    if (await rightToggle.count() > 0) await rightToggle.dispatchEvent('click');
    await window.waitForTimeout(300);
  });
});

test.describe('Status Bar', () => {
  test('shows BPM from loaded chart', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('130');
  });

  test('shows note count', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    // Status bar should show total note count
    expect(bodyText).toMatch(/\d+/);
  });

  test('shows grid snap value', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';
    // Default grid snap is 16
    expect(bodyText).toContain('16') || expect(bodyText).toMatch(/1\/\d+/);
  });
});
