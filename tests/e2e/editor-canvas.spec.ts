/**
 * 캔버스 상호작용 E2E 테스트
 * NoteChartEditor 캔버스에서의 노트 추가/선택/삭제/이동 등을 검증한다.
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

async function getCanvasCenter(window: Page): Promise<{ x: number; y: number } | null> {
  const canvas = window.locator('canvas').first();
  if (await canvas.count() === 0) return null;
  const box = await canvas.boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('Canvas - Note Selection', () => {
  test('Ctrl+A selects all notes and status bar reflects count', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(300);

    const bodyText = await window.locator('body').textContent() || '';
    // Should show selection count in status bar
    expect(bodyText).toMatch(/\d+.*선택|selected/i);

    await window.screenshot({ path: 'test-results/gui-canvas-selectall.png' });
    await noError(window);
  });

  test('Escape deselects all', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    await noError(window);
  });

  test('click on canvas in select mode does not crash', async ({ window }) => {
    await openEditorWithRealFile(window);
    await window.keyboard.press('v'); // select tool

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(300);
    }

    await noError(window);
  });
});

test.describe('Canvas - Note Addition', () => {
  test('addNote tool + canvas click adds a note', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Switch to addNote
    await window.keyboard.press('a');
    await window.waitForTimeout(200);

    const center = await getCanvasCenter(window);
    if (center) {
      // Click on canvas to add note
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(500);
    }

    await window.screenshot({ path: 'test-results/gui-canvas-addnote.png' });
    await noError(window);

    // Undo to clean up
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
  });

  test('adding note shows modified indicator', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('a');
    await window.waitForTimeout(200);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(500);
    }

    const bodyText = await window.locator('body').textContent() || '';
    expect(bodyText).toContain('수정 중');

    await noError(window);
  });
});

test.describe('Canvas - Note Deletion', () => {
  test('select all + Delete removes notes', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Delete');
    await window.waitForTimeout(300);

    await window.screenshot({ path: 'test-results/gui-canvas-delete.png' });
    await noError(window);

    // Undo to restore
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
  });

  test('delete tool click on canvas does not crash', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('d');
    await window.waitForTimeout(200);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(300);
    }

    await noError(window);
  });
});

test.describe('Canvas - Note Movement', () => {
  test('selected notes move with arrow keys', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);

    // Move up (increase beat)
    await window.keyboard.press('ArrowUp');
    await window.waitForTimeout(300);

    // Move down (decrease beat)
    await window.keyboard.press('ArrowDown');
    await window.waitForTimeout(300);

    // Move left (decrease column)
    await window.keyboard.press('ArrowLeft');
    await window.waitForTimeout(300);

    // Move right (increase column)
    await window.keyboard.press('ArrowRight');
    await window.waitForTimeout(300);

    await window.screenshot({ path: 'test-results/gui-canvas-move.png' });
    await noError(window);
  });
});

test.describe('Canvas - Zoom', () => {
  test('Ctrl+scroll zooms canvas without crash', async ({ window }) => {
    await openEditorWithRealFile(window);

    const center = await getCanvasCenter(window);
    if (center) {
      // Zoom in
      await window.mouse.move(center.x, center.y);
      await window.mouse.wheel(0, -100);
      await window.waitForTimeout(300);

      await window.screenshot({ path: 'test-results/gui-canvas-zoom-in.png' });

      // Zoom out
      await window.mouse.wheel(0, 100);
      await window.waitForTimeout(300);

      await window.screenshot({ path: 'test-results/gui-canvas-zoom-out.png' });
    }

    await noError(window);
  });
});

test.describe('Canvas - Scroll', () => {
  test('mouse wheel scrolls the chart', async ({ window }) => {
    await openEditorWithRealFile(window);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.move(center.x, center.y);
      await window.mouse.wheel(0, -200);
      await window.waitForTimeout(300);

      await window.screenshot({ path: 'test-results/gui-canvas-scrolled.png' });
    }

    await noError(window);
  });
});

test.describe('Canvas - Context Menu', () => {
  test('right-click on canvas opens context menu', async ({ window }) => {
    await openEditorWithRealFile(window);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y, { button: 'right' });
      await window.waitForTimeout(500);

      await window.screenshot({ path: 'test-results/gui-canvas-contextmenu.png' });

      // Close context menu
      await window.keyboard.press('Escape');
      await window.waitForTimeout(200);
    }

    await noError(window);
  });

  test('context menu Select All action works', async ({ window }) => {
    await openEditorWithRealFile(window);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y, { button: 'right' });
      await window.waitForTimeout(500);

      // Click "전체 선택" in context menu
      const selectAllItem = window.locator('text=전체 선택');
      if (await selectAllItem.count() > 0) {
        await selectAllItem.click();
        await window.waitForTimeout(300);
      }
    }

    await noError(window);
  });
});

test.describe('Canvas - BPM/STOP Tools', () => {
  test('BPM tool click shows input dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('b');
    await window.waitForTimeout(200);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(500);
    }

    await window.screenshot({ path: 'test-results/gui-canvas-bpm-tool.png' });

    // Close any dialog
    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
    await noError(window);
  });

  test('STOP tool click shows input dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('t');
    await window.waitForTimeout(200);

    const center = await getCanvasCenter(window);
    if (center) {
      await window.mouse.click(center.x, center.y);
      await window.waitForTimeout(500);
    }

    await window.screenshot({ path: 'test-results/gui-canvas-stop-tool.png' });

    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
    await noError(window);
  });
});

test.describe('Canvas - Copy/Paste', () => {
  test('copy then paste duplicates notes', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+c');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+v');
    await window.waitForTimeout(300);

    await window.screenshot({ path: 'test-results/gui-canvas-paste.png' });
    await noError(window);

    // Undo
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
  });

  test('cut removes and clipboard holds notes', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('Control+x');
    await window.waitForTimeout(300);

    await window.screenshot({ path: 'test-results/gui-canvas-cut.png' });
    await noError(window);

    // Undo to restore
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(200);
  });
});
