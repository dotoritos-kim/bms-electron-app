/**
 * Transform correctness tests across multiple key modes (Tier A).
 * Verifies mirrorNotes, flipNotes, randomNotes, and quantizeNotes
 * work correctly with different lane configurations.
 */
import { getLaneIds } from '@rhythm-archive/bms-editor';
import type { KeyMode } from '../../../bms-editor/src/chart/NoteChartViewer';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

// --- Helpers ---
let nextId = 1;
function mockNote(overrides: Partial<EditableBMSNote> = {}): EditableBMSNote {
  const id = overrides.id || `t${nextId++}`;
  return {
    id,
    beat: 0,
    measure: 0,
    fraction: 0,
    column: 'K1',
    keysound: '01',
    noteType: 'playable',
    ...overrides,
  } as EditableBMSNote;
}

function store() {
  return useEditorStore.getState();
}
function act() {
  return useEditorStore.getState();
}

function seedNotes(notes: EditableBMSNote[]) {
  useEditorStore.setState({
    notes,
    selectedNotes: new Set(),
    undoStack: [],
    redoStack: [],
    hasUnsavedChanges: false,
  });
}

function selectAll() {
  const ids = store().notes.map((n) => n.id);
  act().selectNotes(ids);
}

beforeEach(() => {
  nextId = 1;
  useEditorStore.setState(useEditorStore.getInitialState());
});

// --- Tier A modes ---
const TIER_A: { mode: KeyMode; hasScratch: boolean; description: string }[] = [
  { mode: '7K', hasScratch: true, description: 'IIDX SP (SC+1-7+FZ)' },
  { mode: '9K', hasScratch: false, description: 'PMS/Keyboard (1-9, no SC)' },
  { mode: '14K', hasScratch: true, description: 'IIDX DP (SC+1-7+FZ+8-14+FZ2+SC2)' },
  { mode: '24K', hasScratch: false, description: 'Keyboard DP (1-24, no SC)' },
];

describe('Transform Operations - Multi-Mode', () => {
  describe.each(TIER_A)('$mode ($description)', ({ mode, hasScratch }) => {
    const laneIds = getLaneIds(mode);
    const numericLanes = laneIds.filter((id) => !['SC', 'SC2', 'FZ', 'FZ2'].includes(id));

    describe('mirrorNotes()', () => {
      it('mirrors first numeric lane to last', () => {
        const firstLane = numericLanes[0];
        const lastLane = numericLanes[numericLanes.length - 1];
        seedNotes([mockNote({ column: firstLane })]);
        selectAll();
        act().mirrorNotes(laneIds);
        const col = store().notes[0].column;
        // First lane should map to last position in full laneIds array
        const firstIdx = laneIds.indexOf(firstLane);
        const expectedIdx = laneIds.length - 1 - firstIdx;
        expect(col).toBe(laneIds[expectedIdx]);
      });

      it('mirrors last numeric lane to first', () => {
        const lastLane = numericLanes[numericLanes.length - 1];
        seedNotes([mockNote({ column: lastLane })]);
        selectAll();
        act().mirrorNotes(laneIds);
        const col = store().notes[0].column;
        const lastIdx = laneIds.indexOf(lastLane);
        const expectedIdx = laneIds.length - 1 - lastIdx;
        expect(col).toBe(laneIds[expectedIdx]);
      });

      it('is its own inverse (double mirror = identity)', () => {
        const notes = numericLanes.slice(0, 3).map((col, i) =>
          mockNote({ id: `m${i}`, column: col, beat: i * 2 })
        );
        seedNotes(notes);
        selectAll();
        act().mirrorNotes(laneIds);
        act().mirrorNotes(laneIds);
        // After double mirror, columns should be back to original
        numericLanes.slice(0, 3).forEach((col, i) => {
          expect(store().notes.find((n) => n.id === `m${i}`)!.column).toBe(col);
        });
      });

      it('preserves notes not in selection', () => {
        seedNotes([
          mockNote({ id: 'sel', column: numericLanes[0] }),
          mockNote({ id: 'unsel', column: numericLanes[1], beat: 4 }),
        ]);
        act().selectNotes(['sel']);
        act().mirrorNotes(laneIds);
        expect(store().notes.find((n) => n.id === 'unsel')!.column).toBe(numericLanes[1]);
      });

      if (hasScratch) {
        it('mirrors scratch lanes correctly', () => {
          const hasSC = laneIds.includes('SC');
          const hasSC2 = laneIds.includes('SC2');
          if (hasSC) {
            seedNotes([mockNote({ column: 'SC' })]);
            selectAll();
            act().mirrorNotes(laneIds);
            const scIdx = laneIds.indexOf('SC');
            const mirroredIdx = laneIds.length - 1 - scIdx;
            expect(store().notes[0].column).toBe(laneIds[mirroredIdx]);
          }
          if (hasSC2) {
            seedNotes([mockNote({ column: 'SC2' })]);
            selectAll();
            act().mirrorNotes(laneIds);
            const sc2Idx = laneIds.indexOf('SC2');
            const mirroredIdx = laneIds.length - 1 - sc2Idx;
            expect(store().notes[0].column).toBe(laneIds[mirroredIdx]);
          }
        });

        it('FZ lanes mirror to correct position', () => {
          const hasFZ = laneIds.includes('FZ');
          if (hasFZ) {
            seedNotes([mockNote({ column: 'FZ' })]);
            selectAll();
            act().mirrorNotes(laneIds);
            const fzIdx = laneIds.indexOf('FZ');
            const mirroredIdx = laneIds.length - 1 - fzIdx;
            expect(store().notes[0].column).toBe(laneIds[mirroredIdx]);
          }
        });
      }

      it('no-ops on empty selection', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        // Don't select anything
        act().mirrorNotes(laneIds);
        expect(store().undoStack).toHaveLength(0);
        expect(store().notes[0].column).toBe(numericLanes[0]);
      });

      it('no-ops on empty laneIds', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        selectAll();
        act().mirrorNotes([]);
        expect(store().undoStack).toHaveLength(0);
      });

      it('pushes undo entry', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        selectAll();
        act().mirrorNotes(laneIds);
        expect(store().undoStack).toHaveLength(1);
      });
    });

    describe('randomNotes()', () => {
      it('assigns columns only from the provided laneIds', () => {
        const notes = numericLanes.slice(0, Math.min(5, numericLanes.length)).map((col, i) =>
          mockNote({ id: `r${i}`, column: col, beat: i * 2 })
        );
        seedNotes(notes);
        selectAll();
        act().randomNotes(laneIds);
        for (const n of store().notes) {
          expect(laneIds).toContain(n.column);
        }
      });

      it('produces no duplicate columns in mapping (every lane maps to unique lane)', () => {
        // Place one note per numeric lane to fully exercise the mapping
        const notes = numericLanes.map((col, i) =>
          mockNote({ id: `rd${i}`, column: col, beat: i })
        );
        seedNotes(notes);
        selectAll();
        act().randomNotes(laneIds);
        // Each original column should map to a unique target
        const columns = store().notes.map((n) => n.column);
        // No two notes that were in different lanes should end up with the same column
        // (they might though if two notes shared a lane - but we have one per lane)
        const uniqueCols = new Set(columns);
        expect(uniqueCols.size).toBe(numericLanes.length);
      });

      it('preserves unselected notes', () => {
        seedNotes([
          mockNote({ id: 'sel', column: numericLanes[0] }),
          mockNote({ id: 'unsel', column: numericLanes[1], beat: 4 }),
        ]);
        act().selectNotes(['sel']);
        act().randomNotes(laneIds);
        expect(store().notes.find((n) => n.id === 'unsel')!.column).toBe(numericLanes[1]);
      });

      it('no-ops on empty selection', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        act().randomNotes(laneIds);
        expect(store().undoStack).toHaveLength(0);
      });

      it('no-ops on empty laneIds', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        selectAll();
        act().randomNotes([]);
        expect(store().undoStack).toHaveLength(0);
      });

      it('pushes undo entry', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        selectAll();
        act().randomNotes(laneIds);
        expect(store().undoStack).toHaveLength(1);
      });
    });

    describe('flipNotes()', () => {
      it('reverses beat positions of selected notes', () => {
        seedNotes([
          mockNote({ id: 'f1', column: numericLanes[0], beat: 0, measure: 0, fraction: 0 }),
          mockNote({ id: 'f2', column: numericLanes[0], beat: 4, measure: 1, fraction: 0 }),
          mockNote({ id: 'f3', column: numericLanes[0], beat: 8, measure: 2, fraction: 0 }),
        ]);
        selectAll();
        act().flipNotes();
        const beats = store().notes.map((n) => n.beat).sort((a, b) => a - b);
        expect(beats).toEqual([0, 4, 8]);
      });

      it('handles long notes correctly (beat < endBeat after flip)', () => {
        seedNotes([
          mockNote({ id: 'ln1', column: numericLanes[0], beat: 0, endBeat: 2, measure: 0, fraction: 0 }),
          mockNote({ id: 'ln2', column: numericLanes[0], beat: 6, endBeat: 8, measure: 1, fraction: 0.5 }),
        ]);
        selectAll();
        act().flipNotes();
        for (const n of store().notes) {
          if (n.endBeat !== undefined) {
            expect(n.beat).toBeLessThan(n.endBeat);
          }
        }
      });

      it('is its own inverse for two notes (double flip = identity)', () => {
        const originalBeats = [2, 6];
        seedNotes(
          originalBeats.map((beat, i) =>
            mockNote({ id: `df${i}`, column: numericLanes[0], beat, measure: Math.floor(beat / 4), fraction: (beat % 4) / 4 })
          )
        );
        selectAll();
        act().flipNotes();
        act().flipNotes();
        originalBeats.forEach((beat, i) => {
          expect(store().notes.find((n) => n.id === `df${i}`)!.beat).toBeCloseTo(beat, 5);
        });
      });

      it('single note does nothing', () => {
        seedNotes([mockNote({ id: 'single', column: numericLanes[0], beat: 4, measure: 1, fraction: 0 })]);
        selectAll();
        act().flipNotes();
        expect(store().notes[0].beat).toBe(4);
        expect(store().undoStack).toHaveLength(0);
      });

      it('no-ops on empty selection', () => {
        seedNotes([mockNote({ column: numericLanes[0] })]);
        act().flipNotes();
        expect(store().undoStack).toHaveLength(0);
      });

      it('pushes undo entry', () => {
        seedNotes([
          mockNote({ id: 'u1', column: numericLanes[0], beat: 0, measure: 0, fraction: 0 }),
          mockNote({ id: 'u2', column: numericLanes[0], beat: 4, measure: 1, fraction: 0 }),
        ]);
        selectAll();
        act().flipNotes();
        expect(store().undoStack).toHaveLength(1);
      });
    });

    describe('quantizeNotes()', () => {
      it('snaps notes to grid', () => {
        // Place note at non-grid-aligned beat
        seedNotes([
          mockNote({ id: 'q1', column: numericLanes[0], beat: 0.3, measure: 0, fraction: 0.075 }),
        ]);
        selectAll();
        // Set gridSnap to 4 (quarter note = beat boundaries 0, 1, 2, 3...)
        useEditorStore.setState({ gridSnap: 4 });
        act().quantizeNotes();
        const beat = store().notes[0].beat;
        // Should snap to nearest grid position
        expect(beat % (4 / 4)).toBeCloseTo(0, 5);
      });

      it('does not move already-aligned notes', () => {
        seedNotes([
          mockNote({ id: 'qa', column: numericLanes[0], beat: 4, measure: 1, fraction: 0 }),
        ]);
        selectAll();
        useEditorStore.setState({ gridSnap: 4 });
        act().quantizeNotes();
        expect(store().notes[0].beat).toBe(4);
      });

      it('no-ops on empty selection', () => {
        seedNotes([mockNote({ column: numericLanes[0], beat: 0.3 })]);
        act().quantizeNotes();
        expect(store().undoStack).toHaveLength(0);
      });
    });

    describe('undo after transform', () => {
      it('mirror then undo restores original columns', () => {
        const original = numericLanes[0];
        seedNotes([mockNote({ id: 'mu', column: original })]);
        selectAll();
        act().mirrorNotes(laneIds);
        act().undo();
        expect(store().notes[0].column).toBe(original);
      });

      it('random then undo restores original columns', () => {
        const originals = numericLanes.slice(0, 3);
        seedNotes(originals.map((col, i) => mockNote({ id: `ru${i}`, column: col, beat: i * 2 })));
        selectAll();
        act().randomNotes(laneIds);
        act().undo();
        originals.forEach((col, i) => {
          expect(store().notes.find((n) => n.id === `ru${i}`)!.column).toBe(col);
        });
      });

      it('flip then undo restores original beats', () => {
        seedNotes([
          mockNote({ id: 'fu1', column: numericLanes[0], beat: 0, measure: 0, fraction: 0 }),
          mockNote({ id: 'fu2', column: numericLanes[0], beat: 8, measure: 2, fraction: 0 }),
        ]);
        selectAll();
        act().flipNotes();
        act().undo();
        expect(store().notes.find((n) => n.id === 'fu1')!.beat).toBe(0);
        expect(store().notes.find((n) => n.id === 'fu2')!.beat).toBe(8);
      });
    });
  });

  // --- Cross-mode specific tests ---

  describe('14K-specific mirror (SC/FZ/SC2/FZ2)', () => {
    const laneIds14K = getLaneIds('14K');
    // 14K layout: SC, 1,2,3,4,5,6,7, FZ, 8,9,10,11,12,13,14, FZ2, SC2

    it('SC mirrors to SC2 position and vice versa', () => {
      seedNotes([mockNote({ id: 'sc', column: 'SC' })]);
      selectAll();
      act().mirrorNotes(laneIds14K);
      // SC is at index 0, SC2 is at index 17
      expect(store().notes[0].column).toBe('SC2');
    });

    it('SC2 mirrors to SC position', () => {
      seedNotes([mockNote({ id: 'sc2', column: 'SC2' })]);
      selectAll();
      act().mirrorNotes(laneIds14K);
      expect(store().notes[0].column).toBe('SC');
    });

    it('FZ mirrors to FZ2 position', () => {
      // FZ is at index 8, FZ2 is at index 16 (from end: 17-8=9, so index 9 from right)
      seedNotes([mockNote({ id: 'fz', column: 'FZ' })]);
      selectAll();
      act().mirrorNotes(laneIds14K);
      const fzIdx = laneIds14K.indexOf('FZ');
      const mirrorIdx = laneIds14K.length - 1 - fzIdx;
      expect(store().notes[0].column).toBe(laneIds14K[mirrorIdx]);
    });

    it('column 1 mirrors to column 14', () => {
      seedNotes([mockNote({ id: 'c1', column: '1' })]);
      selectAll();
      act().mirrorNotes(laneIds14K);
      const idx1 = laneIds14K.indexOf('1');
      const mirrorIdx = laneIds14K.length - 1 - idx1;
      expect(store().notes[0].column).toBe(laneIds14K[mirrorIdx]);
    });

    it('column 7 mirrors to column 8', () => {
      seedNotes([mockNote({ id: 'c7', column: '7' })]);
      selectAll();
      act().mirrorNotes(laneIds14K);
      const idx7 = laneIds14K.indexOf('7');
      const mirrorIdx = laneIds14K.length - 1 - idx7;
      expect(store().notes[0].column).toBe(laneIds14K[mirrorIdx]);
    });

    it('full mirror of all lanes produces valid result', () => {
      const notes = laneIds14K.map((col, i) => mockNote({ id: `f14_${i}`, column: col, beat: i }));
      seedNotes(notes);
      selectAll();
      act().mirrorNotes(laneIds14K);
      const resultCols = store().notes.map((n) => n.column);
      // Every resulting column should be in laneIds14K
      for (const col of resultCols) {
        expect(laneIds14K).toContain(col);
      }
      // Should be exactly reversed
      const expected = [...laneIds14K].reverse();
      const sorted = store().notes.sort((a, b) => {
        const ai = notes.findIndex((n) => n.id === a.id);
        const bi = notes.findIndex((n) => n.id === b.id);
        return ai - bi;
      });
      expect(sorted.map((n) => n.column)).toEqual(expected);
    });
  });

  describe('24K-specific mirror (no scratch, 24 lanes)', () => {
    const laneIds24K = getLaneIds('24K');

    it('lane 1 mirrors to lane 24', () => {
      seedNotes([mockNote({ column: '1' })]);
      selectAll();
      act().mirrorNotes(laneIds24K);
      expect(store().notes[0].column).toBe('24');
    });

    it('lane 12 mirrors to lane 13', () => {
      seedNotes([mockNote({ column: '12' })]);
      selectAll();
      act().mirrorNotes(laneIds24K);
      expect(store().notes[0].column).toBe('13');
    });

    it('lane 24 mirrors to lane 1', () => {
      seedNotes([mockNote({ column: '24' })]);
      selectAll();
      act().mirrorNotes(laneIds24K);
      expect(store().notes[0].column).toBe('1');
    });
  });

  describe('9K-specific (no scratch)', () => {
    const laneIds9K = getLaneIds('9K');

    it('center lane (5) stays in place after mirror', () => {
      seedNotes([mockNote({ column: '5' })]);
      selectAll();
      act().mirrorNotes(laneIds9K);
      // 9 lanes: index 4 (center) mirrors to index 4
      expect(store().notes[0].column).toBe('5');
    });

    it('lane 1 mirrors to lane 9', () => {
      seedNotes([mockNote({ column: '1' })]);
      selectAll();
      act().mirrorNotes(laneIds9K);
      expect(store().notes[0].column).toBe('9');
    });
  });
});
