/**
 * Adapter that wraps AudioPreloader to implement the KeysoundPlayer interface
 * expected by GamePlayer.
 */
import type { AudioPreloader } from '@rhythm-archive/bms-player';
import { keysoundKey } from '@rhythm-archive/bms-core';

export interface KeysoundPlayer {
  readonly isReady: boolean;
  play(keysoundId: string, offset?: number, scheduledTime?: number, volume?: number): void;
  stopAll(): void;
  /** Freeze / continue every keysound (game pause keeps long BGM samples). */
  pauseAll(): void;
  resumeAll(): void;
  dispose(): void;
  readonly preloader?: AudioPreloader;
}

/**
 * @param base62 `#BASE 62` chart: keysound ids are case-sensitive (must match
 *   the preloader's file-map keys, see `keysoundKey`).
 */
export function createKeysoundPlayerAdapter(audioPreloader: AudioPreloader, base62 = false): KeysoundPlayer {
  return {
    get isReady() {
      return true; // We only create the adapter after loadAll + decodeAll + initAudioWorklet
    },

    play(keysoundId: string, offset?: number, scheduledTime?: number, volume?: number) {
      const key = keysoundKey(keysoundId, base62);
      const at = scheduledTime ?? 0;
      audioPreloader.playAudioSync(key, false, true, offset ?? 0, at, volume ?? 1, {
        // Re-triggering a WAV slot restarts it (BMS behaviour) instead of
        // stacking identical voices into phasing/clipping on dense charts.
        chokeGroup: key,
        // A scheduled BGM event that reaches the worklet late (busy main
        // thread) skips the elapsed part instead of playing off-beat.
        catchUp: at > 0,
      });
    },

    stopAll() {
      audioPreloader.stopAllAudio();
    },

    pauseAll() {
      audioPreloader.pauseAllAudio();
    },

    resumeAll() {
      audioPreloader.resumeAllAudio();
    },

    dispose() {
      audioPreloader.releaseAllResources();
    },

    get preloader() {
      return audioPreloader;
    },
  };
}
