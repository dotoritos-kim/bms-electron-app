/**
 * Editor options: validation of stored values and localStorage persistence.
 */
import {
  useEditorOptions,
  parseEditorOptions,
  migrateStoredOptions,
  DEFAULT_EDITOR_OPTIONS,
} from '../../../src/renderer/stores/editorOptionsStore';

describe('parseEditorOptions', () => {
  it('returns the defaults for missing / corrupt values', () => {
    expect(parseEditorOptions(null)).toEqual(DEFAULT_EDITOR_OPTIONS);
    expect(parseEditorOptions({ dragAxisLock: 'diagonal', bgmLaneLayout: 7, bgmLanesInView: 'x' }))
      .toEqual(DEFAULT_EDITOR_OPTIONS);
  });

  it('keeps valid values and clamps the lane count', () => {
    expect(parseEditorOptions({ dragAxisLock: 'horizontal', bgmLaneLayout: 'source', bgmLanesInView: 500 }))
      .toEqual({ dragAxisLock: 'horizontal', bgmLaneLayout: 'source', bgmLanesInView: 64 });
    expect(parseEditorOptions({ bgmLanesInView: 0 }).bgmLanesInView).toBe(1);
  });
});

describe('migrateStoredOptions', () => {
  it('opens charts with the BGM lanes as written in the file by default', () => {
    expect(DEFAULT_EDITOR_OPTIONS.bgmLaneLayout).toBe('source');
    expect(migrateStoredOptions(null).bgmLaneLayout).toBe('source');
  });

  it('drops the layout of unversioned records (0.6.0-0.8.0 stored the old default with any change)', () => {
    expect(migrateStoredOptions({ dragAxisLock: 'auto', bgmLaneLayout: 'packed', bgmLanesInView: 20 }))
      .toEqual({ dragAxisLock: 'auto', bgmLaneLayout: 'source', bgmLanesInView: 20 });
  });

  it('keeps a layout chosen in this version', () => {
    expect(migrateStoredOptions({ version: 2, bgmLaneLayout: 'packed' }).bgmLaneLayout).toBe('packed');
  });
});

describe('useEditorOptions', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorOptions.getState().resetOptions();
  });

  it('persists changes to localStorage', () => {
    useEditorOptions.getState().setOptions({ dragAxisLock: 'auto', bgmLanesInView: 20 });
    expect(useEditorOptions.getState().dragAxisLock).toBe('auto');
    expect(JSON.parse(localStorage.getItem('editor-options')!)).toMatchObject({ dragAxisLock: 'auto', bgmLanesInView: 20, version: 2 });
    expect(migrateStoredOptions(JSON.parse(localStorage.getItem('editor-options')!))).toEqual(
      { dragAxisLock: 'auto', bgmLaneLayout: 'source', bgmLanesInView: 20 },
    );
  });

  it('resets to the defaults', () => {
    useEditorOptions.getState().setOptions({ bgmLaneLayout: 'packed' });
    expect(migrateStoredOptions(JSON.parse(localStorage.getItem('editor-options')!)).bgmLaneLayout).toBe('packed');
    useEditorOptions.getState().resetOptions();
    expect(useEditorOptions.getState().bgmLaneLayout).toBe(DEFAULT_EDITOR_OPTIONS.bgmLaneLayout);
  });
});
