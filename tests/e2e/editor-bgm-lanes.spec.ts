/**
 * BGM lanes as written in the file (#xxx01 line order), horizontal scrolling
 * for many BGM lanes, multi-keysound selection and the editor options dialog
 * (drag direction lock included).
 *
 * Fixture: test-bgm-columns.bms — 16 BGM lines in measure 1 (one instrument
 * per line, each on its own tick), so a packed layout needs a single lane and
 * the source layout needs 16. One key note (key.wav) on lane 1 at beat 0.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

async function openFixture(window: Page, name: string) {
  const bmsPath = resolve(__dirname, 'fixtures', name);
  const folderPath = resolve(__dirname, 'fixtures');
  await window.evaluate(
    ([p, n, f]) => { (window as any).__DEV_OPEN_FILE__(p, n, f); },
    [bmsPath, name, folderPath],
  );
  await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });
  await window.waitForTimeout(4000);
}

const openBgmColumns = (window: Page) => openFixture(window, 'test-bgm-columns.bms');

const RESTORE_DEFAULTS = /Restore defaults|기본값으로|デフォルトに戻す/;

async function openEditorOptions(window: Page) {
  await window.locator('button[aria-haspopup="menu"]').last().click();
  await window.getByTestId('editor-options-btn').click();
  await expect(window.getByTestId('editor-option-bgm-lanes')).toBeVisible();
}

// Editor options live in localStorage, which outlives a test run: start every
// test from the defaults (another chart is opened first, so the test's own
// chart is loaded fresh with them).
test.beforeEach(async ({ window }) => {
  // Let the restored session finish loading before switching charts
  await window.waitForTimeout(3000);
  await openFixture(window, 'test-chart.bms');
  await openEditorOptions(window);
  await window.getByText(RESTORE_DEFAULTS).click();
  await window.keyboard.press('Escape');
});

/** BGM manager channel labels ("CH 0", "CH 1", …) */
async function bgmChannels(window: Page): Promise<string[]> {
  return window.locator('text=/^CH \\d+$/').allTextContents();
}

test.describe('BGM lanes as in file', () => {
  test('packed by default; "as in file" spreads the instruments and adds a horizontal scrollbar', async ({ window }) => {
    await openBgmColumns(window);
    expect(await bgmChannels(window)).toEqual(['CH 0']);
    await expect(window.getByTestId('editor-hscroll')).toHaveCount(0);

    await window.getByTestId('bgm-arrange-source').click();
    await window.waitForTimeout(500);
    const channels = await bgmChannels(window);
    expect(channels).toHaveLength(16);
    expect(channels[15]).toBe('CH 15');

    // 16 BGM lanes > 12 on screen → sideways scrolling
    const hscroll = window.getByTestId('editor-hscroll');
    await expect(hscroll).toBeVisible();
    const canvas = window.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.keyboard.down('Shift');
    await window.mouse.wheel(0, 300);
    await window.keyboard.up('Shift');
    await window.waitForTimeout(300);
    expect(await hscroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await window.screenshot({ path: 'test-results/bgm-lanes-source.png' });

    // Undo goes back to the packed layout
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(300);
    expect(await bgmChannels(window)).toEqual(['CH 0']);
  });

  test('editor options: lanes on screen and the layout used when opening', async ({ window }) => {
    // test-chart.bms is open (beforeEach): the layout option applies when a chart is opened
    await openEditorOptions(window);
    await window.getByTestId('editor-option-bgm-layout-source').check();
    await window.getByTestId('editor-option-bgm-lanes').fill('32');
    await window.keyboard.press('Escape');

    await openBgmColumns(window);
    expect(await bgmChannels(window)).toHaveLength(16);
    // 16 lanes fit when 32 are allowed on screen
    await expect(window.getByTestId('editor-hscroll')).toHaveCount(0);
    await window.screenshot({ path: 'test-results/bgm-lanes-fit.png' });

    await openEditorOptions(window);
    await window.getByTestId('editor-option-bgm-lanes').fill('4');
    await expect(window.getByTestId('editor-hscroll')).toBeVisible();
    await window.getByText(RESTORE_DEFAULTS).click();
    await expect(window.getByTestId('editor-option-bgm-layout-packed')).toBeChecked();
    await window.keyboard.press('Escape');
  });
});

test.describe('Keysound multi-select', () => {
  test('Ctrl+click several keysounds and select their BGM notes', async ({ window }) => {
    await openBgmColumns(window);
    const row = (label: string) => window.locator('button', { hasText: label }).first();
    await row('inst00.wav').click({ modifiers: ['Control'] });
    await row('inst01.wav').click({ modifiers: ['Control'] });
    await row('inst02.wav').click({ modifiers: ['Control'] });
    await expect(window.getByTestId('keysound-checked-bar')).toContainText('3');

    await window.getByTestId('keysound-checked-select-bgm').click();
    // inst01 is used twice (measures 1 and 2)
    await expect(window.locator('text=/노트 4개 선택됨|Selected 4 notes|ノーツ4個を選択/')).toBeVisible();
  });
});

test.describe('Drag direction lock', () => {
  /** Select the key note (key.wav) through the keysound panel. */
  async function selectKeyNote(window: Page) {
    await window.locator('button', { hasText: 'key.wav' }).first().click({ modifiers: ['Control'] });
    await window.getByTestId('keysound-checked-select-all').click();
    await window.waitForTimeout(500);
  }

  /** Screen centre of the selected (cyan) note, found in a screenshot of the canvas. */
  async function selectedNoteCenter(window: Page): Promise<{ x: number; y: number }> {
    const canvas = window.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    const png = (await canvas.screenshot()).toString('base64');
    const hit = await window.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data: px } = ctx.getImageData(0, 0, c.width, c.height);
      // The key note sits at beat 0 (bottom of the view); selected notes are
      // pale cyan. Skip the measure labels on the left.
      let sx = 0, sy = 0, n = 0;
      for (let y = Math.floor(c.height * 0.7); y < c.height; y++) {
        for (let x = Math.floor(c.width * 0.1); x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
          if (g > 180 && b > 180 && g - r > 25 && b - r > 25) { sx += x; sy += y; n++; }
        }
      }
      return n ? { x: sx / n, y: sy / n, w: img.width, n } : null;
    }, png);
    expect(hit, 'selected note visible on the canvas').not.toBeNull();
    const scale = hit!.w / box.width;
    return { x: box.x + hit!.x / scale, y: box.y + hit!.y / scale };
  }

  /** Lane and beat of the selected note (note info panel). */
  async function noteInfo(window: Page) {
    const text = await window.getByTestId('right-panel').innerText();
    const column = /(?:컬럼|Column)\s*\n?\s*(\S+)/.exec(text)?.[1];
    const beat = /(?:비트|Beat)\s*\n?\s*(\d+\.\d{4})/.exec(text)?.[1];
    return { column, beat };
  }

  async function drag(window: Page, from: { x: number; y: number }, dx: number, dy: number) {
    // Toasts (e.g. after Ctrl+Z) sit over the bottom of the canvas; a release
    // on one counts as outside the canvas and cancels the drag.
    await expect(window.locator('[role="status"] > *')).toHaveCount(0, { timeout: 8000 });
    await window.mouse.move(from.x, from.y);
    await window.mouse.down();
    await window.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
    await window.mouse.up();
    await window.waitForTimeout(400);
  }

  async function setDragAxis(window: Page, value: string) {
    await openEditorOptions(window);
    await window.getByTestId(`editor-option-drag-axis-${value}`).check();
    await window.keyboard.press('Escape');
  }

  test('horizontal keeps the timing, vertical keeps the lane, auto follows the first direction', async ({ window }) => {
    await openBgmColumns(window);
    await selectKeyNote(window);
    const start = await noteInfo(window);
    expect(start.beat).toBe('0.0000');
    const at = await selectedNoteCenter(window);

    // Sideways only: diagonal drag changes the lane, not the beat
    await setDragAxis(window, 'horizontal');
    await drag(window, at, 90, -90);
    const horizontal = await noteInfo(window);
    expect(horizontal.beat).toBe('0.0000');
    expect(horizontal.column).not.toBe(start.column);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(300);

    // Up/down only: same diagonal drag changes the beat, not the lane
    await setDragAxis(window, 'vertical');
    await drag(window, at, 90, -90);
    const vertical = await noteInfo(window);
    expect(vertical.column).toBe(start.column);
    expect(Number(vertical.beat)).toBeGreaterThan(0);
    await window.keyboard.press('Control+z');
    await window.waitForTimeout(300);

    // Auto: a mostly-sideways drag locks to sideways
    await setDragAxis(window, 'auto');
    await drag(window, at, 90, -30);
    const auto = await noteInfo(window);
    expect(auto.beat).toBe('0.0000');
    expect(auto.column).not.toBe(start.column);
  });
});
