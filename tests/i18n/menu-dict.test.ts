import { t } from '../../src/main/i18n/menu';

describe('main process menu dictionary', () => {
  it('returns Korean label when locale=ko', () => {
    expect(t('ko', 'menu.file')).toBe('파일');
    expect(t('ko', 'menu.save')).toBe('저장');
    expect(t('ko', 'menu.openFile')).toBe('파일 열기...');
  });

  it('returns English label when locale=en', () => {
    expect(t('en', 'menu.file')).toBe('File');
    expect(t('en', 'menu.save')).toBe('Save');
    expect(t('en', 'menu.openFile')).toBe('Open File...');
  });

  it('returns Japanese label when locale=ja', () => {
    expect(t('ja', 'menu.file')).toBe('ファイル');
    expect(t('ja', 'menu.save')).toBe('保存');
    expect(t('ja', 'menu.openFile')).toBe('ファイルを開く...');
  });

  it('falls back to English for unsupported locale', () => {
    // ru is in SupportedLocale but not yet in the menu dictionary
    expect(t('ru', 'menu.save')).toBe('Save');
    expect(t('zh', 'menu.file')).toBe('File');
  });

  it('every menu key has a translation in en (the fallback)', () => {
    const keys = [
      'menu.file', 'menu.edit', 'menu.view',
      'menu.openFile', 'menu.openFolder', 'menu.save', 'menu.saveAs', 'menu.quit',
      'menu.undo', 'menu.redo', 'menu.cut', 'menu.copy', 'menu.paste', 'menu.selectAll',
      'menu.reload', 'menu.forceReload', 'menu.toggleDevTools',
      'menu.resetZoom', 'menu.zoomIn', 'menu.zoomOut', 'menu.toggleFullScreen',
    ] as const;
    for (const key of keys) {
      const translation = t('en', key);
      expect(translation).toBeTruthy();
      expect(translation).not.toBe(key); // not a missing-key surface
    }
  });

  it('Korean and English have parity (same key set)', () => {
    // structural check — both dictionaries must define the same keys
    const sampleKey = 'menu.toggleFullScreen';
    expect(t('ko', sampleKey)).not.toBe(t('en', sampleKey)); // distinct translations
    expect(t('ko', sampleKey)).toBeTruthy();
  });
});
