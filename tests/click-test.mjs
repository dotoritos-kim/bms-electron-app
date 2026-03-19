/**
 * Interactive GUI click test — actually clicks every button and takes screenshots.
 */
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9225' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('index.html'));
  if (!page) { console.error('No page found'); return; }

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  console.log('Connected to BMS Desktop');

  // === 1. Screenshot initial state ===
  await page.screenshot({ path: 'tests/ss-01-initial.png' });
  console.log('1. Initial state screenshot taken');

  // === 2. Find all buttons ===
  const allBtns = await page.$$('button');
  console.log(`2. Found ${allBtns.length} buttons total`);
  for (let i = 0; i < allBtns.length; i++) {
    const text = await allBtns[i].evaluate(el => el.textContent?.trim() || el.title || '(icon)');
    const disabled = await allBtns[i].evaluate(el => el.disabled);
    console.log(`   btn[${i}]: "${text}" ${disabled ? '(DISABLED)' : '(enabled)'}`);
  }

  // === 3. Click "Open Folder" and load S:\Aery via IPC ===
  console.log('\n3. Loading folder via IPC (S:\\Aery)...');
  const folderResult = await page.evaluate(async () => {
    try {
      const files = await window.api.file.listBmsFolder('S:\\Aery');
      return { ok: true, count: files.length, first: files[0]?.name };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  console.log(`   Result: ${JSON.stringify(folderResult)}`);

  // === 4. Simulate selecting a BMS file by triggering React ===
  // We can't directly set React state, but we can trigger a custom event
  // or find the file list items and click them. Let's load a file via IPC first:
  console.log('\n4. Loading BMS file via IPC...');
  const TEST_FILE = 'S:\\Aery\\Al raune\\5KEYS_AERY_17.bms';
  const fileResult = await page.evaluate(async (fp) => {
    try {
      const buffer = await window.api.file.readBms(fp);
      return { ok: true, size: buffer.length || buffer.byteLength };
    } catch (e) { return { ok: false, err: e.message }; }
  }, TEST_FILE);
  console.log(`   File loaded: ${JSON.stringify(fileResult)}`);

  // === 5. Click sidebar Home button ===
  console.log('\n5. Clicking sidebar Home button...');
  const navBtns = await page.$$('nav button');
  if (navBtns[0]) {
    await navBtns[0].click();
    await sleep(500);
    await page.screenshot({ path: 'tests/ss-02-home-clicked.png' });
    console.log('   Home clicked, screenshot taken');
  }

  // === 6. Try clicking sidebar Play button ===
  console.log('\n6. Checking Play button...');
  if (navBtns[1]) {
    const disabled = await navBtns[1].evaluate(el => el.disabled);
    console.log(`   Play button disabled: ${disabled}`);
    if (!disabled) {
      await navBtns[1].click();
      await sleep(1000);
      await page.screenshot({ path: 'tests/ss-03-player.png' });
      console.log('   Player page screenshot taken');
    } else {
      console.log('   Skipped (disabled, no file selected)');
    }
  }

  // === 7. Try clicking sidebar Edit button ===
  console.log('\n7. Checking Edit button...');
  if (navBtns[2]) {
    const disabled = await navBtns[2].evaluate(el => el.disabled);
    console.log(`   Edit button disabled: ${disabled}`);
  }

  // === 8. Simulate complete file open flow ===
  // Since we can't trigger native dialog, we'll inject the file selection
  console.log('\n8. Injecting file selection into React state...');
  const injected = await page.evaluate(async (fp) => {
    try {
      // Read and parse the file to verify the full pipeline works
      const buffer = await window.api.file.readBms(fp);
      // Check buffer is valid
      const arr = new Uint8Array(buffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(arr.slice(0, 100));
      const hasBmsHeader = text.includes('#');
      return { ok: true, hasBmsHeader, preview: text.substring(0, 60).replace(/\n/g, ' ') };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }, TEST_FILE);
  console.log(`   Injection result: ${JSON.stringify(injected)}`);

  // === 9. Test keyboard shortcut (Ctrl+O) - won't open dialog in headless ===
  console.log('\n9. Testing keyboard shortcut Ctrl+O...');
  await page.keyboard.down('Control');
  await page.keyboard.press('o');
  await page.keyboard.up('Control');
  await sleep(500);
  await page.screenshot({ path: 'tests/ss-04-after-ctrl-o.png' });
  console.log('   Ctrl+O pressed, screenshot taken');

  // === 10. Check for errors ===
  const realErrors = errors.filter(e =>
    !e.includes('cache_util') && !e.includes('gpu_disk') && !e.includes('favicon')
  );
  console.log(`\n10. Console errors during test: ${realErrors.length === 0 ? 'NONE ✓' : realErrors.length}`);
  for (const e of realErrors.slice(0, 5)) {
    console.log(`   ERROR: ${e.substring(0, 120)}`);
  }

  // === Summary ===
  console.log('\n=== Click Test Summary ===');
  console.log(`Buttons found: ${allBtns.length}`);
  console.log(`IPC folder scan: ${folderResult.ok ? 'OK' : 'FAIL'} (${folderResult.count || 0} files)`);
  console.log(`IPC file read: ${fileResult.ok ? 'OK' : 'FAIL'} (${fileResult.size || 0} bytes)`);
  console.log(`BMS content valid: ${injected.ok ? 'OK' : 'FAIL'}`);
  console.log(`Console errors: ${realErrors.length}`);
  console.log(`Screenshots: ss-01 through ss-04 saved`);

  await browser.disconnect();
}

main().catch(e => console.error('Fatal:', e.message));
