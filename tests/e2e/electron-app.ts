/**
 * Shared Playwright fixture for launching the Electron app.
 */
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { resolve } from 'path';

export const test = base.extend<{ electronApp: ElectronApplication; window: Page }>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const appPath = resolve(__dirname, '../../out/main/index.js');
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    const electronApp = await electron.launch({
      args: [appPath],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
      },
    });
    await use(electronApp);
    await electronApp.close();
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    // Wait for app to fully load
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
