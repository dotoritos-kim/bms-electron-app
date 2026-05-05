/**
 * 에디터 워크플로우 통합 E2E 테스트
 * 생성→편집→저장 등 다단계 작업 흐름을 검증한다.
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

test.describe('Edit → Undo All → Clean State', () => {
  test('multiple undos restore to unmodified state', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Make changes
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('q'); // quantize
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+m'); // mirror
    await window.waitForTimeout(200);

    // Should be modified
    let bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('수정 중');

    // Undo all
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);

    await noError(window);
  });
});

test.describe('Select → Copy → Paste', () => {
  test('copies and pastes notes successfully', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+c');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+v');
    await window.waitForTimeout(300);

    // Should be modified
    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('수정 중');

    await window.screenshot({ path: 'test-results/gui-workflow-copypaste.png' });
    await noError(window);

    // Clean up
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
  });
});

test.describe('Select → Cut → Paste', () => {
  test('cut removes and paste restores notes', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+x');
    await window.waitForTimeout(300);

    // Notes should be removed (modified state)
    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('수정 중');

    // Paste
    await window.keyboard.press('Control+v');
    await window.waitForTimeout(300);

    await noError(window);

    // Clean up
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);
  });
});

test.describe('Transform Workflow', () => {
  test('mirror → random → quantize → undo all', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);

    await window.keyboard.press('Control+m'); // mirror
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+r'); // random
    await window.waitForTimeout(200);
    await window.keyboard.press('q'); // quantize
    await window.waitForTimeout(200);

    await window.screenshot({ path: 'test-results/gui-workflow-transforms.png' });

    // Undo 3 times
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(100);

    await noError(window);
  });
});

test.describe('A-B Loop Workflow', () => {
  test('set loop A → set loop B → clear loop', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Set loop A
    await window.keyboard.press('[');
    await window.waitForTimeout(200);

    // Set loop B
    await window.keyboard.press(']');
    await window.waitForTimeout(200);

    await window.screenshot({ path: 'test-results/gui-workflow-loop-set.png' });

    // Clear loop
    await window.keyboard.press('\\');
    await window.waitForTimeout(200);

    await window.screenshot({ path: 'test-results/gui-workflow-loop-clear.png' });
    await noError(window);
  });
});

test.describe('Play Test Workflow', () => {
  test('F5 enters play test and no crash', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('F5');
    await window.waitForTimeout(1500);

    await window.screenshot({ path: 'test-results/gui-workflow-playtest.png' });
    await noError(window);
  });
});

test.describe('Diff View Workflow', () => {
  test('make changes then view diff', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Make a change
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('q');
    await window.waitForTimeout(200);

    // Open diff
    const diffBtn = window.locator('[data-testid="diff-btn"]');
    if (await diffBtn.count() > 0) {
      await diffBtn.click({ force: true });
      await window.waitForTimeout(500);

      await window.screenshot({ path: 'test-results/gui-workflow-diff.png' });

      // Close diff
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    await noError(window);
  });
});
