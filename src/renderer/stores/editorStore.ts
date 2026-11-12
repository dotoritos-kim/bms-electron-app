import { create } from 'zustand';
import i18next from 'i18next';
import type {
  EditableBMSNote,
  BMSBpmChange,
  BMSStopEvent,
  BMSHeaderData,
  EditableBMSChart,
  EditableChartStyle,
  NoteType,
} from '@rhythm-archive/bms-core';
import { styleForKeyMode, columnMappingForStyle, canonicalObjectId, isBase62Headers } from '@rhythm-archive/bms-core';
import { isKeyLane } from '../lib/autoChart';
import type { GeneratedNote } from '../lib/autoChart';
import { playedLanes } from '../lib/keyModeLanes';
import type { EditorTool, SelectedNoteType, GridSnap, KeyMode } from '@rhythm-archive/bms-editor';
import { getLaneIds, snapBeatToMeasureGrid, gridStepAt } from '@rhythm-archive/bms-editor';
import type { PatternTemplate, PatternNote } from '../lib/patternTemplates';
import { createBeatConverter, beatToMF44 } from '../lib/beatConverter';
import type { BeatConverter, MeasureFraction } from '../lib/beatConverter';
import { beatToTick, tickToBeat, TICKS_PER_BEAT } from '../lib/tickUtils';
import { computeBgmLanes, settleBgmLanes, type BgmLaneLayout } from '../lib/bgmLanes';
import { buildKeysoundPool, matchKeysounds } from '../lib/autoKeysound';

// --- Raw header parser (for applyRawHeaders action) ---

function parseRawHeaderText(raw: string): Partial<BMSHeaderData> {
  const result: Partial<BMSHeaderData> = {
    wav: new Map(),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(),
  };
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const key = trimmed.slice(1, spaceIdx).toUpperCase();
    const value = trimmed.slice(spaceIdx + 1).trim();
    if (key.startsWith('WAV') && key.length > 3) {
      result.wav!.set(key.slice(3), value);
    } else if (key.startsWith('BMP') && key.length > 3) {
      result.bmp!.set(key.slice(3), value);
    } else if (key.startsWith('BPM') && key.length > 3) {
      result.bpmDef!.set(key.slice(3), parseFloat(value));
    } else if (key.startsWith('STOP') && key.length > 4) {
      result.stopDef!.set(key.slice(4), parseInt(value, 10));
    } else {
      switch (key) {
        case 'PLAYER': result.player = parseInt(value, 10); break;
        case 'GENRE': result.genre = value; break;
        case 'TITLE': result.title = value; break;
        case 'SUBTITLE': result.subtitle = value; break;
        case 'ARTIST': result.artist = value; break;
        case 'SUBARTIST': result.subartist = value; break;
        case 'BPM': result.bpm = parseFloat(value); break;
        case 'PLAYLEVEL': result.playlevel = parseInt(value, 10); break;
        case 'RANK': result.rank = parseInt(value, 10); break;
        case 'TOTAL': result.total = parseFloat(value); break;
        case 'DIFFICULTY': result.difficulty = parseInt(value, 10); break;
        case 'STAGEFILE': result.stagefile = value; break;
        case 'BANNER': result.banner = value; break;
        case 'BACKBMP': result.backbmp = value; break;
        case 'LNTYPE': result.lntype = parseInt(value, 10); break;
        case 'LNOBJ': result.lnobj = value; break;
        default: result.custom!.set(key, value); break;
      }
    }
  }
  return result;
}

// --- Types ---

export interface UndoEntry {
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  timeSignatures: Map<number, number>;
  headers: BMSHeaderData | null;
  bgaEvents: EditableBMSChart['bgaEvents'] | undefined;
  description: string;
  /** Measure-numbered editor data; only captured by measure insert/delete. */
  measureData?: { bookmarks: EditorState['bookmarks']; gridSnapOverrides: Map<number, number> };
}

/** Cap on undo/redo history depth (entries beyond this are dropped oldest-first). */
const MAX_UNDO_HISTORY = 50;

export type AudioPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface InputDialog {
  type: 'bpm-add' | 'bpm-edit' | 'stop-add' | 'stop-edit' | 'timesig-edit';
  defaultValue: string;
  beat?: number;
  measure?: number;
  bpmChange?: BMSBpmChange;
  stopEvent?: BMSStopEvent;
}

/** Per-layer settings (visibility, lock, opacity) */
export interface LayerSettings {
  visible: boolean;
  locked: boolean;
  opacity: number; // 0.0 ~ 1.0
}

/** Full layer configuration */
export interface LayerConfig {
  playable: LayerSettings;
  invisible: LayerSettings;
  landmine: LayerSettings;
  bgm: LayerSettings;
}

/** Layer a note belongs to (by its note type). */
function noteLayer(n: { noteType?: string }): keyof LayerConfig {
  const t = n.noteType || 'playable';
  return (t === 'invisible' || t === 'landmine' || t === 'bgm') ? t : 'playable';
}

/** Only playable lane notes can be long notes. */
function canBeLongNote(n: { noteType?: string; column?: string }): boolean {
  return noteLayer(n) === 'playable' && n.column !== undefined;
}

/** True when the note's layer is locked (edits must leave it alone). */
function isNoteLocked(layerConfig: LayerConfig, n: { noteType?: string }): boolean {
  return layerConfig[noteLayer(n)]?.locked === true;
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  playable: { visible: true, locked: false, opacity: 1.0 },
  invisible: { visible: true, locked: false, opacity: 0.4 },
  landmine: { visible: true, locked: false, opacity: 1.0 },
  bgm: { visible: true, locked: false, opacity: 0.6 },
};

/** Advanced selection filter conditions */
export interface NoteSelectionFilter {
  /** Layer filter (null = all layers) */
  noteTypes?: Array<'playable' | 'invisible' | 'landmine' | 'bgm'>;
  /** Measure range (inclusive) */
  measureRange?: { from: number; to: number };
  /** Column filter (null = all columns) */
  columns?: string[];
  /** Keysound filter (null = all keysounds) */
  keysounds?: string[];
  /** Add to existing selection (true) or replace (false) */
  additive?: boolean;
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

/** Used internally by store: performs beatToMF using timeSignatures via get() */
function storeBeatToMF(getState: () => EditorState, beat: number): MeasureFraction {
  const converter = getState()._beatConverter;
  if (converter) return converter.beatToMF(beat);
  return beatToMF44(beat);
}

/** Used internally by store: measure/fraction → beat */
function storeMfToBeat(getState: () => EditorState, measure: number, fraction: number): number {
  const converter = getState()._beatConverter;
  if (converter) return converter.mfToBeat(measure, fraction);
  return measure * 4 + fraction * 4;
}

/** Obtain converter directly for use as a loop-local cache */
function getConverter(getState: () => EditorState): BeatConverter {
  return getState()._beatConverter ?? createBeatConverter(new Map());
}

/**
 * Sync helper: beat → { tick, beat, measure, fraction }. The tick (and `beat`)
 * are rounded to the 960-ticks-per-beat grid; measure/fraction keep the exact
 * position, so a note on a grid the ticks cannot hold (septuplets, measures of
 * odd length) is written to the file exactly where it was placed.
 */
function syncFromBeat(beat: number, converter: BeatConverter): { tick: number; beat: number; measure: number; fraction: number } {
  const tick = beatToTick(beat);
  const { measure, fraction } = exactMF(beat, converter);
  return { tick, beat: tickToBeat(tick), measure, fraction };
}

/** measure/fraction of an exact beat; float noise at a barline goes to the barline. */
function exactMF(beat: number, converter: BeatConverter): MeasureFraction {
  const mf = converter.beatToMF(Math.max(0, beat));
  if (mf.fraction > 1 - 1e-9) return { measure: mf.measure + 1, fraction: 0 };
  if (mf.fraction < 1e-9) return { measure: mf.measure, fraction: 0 };
  return mf;
}

/**
 * Exact beat of a position: its measure/fraction when they still match the
 * tick (within the tick's rounding), the tick otherwise. Moving or shifting a
 * note from here keeps it on its grid instead of on the nearest tick.
 */
function exactBeat(tick: number, measure: number | undefined, fraction: number | undefined, converter: BeatConverter): number {
  if (typeof measure === 'number' && typeof fraction === 'number' && fraction >= 0 && fraction < 1) {
    const beat = converter.mfToBeat(measure, fraction);
    if (Math.abs(beat * TICKS_PER_BEAT - tick) <= 0.5 + 1e-3) return beat;
  }
  return tickToBeat(tick);
}

/** Exact start beat of a note (see exactBeat). */
function noteStartBeat(n: EditableBMSNote, converter: BeatConverter): number {
  return exactBeat(n.tick ?? beatToTick(n.beat), n.measure, n.fraction, converter);
}

/** Exact end beat of a long note, or undefined (see exactBeat). */
function noteEndBeat(n: EditableBMSNote, converter: BeatConverter): number | undefined {
  const endTick = n.endTick ?? (n.endBeat !== undefined ? beatToTick(n.endBeat) : undefined);
  if (endTick === undefined) return undefined;
  return exactBeat(endTick, n.endMeasure, n.endFraction, converter);
}

/** Long-note end fields for an exact end beat (all undefined for a short note). */
function syncEndFromBeat(endBeat: number | undefined, converter: BeatConverter): {
  endTick: number | undefined; endBeat: number | undefined; endMeasure: number | undefined; endFraction: number | undefined;
} {
  if (endBeat === undefined) return { endTick: undefined, endBeat: undefined, endMeasure: undefined, endFraction: undefined };
  const endTick = beatToTick(endBeat);
  const { measure, fraction } = exactMF(endBeat, converter);
  return { endTick, endBeat: tickToBeat(endTick), endMeasure: measure, endFraction: fraction };
}

/** A note an action (pattern / AI chart) wants to place. */
interface PlacementRequest {
  beat: number;
  column: string;
  noteType: NoteType;
  endBeat?: number;
}

export interface PlaceResult {
  /** Notes actually placed. */
  placed: number;
  /** Notes skipped because no BGM/invisible note was sounding at their beat. */
  noKeysound: number;
}

/**
 * Builds the notes for placement requests.
 *
 * A playable note takes over the BGM/invisible note sounding at its beat (the
 * source is moved, not copied; listed in `consumedIds`). Where nothing is
 * sounding it is skipped: a keysound-less note ('00') cannot be written to a
 * BMS file and would vanish on save. Notes of other types (landmine, invisible,
 * bgm) are not takeover candidates and keep the current keysound. Notes in
 * locked layers are never taken.
 */
function buildPlacement(
  s: EditorState,
  requests: readonly PlacementRequest[],
  converter: BeatConverter,
): { notes: EditableBMSNote[]; consumedIds: Set<string>; noKeysound: number; nextId: number } {
  const ordered = [...requests].sort((a, b) => a.beat - b.beat);
  const takeovers = ordered.filter((r) => noteLayer(r) === 'playable');
  const pool = buildKeysoundPool(s.notes.filter((n) => !isNoteLocked(s.layerConfig, n)));
  const { matches, consumedIds } = matchKeysounds(pool, takeovers.map((r) => r.beat));
  const matchOf = new Map(takeovers.map((r, i) => [r, matches[i]]));

  let nextId = s.nextNoteId;
  let noKeysound = 0;
  const notes: EditableBMSNote[] = [];
  for (const r of ordered) {
    const taken = noteLayer(r) === 'playable' ? matchOf.get(r) : { keysound: s.currentKeysound, additionalKeysounds: undefined };
    if (!taken) { noKeysound++; continue; }
    notes.push({
      id: `note-${nextId++}`,
      ...syncFromBeat(r.beat, converter),
      column: r.column,
      noteType: r.noteType,
      keysound: taken.keysound,
      additionalKeysounds: taken.additionalKeysounds,
      channel: '',
      ...syncEndFromBeat(r.endBeat, converter),
    } as EditableBMSNote);
  }
  return { notes, consumedIds: new Set(consumedIds), noKeysound, nextId };
}

/** Shared: recalculate measure/fraction for notes/bpmChanges/stopEvents when timeSignatures change */
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
    // Notes keep their time; measure/fraction follow the new measure lengths.
    notes: s.notes.map((n) => {
      const tick = n.tick ?? beatToTick(n.beat);
      const { measure, fraction } = exactMF(noteStartBeat(n, oldConverter), newConverter);
      const end = noteEndBeat(n, oldConverter);
      const endMF = end !== undefined ? exactMF(end, newConverter) : undefined;
      return {
        ...n, tick, beat: tickToBeat(tick), measure, fraction,
        ...(endMF ? { endMeasure: endMF.measure, endFraction: endMF.fraction } : {}),
      };
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

/**
 * Canonical object id for the chart's base: base36 ids are case-insensitive
 * (upper-cased), `#BASE 62` ids are case-sensitive (kept as written).
 */
function idCanon(headers: BMSHeaderData | null): (id: string) => string {
  const base62 = isBase62Headers(headers);
  return (id: string) => canonicalObjectId(id, base62);
}

/**
 * Channel layout to save a chart in. The layout the file was read with is kept
 * when it has a channel for every lane of the key mode, so saving does not move
 * notes to other channels (e.g. an 8-key keyboard chart opened as 9K stays on
 * 11-18 instead of the PMS 22-25). Otherwise the key mode's own layout.
 */
export function writeStyleFor(keyMode: KeyMode, readStyle?: EditableChartStyle): EditableChartStyle {
  const target = styleForKeyMode(keyMode);
  // Qwilight reads #4K / #6K / #8K lanes from fixed IIDX channels only
  if (playedLanes(keyMode)) return target;
  if (!readStyle || (readStyle.id === target.id && readStyle.isDP === target.isDP)) return target;
  const columns = new Set(Object.values(columnMappingForStyle(readStyle)));
  return getLaneIds(keyMode).every((id) => columns.has(id)) ? readStyle : target;
}

/** Qwilight extension commands that select the U_E (Yuipack) key modes. */
const KEY_MODE_COMMANDS: Partial<Record<KeyMode, string>> = { '4K': '4K', '6K': '6K', '8K': '8K' };

/**
 * Headers with the value-less `#4K` / `#6K` / `#8K` command matching `keyMode`
 * (and none of the others): BMS players tell these modes apart only by it.
 * A `#KEYMODE` header (written for new charts) follows the mode as well.
 */
export function withKeyModeCommand(headers: BMSHeaderData, keyMode: KeyMode): BMSHeaderData {
  const want = KEY_MODE_COMMANDS[keyMode];
  const commands = Object.values(KEY_MODE_COMMANDS);
  const custom = new Map(headers.custom);
  for (const [k, v] of headers.custom) {
    const key = k.toUpperCase();
    // A command with a value is not the command (Qwilight ignores it): rewrite it
    if (commands.includes(key) && (key !== want || v || k !== key)) custom.delete(k);
    if (key === 'KEYMODE' && v !== keyMode) custom.set(k, keyMode);
  }
  if (want && !custom.has(want)) custom.set(want, '');
  const same = custom.size === headers.custom.size
    && [...custom].every(([k, v]) => headers.custom.get(k) === v);
  return same ? headers : { ...headers, custom };
}

/** References of the chart data at the last load/save. */
interface SavedPoint {
  notes: EditableBMSNote[];
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  timeSignatures: Map<number, number>;
  headers: BMSHeaderData | null;
  /** Key mode decides the saved channel layout, so changing it is an unsaved change too. */
  keyMode?: KeyMode;
}

/**
 * `placed` (BGM notes just moved or pasted) with any lane that is taken on its
 * tick, by `existing` or by another of them, changed to the nearest free one.
 */
function settleBgm<T extends EditableBMSNote>(existing: readonly EditableBMSNote[], placed: T[], direction: 1 | -1 = 1): T[] {
  const lanes = settleBgmLanes(existing, placed, direction);
  return lanes.size === 0 ? placed : placed.map((n) => (lanes.has(n.id) ? { ...n, bgmChannel: lanes.get(n.id) } : n));
}

function savedPointOf(s: SavedPoint): SavedPoint {
  return {
    notes: s.notes, bpmChanges: s.bpmChanges, stopEvents: s.stopEvents,
    timeSignatures: s.timeSignatures, headers: s.headers, keyMode: s.keyMode,
  };
}

/** True unless `entry` is exactly the saved chart (state is immutable, so references suffice). */
function differsFromSaved(entry: SavedPoint, saved: SavedPoint | null): boolean {
  return !saved
    || entry.notes !== saved.notes
    || entry.bpmChanges !== saved.bpmChanges
    || entry.stopEvents !== saved.stopEvents
    || entry.timeSignatures !== saved.timeSignatures
    || entry.headers !== saved.headers;
}

/** Undo/redo snapshot of the chart data (references; state is updated immutably). */
function snapshotOf(
  s: Pick<EditorState, 'notes' | 'bpmChanges' | 'stopEvents' | 'timeSignatures' | 'headers' | 'editableChart' | 'bookmarks' | 'gridSnapOverrides'>,
  description: string,
  withMeasureData = false,
): UndoEntry {
  return {
    notes: s.notes,
    bpmChanges: s.bpmChanges,
    stopEvents: s.stopEvents,
    timeSignatures: s.timeSignatures,
    headers: s.headers,
    bgaEvents: s.editableChart?.bgaEvents,
    description,
    ...(withMeasureData ? { measureData: { bookmarks: s.bookmarks, gridSnapOverrides: s.gridSnapOverrides } } : {}),
  };
}

/** Shift measure-keyed editor data after inserting (+1) or deleting (-1) `atMeasure`. */
function shiftMeasureData(
  bookmarks: EditorState['bookmarks'],
  overrides: Map<number, number>,
  atMeasure: number,
  dir: 1 | -1,
): { bookmarks: EditorState['bookmarks']; gridSnapOverrides: Map<number, number> } {
  const move = (m: number) => (m >= atMeasure ? m + dir : m);
  const nextBookmarks = bookmarks
    .filter((b) => !(dir === -1 && b.measure === atMeasure))
    .map((b) => (b.measure > atMeasure || (dir === 1 && b.measure === atMeasure) ? { ...b, measure: move(b.measure) } : b));
  const nextOverrides = new Map<number, number>();
  for (const [m, snap] of overrides) {
    if (dir === -1 && m === atMeasure) continue;
    nextOverrides.set(m > atMeasure || (dir === 1 && m === atMeasure) ? move(m) : m, snap);
  }
  return { bookmarks: nextBookmarks, gridSnapOverrides: nextOverrides };
}

/** pushUndo variant that also records bookmarks / per-measure grid overrides. */
function pushMeasureUndo(
  get: () => EditorState,
  set: (fn: (prev: EditorState) => Partial<EditorState>) => void,
  description: string,
): void {
  const entry = snapshotOf(get(), description, true);
  set((prev) => ({
    undoStack: [...prev.undoStack.slice(-(MAX_UNDO_HISTORY - 1)), entry],
    redoStack: [],
  }));
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
  /** Chart data references at the last load/save: undo back to them is "clean". */
  _savedPoint: SavedPoint | null;

  // Tool / Selection
  activeTool: EditorTool;
  gridSnap: GridSnap;
  /** Per-measure gridSnap overrides (measure number → gridSnap value) */
  gridSnapOverrides: Map<number, number>;
  snapEnabled: boolean;
  /** Per-layer visibility / lock / opacity settings */
  layerConfig: LayerConfig;
  /** Minimum long-note length (in beats, default 0.25 = 1/16 beat) */
  minLnLength: number;
  /** Timeline bookmarks */
  bookmarks: Array<{ measure: number; name: string; color?: string }>;
  /** Note groups */
  noteGroups: Array<{ id: string; name: string; noteIds: string[]; color?: string }>;
  selectedNotes: Set<string>;
  selectedNoteType: SelectedNoteType;
  currentKeysound: string;
  currentBeat: number;

  // Keysound highlight
  /** Currently highlighted keysound ID (null = inactive) */
  highlightKeysound: string | null;

  // Custom Colors / Skin
  /** Custom note colors (null = default theme) */
  customColors: {
    playable?: string;
    invisible?: string;
    landmine?: string;
    bgm?: string;
    selection?: string;
    background?: string;
  };

  // BGM Channel Solo/Mute
  /** Solo channel number (null = no solo, all channels play) */
  bgmSoloChannel: number | null;
  /** Set of muted BGM channel numbers */
  bgmMutedChannels: Set<number>;

  // A/B Comparison
  /** Comparison snapshot (alternated with current state during playback) */
  comparisonSnapshot: { notes: EditableBMSNote[]; bpmChanges: BMSBpmChange[] } | null;
  /** Whether comparison mode is active */
  comparisonActive: boolean;

  // Clipboard
  clipboard: EditableBMSNote[];
  /** Clipboard history (up to 10 entries) */
  clipboardHistory: EditableBMSNote[][];

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
  showMinimap: boolean;
  headerCollapsed: boolean;
  toast: { message: string; type: 'success' | 'error' } | null;
  showBackConfirm: boolean;

  // Internal: beat converter (recreated when timeSignatures change)
  _beatConverter: BeatConverter | null;

  // --- Computed ---

  /** Assemble current state into a saveable EditableBMSChart */
  savableChart: () => EditableBMSChart | null;
  /** timeSignatures-aware beat → measure/fraction conversion */
  beatToMF: (beat: number) => MeasureFraction;
  /** timeSignatures-aware measure/fraction → beat conversion */
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
  addNote: (note: Omit<EditableBMSNote, 'id' | 'tick'>) => void;
  deleteNotes: (noteIds: string[]) => void;
  moveNotes: (noteIds: string[], delta: { beat?: number; columnDelta?: number }, laneIds: string[]) => void;
  selectNotes: (noteIds: string[], additive?: boolean) => void;
  updateNote: (noteId: string, updates: Partial<EditableBMSNote>) => void;
  selectAll: () => void;
  /** Condition-based note selection (layer / measure range / column / keysound filter) */
  selectByFilter: (filter: NoteSelectionFilter) => void;
  clearSelection: () => void;
  changeNoteType: (newType: NoteType, defaultColumn?: string) => void;
  /**
   * Turns the selected playable short notes into long notes one grid step
   * (at least minLnLength) long, stopping a grid step before the next note in
   * the lane. Returns how many notes changed.
   */
  convertToLongNotes: () => number;
  /** Turns the selected long notes back into short notes. Returns how many notes changed. */
  convertToShortNotes: () => number;
  /** Short → long when any selected short note can become one, otherwise long → short. */
  toggleLongNotes: () => number;

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
  /**
   * Converts notes between key lanes and BGM lanes in one undo step: distinct
   * BGM channels per tick (from `target.channel`), or the relative lane layout
   * kept from `target.column`.
   */
  convertNotes: (
    noteIds: string[],
    target: { kind: 'bgm'; channel: number } | { kind: 'playable'; column: string },
    laneIds: string[],
  ) => void;
  /**
   * Re-lays out the BGM lanes ('packed' = fill from the left per tick, 'source'
   * = the `#xxx01:` line each note was read from). One undo step; notes on a
   * locked BGM layer stay put. Returns how many notes changed lane.
   */
  relayoutBgmLanes: (layout: BgmLaneLayout) => number;
  removeKeysoundLayer: (noteId: string, layerIndex: number) => void;

  // Clipboard
  copy: () => void;
  cut: () => void;
  paste: () => void;
  /** Analyze paste for conflicts/out-of-range. Returns null if auto-executed (no conflicts). */
  preparePaste: (laneIds: string[]) => PasteAnalysis | null;
  /** Execute paste with user choice for conflicts */
  executePaste: (analysis: PasteAnalysis, choice: 'replace' | 'stack' | 'cancel') => void;
  /** Set a specific clipboard history entry as the current clipboard */
  selectClipboardHistory: (index: number) => void;

  // BPM / STOP
  changeBpm: (beat: number, bpm: number) => void;
  requestBpmAdd: (beat: number) => void;
  requestBpmEdit: (bpmChange: BMSBpmChange) => void;
  requestStopAdd: (beat: number) => void;
  requestStopEdit: (stopEvent: BMSStopEvent) => void;
  deleteStop: (stopEvent: BMSStopEvent) => void;
  requestTimeSignatureEdit: (measure: number) => void;
  submitInputDialog: (value: string) => void;

  // Headers
  changeHeader: (field: string, value: string | number) => void;

  // Keysound import
  updateHeadersWithWavDefs: (newWavDefs: Record<string, string>, description?: string) => void;
  /** Append many notes at once (auto-chart, pattern apply) with one undo entry; beats are normalised to ticks and the note index is rebuilt. */
  addNotesBulk: (notes: EditableBMSNote[], description?: string) => void;

  // Header Map mutations
  setCustomHeader: (key: string, value: string) => void;
  deleteCustomHeader: (key: string) => void;
  setWavDef: (key: string, value: string) => void;
  deleteWavDef: (key: string) => void;
  setBmpDef: (key: string, value: string) => void;
  deleteBmpDef: (key: string) => void;
  applyRawHeaders: (raw: string) => void;

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
  setSnapEnabled: (enabled: boolean) => void;
  toggleSnap: () => void;
  setGridSnapOverride: (measure: number, gridSnap: number | null) => void;
  /** Effective gridSnap for a given measure (override if set, otherwise default) */
  getGridSnapForMeasure: (measure: number) => number;
  setSelectedNoteType: (type: SelectedNoteType) => void;
  setCurrentKeysound: (keysound: string) => void;
  setCurrentBeat: (beat: number) => void;
  setKeyMode: (keyMode: KeyMode) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  /**
   * The chart was just written to its file: clears the unsaved flag and takes
   * each BGM note's lane as the line it now has in the file, so "as written
   * in the file" follows the file that was saved, not the one that was opened.
   */
  markSaved: () => void;
  /** The chart shown is not what is on disk (e.g. an opened autosave): unsaved until saved, undo included. */
  markUnsaved: () => void;
  setInputDialog: (dialog: InputDialog | null) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleMinimap: () => void;
  toggleHeaderCollapsed: () => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  setShowBackConfirm: (show: boolean) => void;
  setNoteHeight: (height: number) => void;

  // Layer
  setLayerVisible: (layer: keyof LayerConfig, visible: boolean) => void;
  setLayerLocked: (layer: keyof LayerConfig, locked: boolean) => void;
  setLayerOpacity: (layer: keyof LayerConfig, opacity: number) => void;
  resetLayerConfig: () => void;
  setMinLnLength: (length: number) => void;

  // Custom Colors
  setCustomColor: (key: string, color: string | null) => void;
  resetCustomColors: () => void;

  // BGM Channel Solo/Mute
  toggleBgmSolo: (channel: number) => void;
  toggleBgmMute: (channel: number) => void;
  clearBgmSoloMute: () => void;

  // A/B Comparison
  saveComparisonSnapshot: () => void;
  clearComparisonSnapshot: () => void;
  toggleComparison: () => void;

  // Bookmarks
  addBookmark: (measure: number, name: string, color?: string) => void;
  removeBookmark: (measure: number) => void;
  renameBookmark: (measure: number, name: string) => void;

  // Note Groups
  createGroup: (name: string, noteIds: string[], color?: string) => void;
  deleteGroup: (groupId: string) => void;
  selectGroup: (groupId: string) => void;
  ungroupSelected: () => void;

  // A-B Loop
  setLoopA: (beat: number | null) => void;
  setLoopB: (beat: number | null) => void;
  toggleMetronome: () => void;

  // Keysound management
  /** Set or clear the keysound highlight */
  setHighlightKeysound: (keysound: string | null) => void;
  /** Bulk-replace keysound across all notes (fromId → toId, including additionalKeysounds) */
  replaceKeysound: (fromId: string, toId: string) => void;
  /** Remove WAV definitions (cleanup of unused keysounds) */
  removeWavDefinitions: (keysoundIds: string[]) => void;

  // Patterns
  /** Playable notes take over the BGM/invisible keysound at their beat; see `buildPlacement`. */
  applyPattern: (pattern: PatternTemplate, laneIds: string[], startBeat: number, startColumn: string) => PlaceResult;
  /** AI chart notes: same takeover rule; `occupied` counts notes dropped for overlapping an existing note. */
  applyGeneratedNotes: (generated: GeneratedNote[], laneIds: string[]) => PlaceResult & { occupied: number };
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
  gridSnapOverrides: new Map<number, number>(),
  snapEnabled: true,
  layerConfig: { ...DEFAULT_LAYER_CONFIG },
  minLnLength: 0.25,
  bookmarks: [] as Array<{ measure: number; name: string; color?: string }>,
  noteGroups: [] as Array<{ id: string; name: string; noteIds: string[]; color?: string }>,
  highlightKeysound: null as string | null,
  customColors: {} as { playable?: string; invisible?: string; landmine?: string; bgm?: string; selection?: string; background?: string },
  bgmSoloChannel: null as number | null,
  bgmMutedChannels: new Set<number>(),
  comparisonSnapshot: null as { notes: EditableBMSNote[]; bpmChanges: BMSBpmChange[] } | null,
  comparisonActive: false,
  selectedNotes: new Set<string>(),
  selectedNoteType: 'playable' as SelectedNoteType,
  currentKeysound: '01',
  currentBeat: 0,
  clipboard: [] as EditableBMSNote[],
  clipboardHistory: [] as EditableBMSNote[][],
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
  noteHeight: 4,
  inputDialog: null as InputDialog | null,
  showLeftPanel: true,
  showRightPanel: true,
  showMinimap: true,
  headerCollapsed: false,
  toast: null as { message: string; type: 'success' | 'error' } | null,
  showBackConfirm: false,
  _beatConverter: null as BeatConverter | null,
  _noteIndex: new Map<string, string>(),
  _savedPoint: null as SavedPoint | null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  // --- Computed ---
  savableChart: () => {
    const s = get();
    if (!s.editableChart) return null;
    return {
      // Channel layout follows the current key mode (DP / PMS / keyboard) so
      // 2P and PMS lanes are written to their proper channels.
      style: s.keyMode ? writeStyleFor(s.keyMode, s.editableChart.style) : s.editableChart.style,
      headers: withKeyModeCommand(s.headers || s.editableChart.headers, s.keyMode),
      notes: s.notes,
      timeSignatures: s.timeSignatures,
      bpmChanges: s.bpmChanges,
      stopEvents: s.stopEvents,
      bgaEvents: s.editableChart.bgaEvents,
      // Channels the editor does not model (TEXT, JUDGE, extension lanes, ...)
      extraObjects: s.editableChart.extraObjects,
    };
  },

  beatToMF: (beat: number) => storeBeatToMF(get, beat),
  mfToBeat: (measure: number, fraction: number) => storeMfToBeat(get, measure, fraction),

  // --- Initialization ---
  reset: () => set({
    ...initialState,
    timeSignatures: new Map<number, number>(),
    selectedNotes: new Set<string>(),
    gridSnapOverrides: new Map<number, number>(),
    layerConfig: { ...DEFAULT_LAYER_CONFIG },
    bgmSoloChannel: null,
    bgmMutedChannels: new Set<number>(),
    _beatConverter: null,
    _noteIndex: new Map<string, string>(),
    _savedPoint: null,
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
      _savedPoint: savedPointOf({
        notes: rawNotes, bpmChanges: chart.bpmChanges, stopEvents: chart.stopEvents,
        timeSignatures: chart.timeSignatures, headers: chart.headers, keyMode: keyMode ?? get().keyMode,
      }),
      ...(keyMode ? { keyMode } : {}),
    });
  },

  // --- Undo / Redo ---
  pushUndo: (description) => {
    const s = get();
    try {
      // Snapshots hold references: every action replaces notes / headers /
      // events / maps immutably, so a deep clone (O(chart) per edit) is unneeded.
      const entry: UndoEntry = snapshotOf(s, description);
      set((prev) => ({
        undoStack: [...prev.undoStack.slice(-(MAX_UNDO_HISTORY - 1)), entry],
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
      const redoEntry: UndoEntry = snapshotOf(s, entry.description, entry.measureData !== undefined);
      const newConverter = createBeatConverter(entry.timeSignatures);
      set({
        redoStack: [...s.redoStack.slice(-(MAX_UNDO_HISTORY - 1)), redoEntry],
        notes: entry.notes,
        bpmChanges: entry.bpmChanges,
        stopEvents: entry.stopEvents,
        timeSignatures: entry.timeSignatures,
        headers: entry.headers,
        editableChart: s.editableChart ? { ...s.editableChart, bgaEvents: entry.bgaEvents ?? s.editableChart.bgaEvents } : null,
        _beatConverter: newConverter,
        _noteIndex: buildNoteIndex(entry.notes),
        ...(entry.measureData ?? {}),
        undoStack: s.undoStack.slice(0, -1),
        // Undo/redo do not touch the key mode; a changed mode keeps the chart dirty
        hasUnsavedChanges: differsFromSaved(entry, s._savedPoint) || s.keyMode !== s._savedPoint?.keyMode,
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
      const undoEntry: UndoEntry = snapshotOf(s, entry.description, entry.measureData !== undefined);
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
        ...(entry.measureData ?? {}),
        redoStack: s.redoStack.slice(0, -1),
        // Undo/redo do not touch the key mode; a changed mode keeps the chart dirty
        hasUnsavedChanges: differsFromSaved(entry, s._savedPoint) || s.keyMode !== s._savedPoint?.keyMode,
      });
    } catch (err) {
      console.error('[EditorStore] redo failed:', err);
    }
  },

  // --- Notes ---
  addNote: (note) => {
    if (note.beat < 0) return; // Prevent placing notes before measure 0
    const s = get();
    const id = `note-${s.nextNoteId}`;
    const converter = getConverter(get);
    const synced = syncFromBeat(note.beat, converter);
    const newNote = { ...note, id, ...synced, ...syncEndFromBeat(note.endBeat, converter) } as EditableBMSNote;
    const isPlayable = newNote.noteType === 'playable' && newNote.column;

    // Duplicate check for playable notes: auto-replace existing note at same beat+column
    if (isPlayable) {
      const key = noteIndexKey(newNote.beat, newNote.column);
      const indexedId = s._noteIndex.get(key);
      // Guard against a stale index entry (e.g. the note became BGM / moved):
      // only replace a playable note that sits at this beat+column.
      const existing = indexedId ? s.notes.find((n) => n.id === indexedId) : undefined;
      const existingId = existing && existing.noteType === 'playable'
        && existing.column === newNote.column && existing.beat === newNote.beat
        ? existing.id : undefined;
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

    // Auto-assign bgmChannel for new BGM notes
    if (newNote.noteType === 'bgm' && newNote.bgmChannel === undefined) {
      const maxChannel = s.notes
        .filter((n) => n.noteType === 'bgm' && n.tick === newNote.tick && n.bgmChannel !== undefined)
        .reduce((max, n) => Math.max(max, n.bgmChannel!), -1);
      newNote.bgmChannel = maxChannel + 1;
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
    // Locked layers are read-only: drop those ids before doing anything.
    const requested = new Set(noteIds);
    const idsSet = new Set(s.notes.filter((n) => requested.has(n.id) && !isNoteLocked(s.layerConfig, n)).map((n) => n.id));
    if (idsSet.size === 0) return;
    s.pushUndo('Delete notes');
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
    const requested = new Set(noteIds);
    const idsSet = new Set(s.notes.filter((n) => requested.has(n.id) && !isNoteLocked(s.layerConfig, n)).map((n) => n.id));
    if (idsSet.size === 0) return;
    s.pushUndo('Move notes');
    const converter = getConverter(get);
    const newIndex = new Map(s._noteIndex);
    // Remove old positions of moved playable notes
    for (const n of s.notes) {
      if (idsSet.has(n.id) && n.noteType === 'playable' && n.column) {
        const key = noteIndexKey(n.beat, n.column);
        if (newIndex.get(key) === n.id) newIndex.delete(key);
      }
    }
    // The delta is already snapped by the caller; re-snapping each note's
    // absolute position would merge off-grid notes (1/192, triplets...) together.
    // Moved from the exact position, so a note keeps its own grid (septuplets ...).
    const deltaBeat = delta.beat ?? 0;
    const movedRaw = s.notes.map((n) => {
      if (!idsSet.has(n.id)) return n;
      const start = noteStartBeat(n, converter);
      const newStart = Math.max(0, start + deltaBeat);
      const end = noteEndBeat(n, converter);
      const newEnd = end !== undefined ? newStart + (end - start) : undefined;
      let newColumn = n.column;
      let newBgmChannel = n.bgmChannel;
      if (delta.columnDelta && n.noteType === 'bgm') {
        // BGM lanes are channels, not key-mode columns.
        newBgmChannel = Math.max(0, (n.bgmChannel ?? 0) + delta.columnDelta);
      } else if (delta.columnDelta && laneIds.length > 0 && n.column !== undefined) {
        const currentIndex = laneIds.indexOf(n.column);
        if (currentIndex >= 0) {
          const idx = Math.max(0, Math.min(laneIds.length - 1, currentIndex + delta.columnDelta));
          newColumn = laneIds[idx];
        }
      }
      return {
        ...n, ...syncFromBeat(newStart, converter), ...syncEndFromBeat(newEnd, converter),
        column: newColumn, bgmChannel: newBgmChannel,
      };
    });
    // A moved BGM note must not land on a lane another BGM note has on that tick
    // (locked notes stay where they are and are placed around).
    const bgmLanes = settleBgmLanes(
      movedRaw.filter((n) => !idsSet.has(n.id)),
      movedRaw.filter((n) => idsSet.has(n.id)),
      (delta.columnDelta ?? 0) < 0 ? -1 : 1,
    );
    const movedNotes = bgmLanes.size === 0
      ? movedRaw
      : movedRaw.map((n) => (bgmLanes.has(n.id) ? { ...n, bgmChannel: bgmLanes.get(n.id) } : n));
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
          const synced = syncFromBeat(updated.beat, converter);
          updated.tick = synced.tick;
          updated.beat = synced.beat;
          updated.measure = synced.measure;
          updated.fraction = synced.fraction;
        }
        if (updates.endBeat !== undefined) {
          Object.assign(updated, syncEndFromBeat(updates.endBeat, converter));
        } else if ('endBeat' in updates) {
          updated.endTick = undefined;
          updated.endMeasure = undefined;
          updated.endFraction = undefined;
        }
        return updated;
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  convertNotes: (noteIds, target, laneIds) => {
    const s = get();
    const requested = new Set(noteIds);
    const targets = s.notes.filter((n) => requested.has(n.id) && !isNoteLocked(s.layerConfig, n));
    if (targets.length === 0) return;
    s.pushUndo(target.kind === 'bgm' ? 'Move notes to BGM' : 'Move notes to lanes');
    const updates = new Map<string, Partial<EditableBMSNote>>();

    if (target.kind === 'bgm') {
      // One channel per note within a tick, starting at the drop lane and
      // skipping channels already taken by other BGM notes on that tick.
      const taken = new Map<number, Set<number>>();
      const takenAt = (tick: number) => {
        let t = taken.get(tick);
        if (!t) { t = new Set(); taken.set(tick, t); }
        return t;
      };
      for (const n of s.notes) {
        if (n.noteType !== 'bgm' || requested.has(n.id)) continue;
        takenAt(n.tick).add(n.bgmChannel ?? 0);
      }
      const ordered = [...targets].sort((a, b) => a.tick - b.tick
        || laneIds.indexOf(a.column ?? '') - laneIds.indexOf(b.column ?? ''));
      for (const n of ordered) {
        const used = takenAt(n.tick);
        let ch = Math.max(0, target.channel);
        while (used.has(ch)) ch++;
        used.add(ch);
        updates.set(n.id, {
          noteType: 'bgm', column: undefined, bgmChannel: ch,
          endBeat: undefined, endTick: undefined, endMeasure: undefined, endFraction: undefined,
        });
      }
    } else {
      // Keep the notes' relative lane layout: the lowest channel / leftmost
      // column lands on the drop lane.
      const playable = laneIds.filter((id) => isKeyLane(id, s.keyMode));
      const lanes = playable.length > 0 ? playable : laneIds;
      if (lanes.length === 0) return;
      const startIdx = Math.max(0, lanes.indexOf(target.column));
      const rel = (n: EditableBMSNote) => (n.noteType === 'bgm'
        ? (n.bgmChannel ?? 0)
        : Math.max(0, lanes.indexOf(n.column ?? '')));
      const base = targets.reduce((m, n) => Math.min(m, rel(n)), Infinity);
      for (const n of targets) {
        const idx = Math.min(lanes.length - 1, startIdx + rel(n) - base);
        updates.set(n.id, { noteType: 'playable', column: lanes[idx], bgmChannel: undefined });
      }
    }

    const notes = s.notes.map((n) => {
      const u = updates.get(n.id);
      return u ? { ...n, ...u } : n;
    });
    set({ notes, _noteIndex: buildNoteIndex(notes), hasUnsavedChanges: true });
  },

  relayoutBgmLanes: (layout) => {
    const s = get();
    const locked = new Set(s.notes.filter((n) => n.noteType === 'bgm' && isNoteLocked(s.layerConfig, n)).map((n) => n.id));
    const lanes = computeBgmLanes(s.notes, layout, locked);
    let changed = 0;
    for (const n of s.notes) {
      const ch = lanes.get(n.id);
      if (ch !== undefined && ch !== n.bgmChannel) changed++;
    }
    if (changed === 0) return 0;
    s.pushUndo('Arrange BGM lanes');
    const notes = s.notes.map((n) => {
      const ch = lanes.get(n.id);
      return ch !== undefined && ch !== n.bgmChannel ? { ...n, bgmChannel: ch } : n;
    });
    set({ notes, hasUnsavedChanges: true });
    return changed;
  },

  // Select everything that can be edited: hidden and locked layers are skipped.
  selectAll: () => set((s) => ({
    selectedNotes: new Set(
      s.notes
        .filter((n) => { const l = s.layerConfig[noteLayer(n)]; return l ? l.visible && !l.locked : true; })
        .map((n) => n.id),
    ),
  })),
  clearSelection: () => set({ selectedNotes: new Set() }),

  selectByFilter: (filter) => {
    const s = get();
    const converter = getConverter(get);
    const canon = idCanon(s.headers);
    const wantedKeysounds = filter.keysounds && filter.keysounds.length > 0
      ? new Set(filter.keysounds.map(canon))
      : null;
    const matching = s.notes.filter((n) => {
      const layer = s.layerConfig[noteLayer(n)];
      if (layer && (!layer.visible || layer.locked)) return false;
      // Layer filter
      if (filter.noteTypes && filter.noteTypes.length > 0) {
        const nt = (n.noteType || 'playable') as typeof filter.noteTypes[number];
        if (!filter.noteTypes.includes(nt)) return false;
      }
      // Measure range filter
      if (filter.measureRange) {
        if (n.measure < filter.measureRange.from || n.measure > filter.measureRange.to) return false;
      }
      // Column filter
      if (filter.columns && filter.columns.length > 0) {
        if (!n.column || !filter.columns.includes(n.column)) return false;
      }
      // Keysound filter (includes additionalKeysounds)
      if (wantedKeysounds) {
        const hasMatch = wantedKeysounds.has(canon(n.keysound)) ||
          n.additionalKeysounds?.some((ak: { keysound: string }) => wantedKeysounds.has(canon(ak.keysound)));
        if (!hasMatch) return false;
      }
      return true;
    });
    const ids = matching.map((n) => n.id);
    if (filter.additive) {
      set((prev) => {
        const next = new Set(prev.selectedNotes);
        for (const id of ids) next.add(id);
        return { selectedNotes: next };
      });
    } else {
      set({ selectedNotes: new Set(ids) });
    }
  },

  changeNoteType: (newType, defaultColumn) => {
    const s = get();
    if (s.selectedNotes.size === 0) return;
    s.pushUndo('Change note type');

    // Pre-compute max bgmChannel per tick for new BGM assignments
    const tickMaxChannel = new Map<number, number>();
    if (newType === 'bgm') {
      for (const n of s.notes) {
        if (n.noteType === 'bgm' && n.bgmChannel !== undefined) {
          const cur = tickMaxChannel.get(n.tick) ?? -1;
          if (n.bgmChannel > cur) tickMaxChannel.set(n.tick, n.bgmChannel);
        }
      }
    }

    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id) || isNoteLocked(s.layerConfig, n)) return n;
        const updated = { ...n, noteType: newType };
        if (newType !== 'playable') {
          // Only playable notes can be long notes.
          updated.endBeat = undefined;
          updated.endTick = undefined;
          updated.endMeasure = undefined;
          updated.endFraction = undefined;
        }
        if (newType === 'bgm') {
          updated.column = undefined;
          // Assign bgmChannel
          const cur = tickMaxChannel.get(n.tick) ?? -1;
          updated.bgmChannel = cur + 1;
          tickMaxChannel.set(n.tick, updated.bgmChannel);
        } else {
          // Leaving BGM → clear bgmChannel, assign default column
          updated.bgmChannel = undefined;
          if (defaultColumn && n.noteType === 'bgm') updated.column = defaultColumn;
        }
        return updated;
      }),
      hasUnsavedChanges: true,
    });
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  convertToLongNotes: () => {
    const s = get();
    const targets = s.notes.filter((n) => s.selectedNotes.has(n.id) && canBeLongNote(n)
      && n.endTick === undefined && n.endBeat === undefined && !isNoteLocked(s.layerConfig, n));
    if (targets.length === 0) return 0;
    const gridTicks = Math.max(1, Math.round(TICKS_PER_BEAT * 4 / s.gridSnap));
    const lengthTicks = Math.max(gridTicks, beatToTick(s.minLnLength));
    // Note heads per lane, ascending, so a new long note never runs into the next note
    const headsByColumn = new Map<string, number[]>();
    for (const n of s.notes) {
      if (n.noteType === 'bgm' || n.column === undefined) continue;
      const heads = headsByColumn.get(n.column) ?? [];
      heads.push(n.tick);
      headsByColumn.set(n.column, heads);
    }
    for (const heads of headsByColumn.values()) heads.sort((a, b) => a - b);
    const endTicks = new Map<string, number>();
    for (const n of targets) {
      const next = headsByColumn.get(n.column!)?.find((t) => t > n.tick);
      const endTick = next === undefined ? n.tick + lengthTicks : Math.min(n.tick + lengthTicks, next - gridTicks);
      if (endTick > n.tick) endTicks.set(n.id, endTick);
    }
    if (endTicks.size === 0) return 0;
    s.pushUndo('Convert to long notes');
    set({
      notes: s.notes.map((n) => {
        const endTick = endTicks.get(n.id);
        if (endTick === undefined) return n;
        return { ...n, endTick, endBeat: tickToBeat(endTick), endMeasure: undefined, endFraction: undefined };
      }),
      hasUnsavedChanges: true,
    });
    return endTicks.size;
  },

  convertToShortNotes: () => {
    const s = get();
    const ids = new Set(s.notes
      .filter((n) => s.selectedNotes.has(n.id) && (n.endTick !== undefined || n.endBeat !== undefined)
        && !isNoteLocked(s.layerConfig, n))
      .map((n) => n.id));
    if (ids.size === 0) return 0;
    s.pushUndo('Convert to short notes');
    set({
      notes: s.notes.map((n) => ids.has(n.id)
        ? { ...n, endTick: undefined, endBeat: undefined, endMeasure: undefined, endFraction: undefined }
        : n),
      hasUnsavedChanges: true,
    });
    return ids.size;
  },

  toggleLongNotes: () => get().convertToLongNotes() || get().convertToShortNotes(),

  // --- Measure management ---
  insertMeasure: (atMeasure) => {
    const s = get();
    pushMeasureUndo(get, set, 'Insert measure');
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
    const oldConverter = getConverter(get);

    // Shifted from the exact positions (not the ticks), so notes off the tick
    // grid (septuplets ...) are still on their grid in the shifted measures.
    set({
      notes: s.notes.map((n) => {
        const start = noteStartBeat(n, oldConverter);
        const end = noteEndBeat(n, oldConverter);
        if (start < shiftBeat - 1e-9) {
          if (end !== undefined && end >= shiftBeat - 1e-9) {
            return { ...n, ...syncEndFromBeat(end + shiftAmount, newConverter) };
          }
          return n;
        }
        return {
          ...n,
          ...syncFromBeat(start + shiftAmount, newConverter),
          ...syncEndFromBeat(end !== undefined ? end + shiftAmount : undefined, newConverter),
        };
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
      ...shiftMeasureData(s.bookmarks, s.gridSnapOverrides, atMeasure, 1),
      hasUnsavedChanges: true,
    });
    // Rebuild index after beat shift
    set((prev) => ({ _noteIndex: buildNoteIndex(prev.notes) }));
  },

  deleteMeasure: (atMeasure) => {
    const s = get();
    pushMeasureUndo(get, set, 'Delete measure');
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
    const oldConverter = getConverter(get);
    const EPS = 1e-9;

    // Shifted from the exact positions (not the ticks), like insertMeasure.
    set({
      notes: s.notes
        .filter((n) => {
          const start = noteStartBeat(n, oldConverter);
          return start < startBeat - EPS || start >= endBeat - EPS;
        })
        .map((n) => {
          const start = noteStartBeat(n, oldConverter);
          const end = noteEndBeat(n, oldConverter);
          if (start < startBeat - EPS) {
            if (end !== undefined && end >= endBeat - EPS) {
              return { ...n, ...syncEndFromBeat(end - measureBeats, newConverter) };
            }
            if (end !== undefined && end > startBeat + EPS) {
              return { ...n, ...syncEndFromBeat(startBeat, newConverter) };
            }
            return n;
          }
          return {
            ...n,
            ...syncFromBeat(start - measureBeats, newConverter),
            ...syncEndFromBeat(end !== undefined ? end - measureBeats : undefined, newConverter),
          };
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
      ...shiftMeasureData(s.bookmarks, s.gridSnapOverrides, atMeasure, -1),
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
        if (!s.selectedNotes.has(n.id) || n.column === undefined || isNoteLocked(s.layerConfig, n)) return n;
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
    const selected = s.notes.filter((n) => s.selectedNotes.has(n.id) && !isNoteLocked(s.layerConfig, n));
    if (selected.length < 2) return;
    const converter = getConverter(get);
    // Exact positions, so flipped off-grid notes (septuplets ...) stay on their grid
    const exact = new Map(selected.map((n) => [n.id, { start: noteStartBeat(n, converter), end: noteEndBeat(n, converter) }]));
    // reduce, not Math.min(...spread): spreading 100k+ values overflows the stack
    const minBeat = [...exact.values()].reduce((m, p) => Math.min(m, p.start), Infinity);
    const maxBeat = [...exact.values()].reduce((m, p) => Math.max(m, p.end ?? p.start), -Infinity);
    s.pushUndo('Flip notes');
    set({
      notes: s.notes.map((n) => {
        const p = exact.get(n.id);
        if (!p) return n;
        const flippedBeat = maxBeat - (p.start - minBeat);
        const flippedEnd = p.end !== undefined ? maxBeat - (p.end - minBeat) : undefined;
        const newBeat = flippedEnd !== undefined ? Math.min(flippedBeat, flippedEnd) : flippedBeat;
        const newEndBeat = flippedEnd !== undefined ? Math.max(flippedBeat, flippedEnd) : undefined;
        return { ...n, ...syncFromBeat(newBeat, converter), ...syncEndFromBeat(newEndBeat, converter) };
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
        if (!s.selectedNotes.has(n.id) || n.column === undefined || isNoteLocked(s.layerConfig, n)) return n;
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
    const converter = getConverter(get);
    // The grid the editor draws: per measure (its length and grid override)
    const snap = (beat: number) => snapBeatToMeasureGrid(beat, s.gridSnap, s.timeSignatures, s.gridSnapOverrides);
    set({
      notes: s.notes.map((n) => {
        if (!s.selectedNotes.has(n.id) || isNoteLocked(s.layerConfig, n)) return n;
        const start = snap(noteStartBeat(n, converter));
        const end = noteEndBeat(n, converter);
        let newEnd = end !== undefined ? snap(end) : undefined;
        // Prevent LN collapse: keep at least one grid step / minLnLength
        const minLn = Math.max(gridStepAt(start, s.gridSnap, s.timeSignatures, s.gridSnapOverrides), s.minLnLength);
        if (newEnd !== undefined && newEnd - start < minLn - 1e-9) {
          newEnd = start + minLn;
        }
        return { ...n, ...syncFromBeat(start, converter), ...syncEndFromBeat(newEnd, converter) };
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
        if (n.id !== noteId || isNoteLocked(s.layerConfig, n)) return n;
        const layers = n.additionalKeysounds ? [...n.additionalKeysounds] : [];
        layers.push({ keysound: idCanon(s.headers)(keysoundId), type: layerType });
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
    const copied = selected.map((n) => ({ ...n }));
    set({
      clipboard: copied,
      clipboardHistory: [copied, ...s.clipboardHistory].slice(0, 10),
    });
  },

  cut: () => {
    const s = get();
    s.copy();
    const ids = s.notes
      .filter((n) => s.selectedNotes.has(n.id) && !isNoteLocked(s.layerConfig, n))
      .map((n) => n.id);
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
    s.pushUndo('Paste notes');
    const converter = getConverter(get);
    // Offsets from the exact positions, so a pasted septuplet stays one
    const starts = s.clipboard.map((n) => noteStartBeat(n, converter));
    const minBeat = starts.reduce((m, b) => Math.min(m, b), Infinity);
    const offset = Math.max(-minBeat, s.currentBeat - minBeat);
    const newIndex = new Map(s._noteIndex);
    let nextId = s.nextNoteId;
    const pasted = settleBgm(s.notes, s.clipboard.map((n, i) => {
      const end = noteEndBeat(n, converter);
      return {
        ...n,
        id: `note-${nextId++}`,
        ...syncFromBeat(starts[i] + offset, converter),
        ...syncEndFromBeat(end !== undefined ? end + offset : undefined, converter),
      };
    }));
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
    const converter = getConverter(get);
    // Offsets from the exact positions, so a pasted septuplet stays one
    const starts = s.clipboard.map((n) => noteStartBeat(n, converter));
    const minBeat = starts.reduce((m, b) => Math.min(m, b), Infinity);
    const offset = Math.max(-minBeat, s.currentBeat - minBeat);
    let nextId = s.nextNoteId;
    let droppedCount = 0;

    const pastedRaw: EditableBMSNote[] = [];
    for (const [i, n] of s.clipboard.entries()) {
      const end = noteEndBeat(n, converter);
      const newNote = {
        ...n,
        id: `note-${nextId++}`,
        ...syncFromBeat(starts[i] + offset, converter),
        ...syncEndFromBeat(end !== undefined ? end + offset : undefined, converter),
      };
      // Drop notes with columns outside current key mode (BGM/invisible OK)
      if (newNote.noteType === 'playable' && newNote.column && !laneSet.has(newNote.column)) {
        droppedCount++;
        continue;
      }
      pastedRaw.push(newNote);
    }
    // Pasted BGM notes take a free lane where theirs is taken
    const pasted = settleBgm(s.notes, pastedRaw);

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

    // Has conflicts. Return analysis for Editor.tsx dialog
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

  selectClipboardHistory: (index) => {
    const s = get();
    if (index >= 0 && index < s.clipboardHistory.length) {
      set({ clipboard: s.clipboardHistory[index] });
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
  deleteStop: (stopEvent) => {
    const s = get();
    s.pushUndo('Delete STOP');
    set({
      stopEvents: s.stopEvents.filter(
        (ev) => !(ev.measure === stopEvent.measure && ev.fraction === stopEvent.fraction),
      ),
      hasUnsavedChanges: true,
    });
  },
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
            // Invalid. Ignore
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

  addNotesBulk: (incoming, description = 'Add notes') => {
    const s = get();
    if (incoming.length === 0) return;
    s.pushUndo(description);
    const converter = getConverter(get);
    const normalised = incoming.map((n) => {
      return { ...n, ...syncFromBeat(n.beat, converter), ...syncEndFromBeat(n.endBeat, converter) };
    });
    const notes = [...s.notes, ...normalised];
    set({ notes, _noteIndex: buildNoteIndex(notes), hasUnsavedChanges: true });
  },

  updateHeadersWithWavDefs: (newWavDefs, description = 'Import keysounds') => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo(description);
    const newWav = new Map(s.headers.wav);
    for (const [id, filename] of Object.entries(newWavDefs)) {
      newWav.set(id, filename);
    }
    set({ headers: { ...s.headers, wav: newWav }, hasUnsavedChanges: true });
  },

  setCustomHeader: (key, value) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Change custom header');
    const newCustom = new Map(s.headers.custom);
    newCustom.set(key.toUpperCase(), value);
    set({ headers: { ...s.headers, custom: newCustom }, hasUnsavedChanges: true });
  },

  deleteCustomHeader: (key) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Delete custom header');
    const newCustom = new Map(s.headers.custom);
    newCustom.delete(key);
    set({ headers: { ...s.headers, custom: newCustom }, hasUnsavedChanges: true });
  },

  setWavDef: (key, value) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Change WAV definition');
    const newWav = new Map(s.headers.wav);
    newWav.set(idCanon(s.headers)(key), value);
    set({ headers: { ...s.headers, wav: newWav }, hasUnsavedChanges: true });
  },

  deleteWavDef: (key) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Delete WAV definition');
    const newWav = new Map(s.headers.wav);
    newWav.delete(key);
    set({ headers: { ...s.headers, wav: newWav }, hasUnsavedChanges: true });
  },

  setBmpDef: (key, value) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Change BMP definition');
    const newBmp = new Map(s.headers.bmp);
    newBmp.set(idCanon(s.headers)(key), value);
    set({ headers: { ...s.headers, bmp: newBmp }, hasUnsavedChanges: true });
  },

  deleteBmpDef: (key) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Delete BMP definition');
    const newBmp = new Map(s.headers.bmp);
    newBmp.delete(key);
    set({ headers: { ...s.headers, bmp: newBmp }, hasUnsavedChanges: true });
  },

  applyRawHeaders: (raw) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo('Apply raw headers');
    const parsed = parseRawHeaderText(raw);
    set({
      headers: {
        ...s.headers,
        ...parsed,
        wav: parsed.wav ?? s.headers.wav,
        bmp: parsed.bmp ?? s.headers.bmp,
        bpmDef: parsed.bpmDef ?? s.headers.bpmDef,
        stopDef: parsed.stopDef ?? s.headers.stopDef,
        custom: parsed.custom ?? s.headers.custom,
      },
      hasUnsavedChanges: true,
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
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setGridSnapOverride: (measure, gridSnap) => set((s) => {
    const overrides = new Map(s.gridSnapOverrides);
    if (gridSnap === null) overrides.delete(measure);
    else overrides.set(measure, gridSnap);
    return { gridSnapOverrides: overrides, hasUnsavedChanges: true };
  }),
  getGridSnapForMeasure: (measure) => {
    const s = get();
    return s.gridSnapOverrides.get(measure) ?? s.gridSnap;
  },
  setSelectedNoteType: (type) => set({ selectedNoteType: type }),
  setCurrentKeysound: (keysound) => set({ currentKeysound: keysound }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),
  setKeyMode: (keyMode) => {
    const s = get();
    if (s.keyMode === keyMode) { set({ keyMode }); return; }
    const newLaneIds = new Set(getLaneIds(keyMode));
    let orphanCount = 0;
    for (const n of s.notes) {
      if (n.noteType === 'bgm') continue;
      if (n.column && !newLaneIds.has(n.column)) orphanCount++;
    }
    set({ keyMode, hasUnsavedChanges: differsFromSaved(s, s._savedPoint) || keyMode !== s._savedPoint?.keyMode });
    if (orphanCount > 0) {
      set({
        toast: {
          message: i18next.t('editor:store.orphanNotes', { keyMode, count: orphanCount }),
          type: 'error',
        },
      });
    }
  },
  setHasUnsavedChanges: (value) => set((s) => (value
    ? { hasUnsavedChanges: true }
    : { hasUnsavedChanges: false, _savedPoint: savedPointOf(s) })),
  markSaved: () => set((s) => {
    // The writer puts a BGM note on line `bgmChannel` (0-999) of its measure.
    const writtenLine = (n: EditableBMSNote) =>
      (Number.isInteger(n.bgmChannel) && n.bgmChannel! >= 0 && n.bgmChannel! <= 999 ? n.bgmChannel : undefined);
    const stale = (n: EditableBMSNote) => n.noteType === 'bgm' && writtenLine(n) !== undefined && n.sourceBgmLine !== writtenLine(n);
    const notes = s.notes.some(stale)
      ? s.notes.map((n) => (stale(n) ? { ...n, sourceBgmLine: writtenLine(n) } : n))
      : s.notes;
    return { notes, hasUnsavedChanges: false, _savedPoint: savedPointOf({ ...s, notes }) };
  }),
  markUnsaved: () => set({ hasUnsavedChanges: true, _savedPoint: null }),
  setInputDialog: (dialog) => set({ inputDialog: dialog }),
  toggleLeftPanel: () => set((s) => ({ showLeftPanel: !s.showLeftPanel })),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleHeaderCollapsed: () => set((s) => ({ headerCollapsed: !s.headerCollapsed })),
  setToast: (toast) => set({ toast }),
  setShowBackConfirm: (show) => set({ showBackConfirm: show }),
  setNoteHeight: (height) => set({ noteHeight: Math.max(1, Math.min(8, height)) }),

  // Layer
  setLayerVisible: (layer, visible) => set((s) => ({
    layerConfig: { ...s.layerConfig, [layer]: { ...s.layerConfig[layer], visible } },
  })),
  setLayerLocked: (layer, locked) => set((s) => ({
    layerConfig: { ...s.layerConfig, [layer]: { ...s.layerConfig[layer], locked } },
  })),
  setLayerOpacity: (layer, opacity) => set((s) => ({
    layerConfig: { ...s.layerConfig, [layer]: { ...s.layerConfig[layer], opacity: Math.max(0, Math.min(1, opacity)) } },
  })),
  resetLayerConfig: () => set({ layerConfig: { ...DEFAULT_LAYER_CONFIG } }),
  setMinLnLength: (length) => set({ minLnLength: Math.max(0.0625, Math.min(4, length)), hasUnsavedChanges: true }),

  // Custom Colors
  setCustomColor: (key, color) => set((s) => {
    const next = { ...s.customColors };
    if (color === null) delete (next as Record<string, string | undefined>)[key];
    else (next as Record<string, string | undefined>)[key] = color;
    return { customColors: next, hasUnsavedChanges: true };
  }),
  resetCustomColors: () => set({ customColors: {}, hasUnsavedChanges: true }),

  // A/B Comparison
  saveComparisonSnapshot: () => {
    const s = get();
    set({
      comparisonSnapshot: {
        notes: structuredClone(s.notes),
        bpmChanges: structuredClone(s.bpmChanges),
      },
    });
  },
  clearComparisonSnapshot: () => set({ comparisonSnapshot: null, comparisonActive: false }),
  toggleComparison: () => set((s) => {
    if (!s.comparisonSnapshot) return {};
    return { comparisonActive: !s.comparisonActive };
  }),

  // BGM Channel Solo/Mute
  toggleBgmSolo: (channel) => set((s) => ({
    bgmSoloChannel: s.bgmSoloChannel === channel ? null : channel,
  })),
  toggleBgmMute: (channel) => set((s) => {
    const next = new Set(s.bgmMutedChannels);
    if (next.has(channel)) next.delete(channel);
    else next.add(channel);
    return { bgmMutedChannels: next };
  }),
  clearBgmSoloMute: () => set({ bgmSoloChannel: null, bgmMutedChannels: new Set() }),

  // Bookmarks
  addBookmark: (measure, name, color) => set((s) => ({
    bookmarks: [...s.bookmarks.filter((b) => b.measure !== measure), { measure, name, color }]
      .sort((a, b) => a.measure - b.measure),
    hasUnsavedChanges: true,
  })),
  removeBookmark: (measure) => set((s) => ({
    bookmarks: s.bookmarks.filter((b) => b.measure !== measure),
    hasUnsavedChanges: true,
  })),
  renameBookmark: (measure, name) => set((s) => ({
    bookmarks: s.bookmarks.map((b) => b.measure === measure ? { ...b, name } : b),
    hasUnsavedChanges: true,
  })),

  // Note Groups
  createGroup: (name, noteIds, color) => set((s) => ({
    noteGroups: [...s.noteGroups, { id: `group-${Date.now()}`, name, noteIds, color }],
    hasUnsavedChanges: true,
  })),
  deleteGroup: (groupId) => set((s) => ({
    noteGroups: s.noteGroups.filter((g) => g.id !== groupId),
    hasUnsavedChanges: true,
  })),
  selectGroup: (groupId) => set((s) => {
    const group = s.noteGroups.find((g) => g.id === groupId);
    if (!group) return {};
    return { selectedNotes: new Set(group.noteIds) };
  }),
  ungroupSelected: () => set((s) => {
    const selected = s.selectedNotes;
    return {
      noteGroups: s.noteGroups.filter((g) =>
        !g.noteIds.every((id) => selected.has(id))
      ),
    };
  }),

  // A-B Loop
  setLoopA: (beat) => set({ loopA: beat }),
  setLoopB: (beat) => set({ loopB: beat }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),

  // --- Keysound management ---
  setHighlightKeysound: (keysound) => set({ highlightKeysound: keysound }),

  replaceKeysound: (rawFrom, rawTo) => {
    const s = get();
    // base36 ids are case-insensitive; #BASE 62 ids are case-sensitive
    const canon = idCanon(s.headers);
    const fromId = canon(rawFrom);
    const toId = canon(rawTo);
    if (fromId === toId) return;
    s.pushUndo(i18next.t('editor:store.replaceKeysound'));
    const updated = s.notes.map((n) => {
      let changed = false;
      let keysound = n.keysound;
      let additionalKeysounds = n.additionalKeysounds;
      if (canon(n.keysound) === fromId) {
        keysound = toId;
        changed = true;
      }
      if (n.additionalKeysounds?.some((ak) => canon(ak.keysound) === fromId)) {
        additionalKeysounds = n.additionalKeysounds.map((ak) =>
          canon(ak.keysound) === fromId ? { ...ak, keysound: toId } : ak
        );
        changed = true;
      }
      return changed ? { ...n, keysound, additionalKeysounds } : n;
    });
    set({ notes: updated, hasUnsavedChanges: true });
  },

  removeWavDefinitions: (keysoundIds) => {
    const s = get();
    if (!s.headers) return;
    s.pushUndo(i18next.t('editor:store.removeUnusedKeysounds'));
    const canon = idCanon(s.headers);
    const removed = new Set(keysoundIds.map(canon));
    const newWav = new Map(s.headers.wav);
    for (const key of s.headers.wav.keys()) {
      if (removed.has(canon(key))) newWav.delete(key);
    }
    // Notes and keysound layers that used a removed definition become silent
    // in the same undo step (no dangling references to an undefined #WAV).
    const notes = s.notes.map((n) => {
      const mainHit = removed.has(canon(n.keysound));
      const layers = n.additionalKeysounds?.filter((l) => !removed.has(canon(l.keysound)));
      const layersChanged = n.additionalKeysounds !== undefined && layers!.length !== n.additionalKeysounds.length;
      if (!mainHit && !layersChanged) return n;
      return {
        ...n,
        ...(mainHit ? { keysound: '00' } : {}),
        ...(layersChanged ? { additionalKeysounds: layers!.length > 0 ? layers : undefined } : {}),
      };
    });
    set({ headers: { ...s.headers, wav: newWav }, notes, hasUnsavedChanges: true });
  },

  // --- Patterns ---
  applyPattern: (pattern, laneIds, startBeat, startColumn) => {
    const s = get();
    if (pattern.notes.length === 0 || laneIds.length === 0) return { placed: 0, noKeysound: 0 };
    const converter = getConverter(get);
    const startColIdx = laneIds.indexOf(startColumn);
    const baseCol = startColIdx >= 0 ? startColIdx : 0;
    // Build set of existing note positions for duplicate prevention. An invisible note
    // only blocks non-playable pattern notes: for a playable one it is a keysound source.
    const existingPositions = new Set<string>();
    const invisiblePositions = new Set<string>();
    for (const n of s.notes) {
      if (n.column) (n.noteType === 'invisible' ? invisiblePositions : existingPositions).add(`${n.beat.toFixed(6)}:${n.column}`);
    }
    const requests: PlacementRequest[] = [];
    for (const pn of pattern.notes) {
      const colIdx = baseCol + pn.columnIndex;
      if (colIdx < 0 || colIdx >= laneIds.length) continue;
      const beat = startBeat + pn.beatOffset;
      if (beat < 0) continue;
      const col = laneIds[colIdx];
      const posKey = `${beat.toFixed(6)}:${col}`;
      const noteType = pn.noteType || 'playable';
      if (existingPositions.has(posKey) || (noteLayer({ noteType }) !== 'playable' && invisiblePositions.has(posKey))) continue; // Skip duplicates
      existingPositions.add(posKey);
      requests.push({
        beat,
        column: col,
        noteType,
        endBeat: pn.endBeatOffset !== undefined ? startBeat + pn.endBeatOffset : undefined,
      });
    }
    const placement = buildPlacement(s, requests, converter);
    if (placement.notes.length === 0) return { placed: 0, noKeysound: placement.noKeysound };
    s.pushUndo('Apply pattern');
    const notes = [...s.notes.filter((n) => !placement.consumedIds.has(n.id)), ...placement.notes];
    set({
      notes,
      nextNoteId: placement.nextId,
      _noteIndex: buildNoteIndex(notes),
      hasUnsavedChanges: true,
      selectedNotes: new Set(placement.notes.map((n) => n.id)),
    });
    return { placed: placement.notes.length, noKeysound: placement.noKeysound };
  },

  applyGeneratedNotes: (generated, laneIds) => {
    const s = get();
    // Drop generated notes that would sit on top of an existing note in the same
    // column (within half a 32nd); the user keeps what they wrote. An invisible note in
    // the lane is a keysound source for the new playable note, not an obstacle.
    const occupiedKeys = new Set(s.notes.filter((n) => n.column && n.noteType !== 'invisible').map((n) => `${n.column}@${Math.round(n.beat * 16)}`));
    const requests: PlacementRequest[] = [];
    for (const gn of generated) {
      const column = laneIds[gn.columnIndex] || laneIds[0] || '';
      if (occupiedKeys.has(`${laneIds[gn.columnIndex] || ''}@${Math.round(gn.beat * 16)}`)) continue;
      requests.push({ beat: gn.beat, column, noteType: gn.noteType, endBeat: gn.endBeat });
    }
    const occupied = generated.length - requests.length;
    const placement = buildPlacement(s, requests, getConverter(get));
    if (placement.notes.length === 0) return { placed: 0, noKeysound: placement.noKeysound, occupied };
    s.pushUndo('Auto-generate chart');
    const notes = [...s.notes.filter((n) => !placement.consumedIds.has(n.id)), ...placement.notes];
    set({
      notes,
      nextNoteId: placement.nextId,
      _noteIndex: buildNoteIndex(notes),
      hasUnsavedChanges: true,
      selectedNotes: new Set([...s.selectedNotes].filter((id) => !placement.consumedIds.has(id))),
    });
    return { placed: placement.notes.length, noKeysound: placement.noKeysound, occupied };
  },

  selectionToPatternData: (laneIds) => {
    const s = get();
    if (s.selectedNotes.size === 0) return null;
    // Pattern requires concrete column + noteType. Drop notes lacking either
    const selected = s.notes.filter(
      (n): n is typeof n & { column: string; noteType: NonNullable<typeof n.noteType> } =>
        s.selectedNotes.has(n.id) && typeof n.column === 'string' && n.noteType !== undefined,
    );
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
