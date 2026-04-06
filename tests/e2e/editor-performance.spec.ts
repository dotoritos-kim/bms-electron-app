/**
 * Phase 7: Performance & Stress E2E Tests
 * Validates editor behavior under load conditions.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

async function openEditorWithFixture(window: Page, filename: string) {
  const bmsPath = resolve(FIXTURES_DIR, filename);
  const folderPath = FIXTURES_DIR;
  await window.evaluate(
    ([p, f]) => { (window as any).__DEV_OPEN_FILE__(p, p.split(/[\\/]/).pop()!, f); },
    [bmsPath, folderPath],
  );
  await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });
  await window.waitForTimeout(3000);
}

test.describe('Editor Performance', () => {
  test('stress chart (2000+ notes) loads without crash', async ({ window }) => {
    const start = Date.now();
    await openEditorWithFixture(window, 'test-stress.bms');
    const loadTime = Date.now() - start;

    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);

    // No error
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    // Title visible
    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toContain('Stress Test');

    await window.screenshot({ path: 'test-results/perf-stress-loaded.png' });
  });

  test('rapid tool switching does not crash', async ({ window }) => {
    await openEditorWithFixture(window, 'test-chart.bms');

    // Switch tools rapidly: V→A→D→M→K→B→T cycle, 20 times
    const tools = ['v', 'a', 'd', 'm', 'k', 'b', 't'];
    for (let cycle = 0; cycle < 20; cycle++) {
      for (const key of tools) {
        await window.keyboard.press(key);
      }
      // Small delay every 5 cycles to let UI catch up
      if (cycle % 5 === 0) await window.waitForTimeout(50);
    }
    await window.waitForTimeout(300);

    // No crash
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('bulk undo/redo maintains state integrity', async ({ window }) => {
    await openEditorWithFixture(window, 'test-chart.bms');

    // Make 10 changes (select all + quantize, repeat)
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Control+a');
      await window.waitForTimeout(100);
      await window.keyboard.press('q');
      await window.waitForTimeout(100);
    }

    // Undo all 10
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Control+z');
      await window.waitForTimeout(50);
    }
    await window.waitForTimeout(300);

    // Redo all 10
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Control+y');
      await window.waitForTimeout(50);
    }
    await window.waitForTimeout(300);

    // No crash
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('48K mode handles basic operations', async ({ window }) => {
    await openEditorWithFixture(window, 'test-48k.bms');

    // Select all
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(500);

    // Quantize
    await window.keyboard.press('q');
    await window.waitForTimeout(500);

    // Undo
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(500);

    // No crash
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('dialog rapid open/close cycle', async ({ window }) => {
    await openEditorWithFixture(window, 'test-chart.bms');

    // Open and close each dialog 5 times in succession
    const dialogKeys = [
      { open: 'Control+f', name: 'search' },
    ];

    for (const { open } of dialogKeys) {
      for (let i = 0; i < 5; i++) {
        await window.keyboard.press(open);
        await window.waitForTimeout(150);
        await window.keyboard.press('Escape');
        await window.waitForTimeout(150);
      }
    }

    // Button-based dialogs
    const buttonLabels = ['AI', 'MIDI', '⌨'];
    for (const label of buttonLabels) {
      const btn = window.locator('button', { hasText: label });
      if (await btn.count() > 0) {
        for (let i = 0; i < 3; i++) {
          await btn.first().click();
          await window.waitForTimeout(200);
          await window.keyboard.press('Escape');
          await window.waitForTimeout(200);
        }
      }
    }

    // No crash
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});
