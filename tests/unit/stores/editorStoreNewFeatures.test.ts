/**
 * editorStore 신규 기능 테스트
 * Phase 3-7에서 추가된 기능: Layer, Snap, Bookmarks, Groups, SelectByFilter,
 * Comparison, ClipboardHistory, CustomColors, GridSnapOverrides
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

const store = () => useEditorStore.getState();
const act = () => useEditorStore.getState();

const mockNote = (overrides: Record<string, unknown> = {}): EditableBMSNote => ({
  id: `n-${Math.random()}`,
  beat: 0,
  tick: 0,
  measure: 0,
  fraction: 0,
  column: '1',
  keysound: '01',
  noteType: 'playable',
  channel: '11',
  ...overrides,
} as EditableBMSNote);

function seedNotes(notes: EditableBMSNote[]) {
  useEditorStore.setState({ notes, nextNoteId: notes.length + 1 });
}

beforeEach(() => {
  act().reset();
});

// ============================================================
// Layer Config
// ============================================================
describe('LayerConfig', () => {
  it('has default config with all layers visible', () => {
    const lc = store().layerConfig;
    expect(lc.playable.visible).toBe(true);
    expect(lc.invisible.visible).toBe(true);
    expect(lc.landmine.visible).toBe(true);
    expect(lc.bgm.visible).toBe(true);
  });

  it('default invisible opacity is 0.4', () => {
    expect(store().layerConfig.invisible.opacity).toBe(0.4);
  });

  it('setLayerVisible toggles visibility', () => {
    act().setLayerVisible('bgm', false);
    expect(store().layerConfig.bgm.visible).toBe(false);
    act().setLayerVisible('bgm', true);
    expect(store().layerConfig.bgm.visible).toBe(true);
  });

  it('setLayerLocked toggles lock', () => {
    act().setLayerLocked('playable', true);
    expect(store().layerConfig.playable.locked).toBe(true);
  });

  it('setLayerOpacity clamps 0-1', () => {
    act().setLayerOpacity('landmine', 0.5);
    expect(store().layerConfig.landmine.opacity).toBe(0.5);
    act().setLayerOpacity('landmine', 2.0);
    expect(store().layerConfig.landmine.opacity).toBe(1.0);
    act().setLayerOpacity('landmine', -1);
    expect(store().layerConfig.landmine.opacity).toBe(0);
  });

  it('resetLayerConfig restores defaults', () => {
    act().setLayerVisible('playable', false);
    act().setLayerOpacity('bgm', 0.1);
    act().resetLayerConfig();
    expect(store().layerConfig.playable.visible).toBe(true);
    expect(store().layerConfig.bgm.opacity).toBe(0.6);
  });
});

// ============================================================
// Snap Enabled
// ============================================================
describe('Snap', () => {
  it('snapEnabled defaults to true', () => {
    expect(store().snapEnabled).toBe(true);
  });

  it('toggleSnap flips snapEnabled', () => {
    act().toggleSnap();
    expect(store().snapEnabled).toBe(false);
    act().toggleSnap();
    expect(store().snapEnabled).toBe(true);
  });

  it('setSnapEnabled sets value directly', () => {
    act().setSnapEnabled(false);
    expect(store().snapEnabled).toBe(false);
  });
});

// ============================================================
// Grid Snap Overrides
// ============================================================
describe('GridSnapOverrides', () => {
  it('defaults to empty map', () => {
    expect(store().gridSnapOverrides.size).toBe(0);
  });

  it('setGridSnapOverride adds override', () => {
    act().setGridSnapOverride(4, 12);
    expect(store().gridSnapOverrides.get(4)).toBe(12);
  });

  it('setGridSnapOverride with null removes override', () => {
    act().setGridSnapOverride(4, 12);
    act().setGridSnapOverride(4, null);
    expect(store().gridSnapOverrides.has(4)).toBe(false);
  });

  it('getGridSnapForMeasure returns override when set', () => {
    act().setGridSnapOverride(8, 48);
    expect(act().getGridSnapForMeasure(8)).toBe(48);
  });

  it('getGridSnapForMeasure returns default when no override', () => {
    useEditorStore.setState({ gridSnap: 16 });
    expect(act().getGridSnapForMeasure(0)).toBe(16);
  });
});

// ============================================================
// Bookmarks
// ============================================================
describe('Bookmarks', () => {
  it('defaults to empty array', () => {
    expect(store().bookmarks).toEqual([]);
  });

  it('addBookmark adds and sorts by measure', () => {
    act().addBookmark(8, 'Drop');
    act().addBookmark(0, 'Intro');
    act().addBookmark(16, 'Outro');
    expect(store().bookmarks.map((b) => b.measure)).toEqual([0, 8, 16]);
  });

  it('addBookmark replaces existing at same measure', () => {
    act().addBookmark(4, 'Original');
    act().addBookmark(4, 'Replaced');
    expect(store().bookmarks).toHaveLength(1);
    expect(store().bookmarks[0].name).toBe('Replaced');
  });

  it('removeBookmark removes by measure', () => {
    act().addBookmark(0, 'A');
    act().addBookmark(4, 'B');
    act().removeBookmark(0);
    expect(store().bookmarks).toHaveLength(1);
    expect(store().bookmarks[0].name).toBe('B');
  });

  it('renameBookmark updates name', () => {
    act().addBookmark(0, 'Old');
    act().renameBookmark(0, 'New');
    expect(store().bookmarks[0].name).toBe('New');
  });
});

// ============================================================
// Note Groups
// ============================================================
describe('NoteGroups', () => {
  it('defaults to empty array', () => {
    expect(store().noteGroups).toEqual([]);
  });

  it('createGroup adds a group', () => {
    act().createGroup('Pattern A', ['n1', 'n2'], '#ff0000');
    expect(store().noteGroups).toHaveLength(1);
    expect(store().noteGroups[0].name).toBe('Pattern A');
    expect(store().noteGroups[0].noteIds).toEqual(['n1', 'n2']);
  });

  it('deleteGroup removes by id', () => {
    act().createGroup('A', ['n1']);
    const id = store().noteGroups[0].id;
    act().deleteGroup(id);
    expect(store().noteGroups).toHaveLength(0);
  });

  it('selectGroup selects all notes in group', () => {
    seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' }), mockNote({ id: 'n3' })]);
    act().createGroup('G', ['n1', 'n3']);
    const groupId = store().noteGroups[0].id;
    act().selectGroup(groupId);
    expect(store().selectedNotes).toEqual(new Set(['n1', 'n3']));
  });

  it('ungroupSelected removes groups whose notes are all selected', () => {
    act().createGroup('Full', ['n1', 'n2']);
    act().createGroup('Partial', ['n2', 'n3']);
    useEditorStore.setState({ selectedNotes: new Set(['n1', 'n2']) });
    act().ungroupSelected();
    // 'Full' group should be removed (all members selected)
    // 'Partial' should remain (n3 not selected)
    expect(store().noteGroups).toHaveLength(1);
    expect(store().noteGroups[0].name).toBe('Partial');
  });
});

// ============================================================
// Select By Filter
// ============================================================
describe('selectByFilter', () => {
  beforeEach(() => {
    seedNotes([
      mockNote({ id: 'p1', noteType: 'playable', column: '1', measure: 0, keysound: '01' }),
      mockNote({ id: 'p2', noteType: 'playable', column: '2', measure: 4, keysound: '02' }),
      mockNote({ id: 'i1', noteType: 'invisible', column: '1', measure: 0, keysound: '01' }),
      mockNote({ id: 'b1', noteType: 'bgm', column: undefined, measure: 8, keysound: '03' }),
      mockNote({ id: 'l1', noteType: 'landmine', column: '3', measure: 2, keysound: '01' }),
    ]);
  });

  it('selects by noteType', () => {
    act().selectByFilter({ noteTypes: ['invisible'] });
    expect(store().selectedNotes).toEqual(new Set(['i1']));
  });

  it('selects by measure range', () => {
    act().selectByFilter({ measureRange: { from: 0, to: 2 } });
    expect(store().selectedNotes).toEqual(new Set(['p1', 'i1', 'l1']));
  });

  it('selects by column', () => {
    act().selectByFilter({ columns: ['2'] });
    expect(store().selectedNotes).toEqual(new Set(['p2']));
  });

  it('selects by keysound', () => {
    act().selectByFilter({ keysounds: ['03'] });
    expect(store().selectedNotes).toEqual(new Set(['b1']));
  });

  it('combines filters (AND logic)', () => {
    act().selectByFilter({ noteTypes: ['playable'], columns: ['1'] });
    expect(store().selectedNotes).toEqual(new Set(['p1']));
  });

  it('additive mode adds to existing selection', () => {
    useEditorStore.setState({ selectedNotes: new Set(['p1']) });
    act().selectByFilter({ noteTypes: ['bgm'], additive: true });
    expect(store().selectedNotes).toEqual(new Set(['p1', 'b1']));
  });

  it('non-additive replaces selection', () => {
    useEditorStore.setState({ selectedNotes: new Set(['p1']) });
    act().selectByFilter({ noteTypes: ['bgm'] });
    expect(store().selectedNotes).toEqual(new Set(['b1']));
  });
});

// ============================================================
// Clipboard History
// ============================================================
describe('ClipboardHistory', () => {
  it('defaults to empty', () => {
    expect(store().clipboardHistory).toEqual([]);
  });

  it('copy pushes to history', () => {
    seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
    useEditorStore.setState({ selectedNotes: new Set(['n1']) });
    act().copy();
    expect(store().clipboardHistory).toHaveLength(1);
    expect(store().clipboardHistory[0]).toHaveLength(1);
  });

  it('history is capped at 10', () => {
    seedNotes([mockNote({ id: 'n1' })]);
    for (let i = 0; i < 15; i++) {
      useEditorStore.setState({ selectedNotes: new Set(['n1']) });
      act().copy();
    }
    expect(store().clipboardHistory).toHaveLength(10);
  });

  it('selectClipboardHistory sets current clipboard', () => {
    seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
    useEditorStore.setState({ selectedNotes: new Set(['n1']) });
    act().copy();
    useEditorStore.setState({ selectedNotes: new Set(['n2']) });
    act().copy();
    // History: [n2 copy, n1 copy]
    // Current clipboard is n2
    act().selectClipboardHistory(1); // select the n1 copy
    expect(store().clipboard).toHaveLength(1);
    expect(store().clipboard[0].id).toBe('n1');
  });
});

// ============================================================
// A/B Comparison
// ============================================================
describe('Comparison', () => {
  it('defaults to null/false', () => {
    expect(store().comparisonSnapshot).toBeNull();
    expect(store().comparisonActive).toBe(false);
  });

  it('saveComparisonSnapshot stores current notes', () => {
    seedNotes([mockNote({ id: 'n1', beat: 4, tick: 3840 })]);
    act().saveComparisonSnapshot();
    expect(store().comparisonSnapshot).not.toBeNull();
    expect(store().comparisonSnapshot!.notes).toHaveLength(1);
    expect(store().comparisonSnapshot!.notes[0].id).toBe('n1');
  });

  it('toggleComparison does nothing without snapshot', () => {
    act().toggleComparison();
    expect(store().comparisonActive).toBe(false);
  });

  it('toggleComparison works with snapshot', () => {
    seedNotes([mockNote({ id: 'n1' })]);
    act().saveComparisonSnapshot();
    act().toggleComparison();
    expect(store().comparisonActive).toBe(true);
    act().toggleComparison();
    expect(store().comparisonActive).toBe(false);
  });

  it('clearComparisonSnapshot resets both', () => {
    seedNotes([mockNote({ id: 'n1' })]);
    act().saveComparisonSnapshot();
    act().toggleComparison();
    act().clearComparisonSnapshot();
    expect(store().comparisonSnapshot).toBeNull();
    expect(store().comparisonActive).toBe(false);
  });
});

// ============================================================
// Custom Colors
// ============================================================
describe('CustomColors', () => {
  it('defaults to empty object', () => {
    expect(store().customColors).toEqual({});
  });

  it('setCustomColor sets a color', () => {
    act().setCustomColor('playable', '#ff0000');
    expect(store().customColors.playable).toBe('#ff0000');
  });

  it('setCustomColor with null removes color', () => {
    act().setCustomColor('playable', '#ff0000');
    act().setCustomColor('playable', null);
    expect(store().customColors.playable).toBeUndefined();
  });

  it('resetCustomColors clears all', () => {
    act().setCustomColor('playable', '#ff0000');
    act().setCustomColor('bgm', '#00ff00');
    act().resetCustomColors();
    expect(store().customColors).toEqual({});
  });
});

// ============================================================
// MinLnLength
// ============================================================
describe('MinLnLength', () => {
  it('defaults to 0.25', () => {
    expect(store().minLnLength).toBe(0.25);
  });

  it('setMinLnLength clamps to valid range', () => {
    act().setMinLnLength(0.5);
    expect(store().minLnLength).toBe(0.5);
    act().setMinLnLength(0.001);
    expect(store().minLnLength).toBe(0.0625); // minimum
    act().setMinLnLength(100);
    expect(store().minLnLength).toBe(4); // maximum
  });
});
