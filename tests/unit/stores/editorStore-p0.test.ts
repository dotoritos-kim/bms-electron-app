import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { PasteAnalysis } from '../../../src/renderer/stores/editorStore';

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
  bpmChanges: [{ measure: 0, fraction: 0, bpm: 120 }],
  stopEvents: [],
  timeSignatures: new Map<number, number>(),
  bgaEvents: [],
  ...overrides,
});

const laneIds = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
const store = () => useEditorStore.getState();

function seedNotes(notes: ReturnType<typeof mockNote>[], nextId = 100) {
  const chart = mockChart({ notes });
  store().initFromChart(chart as any, notes as any, nextId);
}

beforeEach(() => {
  store().reset();
});

// ============================================================
// 1. addNote duplicate detection — auto-replace
// ============================================================
describe('noteIndex: addNote duplicate detection', () => {
  it('should replace existing playable note at same beat+column', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 4, column: 'K1', keysound: '01' })]);
    expect(store().notes).toHaveLength(1);

    // Add another playable note at same beat+column
    store().addNote(mockNote({ beat: 4, column: 'K1', keysound: '02' }) as any);

    // Should still be 1 note (replaced), with new keysound
    expect(store().notes).toHaveLength(1);
    expect(store().notes[0].keysound).toBe('02');
    expect(store().notes[0].id).not.toBe('note-1'); // new ID
  });

  it('should allow stacking BGM notes at same beat', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 4, column: undefined, noteType: 'bgm', keysound: '01' })]);

    store().addNote(mockNote({ beat: 4, column: undefined, noteType: 'bgm', keysound: '02' }) as any);

    // BGM notes are not indexed — both should exist
    expect(store().notes).toHaveLength(2);
  });

  it('should not replace when columns differ', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 4, column: 'K1' })]);

    store().addNote(mockNote({ beat: 4, column: 'K2' }) as any);

    expect(store().notes).toHaveLength(2);
  });
});

// ============================================================
// 2. paste — index grows by N
// ============================================================
describe('noteIndex: paste updates index', () => {
  it('should increase note count after paste', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 0, column: 'K1' })]);

    // Copy and paste
    store().selectNotes(['note-1']);
    store().copy();
    store().setCurrentBeat(8);
    store().paste();

    expect(store().notes).toHaveLength(2);
    // Original at beat 0, pasted at beat 8
    const beats = store().notes.map((n) => n.beat).sort((a, b) => a - b);
    expect(beats).toEqual([0, 8]);
  });
});

// ============================================================
// 3. undo — index restored to previous state
// ============================================================
describe('noteIndex: undo restores index', () => {
  it('should restore index after undo of addNote', () => {
    seedNotes([]);

    store().addNote(mockNote({ beat: 4, column: 'K1' }) as any);
    expect(store().notes).toHaveLength(1);

    store().undo();
    expect(store().notes).toHaveLength(0);

    // Adding same note again should succeed (index cleared)
    store().addNote(mockNote({ beat: 4, column: 'K1' }) as any);
    expect(store().notes).toHaveLength(1);
  });

  it('should restore index after undo of deleteNotes', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 0, column: 'K1' })]);

    store().deleteNotes(['note-1']);
    expect(store().notes).toHaveLength(0);

    store().undo();
    expect(store().notes).toHaveLength(1);
    expect(store().notes[0].id).toBe('note-1');
  });
});

// ============================================================
// 4. deleteNotes — index entry removed
// ============================================================
describe('noteIndex: deleteNotes removes index entry', () => {
  it('should allow placing new note at deleted position', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 4, column: 'K2' })]);

    store().deleteNotes(['note-1']);

    // Place new note at same position — should not trigger replace
    store().addNote(mockNote({ beat: 4, column: 'K2', keysound: '05' }) as any);
    expect(store().notes).toHaveLength(1);
    expect(store().notes[0].keysound).toBe('05');
  });
});

// ============================================================
// 5. moveNotes — old key removed, new key added
// ============================================================
describe('noteIndex: moveNotes updates index', () => {
  it('should update index when note moves to new position', () => {
    seedNotes([
      mockNote({ id: 'note-1', beat: 0, column: 'K1' }),
      mockNote({ id: 'note-2', beat: 4, column: 'K1' }),
    ]);

    // Move note-1 from beat 0 to beat 8
    store().selectNotes(['note-1']);
    store().moveNotes(['note-1'], { beat: 8 }, laneIds);

    // Place new note at beat 0 K1 (vacated position) — should not replace
    store().addNote(mockNote({ beat: 0, column: 'K1', keysound: '03' }) as any);
    expect(store().notes).toHaveLength(3);
  });
});

// ============================================================
// 6. BGM notes — not indexed, allow duplicates
// ============================================================
describe('noteIndex: BGM notes not indexed', () => {
  it('should allow multiple BGM notes at same beat', () => {
    seedNotes([]);

    store().addNote(mockNote({ beat: 0, column: undefined, noteType: 'bgm', keysound: '01' }) as any);
    store().addNote(mockNote({ beat: 0, column: undefined, noteType: 'bgm', keysound: '02' }) as any);
    store().addNote(mockNote({ beat: 0, column: undefined, noteType: 'bgm', keysound: '03' }) as any);

    expect(store().notes).toHaveLength(3);
  });
});

// ============================================================
// 7. preparePaste — conflict detection
// ============================================================
describe('preparePaste: conflict detection', () => {
  it('should detect conflicts with existing notes', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 0, column: 'K1' })]);

    // Copy note-1, paste at same position (currentBeat=0)
    store().selectNotes(['note-1']);
    store().copy();
    store().setCurrentBeat(0);

    const result = store().preparePaste(laneIds);

    // Should have conflicts (pasting at beat 0, K1 where note-1 exists)
    expect(result).not.toBeNull();
    expect(result!.conflicts.length).toBeGreaterThan(0);
    expect(result!.conflicts[0].existingId).toBe('note-1');
  });

  it('should drop notes outside current lane range', () => {
    const narrowLanes = ['K1', 'K2', 'K3', 'K4', 'K5']; // 5K mode
    seedNotes([
      mockNote({ id: 'note-1', beat: 0, column: 'K1' }),
      mockNote({ id: 'note-2', beat: 0, column: 'K7' }), // outside 5K
    ]);

    store().selectNotes(['note-1', 'note-2']);
    store().copy();
    store().setCurrentBeat(8);

    const result = store().preparePaste(narrowLanes);

    expect(result).not.toBeNull();
    expect(result!.droppedCount).toBe(1); // K7 dropped
    expect(result!.pasted.length).toBe(1); // only K1 pasted
  });

  it('should auto-execute when no conflicts', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 0, column: 'K1' })]);

    store().selectNotes(['note-1']);
    store().copy();
    store().setCurrentBeat(8); // no conflict at beat 8

    const notesBefore = store().notes.length;
    const result = store().preparePaste(laneIds);

    // Auto-executed: notes increased
    expect(store().notes.length).toBe(notesBefore + 1);
    expect(result).not.toBeNull();
    expect(result!.conflicts).toHaveLength(0);
  });
});

// ============================================================
// 8. executePaste — replace mode
// ============================================================
describe('executePaste: replace mode', () => {
  it('should replace conflicting notes', () => {
    seedNotes([mockNote({ id: 'note-1', beat: 0, column: 'K1', keysound: '01' })]);

    store().selectNotes(['note-1']);
    store().copy();
    store().setCurrentBeat(0); // paste at same position

    const result = store().preparePaste(laneIds);
    expect(result).not.toBeNull();
    expect(result!.conflicts).toHaveLength(1);

    // Execute with replace
    store().executePaste(result!, 'replace');

    // Should still have 1 note at beat 0 K1 (replaced)
    const notesAtK1 = store().notes.filter((n) => n.beat === 0 && n.column === 'K1');
    expect(notesAtK1).toHaveLength(1);
    expect(notesAtK1[0].id).not.toBe('note-1'); // new note, not original
  });
});

// ============================================================
// 9. Undo restores timeSignatures and headers
// ============================================================
describe('undo: restores timeSignatures and headers', () => {
  it('should restore timeSignatures after undo of setTimeSignature', () => {
    const chart = mockChart({ timeSignatures: new Map<number, number>() });
    store().initFromChart(chart as any, [], 1);

    expect(store().timeSignatures.size).toBe(0);

    // Set 3/4 time on measure 2
    store().setTimeSignature(2, 0.75);
    expect(store().timeSignatures.get(2)).toBe(0.75);

    store().undo();
    expect(store().timeSignatures.size).toBe(0);
  });

  it('should restore headers after undo of changeHeader', () => {
    const chart = mockChart();
    store().initFromChart(chart as any, [], 1);

    expect(store().headers?.title).toBe('Test Song');

    store().changeHeader('title', 'Modified Title');
    expect(store().headers?.title).toBe('Modified Title');

    store().undo();
    expect(store().headers?.title).toBe('Test Song');
  });
});
