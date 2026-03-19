import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9239' });
  const page = (await browser.pages()).find(p => p.url().includes('index.html'));
  await page.setViewport({ width: 1366, height: 768 });
  await sleep(1500);

  await page.evaluate(() => window.__DEV_OPEN_FILE__(
    'S:\\stellabms-unpack\\!%3F (by tarolabo)\\kantangimon_05_06.bms',
    'kantangimon_05_06.bms',
    'S:\\stellabms-unpack\\!%3F (by tarolabo)'
  ));
  await sleep(3000);

  // Editor View Mode
  await page.evaluate(() => window.__DEV_NAVIGATE__('editor'));
  await sleep(3000);
  await page.screenshot({ path: 'tests/layout-01-editor-view.png' });
  console.log('1. Editor View screenshot');

  // Toggle Edit Mode
  const btns = await page.$$('button');
  for (const b of btns) {
    const t = await b.evaluate(el => el.textContent);
    if (t?.includes('View Mode')) { await b.click(); break; }
  }
  await sleep(1500);
  await page.screenshot({ path: 'tests/layout-02-editor-edit.png' });
  console.log('2. Editor Edit screenshot');

  await browser.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
