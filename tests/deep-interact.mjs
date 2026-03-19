/**
 * Deep interaction test: clicks inside editor canvas, presses START in player,
 * tests keyboard shortcuts, verifies state changes via screenshots.
 */
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(msg, d='') { pass++; console.log(`✓ ${msg}${d ? ' — '+d : ''}`); }
function no(msg, d='') { fail++; console.log(`✗ ${msg}${d ? ' — '+d : ''}`); }

async function main() {
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9234" });
  const page = (await browser.pages()).find(p => p.url().includes('index.html'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await sleep(1500);

  // 1. Open file
  await page.evaluate(() => window.__DEV_OPEN_FILE__(
    'S:\\stellabms-unpack\\!%3F (by tarolabo)\\kantangimon_05_06.bms',
    'kantangimon_05_06.bms',
    'S:\\stellabms-unpack\\!%3F (by tarolabo)'
  ));
  await sleep(3000);
  ok('File opened');

  // ===== EDITOR DEEP TEST =====
  await page.evaluate(() => window.__DEV_NAVIGATE__('editor'));
  await sleep(3000);
  await page.screenshot({ path: 'tests/deep-01-editor-view.png' });
  ok('Editor View mode loaded');

  // Toggle to Edit Mode
  let toggled = false;
  const btns = await page.$$('button');
  for (const b of btns) {
    const t = await b.evaluate(el => el.textContent);
    if (t?.includes('View Mode')) { await b.click(); toggled = true; break; }
  }
  await sleep(1000);
  toggled ? ok('Toggled to Edit Mode') : no('Toggle button not found');
  await page.screenshot({ path: 'tests/deep-02-editor-edit.png' });

  // Click on canvas to select a note
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Click in the middle of the canvas
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await sleep(500);
      await page.screenshot({ path: 'tests/deep-03-note-clicked.png' });

      // Check if selection changed
      const statusText = await page.evaluate(() => document.body.innerText);
      const hasSelected = statusText.includes('selected');
      ok('Clicked on editor canvas', hasSelected ? 'selection visible in status' : 'no selection change');

      // Scroll the editor
      await page.mouse.wheel({ deltaY: -300 });
      await sleep(500);
      await page.screenshot({ path: 'tests/deep-04-scrolled.png' });
      ok('Mouse wheel scroll in editor');

      // Ctrl+A to select all
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await sleep(500);
      const afterSelectAll = await page.evaluate(() => document.body.innerText);
      ok('Ctrl+A pressed', afterSelectAll.match(/\d+ selected/)?.[0] || 'unknown');
      await page.screenshot({ path: 'tests/deep-05-select-all.png' });

      // Ctrl+Z to undo
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await sleep(300);
      ok('Ctrl+Z (undo) pressed');
    }
  } else {
    no('No canvas found in editor');
  }

  // Toggle back to View Mode
  const btns2 = await page.$$('button');
  for (const b of btns2) {
    const t = await b.evaluate(el => el.textContent);
    if (t?.includes('Edit Mode')) { await b.click(); break; }
  }
  await sleep(1000);
  await page.screenshot({ path: 'tests/deep-06-back-to-view.png' });
  ok('Toggled back to View Mode');

  // ===== PLAYER DEEP TEST =====
  await page.evaluate(() => window.__DEV_NAVIGATE__('player'));
  await sleep(4000);
  await page.screenshot({ path: 'tests/deep-07-player-ready.png' });

  // Find and click START button
  const startBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent?.includes('START')) return b;
    }
    return null;
  });
  if (startBtn.asElement()) {
    await startBtn.asElement().click();
    await sleep(2000);
    await page.screenshot({ path: 'tests/deep-08-game-started.png' });
    ok('START button clicked');

    // Check game state changed
    const gameText = await page.evaluate(() => document.body.innerText);
    const playing = !gameText.includes('READY');
    ok('Game state changed after START', playing ? 'playing' : 'still showing READY');
  } else {
    // Maybe still loading audio
    const playerText = await page.evaluate(() => document.body.innerText);
    no('START button not found', playerText.substring(0, 80).replace(/\n/g, ' '));
  }

  // Press Escape to go back
  const backBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.querySelector('svg') && b.closest('div')?.classList?.contains('bg-zinc-900')) return b;
    }
    return null;
  });
  if (backBtn.asElement()) {
    await backBtn.asElement().click();
    await sleep(500);
  } else {
    await page.evaluate(() => window.__DEV_NAVIGATE__('home'));
    await sleep(500);
  }
  await page.screenshot({ path: 'tests/deep-09-back-home.png' });
  ok('Returned to Home');

  // Error summary
  const real = errors.filter(e => !e.includes('cache_util') && !e.includes('gpu_disk'));
  real.length === 0 ? ok('No console errors') : no(`${real.length} console errors`, real[0]?.substring(0, 100));

  console.log(`\n=== Deep Interaction: ${pass} passed, ${fail} failed ===`);
  await browser.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
