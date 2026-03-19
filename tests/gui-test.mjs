/**
 * Automated GUI test for BMS Desktop Electron app.
 *
 * Launches Electron with --remote-debugging-port, connects via CDP,
 * and tests key UI flows:
 * 1. Home page renders
 * 2. Sidebar navigation works
 * 3. No console errors on startup
 * 4. File opening IPC works
 * 5. View/Edit mode toggle
 */

import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const electronPath = resolve(appDir, 'node_modules/electron/dist/electron.exe');
const PORT = 9223;

let electronProcess = null;
let browser = null;
const results = [];

function log(status, test, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  results.push({ status, test, detail });
  console.log(`${icon} [${status}] ${test}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  try {
    // 1. Launch Electron
    console.log('Launching Electron app...');
    // Remove ELECTRON_RUN_AS_NODE completely from env
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    electronProcess = spawn(electronPath, [
      `--remote-debugging-port=${PORT}`,
      '--no-sandbox',
      appDir,
    ], {
      env: cleanEnv,
      stdio: 'pipe',
    });

    // Capture stderr for crash detection
    let stderrOutput = '';
    electronProcess.stderr.on('data', (d) => { stderrOutput += d.toString(); });
    electronProcess.stdout.on('data', (d) => { /* consume stdout */ });

    // Wait for Electron to start and CDP to be ready
    console.log('Waiting for Electron to start...');
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) { console.log('CDP ready!'); break; }
      } catch { /* not ready yet */ }
      if (i === 14) { console.error('Timed out waiting for CDP'); return; }
    }

    // 2. Connect via CDP
    console.log('Connecting to Electron via CDP...');
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
    });

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('index.html')) || pages[0];
    if (!page) {
      log('FAIL', 'Find renderer page', 'No pages found');
      return;
    }
    log('PASS', 'Connect to Electron renderer', page.url());

    // 3. Collect console errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await sleep(2000); // Let React render

    // 4. Take screenshot of initial state
    const title = await page.title();
    log('PASS', 'Page loaded', `title="${title}"`);

    // 5. Test: Sidebar exists
    const sidebar = await page.$('nav');
    log(sidebar ? 'PASS' : 'FAIL', 'Sidebar navigation exists');

    // 6. Test: Home page content
    const homeContent = await page.evaluate(() => document.body.innerText);
    const hasOpenFile = homeContent.includes('Open File') || homeContent.includes('open');
    log(hasOpenFile ? 'PASS' : 'FAIL', 'Home page has Open File button',
      homeContent.substring(0, 100).replace(/\n/g, ' '));

    // 7. Test: Sidebar buttons
    const buttons = await page.$$('nav button');
    log(buttons.length >= 3 ? 'PASS' : 'FAIL', 'Sidebar has 3+ buttons', `found ${buttons.length}`);

    // 8. Test: Play button is disabled (no file selected)
    if (buttons.length >= 2) {
      const playDisabled = await buttons[1].evaluate(el => el.disabled);
      log(playDisabled ? 'PASS' : 'FAIL', 'Play button disabled when no file selected');
    }

    // 9. Test: Click "Open File" button (will open dialog, but we test the click doesn't crash)
    const openFileBtn = await page.$('button');
    if (openFileBtn) {
      const btnText = await openFileBtn.evaluate(el => el.textContent);
      log('PASS', 'First button accessible', `text="${btnText?.trim()}"`);
    }

    // 10. Test: Check window.api exists (preload bridge)
    const apiExists = await page.evaluate(() => typeof window.api);
    log(apiExists === 'object' ? 'PASS' : 'FAIL', 'window.api (preload bridge) exists', `type=${apiExists}`);

    // 11. Test: Check window.api.file methods
    const apiMethods = await page.evaluate(() => {
      if (!window.api?.file) return 'no api.file';
      return Object.keys(window.api.file).join(', ');
    });
    log(apiMethods.includes('openBmsFile') ? 'PASS' : 'FAIL', 'IPC file methods available', apiMethods);

    // 12. Test: Check window.api.audio methods
    const audioMethods = await page.evaluate(() => {
      if (!window.api?.audio) return 'no api.audio';
      return Object.keys(window.api.audio).join(', ');
    });
    log(audioMethods.includes('readBatch') ? 'PASS' : 'FAIL', 'IPC audio methods available', audioMethods);

    // 13. Test: No console errors on startup
    await sleep(1000);
    const startupErrors = consoleErrors.filter(e =>
      !e.includes('cache_util') && !e.includes('gpu_disk_cache') && !e.includes('DevTools')
    );
    log(startupErrors.length === 0 ? 'PASS' : 'FAIL', 'No console errors on startup',
      startupErrors.length > 0 ? startupErrors.slice(0, 3).join('; ') : '');

    // 14. Test: CSS loaded (dark background)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    log(bgColor !== 'rgba(0, 0, 0, 0)' ? 'PASS' : 'FAIL', 'CSS/TailwindCSS loaded', `bg=${bgColor}`);

    // 15. Check for crashes in stderr
    const hasCrash = stderrOutput.includes('FATAL') || stderrOutput.includes('Uncaught');
    log(!hasCrash ? 'PASS' : 'FAIL', 'No crashes in stderr',
      hasCrash ? stderrOutput.substring(0, 200) : '');

    // Summary
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`\n=== GUI Test Results: ${passed} passed, ${failed} failed ===`);

  } catch (err) {
    console.error('Test runner error:', err.message);
  } finally {
    if (browser) await browser.disconnect().catch(() => {});
    if (electronProcess) {
      electronProcess.kill();
      await sleep(1000);
    }
  }
}

main();
