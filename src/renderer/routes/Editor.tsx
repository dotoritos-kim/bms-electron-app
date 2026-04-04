import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ArrowLeft, Save, RefreshCw, Play, Pause, Square, Volume2, VolumeX, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Music, Headphones } from 'lucide-react';
import {
  NoteChartEditor,
  EditorToolbar,
  EditorContextMenu,
  NoteInfoPanel,
  KeysoundPanel,
  HeaderEditorPanel,
  Minimap,
  StatusBar,
  NoteSearchDialog,
  BmsChartDiff,
  getLaneIds,
} from '@rhythm-archive/bms-editor';
import type { BmsChartDiffInfo } from '@rhythm-archive/bms-editor';
import type { EditableBMSNote, EditableBMSChart, TimingAction } from '@rhythm-archive/bms-core';
import { BMSWriter, Timing } from '@rhythm-archive/bms-core';
import { AudioPreloader } from '@rhythm-archive/bms-player';
import type { FileMap } from '@rhythm-archive/bms-player';
import type { CurrentFile, NavigationGuard } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';
import { createLocalAudioWorker } from '../lib/LocalAudioWorker';
import { Player } from './Player';
import { useEditorStore } from '../stores/editorStore';
import type { AudioPhase } from '../stores/editorStore';
import { PatternLibraryPanel } from '../components/PatternLibraryPanel';
import { KeyBindingsDialog } from '../components/KeyBindingsDialog';
import type { PatternTemplate } from '../lib/patternTemplates';
import type { KeyBinding, KeyAction } from '../lib/keyBindings';
import { loadKeyBindings, normalizeKeyCombo, buildActionMap, TOOL_ACTION_MAP } from '../lib/keyBindings';
import { MidiMappingDialog } from '../components/MidiMappingDialog';
import type { MidiMapping, MidiRecordingMode, MidiNoteEvent } from '../lib/midiInput';
import {
  createDefaultMapping,
  loadMidiMapping,
  connectMidiInput,
  disconnectMidiInput,
  requestMidiAccess,
} from '../lib/midiInput';
import { AudioSlicer } from '../components/AudioSlicer';
import { AutoChartDialog } from '../components/AutoChartDialog';
import type { GeneratedNote } from '../lib/autoChart';

interface EditorProps {
  file: CurrentFile;
  onBack: () => void;
  onRegisterGuard: (guard: NavigationGuard | null) => void;
}

/** beat → { measure, fraction } (4/4 기준) */
function beatToMF(beat: number): { measure: number; fraction: number } {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
}

/** BMSBpmChange → beat */
function bpmBeat(b: { measure: number; fraction: number }): number {
  return b.measure * 4 + b.fraction * 4;
}

/** Beat-position keysound overview */
function BeatKeysoundPanel({
  notes,
  currentBeat,
  wavDefinitions,
  onPreview,
  isAudioReady,
}: {
  notes: EditableBMSNote[];
  currentBeat: number;
  wavDefinitions: Map<string, string>;
  onPreview?: (id: string) => void;
  isAudioReady?: boolean;
}) {
  const BEAT_RANGE = 0.125;
  const nearbyNotes = useMemo(() => {
    const grouped = new Map<string, { beat: number; playable: EditableBMSNote[]; bgm: EditableBMSNote[] }>();
    for (const n of notes) {
      if (n.keysound === '00') continue;
      if (Math.abs(n.beat - currentBeat) > 8) continue;
      const beatKey = n.beat.toFixed(4);
      let entry = grouped.get(beatKey);
      if (!entry) {
        entry = { beat: n.beat, playable: [], bgm: [] };
        grouped.set(beatKey, entry);
      }
      if (n.noteType === 'bgm') entry.bgm.push(n);
      else entry.playable.push(n);
    }
    return Array.from(grouped.values())
      .sort((a, b) => a.beat - b.beat)
      .filter((g) => g.beat >= currentBeat - 2 && g.beat <= currentBeat + 8);
  }, [notes, currentBeat]);

  if (nearbyNotes.length === 0) {
    return (
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1">
          <Headphones className="h-3 w-3" />
          키음 타임라인
        </h3>
        <div className="text-[10px] text-zinc-600">현재 위치 근처에 키음 없음</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 mb-1.5">
        <Headphones className="h-3 w-3" />
        키음 타임라인
      </h3>
      <div className="space-y-1">
        {nearbyNotes.map((group) => {
          const isCurrent = Math.abs(group.beat - currentBeat) < BEAT_RANGE;
          const measure = Math.floor(group.beat / 4);
          const frac = ((group.beat % 4) / 4).toFixed(2);
          return (
            <div
              key={group.beat.toFixed(4)}
              className={`rounded px-2 py-1 text-[10px] ${
                isCurrent ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono text-zinc-500">#{String(measure).padStart(3, '0')}:{frac}</span>
                <span className="font-mono text-zinc-600">({group.beat.toFixed(2)})</span>
                {isCurrent && <span className="text-blue-400 text-[9px]">◀ 현재</span>}
              </div>
              {group.playable.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {group.playable.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => isAudioReady && onPreview?.(n.keysound)}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-900/40 text-green-300 hover:bg-green-800/50 transition-colors"
                      title={`${n.column || 'P'} — ${n.keysound}: ${wavDefinitions.get(n.keysound) || '?'}`}
                    >
                      <Music className="h-2.5 w-2.5" />
                      <span className="font-mono">{n.keysound}</span>
                      {n.column && <span className="text-green-500">({n.column})</span>}
                    </button>
                  ))}
                </div>
              )}
              {group.bgm.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {group.bgm.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => isAudioReady && onPreview?.(n.keysound)}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-purple-900/40 text-purple-300 hover:bg-purple-800/50 transition-colors"
                      title={`BGM — ${n.keysound}: ${wavDefinitions.get(n.keysound) || '?'}`}
                    >
                      <Headphones className="h-2.5 w-2.5" />
                      <span className="font-mono">{n.keysound}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Estimate chart difficulty (1-12 scale) based on note density, BPM, LN ratio */
function estimateDifficulty(notes: EditableBMSNote[], bpm: number, totalBeats: number): number {
  if (notes.length === 0 || totalBeats <= 0) return 0;
  const playableNotes = notes.filter((n) => n.noteType === 'playable' || n.noteType === 'invisible');
  const totalPlayable = playableNotes.length;
  if (totalPlayable === 0) return 0;

  // Notes per second (assuming 4/4 time)
  const durationSec = (totalBeats / bpm) * 60;
  const nps = totalPlayable / Math.max(durationSec, 1);

  // Peak density: max notes in any 1-beat window
  const beatBuckets = new Map<number, number>();
  for (const n of playableNotes) {
    const bucket = Math.floor(n.beat);
    beatBuckets.set(bucket, (beatBuckets.get(bucket) || 0) + 1);
  }
  const peakDensity = Math.max(...beatBuckets.values(), 0);

  // Long note ratio
  const lnCount = playableNotes.filter((n) => n.endBeat !== undefined).length;
  const lnRatio = lnCount / totalPlayable;

  // BPM factor
  const bpmFactor = Math.min(bpm / 200, 1.5);

  // Combined score → map to 1-12
  const rawScore = (nps * 2.5) + (peakDensity * 0.8) + (bpmFactor * 2) + (lnRatio * 1.5);
  return Math.max(1, Math.min(12, Math.round(rawScore)));
}

function ChartStatsView({ notes, bpm, totalBeats }: { notes: EditableBMSNote[]; bpm: number; totalBeats: number }) {
  const stats = useMemo(() => {
    const playable = notes.filter((n) => n.noteType === 'playable').length;
    const invisible = notes.filter((n) => n.noteType === 'invisible').length;
    const landmine = notes.filter((n) => n.noteType === 'landmine').length;
    const bgm = notes.filter((n) => n.noteType === 'bgm').length;
    const ln = notes.filter((n) => n.endBeat !== undefined).length;
    const durationSec = totalBeats > 0 && bpm > 0 ? (totalBeats / bpm) * 60 : 0;
    const nps = durationSec > 0 ? playable / durationSec : 0;
    const measures = totalBeats > 0 ? Math.ceil(totalBeats / 4) : 0;
    return { playable, invisible, landmine, bgm, ln, durationSec, nps, measures };
  }, [notes, bpm, totalBeats]);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
      <div className="text-zinc-500">Playable</div><div className="text-zinc-300 text-right">{stats.playable}</div>
      <div className="text-zinc-500">LN</div><div className="text-zinc-300 text-right">{stats.ln}</div>
      <div className="text-zinc-500">BGM</div><div className="text-zinc-300 text-right">{stats.bgm}</div>
      <div className="text-zinc-500">Invisible</div><div className="text-zinc-300 text-right">{stats.invisible}</div>
      <div className="text-zinc-500">Landmine</div><div className="text-zinc-300 text-right">{stats.landmine}</div>
      <div className="text-zinc-500">NPS</div><div className="text-zinc-300 text-right">{stats.nps.toFixed(1)}</div>
      <div className="text-zinc-500">마디</div><div className="text-zinc-300 text-right">{stats.measures}</div>
      <div className="text-zinc-500">재생 시간</div><div className="text-zinc-300 text-right">{fmt(stats.durationSec)}</div>
    </div>
  );
}

function BpmTapDialog({ onClose, onApply }: { onClose: () => void; onApply: (bpm: number) => void }) {
  const [taps, setTaps] = useState<number[]>([]);
  const bpm = useMemo(() => {
    if (taps.length < 2) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round((60000 / avgInterval) * 100) / 100;
  }, [taps]);

  const handleTap = useCallback(() => {
    setTaps((prev) => {
      const now = performance.now();
      // Reset if gap > 3 seconds
      if (prev.length > 0 && now - prev[prev.length - 1] > 3000) return [now];
      return [...prev.slice(-20), now];
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleTap(); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTap, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">BPM 탭</h3>
        <div className="text-center mb-4">
          <div className="text-4xl font-bold text-blue-400 font-mono">{bpm > 0 ? bpm : '--'}</div>
          <div className="text-xs text-zinc-500 mt-1">BPM ({taps.length} taps)</div>
        </div>
        <button
          onClick={handleTap}
          className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-lg font-semibold transition-colors mb-3"
        >
          탭 (Space)
        </button>
        <div className="flex justify-between">
          <button onClick={() => setTaps([])} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800">리셋</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800">취소</button>
            <button
              onClick={() => bpm > 0 && onApply(bpm)}
              disabled={bpm <= 0}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded"
            >적용</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Editor({ file, onBack, onRegisterGuard }: EditorProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();

  // --- Zustand store ---
  const store = useEditorStore();
  const {
    notes, bpmChanges, stopEvents, headers, timeSignatures, editableChart,
    hasUnsavedChanges, activeTool, gridSnap, selectedNotes, selectedNoteType,
    currentKeysound, currentBeat, clipboard, undoStack, redoStack,
    audioPhase, audioLoadProgress, playbackSpeed, volume, playbackTime, playbackDuration,
    inputDialog, showLeftPanel, showRightPanel, headerCollapsed, toast, showBackConfirm,
  } = store;

  // Local dialog state
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [showBpmTap, setShowBpmTap] = useState(false);
  const [measureDialog, setMeasureDialog] = useState<{ type: 'insert' | 'delete' } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'keysound' | 'pattern'>('keysound');
  const [showKeyBindings, setShowKeyBindings] = useState(false);
  const [keyBindings, setKeyBindings] = useState<KeyBinding[]>(() => loadKeyBindings());
  const actionMapRef = useRef(buildActionMap(keyBindings));
  const [showAudioSlicer, setShowAudioSlicer] = useState(false);
  const [showAutoChart, setShowAutoChart] = useState(false);
  const [showMidiDialog, setShowMidiDialog] = useState(false);
  const [midiMapping, setMidiMapping] = useState<MidiMapping>(() => loadMidiMapping() || createDefaultMapping([]));
  const [midiRecordingMode, setMidiRecordingMode] = useState<MidiRecordingMode>('off');
  const originalChartInfoRef = useRef<BmsChartDiffInfo | null>(null);
  const measureInputRef = useRef<HTMLInputElement>(null);

  // Audio refs (imperative, not in store)
  const audioPreloaderRef = useRef<AudioPreloader | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const playbackStartRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(0.8);
  const playbackBeatRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const editedTimingRef = useRef<Timing | null>(null);
  const inputDialogRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savingRef = useRef(false);

  // Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    store.setToast({ message, type });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => store.setToast(null), 2500);
  }, []);

  useEffect(() => {
    load(file.path);
  }, [file.path, load]);

  // Initialize from chart
  useEffect(() => {
    if (!chart) return;
    const editableNotes: EditableBMSNote[] = chart.notes.map((n, i) => {
      const { measure, fraction } = beatToMF(n.beat);
      return {
        id: `note-${i}`,
        beat: n.beat,
        column: n.column || '',
        noteType: (n.noteType as EditableBMSNote['noteType']) || 'playable',
        keysound: n.keysound || '00',
        endBeat: n.endBeat,
        measure,
        fraction,
        channel: n.channel || '',
      };
    });
    if (chart.bmsChart) {
      const ec = BMSWriter.fromBMSChart(chart.bmsChart);
      store.initFromChart(ec, editableNotes, editableNotes.length + 1);
      // Save original chart info for diff
      originalChartInfoRef.current = {
        notes: chart.notes,
        keyMode: chart.keyMode,
        totalBeats: chart.totalBeats || 100,
        bpm: chart.bpm,
        stats: chart.stats,
      };
    }
  }, [chart]);

  // WAV definitions
  const wavDefinitions = useMemo(() => {
    if (!chart) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const [id, filename] of Object.entries(chart.keysounds)) {
      map.set(id, filename);
      const upper = id.toUpperCase();
      if (upper !== id) map.set(upper, filename);
    }
    return map;
  }, [chart]);

  const keysoundRecord = useMemo(() => chart?.keysounds || {}, [chart]);

  // Lane config
  const laneIds = useMemo(() => {
    if (!chart) return [];
    return getLaneIds(chart.keyMode);
  }, [chart]);

  const totalBeats = chart?.totalBeats || 100;

  // Edited BPM
  const editedBaseBpm = useMemo(() => {
    if (headers?.bpm !== undefined && headers.bpm !== null) {
      const val = typeof headers.bpm === 'number' ? headers.bpm : parseFloat(String(headers.bpm));
      if (!isNaN(val) && val > 0) return val;
    }
    return chart?.bpm.initial || 130;
  }, [headers, chart]);

  // Timing from edited BPM changes & STOP events
  const editedTiming = useMemo<Timing | null>(() => {
    if (!chart) return null;
    const actions: TimingAction[] = [];
    for (const bc of bpmChanges) {
      actions.push({ type: 'bpm', beat: bc.measure * 4 + bc.fraction * 4, bpm: bc.bpm });
    }
    for (const se of stopEvents) {
      actions.push({ type: 'stop', beat: se.measure * 4 + se.fraction * 4, stopBeats: se.duration / 48 });
    }
    return new Timing(editedBaseBpm, actions);
  }, [chart, bpmChanges, stopEvents, editedBaseBpm]);

  editedTimingRef.current = editedTiming;

  // --- Note selection with keysound preview ---
  const handleNoteSelect = useCallback((noteIds: string[], additive?: boolean) => {
    store.selectNotes(noteIds, additive);
    if (noteIds.length === 1 && audioPreloaderRef.current) {
      const note = useEditorStore.getState().notes.find((n) => n.id === noteIds[0]);
      if (note && note.keysound && note.keysound !== '00') {
        audioPreloaderRef.current.stopAllAudio();
        audioPreloaderRef.current.playAudioSync(note.keysound.toLowerCase());
      }
    }
  }, []);

  // --- Keysound assignment ---
  const handleKeysoundAssign = useCallback((noteId: string, keysoundId: string) => {
    store.updateNote(noteId, { keysound: keysoundId });
    if (audioPreloaderRef.current && keysoundId !== '00') {
      audioPreloaderRef.current.playAudioSync(keysoundId.toLowerCase());
    }
  }, []);

  // --- Note hover preview ---
  const lastHoverKeysoundRef = useRef<string | null>(null);
  const handleNoteHover = useCallback((keysoundId: string | null) => {
    if (keysoundId === lastHoverKeysoundRef.current) return;
    lastHoverKeysoundRef.current = keysoundId;
    if (keysoundId && audioPreloaderRef.current) {
      audioPreloaderRef.current.stopAllAudio();
      audioPreloaderRef.current.playAudioSync(keysoundId.toLowerCase());
    }
  }, []);

  // --- Pattern apply/save ---
  const handleApplyPattern = useCallback((pattern: PatternTemplate) => {
    const s = useEditorStore.getState();
    store.applyPattern(pattern, laneIds, s.currentBeat, laneIds[0] || '', s.currentKeysound);
  }, [laneIds]);

  const handleSaveSelectionAsPattern = useCallback(() => {
    const result = store.selectionToPatternData(laneIds);
    return result ? { ...result, id: '', name: '', category: 'custom' as const, tags: [], isBuiltIn: false } : null;
  }, [laneIds]);

  // --- MIDI note input ---
  const midiMappingRef = useRef(midiMapping);
  const midiRecordingModeRef = useRef(midiRecordingMode);
  useEffect(() => { midiMappingRef.current = midiMapping; }, [midiMapping]);
  useEffect(() => { midiRecordingModeRef.current = midiRecordingMode; }, [midiRecordingMode]);

  // Update default mapping when laneIds change
  useEffect(() => {
    if (laneIds.length > 0 && midiMapping.noteToLane.size === 0) {
      setMidiMapping(loadMidiMapping() || createDefaultMapping(laneIds));
    }
  }, [laneIds]);

  const handleMidiNote = useCallback((event: MidiNoteEvent) => {
    const mode = midiRecordingModeRef.current;
    if (mode === 'off') return;

    const mapping = midiMappingRef.current;
    const lane = mapping.noteToLane.get(event.note);
    if (!lane) return;

    const s = useEditorStore.getState();
    const beat = s.currentBeat;
    const gridStep = 4 / s.gridSnap;

    const { measure, fraction } = beatToMF(beat);
    store.addNote({
      beat,
      column: lane,
      noteType: 'playable',
      keysound: s.currentKeysound,
      measure,
      fraction,
      channel: '',
    });

    // Preview keysound
    if (audioPreloaderRef.current && s.currentKeysound !== '00') {
      audioPreloaderRef.current.stopAllAudio();
      audioPreloaderRef.current.playAudioSync(s.currentKeysound.toLowerCase());
    }

    // Step mode: advance cursor
    if (mode === 'step') {
      store.setCurrentBeat(beat + gridStep);
    }
  }, []);

  // Connect MIDI on recording mode change
  useEffect(() => {
    if (midiRecordingMode !== 'off') {
      requestMidiAccess();
    }
  }, [midiRecordingMode]);

  const handleDropKeysound = useCallback((keysoundId: string, beat: number, column: string) => {
    const { selectedNoteType: snt } = useEditorStore.getState();
    const { measure, fraction } = beatToMF(beat);
    store.addNote({
      beat, column, noteType: snt === 'longNote' ? 'playable' : snt,
      keysound: keysoundId, measure, fraction, channel: '',
    });
    if (audioPreloaderRef.current && keysoundId !== '00') {
      audioPreloaderRef.current.playAudioSync(keysoundId.toLowerCase());
    }
  }, []);

  // --- Note move (needs laneIds) ---
  const handleNoteMove = useCallback((noteIds: string[], delta: { beat?: number; columnDelta?: number }) => {
    store.moveNotes(noteIds, delta, laneIds);
  }, [laneIds]);

  // --- Keysound Import ---
  const handleImportKeysounds = useCallback(async () => {
    try {
      const imported = await window.api.file.importKeysounds(file.path);
      if (imported.length === 0) return;
      const usedIds = new Set(Object.keys(keysoundRecord).map((k) => k.toUpperCase()));
      const newWavDefs: Record<string, string> = {};
      for (const item of imported) {
        let wavId = '';
        for (let i = 1; i <= 1295; i++) {
          const candidate = i.toString(36).toUpperCase().padStart(2, '0');
          if (!usedIds.has(candidate)) {
            wavId = candidate;
            usedIds.add(candidate);
            break;
          }
        }
        if (!wavId) break;
        newWavDefs[wavId] = item.filename;
      }
      store.updateHeadersWithWavDefs(newWavDefs);
      showToast(`${Object.keys(newWavDefs).length}개 키음 가져오기 완료`, 'success');
    } catch (err) {
      console.error('[Editor] Import keysounds failed:', err);
      showToast('키음 가져오기 실패', 'error');
    }
  }, [file.path, keysoundRecord, showToast]);

  // --- Save ---
  const handleSave = useCallback(async () => {
    const s = useEditorStore.getState();
    if (!chart || !s.editableChart || savingRef.current) return;
    savingRef.current = true;
    try {
      const writer = new BMSWriter();
      const chartToSave: EditableBMSChart = {
        headers: s.headers || s.editableChart.headers,
        notes: s.notes,
        timeSignatures: s.timeSignatures,
        bpmChanges: s.bpmChanges,
        stopEvents: s.stopEvents,
        bgaEvents: s.editableChart.bgaEvents,
      };
      const wavKeys = new Set(chartToSave.headers.wav.keys());
      const undefinedKeys = new Set<string>();
      for (const note of chartToSave.notes) {
        if (note.keysound && note.keysound !== '00' && !wavKeys.has(note.keysound.toUpperCase())) {
          undefinedKeys.add(note.keysound.toUpperCase());
        }
      }
      if (undefinedKeys.size > 0) {
        console.warn('[Editor] Notes reference undefined WAV keys:', [...undefinedKeys]);
        showToast(`경고: ${undefinedKeys.size}개 미정의 WAV 참조 (${[...undefinedKeys].slice(0, 3).join(', ')}${undefinedKeys.size > 3 ? '...' : ''})`, 'error');
      }
      const bmsContent = writer.write(chartToSave);
      await window.api.file.saveBms(file.path, bmsContent);
      store.setHasUnsavedChanges(false);
      showToast('저장 완료', 'success');
    } catch (err) {
      console.error('[Editor] Save failed:', err);
      showToast('저장 실패: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      savingRef.current = false;
    }
  }, [chart, file.path, showToast]);

  // --- Keyboard shortcuts (dynamic key bindings) ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const combo = normalizeKeyCombo(e);
      const action = actionMapRef.current.get(combo);

      // Save always works even in input fields
      if (action === 'save') { e.preventDefault(); handleSaveWithCleanup(); return; }
      if (isInput) return;
      if (!action) return;

      e.preventDefault();
      const s = useEditorStore.getState();
      const gridStep = 4 / s.gridSnap;
      const ids = Array.from(s.selectedNotes);

      // Tool shortcuts
      const tool = TOOL_ACTION_MAP[action];
      if (tool) { store.setActiveTool(tool); return; }

      switch (action) {
        case 'undo': store.undo(); break;
        case 'redo': store.redo(); break;
        case 'copy': store.copy(); break;
        case 'cut': store.cut(); break;
        case 'paste': store.paste(); break;
        case 'selectAll': store.selectAll(); break;
        case 'delete': store.deleteNotes(ids); break;
        case 'escape':
          if (s.inputDialog) store.setInputDialog(null);
          else store.clearSelection();
          break;
        case 'noteSearch': setShowNoteSearch(true); break;
        case 'playTest': handlePlayTest(); break;
        case 'playToggle': handlePlaybackToggle(); break;
        case 'mirror': store.mirrorNotes(laneIds); break;
        case 'random': store.randomNotes(laneIds); break;
        case 'quantize': store.quantizeNotes(); break;
        case 'insertMeasure': setMeasureDialog({ type: 'insert' }); break;
        case 'deleteMeasure': setMeasureDialog({ type: 'delete' }); break;
        case 'moveUp': if (ids.length > 0) store.moveNotes(ids, { beat: gridStep }, laneIds); break;
        case 'moveDown': if (ids.length > 0) store.moveNotes(ids, { beat: -gridStep }, laneIds); break;
        case 'moveLeft': if (ids.length > 0) store.moveNotes(ids, { columnDelta: -1 }, laneIds); break;
        case 'moveRight': if (ids.length > 0) store.moveNotes(ids, { columnDelta: 1 }, laneIds); break;
        case 'setLoopA': store.setLoopA(s.currentBeat); break;
        case 'setLoopB': store.setLoopB(s.currentBeat); break;
        case 'clearLoop': store.setLoopA(null); store.setLoopB(null); break;
        case 'togglePatternPanel': setLeftPanelTab((t) => t === 'pattern' ? 'keysound' : 'pattern'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveWithCleanup, handlePlayTest, handlePlaybackToggle, laneIds]);

  // --- Audio playback ---
  const loadAudio = useCallback(async () => {
    if (!chart || audioPhase === 'loading') return;
    store.setAudioPhase('loading');
    store.setAudioLoadProgress({ loaded: 0, total: 0 });
    try {
      const fileMap: FileMap = {};
      for (const [id, filename] of Object.entries(chart.keysounds)) {
        fileMap[id] = filename;
      }
      const total = Object.keys(fileMap).length;
      if (total === 0) { store.setAudioPhase('ready'); return; }
      const worker = createLocalAudioWorker(file.path);
      const preloader = new AudioPreloader('', fileMap, worker, (type, payload) => {
        if (type === 'PROGRESS') {
          const p = payload as { loadedCount: number; total: number };
          store.setAudioLoadProgress({ loaded: p.loadedCount, total: p.total });
        }
      });
      await preloader.loadAll();
      await preloader.decodeAll();
      await preloader.initAudioWorklet();
      audioPreloaderRef.current?.releaseAllResources();
      audioPreloaderRef.current = preloader;
      const timingForDuration = editedTiming || chart.timing;
      if (timingForDuration) {
        const s = useEditorStore.getState();
        const maxBeat = s.notes.length > 0
          ? s.notes.reduce((m, n) => Math.max(m, n.endBeat ?? n.beat), 0)
          : chart.notes.reduce((m, n) => Math.max(m, n.endBeat ?? n.beat), 0);
        store.setPlaybackDuration(timingForDuration.beatToSeconds(maxBeat) + 2);
      }
      store.setAudioPhase('ready');
    } catch (err) {
      console.error('[Editor] Audio load failed:', err);
      store.setAudioPhase('idle');
    }
  }, [chart, file.path, audioPhase, editedTiming]);

  const playbackLoop = useCallback(() => {
    const timing = editedTimingRef.current;
    if (!isPlayingRef.current || !timing) return;
    const elapsed = (performance.now() - playbackStartRef.current) / 1000 * speedRef.current;
    const currentSec = playbackOffsetRef.current + elapsed;
    let lo = 0, hi = totalBeats;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (timing.beatToSeconds(mid) < currentSec) lo = mid;
      else hi = mid;
    }
    playbackBeatRef.current = lo;
    const now = performance.now();
    if (now - lastUiUpdateRef.current > 100) {
      lastUiUpdateRef.current = now;
      store.setPlaybackTime(currentSec);
      store.setCurrentBeat(lo);
    }
    const es = useEditorStore.getState();
    // A-B loop: if loopB is set and we've passed it, seek back to loopA
    if (es.loopA !== null && es.loopB !== null && lo >= es.loopB) {
      handleSeek(timing.beatToSeconds(es.loopA));
      return;
    }
    if (currentSec >= es.playbackDuration) {
      handlePlaybackStop();
      return;
    }
    schedulerRef.current = requestAnimationFrame(playbackLoop);
  }, [totalBeats]);

  const handlePlaybackPlay = useCallback(() => {
    if (audioPhase !== 'ready' && audioPhase !== 'paused') return;
    const timing = editedTimingRef.current;
    if (!timing || !audioPreloaderRef.current) return;
    isPlayingRef.current = true;
    speedRef.current = playbackSpeed;
    playbackStartRef.current = performance.now();
    const preloader = audioPreloaderRef.current;
    const ctx = preloader.context;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const startSec = playbackOffsetRef.current;
    const allNotes = [...useEditorStore.getState().notes].sort((a, b) => a.beat - b.beat);
    for (const note of allNotes) {
      if (!note.keysound || note.keysound === '00') continue;
      const noteSec = timing.beatToSeconds(note.beat);
      if (noteSec < startSec) continue;
      const delay = (noteSec - startSec) / playbackSpeed;
      preloader.playAudioSync(note.keysound.toLowerCase(), false, true, 0, ctx.currentTime + delay, volumeRef.current);
    }
    store.setAudioPhase('playing');
    schedulerRef.current = requestAnimationFrame(playbackLoop);
  }, [audioPhase, playbackSpeed, playbackLoop]);

  const handlePlaybackPause = useCallback(() => {
    if (audioPhase !== 'playing') return;
    isPlayingRef.current = false;
    const elapsed = (performance.now() - playbackStartRef.current) / 1000 * speedRef.current;
    playbackOffsetRef.current += elapsed;
    if (schedulerRef.current) cancelAnimationFrame(schedulerRef.current);
    audioPreloaderRef.current?.stopAllAudio();
    store.setCurrentBeat(playbackBeatRef.current);
    store.setPlaybackTime(playbackOffsetRef.current);
    store.setAudioPhase('paused');
  }, [audioPhase]);

  const handlePlaybackStop = useCallback(() => {
    isPlayingRef.current = false;
    playbackOffsetRef.current = 0;
    if (schedulerRef.current) cancelAnimationFrame(schedulerRef.current);
    audioPreloaderRef.current?.stopAllAudio();
    store.setPlaybackTime(0);
    store.setAudioPhase(
      (['idle', 'loading'] as AudioPhase[]).includes(useEditorStore.getState().audioPhase)
        ? useEditorStore.getState().audioPhase
        : 'ready'
    );
  }, []);

  const handlePlaybackToggle = useCallback(() => {
    if (audioPhase === 'playing') handlePlaybackPause();
    else handlePlaybackPlay();
  }, [audioPhase, handlePlaybackPause, handlePlaybackPlay]);

  const handleSeek = useCallback((targetSec: number) => {
    const timing = editedTimingRef.current;
    if (!timing) return;
    const dur = useEditorStore.getState().playbackDuration;
    const clampedSec = Math.max(0, Math.min(targetSec, dur));
    const wasPlaying = isPlayingRef.current;
    isPlayingRef.current = false;
    if (schedulerRef.current) cancelAnimationFrame(schedulerRef.current);
    audioPreloaderRef.current?.stopAllAudio();
    playbackOffsetRef.current = clampedSec;
    store.setPlaybackTime(clampedSec);
    let lo = 0, hi = totalBeats;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (timing.beatToSeconds(mid) < clampedSec) lo = mid;
      else hi = mid;
    }
    playbackBeatRef.current = lo;
    store.setCurrentBeat(lo);
    if (wasPlaying && audioPreloaderRef.current) {
      const preloader = audioPreloaderRef.current;
      const ctx = preloader.context;
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        isPlayingRef.current = true;
        speedRef.current = playbackSpeed;
        playbackStartRef.current = performance.now();
        const allNotes = [...useEditorStore.getState().notes].sort((a, b) => a.beat - b.beat);
        for (const note of allNotes) {
          if (!note.keysound || note.keysound === '00') continue;
          const noteSec = timing.beatToSeconds(note.beat);
          if (noteSec < clampedSec) continue;
          const delay = (noteSec - clampedSec) / playbackSpeed;
          preloader.playAudioSync(note.keysound.toLowerCase(), false, true, 0, ctx.currentTime + delay, volumeRef.current);
        }
        store.setAudioPhase('playing');
        schedulerRef.current = requestAnimationFrame(playbackLoop);
      }
    } else if (!wasPlaying) {
      const phase = useEditorStore.getState().audioPhase;
      if (phase === 'playing') store.setAudioPhase('paused');
    }
  }, [totalBeats, playbackSpeed, playbackLoop]);

  const handleBack = useCallback(() => {
    if (useEditorStore.getState().hasUnsavedChanges) {
      store.setShowBackConfirm(true);
    } else {
      handlePlaybackStop();
      onBack();
    }
  }, [onBack, handlePlaybackStop]);

  // Keep actionMap in sync
  useEffect(() => { actionMapRef.current = buildActionMap(keyBindings); }, [keyBindings]);

  // Keep speed/volume refs in sync
  useEffect(() => { speedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Cleanup
  useEffect(() => {
    return () => {
      audioPreloaderRef.current?.releaseAllResources();
      audioPreloaderRef.current = null;
      if (schedulerRef.current) cancelAnimationFrame(schedulerRef.current);
    };
  }, []);

  // Auto-save (every 60s when dirty)
  const autoSaveRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    autoSaveRef.current = setInterval(async () => {
      const s = useEditorStore.getState();
      if (!s.hasUnsavedChanges || !s.editableChart) return;
      try {
        const writer = new BMSWriter();
        const chartToSave: EditableBMSChart = {
          headers: s.headers || s.editableChart.headers,
          notes: s.notes,
          timeSignatures: s.timeSignatures,
          bpmChanges: s.bpmChanges,
          stopEvents: s.stopEvents,
          bgaEvents: s.editableChart.bgaEvents,
        };
        const content = writer.write(chartToSave);
        await window.api.file.writeAutoSave(file.path, content);
      } catch (err) {
        console.warn('[Editor] Auto-save failed:', err);
      }
    }, 60000);
    return () => clearInterval(autoSaveRef.current);
  }, [file.path]);

  // Check for autosave on mount
  const [showAutoSaveRecovery, setShowAutoSaveRecovery] = useState(false);
  const autoSaveContentRef = useRef<string | null>(null);
  useEffect(() => {
    (async () => {
      const content = await window.api.file.checkAutoSave(file.path);
      if (content) {
        autoSaveContentRef.current = content;
        setShowAutoSaveRecovery(true);
      }
    })();
  }, [file.path]);

  // Clean up autosave on explicit save
  const originalHandleSave = handleSave;
  const handleSaveWithCleanup = useCallback(async () => {
    await originalHandleSave();
    window.api.file.deleteAutoSave(file.path).catch(() => {});
  }, [originalHandleSave, file.path]);

  // Navigation guard
  useEffect(() => {
    if (hasUnsavedChanges) {
      onRegisterGuard(() => ({
        blocked: true,
        message: '저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?',
        onSave: handleSaveWithCleanup,
      }));
    } else {
      onRegisterGuard(null);
    }
  }, [hasUnsavedChanges, onRegisterGuard, handleSaveWithCleanup]);

  useEffect(() => {
    return () => onRegisterGuard(null);
  }, [onRegisterGuard]);

  // Play test mode
  const [playTestMode, setPlayTestMode] = useState(false);
  const handlePlayTest = useCallback(async () => {
    // Auto-save before play test
    const s = useEditorStore.getState();
    if (s.hasUnsavedChanges && s.editableChart) {
      await handleSaveWithCleanup();
    }
    setPlayTestMode(true);
  }, [handleSaveWithCleanup]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const selectedNotesList = useMemo(
    () => notes.filter((n) => selectedNotes.has(n.id)),
    [notes, selectedNotes],
  );

  const bpmChangesWithBeat = useMemo(
    () => bpmChanges.map((b) => ({ ...b, beat: bpmBeat(b) })),
    [bpmChanges],
  );

  const stopEventsWithBeat = useMemo(
    () => stopEvents.map((s) => ({ ...s, beat: bpmBeat(s) })),
    [stopEvents],
  );

  const currentEditableChart = useMemo<EditableBMSChart | null>(() => {
    if (!editableChart) return null;
    return {
      headers: headers || editableChart.headers,
      notes,
      timeSignatures,
      bpmChanges,
      stopEvents,
      bgaEvents: editableChart.bgaEvents,
    };
  }, [editableChart, headers, notes, timeSignatures, bpmChanges, stopEvents]);

  const isAudioReady = audioPhase === 'ready' || audioPhase === 'playing' || audioPhase === 'paused';

  const previewKeysound = useCallback((id: string) => {
    if (audioPreloaderRef.current) {
      audioPreloaderRef.current.stopAllAudio();
      audioPreloaderRef.current.playAudioSync(id.toLowerCase());
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">Loading chart...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-zinc-950">
        <div className="text-red-400">Error: {error}</div>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">Back to Home</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* ===== HEADER BAR ===== */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={handleBack} className="p-1 rounded hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{chart?.songInfo?.title || file.name}</span>
        {hasUnsavedChanges && <span className="text-yellow-500 text-xs font-bold">● 수정 중</span>}
        <div className="flex-1" />
        <button onClick={store.toggleLeftPanel} className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400" title="키사운드 패널">
          {showLeftPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <button onClick={store.toggleRightPanel} className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400" title="정보 패널">
          {showRightPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setShowDiff((v) => !v)}
          className={`p-1 rounded hover:bg-zinc-800 transition-colors text-xs ${showDiff ? 'text-orange-400' : 'text-zinc-400'}`}
          title="변경사항 비교"
        >
          Diff
        </button>
        <button
          onClick={() => setShowBpmTap(true)}
          className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400 text-xs"
          title="BPM 탭"
        >
          BPM
        </button>
        <button
          onClick={handlePlayTest}
          className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400 text-xs"
          title="플레이 테스트 (F5)"
        >
          F5
        </button>
        <button
          onClick={() => setShowAutoChart(true)}
          className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400 text-xs"
          title="AI 차트 생성"
        >
          AI
        </button>
        <button
          onClick={() => setShowAudioSlicer(true)}
          className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400 text-xs"
          title="오디오 슬라이서"
        >
          슬라이서
        </button>
        <button
          onClick={() => setShowMidiDialog(true)}
          className={`p-1 rounded hover:bg-zinc-800 transition-colors text-xs ${midiRecordingMode !== 'off' ? 'text-green-400' : 'text-zinc-400'}`}
          title="MIDI 설정"
        >
          MIDI
        </button>
        <button
          onClick={() => setShowKeyBindings(true)}
          className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-400 text-xs"
          title="키 바인딩 설정"
        >
          ⌨
        </button>
        <div className="w-px h-4 bg-zinc-700" />
        <button
          onClick={handleSaveWithCleanup}
          disabled={!hasUnsavedChanges}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          저장
        </button>
      </div>

      {/* ===== MAIN 3-COLUMN LAYOUT ===== */}
      <div className="flex flex-1 min-h-0">
        {/* --- LEFT: Keysound / Pattern Panel --- */}
        {showLeftPanel && (
          <div className="w-52 border-r border-zinc-800 flex flex-col bg-zinc-900 shrink-0">
            <div className="flex border-b border-zinc-800 shrink-0">
              <button
                onClick={() => setLeftPanelTab('keysound')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  leftPanelTab === 'keysound' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                키음
              </button>
              <button
                onClick={() => setLeftPanelTab('pattern')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  leftPanelTab === 'pattern' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                패턴
              </button>
            </div>
            {leftPanelTab === 'keysound' ? (
              <KeysoundPanel
                keysounds={keysoundRecord}
                currentKeysound={currentKeysound}
                onSelect={store.setCurrentKeysound}
                onPreview={previewKeysound}
                isAudioReady={isAudioReady}
                isAudioLoading={audioPhase === 'loading'}
                onUploadClick={handleImportKeysounds}
              />
            ) : (
              <PatternLibraryPanel
                onApplyPattern={handleApplyPattern}
                onSaveSelection={handleSaveSelectionAsPattern}
              />
            )}
          </div>
        )}

        {/* --- CENTER: Toolbar + Playback + Canvas --- */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditorToolbar
            activeTool={activeTool}
            onToolChange={store.setActiveTool}
            gridSnap={gridSnap}
            onGridSnapChange={store.setGridSnap}
            selectedNoteType={selectedNoteType}
            onNoteTypeChange={store.setSelectedNoteType}
            keyMode={chart?.keyMode || '7K'}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={store.undo}
            onRedo={store.redo}
            onCopy={store.copy}
            onPaste={store.paste}
          />

          {/* Playback Controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-muted/30 shrink-0 text-xs">
            {audioPhase === 'idle' ? (
              <button onClick={loadAudio} className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-300">
                <Volume2 className="h-3.5 w-3.5" />
                오디오 로드
              </button>
            ) : audioPhase === 'loading' ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>로딩 {audioLoadProgress.loaded}/{audioLoadProgress.total}</span>
                {audioLoadProgress.total > 0 && (
                  <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${(audioLoadProgress.loaded / audioLoadProgress.total) * 100}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={handlePlaybackToggle} className="p-1.5 rounded hover:bg-muted transition-colors" title="Space">
                  {audioPhase === 'playing' ? <Pause className="h-4 w-4 text-orange-400" /> : <Play className="h-4 w-4 text-green-400" />}
                </button>
                <button onClick={handlePlaybackStop} className="p-1.5 rounded hover:bg-muted transition-colors">
                  <Square className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <span className="text-muted-foreground font-mono min-w-[70px]">
                  {formatTime(playbackTime)} / {formatTime(playbackDuration)}
                </span>
                <div
                  className="flex-1 min-w-[60px] max-w-[200px] h-3 group cursor-pointer flex items-center"
                  onClick={(e) => {
                    if (playbackDuration <= 0) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    handleSeek(ratio * playbackDuration);
                  }}
                >
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden group-hover:h-1.5 transition-all relative">
                    <div className="h-full bg-orange-500 rounded-full transition-[width] duration-75" style={{ width: playbackDuration > 0 ? `${(playbackTime / playbackDuration) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div className="w-px h-4 bg-zinc-700" />
                {[0.5, 0.75, 1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => store.setPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      playbackSpeed === spd ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                {/* A-B Loop indicator */}
                {(store.loopA !== null || store.loopB !== null) && (
                  <button
                    onClick={() => { store.setLoopA(null); store.setLoopB(null); }}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-orange-900/50 text-orange-300 hover:bg-orange-800/50"
                    title="[ ] 루프 해제 (\)"
                  >
                    🔁 {store.loopA !== null ? Math.floor(store.loopA / 4) : '?'}-{store.loopB !== null ? Math.floor(store.loopB / 4) : '?'}
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => store.setVolume(volume > 0 ? 0 : 0.8)} className="p-1 rounded hover:bg-muted transition-colors">
                  {volume > 0 ? <Volume2 className="h-3.5 w-3.5 text-muted-foreground" /> : <VolumeX className="h-3.5 w-3.5 text-zinc-500" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    store.setVolume(v);
                    audioPreloaderRef.current?.setMasterVolume?.(v);
                  }}
                  className="w-16 h-1 accent-blue-500"
                />
              </>
            )}
          </div>

          {/* Canvas with Context Menu */}
          <EditorContextMenu
            selectedCount={selectedNotes.size}
            hasClipboard={clipboard.length > 0}
            onCopy={store.copy}
            onCut={store.cut}
            onPaste={store.paste}
            onDelete={() => store.deleteNotes(Array.from(selectedNotes))}
            onSelectAll={store.selectAll}
            onClearSelection={store.clearSelection}
            onChangeType={store.changeNoteType}
          >
            <div className="flex-1 min-h-0">
              {chart && (
                <NoteChartEditor
                  notes={notes}
                  keyMode={chart.keyMode}
                  totalBeats={totalBeats}
                  height="100%"
                  activeTool={activeTool}
                  gridSnap={gridSnap}
                  selectedNotes={selectedNotes}
                  selectedNoteType={selectedNoteType}
                  currentKeysound={currentKeysound}
                  onNoteAdd={store.addNote}
                  onNoteDelete={store.deleteNotes}
                  onNoteMove={handleNoteMove}
                  onNoteSelect={handleNoteSelect}
                  onNoteUpdate={store.updateNote}
                  bpmChanges={bpmChanges}
                  stopEvents={stopEvents}
                  baseBpm={editedBaseBpm}
                  onBpmChange={store.changeBpm}
                  onBpmRequest={store.requestBpmAdd}
                  onBpmEditRequest={store.requestBpmEdit}
                  onStopRequest={store.requestStopAdd}
                  onStopEditRequest={store.requestStopEdit}
                  onKeysoundAssign={handleKeysoundAssign}
                  onDropKeysound={handleDropKeysound}
                  onNoteHover={handleNoteHover}
                  hasUnsavedChanges={hasUnsavedChanges}
                  scrollToBeat={currentBeat}
                  onScrollChange={store.setCurrentBeat}
                  scrollBeatImperativeRef={audioPhase === 'playing' ? playbackBeatRef : undefined}
                />
              )}
            </div>
          </EditorContextMenu>
        </div>

        {/* --- RIGHT: Header Editor + Note Info + Minimap --- */}
        {showRightPanel && <div className="w-56 border-l border-zinc-800 flex flex-col bg-zinc-900 shrink-0 min-h-0 overflow-hidden">
          {selectedNotesList.length > 0 && (
            <div className="border-b border-zinc-800 shrink-0">
              <NoteInfoPanel
                selectedNotes={selectedNotesList}
                wavDefinitions={wavDefinitions}
                bpmChanges={bpmChangesWithBeat}
                stopEvents={stopEventsWithBeat}
                initialBpm={editedBaseBpm}
                gridSnap={gridSnap}
                currentKeysound={currentKeysound}
                onAddKeysoundLayer={store.addKeysoundLayer}
                onRemoveKeysoundLayer={store.removeKeysoundLayer}
              />
            </div>
          )}
          <div className="border-b border-zinc-800 shrink-0 max-h-48 overflow-y-auto">
            <BeatKeysoundPanel
              notes={notes}
              currentBeat={currentBeat}
              wavDefinitions={wavDefinitions}
              onPreview={previewKeysound}
              isAudioReady={isAudioReady}
            />
          </div>
          {/* Chart Statistics */}
          <div className="border-b border-zinc-800 shrink-0 px-3 py-2">
            <h3 className="text-xs font-semibold text-zinc-400 mb-1.5">통계</h3>
            <ChartStatsView notes={notes} bpm={editedBaseBpm} totalBeats={totalBeats} />
          </div>
          <div className={headerCollapsed ? 'shrink-0' : 'flex-1 min-h-0 flex flex-col'}>
            <button
              onClick={store.toggleHeaderCollapsed}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800 shrink-0"
            >
              <span>차트 정보</span>
              <span className="text-[10px]">{headerCollapsed ? '▸' : '▾'}</span>
            </button>
            {!headerCollapsed && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {currentEditableChart ? (
                  <HeaderEditorPanel chart={currentEditableChart} onHeaderChange={store.changeHeader} />
                ) : chart && (
                  <div className="p-3 text-xs space-y-3">
                    <div>
                      <label className="text-zinc-500">제목</label>
                      <div className="mt-0.5 text-zinc-200">{chart.songInfo?.title || '-'}</div>
                    </div>
                    <div>
                      <label className="text-zinc-500">아티스트</label>
                      <div className="mt-0.5 text-zinc-200">{chart.songInfo?.artist || '-'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-zinc-800 h-48 shrink-0">
            {chart && (
              <Minimap
                notes={notes}
                totalBeats={totalBeats}
                currentBeat={currentBeat}
                viewportBeats={16}
                onNavigate={store.setCurrentBeat}
              />
            )}
          </div>
        </div>}
      </div>

      {/* ===== STATUS BAR ===== */}
      {/* ===== STATUS BAR + DIFFICULTY ===== */}
      <div className="flex items-center border-t border-zinc-800 bg-zinc-900">
        <div className="flex-1">
          <StatusBar currentBeat={currentBeat} gridSnap={gridSnap} selectedCount={selectedNotes.size} totalNotes={notes.length} bpm={editedBaseBpm} zoom={1} />
        </div>
        {midiRecordingMode !== 'off' && (
          <div className="px-2 text-[10px] text-green-400 shrink-0">
            MIDI: {midiRecordingMode === 'step' ? '스텝' : '실시간'}
          </div>
        )}
        <div className="px-3 text-[10px] text-zinc-500 shrink-0">
          추정 난이도: <span className="text-zinc-300 font-semibold">{estimateDifficulty(notes, editedBaseBpm, totalBeats) || '-'}</span>/12
        </div>
      </div>

      {/* ===== INPUT DIALOG (BPM/STOP) ===== */}
      {inputDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => store.setInputDialog(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              {inputDialog.type === 'bpm-add' && 'BPM 추가'}
              {inputDialog.type === 'bpm-edit' && 'BPM 수정'}
              {inputDialog.type === 'stop-add' && 'STOP 추가'}
              {inputDialog.type === 'stop-edit' && 'STOP 수정'}
            </h3>
            {(inputDialog.type === 'stop-add' || inputDialog.type === 'stop-edit') && (
              <p className="text-[10px] text-zinc-500 mb-2">192 = 1비트, 0 입력 시 삭제</p>
            )}
            <form onSubmit={(e) => { e.preventDefault(); store.submitInputDialog(inputDialogRef.current?.value || ''); }}>
              <input
                ref={inputDialogRef} type="number" step="any" defaultValue={inputDialog.defaultValue} autoFocus
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => { if (e.key === 'Escape') store.setInputDialog(null); }}
              />
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" onClick={() => store.setInputDialog(null)} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">취소</button>
                <button type="submit" className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">확인</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== BACK CONFIRMATION ===== */}
      {showBackConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => store.setShowBackConfirm(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">저장하지 않은 변경사항</h3>
            <p className="text-xs text-zinc-400 mb-4">저장하지 않은 변경사항이 있습니다. 저장하지 않고 나가시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => store.setShowBackConfirm(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">취소</button>
              <button
                onClick={async () => { await handleSaveWithCleanup(); store.setShowBackConfirm(false); handlePlaybackStop(); onBack(); }}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >저장 후 나가기</button>
              <button
                onClick={() => { store.setShowBackConfirm(false); handlePlaybackStop(); onBack(); }}
                className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
              >저장 안 함</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BPM TAP DIALOG ===== */}
      {showBpmTap && (
        <BpmTapDialog
          onClose={() => setShowBpmTap(false)}
          onApply={(bpm) => { store.changeHeader('bpm', bpm); setShowBpmTap(false); }}
        />
      )}

      {/* ===== MEASURE INSERT/DELETE DIALOG ===== */}
      {measureDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMeasureDialog(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">
              {measureDialog.type === 'insert' ? '마디 삽입' : '마디 삭제'}
            </h3>
            <p className="text-[10px] text-zinc-500 mb-2">
              {measureDialog.type === 'insert' ? '지정 마디 앞에 빈 마디를 삽입합니다.' : '지정 마디의 노트를 삭제하고 이후 내용을 당깁니다.'}
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const val = parseInt(measureInputRef.current?.value || '');
              if (isNaN(val) || val < 0) return;
              if (measureDialog.type === 'insert') store.insertMeasure(val);
              else store.deleteMeasure(val);
              setMeasureDialog(null);
            }}>
              <input
                ref={measureInputRef}
                type="number" min={0} step={1}
                defaultValue={Math.floor(currentBeat / 4)}
                autoFocus
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="마디 번호"
                onKeyDown={(e) => { if (e.key === 'Escape') setMeasureDialog(null); }}
              />
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" onClick={() => setMeasureDialog(null)} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800">취소</button>
                <button type="submit" className={`px-3 py-1 text-xs text-white rounded ${measureDialog.type === 'insert' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {measureDialog.type === 'insert' ? '삽입' : '삭제'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== AUTO-SAVE RECOVERY ===== */}
      {showAutoSaveRecovery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-80 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">자동 저장 복구</h3>
            <p className="text-xs text-zinc-400 mb-4">이전 세션의 자동 저장 데이터가 발견되었습니다. 복구하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAutoSaveRecovery(false);
                  autoSaveContentRef.current = null;
                  window.api.file.deleteAutoSave(file.path).catch(() => {});
                }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
              >무시</button>
              <button
                onClick={async () => {
                  if (autoSaveContentRef.current) {
                    await window.api.file.saveBms(file.path, autoSaveContentRef.current);
                    await window.api.file.deleteAutoSave(file.path).catch(() => {});
                    autoSaveContentRef.current = null;
                    load(file.path); // Reload the recovered file
                  }
                  setShowAutoSaveRecovery(false);
                }}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >복구</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PLAY TEST OVERLAY ===== */}
      {playTestMode && (
        <div className="fixed inset-0 z-[60] bg-zinc-950">
          <Player
            file={file}
            onBack={() => setPlayTestMode(false)}
            onRegisterGuard={() => {}}
          />
        </div>
      )}

      {/* ===== CHART DIFF ===== */}
      {showDiff && chart && originalChartInfoRef.current && (
        <div className="fixed inset-0 z-[55] bg-zinc-950/95 overflow-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-200">변경사항 비교</h2>
            <button onClick={() => setShowDiff(false)} className="px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 rounded">닫기 (Esc)</button>
          </div>
          <BmsChartDiff
            oldChart={originalChartInfoRef.current}
            newChart={{
              notes: notes.map((n) => ({ beat: n.beat, column: n.column, keysound: n.keysound, noteType: n.noteType, endBeat: n.endBeat })),
              keyMode: chart.keyMode,
              totalBeats: totalBeats,
              bpm: { initial: editedBaseBpm, min: editedBaseBpm, max: editedBaseBpm },
              stats: {
                total: notes.filter((n) => n.noteType === 'playable').length,
                scratch: 0,
                longNotes: notes.filter((n) => n.endBeat !== undefined).length,
                landmines: notes.filter((n) => n.noteType === 'landmine').length,
              },
            }}
            filePath={file.path}
          />
        </div>
      )}

      {/* ===== NOTE SEARCH ===== */}
      {chart && (
        <NoteSearchDialog
          open={showNoteSearch}
          onClose={() => setShowNoteSearch(false)}
          notes={notes}
          keyMode={chart.keyMode}
          wavDefinitions={wavDefinitions}
          onSelectNotes={(ids) => store.selectNotes(ids)}
          onNavigate={store.setCurrentBeat}
        />
      )}

      {/* ===== AUTO CHART DIALOG ===== */}
      {showAutoChart && (
        <AutoChartDialog
          open={showAutoChart}
          onClose={() => setShowAutoChart(false)}
          existingNotes={notes.filter((n) => n.noteType === 'playable').map((n) => ({
            beat: n.beat,
            column: n.column,
            columnIndex: laneIds.indexOf(n.column),
          }))}
          laneIds={laneIds}
          bpm={editedBaseBpm}
          currentBeat={currentBeat}
          gridSnap={gridSnap}
          onApplyNotes={(generatedNotes: GeneratedNote[]) => {
            const s = useEditorStore.getState();
            store.pushUndo('Auto-generate chart');
            let nextId = s.nextNoteId;
            const newNotes = generatedNotes.map((gn) => {
              const col = laneIds[gn.columnIndex] || laneIds[0] || '';
              const { measure, fraction } = beatToMF(gn.beat);
              return {
                id: `note-${nextId++}`,
                beat: gn.beat,
                column: col,
                noteType: gn.noteType,
                keysound: s.currentKeysound,
                measure,
                fraction,
                channel: '',
                endBeat: gn.endBeat,
              };
            });
            useEditorStore.setState({
              notes: [...s.notes, ...newNotes],
              nextNoteId: nextId,
              hasUnsavedChanges: true,
            });
            showToast(`${newNotes.length}개 노트 생성 완료`, 'success');
          }}
        />
      )}

      {/* ===== AUDIO SLICER ===== */}
      {showAudioSlicer && (
        <AudioSlicer
          open={showAudioSlicer}
          onClose={() => setShowAudioSlicer(false)}
          bmsFilePath={file.path}
          usedWavIds={new Set(Object.keys(keysoundRecord).map((k) => k.toUpperCase()))}
          onSlicesCreated={(wavDefs) => {
            store.updateHeadersWithWavDefs(wavDefs);
            showToast(`${Object.keys(wavDefs).length}개 슬라이스 저장 완료`, 'success');
            setShowAudioSlicer(false);
          }}
        />
      )}

      {/* ===== MIDI MAPPING DIALOG ===== */}
      <MidiMappingDialog
        open={showMidiDialog}
        onClose={() => setShowMidiDialog(false)}
        laneIds={laneIds}
        mapping={midiMapping}
        onMappingChange={setMidiMapping}
        recordingMode={midiRecordingMode}
        onRecordingModeChange={setMidiRecordingMode}
      />

      {/* ===== KEY BINDINGS DIALOG ===== */}
      <KeyBindingsDialog
        open={showKeyBindings}
        onClose={() => setShowKeyBindings(false)}
        bindings={keyBindings}
        onBindingsChange={setKeyBindings}
      />

      {/* ===== TOAST ===== */}
      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className={`px-4 py-2 rounded-lg text-xs font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-green-900/90 text-green-200 border border-green-700/50' : 'bg-red-900/90 text-red-200 border border-red-700/50'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
