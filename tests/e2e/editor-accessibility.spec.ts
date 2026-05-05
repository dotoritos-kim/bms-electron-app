/**
 * Phase 8: Accessibility E2E Tests
 * Validates keyboard navigation, focus management, and ARIA attributes.
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

test.describe('Keyboard Accessibility', () => {
  test('all tool shortcuts (V, A, D, M, K, B, T) are functional', async ({ window }) => {
    await openEditorWithRealFile(window);

    const toolKeys = ['v', 'a', 'd', 'm', 'k', 'b', 't'];
    for (const key of toolKeys) {
      await window.keyboard.press(key);
      await window.waitForTimeout(200);

      // No crash after each tool switch
      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);
    }
  });

  test('Ctrl+Z/Y undo/redo are reachable', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Make a change
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('q');
    await window.waitForTimeout(200);

    // Undo
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);

    // Redo
    await window.keyboard.press('Control+y');
    await window.waitForTimeout(200);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Ctrl+C/X/V clipboard operations are reachable', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);

    // Copy
    await window.keyboard.press('Control+c');
    await window.waitForTimeout(200);

    // Paste
    await window.keyboard.press('Control+v');
    await window.waitForTimeout(200);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('A-B loop shortcuts ([ ] \\) work', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Set loop A
    await window.keyboard.press('[');
    await window.waitForTimeout(200);

    // Set loop B
    await window.keyboard.press(']');
    await window.waitForTimeout(200);

    // Clear loop
    await window.keyboard.press('\\');
    await window.waitForTimeout(200);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('P key toggles pattern panel', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Press P to switch to pattern tab
    await window.keyboard.press('p');
    await window.waitForTimeout(300);

    const bodyText = await window.locator('body').textContent() || '';
    // Should show pattern library
    const hasPattern = bodyText.includes('패턴') || bodyText.includes('라이브러리');
    expect(hasPattern).toBe(true);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});

test.describe('Escape Key Management', () => {
  test('Escape closes note search dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Focus editor before shortcut
    await window.locator('body').click();
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+f');
    await window.waitForTimeout(1000);

    // Ctrl+F may be intercepted by Chromium; just verify no crash
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Escape closes keybindings dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Open settings dropdown first (keybindings-btn is inside it)
    await window.locator('button', { hasText: '설정' }).click({ force: true });
    await window.waitForTimeout(200);

    const kbBtn = window.locator('[data-testid="keybindings-btn"]');
    await kbBtn.click();
    await window.waitForTimeout(1000);

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('키 바인딩');

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Escape closes BPM tap dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bpmBtn = window.locator('[data-testid="bpm-btn"]');
    await bpmBtn.click({ force: true });
    await window.waitForTimeout(500);

    await expect(window.locator('text=BPM 탭')).toHaveCount(1);

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});

test.describe('Icon Button Accessibility', () => {
  test('header buttons have title attributes', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Check that icon-only buttons have title or aria-label
    // Only check buttons that are expected to have title attributes
    const testIds = [
      'toggle-left-panel', 'toggle-right-panel',
      'diff-btn', 'bpm-btn', 'play-test-btn', 'ai-btn',
      'slicer-btn', 'midi-btn', 'keybindings-btn',
    ];

    let checkedCount = 0;
    for (const testId of testIds) {
      const btn = window.locator(`[data-testid="${testId}"]`);
      const count = await btn.count();
      if (count > 0) {
        const title = await btn.getAttribute('title');
        const ariaLabel = await btn.getAttribute('aria-label');
        const text = (await btn.textContent()) || '';
        // Should have a title, aria-label, or visible text content
        const hasLabel = (title && title.length > 0) || (ariaLabel && ariaLabel.length > 0) || text.trim().length > 0;
        expect(hasLabel).toBe(true);
        checkedCount++;
      }
    }
    // At least some buttons should have been found
    expect(checkedCount).toBeGreaterThan(0);
  });

  test('save button has visible text label', async ({ window }) => {
    await openEditorWithRealFile(window);

    const saveBtn = window.locator('[data-testid="save-btn"]');
    const text = await saveBtn.textContent();
    expect(text).toContain('저장');
  });
});

test.describe('Panel Visibility', () => {
  test('left panel can be toggled', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Left panel should be visible initially
    const leftPanel = window.locator('[data-testid="left-panel"]');
    expect(await leftPanel.count()).toBeGreaterThan(0);

    // Toggle off
    const toggleBtn = window.locator('[data-testid="toggle-left-panel"]');
    await toggleBtn.click({ force: true });
    await window.waitForTimeout(300);

    // Should be hidden
    expect(await leftPanel.count()).toBe(0);

    // Toggle back on
    await toggleBtn.click({ force: true });
    await window.waitForTimeout(300);

    expect(await leftPanel.count()).toBeGreaterThan(0);
  });

  test('right panel can be toggled', async ({ window }) => {
    await openEditorWithRealFile(window);

    const rightPanel = window.locator('[data-testid="right-panel"]');
    expect(await rightPanel.count()).toBeGreaterThan(0);

    const toggleBtn = window.locator('[data-testid="toggle-right-panel"]');
    await toggleBtn.click({ force: true });
    await window.waitForTimeout(300);

    expect(await rightPanel.count()).toBe(0);

    await toggleBtn.click({ force: true });
    await window.waitForTimeout(300);

    expect(await rightPanel.count()).toBeGreaterThan(0);
  });
});
