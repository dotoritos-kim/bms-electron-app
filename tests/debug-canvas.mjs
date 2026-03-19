import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9238' });
  const page = (await browser.pages()).find(p => p.url().includes('index.html'));
  await page.setViewport({ width: 1366, height: 768 });
  await sleep(1500);

  // Open file
  await page.evaluate(() => window.__DEV_OPEN_FILE__(
    'S:\\stellabms-unpack\\!%3F (by tarolabo)\\kantangimon_05_06.bms',
    'kantangimon_05_06.bms',
    'S:\\stellabms-unpack\\!%3F (by tarolabo)'
  ));
  await sleep(3000);

  // Navigate to editor
  await page.evaluate(() => window.__DEV_NAVIGATE__('editor'));
  await sleep(3000);

  // Debug canvas dimensions
  const debug = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    const result = [];
    canvases.forEach((c, i) => {
      const rect = c.getBoundingClientRect();
      const style = getComputedStyle(c);
      result.push({
        index: i,
        width: c.width,
        height: c.height,
        rectWidth: rect.width,
        rectHeight: rect.height,
        styleWidth: style.width,
        styleHeight: style.height,
        display: style.display,
        visibility: style.visibility,
        parent: c.parentElement?.className?.substring(0, 80),
        parentRect: c.parentElement ? {
          w: c.parentElement.getBoundingClientRect().width,
          h: c.parentElement.getBoundingClientRect().height,
        } : null,
      });
    });

    // Also check all divs with specific classes
    const containerDivs = document.querySelectorAll('[class*="overflow"]');
    const divInfo = [];
    containerDivs.forEach((d, i) => {
      if (i > 10) return;
      const rect = d.getBoundingClientRect();
      if (rect.height > 0) {
        divInfo.push({
          class: d.className?.substring(0, 60),
          w: rect.width,
          h: rect.height,
        });
      }
    });

    return { canvases: result, containers: divInfo };
  });

  console.log('=== Canvas Elements ===');
  for (const c of debug.canvases) {
    console.log(`  canvas[${c.index}]: ${c.width}x${c.height} (rect: ${c.rectWidth}x${c.rectHeight}) display:${c.display} vis:${c.visibility}`);
    console.log(`    style: w=${c.styleWidth} h=${c.styleHeight}`);
    console.log(`    parent: ${c.parent} (${c.parentRect?.w}x${c.parentRect?.h})`);
  }
  console.log(`\n=== Overflow Containers ===`);
  for (const d of debug.containers) {
    console.log(`  ${d.class} → ${d.w}x${d.h}`);
  }

  await page.screenshot({ path: 'tests/debug-canvas.png' });
  console.log('\nScreenshot saved');

  await browser.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
