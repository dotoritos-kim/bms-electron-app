/**
 * editorStore 엣지 케이스 테스트
 * tick 전환 경계 조건, 비표준 박자표, 대량 노트, 상태 일관성 검증
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

const store = () => useEditorStore.getState();
const act = () => useEditorStore.getState();

const mockNote = (overrides: Record<string, unknown> = {}): EditableBMSNote => ({
  id: `n-${Math.random().toString(36).slice(2, 8)}`,
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
  useEditorStore.setState({ notes, nextNoteId: notes.length + 100 });
}

beforeEach(() => {
  act().reset();
});

// ============================================================
// Tick ↔ Beat Consistency
// ============================================================
describe('Tick-Beat consistency', () => {
  it('addNote always produces consistent tick and beat', () => {
    act().addNote({
      beat: 1.333333, // ~1/3 beat, should snap to tick 1280 → beat 1.333...
      measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '',
    } as any);
    const n = store().notes[0];
    expect(n.tick).toBeDefined();
    expect(Math.abs(n.beat - n.tick! / 960)).toBeLessThan(0.0001);
  });

  it('moveNotes preserves tick-beat relationship', () => {
    seedNotes([mockNote({ id: 'n1', beat: 2, tick: 1920 })]);
    useEditorStore.setState({ selectedNotes: new Set(['n1']), gridSnap: 16 });
    act().moveNotes(['n1'], { beat: 0.5 }, ['1', '2', '3']);
    const n = store().notes[0];
    expect(n.tick).toBeDefined();
    expect(Math.abs(n.beat - n.tick! / 960)).toBeLessThan(0.0001);
  });

  it('quantizeNotes tick and beat agree after quantize', () => {
    // Note at off-grid position
    seedNotes([mockNote({ id: 'n1', beat: 1.37, tick: Math.round(1.37 * 960) })]);
    useEditorStore.setState({ selectedNotes: new Set(['n1']), gridSnap: 16 });
    act().quantizeNotes();
    const n = store().notes[0];
    expect(n.tick).toBeDefined();
    expect(Math.abs(n.beat - n.tick! / 960)).toBeLessThan(0.0001);
    // Should be on 1/4-beat grid (240 ticks)
    expect(n.tick! % 240).toBe(0);
  });

  it('flipNotes preserves tick-beat consistency', () => {
    seedNotes([
      mockNote({ id: 'n1', beat: 0, tick: 0 }),
      mockNote({ id: 'n2', beat: 4, tick: 3840 }),
    ]);
    useEditorStore.setState({ selectedNotes: new Set(['n1', 'n2']) });
    act().flipNotes();
    for (const n of store().notes) {
      expect(n.tick).toBeDefined();
      expect(Math.abs(n.beat - n.tick! / 960)).toBeLessThan(0.0001);
    }
  });
});

// ============================================================
// Long Note Edge Cases
// ============================================================
describe('Long Note edge cases', () => {
  it('quantize never collapses LN to zero length', () => {
    // LN with very short length, both endpoints on same grid after quantize
    seedNotes([mockNote({
      id: 'ln1', beat: 0.05, tick: 48,
      endBeat: 0.06, endTick: 58,
    })]);
    useEditorStore.setState({ selectedNotes: new Set(['ln1']), gridSnap: 4 });
    act().quantizeNotes();
    const n = store().notes[0];
    if (n.endTick !== undefined) {
      expect(n.endTick).toBeGreaterThan(n.tick!);
    }
  });

  it('moveNotes preserves LN length exactly', () => {
    const lnLength = 960; // exactly 1 beat
    seedNotes([mockNote({
      id: 'ln1', beat: 2, tick: 1920,
      endBeat: 3, endTick: 1920 + lnLength,
    })]);
    act().moveNotes(['ln1'], { beat: 4 }, ['1']);
    const n = store().notes[0];
    expect(n.endTick! - n.tick!).toBe(lnLength);
  });
});

// ============================================================
// Grid Snap Edge Cases
// ============================================================
describe('Grid snap edge cases', () => {
  it('gridSnap 384 (1/96 beat) produces valid tick positions', () => {
    useEditorStore.setState({ gridSnap: 384 });
    act().addNote({
      beat: 0.01, measure: 0, fraction: 0,
      column: '1', keysound: '01', noteType: 'playable', channel: '',
    } as any);
    const n = store().notes[0];
    // gridSnap 384 → gridTicks = 960*4/384 = 10
    expect(n.tick! % 10).toBe(0);
  });

  it('gridSnap 12 (triplet): store addNote rounds beat to tick correctly', () => {
    useEditorStore.setState({ gridSnap: 12 });
    // Simulate NoteChartEditor snapping: 0.3 beat → nearest 1/3 = 0.3333
    const snappedBeat = 1 / 3; // pre-snapped by canvas
    act().addNote({
      beat: snappedBeat, measure: 0, fraction: 0,
      column: '1', keysound: '01', noteType: 'playable', channel: '',
    } as any);
    const n = store().notes[0];
    expect(n.tick).toBe(320); // 1/3 beat = 320 ticks
    expect(n.tick! % 320).toBe(0);
  });

  it('custom gridSnap value: store addNote preserves tick-beat consistency', () => {
    useEditorStore.setState({ gridSnap: 20 as any });
    // Pre-snapped beat at 0.2 (gridTicks=192, nearest tick=192 → beat=0.2)
    act().addNote({
      beat: 0.2, measure: 0, fraction: 0,
      column: '1', keysound: '01', noteType: 'playable', channel: '',
    } as any);
    const n = store().notes[0];
    expect(n.tick).toBe(192); // 0.2 beat = 192 ticks
    expect(n.tick! % 192).toBe(0);
  });
});

// ============================================================
// Bookmark Edge Cases
// ============================================================
describe('Bookmark edge cases', () => {
  it('adding bookmark at same measure replaces, not duplicates', () => {
    act().addBookmark(0, 'First');
    act().addBookmark(0, 'Second');
    act().addBookmark(0, 'Third');
    expect(store().bookmarks).toHaveLength(1);
    expect(store().bookmarks[0].name).toBe('Third');
  });

  it('removing non-existent bookmark is safe', () => {
    act().addBookmark(4, 'Test');
    act().removeBookmark(999);
    expect(store().bookmarks).toHaveLength(1);
  });
});

// ============================================================
// Group Edge Cases
// ============================================================
describe('Group edge cases', () => {
  it('selectGroup with deleted notes selects whatever remains', () => {
    seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
    act().createGroup('G', ['n1', 'n2', 'n3']); // n3 doesn't exist
    const gid = store().noteGroups[0].id;
    act().selectGroup(gid);
    // selectedNotes includes all IDs from group, even non-existent
    expect(store().selectedNotes.has('n1')).toBe(true);
    expect(store().selectedNotes.has('n3')).toBe(true); // still in set
  });

  it('selectGroup with non-existent group ID is safe', () => {
    act().selectGroup('nonexistent');
    expect(store().selectedNotes.size).toBe(0);
  });

  it('deleteGroup with non-existent ID is safe', () => {
    act().createGroup('G', ['n1']);
    act().deleteGroup('nonexistent');
    expect(store().noteGroups).toHaveLength(1);
  });
});

// ============================================================
// SelectByFilter Edge Cases
// ============================================================
describe('selectByFilter edge cases', () => {
  it('empty filter selects all notes', () => {
    seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
    act().selectByFilter({});
    expect(store().selectedNotes.size).toBe(2);
  });

  it('filter with no matches selects nothing', () => {
    seedNotes([mockNote({ id: 'n1', noteType: 'playable' })]);
    act().selectByFilter({ noteTypes: ['landmine'] });
    expect(store().selectedNotes.size).toBe(0);
  });

  it('measureRange from > to selects nothing', () => {
    seedNotes([mockNote({ id: 'n1', measure: 4 })]);
    act().selectByFilter({ measureRange: { from: 10, to: 5 } });
    expect(store().selectedNotes.size).toBe(0);
  });
});

// ============================================================
// Comparison Edge Cases
// ============================================================
describe('Comparison edge cases', () => {
  it('snapshot is a deep copy, not reference', () => {
    seedNotes([mockNote({ id: 'n1', beat: 4, tick: 3840 })]);
    act().saveComparisonSnapshot();
    // Modify original notes
    useEditorStore.setState({ notes: [] });
    // Snapshot should still have the note
    expect(store().comparisonSnapshot!.notes).toHaveLength(1);
    expect(store().comparisonSnapshot!.notes[0].id).toBe('n1');
  });
});

// ============================================================
// Clipboard History Edge Cases
// ============================================================
describe('Clipboard history edge cases', () => {
  it('copying empty selection does not add to history', () => {
    useEditorStore.setState({ selectedNotes: new Set() });
    act().copy();
    expect(store().clipboardHistory).toHaveLength(0);
  });

  it('selectClipboardHistory out of bounds is safe', () => {
    act().selectClipboardHistory(-1);
    act().selectClipboardHistory(100);
    expect(store().clipboard).toEqual([]);
  });
});

// ============================================================
// Reset Clears Everything
// ============================================================
describe('Reset state', () => {
  it('reset clears all new state fields', () => {
    act().addBookmark(0, 'Test');
    act().createGroup('G', ['n1']);
    act().setGridSnapOverride(4, 12);
    act().setCustomColor('playable', '#ff0000');
    act().setLayerVisible('bgm', false);
    act().setMinLnLength(1.0);
    seedNotes([mockNote({ id: 'n1' })]);
    act().saveComparisonSnapshot();

    act().reset();

    expect(store().bookmarks).toEqual([]);
    expect(store().noteGroups).toEqual([]);
    expect(store().gridSnapOverrides.size).toBe(0);
    expect(store().customColors).toEqual({});
    expect(store().layerConfig.bgm.visible).toBe(true);
    expect(store().minLnLength).toBe(0.25);
    expect(store().snapEnabled).toBe(true);
    expect(store().comparisonSnapshot).toBeNull();
    expect(store().comparisonActive).toBe(false);
    expect(store().clipboardHistory).toEqual([]);
  });
});
