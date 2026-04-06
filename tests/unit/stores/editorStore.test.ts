import { useEditorStore } from '../../../src/renderer/stores/editorStore';

// --- Helpers ---

const mockNote = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-1',
  beat: 0,
  column: 'K1',
  noteType: 'playable' as const,
  keysound: '01',
  measure: 0,
  fraction: 0,
  channel: '11',
  ...overrides,
});

const mockLN = (overrides: Record<string, unknown> = {}) => ({
  ...mockNote({ noteType: 'long' as const }),
  endBeat: 4,
  ...overrides,
});

const mockBpmChange = (overrides: Record<string, unknown> = {}) => ({
  measure: 0,
  fraction: 0,
  bpm: 120,
  ...overrides,
});

const mockStopEvent = (overrides: Record<string, unknown> = {}) => ({
  measure: 0,
  fraction: 0,
  duration: 48,
  ...overrides,
});

const mockHeaders = (overrides: Record<string, unknown> = {}) => ({
  player: 1,
  genre: 'Test',
  title: 'Test Song',
  artist: 'Tester',
  bpm: 120,
  playlevel: '5',
  rank: 3,
  total: 300,
  wav: new Map<string, string>([['01', 'kick.wav']]),
  bmp: new Map<string, string>(),
  ...overrides,
});

const mockChart = (overrides: Record<string, unknown> = {}) => ({
  headers: mockHeaders(),
  notes: [],
  bpmChanges: [mockBpmChange()],
  stopEvents: [],
  timeSignatures: new Map<number, number>(),
  bgaEvents: [],
  ...overrides,
});

const laneIds = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];

const act = useEditorStore.getState;
const store = () => useEditorStore.getState();

/** Seed the store with notes directly via initFromChart */
function seedNotes(notes: ReturnType<typeof mockNote>[], nextId = 100) {
  const chart = mockChart({ notes });
  useEditorStore.getState().initFromChart(chart as any, notes as any, nextId);
}

// --- Tests ---

beforeEach(() => {
  useEditorStore.getState().reset();
});

// ============================================================
// beatToMF (tested indirectly through addNote)
// ============================================================
describe('beatToMF (via addNote)', () => {
  it('should set measure=0, fraction=0 for beat=0', () => {
    act().addNote(mockNote({ id: undefined, beat: 0 }) as any);
    const n = store().notes[0];
    expect(n.measure).toBe(0);
    expect(n.fraction).toBe(0);
  });

  it('should set measure=1, fraction=0 for beat=4', () => {
    act().addNote(mockNote({ id: undefined, beat: 4 }) as any);
    const n = store().notes[0];
    expect(n.measure).toBe(1);
    expect(n.fraction).toBe(0);
  });

  it('should set measure=0, fraction=0.5 for beat=2', () => {
    act().addNote(mockNote({ id: undefined, beat: 2 }) as any);
    const n = store().notes[0];
    expect(n.measure).toBe(0);
    expect(n.fraction).toBe(0.5);
  });

  it('should set measure=2, fraction=0.25 for beat=9', () => {
    act().addNote(mockNote({ id: undefined, beat: 9 }) as any);
    const n = store().notes[0];
    expect(n.measure).toBe(2);
    expect(n.fraction).toBe(0.25);
  });
});

// ============================================================
// Initialization
// ============================================================
describe('Initialization', () => {
  describe('reset()', () => {
    it('should restore all state to initial values', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      act().setCurrentBeat(8);
      act().setActiveTool('pen' as any);
      act().reset();
      expect(store().notes).toEqual([]);
      expect(store().currentBeat).toBe(0);
      expect(store().activeTool).toBe('select');
      expect(store().nextNoteId).toBe(1);
    });

    it('should clear undo and redo stacks', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      act().reset();
      expect(store().undoStack).toEqual([]);
      expect(store().redoStack).toEqual([]);
    });

    it('should reset selectedNotes to empty Set', () => {
      act().reset();
      expect(store().selectedNotes.size).toBe(0);
    });

    it('should reset timeSignatures to empty Map', () => {
      act().reset();
      expect(store().timeSignatures.size).toBe(0);
    });
  });

  describe('initFromChart()', () => {
    it('should set chart data from provided chart', () => {
      const chart = mockChart();
      act().initFromChart(chart as any, [] as any, 10);
      expect(store().editableChart).toBe(chart);
      expect(store().bpmChanges).toEqual(chart.bpmChanges);
      expect(store().headers).toBe(chart.headers);
      expect(store().nextNoteId).toBe(10);
    });

    it('should set raw notes', () => {
      const notes = [mockNote(), mockNote({ id: 'note-2', beat: 4 })];
      act().initFromChart(mockChart() as any, notes as any, 5);
      expect(store().notes).toHaveLength(2);
    });

    it('should clear undo/redo stacks', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      act().initFromChart(mockChart() as any, [] as any, 1);
      expect(store().undoStack).toEqual([]);
      expect(store().redoStack).toEqual([]);
    });

    it('should set hasUnsavedChanges to false', () => {
      act().setHasUnsavedChanges(true);
      act().initFromChart(mockChart() as any, [] as any, 1);
      expect(store().hasUnsavedChanges).toBe(false);
    });

    it('should clear selection', () => {
      act().initFromChart(mockChart() as any, [] as any, 1);
      expect(store().selectedNotes.size).toBe(0);
    });
  });
});

// ============================================================
// Undo / Redo
// ============================================================
describe('Undo / Redo', () => {
  describe('pushUndo()', () => {
    it('should push current state to undoStack', () => {
      seedNotes([mockNote()]);
      act().pushUndo('test');
      expect(store().undoStack).toHaveLength(1);
      expect(store().undoStack[0].description).toBe('test');
      expect(store().undoStack[0].notes).toHaveLength(1);
    });

    it('should clear redoStack', () => {
      seedNotes([mockNote()]);
      // Manually produce a redo entry
      act().addNote(mockNote({ id: undefined, beat: 1 }) as any);
      act().undo();
      expect(store().redoStack.length).toBeGreaterThan(0);
      act().pushUndo('new action');
      expect(store().redoStack).toEqual([]);
    });

    it('should limit undoStack to 50 entries', () => {
      seedNotes([]);
      for (let i = 0; i < 55; i++) {
        act().pushUndo(`action-${i}`);
      }
      expect(store().undoStack.length).toBeLessThanOrEqual(51); // slice(-50) + 1 current push
    });
  });

  describe('undo()', () => {
    it('should restore previous state', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined, beat: 8, column: 'K2' }) as any);
      expect(store().notes).toHaveLength(2);
      act().undo();
      expect(store().notes).toHaveLength(1);
    });

    it('should push current state to redoStack', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined, beat: 8 }) as any);
      act().undo();
      expect(store().redoStack).toHaveLength(1);
    });

    it('should do nothing when undoStack is empty', () => {
      seedNotes([mockNote()]);
      const before = store().notes;
      act().undo();
      expect(store().notes).toBe(before);
    });

    it('should set hasUnsavedChanges to true', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined }) as any);
      act().setHasUnsavedChanges(false);
      act().undo();
      expect(store().hasUnsavedChanges).toBe(true);
    });
  });

  describe('redo()', () => {
    it('should restore undone state', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined, beat: 8 }) as any);
      act().undo();
      expect(store().notes).toHaveLength(1);
      act().redo();
      expect(store().notes).toHaveLength(2);
    });

    it('should push current state to undoStack', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined }) as any);
      act().undo();
      const undoBefore = store().undoStack.length;
      act().redo();
      expect(store().undoStack.length).toBe(undoBefore + 1);
    });

    it('should do nothing when redoStack is empty', () => {
      seedNotes([mockNote()]);
      const before = store().notes;
      act().redo();
      expect(store().notes).toBe(before);
    });

    it('should set hasUnsavedChanges to true', () => {
      seedNotes([mockNote()]);
      act().addNote(mockNote({ id: undefined }) as any);
      act().undo();
      act().setHasUnsavedChanges(false);
      act().redo();
      expect(store().hasUnsavedChanges).toBe(true);
    });
  });
});

// ============================================================
// Notes CRUD
// ============================================================
describe('Notes CRUD', () => {
  describe('addNote()', () => {
    it('should add a note with auto-generated id', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      expect(store().notes).toHaveLength(1);
      expect(store().notes[0].id).toBe('note-1');
    });

    it('should increment nextNoteId', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      expect(store().nextNoteId).toBe(2);
    });

    it('should calculate measure and fraction', () => {
      act().addNote(mockNote({ id: undefined, beat: 6 }) as any);
      const n = store().notes[0];
      expect(n.measure).toBe(1);
      expect(n.fraction).toBe(0.5);
    });

    it('should push undo entry', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      expect(store().undoStack).toHaveLength(1);
    });

    it('should mark hasUnsavedChanges', () => {
      act().addNote(mockNote({ id: undefined }) as any);
      expect(store().hasUnsavedChanges).toBe(true);
    });
  });

  describe('deleteNotes()', () => {
    it('should remove specified notes', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2', beat: 2 })]);
      act().deleteNotes(['n1']);
      expect(store().notes).toHaveLength(1);
      expect(store().notes[0].id).toBe('n2');
    });

    it('should clear selection', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().deleteNotes(['n1']);
      expect(store().selectedNotes.size).toBe(0);
    });

    it('should handle deleting multiple notes', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' }), mockNote({ id: 'n3' })]);
      act().deleteNotes(['n1', 'n3']);
      expect(store().notes).toHaveLength(1);
      expect(store().notes[0].id).toBe('n2');
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().deleteNotes(['n1']);
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('moveNotes()', () => {
    it('should shift beat by delta', () => {
      seedNotes([mockNote({ id: 'n1', beat: 2, measure: 0, fraction: 0.5 })]);
      act().moveNotes(['n1'], { beat: 2 }, laneIds);
      expect(store().notes[0].beat).toBe(4);
    });

    it('should clamp beat to 0 minimum', () => {
      seedNotes([mockNote({ id: 'n1', beat: 1 })]);
      act().moveNotes(['n1'], { beat: -5 }, laneIds);
      expect(store().notes[0].beat).toBe(0);
    });

    it('should shift column by columnDelta', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K3' })]);
      act().moveNotes(['n1'], { columnDelta: 2 }, laneIds);
      expect(store().notes[0].column).toBe('K5');
    });

    it('should clamp column index to valid range', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K6' })]);
      act().moveNotes(['n1'], { columnDelta: 10 }, laneIds);
      expect(store().notes[0].column).toBe('K7');
    });

    it('should clamp column index at 0', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K2' })]);
      act().moveNotes(['n1'], { columnDelta: -10 }, laneIds);
      expect(store().notes[0].column).toBe('K1');
    });

    it('should update endBeat for long notes', () => {
      seedNotes([mockLN({ id: 'n1', beat: 0, endBeat: 4 })]);
      act().moveNotes(['n1'], { beat: 2 }, laneIds);
      expect(store().notes[0].endBeat).toBe(6);
    });

    it('should not affect unselected notes', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 }), mockNote({ id: 'n2', beat: 8 })]);
      act().moveNotes(['n1'], { beat: 4 }, laneIds);
      expect(store().notes[1].beat).toBe(8);
    });

    it('should update measure/fraction after move', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 })]);
      act().moveNotes(['n1'], { beat: 5 }, laneIds);
      expect(store().notes[0].measure).toBe(1);
      expect(store().notes[0].fraction).toBe(0.25);
    });
  });

  describe('selectNotes()', () => {
    it('should replace selection when not additive', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1']);
      act().selectNotes(['n2']);
      expect(store().selectedNotes.size).toBe(1);
      expect(store().selectedNotes.has('n2')).toBe(true);
    });

    it('should add to selection when additive', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1']);
      act().selectNotes(['n2'], true);
      expect(store().selectedNotes.size).toBe(2);
    });

    it('should toggle off already-selected notes when additive', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1', 'n2']);
      act().selectNotes(['n1'], true);
      expect(store().selectedNotes.size).toBe(1);
      expect(store().selectedNotes.has('n2')).toBe(true);
    });

    it('should handle empty noteIds', () => {
      act().selectNotes([]);
      expect(store().selectedNotes.size).toBe(0);
    });
  });

  describe('updateNote()', () => {
    it('should update specified fields', () => {
      seedNotes([mockNote({ id: 'n1', keysound: '01' })]);
      act().updateNote('n1', { keysound: '02' });
      expect(store().notes[0].keysound).toBe('02');
    });

    it('should recalculate measure/fraction when beat changes', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 })]);
      act().updateNote('n1', { beat: 7 });
      expect(store().notes[0].measure).toBe(1);
      expect(store().notes[0].fraction).toBe(0.75);
    });

    it('should not recalculate measure/fraction when beat not changed', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0, measure: 0, fraction: 0 })]);
      act().updateNote('n1', { keysound: '05' });
      expect(store().notes[0].measure).toBe(0);
      expect(store().notes[0].fraction).toBe(0);
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().updateNote('n1', { keysound: '02' });
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('selectAll()', () => {
    it('should select all notes', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' }), mockNote({ id: 'n3' })]);
      act().selectAll();
      expect(store().selectedNotes.size).toBe(3);
    });

    it('should work with empty notes', () => {
      seedNotes([]);
      act().selectAll();
      expect(store().selectedNotes.size).toBe(0);
    });
  });

  describe('clearSelection()', () => {
    it('should clear all selected notes', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().clearSelection();
      expect(store().selectedNotes.size).toBe(0);
    });
  });

  describe('changeNoteType()', () => {
    it('should change type of selected notes', () => {
      seedNotes([mockNote({ id: 'n1', noteType: 'playable' }), mockNote({ id: 'n2', noteType: 'playable' })]);
      act().selectNotes(['n1']);
      act().changeNoteType('invisible' as any);
      expect(store().notes[0].noteType).toBe('invisible');
      expect(store().notes[1].noteType).toBe('playable');
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().changeNoteType('invisible' as any);
      expect(store().notes[0].noteType).toBe('playable');
      expect(store().undoStack).toHaveLength(0);
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().changeNoteType('invisible' as any);
      expect(store().undoStack).toHaveLength(1);
    });
  });
});

// ============================================================
// Measure Management
// ============================================================
describe('Measure Management', () => {
  describe('insertMeasure()', () => {
    it('should shift notes after insertion point by 4 beats', () => {
      seedNotes([mockNote({ id: 'n1', beat: 8, measure: 2, fraction: 0 })]);
      act().insertMeasure(1); // insert at measure 1, shiftBeat=4
      expect(store().notes[0].beat).toBe(12);
      expect(store().notes[0].measure).toBe(3);
    });

    it('should not shift notes before insertion point', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 })]);
      act().insertMeasure(1);
      expect(store().notes[0].beat).toBe(0);
    });

    it('should shift LN endBeat that crosses insertion point', () => {
      seedNotes([mockLN({ id: 'n1', beat: 2, endBeat: 6 })]);
      act().insertMeasure(1); // shiftBeat=4, beat<4 but endBeat>=4
      expect(store().notes[0].beat).toBe(2);
      expect(store().notes[0].endBeat).toBe(10);
    });

    it('should shift bpmChanges after insertion point', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 2, fraction: 0, bpm: 150 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().insertMeasure(1);
      expect(store().bpmChanges[0].measure).toBe(3);
    });

    it('should not shift bpmChanges before insertion point', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 0, fraction: 0 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().insertMeasure(1);
      expect(store().bpmChanges[0].measure).toBe(0);
    });

    it('should shift stopEvents after insertion point', () => {
      const chart = mockChart({ stopEvents: [mockStopEvent({ measure: 2, fraction: 0.5 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().insertMeasure(1);
      expect(store().stopEvents[0].measure).toBe(3);
      expect(store().stopEvents[0].fraction).toBe(0.5);
    });

    it('should push undo entry', () => {
      seedNotes([]);
      act().insertMeasure(0);
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('deleteMeasure()', () => {
    it('should remove notes within the deleted measure', () => {
      seedNotes([mockNote({ id: 'n1', beat: 4, measure: 1, fraction: 0 }), mockNote({ id: 'n2', beat: 6, measure: 1, fraction: 0.5 })]);
      act().deleteMeasure(1); // removes beats [4,8)
      expect(store().notes).toHaveLength(0);
    });

    it('should shift notes after deleted measure by -4', () => {
      seedNotes([mockNote({ id: 'n1', beat: 8, measure: 2, fraction: 0 })]);
      act().deleteMeasure(1);
      expect(store().notes[0].beat).toBe(4);
      expect(store().notes[0].measure).toBe(1);
    });

    it('should not affect notes before deleted measure', () => {
      seedNotes([mockNote({ id: 'n1', beat: 2 })]);
      act().deleteMeasure(1);
      expect(store().notes[0].beat).toBe(2);
    });

    it('should truncate LN endBeat that falls inside deleted measure', () => {
      seedNotes([mockLN({ id: 'n1', beat: 2, endBeat: 6 })]);
      act().deleteMeasure(1); // deletes [4,8)
      expect(store().notes[0].endBeat).toBe(4); // truncated to startBeat
    });

    it('should shift LN endBeat that extends past deleted measure', () => {
      seedNotes([mockLN({ id: 'n1', beat: 2, endBeat: 10 })]);
      act().deleteMeasure(1);
      expect(store().notes[0].endBeat).toBe(6); // 10 - 4
    });

    it('should filter out bpmChanges in deleted measure', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 1, fraction: 0.25 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().deleteMeasure(1);
      expect(store().bpmChanges).toHaveLength(0);
    });

    it('should shift bpmChanges after deleted measure', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 3, fraction: 0 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().deleteMeasure(1);
      expect(store().bpmChanges[0].measure).toBe(2);
    });

    it('should filter out stopEvents in deleted measure', () => {
      const chart = mockChart({ stopEvents: [mockStopEvent({ measure: 1, fraction: 0 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().deleteMeasure(1);
      expect(store().stopEvents).toHaveLength(0);
    });
  });
});

// ============================================================
// Transform Operations
// ============================================================
describe('Transform Operations', () => {
  describe('mirrorNotes()', () => {
    it('should reverse column positions of selected notes', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K1' }), mockNote({ id: 'n2', column: 'K3' })]);
      act().selectNotes(['n1', 'n2']);
      act().mirrorNotes(laneIds);
      const cols = store().notes.map((n) => n.column);
      expect(cols).toContain('K7'); // K1 -> K7
      expect(cols).toContain('K5'); // K3 -> K5
    });

    it('should not affect unselected notes', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K1' }), mockNote({ id: 'n2', column: 'K2' })]);
      act().selectNotes(['n1']);
      act().mirrorNotes(laneIds);
      expect(store().notes.find((n) => n.id === 'n2')!.column).toBe('K2');
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K1' })]);
      act().mirrorNotes(laneIds);
      expect(store().notes[0].column).toBe('K1');
      expect(store().undoStack).toHaveLength(0);
    });

    it('should do nothing when laneIds is empty', () => {
      seedNotes([mockNote({ id: 'n1', column: 'K1' })]);
      act().selectNotes(['n1']);
      act().mirrorNotes([]);
      expect(store().notes[0].column).toBe('K1');
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().mirrorNotes(laneIds);
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('flipNotes()', () => {
    it('should flip note positions in time axis', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 0 }),
        mockNote({ id: 'n2', beat: 4 }),
        mockNote({ id: 'n3', beat: 8 }),
      ]);
      act().selectNotes(['n1', 'n2', 'n3']);
      act().flipNotes();
      const beats = store().notes.map((n) => n.beat).sort((a, b) => a - b);
      expect(beats).toEqual([0, 4, 8]); // 8-(0-0)=8, 8-(4-0)=4, 8-(8-0)=0
    });

    it('should swap beat and endBeat for LN and ensure beat < endBeat', () => {
      seedNotes([
        mockLN({ id: 'n1', beat: 0, endBeat: 2 }),
        mockNote({ id: 'n2', beat: 4 }),
      ]);
      act().selectNotes(['n1', 'n2']);
      act().flipNotes();
      const ln = store().notes.find((n) => n.id === 'n1')!;
      expect(ln.beat).toBeLessThan(ln.endBeat!);
    });

    it('should do nothing when fewer than 2 notes selected', () => {
      seedNotes([mockNote({ id: 'n1', beat: 4 })]);
      act().selectNotes(['n1']);
      act().flipNotes();
      expect(store().notes[0].beat).toBe(4);
    });

    it('should do nothing when no selection', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().flipNotes();
      expect(store().undoStack).toHaveLength(0);
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 }), mockNote({ id: 'n2', beat: 4 })]);
      act().selectNotes(['n1', 'n2']);
      act().flipNotes();
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('randomNotes()', () => {
    it('should shuffle column assignments', () => {
      // Use a deterministic mock for Math.random
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = () => {
        callCount++;
        return 0.1; // deterministic
      };
      try {
        seedNotes([
          mockNote({ id: 'n1', column: 'K1' }),
          mockNote({ id: 'n2', column: 'K2' }),
        ]);
        act().selectNotes(['n1', 'n2']);
        act().randomNotes(laneIds);
        // We can't predict exact output with mock, but columns should be from laneIds
        for (const n of store().notes) {
          expect(laneIds).toContain(n.column);
        }
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should not affect unselected notes', () => {
      const originalRandom = Math.random;
      Math.random = () => 0.5;
      try {
        seedNotes([mockNote({ id: 'n1', column: 'K1' }), mockNote({ id: 'n2', column: 'K2' })]);
        act().selectNotes(['n1']);
        act().randomNotes(laneIds);
        expect(store().notes.find((n) => n.id === 'n2')!.column).toBe('K2');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().randomNotes(laneIds);
      expect(store().undoStack).toHaveLength(0);
    });

    it('should do nothing when laneIds is empty', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().randomNotes([]);
      expect(store().undoStack).toHaveLength(0);
    });
  });

  describe('quantizeNotes()', () => {
    it('should snap beats to grid', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0.3 })]);
      act().selectNotes(['n1']);
      act().setGridSnap(4 as any); // quarter note: gridStep=1
      act().quantizeNotes();
      expect(store().notes[0].beat).toBe(0); // round(0.3/1)*1=0
    });

    it('should snap to 16th grid', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0.13 })]);
      act().selectNotes(['n1']);
      act().setGridSnap(16 as any); // gridStep = 0.25
      act().quantizeNotes();
      expect(store().notes[0].beat).toBeCloseTo(0.25); // round(0.13/0.25)*0.25 = round(0.52)*0.25 = 0.25
    });

    it('should prevent LN collapse', () => {
      seedNotes([mockLN({ id: 'n1', beat: 0.1, endBeat: 0.2 })]);
      act().selectNotes(['n1']);
      act().setGridSnap(4 as any); // gridStep=1
      act().quantizeNotes();
      const n = store().notes[0];
      // Both would snap to 0, but endBeat must be > beat
      expect(n.endBeat).toBeGreaterThan(n.beat);
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0.3 })]);
      act().quantizeNotes();
      expect(store().notes[0].beat).toBe(0.3);
    });

    it('should update measure/fraction', () => {
      seedNotes([mockNote({ id: 'n1', beat: 3.9 })]);
      act().selectNotes(['n1']);
      act().setGridSnap(4 as any);
      act().quantizeNotes();
      expect(store().notes[0].measure).toBe(1); // beat=4
      expect(store().notes[0].fraction).toBe(0);
    });
  });
});

// ============================================================
// Keysound Layers
// ============================================================
describe('Keysound Layers', () => {
  describe('addKeysoundLayer()', () => {
    it('should add a keysound layer to a note', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().addKeysoundLayer('n1', '02', 'invisible');
      const n = store().notes[0];
      expect(n.additionalKeysounds).toHaveLength(1);
      expect(n.additionalKeysounds![0]).toEqual({ keysound: '02', type: 'invisible' });
    });

    it('should append to existing layers', () => {
      seedNotes([mockNote({ id: 'n1', additionalKeysounds: [{ keysound: '02', type: 'bgm' }] })]);
      act().addKeysoundLayer('n1', '03', 'invisible');
      expect(store().notes[0].additionalKeysounds).toHaveLength(2);
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().addKeysoundLayer('n1', '02', 'bgm');
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('removeKeysoundLayer()', () => {
    it('should remove layer at specified index', () => {
      seedNotes([mockNote({ id: 'n1', additionalKeysounds: [{ keysound: '02', type: 'bgm' }, { keysound: '03', type: 'invisible' }] })]);
      act().removeKeysoundLayer('n1', 0);
      expect(store().notes[0].additionalKeysounds).toHaveLength(1);
      expect(store().notes[0].additionalKeysounds![0].keysound).toBe('03');
    });

    it('should set additionalKeysounds to undefined when last layer removed', () => {
      seedNotes([mockNote({ id: 'n1', additionalKeysounds: [{ keysound: '02', type: 'bgm' }] })]);
      act().removeKeysoundLayer('n1', 0);
      expect(store().notes[0].additionalKeysounds).toBeUndefined();
    });

    it('should push undo entry', () => {
      seedNotes([mockNote({ id: 'n1', additionalKeysounds: [{ keysound: '02', type: 'bgm' }] })]);
      act().removeKeysoundLayer('n1', 0);
      expect(store().undoStack).toHaveLength(1);
    });
  });
});

// ============================================================
// Clipboard
// ============================================================
describe('Clipboard', () => {
  describe('copy()', () => {
    it('should copy selected notes to clipboard', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1']);
      act().copy();
      expect(store().clipboard).toHaveLength(1);
      expect(store().clipboard[0].id).toBe('n1');
    });

    it('should deep copy notes (not references)', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().copy();
      expect(store().clipboard[0]).not.toBe(store().notes[0]);
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().copy();
      expect(store().clipboard).toHaveLength(0);
    });
  });

  describe('cut()', () => {
    it('should copy notes and remove them', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1']);
      act().cut();
      expect(store().clipboard).toHaveLength(1);
      expect(store().notes).toHaveLength(1);
      expect(store().notes[0].id).toBe('n2');
    });

    it('should clear selection', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().selectNotes(['n1']);
      act().cut();
      expect(store().selectedNotes.size).toBe(0);
    });

    it('should do nothing when no notes selected', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().cut();
      expect(store().notes).toHaveLength(1);
    });
  });

  describe('paste()', () => {
    it('should paste clipboard notes at currentBeat with new IDs', () => {
      seedNotes([mockNote({ id: 'n1', beat: 0 })]);
      act().selectNotes(['n1']);
      act().copy();
      act().setCurrentBeat(8);
      act().paste();
      expect(store().notes).toHaveLength(2);
      const pasted = store().notes[1];
      expect(pasted.beat).toBe(8);
      expect(pasted.id).toMatch(/^note-/);
      expect(pasted.id).not.toBe('n1');
    });

    it('should offset multiple pasted notes correctly', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 2 }),
        mockNote({ id: 'n2', beat: 6 }),
      ]);
      act().selectNotes(['n1', 'n2']);
      act().copy();
      act().setCurrentBeat(10);
      act().paste();
      const pasted = store().notes.slice(2);
      expect(pasted[0].beat).toBe(10); // minBeat was 2, offset=8
      expect(pasted[1].beat).toBe(14);
    });

    it('should clamp negative beats', () => {
      seedNotes([mockNote({ id: 'n1', beat: 4 }), mockNote({ id: 'n2', beat: 8 })]);
      act().selectNotes(['n1', 'n2']);
      act().copy();
      act().setCurrentBeat(0);
      act().paste();
      // offset = max(-4, 0-4) = max(-4, -4) = -4, but clamp ensures no negative
      // Actually offset = max(-minBeat, currentBeat - minBeat) = max(-4, -4) = -4
      // That means beat 4 + (-4) = 0, beat 8 + (-4) = 4
      const pasted = store().notes.slice(2);
      expect(pasted[0].beat).toBeGreaterThanOrEqual(0);
    });

    it('should do nothing when clipboard is empty', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      act().paste();
      expect(store().notes).toHaveLength(1);
    });

    it('should paste LN endBeats with offset', () => {
      seedNotes([mockLN({ id: 'n1', beat: 0, endBeat: 4 })]);
      act().selectNotes(['n1']);
      act().copy();
      act().setCurrentBeat(8);
      act().paste();
      const pasted = store().notes[1];
      expect(pasted.endBeat).toBe(12);
    });

    it('should increment nextNoteId for each pasted note', () => {
      seedNotes([mockNote({ id: 'n1' }), mockNote({ id: 'n2' })]);
      act().selectNotes(['n1', 'n2']);
      act().copy();
      const before = store().nextNoteId;
      act().paste();
      expect(store().nextNoteId).toBe(before + 2);
    });
  });
});

// ============================================================
// BPM / STOP
// ============================================================
describe('BPM / STOP', () => {
  describe('changeBpm()', () => {
    it('should add a new BPM change', () => {
      seedNotes([]);
      act().changeBpm(0, 150);
      expect(store().bpmChanges).toContainEqual(expect.objectContaining({ bpm: 150, measure: 0, fraction: 0 }));
    });

    it('should update existing BPM change at same position', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 0, fraction: 0, bpm: 120 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().changeBpm(0, 180);
      expect(store().bpmChanges).toHaveLength(1);
      expect(store().bpmChanges[0].bpm).toBe(180);
    });

    it('should push undo entry', () => {
      seedNotes([]);
      act().changeBpm(0, 120);
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('requestBpmAdd()', () => {
    it('should set inputDialog with bpm-add type', () => {
      act().requestBpmAdd(4);
      expect(store().inputDialog).toEqual({ type: 'bpm-add', defaultValue: '120', beat: 4 });
    });
  });

  describe('requestBpmEdit()', () => {
    it('should set inputDialog with bpm-edit type', () => {
      const bpm = mockBpmChange({ bpm: 140 });
      act().requestBpmEdit(bpm as any);
      expect(store().inputDialog?.type).toBe('bpm-edit');
      expect(store().inputDialog?.defaultValue).toBe('140');
    });
  });

  describe('requestStopAdd()', () => {
    it('should set inputDialog with stop-add type', () => {
      act().requestStopAdd(8);
      expect(store().inputDialog).toEqual({ type: 'stop-add', defaultValue: '48', beat: 8 });
    });
  });

  describe('requestStopEdit()', () => {
    it('should set inputDialog with stop-edit type', () => {
      const stop = mockStopEvent({ duration: 96 });
      act().requestStopEdit(stop as any);
      expect(store().inputDialog?.type).toBe('stop-edit');
      expect(store().inputDialog?.defaultValue).toBe('96');
    });
  });

  describe('submitInputDialog()', () => {
    it('should add BPM via bpm-add dialog', () => {
      act().requestBpmAdd(4);
      act().submitInputDialog('150');
      expect(store().bpmChanges).toContainEqual(expect.objectContaining({ bpm: 150 }));
      expect(store().inputDialog).toBeNull();
    });

    it('should reject non-positive BPM for bpm-add', () => {
      // Init with no existing BPM changes
      const chart = mockChart({ bpmChanges: [] });
      act().initFromChart(chart as any, [] as any, 1);
      act().requestBpmAdd(0);
      act().submitInputDialog('0');
      expect(store().bpmChanges).toHaveLength(0);
    });

    it('should edit BPM via bpm-edit dialog', () => {
      const chart = mockChart({ bpmChanges: [mockBpmChange({ measure: 0, fraction: 0, bpm: 120 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().requestBpmEdit(store().bpmChanges[0] as any);
      act().submitInputDialog('200');
      expect(store().bpmChanges[0].bpm).toBe(200);
    });

    it('should add STOP via stop-add dialog', () => {
      seedNotes([]);
      act().requestStopAdd(0);
      act().submitInputDialog('48');
      expect(store().stopEvents).toHaveLength(1);
      expect(store().stopEvents[0].duration).toBe(48);
    });

    it('should reject duration=0 for stop-add', () => {
      seedNotes([]);
      act().requestStopAdd(0);
      act().submitInputDialog('0');
      expect(store().stopEvents).toHaveLength(0);
    });

    it('should edit STOP via stop-edit dialog', () => {
      const chart = mockChart({ stopEvents: [mockStopEvent({ measure: 0, fraction: 0, duration: 48 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().requestStopEdit(store().stopEvents[0] as any);
      act().submitInputDialog('96');
      expect(store().stopEvents[0].duration).toBe(96);
    });

    it('should remove STOP when editing to 0', () => {
      const chart = mockChart({ stopEvents: [mockStopEvent({ measure: 0, fraction: 0, duration: 48 })] });
      act().initFromChart(chart as any, [] as any, 1);
      act().requestStopEdit(store().stopEvents[0] as any);
      act().submitInputDialog('0');
      expect(store().stopEvents).toHaveLength(0);
    });

    it('should close dialog on NaN input', () => {
      act().requestBpmAdd(0);
      act().submitInputDialog('abc');
      expect(store().inputDialog).toBeNull();
    });

    it('should do nothing when no dialog open', () => {
      const before = store().bpmChanges.length;
      act().submitInputDialog('100');
      expect(store().bpmChanges.length).toBe(before);
    });
  });
});

// ============================================================
// Headers
// ============================================================
describe('Headers', () => {
  describe('changeHeader()', () => {
    it('should update a header field', () => {
      const chart = mockChart();
      act().initFromChart(chart as any, [] as any, 1);
      act().changeHeader('title', 'New Title');
      expect(store().headers?.title).toBe('New Title');
    });

    it('should set hasUnsavedChanges', () => {
      const chart = mockChart();
      act().initFromChart(chart as any, [] as any, 1);
      act().setHasUnsavedChanges(false);
      act().changeHeader('artist', 'New Artist');
      expect(store().hasUnsavedChanges).toBe(true);
    });

    it('should do nothing when headers is null', () => {
      act().changeHeader('title', 'x');
      expect(store().headers).toBeNull();
    });
  });

  describe('updateHeadersWithWavDefs()', () => {
    it('should merge new wav definitions', () => {
      const chart = mockChart();
      act().initFromChart(chart as any, [] as any, 1);
      act().updateHeadersWithWavDefs({ '02': 'snare.wav', '03': 'hat.wav' });
      expect(store().headers?.wav.get('02')).toBe('snare.wav');
      expect(store().headers?.wav.get('03')).toBe('hat.wav');
      // original still there
      expect(store().headers?.wav.get('01')).toBe('kick.wav');
    });

    it('should overwrite existing wav defs', () => {
      const chart = mockChart();
      act().initFromChart(chart as any, [] as any, 1);
      act().updateHeadersWithWavDefs({ '01': 'new_kick.wav' });
      expect(store().headers?.wav.get('01')).toBe('new_kick.wav');
    });

    it('should do nothing when headers is null', () => {
      act().updateHeadersWithWavDefs({ '01': 'test.wav' });
      expect(store().headers).toBeNull();
    });
  });
});

// ============================================================
// Simple Setters
// ============================================================
describe('Simple Setters', () => {
  it('setAudioPhase', () => {
    act().setAudioPhase('playing');
    expect(store().audioPhase).toBe('playing');
  });

  it('setAudioLoadProgress', () => {
    act().setAudioLoadProgress({ loaded: 5, total: 10 });
    expect(store().audioLoadProgress).toEqual({ loaded: 5, total: 10 });
  });

  it('setPlaybackSpeed', () => {
    act().setPlaybackSpeed(1.5);
    expect(store().playbackSpeed).toBe(1.5);
  });

  it('setVolume', () => {
    act().setVolume(0.5);
    expect(store().volume).toBe(0.5);
  });

  it('setPlaybackTime', () => {
    act().setPlaybackTime(42);
    expect(store().playbackTime).toBe(42);
  });

  it('setPlaybackDuration', () => {
    act().setPlaybackDuration(180);
    expect(store().playbackDuration).toBe(180);
  });

  it('setActiveTool', () => {
    act().setActiveTool('pen' as any);
    expect(store().activeTool).toBe('pen');
  });

  it('setGridSnap', () => {
    act().setGridSnap(8 as any);
    expect(store().gridSnap).toBe(8);
  });

  it('setSelectedNoteType', () => {
    act().setSelectedNoteType('invisible' as any);
    expect(store().selectedNoteType).toBe('invisible');
  });

  it('setCurrentKeysound', () => {
    act().setCurrentKeysound('FF');
    expect(store().currentKeysound).toBe('FF');
  });

  it('setCurrentBeat', () => {
    act().setCurrentBeat(16);
    expect(store().currentBeat).toBe(16);
  });

  it('setHasUnsavedChanges', () => {
    act().setHasUnsavedChanges(true);
    expect(store().hasUnsavedChanges).toBe(true);
  });

  it('setInputDialog', () => {
    act().setInputDialog({ type: 'bpm-add', defaultValue: '120', beat: 0 });
    expect(store().inputDialog?.type).toBe('bpm-add');
  });

  it('toggleLeftPanel', () => {
    expect(store().showLeftPanel).toBe(true);
    act().toggleLeftPanel();
    expect(store().showLeftPanel).toBe(false);
    act().toggleLeftPanel();
    expect(store().showLeftPanel).toBe(true);
  });

  it('toggleRightPanel', () => {
    expect(store().showRightPanel).toBe(true);
    act().toggleRightPanel();
    expect(store().showRightPanel).toBe(false);
  });

  it('toggleHeaderCollapsed', () => {
    expect(store().headerCollapsed).toBe(false);
    act().toggleHeaderCollapsed();
    expect(store().headerCollapsed).toBe(true);
  });

  it('setToast', () => {
    act().setToast({ message: 'Saved!', type: 'success' });
    expect(store().toast).toEqual({ message: 'Saved!', type: 'success' });
    act().setToast(null);
    expect(store().toast).toBeNull();
  });

  it('setShowBackConfirm', () => {
    act().setShowBackConfirm(true);
    expect(store().showBackConfirm).toBe(true);
  });

  it('setLoopA', () => {
    act().setLoopA(4);
    expect(store().loopA).toBe(4);
    act().setLoopA(null);
    expect(store().loopA).toBeNull();
  });

  it('setLoopB', () => {
    act().setLoopB(16);
    expect(store().loopB).toBe(16);
  });

  it('toggleMetronome', () => {
    expect(store().metronomeEnabled).toBe(false);
    act().toggleMetronome();
    expect(store().metronomeEnabled).toBe(true);
    act().toggleMetronome();
    expect(store().metronomeEnabled).toBe(false);
  });
});

// ============================================================
// Patterns
// ============================================================
describe('Patterns', () => {
  describe('applyPattern()', () => {
    const simplePattern = {
      id: 'p1',
      name: 'Test',
      category: 'test',
      notes: [
        { beatOffset: 0, columnIndex: 0, noteType: 'playable' as const },
        { beatOffset: 1, columnIndex: 1, noteType: 'playable' as const },
        { beatOffset: 2, columnIndex: 2, noteType: 'playable' as const },
      ],
      columnCount: 3,
      beatLength: 2,
    };

    it('should create notes from pattern at given position', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K1', '01');
      expect(store().notes).toHaveLength(3);
      expect(store().notes[0].beat).toBe(0);
      expect(store().notes[0].column).toBe('K1');
      expect(store().notes[1].beat).toBe(1);
      expect(store().notes[1].column).toBe('K2');
      expect(store().notes[2].beat).toBe(2);
      expect(store().notes[2].column).toBe('K3');
    });

    it('should offset by startBeat', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 8, 'K1', '01');
      expect(store().notes[0].beat).toBe(8);
      expect(store().notes[1].beat).toBe(9);
    });

    it('should offset by startColumn', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K3', '01');
      expect(store().notes[0].column).toBe('K3');
      expect(store().notes[1].column).toBe('K4');
      expect(store().notes[2].column).toBe('K5');
    });

    it('should skip notes that fall outside lane range', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K6', '01');
      // K6=index5, col0->K6, col1->K7(6), col2->index7 (out of range)
      expect(store().notes).toHaveLength(2);
    });

    it('should skip notes with negative beats', () => {
      const pattern = {
        ...simplePattern,
        notes: [{ beatOffset: -1, columnIndex: 0, noteType: 'playable' as const }],
      };
      seedNotes([]);
      act().applyPattern(pattern as any, laneIds, 0, 'K1', '01');
      expect(store().notes).toHaveLength(0);
    });

    it('should assign new IDs', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K1', '01');
      const ids = store().notes.map((n) => n.id);
      expect(new Set(ids).size).toBe(3); // all unique
    });

    it('should select applied notes', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K1', '01');
      expect(store().selectedNotes.size).toBe(3);
    });

    it('should use provided keysound', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K1', 'FF');
      expect(store().notes[0].keysound).toBe('FF');
    });

    it('should do nothing with empty pattern', () => {
      const emptyPattern = { ...simplePattern, notes: [] };
      seedNotes([]);
      act().applyPattern(emptyPattern as any, laneIds, 0, 'K1', '01');
      expect(store().notes).toHaveLength(0);
    });

    it('should do nothing with empty laneIds', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, [], 0, 'K1', '01');
      expect(store().notes).toHaveLength(0);
    });

    it('should handle LN patterns with endBeatOffset', () => {
      const lnPattern = {
        ...simplePattern,
        notes: [{ beatOffset: 0, columnIndex: 0, noteType: 'long' as const, endBeatOffset: 4 }],
      };
      seedNotes([]);
      act().applyPattern(lnPattern as any, laneIds, 2, 'K1', '01');
      expect(store().notes[0].endBeat).toBe(6); // 2 + 4
    });

    it('should push undo entry', () => {
      seedNotes([]);
      act().applyPattern(simplePattern as any, laneIds, 0, 'K1', '01');
      expect(store().undoStack).toHaveLength(1);
    });
  });

  describe('selectionToPatternData()', () => {
    it('should extract pattern from selected notes', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 4, column: 'K2' }),
        mockNote({ id: 'n2', beat: 5, column: 'K3' }),
      ]);
      act().selectNotes(['n1', 'n2']);
      const result = act().selectionToPatternData(laneIds);
      expect(result).not.toBeNull();
      expect(result!.notes).toHaveLength(2);
      expect(result!.notes[0].beatOffset).toBe(0); // relative to min beat
      expect(result!.notes[1].beatOffset).toBe(1);
      expect(result!.notes[0].columnIndex).toBe(0); // relative to min col
      expect(result!.notes[1].columnIndex).toBe(1);
    });

    it('should return null when nothing selected', () => {
      seedNotes([mockNote({ id: 'n1' })]);
      expect(act().selectionToPatternData(laneIds)).toBeNull();
    });

    it('should return null when selected notes have no matching lanes', () => {
      seedNotes([mockNote({ id: 'n1', column: 'SCRATCH' })]);
      act().selectNotes(['n1']);
      expect(act().selectionToPatternData(laneIds)).toBeNull();
    });

    it('should calculate columnCount correctly', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 0, column: 'K1' }),
        mockNote({ id: 'n2', beat: 0, column: 'K5' }),
      ]);
      act().selectNotes(['n1', 'n2']);
      const result = act().selectionToPatternData(laneIds);
      expect(result!.columnCount).toBe(5); // indices 0..4
    });

    it('should calculate beatLength correctly', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 2 }),
        mockNote({ id: 'n2', beat: 10 }),
      ]);
      act().selectNotes(['n1', 'n2']);
      const result = act().selectionToPatternData(laneIds);
      expect(result!.beatLength).toBe(8);
    });

    it('should use endBeat for beatLength with LN', () => {
      seedNotes([
        mockNote({ id: 'n1', beat: 0 }),
        mockLN({ id: 'n2', beat: 2, endBeat: 12 }),
      ]);
      act().selectNotes(['n1', 'n2']);
      const result = act().selectionToPatternData(laneIds);
      expect(result!.beatLength).toBe(12);
    });

    it('should default beatLength to 0.25 for single-beat selection', () => {
      seedNotes([mockNote({ id: 'n1', beat: 4 })]);
      act().selectNotes(['n1']);
      const result = act().selectionToPatternData(laneIds);
      expect(result!.beatLength).toBe(0.25);
    });

    it('should include endBeatOffset for LNs', () => {
      seedNotes([mockLN({ id: 'n1', beat: 2, endBeat: 6 })]);
      act().selectNotes(['n1']);
      const result = act().selectionToPatternData(laneIds);
      expect(result!.notes[0].endBeatOffset).toBe(4); // 6 - 2
    });
  });
});

// ============================================================
// Edge Cases & Integration
// ============================================================
describe('Edge Cases', () => {
  it('undo/redo roundtrip preserves notes', () => {
    seedNotes([mockNote({ id: 'n1' })]);
    act().addNote(mockNote({ id: undefined, beat: 8, column: 'K5' }) as any);
    const afterAdd = store().notes.map((n) => ({ ...n }));
    act().undo();
    act().redo();
    expect(store().notes).toEqual(afterAdd);
  });

  it('multiple addNote calls generate sequential IDs', () => {
    act().addNote(mockNote({ id: undefined }) as any);
    act().addNote(mockNote({ id: undefined, beat: 1 }) as any);
    act().addNote(mockNote({ id: undefined, beat: 2 }) as any);
    expect(store().notes.map((n) => n.id)).toEqual(['note-1', 'note-2', 'note-3']);
  });

  it('cut then paste creates new notes with new IDs', () => {
    seedNotes([mockNote({ id: 'n1', beat: 0 })]);
    act().selectNotes(['n1']);
    act().cut();
    act().setCurrentBeat(4);
    act().paste();
    expect(store().notes).toHaveLength(1);
    expect(store().notes[0].id).not.toBe('n1');
    expect(store().notes[0].beat).toBe(4);
  });

  it('insertMeasure then deleteMeasure roundtrip', () => {
    const notes = [
      mockNote({ id: 'n1', beat: 0, measure: 0, fraction: 0 }),
      mockNote({ id: 'n2', beat: 8, measure: 2, fraction: 0 }),
    ];
    seedNotes(notes);
    act().insertMeasure(1);
    act().deleteMeasure(1);
    expect(store().notes[0].beat).toBe(0);
    expect(store().notes[1].beat).toBe(8);
  });

  it('selectAll then changeNoteType changes all', () => {
    seedNotes([
      mockNote({ id: 'n1', noteType: 'playable' }),
      mockNote({ id: 'n2', noteType: 'playable' }),
    ]);
    act().selectAll();
    act().changeNoteType('invisible' as any);
    expect(store().notes.every((n) => n.noteType === 'invisible')).toBe(true);
  });

  it('initial state values', () => {
    expect(store().notes).toEqual([]);
    expect(store().activeTool).toBe('select');
    expect(store().gridSnap).toBe(16);
    expect(store().currentKeysound).toBe('01');
    expect(store().volume).toBe(0.8);
    expect(store().playbackSpeed).toBe(1);
    expect(store().showLeftPanel).toBe(true);
    expect(store().showRightPanel).toBe(true);
    expect(store().headerCollapsed).toBe(false);
    expect(store().metronomeEnabled).toBe(false);
    expect(store().audioPhase).toBe('idle');
  });
});
