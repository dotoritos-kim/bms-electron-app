import { create } from 'zustand';
import type {
  EditableBMSNote,
  BMSBpmChange,
  BMSStopEvent,
  BMSHeaderData,
  EditableBMSChart,
  NoteType,
} from '@rhythm-archive/bms-core';
import type { EditorTool, SelectedNoteType, GridSnap, KeyMode } from '@rhythm-archive/bms-editor';
import type { PatternTemplate, PatternNote } from '../lib/patternTemplates';
import { createBeatConverter, beatToMF44 } from '../lib/beatConverter';
import type { BeatConverter, MeasureFraction } from '../lib/beatConverter';

// --- Types ---

export interface UndoEntry {
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  timeSignatures: Map<number, number>;
  headers: BMSHeaderData | null;
  bgaEvents: EditableBMSChart['bgaEvents'] | undefined;
  description: string;
}

export type AudioPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

export interface InputDialog {
  type: 'bpm-add' | 'bpm-edit' | 'stop-add' | 'stop-edit' | 'timesig-edit';
  defaultValue: string;
  beat?: number;
  measure?: number;
  bpmChange?: BMSBpmChange;
  stopEvent?: BMSStopEvent;
}

export interface PasteAnalysis {
  /** Notes ready to paste (valid columns, with IDs assigned) */
  pasted: EditableBMSNote[];
  /** Playable notes that conflict with existing notes at same beat+column */
  conflicts: Array<{ newNote: EditableBMSNote; existingId: string }>;
  /** Notes dropped because their column doesn't exist in current key mode */
  droppedCount: number;
}

// --- Helpers ---

/** Store 내부에서 사용: get()으로 timeSignatures를 참조하여 beatToMF 수행 */
function storeBeatToMF(getState: () => EditorState, beat: number): MeasureFraction {
  const converter = getState()._beatConverter;
  if (converter) return converter.beatToMF(beat);
  return beatToMF44(beat);
}

/** Store 내부에서 사용: measure/fraction → beat */
function storeMfToBeat(getState: () => EditorState, measure: number, fraction: number): number {
  const converter = getState()._beatConverter;
  if (converter) return converter.mfToBeat(measure, fraction);
  return measure * 4 + fraction * 4;
}

/** converter를 직접 얻어 루프 내 캐시로 사용 */
function getConverter(getState: () => EditorState): BeatConverter {
  return getState()._beatConverter ?? createBeatConverter(new Map());
}

/** 공통: timeSignatures 변경 시 notes/bpmChanges/stopEvents의 measure/fraction 재계산 */
function recalcMeasureFractions(
  getState: () => EditorState,
  newTS: Map<number, number>,
): {
  timeSignatures: Map<number, number>;
  _beatConverter: BeatConverter;
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
} {
  const s = getState();
  const oldConverter = getConverter(getState);
  const newConverter = createBeatConverter(newTS);
  return {
    timeSignatures: newTS,
    _beatConverter: newConverter,
    notes: s.notes.map((n) => {
      const { measure, fraction } = newConverter.beatToMF(n.beat);
      return { ...n, measure, fraction };
    }),
    bpmChanges: s.bpmChanges.map((b) => {
      const beat = oldConverter.mfToBeat(b.measure, b.fraction);
      const { measure, fraction } = newConverter.beatToMF(beat);
      return { ...b, measure, fraction };
    }),
    stopEvents: s.stopEvents.map((ev) => {
      const beat = oldConverter.mfToBeat(ev.measure, ev.fraction);
      const { measure, fraction } = newConverter.beatToMF(beat);
      return { ...ev, measure, fraction };
    }),
  };
}

// --- Note Index ---

/** Key for playable note deduplication index: "${beat}:${column}" */
function noteIndexKey(beat: number, column: string | undefined): string {
  return `${beat}:${column ?? ''}`;
}

/** Build index from notes array (playable notes only) */
function buildNoteIndex(notes: EditableBMSNote[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const n of notes) {
    if (n.noteType === 'playable' && n.column) {
      index.set(noteIndexKey(n.beat, n.column), n.id);
    }
  }
  return index;
}

// --- Store ---

interface EditorState {
  // Chart data
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  headers: BMSHeaderData | null;
  timeSignatures: Map<number, number>;
  editableChart: EditableBMSChart | null;
  hasUnsavedChanges: boolean;
  nextNoteId: number;
  keyMode: KeyMode;

  // Note deduplication index (playable notes only): "${beat}:${column}" → noteId
  _noteIndex: Map<string, string>;

  // Tool / Selection
  activeTool: EditorTool;
  gridSnap: GridSnap;
  selectedNotes: Set<string>;
  selectedNoteType: SelectedNoteType;
  currentKeysound: string;
  currentBeat: number;

  // Clipboard
  clipboard: EditableBMSNote[];

  // Undo / Redo
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Audio (reactive state only; refs stay in component)
  audioPhase: AudioPhase;
  audioLoadProgress: { loaded: number; total: number };
  playbackSpeed: number;
  volume: number;
  playbackTime: number;
  playbackDuration: number;

  // A-B Loop
  loopA: number | null;
  loopB: number | null;
  metronomeEnabled: boolean;

  // UI
  noteHeight: number;
  inputDialog: InputDialog | null;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  headerCollapsed: boolean;
  toast: { message: string; type: 'success' | 'error' } | null;
  showBackConfirm: boolean;

  // Internal: beat converter (recreated when timeSignatures change)
  _beatConverter: BeatConverter | null;

  // --- Computed ---

  /** 현재 상태를 저장용 EditableBMSChart로 조립 */
  savableChart: () => EditableBMSChart | null;
  /** timeSignatures-aware beat→measure/fraction 변환 */
  beatToMF: (beat: number) => MeasureFraction;
  /** timeSignatures-aware measure/fraction→beat 변환 */
  mfToBeat: (measure: number, fraction: number) => number;

  // --- Actions ---

  // Time Signatures
  setTimeSignature: (measure: number, size: number) => void;
  removeTimeSignature: (measure: number) => void;

  // Initialization
  reset: () => void;
  initFromChart: (chart: EditableBMSChart, rawNotes: EditableBMSNote[], nextId: number, keyMode?: KeyMode) => void;

  // Undo / Redo
  pushUndo: (description: string) => void;
  undo: () => void;
  redo: () => void;

  // Notes
  addNote: (note: Omit<EditableBMSNote, 'id'>) => void;
  deleteNotes: (noteIds: string[]) => void;
  moveNotes: (noteIds: string[], delta: { beat?: number; columnDelta?: number }, laneIds: string[]) => void;
  selectNotes: (noteIds: string[], additive?: boolean) => void;
  updateNote: (noteId: string, updates: Partial<EditableBMSNote>) => void;
  selectAll: () => void;
  clearSelection: () => void;
  changeNoteType: (newType: NoteType) => void;

  // Measure management
  insertMeasure: (atMeasure: number) => void;
  deleteMeasure: (atMeasure: number) => void;

  // Transform operations
  mirrorNotes: (laneIds: string[]) => void;
  flipNotes: () => void;
  randomNotes: (laneIds: string[]) => void;
  quantizeNotes: () => void;

  // Keysound layers
  addKeysoundLayer: (noteId: string, keysoundId: string, layerType: 'invisible' | 'bgm') => void;
  removeKeysoundLayer: (noteId: string, layerIndex: number) => void;

  // Clipboard
  copy: () => void;
  cut: () => void;
  paste: () => void;
  /** Analyze paste for conflicts/out-of-range. Returns null if auto-executed (no conflicts). */
  preparePaste: (laneIds: string[]) => PasteAnalysis | null;
  /** Execute paste with user choice for conflicts */
  executePaste: (analysis: PasteAnalysis, choice: 'replace' | 'stack' | 'cancel') => void;

  // BPM / STOP
  changeBpm: (beat: number, bpm: number) => void;
  requestBpmAdd: (beat: number) => void;
  requestBpmEdit: (bpmChange: BMSBpmChange) => void;
  requestStopAdd: (beat: number) => void;
  requestStopEdit: (stopEvent: BMSStopEvent) => void;
  requestTimeSignatureEdit: (measure: number) => void;
  submitInputDialog: (value: string) => void;

  // Headers
  changeHeader: (field: string, value: string | number) => void;

  // Keysound import
  updateHeadersWithWavDefs: (newWavDefs: Record<string, string>) => void;

  // Audio (simple setters)
  setAudioPhase: (phase: AudioPhase) => void;
  setAudioLoadProgress: (progress: { loaded: number; total: number }) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackTime: (time: number) => void;
  setPlaybackDuration: (duration: number) => void;

  // UI
  setActiveTool: (tool: EditorTool) => void;
  setGridSnap: (snap: GridSnap) => void;
  setSelectedNoteType: (type: SelectedNoteType) => void;
  setCurrentKeysound: (keysound: string) => void;
  setCurrentBeat: (beat: number) => void;
  setKeyMode: (keyMode: KeyMode) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setInputDialog: (dialog: InputDialog | null) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleHeaderCollapsed: () => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  setShowBackConfirm: (show: boolean) => void;
  setNoteHeight: (height: number) => void;

  // A-B Loop
  setLoopA: (beat: number | null) => void;
  setLoopB: (beat: number | null) => void;
  toggleMetronome: () => void;

  // Patterns
  applyPattern: (pattern: PatternTemplate, laneIds: string[], startBeat: number, startColumn: string, keysound: string) => void;
  selectionToPatternData: (laneIds: string[]) => { notes: PatternNote[]; columnCount: number; beatLength: number } | null;
}

const initialState = {
  notes: [] as EditableBMSNote[],
  bpmChanges: [] as BMSBpmChange[],
  stopEvents: [] as BMSStopEvent[],
  headers: null as BMSHeaderData | null,
  timeSignatures: new Map<number, number>(),
  editableChart: null as EditableBMSChart | null,
  hasUnsavedChanges: false,
  nextNoteId: 1,
  keyMode: '7K' as KeyMode,
  activeTool: 'select' as EditorTool,
  gridSnap: 16 as GridSnap,
  selectedNotes: new Set<string>(),
  selectedNoteType: 'playable' as SelectedNoteType,
  currentKeysound: '01',
  currentBeat: 0,
  clipboard: [] as EditableBMSNote[],
  undoStack: [] as UndoEntry[],
  redoStack: [] as UndoEntry[],
  audioPhase: 'idle' as AudioPhase,
  audioLoadProgress: { loaded: 0, total: 0 },
  playbackSpeed: 1,
  volume: 0.8,
  playbackTime: 0,
  playbackDuration: 0,
  loopA: null as number | null,
  loopB: null as number | null,
  metronomeEnabled: false,
  noteHeight: 2,
  inputDialog: null as InputDialog | null,
  showLeftPanel: true,
  showRightPanel: true,
  headerCollapsed: false,
  toast: null as { message: string; type: 'success' | 'error' } | null,
  showBackConfirm: false,
  _beatConverter: null as BeatConverter | null,
  _noteIndex: new Map<string, string>(),
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  // --- Computed ---
  savableChart: () => {
    const s = get();
    if (!s.editableChart) return null;
    return {
      headers: s.headers || s.editableChart.headers,
      notes: s.notes,
      timeSignatures: s.timeSignatures,
      bpmChanges: s.bpmChanges,
      stopEvents: s.stopEvents,
      bgaEvents: s.editableChart.bgaEvents,
    };
  },

  beatToMF: (beat: number) => storeBeatToMF(get, beat),
  mfToBeat: (measure: number, fraction: number) => storeMfToBeat(get, measure, fraction),

  // --- Initialization ---
  reset: () => set({
    ...initialState,
    timeSignatures: new Map<number, number>(),
    selectedNotes: new Set<string>(),
    _beatConverter: null,
    _noteIndex: new Map<string, string>(),
  }),

  initFromChart: (chart, rawNotes, nextId, keyMode) => {
    const converter = createBeatConverter(chart.timeSignatures);
    set({
      editableChart: chart,
      notes: rawNotes,
      bpmChanges: chart.bpmChanges,
      stopEvents: chart.stopEvents,
      headers: chart.headers,
      timeSignatures: chart.timeSignatures,
      nextNoteId: nextId,
      hasUnsavedChanges: false,
      undoStack: [],
      redoStack: [],
      selectedNotes: new Set(),
      _beatConverter: converter,
      _noteIndex: buildNoteIndex(rawNotes),
      ...(keyMode ? { keyMode } : {}),
    });
  },

  // --- Undo / Redo ---
  pushUndo: (description) => {
    const s = get();
    try {
      const entry: UndoEntry = structuredClone({
        notes: s.notes,
        bpmChanges: s.bpmChanges,
        stopEvents: s.stopEvents,
        timeSignatures: s.timeSignatures,
        headers: s.headers,
        bgaEvents: s.editableChart?.bgaEvents,
        description,
      });
      set((prev) => ({
        undoStack: [...prev.undoStack.slice(-50), entry],
        redoStack: [],
      }));
    } catch (err) {
      console.error('[EditorStore] pushUndo failed:', err);
    }
  },

  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const entry = s.undoStack[s.undoStack.length - 1];
    try {
      const redoEntry: UndoEntry = structuredClone({
        notes: s.notes, bpmChanges: s.bpmChanges, stopEvents: s.stopEvents,
        timeSignatures: s.timeSignatures, headers: s.headers,
        bgaEvents: s.editableChart?.bgaEvents, description: entry.description,
      });
      const newConverter = createBeatConverter(entry.timeSignatures);
      set({
        redoStack: [...s.redoStack, redoEntry],
        notes: entry.notes,
        bpmChanges: entry.bpmChanges,
        stopEvents: entry.stopEvents,
        timeSignatures: entry.timeSignatures,
        headers: entry.headers,
        editableChart: s.editableChart ? { ...s.editableChart, bgaEvents: entry.bgaEvents ?? s.editableChart.bgaEvents } : null,
        _beatConverter: newConverter,
        _noteIndex: buildNoteIndex(entry.notes),
        undoStack: s.undoStack.slice(0, -1),
        hasUnsavedChanges: true,
      });
    } catch (err) {
      console.error('[EditorStore] undo failed:', err);
    }
  },

  redo: () => {
    const s = get();
    if (s.redoStack.length === 0) return;
    const entry = s.redoStack[s.redoStack.length - 1];
    try {
      const undoEntry: UndoEntry = structuredClone({
        notes: s.notes, bpmChanges: s.bpmChanges, stopEvents: s.stopEvents,
        timeSignatures: s.timeSignatures, headers: s.headers,
        bgaEvents: s.editableChart?.bgaEvents, description: entry.description,
      });
      const newConverter = createBeatConverter(entry.timeSignatures);
      set({
        undoStack: [...s.undoStack, undoEntry],
        notes: entry.notes,
        bpmChanges: entry.bpmChanges,
        stopEvents: entry.stopEvents,
        timeSignatures: entry.timeSignatures,
        headers: entry.headers,
        editableChart: s.editableChart ? { ...s.editableChart, bgaEvents: entry.bgaEvents ?? s.editableChart.bgaEvents } : null,
        _beatConverter: newConverter,
        _noteIndex: buildNoteIndex(entry.notes),
        redoStack: s.redoStack.slice(0, -1),
        hasUnsavedChanges: true,
      });
    } catch (err) {
      console.error('[EditorStore] redo failed:', err);
    }
  },

  // --- Notes ---
  addNote: (note) => {
    const s = get();
    const id = `note-${s.nextNoteId}`;
    const converter = getConverter(get);
    const { measure, fraction } = converter.beatToMF(note.beat);
    const newNote = { ...note, id, measure, fraction } as EditableBMSNote;
    const isPlayable = newNote.noteType === 'playable' && newNote.column;

    // Duplicate check for playable notes: auto-replace existing note at same beat+column
    if (isPlayable) {
      const key = noteIndexKey(newNote.beat, newNote.column);
      const existingId = s._noteIndex.get(key);
      if (existingId) {
        // Replace mode: remove old note, add new one
        s.pushUndo('Replace note');
        const newIndex = new Map(s._noteIndex);
        newIndex.set(key, id);
        set({
          notes: [...s.notes.filter((n) => n.id !== existingId), newNote],
          nextNoteId: s.nextNoteId + 1,
          _noteIndex: newIndex,
          hasUnsavedChanges: true,
        });
        return;
      }
    }

    s.pushUndo('Add note');
    const newIndex = isPlayable ? new Map(s._noteIndex) : s._noteIndex;
    if (isPlayable) {
      newIndex.set(noteIndexKey(newNote.beat, newNote.column), id);
    }
    set({
      notes: [...s.notes, newNote],
      nextNoteId: s.nextNoteId + 1,
      _noteIndex: newIndex,
      hasUnsavedChanges: true,
    });
  },

  deleteNotes: (noteIds) => {
    const s = get();
    s.pushUndo('Delete notes');
    const idsSet = new Set(noteIds);
    // Incremental index update: remove deleted playable notes
    const newIndex = new Map(s._noteIndex);
    for (const n of s.notes) {
      if (idsSet.has(n.id) && n.noteType === 'playable' && n.column) {
        const key = noteIndexKey(n.beat, n.column);
        if (newIndex.get(key) === n.id) newIndex.delete(key);
      }
    }
    set({
      notes: s.notes.filter((n) => !idsSet.has(n.id)),
      selectedNotes: new Set(),
      _noteIndex: newIndex,
      hasUnsavedChanges: true,
    });
  },

  moveNotes: (noteIds, delta, laneIds) => {
    const s = get();
    s.pushUndo('Move notes');
    const idsSet = new Set(noteIds);
    const gridStep = 4 / s.gridSnap;
    const converter = getConverter(get);
    const newIndex = new Map(s._noteIndex);
    // Remove old positions of moved playable notes
    for (const n of s.notes) {
      if (idsSet.has(n.id) && n.noteType === 'playable' && n.column) {
        const key = noteIndexKey(n.beat, n.column);
        if (newIndex.get(key) === n.id) newIndex.delete(key);
      }
    }
    const movedNotes = s.notes.map((n) => {
      if (!idsSet.has(n.id)) return n;
      const rawBeat = Math.max(0, n.beat + (delta.beat || 0));
      const newBeat = Math.round(rawBeat / gridStep) * gridStep;
      const newEndBeat = n.endBeat !== undefined ? newBeat + (n.endBeat - n.beat) : undefined;
      let newColumn = n.column;
      if (delta.columnDelta && laneIds.length > 0) {
        const currentIndex = laneIds.indexOf(n.column);
        if (currentIndex >= 0) {
          const idx = Math.max(0, Math.min(laneIds.length - 1, currentIndex + delta.columnDelta));
          newColumn = laneIds[idx];
        }
      }
      const { measure, fraction } = converter.beatToMF(newBeat);
      return { ...n, beat: newBeat, endBeat: newEndBeat, column: newColumn, measure, fraction };
    });
    // Add new positions
    for (const n of movedNotes) {
      if (idsSet.has(n.id) && n.noteType === 'playable' && n.column) {
        newIndex.set(noteIndexKey(n.beat, n.column), n.id);
      }
    }
    set({ notes: movedNotes, _noteIndex: newIndex, hasUnsavedChanges: true });
  },

  selectNotes: (noteIds, additive) => {
    set((s) => {
      if (additive) {
        const next = new Set(s.selectedNotes);
        for (const id of noteIds) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return { selectedNotes: next };
      }
      return { selectedNotes: new Set(noteIds) };
    });
  },

  updateNote: (noteId, updates) => {
    const s = get();
    s.pushUndo('Update note');
    const converter = getConverter(get);
    set({
      notes: s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const updated = { ...n, ...updates };
        if (updates.beat !== undefined) {
          const { measure, fraction } = converter.beatToMF(updated.beat);
          updated.measure = measure;
          updated.fraction = fraction;
        }
        return updated;
      }),
      hasUnsavedChanges: true,
    });
  },

  selectAll: () => set((s) => ({ selectedNotes: new Set(s.notes.map((n) => n.id)) })),
  clearSelection: () => set({ selectedNotes: new Set() }),

  changeNoteType: (newType) => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    s.pushUndo('Change note type');
    set({
      notes: s.notes.map((n) => (s.selectedNotes.has(n.id) ? { ...n, noteType: newType } : n)),
      hasUnsavedChanges: true,
    });
  },

  // --- Measure management ---
  insertMeasure: (atMeasure) => {
    const s = get();
    s.pushUndo('Insert measure');
    // Use timeSignatures-aware beat calculation
    const shiftBeat = storeMfToBeat(get, atMeasure, 0);
    // New measure uses default 4/4 size (4 beats)
    const shiftAmount = 4;

    // Shift timeSignatures: measures >= atMeasure move up by 1
    const newTS = new Map<number, number>();
    for (const [m, size] of s.timeSignatures) {
      if (m >= atMeasure) newTS.set(m + 1, size);
      else newTS.set(m, size);
    }
    const newConverter = createBeatConverter(newTS);

    set({
      notes: s.notes.map((n) => {
        if (n.beat < shiftBeat) {
          if (n.endBeat !== undefined && n.endBeat >= shiftBeat) {
            return { ...n, endBeat: n.endBeat + shiftAmount };
          }
          return n;
        }
        const newBeat = n.beat + shiftAmount;
        const { measure, fraction } = newConverter.beatToMF(newBeat);
        const newEndBeat = n.endBeat !== undefined ? n.endBeat + shiftAmount : undefined;
        return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
      }),
      bpmChanges: s.bpmChanges.map((b) => {
        const beat = storeMfToBeat(get, b.measure, b.fraction);
        if (beat < shiftBeat) return b;
        const newBeat = beat + shiftAmount;
        const { measure, fraction } = newConverter.beatToMF(newBeat);
        return { ...b, measure, fraction };
      }),
      stopEvents: s.stopEvents.map((ev) => {
        const beat = storeMfToBeat(get, ev.measure, ev.fraction);
        if (beat < shiftBeat) return ev;
        const newBeat = beat + shiftAmount;
        const { measure, fraction } = newConverter.beatToMF(newBeat);
        return { ...ev, measure, fraction };
      }),
      timeSignatures: newTS,
      _beatConverter: newConverter,
      hasUnsavedChanges: true,
    });
    // Rebuild index after beat shift
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  deleteMeasure: (atMeasure) => {
    const s = get();
    s.pushUndo('Delete measure');
    const startBeat = storeMfToBeat(get, atMeasure, 0);
    const measureBeats = s._beatConverter?.getBeatsInMeasure(atMeasure) ?? 4;
    const endBeat = startBeat + measureBeats;

    // Shift timeSignatures: remove atMeasure, shift down measures > atMeasure
    const newTS = new Map<number, number>();
    for (const [m, size] of s.timeSignatures) {
      if (m === atMeasure) continue; // remove deleted measure's time signature
      if (m > atMeasure) newTS.set(m - 1, size);
      else newTS.set(m, size);
    }
    const newConverter = createBeatConverter(newTS);

    set({
      notes: s.notes
        .filter((n) => n.beat < startBeat || n.beat >= endBeat)
        .map((n) => {
          if (n.beat < startBeat) {
            if (n.endBeat !== undefined && n.endBeat >= endBeat) {
              return { ...n, endBeat: n.endBeat - measureBeats };
            }
            if (n.endBeat !== undefined && n.endBeat > startBeat) {
              return { ...n, endBeat: startBeat };
            }
            return n;
          }
          const newBeat = n.beat - measureBeats;
          const { measure, fraction } = newConverter.beatToMF(newBeat);
          const newEndBeat = n.endBeat !== undefined ? n.endBeat - measureBeats : undefined;
          return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
        }),
      bpmChanges: s.bpmChanges
        .filter((b) => {
          const beat = storeMfToBeat(get, b.measure, b.fraction);
          return beat < startBeat || beat >= endBeat;
        })
        .map((b) => {
          const beat = storeMfToBeat(get, b.measure, b.fraction);
          if (beat < endBeat) return b;
          const newBeat = beat - measureBeats;
          const { measure, fraction } = newConverter.beatToMF(newBeat);
          return { ...b, measure, fraction };
        }),
      stopEvents: s.stopEvents
        .filter((ev) => {
          const beat = storeMfToBeat(get, ev.measure, ev.fraction);
          return beat < startBeat || beat >= endBeat;
        })
        .map((ev) => {
          const beat = storeMfToBeat(get, ev.measure, ev.fraction);
          if (beat < endBeat) return ev;
          const newBeat = beat - measureBeats;
          const { measure, fraction } = newConverter.beatToMF(newBeat);
          return { ...ev, measure, fraction };
        }),
      timeSignatures: newTS,
      _beatConverter: newConverter,
      hasUnsavedChanges: true,
    });
    // Rebuild index after beat shift
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  // --- Transform operations ---
  mirrorNotes: (laneIds) => {
    const s = get();
    if (s.selectedNotes.size === 0 || laneIds.length === 0) return;
    s.pushUndo('Mirror notes');
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const idx = laneIds.indexOf(n.column);
        if (idx < 0) return n;
        return { ...n, column: laneIds[laneIds.length - 1 - idx] };
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  flipNotes: () => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    const selected = s.notes.filter((n) => s.selectedNotes.has(n.id));
    if (selected.length < 2) return;
    const minBeat = Math.min(...selected.map((n) => n.beat));
    const maxBeat = Math.max(...selected.map((n) => n.endBeat ?? n.beat));
    s.pushUndo('Flip notes');
    const converter = getConverter(get);
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const flippedBeat = maxBeat - (n.beat - minBeat);
        const flippedEnd = n.endBeat !== undefined ? maxBeat - (n.endBeat - minBeat) : undefined;
        const newBeat = flippedEnd !== undefined ? Math.min(flippedBeat, flippedEnd) : flippedBeat;
        const newEndBeat = flippedEnd !== undefined ? Math.max(flippedBeat, flippedEnd) : undefined;
        const { measure, fraction } = converter.beatToMF(newBeat);
        return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  randomNotes: (laneIds) => {
    const s = get();
    if (s.selectedNotes.size === 0 || laneIds.length === 0) return;
    s.pushUndo('Random notes');
    // Build a shuffled column mapping
    const shuffled = [...laneIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const mapping = new Map<string, string>();
    laneIds.forEach((id, i) => mapping.set(id, shuffled[i]));
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const newCol = mapping.get(n.column);
        return newCol ? { ...n, column: newCol } : n;
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  quantizeNotes: () => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    s.pushUndo('Quantize notes');
    const gridStep = 4 / s.gridSnap;
    const converter = getConverter(get);
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const newBeat = Math.round(n.beat / gridStep) * gridStep;
        const { measure, fraction } = converter.beatToMF(newBeat);
        let newEndBeat = n.endBeat !== undefined
          ? Math.round(n.endBeat / gridStep) * gridStep
          : undefined;
        // Prevent LN collapse: ensure endBeat > beat by at least one grid step
        if (newEndBeat !== undefined && newEndBeat <= newBeat) {
          newEndBeat = newBeat + gridStep;
        }
        return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  // --- Keysound layers ---
  addKeysoundLayer: (noteId, keysoundId, layerType) => {
    const s = get();
    s.pushUndo('Add keysound layer');
    set({
      notes: s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const layers = n.additionalKeysounds ? [...n.additionalKeysounds] : [];
        layers.push({ keysound: keysoundId, type: layerType });
        return { ...n, additionalKeysounds: layers };
      }),
      hasUnsavedChanges: true,
    });
  },

  removeKeysoundLayer: (noteId, layerIndex) => {
    const s = get();
    s.pushUndo('Remove keysound layer');
    set({
      notes: s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const layers = n.additionalKeysounds ? [...n.additionalKeysounds] : [];
        layers.splice(layerIndex, 1);
        return { ...n, additionalKeysounds: layers.length > 0 ? layers : undefined };
      }),
      hasUnsavedChanges: true,
    });
  },

  // --- Clipboard ---
  copy: () => {
    const s = get();
    const selected = s.notes.filter((n) => s.selectedNotes.has(n.id));
    if (selected.length === 0) return;
    set({ clipboard: selected.map((n) => ({ ...n })) });
  },

  cut: () => {
    const s = get();
    s.copy();
    const ids = Array.from(s.selectedNotes);
    if (ids.length === 0) return;
    s.pushUndo('Cut notes');
    const idsSet = new Set(ids);
    const newIndex = new Map(s._noteIndex);
    for (const n of s.notes) {
      if (idsSet.has(n.id) && n.noteType === 'playable' && n.column) {
        const key = noteIndexKey(n.beat, n.column);
        if (newIndex.get(key) === n.id) newIndex.delete(key);
      }
    }
    set({
      notes: s.notes.filter((n) => !idsSet.has(n.id)),
      selectedNotes: new Set(),
      _noteIndex: newIndex,
      hasUnsavedChanges: true,
    });
  },

  paste: () => {
    const s = get();
    if (s.clipboard.length === 0) return;
    const minBeat = Math.min(...s.clipboard.map((n) => n.beat));
    const offset = Math.max(-minBeat, s.currentBeat - minBeat);
    s.pushUndo('Paste notes');
    const converter = getConverter(get);
    const newIndex = new Map(s._noteIndex);
    let nextId = s.nextNoteId;
    const pasted = s.clipboard.map((n) => {
      const newBeat = n.beat + offset;
      const { measure, fraction } = converter.beatToMF(newBeat);
      return {
        ...n,
        id: `note-${nextId++}`,
        beat: newBeat,
        endBeat: n.endBeat !== undefined ? n.endBeat + offset : undefined,
        measure,
        fraction,
      };
    });
    // Update index for pasted playable notes
    for (const n of pasted) {
      if (n.noteType === 'playable' && n.column) {
        newIndex.set(noteIndexKey(n.beat, n.column), n.id);
      }
    }
    set({
      notes: [...s.notes, ...pasted],
      nextNoteId: nextId,
      _noteIndex: newIndex,
      hasUnsavedChanges: true,
    });
  },

  preparePaste: (laneIds) => {
    const s = get();
    if (s.clipboard.length === 0) return null;
    const laneSet = new Set(laneIds);
    const minBeat = Math.min(...s.clipboard.map((n) => n.beat));
    const offset = Math.max(-minBeat, s.currentBeat - minBeat);
    const converter = getConverter(get);
    let nextId = s.nextNoteId;
    let droppedCount = 0;

    const pasted: EditableBMSNote[] = [];
    for (const n of s.clipboard) {
      const newBeat = n.beat + offset;
      const { measure, fraction } = converter.beatToMF(newBeat);
      const newNote = {
        ...n,
        id: `note-${nextId++}`,
        beat: newBeat,
        endBeat: n.endBeat !== undefined ? n.endBeat + offset : undefined,
        measure,
        fraction,
      };
      // Drop notes with columns outside current key mode (BGM/invisible OK)
      if (newNote.noteType === 'playable' && newNote.column && !laneSet.has(newNote.column)) {
        droppedCount++;
        continue;
      }
      pasted.push(newNote);
    }

    // Detect conflicts (playable notes at same beat+column)
    const conflicts: PasteAnalysis['conflicts'] = [];
    for (const n of pasted) {
      if (n.noteType === 'playable' && n.column) {
        const key = noteIndexKey(n.beat, n.column);
        const existingId = s._noteIndex.get(key);
        if (existingId) {
          conflicts.push({ newNote: n, existingId });
        }
      }
    }

    const analysis: PasteAnalysis = { pasted, conflicts, droppedCount };

    // Auto-execute if no conflicts
    if (conflicts.length === 0) {
      s.pushUndo('Paste notes');
      const newIndex = new Map(s._noteIndex);
      for (const n of pasted) {
        if (n.noteType === 'playable' && n.column) {
          newIndex.set(noteIndexKey(n.beat, n.column), n.id);
        }
      }
      set({
        notes: [...s.notes, ...pasted],
        nextNoteId: nextId,
        _noteIndex: newIndex,
        hasUnsavedChanges: true,
      });
      return analysis; // Return for dropped count toast
    }

    // Has conflicts — return analysis for Editor.tsx dialog
    // Store nextId for executePaste
    set({ nextNoteId: nextId });
    return analysis;
  },

  executePaste: (analysis, choice) => {
    if (choice === 'cancel') return;
    const s = get();
    s.pushUndo('Paste notes');
    const newIndex = new Map(s._noteIndex);

    if (choice === 'replace') {
      // Remove conflicting existing notes
      const replaceIds = new Set(analysis.conflicts.map((c) => c.existingId));
      const filteredNotes = s.notes.filter((n) => !replaceIds.has(n.id));
      for (const n of analysis.pasted) {
        if (n.noteType === 'playable' && n.column) {
          newIndex.set(noteIndexKey(n.beat, n.column), n.id);
        }
      }
      set({
        notes: [...filteredNotes, ...analysis.pasted],
        _noteIndex: newIndex,
        hasUnsavedChanges: true,
      });
    } else {
      // stack: add all without removing existing
      for (const n of analysis.pasted) {
        if (n.noteType === 'playable' && n.column) {
          newIndex.set(noteIndexKey(n.beat, n.column), n.id);
        }
      }
      set({
        notes: [...s.notes, ...analysis.pasted],
        _noteIndex: newIndex,
        hasUnsavedChanges: true,
      });
    }
  },

  // --- BPM / STOP ---
  changeBpm: (beat, bpm) => {
    const s = get();
    s.pushUndo('Change BPM');
    const { measure, fraction } = getConverter(get).beatToMF(beat);
    const existing = s.bpmChanges.findIndex((b) => b.measure === measure && b.fraction === fraction);
    if (existing >= 0) {
      const next = [...s.bpmChanges];
      next[existing] = { ...next[existing], bpm };
      set({ bpmChanges: next, hasUnsavedChanges: true });
    } else {
      set({ bpmChanges: [...s.bpmChanges, { measure, fraction, bpm }], hasUnsavedChanges: true });
    }
  },

  requestBpmAdd: (beat) => set({ inputDialog: { type: 'bpm-add', defaultValue: '120', beat } }),
  requestBpmEdit: (bpmChange) => set({ inputDialog: { type: 'bpm-edit', defaultValue: String(bpmChange.bpm), bpmChange } }),
  requestStopAdd: (beat) => set({ inputDialog: { type: 'stop-add', defaultValue: '48', beat } }),
  requestStopEdit: (stopEvent) => set({ inputDialog: { type: 'stop-edit', defaultValue: String(stopEvent.duration), stopEvent } }),
  requestTimeSignatureEdit: (measure) => {
    const s = get();
    const currentSize = s.timeSignatures.get(measure) ?? 1.0;
    set({ inputDialog: { type: 'timesig-edit', defaultValue: String(currentSize), measure } });
  },

  submitInputDialog: (value) => {
    const s = get();
    const dialog = s.inputDialog;
    if (!dialog) return;
    const num = parseFloat(value);
    if (isNaN(num)) { set({ inputDialog: null }); return; }

    switch (dialog.type) {
      case 'bpm-add':
        if (num > 0 && dialog.beat !== undefined) s.changeBpm(dialog.beat, num);
        break;
      case 'bpm-edit':
        if (num > 0 && dialog.bpmChange) {
          s.pushUndo('Edit BPM');
          set({
            bpmChanges: s.bpmChanges.map((b) =>
              b.measure === dialog.bpmChange!.measure && b.fraction === dialog.bpmChange!.fraction
                ? { ...b, bpm: num } : b),
            hasUnsavedChanges: true,
          });
        }
        break;
      case 'stop-add':
        if (num !== 0 && dialog.beat !== undefined) {
          s.pushUndo('Add STOP');
          const { measure, fraction } = getConverter(get).beatToMF(dialog.beat);
          set({
            stopEvents: [...s.stopEvents, { measure, fraction, duration: num }],
            hasUnsavedChanges: true,
          });
        }
        break;
      case 'stop-edit':
        if (dialog.stopEvent) {
          s.pushUndo('Edit STOP');
          if (num === 0) {
            set({
              stopEvents: s.stopEvents.filter((ev) =>
                !(ev.measure === dialog.stopEvent!.measure && ev.fraction === dialog.stopEvent!.fraction)),
              hasUnsavedChanges: true,
            });
          } else {
            set({
              stopEvents: s.stopEvents.map((ev) =>
                ev.measure === dialog.stopEvent!.measure && ev.fraction === dialog.stopEvent!.fraction
                  ? { ...ev, duration: num } : ev),
              hasUnsavedChanges: true,
            });
          }
        }
        break;
      case 'timesig-edit':
        if (dialog.measure !== undefined) {
          if (num <= 0) {
            // Invalid — ignore
          } else {
            s.setTimeSignature(dialog.measure, num);
          }
        }
        break;
    }
    set({ inputDialog: null });
  },

  // --- Headers ---
  changeHeader: (field, value) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Change header');
    set({ headers: { ...s.headers, [field]: value }, hasUnsavedChanges: true });
  },

  updateHeadersWithWavDefs: (newWavDefs) => {
    set((s) => {
      if (!s.headers) return {};
      const newWav = new Map(s.headers.wav);
      for (const [id, filename] of Object.entries(newWavDefs)) {
        newWav.set(id, filename);
      }
      return { headers: { ...s.headers, wav: newWav }, hasUnsavedChanges: true };
    });
  },

  // --- Time Signatures ---
  setTimeSignature: (measureNum, size) => {
    const s = get();
    s.pushUndo('Set time signature');
    const newTS = new Map(s.timeSignatures);
    if (size === 1.0) {
      newTS.delete(measureNum);
    } else {
      newTS.set(measureNum, size);
    }
    set({ ...recalcMeasureFractions(get, newTS), hasUnsavedChanges: true });
  },

  removeTimeSignature: (measureNum) => {
    const s = get();
    s.pushUndo('Remove time signature');
    const newTS = new Map(s.timeSignatures);
    newTS.delete(measureNum);
    set({ ...recalcMeasureFractions(get, newTS), hasUnsavedChanges: true });
  },

  // --- Audio setters ---
  setAudioPhase: (phase) => set({ audioPhase: phase }),
  setAudioLoadProgress: (progress) => set({ audioLoadProgress: progress }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume }),
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackDuration: (duration) => set({ playbackDuration: duration }),

  // --- UI setters ---
  setActiveTool: (tool) => set({ activeTool: tool }),
  setGridSnap: (snap) => set({ gridSnap: snap }),
  setSelectedNoteType: (type) => set({ selectedNoteType: type }),
  setCurrentKeysound: (keysound) => set({ currentKeysound: keysound }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),
  setKeyMode: (keyMode) => set({ keyMode }),
  setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
  setInputDialog: (dialog) => set({ inputDialog: dialog }),
  toggleLeftPanel: () => set((s) => ({ showLeftPanel: !s.showLeftPanel })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleHeaderCollapsed: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
  setToast: (toast) => set({ toast }),
  setShowBackConfirm: (show) => set({ showBackConfirm: show }),
  setNoteHeight: (height) => set({ noteHeight: Math.max(1, Math.min(8, height)) }),

  // A-B Loop
  setLoopA: (beat) => set({ loopA: beat }),
  setLoopB: (beat) => set({ loopB: beat }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),

  // --- Patterns ---
  applyPattern: (pattern, laneIds, startBeat, startColumn, keysound) => {
    const s = get();
    if (pattern.notes.length === 0 || laneIds.length === 0) return;
    s.pushUndo('Apply pattern');
    const converter = getConverter(get);
    const startColIdx = laneIds.indexOf(startColumn);
    const baseCol = startColIdx >= 0 ? startColIdx : 0;
    let nextId = s.nextNoteId;
    const newNotes: EditableBMSNote[] = [];
    for (const pn of pattern.notes) {
      const colIdx = baseCol + pn.columnIndex;
      if (colIdx < 0 || colIdx >= laneIds.length) continue;
      const beat = startBeat + pn.beatOffset;
      if (beat < 0) continue;
      const { measure, fraction } = converter.beatToMF(beat);
      const endBeat = pn.endBeatOffset !== undefined ? startBeat + pn.endBeatOffset : undefined;
      newNotes.push({
        id: `note-${nextId++}`,
        beat,
        column: laneIds[colIdx],
        noteType: pn.noteType || 'playable',
        keysound,
        measure,
        fraction,
        channel: '',
        endBeat,
      } as EditableBMSNote);
    }
    const newIndex = new Map(s._noteIndex);
    for (const n of newNotes) {
      if (n.noteType === 'playable' && n.column) {
        newIndex.set(noteIndexKey(n.beat, n.column), n.id);
      }
    }
    set({
      notes: [...s.notes, ...newNotes],
      nextNoteId: nextId,
      _noteIndex: newIndex,
      hasUnsavedChanges: true,
      selectedNotes: new Set(newNotes.map((n) => n.id)),
    });
  },

  selectionToPatternData: (laneIds) => {
    const s = get();
    if (s.selectedNotes.size === 0) return null;
    const selected = s.notes.filter((n) => s.selectedNotes.has(n.id));
    if (selected.length === 0) return null;
    const minBeat = Math.min(...selected.map((n) => n.beat));
    const maxBeat = Math.max(...selected.map((n) => n.endBeat ?? n.beat));
    const colIndices = selected.map((n) => laneIds.indexOf(n.column)).filter((i) => i >= 0);
    if (colIndices.length === 0) return null;
    const minCol = Math.min(...colIndices);
    const notes: PatternNote[] = selected.map((n) => {
      const colIdx = laneIds.indexOf(n.column);
      return {
        beatOffset: n.beat - minBeat,
        columnIndex: (colIdx >= 0 ? colIdx : 0) - minCol,
        noteType: n.noteType,
        endBeatOffset: n.endBeat !== undefined ? n.endBeat - minBeat : undefined,
      };
    });
    const columnCount = Math.max(...notes.map((n) => n.columnIndex)) + 1;
    const beatLength = maxBeat - minBeat || 0.25;
    return { notes, columnCount, beatLength };
  },
}));
