import { create } from 'zustand';
import type {
  EditableBMSNote,
  BMSBpmChange,
  BMSStopEvent,
  BMSHeaderData,
  EditableBMSChart,
  NoteType,
} from '@rhythm-archive/bms-core';
import type { EditorTool, SelectedNoteType, GridSnap } from '@rhythm-archive/bms-editor';

// --- Types ---

export interface UndoEntry {
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  description: string;
}

export type AudioPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

export interface InputDialog {
  type: 'bpm-add' | 'bpm-edit' | 'stop-add' | 'stop-edit';
  defaultValue: string;
  beat?: number;
  bpmChange?: BMSBpmChange;
  stopEvent?: BMSStopEvent;
}

// --- Helpers ---

function beatToMF(beat: number): { measure: number; fraction: number } {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
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
  inputDialog: InputDialog | null;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  headerCollapsed: boolean;
  toast: { message: string; type: 'success' | 'error' } | null;
  showBackConfirm: boolean;

  // --- Actions ---

  // Initialization
  reset: () => void;
  initFromChart: (chart: EditableBMSChart, rawNotes: EditableBMSNote[], nextId: number) => void;

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

  // BPM / STOP
  changeBpm: (beat: number, bpm: number) => void;
  requestBpmAdd: (beat: number) => void;
  requestBpmEdit: (bpmChange: BMSBpmChange) => void;
  requestStopAdd: (beat: number) => void;
  requestStopEdit: (stopEvent: BMSStopEvent) => void;
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
  setHasUnsavedChanges: (value: boolean) => void;
  setInputDialog: (dialog: InputDialog | null) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleHeaderCollapsed: () => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  setShowBackConfirm: (show: boolean) => void;

  // A-B Loop
  setLoopA: (beat: number | null) => void;
  setLoopB: (beat: number | null) => void;
  toggleMetronome: () => void;
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
  inputDialog: null as InputDialog | null,
  showLeftPanel: true,
  showRightPanel: true,
  headerCollapsed: false,
  toast: null as { message: string; type: 'success' | 'error' } | null,
  showBackConfirm: false,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  // --- Initialization ---
  reset: () => set(initialState),

  initFromChart: (chart, rawNotes, nextId) =>
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
    }),

  // --- Undo / Redo ---
  pushUndo: (description) => {
    const { notes, bpmChanges, stopEvents } = get();
    set((s) => ({
      undoStack: [...s.undoStack.slice(-50), { notes: [...notes], bpmChanges: [...bpmChanges], stopEvents: [...stopEvents], description }],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack, notes, bpmChanges, stopEvents } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    set({
      redoStack: [...get().redoStack, { notes: [...notes], bpmChanges: [...bpmChanges], stopEvents: [...stopEvents], description: entry.description }],
      notes: entry.notes,
      bpmChanges: entry.bpmChanges,
      stopEvents: entry.stopEvents,
      undoStack: undoStack.slice(0, -1),
      hasUnsavedChanges: true,
    });
  },

  redo: () => {
    const { redoStack, notes, bpmChanges, stopEvents } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    set({
      undoStack: [...get().undoStack, { notes: [...notes], bpmChanges: [...bpmChanges], stopEvents: [...stopEvents], description: entry.description }],
      notes: entry.notes,
      bpmChanges: entry.bpmChanges,
      stopEvents: entry.stopEvents,
      redoStack: redoStack.slice(0, -1),
      hasUnsavedChanges: true,
    });
  },

  // --- Notes ---
  addNote: (note) => {
    const s = get();
    s.pushUndo('Add note');
    const id = `note-${s.nextNoteId}`;
    const { measure, fraction } = beatToMF(note.beat);
    set({
      notes: [...s.notes, { ...note, id, measure, fraction } as EditableBMSNote],
      nextNoteId: s.nextNoteId + 1,
      hasUnsavedChanges: true,
    });
  },

  deleteNotes: (noteIds) => {
    const s = get();
    s.pushUndo('Delete notes');
    const idsSet = new Set(noteIds);
    set({
      notes: s.notes.filter((n) => !idsSet.has(n.id)),
      selectedNotes: new Set(),
      hasUnsavedChanges: true,
    });
  },

  moveNotes: (noteIds, delta, laneIds) => {
    const s = get();
    s.pushUndo('Move notes');
    const idsSet = new Set(noteIds);
    set({
      notes: s.notes.map((n) => {
        if (!idsSet.has(n.id)) return n;
        const newBeat = n.beat + (delta.beat || 0);
        const newEndBeat = n.endBeat !== undefined ? n.endBeat + (delta.beat || 0) : undefined;
        let newColumn = n.column;
        if (delta.columnDelta && laneIds.length > 0) {
          const currentIndex = laneIds.indexOf(n.column);
          if (currentIndex >= 0) {
            const newIndex = Math.max(0, Math.min(laneIds.length - 1, currentIndex + delta.columnDelta));
            newColumn = laneIds[newIndex];
          }
        }
        const { measure, fraction } = beatToMF(newBeat);
        return { ...n, beat: newBeat, endBeat: newEndBeat, column: newColumn, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
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
    set({
      notes: s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const updated = { ...n, ...updates };
        if (updates.beat !== undefined) {
          const { measure, fraction } = beatToMF(updated.beat);
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
    const shiftBeat = atMeasure * 4; // 4 beats per measure (4/4)
    const shiftAmount = 4;
    set({
      notes: s.notes.map((n) => {
        if (n.beat < shiftBeat) return n;
        const newBeat = n.beat + shiftAmount;
        const { measure, fraction } = beatToMF(newBeat);
        const newEndBeat = n.endBeat !== undefined ? n.endBeat + shiftAmount : undefined;
        return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
      }),
      bpmChanges: s.bpmChanges.map((b) => {
        const beat = b.measure * 4 + b.fraction * 4;
        if (beat < shiftBeat) return b;
        const newBeat = beat + shiftAmount;
        const { measure, fraction } = beatToMF(newBeat);
        return { ...b, measure, fraction };
      }),
      stopEvents: s.stopEvents.map((ev) => {
        const beat = ev.measure * 4 + ev.fraction * 4;
        if (beat < shiftBeat) return ev;
        const newBeat = beat + shiftAmount;
        const { measure, fraction } = beatToMF(newBeat);
        return { ...ev, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
  },

  deleteMeasure: (atMeasure) => {
    const s = get();
    s.pushUndo('Delete measure');
    const startBeat = atMeasure * 4;
    const endBeat = startBeat + 4;
    set({
      notes: s.notes
        .filter((n) => n.beat < startBeat || n.beat >= endBeat)
        .map((n) => {
          if (n.beat < endBeat) return n;
          const newBeat = n.beat - 4;
          const { measure, fraction } = beatToMF(newBeat);
          const newEndBeat = n.endBeat !== undefined ? n.endBeat - 4 : undefined;
          return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
        }),
      bpmChanges: s.bpmChanges
        .filter((b) => {
          const beat = b.measure * 4 + b.fraction * 4;
          return beat < startBeat || beat >= endBeat;
        })
        .map((b) => {
          const beat = b.measure * 4 + b.fraction * 4;
          if (beat < endBeat) return b;
          const newBeat = beat - 4;
          const { measure, fraction } = beatToMF(newBeat);
          return { ...b, measure, fraction };
        }),
      stopEvents: s.stopEvents
        .filter((ev) => {
          const beat = ev.measure * 4 + ev.fraction * 4;
          return beat < startBeat || beat >= endBeat;
        })
        .map((ev) => {
          const beat = ev.measure * 4 + ev.fraction * 4;
          if (beat < endBeat) return ev;
          const newBeat = beat - 4;
          const { measure, fraction } = beatToMF(newBeat);
          return { ...ev, measure, fraction };
        }),
      hasUnsavedChanges: true,
    });
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
  },

  flipNotes: () => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    const selected = s.notes.filter((n) => s.selectedNotes.has(n.id));
    if (selected.length < 2) return;
    const minBeat = Math.min(...selected.map((n) => n.beat));
    const maxBeat = Math.max(...selected.map((n) => n.beat));
    s.pushUndo('Flip notes');
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const newBeat = maxBeat - (n.beat - minBeat);
        const { measure, fraction } = beatToMF(newBeat);
        return { ...n, beat: newBeat, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
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
  },

  quantizeNotes: () => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    s.pushUndo('Quantize notes');
    const gridStep = 4 / s.gridSnap;
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id)) return n;
        const newBeat = Math.round(n.beat / gridStep) * gridStep;
        const { measure, fraction } = beatToMF(newBeat);
        const newEndBeat = n.endBeat !== undefined
          ? Math.round(n.endBeat / gridStep) * gridStep
          : undefined;
        return { ...n, beat: newBeat, endBeat: newEndBeat, measure, fraction };
      }),
      hasUnsavedChanges: true,
    });
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
    if (ids.length > 0) s.deleteNotes(ids);
  },

  paste: () => {
    const s = get();
    if (s.clipboard.length === 0) return;
    const minBeat = Math.min(...s.clipboard.map((n) => n.beat));
    const offset = s.currentBeat - minBeat;
    s.pushUndo('Paste notes');
    let nextId = s.nextNoteId;
    const pasted = s.clipboard.map((n) => {
      const newBeat = n.beat + offset;
      const { measure, fraction } = beatToMF(newBeat);
      return {
        ...n,
        id: `note-${nextId++}`,
        beat: newBeat,
        endBeat: n.endBeat !== undefined ? n.endBeat + offset : undefined,
        measure,
        fraction,
      };
    });
    set({
      notes: [...s.notes, ...pasted],
      nextNoteId: nextId,
      hasUnsavedChanges: true,
    });
  },

  // --- BPM / STOP ---
  changeBpm: (beat, bpm) => {
    const s = get();
    s.pushUndo('Change BPM');
    const { measure, fraction } = beatToMF(beat);
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
          const { measure, fraction } = beatToMF(dialog.beat);
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
    }
    set({ inputDialog: null });
  },

  // --- Headers ---
  changeHeader: (field, value) => {
    set((s) => {
      if (!s.headers) return {};
      return { headers: { ...s.headers, [field]: value }, hasUnsavedChanges: true };
    });
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
  setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
  setInputDialog: (dialog) => set({ inputDialog: dialog }),
  toggleLeftPanel: () => set((s) => ({ showLeftPanel: !s.showLeftPanel })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleHeaderCollapsed: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
  setToast: (toast) => set({ toast }),
  setShowBackConfirm: (show) => set({ showBackConfirm: show }),

  // A-B Loop
  setLoopA: (beat) => set({ loopA: beat }),
  setLoopB: (beat) => set({ loopB: beat }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
}));
