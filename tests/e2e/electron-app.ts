/**
 * Shared Playwright fixture for launching the Electron app.
 */
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

/**
 * Remove `*.autosave` sidecars left by an earlier test. A leftover autosave
 * opens the recovery dialog on every editor load, which swallows shortcuts
 * and intercepts clicks for every test that follows.
 */
function clearAutoSaves(): void {
  for (const name of readdirSync(FIXTURES_DIR)) {
    if (name.endsWith('.autosave')) rmSync(join(FIXTURES_DIR, name), { force: true });
  }
}

/**
 * Snapshot the fixture folder. Tests that press Ctrl+S save the chart for
 * real (the writer normalises it), and every later test would then open a
 * different file than the one in git. The returned function puts it back:
 * changed files are rewritten, files the test created are removed.
 */
function snapshotFixtures(): () => void {
  const files = () => readdirSync(FIXTURES_DIR, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  const before = new Map(files().map((name) => [name, readFileSync(join(FIXTURES_DIR, name))]));
  return () => {
    for (const name of files()) {
      const path = join(FIXTURES_DIR, name);
      const original = before.get(name);
      if (!original) rmSync(path, { force: true });
      else if (!readFileSync(path).equals(original)) writeFileSync(path, original);
    }
  };
}

export const test = base.extend<{ electronApp: ElectronApplication; window: Page }>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    clearAutoSaves();
    const restoreFixtures = snapshotFixtures();
    const appPath = resolve(__dirname, '../../out/main/index.js');
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    const electronApp = await electron.launch({
      // E2E selectors target Korean UI text (pre-i18n labels). Force
      // app.getLocale() to 'ko' so the renderer boots Korean regardless of
      // the runner's OS locale (CI uses en-US Windows).
      args: [appPath, '--lang=ko'],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
      },
    });
    await use(electronApp);
    // A test that leaves unsaved edits makes the window-close guard open the
    // "quit" confirmation dialog, and nobody is there to answer it. close()
    // would hang until the teardown timeout. Confirm the close directly.
    for (const page of electronApp.windows()) {
      await page
        .evaluate(() => (window as unknown as { api: { app: { confirmClose: () => Promise<boolean> } } }).api.app.confirmClose())
        .catch(() => {});
    }
    await electronApp.close();
    restoreFixtures();
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    // Wait for app to fully load
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
