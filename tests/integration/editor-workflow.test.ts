import { useEditorStore } from '../../src/renderer/stores/editorStore';
import { BMSParser, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSChart, EditableBMSNote, BMSHeaderData } from '@rhythm-archive/bms-core';
import { createEmptyHeaders } from '@rhythm-archive/bms-core';
import type { PatternTemplate } from '../../src/renderer/lib/patternTemplates';

// --- Helpers ---

function beatToMF(beat: number): { measure: number; fraction: number } {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
}

function createEmptyChart(): EditableBMSChart {
  return BMSWriter.createEmptyChart();
}

function makeNote(
  id: number,
  beat: number,
  column: string,
  keysound = '01'
): EditableBMSNote {
  const { measure, fraction } = beatToMF(beat);
  return {
    id: `note-${id}`,
    beat,
    measure,
    fraction,
    column,
    keysound,
    noteType: 'playable',
    channel: '11',
  };
}

const LANE_IDS = ['SC', '1', '2', '3', '4', '5', '6', '7'];

function initStoreWithNotes(notes: EditableBMSNote[], nextId?: number) {
  const chart = createEmptyChart();
  chart.notes = notes;
  chart.headers.bpm = 120;
  chart.headers.title = 'Test Chart';
  const maxId = nextId ?? notes.length + 1;
  useEditorStore.getState().initFromChart(chart, [...notes], maxId);
}

// --- Tests ---

describe('Editor Workflow: Cross-module interactions', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  // === Create -> Edit -> Save workflow ===

  describe('Create -> Edit -> Save workflow', () => {
    it('1. Init empty chart -> add notes -> verify store state', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      store.addNote({
        beat: 0,
        measure: 0,
        fraction: 0,
        column: '1',
        keysound: '01',
        noteType: 'playable',
        channel: '11',
      });
      store.addNote({
        beat: 1,
        measure: 0,
        fraction: 0.25,
        column: '2',
        keysound: '02',
        noteType: 'playable',
        channel: '12',
      });

      const state = useEditorStore.getState();
      expect(state.notes.length).toBe(2);
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.notes[0].column).toBe('1');
      expect(state.notes[1].column).toBe('2');
    });

    it('2. Init chart -> add BPM change -> changeBpm -> verify bpmChanges', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      store.changeBpm(0, 150);
      store.changeBpm(8, 200);

      const state = useEditorStore.getState();
      expect(state.bpmChanges.length).toBe(2);
      expect(state.bpmChanges[0].bpm).toBe(150);
      expect(state.bpmChanges[1].bpm).toBe(200);
      expect(state.bpmChanges[1].measure).toBe(2);
    });

    it('3. Init chart -> add STOP -> verify stopEvents', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      // Use submitInputDialog to add a STOP
      store.requestStopAdd(4);
      expect(useEditorStore.getState().inputDialog).not.toBeNull();
      store.submitInputDialog('96');

      const state = useEditorStore.getState();
      expect(state.stopEvents.length).toBe(1);
      expect(state.stopEvents[0].duration).toBe(96);
      expect(state.stopEvents[0].measure).toBe(1);
    });
  });

  // === Clipboard workflow ===

  describe('Clipboard workflow', () => {
    it('4. Add 3 notes -> select 2 -> copy -> paste at different beat -> verify 5 notes total', () => {
      const notes = [
        makeNote(1, 0, '1'),
        makeNote(2, 1, '2'),
        makeNote(3, 2, '3'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      // Select first 2 notes
      store.selectNotes(['note-1', 'note-2']);
      store.copy();

      // Set paste position to beat 8
      store.setCurrentBeat(8);
      store.paste();

      const state = useEditorStore.getState();
      expect(state.notes.length).toBe(5);
      // Pasted notes should be at beat 8 and 9
      const pastedNotes = state.notes.filter((n) => n.beat >= 8);
      expect(pastedNotes.length).toBe(2);
      expect(pastedNotes.map((n) => n.beat).sort()).toEqual([8, 9]);
    });

    it('5. Cut -> paste -> same count, different IDs', () => {
      const notes = [
        makeNote(1, 0, '1'),
        makeNote(2, 1, '2'),
        makeNote(3, 2, '3'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      store.selectNotes(['note-1', 'note-2']);
      store.cut();

      // After cut: 1 note left
      expect(useEditorStore.getState().notes.length).toBe(1);

      store.setCurrentBeat(4);
      store.paste();

      const state = useEditorStore.getState();
      // 1 remaining + 2 pasted = 3
      expect(state.notes.length).toBe(3);
      // Pasted notes should have different IDs
      const noteIds = state.notes.map((n) => n.id);
      expect(new Set(noteIds).size).toBe(3);
      expect(noteIds).not.toContain('note-1');
      expect(noteIds).not.toContain('note-2');
    });
  });

  // === Transform workflow ===

  describe('Transform workflow', () => {
    it('6. Add notes on multiple columns -> mirror -> verify column reversal', () => {
      const notes = [
        makeNote(1, 0, '1'),
        makeNote(2, 0, '3'),
        makeNote(3, 0, '7'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      store.selectNotes(['note-1', 'note-2', 'note-3']);

      const laneIds = ['1', '2', '3', '4', '5', '6', '7'];
      store.mirrorNotes(laneIds);

      const state = useEditorStore.getState();
      const mirrored = state.notes.reduce(
        (acc, n) => ({ ...acc, [n.id]: n.column }),
        {} as Record<string, string>
      );
      expect(mirrored['note-1']).toBe('7'); // 1 -> 7
      expect(mirrored['note-2']).toBe('5'); // 3 -> 5
      expect(mirrored['note-3']).toBe('1'); // 7 -> 1
    });

    it('7. Add notes -> quantize -> beats snap to grid', () => {
      const notes = [
        makeNote(1, 0.13, '1'),
        makeNote(2, 1.07, '2'),
        makeNote(3, 2.51, '3'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      store.selectNotes(['note-1', 'note-2', 'note-3']);
      // Default grid snap is 16, so gridStep = 4/16 = 0.25
      store.quantizeNotes();

      const state = useEditorStore.getState();
      // 0.13 -> 0.25, 1.07 -> 1.0, 2.51 -> 2.5
      expect(state.notes.find((n) => n.id === 'note-1')!.beat).toBe(0.25);
      expect(state.notes.find((n) => n.id === 'note-2')!.beat).toBe(1.0);
      expect(state.notes.find((n) => n.id === 'note-3')!.beat).toBe(2.5);
    });

    it('8. Add notes -> flipNotes -> time axis reversed', () => {
      const notes = [
        makeNote(1, 0, '1'),
        makeNote(2, 2, '2'),
        makeNote(3, 4, '3'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      store.selectNotes(['note-1', 'note-2', 'note-3']);
      store.flipNotes();

      const state = useEditorStore.getState();
      // maxBeat=4, minBeat=0
      // note-1: 4-(0-0) = 4, note-2: 4-(2-0) = 2, note-3: 4-(4-0) = 0
      expect(state.notes.find((n) => n.id === 'note-1')!.beat).toBe(4);
      expect(state.notes.find((n) => n.id === 'note-2')!.beat).toBe(2);
      expect(state.notes.find((n) => n.id === 'note-3')!.beat).toBe(0);
    });
  });

  // === Undo/Redo across operations ===

  describe('Undo/Redo across operations', () => {
    it('9. Add note -> undo -> note gone -> redo -> note back', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      store.addNote({
        beat: 0,
        measure: 0,
        fraction: 0,
        column: '1',
        keysound: '01',
        noteType: 'playable',
        channel: '11',
      });
      expect(useEditorStore.getState().notes.length).toBe(1);

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().notes.length).toBe(0);

      useEditorStore.getState().redo();
      expect(useEditorStore.getState().notes.length).toBe(1);
    });

    it('10. Multiple operations -> undo all -> back to initial', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      store.addNote({
        beat: 0, measure: 0, fraction: 0,
        column: '1', keysound: '01', noteType: 'playable', channel: '11',
      });
      useEditorStore.getState().addNote({
        beat: 1, measure: 0, fraction: 0.25,
        column: '2', keysound: '02', noteType: 'playable', channel: '12',
      });
      useEditorStore.getState().changeBpm(0, 200);

      expect(useEditorStore.getState().notes.length).toBe(2);
      expect(useEditorStore.getState().bpmChanges.length).toBe(1);

      // Undo all 3 operations
      useEditorStore.getState().undo();
      useEditorStore.getState().undo();
      useEditorStore.getState().undo();

      expect(useEditorStore.getState().notes.length).toBe(0);
      expect(useEditorStore.getState().bpmChanges.length).toBe(0);
    });

    it('11. Undo -> make new edit -> redo stack cleared', () => {
      initStoreWithNotes([]);

      const store = useEditorStore.getState();
      store.addNote({
        beat: 0, measure: 0, fraction: 0,
        column: '1', keysound: '01', noteType: 'playable', channel: '11',
      });
      useEditorStore.getState().addNote({
        beat: 1, measure: 0, fraction: 0.25,
        column: '2', keysound: '02', noteType: 'playable', channel: '12',
      });

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().redoStack.length).toBe(1);

      // New edit should clear redo stack
      useEditorStore.getState().addNote({
        beat: 2, measure: 0, fraction: 0.5,
        column: '3', keysound: '03', noteType: 'playable', channel: '13',
      });

      expect(useEditorStore.getState().redoStack.length).toBe(0);
    });
  });

  // === Pattern workflow ===

  describe('Pattern workflow', () => {
    it('12. Apply pattern -> notes created at correct positions', () => {
      initStoreWithNotes([], 1);

      const pattern: PatternTemplate = {
        id: 'test-stairs',
        name: 'Test Stairs',
        category: 'stairs',
        tags: ['test'],
        columnCount: 3,
        beatLength: 2,
        isBuiltIn: false,
        notes: [
          { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
          { beatOffset: 0.5, columnIndex: 1, noteType: 'playable' },
          { beatOffset: 1, columnIndex: 2, noteType: 'playable' },
        ],
      };

      const laneIds = ['1', '2', '3', '4', '5', '6', '7'];
      useEditorStore.getState().applyPattern(pattern, laneIds, 4, '2', '01');

      const state = useEditorStore.getState();
      expect(state.notes.length).toBe(3);

      const sorted = [...state.notes].sort((a, b) => a.beat - b.beat);
      // startColumn='2' is at index 1 in laneIds, so:
      // columnIndex 0 -> index 1 -> '2'
      // columnIndex 1 -> index 2 -> '3'
      // columnIndex 2 -> index 3 -> '4'
      expect(sorted[0].beat).toBe(4);
      expect(sorted[0].column).toBe('2');
      expect(sorted[1].beat).toBe(4.5);
      expect(sorted[1].column).toBe('3');
      expect(sorted[2].beat).toBe(5);
      expect(sorted[2].column).toBe('4');
    });

    it('13. Selection to pattern -> pattern data has correct offsets', () => {
      const notes = [
        makeNote(1, 2, '2'),
        makeNote(2, 3, '4'),
        makeNote(3, 4, '3'),
      ];
      initStoreWithNotes(notes, 4);

      const store = useEditorStore.getState();
      store.selectNotes(['note-1', 'note-2', 'note-3']);

      const laneIds = ['1', '2', '3', '4', '5', '6', '7'];
      const patternData = store.selectionToPatternData(laneIds);

      expect(patternData).not.toBeNull();
      expect(patternData!.notes.length).toBe(3);
      expect(patternData!.beatLength).toBe(2); // maxBeat(4) - minBeat(2)

      // Offsets relative to minBeat=2 and minCol=1 (index of '2')
      const sorted = [...patternData!.notes].sort((a, b) => a.beatOffset - b.beatOffset);
      expect(sorted[0].beatOffset).toBe(0);
      expect(sorted[0].columnIndex).toBe(0); // '2' -> idx 1, minus minCol=1 -> 0
      expect(sorted[1].beatOffset).toBe(1);
      expect(sorted[1].columnIndex).toBe(2); // '4' -> idx 3, minus minCol=1 -> 2
      expect(sorted[2].beatOffset).toBe(2);
      expect(sorted[2].columnIndex).toBe(1); // '3' -> idx 2, minus minCol=1 -> 1
    });

    it('14. Apply pattern -> undo -> pattern removed', () => {
      initStoreWithNotes([], 1);

      const pattern: PatternTemplate = {
        id: 'test-chord',
        name: 'Test Chord',
        category: 'chord',
        tags: [],
        columnCount: 2,
        beatLength: 0.25,
        isBuiltIn: false,
        notes: [
          { beatOffset: 0, columnIndex: 0, noteType: 'playable' },
          { beatOffset: 0, columnIndex: 1, noteType: 'playable' },
        ],
      };

      const laneIds = ['1', '2', '3'];
      useEditorStore.getState().applyPattern(pattern, laneIds, 0, '1', '01');
      expect(useEditorStore.getState().notes.length).toBe(2);

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().notes.length).toBe(0);
    });
  });

  // === Measure operations ===

  describe('Measure operations', () => {
    it('15. Insert measure -> notes after shift point moved by 4 beats', () => {
      const notes = [
        makeNote(1, 0, '1'),   // measure 0
        makeNote(2, 2, '2'),   // measure 0
        makeNote(3, 4, '3'),   // measure 1
        makeNote(4, 8, '4'),   // measure 2
      ];
      initStoreWithNotes(notes, 5);

      useEditorStore.getState().insertMeasure(1);

      const state = useEditorStore.getState();
      // Notes before measure 1 (beat < 4) stay
      expect(state.notes.find((n) => n.id === 'note-1')!.beat).toBe(0);
      expect(state.notes.find((n) => n.id === 'note-2')!.beat).toBe(2);
      // Notes at/after measure 1 (beat >= 4) shift by +4
      expect(state.notes.find((n) => n.id === 'note-3')!.beat).toBe(8);
      expect(state.notes.find((n) => n.id === 'note-4')!.beat).toBe(12);
    });

    it('16. Delete measure -> notes in range removed, after shifted back', () => {
      const notes = [
        makeNote(1, 0, '1'),   // measure 0
        makeNote(2, 5, '2'),   // measure 1
        makeNote(3, 8, '3'),   // measure 2
      ];
      initStoreWithNotes(notes, 4);

      useEditorStore.getState().deleteMeasure(1);

      const state = useEditorStore.getState();
      // note-1 (beat 0): untouched
      expect(state.notes.find((n) => n.id === 'note-1')!.beat).toBe(0);
      // note-2 (beat 5): in measure 1 (beat 4-7.99) -> removed
      expect(state.notes.find((n) => n.id === 'note-2')).toBeUndefined();
      // note-3 (beat 8): after measure 1 -> shifted back by 4
      expect(state.notes.find((n) => n.id === 'note-3')!.beat).toBe(4);
    });
  });

  // === Header operations ===

  describe('Header operations', () => {
    it('17. changeHeader updates field', () => {
      initStoreWithNotes([]);

      useEditorStore.getState().changeHeader('title', 'New Title');
      expect(useEditorStore.getState().headers!.title).toBe('New Title');

      useEditorStore.getState().changeHeader('bpm', 200);
      expect(useEditorStore.getState().headers!.bpm).toBe(200);
    });

    it('18. updateHeadersWithWavDefs merges WAV map', () => {
      initStoreWithNotes([]);

      // Set initial WAV
      const headers = useEditorStore.getState().headers!;
      headers.wav.set('01', 'kick.wav');

      useEditorStore.getState().updateHeadersWithWavDefs({
        '02': 'snare.wav',
        '03': 'hihat.wav',
      });

      const state = useEditorStore.getState();
      expect(state.headers!.wav.get('01')).toBe('kick.wav');
      expect(state.headers!.wav.get('02')).toBe('snare.wav');
      expect(state.headers!.wav.get('03')).toBe('hihat.wav');
    });
  });

  // === Edge cases ===

  describe('Edge cases', () => {
    it('19. Operations on empty store are safe', () => {
      const store = useEditorStore.getState();

      // These should not throw
      expect(() => store.undo()).not.toThrow();
      expect(() => store.redo()).not.toThrow();
      expect(() => store.copy()).not.toThrow();
      expect(() => store.paste()).not.toThrow();
      expect(() => store.mirrorNotes(LANE_IDS)).not.toThrow();
      expect(() => store.flipNotes()).not.toThrow();
      expect(() => store.quantizeNotes()).not.toThrow();
      expect(() => store.deleteNotes([])).not.toThrow();
      expect(() => store.selectAll()).not.toThrow();
      expect(() => store.clearSelection()).not.toThrow();

      // State should remain consistent
      expect(useEditorStore.getState().notes.length).toBe(0);
    });

    it('20. Rapid sequential operations maintain consistency', () => {
      initStoreWithNotes([], 1);

      const store = useEditorStore.getState();

      // Rapidly add, select, transform, delete
      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().addNote({
          beat: i,
          measure: Math.floor(i / 4),
          fraction: (i % 4) / 4,
          column: LANE_IDS[i % LANE_IDS.length],
          keysound: '01',
          noteType: 'playable',
          channel: '11',
        });
      }

      expect(useEditorStore.getState().notes.length).toBe(20);

      // Select all and mirror
      useEditorStore.getState().selectAll();
      useEditorStore.getState().mirrorNotes(['1', '2', '3', '4', '5', '6', '7']);

      // Still 20 notes
      expect(useEditorStore.getState().notes.length).toBe(20);

      // Undo mirror
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().notes.length).toBe(20);

      // Delete all
      const allIds = useEditorStore.getState().notes.map((n) => n.id);
      useEditorStore.getState().deleteNotes(allIds);
      expect(useEditorStore.getState().notes.length).toBe(0);

      // Undo delete
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().notes.length).toBe(20);

      // Verify undo stack is consistent
      expect(useEditorStore.getState().undoStack.length).toBeGreaterThan(0);
    });
  });
});
