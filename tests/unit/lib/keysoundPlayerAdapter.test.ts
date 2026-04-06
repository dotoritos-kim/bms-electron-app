import { createKeysoundPlayerAdapter } from '../../../src/renderer/lib/keysoundPlayerAdapter';

function createMockPreloader() {
  return {
    playAudioSync: vi.fn(),
    stopAllAudio: vi.fn(),
    releaseAllResources: vi.fn(),
  };
}

describe('keysoundPlayerAdapter', () => {
  describe('createKeysoundPlayerAdapter', () => {
    it('isReady returns true', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      expect(adapter.isReady).toBe(true);
    });

    it('play() calls preloader.playAudioSync with lowercased keysoundId', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.play('BGM01');
      expect(mock.playAudioSync).toHaveBeenCalledWith('bgm01', false, true, 0, 0, 1);
    });

    it('play() passes default offset=0, scheduledTime=0, volume=1 when not specified', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.play('test');
      expect(mock.playAudioSync).toHaveBeenCalledWith('test', false, true, 0, 0, 1);
    });

    it('play() passes custom parameters', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.play('SFX', 0.5, 1.2, 0.8);
      expect(mock.playAudioSync).toHaveBeenCalledWith('sfx', false, true, 0.5, 1.2, 0.8);
    });

    it('stopAll() calls preloader.stopAllAudio', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.stopAll();
      expect(mock.stopAllAudio).toHaveBeenCalledOnce();
    });

    it('dispose() calls preloader.releaseAllResources', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.dispose();
      expect(mock.releaseAllResources).toHaveBeenCalledOnce();
    });

    it('preloader getter returns the original AudioPreloader', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      expect(adapter.preloader).toBe(mock);
    });

    it('play() lowercases mixed-case keysound IDs', () => {
      const mock = createMockPreloader();
      const adapter = createKeysoundPlayerAdapter(mock as any);
      adapter.play('Piano_HIT_01.WAV');
      expect(mock.playAudioSync.mock.calls[0][0]).toBe('piano_hit_01.wav');
    });
  });
});
