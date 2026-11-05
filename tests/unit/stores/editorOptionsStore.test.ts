/**
 * Editor options: validation of stored values and localStorage persistence.
 */
import {
  useEditorOptions,
  parseEditorOptions,
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

describe('useEditorOptions', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorOptions.getState().resetOptions();
  });

  it('persists changes to localStorage', () => {
    useEditorOptions.getState().setOptions({ dragAxisLock: 'auto', bgmLanesInView: 20 });
    expect(useEditorOptions.getState().dragAxisLock).toBe('auto');
    expect(JSON.parse(localStorage.getItem('editor-options')!)).toMatchObject({ dragAxisLock: 'auto', bgmLanesInView: 20 });
  });

  it('resets to the defaults', () => {
    useEditorOptions.getState().setOptions({ bgmLaneLayout: 'source' });
    useEditorOptions.getState().resetOptions();
    expect(useEditorOptions.getState().bgmLaneLayout).toBe(DEFAULT_EDITOR_OPTIONS.bgmLaneLayout);
  });
});
