/**
 * Autosave recovery opens the autosaved chart in the editor as unsaved
 * changes. The chart file on disk is written only when the user saves.
 */
import { test, expect } from './electron-app';
import { copyFileSync, existsSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURES = resolve(__dirname, 'fixtures');

test('recovering an autosave leaves the file alone until Ctrl+S', async ({ window }) => {
  const name = 'zz-autosave-recovery.bms';
  const path = resolve(FIXTURES, name);
  copyFileSync(resolve(FIXTURES, 'test-bgm-columns.bms'), path);
  const original = readFileSync(path);
  // Autosave of an edit that was never saved (newer than the file)
  const edited = original.toString('utf-8').replace('#TITLE BGM Columns', '#TITLE Recovered Edit');
  writeFileSync(`${path}.autosave`, `*bms-editor-keymode 7K iidx sp\r\n${edited}`, 'utf-8');
  const later = new Date(Date.now() + 60_000);
  utimesSync(`${path}.autosave`, later, later);

  await window.waitForTimeout(3000);
  await window.evaluate(([p, n, f]) => { (window as any).__DEV_OPEN_FILE__(p, n, f); }, [path, name, FIXTURES]);
  await window.evaluate(() => { (window as any).__DEV_NAVIGATE__('editor'); });

  const dialog = window.getByRole('dialog', { name: /자동 저장 복구|Auto-save recovery/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: /^(복구|Recover)$/ }).click();
  await expect(dialog).toHaveCount(0);
  await window.waitForTimeout(2000);

  // Opened in the editor, written nowhere
  await expect(window.getByText('Recovered Edit').first()).toBeVisible();
  expect(readFileSync(path).equals(original)).toBe(true);
  expect(existsSync(`${path}.autosave`)).toBe(true);
  await expect(window.getByText(/^수정 중$/)).toBeVisible();
  await window.screenshot({ path: 'test-results/autosave-recovered.png' });

  // Saving writes it and clears the autosave
  await window.keyboard.press('Control+s');
  await expect.poll(() => readFileSync(path, 'utf-8').includes('#TITLE Recovered Edit'), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => existsSync(`${path}.autosave`), { timeout: 10_000 }).toBe(false);
});
