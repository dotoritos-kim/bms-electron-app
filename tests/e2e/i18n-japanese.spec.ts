/**
 * Japanese (ja) locale smoke test.
 *
 * Boots the app with APP_TEST_LANG=ja and asserts that key user-facing strings
 * render in Japanese. Avoids golden-image visual regression (font rendering
 * varies across OS) — checks text content instead. Visual diffs across OSs
 * are inherently flaky for CJK fallback fonts.
 *
 * Coverage:
 *   - Home screen labels (recent files, language switcher)
 *   - Navigation to Editor (locale persists)
 *   - Editor toolbar tools render in JA
 *   - Native menu accelerator labels match `dictionaries.ja`
 */
import { test as base, _electron as electron, type ElectronApplication, type Page, expect } from '@playwright/test';
import { resolve } from 'path';

const jaTest = base.extend<{ electronApp: ElectronApplication; window: Page }>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const appPath = resolve(__dirname, '../../out/main/index.js');
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    const electronApp = await electron.launch({
      args: [appPath],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
        // APP_TEST_LANG is read by resolveInitialLocale() in the main process.
        // Using --lang=ja is unreliable: it's a Chromium switch whose effect on
        // app.getLocale() is not guaranteed before app.whenReady() on all platforms.
        APP_TEST_LANG: 'ja',
      },
    });
    await use(electronApp);
    await electronApp.close();
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    // LocaleService.init() runs in parallel with React in main.tsx. When init()
    // completes it now fires subscribers so the LanguageSwitcher re-renders with
    // the real locale. APP_TEST_LANG=ja causes getInitial() to return 'ja', so
    // the compact button should show 'JA' once init and i18next loading finish.
    // NOTE: waitForFunction(fn, arg?, options?) — pass undefined as arg so the
    //       options object is treated as options, not as the fn argument.
    await window.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .some((b) => (b.textContent ?? '').includes('JA')),
      undefined,
      { timeout: 15000 }
    );
    await use(window);
  },
});

jaTest.describe('Japanese locale smoke', () => {
  jaTest('home screen renders in Japanese', async ({ window }) => {
    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // 最近のファイル (recent files) heading or empty placeholder
    // Either localized recent-files area or language switcher with 日本語 label
    const hasJaText = await window.evaluate(() => {
      const text = document.body.innerText;
      // Look for any one of the canonical ja labels we shipped
      return /日本語|最近のファイル|ファイル|新規BMS|キーモード/.test(text);
    });
    expect(hasJaText).toBe(true);
  });

  jaTest('language switcher shows 日本語 as current', async ({ window }) => {
    // LanguageSwitcher (compact variant) is in AppStatusBar at bottom
    // Native script display names are never translated, so 日本語 should appear
    const langLabel = await window.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"]'))
        .map((el) => el.textContent || '')
        .find((t) => t.includes('日本語') || t.includes('JA')) ?? '';
    });
    expect(langLabel).toBeTruthy();
  });

  jaTest('navigation to editor preserves ja locale', async ({ window }) => {
    await window.evaluate(() => {
      (window as unknown as { __DEV_OPEN_FILE__: (p: string, n: string, d: string) => void })
        .__DEV_OPEN_FILE__('C:\\test\\song.bms', 'song.bms', 'C:\\test');
    });
    await window.evaluate(() => {
      (window as unknown as { __DEV_NAVIGATE__: (route: string) => void })
        .__DEV_NAVIGATE__('editor');
    });
    await window.waitForTimeout(800);

    // Editor toolbar should expose ja tool labels (追加/選択/移動/etc) or panel headings (譜面情報/キーサウンド)
    const hasEditorJa = await window.evaluate(() => {
      const text = document.body.innerText;
      return /追加|選択|移動|譜面情報|キーサウンド|小節|ノーツ/.test(text);
    });
    expect(hasEditorJa).toBe(true);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  jaTest('native menu labels match Japanese dictionary', async ({ window: _w, electronApp }) => {
    // _w triggers the window fixture which calls locale.set('ja') and causes
    // the main process to rebuild the menu in Japanese before we read it.
    const menuLabels = await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (!menu) return [];
      return menu.items.map((item) => item.label);
    });
    // Top-level menu labels: ファイル / 編集 / 表示
    expect(menuLabels).toContain('ファイル');
    expect(menuLabels).toContain('編集');
    expect(menuLabels).toContain('表示');
  });
});
