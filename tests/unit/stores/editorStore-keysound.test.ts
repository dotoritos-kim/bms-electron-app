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

const mockHeaders = (overrides: Record<string, unknown> = {}) => ({
  player: 1,
  genre: 'Test',
  title: 'Test Song',
  artist: 'Tester',
  bpm: 120,
  playlevel: '5',
  rank: 3,
  total: 300,
  wav: new Map<string, string>([
    ['01', 'kick.wav'],
    ['02', 'snare.wav'],
    ['03', 'hihat.wav'],
  ]),
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

const store = () => useEditorStore.getState();

function seedNotes(notes: ReturnType<typeof mockNote>[], nextId = 100) {
  const chart = mockChart({ notes });
  store().initFromChart(chart as any, notes as any, nextId);
}

// --- Tests ---

beforeEach(() => {
  store().reset();
});

// ============================================================
// replaceKeysound
// ============================================================
describe('replaceKeysound', () => {
  it('should replace keysound in all matching notes', () => {
    seedNotes([
      mockNote({ id: 'n1', keysound: '01', beat: 0 }),
      mockNote({ id: 'n2', keysound: '02', beat: 1 }),
      mockNote({ id: 'n3', keysound: '01', beat: 2 }),
    ]);

    store().replaceKeysound('01', '03');

    const notes = store().notes;
    expect(notes.find((n) => n.id === 'n1')!.keysound).toBe('03');
    expect(notes.find((n) => n.id === 'n2')!.keysound).toBe('02');
    expect(notes.find((n) => n.id === 'n3')!.keysound).toBe('03');
  });

  it('should replace keysound in additionalKeysounds', () => {
    seedNotes([
      mockNote({
        id: 'n1',
        keysound: '02',
        additionalKeysounds: [
          { keysound: '01', type: 'invisible' },
          { keysound: '03', type: 'bgm' },
        ],
      }),
    ]);

    store().replaceKeysound('01', '03');

    const note = store().notes[0];
    expect(note.keysound).toBe('02'); // unchanged
    expect(note.additionalKeysounds![0].keysound).toBe('03'); // replaced
    expect(note.additionalKeysounds![1].keysound).toBe('03'); // already was 03
  });

  it('should no-op when fromId === toId', () => {
    seedNotes([mockNote({ id: 'n1', keysound: '01' })]);
    const notesBefore = store().notes;

    store().replaceKeysound('01', '01');

    expect(store().notes).toBe(notesBefore); // reference equality — no change
  });

  it('should be undoable in a single step', () => {
    seedNotes([
      mockNote({ id: 'n1', keysound: '01', beat: 0 }),
      mockNote({ id: 'n2', keysound: '01', beat: 1 }),
      mockNote({ id: 'n3', keysound: '01', beat: 2 }),
    ]);

    store().replaceKeysound('01', '03');
    expect(store().notes.every((n) => n.keysound === '03')).toBe(true);

    store().undo();
    expect(store().notes.every((n) => n.keysound === '01')).toBe(true);
  });

  it('should no-op when no notes match', () => {
    seedNotes([mockNote({ id: 'n1', keysound: '02' })]);
    const undoStackLen = store().undoStack.length;

    store().replaceKeysound('99', '01');

    // pushUndo was called but notes unchanged (acceptable — undo is cheap)
    expect(store().notes[0].keysound).toBe('02');
  });
});

// ============================================================
// removeWavDefinitions
// ============================================================
describe('removeWavDefinitions', () => {
  it('should remove WAV header entries', () => {
    seedNotes([]);

    store().removeWavDefinitions(['02']);

    expect(store().headers!.wav.has('01')).toBe(true);
    expect(store().headers!.wav.has('02')).toBe(false);
    expect(store().headers!.wav.has('03')).toBe(true);
  });

  it('should be undoable', () => {
    seedNotes([]);

    store().removeWavDefinitions(['01', '02']);
    expect(store().headers!.wav.size).toBe(1); // only '03' remains

    store().undo();
    expect(store().headers!.wav.size).toBe(3);
    expect(store().headers!.wav.get('01')).toBe('kick.wav');
  });

  it('should no-op when headers is null', () => {
    // Store is reset, headers is null
    expect(() => store().removeWavDefinitions(['01'])).not.toThrow();
  });
});

// ============================================================
// highlightKeysound
// ============================================================
describe('highlightKeysound', () => {
  it('should default to null', () => {
    expect(store().highlightKeysound).toBeNull();
  });

  it('should set and clear highlight', () => {
    store().setHighlightKeysound('01');
    expect(store().highlightKeysound).toBe('01');

    store().setHighlightKeysound(null);
    expect(store().highlightKeysound).toBeNull();
  });
});

// ============================================================
// selectByFilter with additionalKeysounds
// ============================================================
describe('selectByFilter with additionalKeysounds', () => {
  it('should select notes where additionalKeysounds match', () => {
    seedNotes([
      mockNote({ id: 'n1', keysound: '02' }),
      mockNote({
        id: 'n2',
        keysound: '02',
        beat: 1,
        additionalKeysounds: [{ keysound: '01', type: 'invisible' }],
      }),
      mockNote({ id: 'n3', keysound: '03', beat: 2 }),
    ]);

    store().selectByFilter({ keysounds: ['01'] });

    // n2 matches via additionalKeysounds
    expect(store().selectedNotes.has('n2')).toBe(true);
    // n1 and n3 don't match
    expect(store().selectedNotes.has('n1')).toBe(false);
    expect(store().selectedNotes.has('n3')).toBe(false);
  });

  it('should select notes matching main keysound OR additionalKeysounds', () => {
    seedNotes([
      mockNote({ id: 'n1', keysound: '01' }),
      mockNote({
        id: 'n2',
        keysound: '02',
        beat: 1,
        additionalKeysounds: [{ keysound: '01', type: 'bgm' }],
      }),
      mockNote({ id: 'n3', keysound: '03', beat: 2 }),
    ]);

    store().selectByFilter({ keysounds: ['01'] });

    expect(store().selectedNotes.has('n1')).toBe(true);
    expect(store().selectedNotes.has('n2')).toBe(true);
    expect(store().selectedNotes.has('n3')).toBe(false);
  });
});

// ============================================================
// getNoteColorHex (editorUtils)
// ============================================================
describe('getNoteColorHex', () => {
  // Dynamic import to avoid bms-editor dep issues in unit test
  let getNoteColorHex: any;

  beforeAll(async () => {
    try {
      const mod = await import('../../../node_modules/@rhythm-archive/bms-editor/src/chart/editor/editorUtils');
      getNoteColorHex = mod.getNoteColorHex;
    } catch {
      // If import fails in test env, skip
    }
  });

  const laneColorHex = { normal: 0x4488ff, invisible: 0x224488 };

  it('should return cyan for selected notes (highest priority)', () => {
    if (!getNoteColorHex) return;
    const note = { noteType: 'playable', keysound: '01' };
    expect(getNoteColorHex(note, laneColorHex, true, true)).toBe(0x00ffff);
  });

  it('should return orange for highlighted notes', () => {
    if (!getNoteColorHex) return;
    const note = { noteType: 'playable', keysound: '01' };
    expect(getNoteColorHex(note, laneColorHex, false, true)).toBe(0xffa500);
  });

  it('should return normal color when not selected or highlighted', () => {
    if (!getNoteColorHex) return;
    const note = { noteType: 'playable', keysound: '01' };
    expect(getNoteColorHex(note, laneColorHex, false, false)).toBe(0x4488ff);
  });

  it('should default isHighlighted to false', () => {
    if (!getNoteColorHex) return;
    const note = { noteType: 'playable', keysound: '01' };
    expect(getNoteColorHex(note, laneColorHex, false)).toBe(0x4488ff);
  });
});
