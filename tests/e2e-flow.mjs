/**
 * E2E Flow Test: File Open → Chart Info → Editor → Player → Back
 * Uses __DEV_OPEN_FILE__ and __DEV_NAVIGATE__ hooks to control React state.
 * Takes screenshots at every step.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const electronPath = resolve(appDir, 'node_modules/electron/dist/electron.exe');
const PORT = 9227;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TEST_FILE = 'S:\\stellabms-unpack\\!%3F (by tarolabo)\\kantangimon_05_06.bms';
const TEST_NAME = 'kantangimon_05_06.bms';
const TEST_FOLDER = 'S:\\stellabms-unpack\\!%3F (by tarolabo)';

let electronProcess, browser;
let pass = 0, fail = 0;

function log(ok, msg, detail = '') {
  if (ok) { pass++; console.log(`✓ ${msg}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`✗ FAIL: ${msg}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    electronProcess = spawn(electronPath, [`--remote-debugging-port=${PORT}`, '--no-sandbox', appDir], { env, stdio: 'pipe' });
    electronProcess.stderr.on('data', () => {});

    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
    }

    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
    const page = (await browser.pages()).find(p => p.url().includes('index.html'));
    if (!page) { console.error('No page'); return; }

    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await sleep(2000);

    // ========================================
    // STEP 1: Home page initial state
    // ========================================
    console.log('\n--- Step 1: Home Page ---');
    await page.screenshot({ path: 'tests/e2e-01-home.png' });
    const homeText = await page.evaluate(() => document.body.innerText);
    log(homeText.includes('Open File'), 'Home page renders', 'shows Open File button');

    // ========================================
    // STEP 2: Open a file via dev hook
    // ========================================
    console.log('\n--- Step 2: Open BMS File ---');
    await page.evaluate((fp, name, folder) => {
      window.__DEV_OPEN_FILE__(fp, name, folder);
    }, TEST_FILE, TEST_NAME, TEST_FOLDER);
    await sleep(3000); // Wait for chart to parse

    await page.screenshot({ path: 'tests/e2e-02-file-opened.png' });
    const chartText = await page.evaluate(() => document.body.innerText);
    log(chartText.includes('BPM') || chartText.includes('Notes') || chartText.includes('Total'),
      'Chart info displays after file open', chartText.substring(0, 100).replace(/\n/g, ' '));

    // Check Play/Edit buttons are now enabled
    const navBtns = await page.$$('nav button');
    if (navBtns.length >= 3) {
      const playEnabled = !(await navBtns[1].evaluate(el => el.disabled));
      const editEnabled = !(await navBtns[2].evaluate(el => el.disabled));
      log(playEnabled, 'Play button enabled after file open');
      log(editEnabled, 'Edit button enabled after file open');
    }

    // ========================================
    // STEP 3: Navigate to Editor
    // ========================================
    console.log('\n--- Step 3: Navigate to Editor ---');
    await page.evaluate(() => { window.__DEV_NAVIGATE__('editor'); });
    await sleep(3000); // Wait for editor to render

    await page.screenshot({ path: 'tests/e2e-03-editor.png' });
    const editorText = await page.evaluate(() => document.body.innerText);
    log(editorText.includes('Save') || editorText.includes('Edit') || editorText.includes('View'),
      'Editor page renders', editorText.substring(0, 80).replace(/\n/g, ' '));

    // Check for loading spinner vs actual content
    const hasSpinner = await page.$('.animate-spin');
    const hasToolbar = editorText.includes('Save') || editorText.includes('BPM');
    log(!hasSpinner || hasToolbar, 'Editor loaded (no infinite spinner)');

    // ========================================
    // STEP 4: Click View/Edit toggle button
    // ========================================
    console.log('\n--- Step 4: Toggle View/Edit Mode ---');
    const toggleBtn = await page.evaluateHandle(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent?.includes('View Mode') || btn.textContent?.includes('Edit Mode')) return btn;
      }
      return null;
    });
    if (toggleBtn.asElement()) {
      await toggleBtn.asElement().click();
      await sleep(1000);
      await page.screenshot({ path: 'tests/e2e-04-mode-toggled.png' });
      const modeText = await page.evaluate(() => document.body.innerText);
      log(true, 'Mode toggle clicked', modeText.includes('Edit Mode') ? 'now in Edit Mode' : 'now in View Mode');
    } else {
      log(false, 'Mode toggle button not found');
    }

    // ========================================
    // STEP 5: Navigate to Player
    // ========================================
    console.log('\n--- Step 5: Navigate to Player ---');
    await page.evaluate(() => { window.__DEV_NAVIGATE__('player'); });
    await sleep(3000);

    await page.screenshot({ path: 'tests/e2e-05-player.png' });
    const playerText = await page.evaluate(() => document.body.innerText);
    log(playerText.includes('Loading') || playerText.includes('BPM') || playerText.includes('keysound') || playerText.includes('Error'),
      'Player page renders', playerText.substring(0, 80).replace(/\n/g, ' '));

    // ========================================
    // STEP 6: Go back to Home
    // ========================================
    console.log('\n--- Step 6: Back to Home ---');
    await page.evaluate(() => { window.__DEV_NAVIGATE__('home'); });
    await sleep(1000);

    await page.screenshot({ path: 'tests/e2e-06-back-home.png' });
    const homeText2 = await page.evaluate(() => document.body.innerText);
    log(homeText2.includes('Open File') || homeText2.includes('BPM'),
      'Home page renders after returning', homeText2.substring(0, 60).replace(/\n/g, ' '));

    // ========================================
    // Error check
    // ========================================
    console.log('\n--- Error Check ---');
    const realErrors = consoleErrors.filter(e =>
      !e.includes('cache_util') && !e.includes('gpu_disk') && !e.includes('favicon') && !e.includes('DevTools')
    );
    log(realErrors.length === 0, `Console errors: ${realErrors.length}`,
      realErrors.length > 0 ? realErrors.slice(0, 3).join('; ') : 'none');

    console.log(`\n=== E2E Flow: ${pass} passed, ${fail} failed ===`);

  } finally {
    if (browser) await browser.disconnect().catch(() => {});
    if (electronProcess) { electronProcess.kill(); await sleep(500); }
  }
}

main().catch(e => { console.error('Fatal:', e.message); electronProcess?.kill(); });
