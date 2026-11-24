/**
 * Grid snap as a user feels it: clicks anywhere between grid lines must land
 * on a line, the hover preview must show which line (snap lock line), Shift
 * must place freely, and a Shift released while the window was unfocused must
 * not leave snapping silently off.
 *
 * Fixture test-snap-grid.bms: 7K, empty, measure #001 is 3/4 (#00102:0.75),
 * default grid 16 divisions per measure.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURES = resolve(__dirname, 'fixtures');
const CHART = resolve(FIXTURES, 'test-snap-grid.bms');
const DIVISIONS = 16;

async function openSnapChart(window: Page) {
  await window.evaluate(([p, d]) => { (window as any).__DEV_OPEN_FILE__(p, 'test-snap-grid.bms', d); }, [CHART, FIXTURES]);
  await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });
  // The file load lands late and would wipe early edits
  await window.waitForTimeout(7000);
  await window.keyboard.press('a'); // add-note tool
  await window.waitForTimeout(200);
}

async function canvasBox(window: Page) {
  const box = await window.locator('canvas').first().boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/** CSS x of the centre of key lane k (1..7); lanes are centred in the canvas. */
function keyLaneX(box: { x: number; width: number }, k: number) {
  const LANES_WIDTH = 611, SCRATCH = 70.4, KEY = 57.6;
  return box.x + box.width / 2 - LANES_WIDTH / 2 + SCRATCH + KEY * (k - 0.5);
}

/** Deterministic pseudo-random in [0,1) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Points spread over measures #000-#002, one or two per lane, never within 3 grid steps of each other in a lane. */
function scatterPoints(box: { x: number; y: number; width: number; height: number }, seed: number) {
  const r = rng(seed);
  const pts: { x: number; y: number }[] = [];
  const bottom = box.y + box.height - 8;
  const top = box.y + box.height * 0.3;
  for (let k = 1; k <= 7; k++) {
    // two bands per lane: lower half and upper half of the range
    for (const band of [0, 1]) {
      const span = (bottom - top) / 2;
      const y = bottom - band * span - (0.1 + 0.8 * r()) * span;
      pts.push({ x: keyLaneX(box, k) + (r() - 0.5) * 20, y });
    }
  }
  return pts;
}

interface SavedNote { measure: number; channel: string; index: number; length: number }

/** Playable notes in the saved file (1P/2P visible and LN channels). */
function savedNotes(): SavedNote[] {
  const notes: SavedNote[] = [];
  for (const line of readFileSync(CHART, 'utf8').split(/\r?\n/)) {
    const m = /^#(\d{3})([1256][1-9]):([0-9A-Za-z]+)\s*$/.exec(line);
    if (!m) continue;
    const pairs = m[3].match(/../g) ?? [];
    pairs.forEach((p, index) => {
      if (p !== '00') notes.push({ measure: +m[1], channel: m[2], index, length: pairs.length });
    });
  }
  return notes;
}

const onGrid = (n: SavedNote) => (n.index * DIVISIONS) % n.length === 0;

async function save(window: Page) {
  await window.keyboard.press('Control+s');
  await window.waitForTimeout(1500);
}

/**
 * Row (CSS y) of the snap lock line in key lane k: the near-white horizontal
 * line, found in a screenshot. null when it is not drawn.
 */
async function lockLineY(window: Page, k: number): Promise<number | null> {
  const box = await canvasBox(window);
  const png = (await window.locator('canvas').first().screenshot()).toString('base64');
  const x0 = keyLaneX(box, k) - box.x - 20, x1 = keyLaneX(box, k) - box.x + 20;
  const row = await window.evaluate(async ({ data, x0, x1, cssW }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const scale = img.width / cssW;
    const { data: px } = ctx.getImageData(0, 0, c.width, c.height);
    const xa = Math.floor(x0 * scale), xb = Math.floor(x1 * scale);
    // rows where (almost) the whole sampled width is near-white
    const rows: number[] = [];
    for (let y = 0; y < c.height; y++) {
      let n = 0;
      for (let x = xa; x < xb; x++) {
        const i = (y * c.width + x) * 4;
        if (px[i] > 180 && px[i + 1] > 180 && px[i + 2] > 180) n++;
      }
      if (n >= (xb - xa) * 0.8) rows.push(y);
    }
    if (!rows.length) return null;
    // centre of the line
    return (rows[0] + rows[rows.length - 1]) / 2 / scale;
  }, { data: png, x0, x1, cssW: box.width });
  return row === null ? null : box.y + row;
}

test.describe('Editor grid snap', () => {
  test('clicks between grid lines all land on the grid (incl. a 3/4 measure)', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    const pts = scatterPoints(box, 1234);
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.waitForTimeout(300);
    for (const p of pts) {
      await window.mouse.click(p.x, p.y);
      await window.waitForTimeout(60);
    }
    await save(window);
    const notes = savedNotes();
    expect(notes.length).toBe(pts.length);
    expect(notes.filter((n) => !onGrid(n)), 'notes off the 1/16 grid').toEqual([]);
    expect(notes.some((n) => n.measure === 1), 'some notes in the 3/4 measure').toBe(true);
  });

  test('Shift+click places freely (off the grid)', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    const pts = scatterPoints(box, 99);
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.waitForTimeout(300);
    // click({ modifiers }) does not reach the page with Shift in Electron;
    // hold the real key like a user does
    await window.keyboard.down('Shift');
    for (const p of pts) {
      await window.mouse.move(p.x, p.y);
      await window.mouse.click(p.x, p.y);
      await window.waitForTimeout(60);
    }
    await window.keyboard.up('Shift');
    await save(window);
    const notes = savedNotes();
    expect(notes.length).toBe(pts.length);
    expect(notes.filter((n) => !onGrid(n)).length).toBeGreaterThanOrEqual(pts.length / 2);
  });

  test('a Shift released while the window was unfocused does not leave snapping off', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    // Shift goes down, the window loses focus, the keyup is never seen
    await window.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
      window.dispatchEvent(new Event('blur'));
    });
    const pts = scatterPoints(box, 7).slice(0, 6);
    for (const p of pts) {
      await window.mouse.move(p.x, p.y);
      await window.mouse.click(p.x, p.y);
      await window.waitForTimeout(60);
    }
    await save(window);
    const notes = savedNotes();
    expect(notes.length).toBe(pts.length);
    expect(notes.filter((n) => !onGrid(n))).toEqual([]);
  });

  test('a Shift held across a lost keyup is still overridden by the real pointer state', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    // keydown seen, no blur, no keyup (e.g. keyup swallowed elsewhere)
    await window.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    });
    const pts = scatterPoints(box, 8).slice(0, 6);
    for (const p of pts) {
      await window.mouse.move(p.x, p.y);
      await window.mouse.click(p.x, p.y);
      await window.waitForTimeout(60);
    }
    await save(window);
    expect(savedNotes().filter((n) => !onGrid(n))).toEqual([]);
  });

  test('hover shows a lock line that sticks to one grid line, follows Shift without moving, and hides with snap off', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    const x = keyLaneX(box, 3);
    const y0 = box.y + box.height * 0.75;
    await window.mouse.move(x, y0);
    await window.waitForTimeout(300);
    const line = await lockLineY(window, 3);
    expect(line, 'lock line drawn while hovering').not.toBeNull();
    await window.screenshot({ path: 'test-results/snap-lock-line.png' });

    // The grid step in CSS px: 16 divisions of a 4/4 measure. Measured from
    // the line jump when moving one full step.
    await window.mouse.move(x, line! - 14);
    await window.waitForTimeout(200);
    const next = await lockLineY(window, 3);
    expect(next).not.toBeNull();
    const step = Math.abs(line! - next!);
    expect(step).toBeGreaterThan(4);

    // within ±0.35 step of the line → the same line
    for (const off of [-0.35, -0.2, 0.2, 0.35]) {
      await window.mouse.move(x, line! + off * step);
      await window.waitForTimeout(150);
      const l = await lockLineY(window, 3);
      expect(l, `offset ${off}`).not.toBeNull();
      expect(Math.abs(l! - line!), `offset ${off}`).toBeLessThan(1.5);
    }

    // Shift without moving → free placement, no lock line; release → back
    await window.mouse.move(x, line! + 0.3 * step);
    await window.waitForTimeout(150);
    await window.keyboard.down('Shift');
    await window.waitForTimeout(200);
    expect(await lockLineY(window, 3), 'no lock line while Shift is held').toBeNull();
    await window.keyboard.up('Shift');
    await window.waitForTimeout(200);
    expect(await lockLineY(window, 3), 'lock line back after Shift').not.toBeNull();

    // Snap off → no lock line
    await window.getByText('스냅 켬', { exact: true }).click();
    await window.mouse.move(x, line! + 0.3 * step);
    await window.mouse.move(x, line! + 0.31 * step);
    await window.waitForTimeout(200);
    expect(await lockLineY(window, 3), 'no lock line with snap off').toBeNull();
  });

  test('the placed note sits on the lock line it showed', async ({ window }) => {
    await openSnapChart(window);
    const box = await canvasBox(window);
    const x = keyLaneX(box, 2);
    const y = box.y + box.height * 0.6 + 3;
    await window.mouse.move(x, y);
    await window.waitForTimeout(300);
    const line = await lockLineY(window, 2);
    expect(line).not.toBeNull();
    await window.mouse.click(x, y);
    await save(window);
    const notes = savedNotes();
    expect(notes).toHaveLength(1);
    expect(onGrid(notes[0])).toBe(true);
    // Hover the same spot again: the preview sits on the note, the lock line on the same row
    await window.mouse.move(x + 1, y);
    await window.waitForTimeout(200);
    const again = await lockLineY(window, 2);
    expect(again).not.toBeNull();
    expect(Math.abs(again! - line!)).toBeLessThan(1.5);
  });
});
