/**
 * Adapter that wraps AudioPreloader to implement the KeysoundPlayer interface
 * expected by GamePlayer.
 */
import type { AudioPreloader } from '@rhythm-archive/bms-player';

export interface KeysoundPlayer {
  readonly isReady: boolean;
  play(keysoundId: string, offset?: number): void;
  stopAll(): void;
  dispose(): void;
  readonly preloader?: AudioPreloader;
}

export function createKeysoundPlayerAdapter(audioPreloader: AudioPreloader): KeysoundPlayer {
  return {
    get isReady() {
      return true; // We only create the adapter after loadAll + decodeAll + initAudioWorklet
    },

    play(keysoundId: string, offset?: number) {
      audioPreloader.playAudioSync(keysoundId, false, false, offset);
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
