/**
 * Adapter that wraps AudioPreloader to implement the KeysoundPlayer interface
 * expected by GamePlayer.
 */
import type { AudioPreloader } from '@rhythm-archive/bms-player';

export interface KeysoundPlayer {
  readonly isReady: boolean;
  play(keysoundId: string, offset?: number, scheduledTime?: number, volume?: number): void;
  stopAll(): void;
  dispose(): void;
  readonly preloader?: AudioPreloader;
}

export function createKeysoundPlayerAdapter(audioPreloader: AudioPreloader): KeysoundPlayer {
  return {
    get isReady() {
      return true; // We only create the adapter after loadAll + decodeAll + initAudioWorklet
    },

    play(keysoundId: string, offset?: number, scheduledTime?: number, volume?: number) {
      audioPreloader.playAudioSync(keysoundId.toLowerCase(), false, true, offset ?? 0, scheduledTime ?? 0, volume ?? 1);
    },

    stopAll() {
      audioPreloader.stopAllAudio();
    },

    dispose() {
      audioPreloader.releaseAllResources();
    },

    get preloader() {
      return audioPreloader;
    },
  };
}
