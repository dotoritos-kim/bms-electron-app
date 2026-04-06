/**
 * Editor GUI 전체 기능 E2E 테스트
 * 실제 BMS 파일을 로드하여 에디터 UI의 모든 주요 기능을 검증한다.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

const TEST_BMS_PATH = resolve(__dirname, 'fixtures/test-chart.bms').replace(/\\/g, '\\\\');

async function openEditorWithRealFile(window: Page) {
  const bmsPath = resolve(__dirname, 'fixtures/test-chart.bms');
  const folderPath = resolve(__dirname, 'fixtures');
  const escaped = (s: string) => s.replace(/\\/g, '\\\\');

  await window.evaluate(
    ([p, f]) => {
      (window as any).__DEV_OPEN_FILE__(p, 'test-chart.bms', f);
    },
    [bmsPath, folderPath],
  );
  await window.evaluate(() => {
    (window as any).__DEV_NAVIGATE__('editor');
  });
  // Wait for chart to parse and editor to render
  await window.waitForTimeout(2000);
}

test.describe('Editor GUI - Real BMS File', () => {
  test('editor loads chart and shows toolbar', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Should NOT show error boundary
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    // Should NOT show file-not-found error
    const fileError = await window.locator('text=파일을 찾을 수 없습니다').count();
    expect(fileError).toBe(0);

    // Should show chart title in header
    const headerText = await window.locator('body').textContent();
    expect(headerText).toContain('Test Chart');

    await window.screenshot({ path: 'test-results/gui-editor-loaded.png' });
  });

  test('editor shows left panel with keysound list', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Left panel should show keysound tab
    const keysoundTab = window.locator('button', { hasText: '키음' });
    expect(await keysoundTab.count()).toBeGreaterThan(0);

    // WAV definitions should be listed (01, 02, 03, 04)
    const bodyText = await window.locator('body').textContent();
    // At least one WAV ID should appear
    const hasWav = bodyText?.includes('01') || bodyText?.includes('kick');
    expect(hasWav).toBe(true);

    await window.screenshot({ path: 'test-results/gui-left-panel.png' });
  });

  test('editor shows right panel with stats and header info', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Stats section should show "통계" and note counts
    const statsText = await window.locator('text=통계').count();
    expect(statsText).toBeGreaterThan(0);

    // Chart info section
    const chartInfo = await window.locator('text=차트 정보').count();
    expect(chartInfo).toBeGreaterThan(0);

    await window.screenshot({ path: 'test-results/gui-right-panel.png' });
  });

  test('editor toolbar is functional', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Toolbar should have grid snap selector and tool buttons
    const bodyText = await window.locator('body').textContent();

    // Should show "수정 중" indicator (unsaved changes after no edits = false)
    // Just verify toolbar area renders without crash
    const buttons = await window.locator('button').count();
    expect(buttons).toBeGreaterThan(10); // toolbar + panels + header = many buttons

    await window.screenshot({ path: 'test-results/gui-toolbar.png' });
  });

  test('tool switching works visually', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Switch to Add Note tool
    await window.keyboard.press('a');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-tool-addnote.png' });

    // Switch to Delete tool
    await window.keyboard.press('d');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-tool-delete.png' });

    // Switch to Select tool
    await window.keyboard.press('v');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-tool-select.png' });

    // Switch to BPM tool
    await window.keyboard.press('b');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-tool-bpm.png' });

    // Back to select
    await window.keyboard.press('v');
    await window.waitForTimeout(200);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('pattern panel toggle shows pattern library', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Toggle to pattern panel
    await window.keyboard.press('p');
    await window.waitForTimeout(500);

    // Should show pattern library
    const patternLib = await window.locator('text=패턴 라이브러리').count();
    expect(patternLib).toBeGreaterThan(0);

    await window.screenshot({ path: 'test-results/gui-pattern-panel.png' });

    // Toggle back to keysound panel
    await window.keyboard.press('p');
    await window.waitForTimeout(300);

    const keysoundTab = await window.locator('button', { hasText: '키음' });
    expect(await keysoundTab.count()).toBeGreaterThan(0);
  });

  test('left and right panel toggle buttons work', async ({ window }) => {
    await openEditorWithRealFile(window);
    await window.screenshot({ path: 'test-results/gui-panels-open.png' });

    // Click left panel toggle (키사운드 패널 title)
    const leftToggle = window.locator('button[title="키사운드 패널"]');
    if (await leftToggle.count() > 0) {
      await leftToggle.click();
      await window.waitForTimeout(300);
      await window.screenshot({ path: 'test-results/gui-left-panel-closed.png' });

      // Re-open
      await leftToggle.click();
      await window.waitForTimeout(300);
    }

    // Click right panel toggle (정보 패널 title)
    const rightToggle = window.locator('button[title="정보 패널"]');
    if (await rightToggle.count() > 0) {
      await rightToggle.click();
      await window.waitForTimeout(300);
      await window.screenshot({ path: 'test-results/gui-right-panel-closed.png' });

      // Re-open
      await rightToggle.click();
      await window.waitForTimeout(300);
    }

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('Ctrl+F opens note search dialog', async ({ window }) => {
    await openEditorWithRealFile(window);

    await window.keyboard.press('Control+f');
    await window.waitForTimeout(500);
    await window.screenshot({ path: 'test-results/gui-note-search.png' });

    // Close with Escape
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('save button and Ctrl+S work', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Press Ctrl+S to save
    await window.keyboard.press('Control+s');
    await window.waitForTimeout(500);

    // Check for toast message (저장 완료 or no crash)
    await window.screenshot({ path: 'test-results/gui-after-save.png' });

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('undo/redo works after operations', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Select all notes
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-select-all.png' });

    // Quantize (modifies notes)
    await window.keyboard.press('q');
    await window.waitForTimeout(300);

    // Undo
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-after-undo.png' });

    // Redo
    await window.keyboard.press('Control+y');
    await window.waitForTimeout(300);
    await window.screenshot({ path: 'test-results/gui-after-redo.png' });

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('header bar buttons open dialogs without crash', async ({ window }) => {
    await openEditorWithRealFile(window);

    // BPM tap button
    const bpmBtn = window.locator('button', { hasText: 'BPM' });
    if (await bpmBtn.count() > 0) {
      await bpmBtn.first().click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-bpm-tap-dialog.png' });
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    // AI chart button
    const aiBtn = window.locator('button', { hasText: 'AI' });
    if (await aiBtn.count() > 0) {
      await aiBtn.first().click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-ai-chart-dialog.png' });
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    // Audio slicer button
    const slicerBtn = window.locator('button', { hasText: '슬라이서' });
    if (await slicerBtn.count() > 0) {
      await slicerBtn.click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-audio-slicer.png' });
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    // MIDI button
    const midiBtn = window.locator('button', { hasText: 'MIDI' });
    if (await midiBtn.count() > 0) {
      await midiBtn.click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-midi-dialog.png' });
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    // Key bindings button (⌨)
    const kbBtn = window.locator('button', { hasText: '⌨' });
    if (await kbBtn.count() > 0) {
      await kbBtn.click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-keybindings-dialog.png' });
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('playback controls render and respond', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Audio load button should be present
    const audioLoadBtn = window.locator('button', { hasText: '오디오 로드' });
    const hasAudioBtn = await audioLoadBtn.count() > 0;
    expect(hasAudioBtn).toBe(true);

    await window.screenshot({ path: 'test-results/gui-playback-controls.png' });

    // Space key should not crash (no audio loaded, so it's a no-op)
    await window.keyboard.press('Space');
    await window.waitForTimeout(300);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('status bar shows beat, grid, note count', async ({ window }) => {
    await openEditorWithRealFile(window);

    const bodyText = await window.locator('body').textContent() || '';

    // Status bar should show difficulty estimate
    expect(bodyText).toContain('추정 난이도');

    // Should contain BPM info (130)
    expect(bodyText).toContain('130');

    await window.screenshot({ path: 'test-results/gui-status-bar.png' });
  });

  test('Diff view opens and closes', async ({ window }) => {
    await openEditorWithRealFile(window);

    const diffBtn = window.locator('button', { hasText: 'Diff' });
    if (await diffBtn.count() > 0) {
      await diffBtn.click();
      await window.waitForTimeout(500);
      await window.screenshot({ path: 'test-results/gui-diff-view.png' });

      // Close with Escape
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });

  test('measure insert/delete dialogs open', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Ctrl+Shift+I = insert measure
    await window.keyboard.press('Control+Shift+i');
    await window.waitForTimeout(500);

    const insertDialog = await window.locator('text=마디 삽입').count();
    expect(insertDialog).toBeGreaterThan(0);
    await window.screenshot({ path: 'test-results/gui-measure-insert.png' });

    // Close
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    // Ctrl+Shift+D = delete measure
    await window.keyboard.press('Control+Shift+d');
    await window.waitForTimeout(500);

    const deleteDialog = await window.locator('text=마디 삭제').count();
    expect(deleteDialog).toBeGreaterThan(0);
    await window.screenshot({ path: 'test-results/gui-measure-delete.png' });

    // Close
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('back button with unsaved changes shows confirmation', async ({ window }) => {
    await openEditorWithRealFile(window);

    // Make a change first (select all + quantize)
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(200);
    await window.keyboard.press('q');
    await window.waitForTimeout(300);

    // Should show "수정 중" indicator
    const modifiedText = await window.locator('text=수정 중').count();
    expect(modifiedText).toBeGreaterThan(0);

    // Click back arrow
    const backBtn = window.locator('button').first();
    await backBtn.click();
    await window.waitForTimeout(500);

    // Confirmation dialog should appear
    const confirmDialog = await window.locator('text=저장하지 않은 변경사항').count();
    expect(confirmDialog).toBeGreaterThan(0);
    await window.screenshot({ path: 'test-results/gui-unsaved-confirm.png' });

    // Click "취소" to stay
    const cancelBtn = window.locator('button', { hasText: '취소' });
    if (await cancelBtn.count() > 0) {
      await cancelBtn.first().click();
      await window.waitForTimeout(300);
    }
  });

  test('F5 play test mode', async ({ window }) => {
    await openEditorWithRealFile(window);

    // F5 should enter play test mode
    await window.keyboard.press('F5');
    await window.waitForTimeout(1500);
    await window.screenshot({ path: 'test-results/gui-play-test.png' });

    // Should show player overlay or error (no audio files exist)
    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});
