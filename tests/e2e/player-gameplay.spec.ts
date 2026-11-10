/**
 * Plays a real chart (with audio) in the player. The other player specs only
 * open the route; nothing started a game, so gameplay regressions (pause
 * cutting the BGM for good, lanes without a key) went unnoticed.
 */
import { test, expect } from './electron-app';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

const PLAY_DIR = resolve(__dirname, 'fixtures-play');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

async function openPlayer(window: Page, dir: string, name: string) {
  await window.evaluate(
    ([p, n, f]) => {
      (window as any).__DEV_OPEN_FILE__(p, n, f);
      (window as any).__DEV_NAVIGATE__('player');
    },
    [resolve(dir, name), name, dir],
  );
  // The ready screen lists the lane keys once chart and keysounds are loaded.
  await expect(window.getByTestId('lane-keys')).toBeVisible({ timeout: 20000 });
}

/** Records the messages sent to the audio worklet ("play:01", "pauseAll", ...). */
async function recordWorkletMessages(window: Page) {
  await window.evaluate(() => {
    const log: string[] = ((window as any).__workletLog = []);
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (this: MessagePort, msg: any, ...rest: any[]) {
      if (msg && typeof msg === 'object' && typeof msg.type === 'string' && msg.type !== 'register') {
        log.push(msg.data?.bufferKey ? `${msg.type}:${msg.data.bufferKey}` : msg.type);
      }
      return (post as any).call(this, msg, ...rest);
    };
  });
}
const workletLog = (window: Page): Promise<string[]> => window.evaluate(() => [...(window as any).__workletLog]);

async function startAutoplay(window: Page) {
  await window.locator('input[type=checkbox]').check();
  await window.keyboard.press('Space');
}

test.describe('Player gameplay', () => {
  test('autoplay plays the chart to a full-combo clear', async ({ window }) => {
    await openPlayer(window, PLAY_DIR, 'play.bms');
    await startAutoplay(window);

    await expect(window.locator('body')).toContainText('풀 콤보!', { timeout: 20000 });
    const body = await window.locator('body').textContent();
    expect(body).toContain('클리어!');
    // 15 notes + 1 long note (head and tail) = 17 judgments, all PGREAT
    expect(body).toContain('PGREAT17');
    expect(body).toContain('MISS0');
  });

  test('autoplay turned on mid-song takes over from there', async ({ window }) => {
    await openPlayer(window, PLAY_DIR, 'play.bms');
    await window.keyboard.press('Space');
    // Nobody plays: the first notes (from 1.6 s) run out of their window.
    await expect(window.locator('body')).toContainText(/MS[1-9]/, { timeout: 10000 });
    await window.locator('input[type=checkbox]').check();

    await expect(window.locator('body')).toContainText('다시 도전', { timeout: 20000 });
    const body = (await window.locator('body').textContent()) || '';
    const result = /PGREAT(\d+)GREAT\d+GOOD\d+BAD\d+POOR\d+MISS(\d+)/.exec(body);
    expect(result).not.toBeNull();
    // The rest of the chart was played by autoplay; the early misses stay.
    expect(Number(result![1])).toBeGreaterThanOrEqual(8);
    expect(Number(result![2])).toBeGreaterThanOrEqual(1);
    expect(Number(result![1]) + Number(result![2])).toBe(17);
  });

  test('pause freezes the audio and resuming continues the same BGM', async ({ window }) => {
    await recordWorkletMessages(window);
    await openPlayer(window, PLAY_DIR, 'play.bms');
    await startAutoplay(window);

    // The 5 s BGM sample starts at 1.6 s; pause while it is sounding.
    await expect.poll(() => workletLog(window), { timeout: 10000 }).toContain('play:01');
    await window.waitForTimeout(500);
    await window.keyboard.press('Escape');
    await expect(window.locator('body')).toContainText('일시정지');
    let log = await workletLog(window);
    expect(log).toContain('pauseAll');
    // stopAll here is what used to silence the rest of the song.
    expect(log.slice(log.indexOf('play:01'))).not.toContain('stopAll');

    // ESC resumes too.
    await window.keyboard.press('Escape');
    await expect(window.locator('body')).not.toContainText('일시정지');
    await expect(window.locator('body')).toContainText('풀 콤보!', { timeout: 20000 });

    log = await workletLog(window);
    expect(log).toContain('resumeAll');
    // Continued, not restarted: the BGM sample was started exactly once.
    expect(log.filter((m) => m === 'play:01')).toHaveLength(1);
    expect(await window.locator('body').textContent()).toContain('MISS0');
  });

  test('14K: every lane has a key and the 2P side responds', async ({ window }) => {
    await openPlayer(window, FIXTURES_DIR, 'test-14k.bms');
    const keys = await window.getByTestId('lane-keys').locator('span').allTextContents();
    expect(keys).toHaveLength(16);
    expect(keys).not.toContain('-');
    expect(new Set(keys).size).toBe(16);

    // Without autoplay, hold the key of the last 2P key lane through the first notes.
    await window.keyboard.press('Space');
    await window.waitForTimeout(1500);
    for (let i = 0; i < 12; i++) {
      await window.keyboard.press('Slash');
      await window.waitForTimeout(100);
    }
    // Some press landed inside a note's judgment window: not everything is a MISS.
    const body = (await window.locator('body').textContent()) || '';
    const judged = /PG(\d+)GR(\d+)GD(\d+)BD(\d+)/.exec(body);
    expect(judged).not.toBeNull();
    expect(judged!.slice(1).reduce((sum, n) => sum + Number(n), 0)).toBeGreaterThan(0);
  });

  test('key settings: rebind a lane on the ready screen and play with the new key', async ({ window }) => {
    // Bindings live in localStorage, which outlives the test: start and end on the defaults.
    const clearBindings = () => window.evaluate(() => localStorage.removeItem('bms_key_bindings'));
    await clearBindings();
    try {
      await openPlayer(window, PLAY_DIR, 'play.bms');
      await window.getByTestId('open-key-settings').click();
      await window.getByTestId('key-slot-1').click();
      await window.keyboard.press('KeyQ');
      await expect(window.getByTestId('key-slot-1')).toContainText('Q');
      // Space belongs to the dialog while it is open: the game must not start behind it.
      await window.keyboard.press('Space');
      await expect(window.getByTestId('lane-keys')).toBeVisible();
      await window.getByRole('dialog').getByText('저장').click();
      await expect(window.getByRole('dialog')).toHaveCount(0);
      expect(await window.getByTestId('lane-keys').locator('span').allTextContents())
        .toEqual(['L-Shift', 'Q', 'D', 'F', 'Space', 'J']); // the fixture is a 5K chart

      // Lane 1 has a note every 0.4 s from 1.6 s on: Q now hits them.
      await window.keyboard.press('Space');
      await window.waitForTimeout(1300);
      for (let i = 0; i < 20; i++) {
        await window.keyboard.press('KeyQ');
        await window.waitForTimeout(100);
      }
      const body = (await window.locator('body').textContent()) || '';
      const judged = /PG(\d+)GR(\d+)GD(\d+)BD(\d+)/.exec(body);
      expect(judged).not.toBeNull();
      expect(judged!.slice(1).reduce((sum, n) => sum + Number(n), 0)).toBeGreaterThan(0);
    } finally {
      await clearBindings();
    }
  });
});
