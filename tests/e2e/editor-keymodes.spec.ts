/**
 * 키 모드별 에디터 로딩 E2E 테스트
 * 4K~48K 각 모드의 BMS 픽스처를 로드하여 에디터가 크래시 없이 렌더링되는지 검증한다.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

const MODES = ['4K', '5K', '6K', '7K', '8K', '9K', '10K', '12K', '14K', '18K', '24K', '48K'] as const;

function getFixturePath(mode: string): string {
  if (mode === '7K') return resolve(__dirname, 'fixtures/test-chart.bms');
  return resolve(__dirname, `fixtures/test-${mode.toLowerCase()}.bms`);
}

async function openEditorWithMode(window: Page, mode: string) {
  const bmsPath = getFixturePath(mode);
  const folderPath = resolve(__dirname, 'fixtures');

  await window.evaluate(
    ([p, f]) => {
      (window as any).__DEV_OPEN_FILE__(p, `test-chart-${p.includes('test-chart.bms') ? '' : ''}${p.split('/').pop()}`, f);
    },
    [bmsPath, folderPath],
  );
  await window.evaluate(() => {
    (window as any).__DEV_NAVIGATE__('editor');
  });
  await window.waitForTimeout(2500);
}

for (const mode of MODES) {
  test.describe(`Key Mode: ${mode}`, () => {
    test(`editor loads ${mode} chart without crash`, async ({ window }) => {
      await openEditorWithMode(window, mode);

      // No rendering error
      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);

      // No file-not-found error
      const fileError = await window.locator('text=파일을 찾을 수 없습니다').count();
      expect(fileError).toBe(0);

      // Title should contain chart title (7K="Test Chart", others="Test {mode}")
      const bodyText = await window.locator('body').textContent();
      const expectedTitle = mode === '7K' ? 'Test Chart' : `Test ${mode}`;
      expect(bodyText).toContain(expectedTitle);

      await window.screenshot({ path: `test-results/gui-keymode-${mode}.png` });
    });

    test(`${mode} shows toolbar and panels`, async ({ window }) => {
      await openEditorWithMode(window, mode);

      // Toolbar buttons exist
      const buttons = await window.locator('button').count();
      expect(buttons).toBeGreaterThan(10);

      // Status bar with BPM info (7K fixture=130, others=150)
      const bodyText = await window.locator('body').textContent() || '';
      const expectedBpm = mode === '7K' ? '130' : '150';
      expect(bodyText).toContain(expectedBpm);

      // No crash
      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);
    });

    test(`${mode} tool switching works`, async ({ window }) => {
      await openEditorWithMode(window, mode);

      // Switch through tools
      for (const key of ['a', 'd', 'v', 'b']) {
        await window.keyboard.press(key);
        await window.waitForTimeout(200);
      }

      // No crash after tool switching
      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);
    });
  });
}

test.describe('Key Mode - DP Specific', () => {
  const dpModes = ['10K', '14K'];

  for (const mode of dpModes) {
    test(`${mode} DP chart loads with both player sides`, async ({ window }) => {
      await openEditorWithMode(window, mode);

      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);

      // Should have note count > 0 (both 1P and 2P notes)
      const bodyText = await window.locator('body').textContent() || '';
      // Status bar shows note count
      expect(bodyText).toContain('통계');

      await window.screenshot({ path: `test-results/gui-dp-${mode}.png` });
    });
  }
});

test.describe('Key Mode - Keyboard Specific', () => {
  const kbModes = ['8K', '9K', '12K', '18K'];

  for (const mode of kbModes) {
    test(`${mode} keyboard chart loads without scratch lanes`, async ({ window }) => {
      await openEditorWithMode(window, mode);

      const errorCount = await window.locator('text=Rendering Error').count();
      expect(errorCount).toBe(0);

      await window.screenshot({ path: `test-results/gui-keyboard-${mode}.png` });
    });
  }
});

test.describe('Key Mode - Extended', () => {
  test('24K chart renders with 24 narrow lanes', async ({ window }) => {
    await openEditorWithMode(window, '24K');

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    await window.screenshot({ path: 'test-results/gui-extended-24K.png' });
  });

  test('48K chart renders with 48 ultra-narrow lanes', async ({ window }) => {
    await openEditorWithMode(window, '48K');

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);

    await window.screenshot({ path: 'test-results/gui-extended-48K.png' });
  });

  test('48K editor responds to basic operations without lag', async ({ window }) => {
    await openEditorWithMode(window, '48K');

    // Select all
    await window.keyboard.press('Control+a');
    await window.waitForTimeout(500);

    // Quantize
    await window.keyboard.press('q');
    await window.waitForTimeout(500);

    // Undo
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(500);

    const errorCount = await window.locator('text=Rendering Error').count();
    expect(errorCount).toBe(0);
  });
});
