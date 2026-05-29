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
      // --bms-test-locale is a custom (non-Chromium) flag that stays in
      // process.argv unmodified. APP_TEST_LANG is kept as a secondary fallback.
      args: [appPath, '--bms-test-locale=ja'],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
        APP_TEST_LANG: 'ja',
      },
    });
    await use(electronApp);
    await electronApp.close();
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1000); // allow React to mount and useEffect to run

    // Session restoration from a prior test run may leave the app on an editor
    // error screen (editor + invalid file path). Navigate home unconditionally.
    await window.evaluate(() => {
      const w = window as unknown as { __DEV_NAVIGATE__?: (r: string) => void };
      w.__DEV_NAVIGATE__?.('home');
    });

    // Wait for LocaleService.init() + subscriber notification to propagate.
    // The compact LanguageSwitcher button shows the locale code (e.g. 'JA').
    await window.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .some((b) => (b.textContent ?? '').includes('JA')),
      undefined,
      { timeout: 10000 }
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
