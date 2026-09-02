import React, { useEffect, useLayoutEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Save, RefreshCw, Play, Pause, Square, Volume2, VolumeX, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, GitCompare, Timer, PlayCircle, Wand2, Scissors, Piano, Keyboard, ChevronDown, Settings2, GripVertical, Undo2, Redo2, Eye, EyeOff, Lock, Unlock, Bookmark, Map as LucideMap, Maximize2, X as XIcon } from 'lucide-react';
// Removed react-resizable-panels — using custom resize handles instead
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
import type { BmsChartDiffInfo, NoteChartEditorProps, ZoomControl } from '@rhythm-archive/bms-editor';
import type { EditableBMSNote, EditableBMSChart, TimingAction } from '@rhythm-archive/bms-core';
import { BMSWriter, Timing } from '@rhythm-archive/bms-core';
import { beatToTick } from '../lib/tickUtils';
import { AudioPreloader, WorkerAudioScheduler } from '@rhythm-archive/bms-player';
import type { FileMap, SchedulerNote } from '@rhythm-archive/bms-player';
import AudioSchedulerWorkerConstructor from '../workers/audioScheduler.worker?worker';
import type { CurrentFile, NavigationGuard } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';
import { createLocalAudioWorker } from '../lib/LocalAudioWorker';
import { Player } from './Player';
import { useEditorStore } from '../stores/editorStore';
import type { AudioPhase, PasteAnalysis, LayerConfig } from '../stores/editorStore';
import { deserializeMeta, serializeMeta, buildMetaFromState, applyMetaToState } from '../lib/bmsMeta';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PatternLibraryPanel } from '../components/PatternLibraryPanel';
import { KeyBindingsDialog } from '../components/KeyBindingsDialog';
import { NoteColorDialog } from '../components/NoteColorDialog';
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
  isConnected as isMidiConnected,
} from '../lib/midiInput';
import { AudioSlicer } from '../components/AudioSlicer';
import { AutoChartDialog } from '../components/AutoChartDialog';
import { BeatKeysoundPanel } from '../components/BeatKeysoundPanel';
import { ChartStatsView, estimateDifficulty } from '../components/ChartStatsView';
import { BpmTapDialog } from '../components/BpmTapDialog';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { ToastStack, useToastStack } from '../components/ToastStack';
import type { GeneratedNote } from '../lib/autoChart';
import { createBeatConverter } from '../lib/beatConverter';
import { computeDensityMap, densityToColor } from '../lib/densityMap';
import type { MinimapDensityEntry, MinimapBookmark } from '@rhythm-archive/bms-editor';
// WaveformOverlay removed — requires NoteChartEditor internal coordinate sync to work correctly

type ModalType = 'noteSearch' | 'bpmTap' | 'measureInsert' | 'measureDelete' | 'keyBindings' | 'autoChart' | 'midi' | 'autoSaveRecovery' | 'replaceKeysound' | 'addBookmark' | 'clipboardHistory' | 'noteColor' | null;
type OverlayType = 'diff' | 'audioSlicer' | 'playTest' | null;

/** Isolated playback time display — subscribes only to playbackTime/playbackDuration to avoid re-rendering the entire Editor */
function PlaybackTimeDisplay() {
  const playbackTime = useEditorStore((s) => s.playbackTime);
  const playbackDuration = useEditorStore((s) => s.playbackDuration);
  return (
    <span className="text-muted-foreground font-mono min-w-[70px]">
      {formatTime(playbackTime)} / {formatTime(playbackDuration)}
    </span>
  );
}

/** Isolated seekbar — subscribes only to playbackTime/playbackDuration */
function PlaybackSeekbar({ onSeek }: { onSeek: (sec: number) => void }) {
  const playbackTime = useEditorStore((s) => s.playbackTime);
  const playbackDuration = useEditorStore((s) => s.playbackDuration);
  // Detach in-flight drag listeners if the seekbar unmounts mid-drag
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);
  return (
    <div
      className="flex-1 min-w-[100px] h-5 group cursor-pointer flex items-center relative select-none"
      onMouseDown={(e) => {
        if (playbackDuration <= 0) return;
        const bar = e.currentTarget;
        const seek = (clientX: number) => {
          const rect = bar.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          onSeek(ratio * playbackDuration);
        };
        seek(e.clientX);
        const onMove = (ev: MouseEvent) => seek(ev.clientX);
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          dragCleanupRef.current = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        dragCleanupRef.current = onUp;
      }}
    >
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-visible group-hover:h-2 transition-all relative">
        <div className="h-full bg-orange-500 rounded-full transition-[width] duration-75" style={{ width: playbackDuration > 0 ? `${(playbackTime / playbackDuration) * 100}%` : '0%' }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-orange-400 rounded-full border-2 border-zinc-900 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: playbackDuration > 0 ? `calc(${(playbackTime / playbackDuration) * 100}% - 6px)` : '0' }}
        />
      </div>
    </div>
  );
}

/** Isolated audio loading progress */
function AudioLoadingProgress() {
  const { t } = useTranslation('editor');
  const audioLoadProgress = useEditorStore((s) => s.audioLoadProgress);
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{t('routes.editor.audioLoading', { loaded: audioLoadProgress.loaded, total: audioLoadProgress.total })}</span>
      {audioLoadProgress.total > 0 && (
        <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(audioLoadProgress.loaded / audioLoadProgress.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** Read a persisted panel width, falling back when the stored value is missing/corrupt. */
function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = parseInt(localStorage.getItem(key) ?? '', 10);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── currentBeat isolated subscriber components ───────────────────────────
// If currentBeat is included in useShallow, the entire Editor re-renders on every scroll.
// The bridge components below subscribe instead, blocking re-renders of the Editor body.

/** NoteChartEditor: subscribes to currentBeat only for scrollToBeat */
function NoteChartEditorBridge(props: Omit<NoteChartEditorProps, 'scrollToBeat'>) {
  const scrollToBeat = useEditorStore(s => s.currentBeat);
  return <NoteChartEditor {...props} scrollToBeat={scrollToBeat} />;
}

/** Minimap: isolated currentBeat subscription */
function MinimapBridge({ notes, totalBeats, viewportBeats, onNavigate, densityData, bookmarks, hideHeader }: {
  notes: import('@rhythm-archive/bms-core').EditableBMSNote[];
  totalBeats: number;
  viewportBeats: number;
  onNavigate: (beat: number) => void;
  densityData?: MinimapDensityEntry[];
  bookmarks?: MinimapBookmark[];
  hideHeader?: boolean;
}) {
  const currentBeat = useEditorStore(s => s.currentBeat);
  return <Minimap notes={notes} totalBeats={totalBeats} currentBeat={currentBeat} viewportBeats={viewportBeats} onNavigate={onNavigate} densityData={densityData} bookmarks={bookmarks} hideHeader={hideHeader} />;
}

/** StatusBar: isolated currentBeat subscription */
function StatusBarBridge({ gridSnap, selectedCount, totalNotes, bpm, noteHeight, audioReady }: {
  gridSnap: number; selectedCount: number; totalNotes: number; bpm: number; noteHeight: number; audioReady: boolean;
}) {
  const currentBeat = useEditorStore(s => s.currentBeat);
  return <StatusBar currentBeat={currentBeat} gridSnap={gridSnap} selectedCount={selectedCount} totalNotes={totalNotes} bpm={bpm} noteHeight={noteHeight} audioReady={audioReady} />;
}

/** BeatKeysoundPanel: isolated currentBeat subscription */
function BeatKeysoundPanelBridge(props: Omit<React.ComponentPropsWithRef<typeof BeatKeysoundPanel>, 'currentBeat'>) {
  const currentBeat = useEditorStore(s => s.currentBeat);
  return <BeatKeysoundPanel {...props} currentBeat={currentBeat} />;
}

/** Layer visibility / lock / opacity panel */
const LAYER_KEYS: (keyof LayerConfig)[] = ['playable', 'invisible', 'landmine', 'bgm'];

function LayerPanel({ layerConfig, onVisibleToggle, onLockToggle, onOpacityChange }: {
  layerConfig: LayerConfig;
  onVisibleToggle: (layer: keyof LayerConfig) => void;
  onLockToggle: (layer: keyof LayerConfig) => void;
  onOpacityChange: (layer: keyof LayerConfig, opacity: number) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="px-3 py-2 space-y-1.5" data-testid="layer-panel">
      {LAYER_KEYS.map((layer) => {
        const s = layerConfig[layer];
        const label = t(`routes.editor.layerPanel.labels.${layer}`);
        return (
          <div key={layer} className="flex items-center gap-1.5">
            <button
              title={s.visible ? t('routes.editor.layerPanel.hideTitle') : t('routes.editor.layerPanel.showTitle')}
              aria-label={s.visible ? t('routes.editor.layerPanel.hideAria', { layer: label }) : t('routes.editor.layerPanel.showAria', { layer: label })}
              aria-pressed={s.visible}
              onClick={() => onVisibleToggle(layer)}
              className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-100 shrink-0"
              data-testid={`layer-visible-${layer}`}
            >
              {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-600" />}
            </button>
            <button
              title={s.locked ? t('routes.editor.layerPanel.unlockTitle') : t('routes.editor.layerPanel.lockTitle')}
              aria-label={s.locked ? t('routes.editor.layerPanel.unlockAria', { layer: label }) : t('routes.editor.layerPanel.lockAria', { layer: label })}
              aria-pressed={s.locked}
              onClick={() => onLockToggle(layer)}
              className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-100 shrink-0"
              data-testid={`layer-lock-${layer}`}
            >
              {s.locked ? <Lock className="h-3.5 w-3.5 text-yellow-400" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
            <span className="text-xs text-zinc-400 w-14 truncate shrink-0">{label}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.opacity}
              onChange={(e) => onOpacityChange(layer, parseFloat(e.target.value))}
              className="flex-1 min-w-0 h-1 accent-blue-500 cursor-pointer"
              title={t('routes.editor.layerPanel.opacityTitle', { percent: Math.round(s.opacity * 100) })}
              data-testid={`layer-opacity-${layer}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface EditorProps {
  file: CurrentFile;
  onBack: () => void;
  onClearFile?: () => void;
  onOpenFile?: (file: CurrentFile) => void;
  onRegisterGuard: (guard: NavigationGuard | null) => void;
}


export function Editor({ file, onBack, onClearFile, onOpenFile, onRegisterGuard }: EditorProps) {
  const { t } = useTranslation(['editor', 'app', 'common']);
  const { chart, isLoading, error, load } = useLocalBmsFile();

  // --- Zustand store (selective subscription — excludes high-frequency playbackTime/audioLoadProgress) ---
  const {
    notes, bpmChanges, stopEvents, headers, timeSignatures, editableChart, keyMode,
    hasUnsavedChanges, activeTool, gridSnap, gridSnapOverrides, snapEnabled, layerConfig, selectedNotes, selectedNoteType,
    currentKeysound, clipboard, clipboardHistory, undoStack, redoStack,
    audioPhase, playbackSpeed, volume,
    noteHeight, inputDialog, showLeftPanel, showRightPanel, showMinimap, headerCollapsed, showBackConfirm,
    loopA, loopB, highlightKeysound,
    bookmarks, customColors, bgmSoloChannel, bgmMutedChannels,
  } = useEditorStore(useShallow((s) => ({
    notes: s.notes, bpmChanges: s.bpmChanges, stopEvents: s.stopEvents, headers: s.headers,
    timeSignatures: s.timeSignatures, editableChart: s.editableChart, keyMode: s.keyMode,
    hasUnsavedChanges: s.hasUnsavedChanges, activeTool: s.activeTool, gridSnap: s.gridSnap,
    gridSnapOverrides: s.gridSnapOverrides, snapEnabled: s.snapEnabled, layerConfig: s.layerConfig,
    selectedNotes: s.selectedNotes, selectedNoteType: s.selectedNoteType, currentKeysound: s.currentKeysound,
    clipboard: s.clipboard, clipboardHistory: s.clipboardHistory, undoStack: s.undoStack, redoStack: s.redoStack,
    audioPhase: s.audioPhase, playbackSpeed: s.playbackSpeed, volume: s.volume,
    noteHeight: s.noteHeight, inputDialog: s.inputDialog, showLeftPanel: s.showLeftPanel,
    showRightPanel: s.showRightPanel, showMinimap: s.showMinimap, headerCollapsed: s.headerCollapsed, showBackConfirm: s.showBackConfirm,
    loopA: s.loopA, loopB: s.loopB, highlightKeysound: s.highlightKeysound,
    bookmarks: s.bookmarks, customColors: s.customColors,
    bgmSoloChannel: s.bgmSoloChannel, bgmMutedChannels: s.bgmMutedChannels,
  })));
  // Stable actions reference (Zustand actions are stable closures over set/get)
  const store = useMemo(() => useEditorStore.getState(), []);

  // BGM channel count for multi-lane rendering
  const bgmChannelCount = useMemo(() => {
    let max = 0;
    for (const n of notes) {
      if (n.noteType === 'bgm' && n.bgmChannel !== undefined && n.bgmChannel > max) {
        max = n.bgmChannel;
      }
    }
    return max + 1;  // 0-based → count
  }, [notes]);

  // Local dialog state — 2-layer enum (modal + overlay)
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<'keysound' | 'pattern'>('keysound');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((id: string) => setCollapsedSections((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const [keyBindings, setKeyBindings] = useState<KeyBinding[]>(() => loadKeyBindings());
  const actionMapRef = useRef(buildActionMap(keyBindings));
  const [midiMapping, setMidiMapping] = useState<MidiMapping>(() => loadMidiMapping() || createDefaultMapping([]));
  const [midiRecordingMode, setMidiRecordingMode] = useState<MidiRecordingMode>('off');
  const originalChartInfoRef = useRef<BmsChartDiffInfo | null>(null);
  /** True once a .bms.meta sidecar is known to exist for this file (so clearing it still rewrites). */
  const metaSidecarExistsRef = useRef(false);
  const measureInputRef = useRef<HTMLInputElement>(null);
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [pendingBookmarkMeasure, setPendingBookmarkMeasure] = useState(0);
  const [bookmarkEditMode, setBookmarkEditMode] = useState<'add' | 'rename'>('add');
  const bookmarkNameRef = useRef<HTMLInputElement>(null);
  // showWaveform removed — WaveformOverlay needs NoteChartEditor coordinate integration
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => readStoredWidth('editor-left-w', 208, 150, 400));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => readStoredWidth('editor-right-w', 224, 180, 400));
  const panelWidthsRef = useRef({ left: leftPanelWidth, right: rightPanelWidth });
  panelWidthsRef.current = { left: leftPanelWidth, right: rightPanelWidth };
  // Detach in-flight panel-resize listeners if the editor unmounts mid-drag
  const panelDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => panelDragCleanupRef.current?.(), []);
  const [minimapPopout, setMinimapPopout] = useState(false);
  const [popoutPos, setPopoutPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 220 : 800, y: typeof window !== 'undefined' ? window.innerHeight - 300 : 400 });
  const popoutDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const [windowHeight, setWindowHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 768));
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1400));

  // Clamp minimap popout within window bounds on open and on window resize
  useEffect(() => {
    const PW = 180, PH = 260;
    const clamp = () => {
      setPopoutPos(prev => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - PW)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - PH)),
      }));
    };
    if (minimapPopout) clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [minimapPopout]);

  // Track window height for reactive viewerHeight
  useEffect(() => {
    const handleResize = () => { setWindowHeight(window.innerHeight); setWindowWidth(window.innerWidth); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Clamp side panels so the center column (toolbar + canvas) keeps a usable
  // width on window resize; below this the wrapped toolbar eats the canvas.
  useEffect(() => {
    const NAV_W = 56, HANDLES_W = 6, MIN_CENTER_W = 420;
    const clampPanels = () => {
      const available = window.innerWidth - NAV_W - HANDLES_W - MIN_CENTER_W;
      const { left: lw, right: rw } = panelWidthsRef.current;
      const total = lw + rw;
      if (total <= available) return;
      const ratio = lw / (total || 1);
      const newLw = Math.max(150, Math.floor(available * ratio));
      const newRw = Math.max(180, available - newLw);
      if (newLw < lw) setLeftPanelWidth(newLw);
      if (newRw < rw) setRightPanelWidth(newRw);
    };
    clampPanels(); // also apply to the initial window size (restored small window)
    window.addEventListener('resize', clampPanels);
    return () => window.removeEventListener('resize', clampPanels);
  }, []);

  // Below this center width the 80px minimap sidebar is dropped so the
  // toolbar/canvas keep a usable width; the popout minimap remains available.
  const narrowCenter = (
    windowWidth - 56
    - (showLeftPanel ? leftPanelWidth + 6 : 0)
    - (showRightPanel ? rightPanelWidth + 6 : 0)
  ) < 480;

  // Close tool menu on outside click
  useEffect(() => {
    if (!showToolMenu) return;
    const handler = (e: MouseEvent) => {
      if (toolMenuRef.current && !toolMenuRef.current.contains(e.target as Node)) {
        setShowToolMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showToolMenu]);

  // For measure dialog default value — captures currentBeat at open time (using getState without subscription)
  const modalBeatRef = useRef(0);
  // Open modal (auto-closes any other modal)
  const openModal = useCallback((modal: ModalType) => {
    if (modal === 'measureInsert' || modal === 'measureDelete') {
      modalBeatRef.current = useEditorStore.getState().currentBeat;
    }
    setActiveModal(modal);
  }, []);
  // Open overlay (auto-closes any other overlay)
  const openOverlay = useCallback((overlay: OverlayType) => setActiveOverlay(overlay), []);

  // Audio refs (imperative, not in store)
  const audioPreloaderRef = useRef<AudioPreloader | null>(null);
  const inProgressPreloaderRef = useRef<AudioPreloader | null>(null);
  const loadAbortRef = useRef(false);
  const audioSchedulerRef = useRef<WorkerAudioScheduler | null>(null);
  const isPlayingRef = useRef(false);
  const playbackOffsetRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(0.8);
  const playbackBeatRef = useRef(0);
  const editedTimingRef = useRef<Timing | null>(null);
  const zoomControlRef = useRef<ZoomControl | null>(null);
  const [currentBeatScale, setCurrentBeatScale] = useState(20);
  // Preview track isolation
  const lastPreviewTrackRef = useRef<string | null>(null);
  const inputDialogRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  // Toast stack (replaces single toast)
  const { toasts: toastStack, show: showToast, dismiss: dismissToast } = useToastStack();
  // Store actions (e.g. setKeyMode's orphan-note warning) publish through
  // `state.toast`; surface it here and clear it so it shows exactly once.
  useEffect(() => useEditorStore.subscribe((s, prev) => {
    if (s.toast && s.toast !== prev.toast) {
      showToast(s.toast.message, s.toast.type);
      useEditorStore.getState().setToast(null);
    }
  }), [showToast]);

  useEffect(() => {
    store.reset();
    load(file.path);
  }, [file.path, load]);

  // Initialize from chart
  useEffect(() => {
    if (!chart || !chart.bmsChart) return;
    let cancelled = false;

    const run = async () => {
      // Phase A: convert BMSChart → EditableBMSChart (heaviest sync op)
      const ec = BMSWriter.fromBMSChart(chart.bmsChart!);

      // Yield so the chart header info can paint before the note-mapping freeze
      await new Promise<void>((r) => setTimeout(r, 0));
      if (cancelled) return;

      // Phase B: map notes with tick/beat calculations (O(N))
      const initConverter = createBeatConverter(ec.timeSignatures);
      const editableNotes: EditableBMSNote[] = chart.notes.map((n, i) => {
        // Prefer the position as written in the file; the writer uses it to
        // put untouched notes back on the source line resolution exactly.
        const derived = initConverter.beatToMF(n.beat);
        const measure = typeof n.measure === 'number' ? n.measure : derived.measure;
        const fraction = typeof n.fraction === 'number' ? n.fraction : derived.fraction;
        const tick = Math.round(n.beat * 960);
        const endTick = n.endBeat !== undefined ? Math.round(n.endBeat * 960) : undefined;
        return {
          id: `note-${i}`,
          beat: n.beat,
          tick,
          column: n.column || '',
          noteType: (n.noteType as EditableBMSNote['noteType']) || 'playable',
          keysound: n.keysound || '00',
          endBeat: n.endBeat,
          endTick,
          endMeasure: n.endMeasure,
          endFraction: n.endFraction,
          measure,
          fraction,
          channel: n.channel || '',
        };
      });

      // Assign bgmChannel to BGM notes (group same-tick notes into separate lanes)
      const bgmTickGroups = new Map<number, EditableBMSNote[]>();
      for (const n of editableNotes) {
        if (n.noteType !== 'bgm') continue;
        const group = bgmTickGroups.get(n.tick);
        if (group) group.push(n);
        else bgmTickGroups.set(n.tick, [n]);
      }
      for (const group of bgmTickGroups.values()) {
        for (let i = 0; i < group.length; i++) {
          group[i].bgmChannel = i;
        }
      }

      if (cancelled) return;

      // Phase C: commit to store (triggers re-render with notes)
      store.initFromChart(ec, editableNotes, editableNotes.length + 1, chart.keyMode);
      // Load .bms.meta sidecar (only apply if no user changes yet)
      window.api.file.readMeta(file.path).then((metaJson) => {
        if (cancelled) return; // a newer file superseded this load
        if (metaJson) metaSidecarExistsRef.current = true;
        if (metaJson && !useEditorStore.getState().hasUnsavedChanges) {
          const meta = deserializeMeta(metaJson);
          const stateUpdate = applyMetaToState(meta);
          // Restore bgmChannel assignments from meta
          if (meta.bgmChannels) {
            const s = useEditorStore.getState();
            const updatedNotes = s.notes.map((n) => {
              if (n.noteType === 'bgm' && meta.bgmChannels![n.id] !== undefined) {
                return { ...n, bgmChannel: meta.bgmChannels![n.id] };
              }
              return n;
            });
            useEditorStore.setState({ ...stateUpdate, notes: updatedNotes });
          } else {
            useEditorStore.setState(stateUpdate);
          }
        }
      }).catch(() => {});
      // Save original chart info for diff
      originalChartInfoRef.current = {
        notes: chart.notes,
        keyMode: chart.keyMode,
        totalBeats: chart.totalBeats || 100,
        bpm: chart.bpm,
        stats: chart.stats,
      };
    };

    run();
    return () => { cancelled = true; };
  }, [chart]);

  // Auto-load audio when chart is loaded (placed after loadAudio definition via ref)
  const autoLoadedRef = useRef(false);
  const loadAudioRef = useRef<(() => Promise<void>) | null>(null);

  // WAV definitions — prefer store headers.wav (reflects uploads/edits) over original chart.keysounds
  const wavDefinitions = useMemo(() => {
    const map = new Map<string, string>();
    const source = headers?.wav.size ? headers.wav : (chart ? new Map(Object.entries(chart.keysounds)) : null);
    if (!source) return map;
    for (const [id, filename] of source.entries()) {
      map.set(id, filename);
      const upper = id.toUpperCase();
      if (upper !== id) map.set(upper, filename);
    }
    return map;
  }, [headers, chart]);

  const keysoundRecord = useMemo<Record<string, string>>(() => {
    if (headers?.wav.size) {
      const rec: Record<string, string> = {};
      headers.wav.forEach((v: string, k: string) => { rec[k] = v; });
      return rec;
    }
    return chart?.keysounds || {};
  }, [headers, chart]);

  // Minimap density data — precompute per-measure density + color for Minimap overlay
  const minimapDensityData = useMemo((): MinimapDensityEntry[] | undefined => {
    if (!chart?.barLines || chart.barLines.length < 2 || notes.length === 0) return undefined;
    const totalMeasures = chart.barLines.length - 1;
    const density = computeDensityMap(notes, totalMeasures);
    return density.map((d) => ({
      normalized: d.normalized,
      color: densityToColor(d.normalized),
      startBeat: chart.barLines![d.measure] ?? d.measure * 4,
      endBeat: chart.barLines![d.measure + 1] ?? (d.measure + 1) * 4,
    }));
  }, [notes, chart]);

  // Minimap bookmarks — convert measure → beat
  const minimapBookmarks = useMemo((): MinimapBookmark[] => {
    if (!chart || bookmarks.length === 0) return [];
    return bookmarks.map((bm) => ({
      beat: store.mfToBeat(bm.measure, 0),
      name: bm.name,
      color: bm.color,
    }));
  }, [bookmarks, chart]);

  // Usage count per keysound (main keysound + additionalKeysounds included)
  const keysoundUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of Object.keys(keysoundRecord)) counts[id] = 0;
    for (const n of notes) {
      if (n.keysound && n.keysound !== '00') {
        counts[n.keysound] = (counts[n.keysound] || 0) + 1;
      }
      if (n.additionalKeysounds) {
        for (const ak of n.additionalKeysounds) {
          counts[ak.keysound] = (counts[ak.keysound] || 0) + 1;
        }
      }
    }
    return counts;
  }, [notes, keysoundRecord]);

  // Keysound management callbacks
  const [replaceKeysoundTarget, setReplaceKeysoundTarget] = useState<string | null>(null);

  const handleFindNotes = useCallback((keysoundId: string) => {
    store.selectByFilter({ keysounds: [keysoundId] });
    const first = notes.find((n) =>
      n.keysound === keysoundId ||
      n.additionalKeysounds?.some((ak: { keysound: string }) => ak.keysound === keysoundId)
    );
    if (first) {
      store.setCurrentBeat(first.beat);
    } else {
      showToast(t('editor:routes.editor.keysoundNoNotes'), 'error');
    }
  }, [notes, store]);

  const handleReplaceKeysound = useCallback((keysoundId: string) => {
    setReplaceKeysoundTarget(keysoundId);
    setActiveModal('replaceKeysound');
  }, []);

  const handleDeleteUnused = useCallback((keysoundId: string) => {
    const count = keysoundUsageCounts[keysoundId] ?? 0;
    if (count > 0) {
      // Confirm: replace all usages with silent (00) then delete
      const ok = window.confirm(t('editor:routes.editor.deleteUnusedConfirm', { count }));
      if (!ok) return;
      // Replace all notes using this keysound with 00
      const s = useEditorStore.getState();
      s.pushUndo('Delete keysound (replace with silent)');
      const updatedNotes = s.notes.map((n) =>
        n.keysound === keysoundId ? { ...n, keysound: '00' } : n
      );
      useEditorStore.setState({ notes: updatedNotes });
    }
    store.removeWavDefinitions([keysoundId]);
    showToast(t('editor:routes.editor.toast.keysoundDeleted', { id: keysoundId }), 'success');
  }, [keysoundUsageCounts, showToast]);

  // Lane config (uses store keyMode so mode switching works)
  const laneIds = useMemo(() => {
    return getLaneIds(keyMode);
  }, [keyMode]);

  const totalBeats = useMemo(() => {
    const chartMax = chart?.totalBeats || 100;
    if (notes.length === 0) return chartMax;
    let max = 0;
    for (const n of notes) {
      const b = n.endBeat ?? n.beat;
      if (b > max) max = b;
    }
    return Math.max(chartMax, Math.ceil(max) + 8);
  }, [notes, chart?.totalBeats]);

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
      actions.push({ type: 'bpm', beat: store.mfToBeat(bc.measure, bc.fraction), bpm: bc.bpm });
    }
    for (const se of stopEvents) {
      actions.push({ type: 'stop', beat: store.mfToBeat(se.measure, se.fraction), stopBeats: se.duration / 48 });
    }
    return new Timing(editedBaseBpm, actions);
  }, [chart, bpmChanges, stopEvents, editedBaseBpm, timeSignatures]);

  editedTimingRef.current = editedTiming;

  // --- Preview sound helper: stops only previous preview, not playback tracks ---
  const playPreview = useCallback((keysoundId: string) => {
    const preloader = audioPreloaderRef.current;
    if (!preloader) return;
    // Stop only the previous preview track instead of all audio
    if (lastPreviewTrackRef.current) {
      preloader.stopAudio(lastPreviewTrackRef.current);
    }
    const trackId = preloader.playAudioSync(keysoundId.toLowerCase());
    lastPreviewTrackRef.current = trackId;
  }, []);

  // --- Note selection with keysound preview ---
  const handleNoteSelect = useCallback((noteIds: string[], additive?: boolean) => {
    store.selectNotes(noteIds, additive);
    if (noteIds.length === 1 && audioPreloaderRef.current) {
      const note = useEditorStore.getState().notes.find((n) => n.id === noteIds[0]);
      if (note && note.keysound && note.keysound !== '00') {
        playPreview(note.keysound);
      }
    }
  }, [playPreview]);

  // --- Keysound assignment ---
  const handleKeysoundAssign = useCallback((noteId: string, keysoundId: string) => {
    store.updateNote(noteId, { keysound: keysoundId });
    if (audioPreloaderRef.current && keysoundId !== '00') {
      playPreview(keysoundId);
    }
  }, [playPreview]);

  // --- Note hover preview ---
  const lastHoverKeysoundRef = useRef<string | null>(null);
  const [hoverKeysoundInfo, setHoverKeysoundInfo] = useState<string | null>(null);
  const handleNoteHover = useCallback((keysoundId: string | null) => {
    if (keysoundId === lastHoverKeysoundRef.current) return;
    lastHoverKeysoundRef.current = keysoundId;
    // Show keysound info overlay
    if (keysoundId && keysoundId !== '00') {
      const filename = keysoundRecord[keysoundId] || keysoundRecord[keysoundId.toLowerCase()] || '';
      setHoverKeysoundInfo(`${keysoundId}: ${filename}`);
    } else {
      setHoverKeysoundInfo(null);
    }
    if (keysoundId && audioPreloaderRef.current) {
      playPreview(keysoundId);
    }
  }, [playPreview, keysoundRecord]);

  // --- Pattern apply/save ---
  const lastPatternInsertRef = useRef<{ patternId: string; beat: number } | null>(null);
  const handleApplyPattern = useCallback((pattern: PatternTemplate) => {
    const s = useEditorStore.getState();
    const beat = s.currentBeat;
    // Prevent duplicate insertion at the same beat (accidental double-click guard)
    const last = lastPatternInsertRef.current;
    if (last && last.patternId === pattern.id && Math.abs(last.beat - beat) < 0.01) return;
    lastPatternInsertRef.current = { patternId: pattern.id, beat };
    store.applyPattern(pattern, laneIds, beat, laneIds[0] || '', s.currentKeysound);
  }, [laneIds]);

  const handleSaveSelectionAsPattern = useCallback(() => {
    const result = store.selectionToPatternData(laneIds);
    return result ? { ...result, id: '', nameKey: '', category: 'custom' as const, tags: [], isBuiltIn: false } : null;
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

    // Realtime mode requires active playback
    if (mode === 'realtime' && !isPlayingRef.current) return;

    const mapping = midiMappingRef.current;
    const lane = mapping.noteToLane.get(event.note);
    if (!lane) return;

    const s = useEditorStore.getState();
    const gridStep = 4 / s.gridSnap;
    // Snap to grid in both modes
    const rawBeat = mode === 'realtime' ? playbackBeatRef.current : s.currentBeat;
    const beat = Math.round(rawBeat / gridStep) * gridStep;

    const { measure, fraction } = store.beatToMF(beat);
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
      playPreview(s.currentKeysound);
    }

    // Step mode: advance cursor
    if (mode === 'step') {
      store.setCurrentBeat(beat + gridStep);
    }
  }, []);

  // Connect MIDI on recording mode change. Access alone does not deliver
  // notes — an input must be connected in the MIDI dialog — so if nothing is
  // connected yet, open the dialog instead of silently recording nothing.
  useEffect(() => {
    if (midiRecordingMode === 'off') return;
    let cancelled = false;
    requestMidiAccess().then(() => {
      if (cancelled) return;
      if (!isMidiConnected()) setActiveModal('midi');
    });
    return () => { cancelled = true; };
  }, [midiRecordingMode]);

  // Release the MIDI input when the editor unmounts (the handler is module-global).
  useEffect(() => () => disconnectMidiInput(), []);

  const handleDropKeysound = useCallback((keysoundId: string, beat: number, column: string) => {
    const { selectedNoteType: snt } = useEditorStore.getState();
    const { measure, fraction } = store.beatToMF(beat);
    const isBgm = column === 'BGM' || snt === 'bgm';
    store.addNote({
      beat,
      column: isBgm ? undefined : column,
      noteType: isBgm ? 'bgm' : (snt === 'longNote' ? 'playable' : snt),
      keysound: keysoundId, measure, fraction, channel: '',
    });
    if (audioPreloaderRef.current && keysoundId !== '00') {
      playPreview(keysoundId);
    }
  }, [playPreview]);

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
      showToast(t('editor:routes.editor.toast.keysoundsImported', { count: Object.keys(newWavDefs).length }), 'success');
    } catch (err) {
      console.error('[Editor] Import keysounds failed:', err);
      showToast(t('editor:routes.editor.toast.keysoundImportFailed'), 'error');
    }
  }, [file.path, keysoundRecord, showToast]);

  // --- Save ---
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!chart || savingRef.current) return false;
    const chartToSave = store.savableChart();
    if (!chartToSave) return false;
    savingRef.current = true;
    try {
      // Detect LN mode from original chart headers: preserve LNOBJ if present
      const origLnObj = chartToSave.headers.lnobj;
      const lnMode = origLnObj ? 'lnobj' as const : 'channel' as const;
      const writer = new BMSWriter({ lnMode, lnObjValue: origLnObj || undefined });
      const wavKeys = new Set(chartToSave.headers.wav.keys());
      const undefinedKeys = new Set<string>();
      for (const note of chartToSave.notes) {
        if (note.keysound && note.keysound !== '00' && !wavKeys.has(note.keysound.toUpperCase())) {
          undefinedKeys.add(note.keysound.toUpperCase());
        }
      }
      if (undefinedKeys.size > 0) {
        console.warn('[Editor] Notes reference undefined WAV keys:', [...undefinedKeys]);
        showToast(t('editor:routes.editor.toast.undefinedWavWarning', { count: undefinedKeys.size, ids: [...undefinedKeys].slice(0, 3).join(', ') + (undefinedKeys.size > 3 ? '...' : '') }), 'warning');
      }
      // Check for notes at positions finer than standard BMS resolution (192)
      const highResNotes = chartToSave.notes.filter((n: { tick?: number }) => {
        if (n.tick === undefined) return false;
        const tickInMeasure = n.tick % 3840; // ticks per 4/4 measure
        return tickInMeasure % 20 !== 0; // 20 ticks = 1/192 of measure
      });
      if (highResNotes.length > 0) {
        showToast(t('editor:routes.editor.toast.highResWarning', { count: highResNotes.length }), 'warning');
      }
      const bmsContent = writer.write(chartToSave);
      await window.api.file.saveBms(file.path, bmsContent);
      // Save .bms.meta sidecar alongside BMS file
      const s = useEditorStore.getState();
      const meta = buildMetaFromState({
        gridSnapOverrides: s.gridSnapOverrides,
        minLnLength: s.minLnLength,
        bookmarks: s.bookmarks,
        noteGroups: s.noteGroups,
        notes: s.notes,
        customColors: s.customColors,
      });
      const metaJson = serializeMeta(meta);
      const metaHasContent = Object.entries(meta).some(([k, v]) =>
        k !== 'version' && v !== undefined && v !== null
        && !(Array.isArray(v) && v.length === 0)
        && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0));
      if (metaHasContent || metaSidecarExistsRef.current) {
        await window.api.file.saveMeta(file.path, metaJson).catch(() => {});
        metaSidecarExistsRef.current = true;
      }
      store.setHasUnsavedChanges(false);
      showToast(t('editor:routes.editor.toast.saved'), 'success');
      return true;
    } catch (err) {
      console.error('[Editor] Save failed:', err);
      showToast(t('editor:routes.editor.toast.saveFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [chart, file.path, showToast]);

  // Clean up autosave on explicit save
  const originalHandleSave = handleSave;
  const handleSaveWithCleanup = useCallback(async (): Promise<boolean> => {
    const success = await originalHandleSave();
    if (success) {
      window.api.file.deleteAutoSave(file.path).catch(() => {});
    }
    return success;
  }, [originalHandleSave, file.path]);

  // Save As
  const handleSaveAs = useCallback(async () => {
    const chartToSave = store.savableChart();
    if (!chart || !chartToSave) return;
    try {
      // Same LN encoding decision as handleSave — Save As must not silently
      // rewrite an LNOBJ chart as channel-style long notes (or vice versa).
      const origLnObj = chartToSave.headers.lnobj;
      const lnMode = origLnObj ? 'lnobj' as const : 'channel' as const;
      const writer = new BMSWriter({ lnMode, lnObjValue: origLnObj || undefined });
      const bmsContent = writer.write(chartToSave);
      const newPath = await window.api.file.saveAs(bmsContent, file.name);
      if (newPath) {
        // Carry the sidecar (bookmarks, colors, groups...) to the new file.
        const s = useEditorStore.getState();
        const meta = buildMetaFromState({
          gridSnapOverrides: s.gridSnapOverrides,
          minLnLength: s.minLnLength,
          bookmarks: s.bookmarks,
          noteGroups: s.noteGroups,
          notes: s.notes,
          customColors: s.customColors,
        });
        await window.api.file.saveMeta(newPath, serializeMeta(meta)).catch(() => {});
        store.setHasUnsavedChanges(false);
        showToast(t('editor:routes.editor.toast.savedAs'), 'success');
        // Continue editing the file we just wrote, not the old path.
        if (newPath !== file.path && onOpenFile) {
          const name = newPath.split(/[\\/]/).pop() || newPath;
          onOpenFile({ path: newPath, name, folderPath: newPath.slice(0, newPath.length - name.length - 1) });
        }
      }
    } catch (err) {
      console.error('[Editor] Save As failed:', err);
      showToast(t('editor:routes.editor.toast.saveFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
    }
  }, [chart, file.name, file.path, onOpenFile, showToast, t]);

  // --- Keyboard shortcuts (refs to avoid TDZ with callbacks defined later) ---
  const handleSaveRef = useRef(handleSaveWithCleanup);
  handleSaveRef.current = handleSaveWithCleanup;
  const handleSaveAsRef = useRef(handleSaveAs);
  handleSaveAsRef.current = handleSaveAs;

  // Application menu File ▸ Save / Save As (works regardless of key bindings).
  useEffect(() => {
    const onSave = () => { void handleSaveRef.current(); };
    const onSaveAs = () => { void handleSaveAsRef.current(); };
    window.addEventListener('bms:menu-save', onSave);
    window.addEventListener('bms:menu-save-as', onSaveAs);
    return () => {
      window.removeEventListener('bms:menu-save', onSave);
      window.removeEventListener('bms:menu-save-as', onSaveAs);
    };
  }, []);
  const handlePlayTestRef = useRef<(() => void) | null>(null);
  const handlePlaybackToggleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const combo = normalizeKeyCombo(e);
      const action = actionMapRef.current.get(combo);

      // Save/SaveAs always works even in input fields
      if (action === 'save') { e.preventDefault(); handleSaveRef.current(); return; }
      if (action === 'saveAs') { e.preventDefault(); handleSaveAs(); return; }
      if (isInput) return;
      if (!action) return;
      // A full-screen overlay (slicer, diff, play test) or a modal owns the
      // keyboard: chart-editing shortcuts must not fire behind it.
      if ((activeOverlay !== null || activeModal !== null) && action !== 'escape') return;

      e.preventDefault();
      const s = useEditorStore.getState();
      const gridStep = 4 / s.gridSnap;
      const ids = Array.from(s.selectedNotes);

      // Tool shortcuts
      const tool = TOOL_ACTION_MAP[action];
      if (tool) { store.setActiveTool(tool); return; }

      switch (action) {
        case 'undo': {
          const desc = useEditorStore.getState().undoStack.at(-1)?.description;
          store.undo();
          if (desc) showToast(t('editor:routes.editor.toast.undoAction', { description: desc }), 'info');
          break;
        }
        case 'redo': {
          const desc = useEditorStore.getState().redoStack.at(-1)?.description;
          store.redo();
          if (desc) showToast(t('editor:routes.editor.toast.redoAction', { description: desc }), 'info');
          break;
        }
        case 'copy': store.copy(); break;
        case 'cut': store.cut(); break;
        case 'paste': {
          const result = store.preparePaste(laneIds);
          if (result) {
            if (result.droppedCount > 0) {
              showToast(t('editor:routes.editor.toast.pasteDropped', { count: result.droppedCount }), 'warning');
            }
            if (result.conflicts.length > 0) {
              // For now: auto-replace conflicts (full dialog UI deferred to P1)
              store.executePaste(result, 'replace');
              showToast(t('editor:routes.editor.toast.pasteConflicts', { count: result.conflicts.length }), 'info');
            }
          }
          break;
        }
        case 'selectAll': store.selectAll(); break;
        case 'delete': store.deleteNotes(ids); break;
        case 'escape':
          // Stop any playing keysound preview
          if (lastPreviewTrackRef.current && audioPreloaderRef.current) {
            audioPreloaderRef.current.stopAudio(lastPreviewTrackRef.current);
            lastPreviewTrackRef.current = null;
          }
          if (s.inputDialog) store.setInputDialog(null);
          else if (activeModal) setActiveModal(null);
          else if (activeOverlay) setActiveOverlay(null);
          else store.clearSelection();
          break;
        case 'noteSearch': openModal('noteSearch'); break;
        case 'playTest': handlePlayTestRef.current?.(); break;
        case 'playToggle': handlePlaybackToggleRef.current?.(); break;
        case 'mirror': store.mirrorNotes(laneIds); break;
        case 'random': store.randomNotes(laneIds); break;
        case 'quantize': store.quantizeNotes(); break;
        case 'insertMeasure': openModal('measureInsert'); break;
        case 'deleteMeasure': openModal('measureDelete'); break;
        case 'moveUp': if (ids.length > 0) store.moveNotes(ids, { beat: gridStep }, laneIds); break;
        case 'moveDown': if (ids.length > 0) store.moveNotes(ids, { beat: -gridStep }, laneIds); break;
        case 'moveLeft': if (ids.length > 0) store.moveNotes(ids, { columnDelta: -1 }, laneIds); break;
        case 'moveRight': if (ids.length > 0) store.moveNotes(ids, { columnDelta: 1 }, laneIds); break;
        case 'setLoopA': store.setLoopA(s.currentBeat); break;
        case 'setLoopB': store.setLoopB(s.currentBeat); break;
        case 'clearLoop': store.setLoopA(null); store.setLoopB(null); break;
        case 'clipboardHistory':
          if (useEditorStore.getState().clipboardHistory.length > 0) setActiveModal('clipboardHistory');
          break;
        case 'togglePatternPanel': setLeftPanelTab((t) => t === 'pattern' ? 'keysound' : 'pattern'); break;
        case 'toggleDiff': activeOverlay === 'diff' ? setActiveOverlay(null) : openOverlay('diff'); break;
        case 'moveToBgm': store.changeNoteType('bgm'); break;
        case 'moveToPlay': {
          const firstLane = laneIds.find((id: string) => id !== 'SC' && id !== 'FZ' && id !== 'FZ2') ?? laneIds[0] ?? '1';
          store.changeNoteType('playable', firstLane);
          break;
        }
        case 'addBookmark': {
          const measure = store.beatToMF(useEditorStore.getState().currentBeat).measure;
          const existing = useEditorStore.getState().bookmarks.find((b) => b.measure === measure);
          if (existing) {
            setPendingBookmarkMeasure(measure);
            setBookmarkEditMode('rename');
            setActiveModal('addBookmark');
          } else {
            setPendingBookmarkMeasure(measure);
            setBookmarkEditMode('add');
            setActiveModal('addBookmark');
          }
          break;
        }
        case 'createGroup': {
          if (ids.length > 0) {
            const name = prompt(t('editor:routes.editor.createGroupPrompt'), `Group ${useEditorStore.getState().noteGroups.length + 1}`);
            if (name) store.createGroup(name, ids);
          }
          break;
        }
        case 'toggleSnap': store.toggleSnap(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [laneIds, activeModal, activeOverlay, handleSaveAs]);

  /**
   * Paste through `preparePaste` so out-of-key-mode columns are dropped and
   * overlapping notes are reported, whichever entry point triggered it
   * (Ctrl+V, toolbar, context menu, clipboard history).
   */
  const pasteWithChecks = useCallback(() => {
    const result = store.preparePaste(laneIds);
    if (!result) return;
    if (result.droppedCount > 0) {
      showToast(t('editor:routes.editor.toast.pasteDropped', { count: result.droppedCount }), 'warning');
    }
    if (result.conflicts.length > 0) {
      // For now: auto-replace conflicts (full dialog UI deferred to P1)
      store.executePaste(result, 'replace');
      showToast(t('editor:routes.editor.toast.pasteConflicts', { count: result.conflicts.length }), 'info');
    }
  }, [laneIds, showToast, t]);

  // --- Audio playback ---
  const loadAudio = useCallback(async () => {
    if (!chart || audioPhase === 'loading') return;
    store.setAudioPhase('loading');
    store.setAudioLoadProgress({ loaded: 0, total: 0 });
    let preloader: AudioPreloader | null = null;
    try {
      // Prefer the editable WAV table (reflects imported / sliced keysounds);
      // fall back to the originally parsed chart keysounds.
      const fileMap: FileMap = {};
      const storeWav = useEditorStore.getState().headers?.wav;
      const wavSource: Iterable<[string, string]> = storeWav && storeWav.size > 0
        ? storeWav.entries()
        : Object.entries(chart.keysounds);
      for (const [id, filename] of wavSource) {
        if (filename) fileMap[id.toLowerCase()] = filename;
      }
      const total = Object.keys(fileMap).length;
      if (total === 0) {
        audioSchedulerRef.current?.dispose();
        audioSchedulerRef.current = null;
        audioPreloaderRef.current?.releaseAllResources();
        audioPreloaderRef.current = null;
        store.setAudioPhase('ready');
        return;
      }
      const worker = createLocalAudioWorker(file.path);
      preloader = new AudioPreloader('', fileMap, worker, (type: string, payload: unknown) => {
        if (type === 'PROGRESS') {
          const p = payload as { loadedCount: number; total: number };
          store.setAudioLoadProgress({ loaded: p.loadedCount, total: p.total });
        }
      });
      inProgressPreloaderRef.current = preloader;
      await preloader.loadAll();
      // Bail-out: Editor unmounted or new file selected while loading
      if (loadAbortRef.current) {
        preloader.releaseAllResources();
        inProgressPreloaderRef.current = null;
        return;
      }
      await preloader.decodeAll();
      // Bail-out: abort() already resolved decodeAll early — don't proceed
      if (loadAbortRef.current) {
        preloader.releaseAllResources();
        inProgressPreloaderRef.current = null;
        return;
      }
      await preloader.initAudioWorklet();
      inProgressPreloaderRef.current = null;
      audioSchedulerRef.current?.dispose();
      audioSchedulerRef.current = null;
      audioPreloaderRef.current?.releaseAllResources();
      audioPreloaderRef.current = preloader;
      preloader = null; // transferred ownership
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
      preloader?.releaseAllResources();
      inProgressPreloaderRef.current = null;
      store.setAudioPhase('error');
      showToast(t('editor:routes.editor.toast.audioLoadFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
    }
  }, [chart, file.path, audioPhase, editedTiming, showToast, t]);

  // Auto-load audio effect (must be after loadAudio definition)
  loadAudioRef.current = loadAudio;
  useEffect(() => {
    if (!chart || autoLoadedRef.current) return undefined;
    if (Object.keys(chart.keysounds).length > 0) {
      autoLoadedRef.current = true;
      const timer = setTimeout(() => loadAudioRef.current?.(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [chart]);

  const handleSeekRef = useRef<(s: number) => void>(() => {});

  /** Build sorted notes for audio scheduler */
  const buildSchedulerNotes = useCallback((): SchedulerNote[] => {
    const timing = editedTimingRef.current;
    if (!timing) return [];
    const es = useEditorStore.getState();
    const solo = es.bgmSoloChannel;
    const muted = es.bgmMutedChannels;
    const bgmAudible = (n: EditableBMSNote) => {
      if (n.noteType !== 'bgm') return true;
      const ch = n.bgmChannel ?? 0;
      if (solo !== null) return ch === solo;
      return !muted.has(ch);
    };
    return [...es.notes]
      .filter((n) => n.noteType !== 'landmine' && n.keysound && n.keysound !== '00' && bgmAudible(n))
      .sort((a, b) => a.beat - b.beat)
      .map((n) => ({
        sec: timing.beatToSeconds(n.beat),
        keysound: n.keysound.toLowerCase(),
        offset: 0,
        volume: volumeRef.current,
      }));
  }, []);

  /** Create or recreate the audio scheduler worker */
  const createAudioScheduler = useCallback(() => {
    const preloader = audioPreloaderRef.current;
    if (!preloader) return;

    // Dispose old scheduler
    audioSchedulerRef.current?.dispose();

    const worker = new AudioSchedulerWorkerConstructor();
    const notes = buildSchedulerNotes();

    const scheduler = new WorkerAudioScheduler({
      worker,
      preloader,
      notes,
    });

    // UI updates from worker tick (~50ms)
    // Throttle store updates to ~10fps to reduce re-renders during playback
    let lastStoreUpdate = 0;
    scheduler.setOnTick((currentSec: number) => {
      const timing = editedTimingRef.current;
      if (!timing || !isPlayingRef.current) return;

      // Binary search for current beat
      let lo = 0, hi = totalBeats;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (timing.beatToSeconds(mid) < currentSec) lo = mid;
        else hi = mid;
      }
      playbackBeatRef.current = lo;
      playbackOffsetRef.current = currentSec;

      // Throttle store updates to ~100ms (10fps) — refs are always instant
      const now = performance.now();
      if (now - lastStoreUpdate > 100) {
        lastStoreUpdate = now;
        store.setPlaybackTime(currentSec);
        store.setCurrentBeat(lo);
      }

      // A-B loop check
      const es = useEditorStore.getState();
      if (es.loopA !== null && es.loopB !== null) {
        const loopStart = Math.min(es.loopA, es.loopB);
        const loopEnd = Math.max(es.loopA, es.loopB);
        if (loopStart < loopEnd && lo >= loopEnd) {
          handleSeekRef.current(timing.beatToSeconds(loopStart));
          return;
        }
      }

      // End of track
      if (currentSec >= es.playbackDuration) {
        handlePlaybackStop();
      }
    });

    scheduler.setOnEnd(() => {
      handlePlaybackStop();
    });

    audioSchedulerRef.current = scheduler;
  }, [totalBeats, buildSchedulerNotes]);

  const handlePlaybackPlay = useCallback(async () => {
    if (audioPhase !== 'ready' && audioPhase !== 'paused') return;
    if (!editedTimingRef.current || !audioPreloaderRef.current) return;
    const ctx = audioPreloaderRef.current.context;
    if (ctx?.state === 'suspended') await ctx.resume();

    // Always recreate scheduler to ensure latest notes are used
    createAudioScheduler();

    isPlayingRef.current = true;
    speedRef.current = playbackSpeed;
    audioPreloaderRef.current?.setPlaybackRate(playbackSpeed);
    store.setAudioPhase('playing');

    if (audioPhase === 'paused') {
      audioSchedulerRef.current?.resume(playbackOffsetRef.current, playbackSpeed);
    } else {
      audioSchedulerRef.current?.play(playbackOffsetRef.current, playbackSpeed);
    }
  }, [audioPhase, playbackSpeed, createAudioScheduler]);

  const handlePlaybackPause = useCallback(() => {
    if (audioPhase !== 'playing') return;
    isPlayingRef.current = false;
    audioSchedulerRef.current?.pause();
    audioPreloaderRef.current?.stopAllAudio();
    // playbackOffsetRef is continuously updated by onTick
    store.setCurrentBeat(playbackBeatRef.current);
    store.setPlaybackTime(playbackOffsetRef.current);
    store.setAudioPhase('paused');
  }, [audioPhase]);

  const handlePlaybackStop = useCallback(() => {
    isPlayingRef.current = false;
    const stoppedBeat = playbackBeatRef.current;
    playbackOffsetRef.current = 0;
    playbackBeatRef.current = 0;
    audioSchedulerRef.current?.stop();
    store.setPlaybackTime(0);
    if (stoppedBeat > 0) store.setCurrentBeat(stoppedBeat);
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
  handlePlaybackToggleRef.current = handlePlaybackToggle;

  const handleSeek = useCallback((targetSec: number) => {
    const timing = editedTimingRef.current;
    if (!timing) return;
    const dur = useEditorStore.getState().playbackDuration;
    const clampedSec = Math.max(0, Math.min(targetSec, dur));
    const wasPlaying = isPlayingRef.current;

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

    if (audioSchedulerRef.current) {
      // Always update Worker position (even when paused, for accurate resume)
      audioPreloaderRef.current?.stopAllAudio();
      audioSchedulerRef.current.seek(clampedSec, speedRef.current);
    }
    if (!wasPlaying) {
      const phase = useEditorStore.getState().audioPhase;
      if (phase === 'playing') store.setAudioPhase('paused');
    }
  }, [totalBeats]);

  const handleBack = useCallback(() => {
    if (useEditorStore.getState().hasUnsavedChanges) {
      store.setShowBackConfirm(true);
    } else {
      handlePlaybackStop();
      onBack();
    }
  }, [onBack, handlePlaybackStop]);

  // Keep refs in sync (avoid stale closures in handleSeek)
  useLayoutEffect(() => {
    handleSeekRef.current = handleSeek;
  });

  // Keep actionMap in sync
  useEffect(() => { actionMapRef.current = buildActionMap(keyBindings); }, [keyBindings]);

  // Keep speed/volume refs in sync
  useEffect(() => {
    speedRef.current = playbackSpeed;
    // Set audio playback rate (pitch+speed of keysounds)
    audioPreloaderRef.current?.setPlaybackRate(playbackSpeed);
    if (audioSchedulerRef.current && isPlayingRef.current) {
      // Clear already-scheduled sounds before changing speed
      audioPreloaderRef.current?.stopAllAudio();
      audioSchedulerRef.current.setSpeed(playbackSpeed);
    }
  }, [playbackSpeed]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Signal any in-progress loadAudio to bail out immediately
      loadAbortRef.current = true;
      // Abort and release the preloader currently being loaded (if any)
      inProgressPreloaderRef.current?.abort();
      inProgressPreloaderRef.current?.releaseAllResources();
      inProgressPreloaderRef.current = null;
      audioSchedulerRef.current?.dispose();
      audioSchedulerRef.current = null;
      audioPreloaderRef.current?.releaseAllResources();
      audioPreloaderRef.current = null;
    };
  }, []);

  // Auto-save (every 60s when dirty)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    autoSaveRef.current = setInterval(async () => {
      const chartToSave = store.savableChart();
      if (!useEditorStore.getState().hasUnsavedChanges || !chartToSave) return;
      try {
        const writer = new BMSWriter();
        const content = writer.write(chartToSave);
        await window.api.file.writeAutoSave(file.path, content);
      } catch (err) {
        console.warn('[Editor] Auto-save failed:', err);
      }
    }, 60000);
    return () => clearInterval(autoSaveRef.current);
  }, [file.path]);

  // Check for autosave on mount
  const autoSaveContentRef = useRef<string | null>(null);
  useEffect(() => {
    (async () => {
      const content = await window.api.file.checkAutoSave(file.path);
      if (content) {
        autoSaveContentRef.current = content;
        openModal('autoSaveRecovery');
      }
    })();
  }, [file.path]);

  // Navigation guard
  useEffect(() => {
    if (hasUnsavedChanges) {
      onRegisterGuard(() => ({
        blocked: true,
        message: t('editor:routes.editor.navGuardMessage'),
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
  const handlePlayTest = useCallback(async () => {
    // Stop editor playback before entering play test
    handlePlaybackStop();
    // Auto-save before play test
    const s = useEditorStore.getState();
    if (s.hasUnsavedChanges && s.editableChart) {
      const ok = await handleSaveWithCleanup();
      if (!ok) return; // Don't enter play test if save failed
    }
    openOverlay('playTest');
  }, [handleSaveWithCleanup, handlePlaybackStop]);
  handlePlayTestRef.current = handlePlayTest;

  // formatTime is now a module-level function (shared with PlaybackTimeDisplay)

  const selectedNotesList = useMemo(
    () => notes.filter((n) => selectedNotes.has(n.id)),
    [notes, selectedNotes],
  );

  const bpmChangesWithBeat = useMemo(
    () => bpmChanges.map((b) => ({ ...b, beat: store.mfToBeat(b.measure, b.fraction) })),
    [bpmChanges],
  );

  const stopEventsWithBeat = useMemo(
    () => stopEvents.map((s) => ({ ...s, beat: store.mfToBeat(s.measure, s.fraction) })),
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
      playPreview(id);
    }
  }, [playPreview]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">{t('editor:routes.editor.loadingChart')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 bg-zinc-950 px-8">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-lg font-semibold mb-2">{t('editor:routes.editor.error.cannotOpenTitle')}</div>
          <p className="text-sm text-zinc-400 mb-3">{t('editor:routes.editor.error.fileCorrupt')}</p>
          <div className="text-xs text-zinc-600 mb-1">{t('editor:routes.editor.error.filePath')}</div>
          <div className="text-xs text-zinc-400 font-mono bg-zinc-900 rounded px-3 py-1.5 mb-3 break-all select-all">{file.path}</div>
          <div className="text-xs text-zinc-600 mb-1">{t('editor:routes.editor.error.errorDetail')}</div>
          <div className="text-xs text-red-300/80 bg-red-950/30 border border-red-900/50 rounded px-3 py-1.5 mb-3 break-all select-all max-h-24 overflow-y-auto">{error}</div>
          <button
            onClick={() => navigator.clipboard.writeText(t('editor:routes.editor.copyErrorTemplate', { path: file.path, error }))}
            className="text-xs text-zinc-400 hover:text-zinc-300 underline"
          >
            {t('editor:routes.editor.error.copyErrorInfo')}
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => load(file.path)}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-300"
          >
            {t('editor:routes.editor.error.retry')}
          </button>
          <button
            onClick={async () => {
              const filePath = await window.api.file.openBmsFile();
              if (filePath && onOpenFile) {
                const name = filePath.split(/[/\\]/).pop() || '';
                const folder = filePath.replace(/[/\\][^/\\]*$/, '');
                onOpenFile({ path: filePath, name, folderPath: folder });
              }
            }}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors text-white"
          >
            {t('editor:routes.editor.error.openOtherFile')}
          </button>
          <button
            onClick={() => { onClearFile?.(); onBack(); }}
            className="text-blue-400 hover:text-blue-300 px-4 py-2 text-sm"
          >
            {t('editor:routes.editor.error.goHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* ===== HEADER BAR ===== */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={handleBack} className="p-2 rounded hover:bg-zinc-800 transition-colors" data-testid="back-btn">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{chart?.songInfo?.title || file.name}</span>
        {/* Save button — next to filename, highlighted when there are unsaved changes */}
        <button
          onClick={handleSaveWithCleanup}
          disabled={!hasUnsavedChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges
              ? 'bg-yellow-500 text-yellow-950 font-semibold hover:bg-yellow-400 shadow-sm shadow-yellow-500/30 animate-[pulse_2s_ease-in-out_1]'
              : 'bg-zinc-800 text-zinc-400'
          }`}
          title={t('editor:routes.editor.header.saveTitle')}
          data-testid="save-btn"
        >
          <Save className="h-3.5 w-3.5" />
          {hasUnsavedChanges ? t('editor:routes.editor.header.saveBtnUnsaved') : t('editor:routes.editor.header.saveBtnSaved')}
        </button>
        {hasUnsavedChanges && (
          <span data-testid="modified-indicator" className="text-xs text-orange-400 font-medium">
            {t('editor:routes.editor.header.modifiedIndicator')}
          </span>
        )}
        <div className="flex-1" />

        {/* === Measure insert/delete — exposed directly in the header === */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => openModal('measureInsert')}
            title={t('editor:routes.editor.header.insertMeasureTitle')}
            className="flex items-center gap-0.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <span className="font-bold text-zinc-300">+</span>{t('editor:routes.editor.header.measureLabel')}
          </button>
          <button
            onClick={() => openModal('measureDelete')}
            title={t('editor:routes.editor.header.deleteMeasureTitle')}
            className="flex items-center gap-0.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <span className="font-bold text-zinc-300">−</span>{t('editor:routes.editor.header.measureLabel')}
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* === Group: Settings (dropdown) === */}
        <div className="relative" ref={toolMenuRef}>
          <button
            onClick={() => setShowToolMenu(!showToolMenu)}
            aria-expanded={showToolMenu}
            aria-haspopup="menu"
            className={`flex items-center gap-1 px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors text-xs ${showToolMenu ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400'}`}
            title={t('editor:routes.editor.header.settingsTitle')}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>{t('editor:routes.editor.header.settingsLabel')}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {showToolMenu && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
              <button
                onClick={() => { openModal('autoChart'); setShowToolMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="ai-btn"
              >
                <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                {t('editor:routes.editor.header.aiChartLabel')}
              </button>
              <button
                onClick={() => { openOverlay('audioSlicer'); setShowToolMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="slicer-btn"
              >
                <Scissors className="h-3.5 w-3.5 text-blue-400" />
                {t('editor:routes.editor.header.audioSlicerLabel')}
              </button>
              <button
                onClick={() => { openModal('midi'); setShowToolMenu(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors ${midiRecordingMode !== 'off' ? 'text-green-400' : 'text-zinc-300'}`}
                data-testid="midi-btn"
              >
                <Piano className="h-3.5 w-3.5 text-green-400" />
                {t('editor:routes.editor.header.midiSettingsLabel')}
                {midiRecordingMode !== 'off' && <span className="ml-auto text-xs bg-green-900/50 px-1 rounded">{t('editor:routes.editor.header.midiOnBadge')}</span>}
              </button>
              <div className="h-px bg-zinc-800 my-1" />
              <button
                onClick={() => { openModal('keyBindings'); setShowToolMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="keybindings-btn"
              >
                <Keyboard className="h-3.5 w-3.5 text-zinc-400" />
                {t('editor:routes.editor.header.keyBindingsLabel')}
              </button>
              <button
                onClick={() => { openModal('noteColor'); setShowToolMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="note-color-btn"
              >
                <span className="h-3.5 w-3.5 rounded-sm border border-zinc-500 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #88aaff 0%, #ff4444 50%, #666 100%)' }} />
                {t('editor:routes.editor.header.noteColorLabel')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== MAIN 3-COLUMN LAYOUT ===== */}
      <div className="flex flex-1 min-h-0">
        {/* --- LEFT: Keysound / Pattern Panel --- */}
        {!showLeftPanel && (
          <button onClick={store.toggleLeftPanel} className="shrink-0 w-6 flex items-center justify-center bg-zinc-900 border-r border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200" title={t('editor:routes.editor.leftPanel.openPanelTitle')}>
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}
        {showLeftPanel && (
          <>
          <div style={{ width: leftPanelWidth }} className="border-r border-zinc-800 flex flex-col bg-zinc-900 shrink-0 overflow-hidden" data-testid="left-panel">
            <div className="flex border-b border-zinc-800 shrink-0">
              <button
                onClick={() => setLeftPanelTab('keysound')}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${
                  leftPanelTab === 'keysound' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('editor:routes.editor.leftPanel.keysoundTab')}
              </button>
              <button
                onClick={() => setLeftPanelTab('pattern')}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${
                  leftPanelTab === 'pattern' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('editor:routes.editor.leftPanel.patternTab')}
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
                keysoundUsageCounts={keysoundUsageCounts}
                onFindNotes={handleFindNotes}
                onReplaceKeysound={handleReplaceKeysound}
                onDeleteUnused={handleDeleteUnused}
                highlightKeysound={highlightKeysound}
                onHighlightKeysound={store.setHighlightKeysound}
                onSelectBgmNotes={(keysoundId: string) => store.selectByFilter({ keysounds: [keysoundId], noteTypes: ['bgm'] })}
              />
            ) : (
              <PatternLibraryPanel
                onApplyPattern={handleApplyPattern}
                onSaveSelection={handleSaveSelectionAsPattern}
              />
            )}
          </div>
          <div
            className="w-1.5 bg-zinc-800 hover:bg-blue-600 transition-colors cursor-col-resize flex items-center justify-center shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = leftPanelWidth;
              let lastW = startW;
              const onMove = (ev: MouseEvent) => {
                lastW = Math.max(150, Math.min(400, startW + ev.clientX - startX));
                setLeftPanelWidth(lastW);
              };
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                panelDragCleanupRef.current = null;
                try { localStorage.setItem('editor-left-w', String(lastW)); } catch { /* quota */ }
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
              panelDragCleanupRef.current = onUp;
            }}
          >
            <GripVertical className="h-4 w-2.5 text-zinc-600" />
          </div>
          </>
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
            keyMode={keyMode}
            onKeyModeChange={store.setKeyMode}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={store.undo}
            onRedo={store.redo}
            onCopy={store.copy}
            onPaste={pasteWithChecks}
            noteHeight={noteHeight}
            onNoteHeightChange={store.setNoteHeight}
            snapEnabled={snapEnabled}
            onSnapToggle={store.toggleSnap}
            layerConfig={layerConfig}
            onLayerVisibleToggle={(layer: string) => {
              if (layer in layerConfig) {
                const key = layer as keyof typeof layerConfig;
                store.setLayerVisible(key, !layerConfig[key].visible);
              }
            }}
            onLayerLockToggle={(layer: string) => {
              if (layer in layerConfig) {
                const key = layer as keyof typeof layerConfig;
                store.setLayerLocked(key, !layerConfig[key].locked);
              }
            }}
            onZoomIn={() => zoomControlRef.current?.zoomIn()}
            onZoomOut={() => zoomControlRef.current?.zoomOut()}
            onZoomPreset={(s: number) => zoomControlRef.current?.zoomTo(s)}
            onZoomFit={() => zoomControlRef.current?.fitToChart()}
            currentBeatScale={currentBeatScale}
          />

          {/* Playback Controls */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-muted/30 shrink-0 text-xs min-w-0 overflow-hidden" data-testid="playback-controls">
            {audioPhase === 'idle' && (!chart || Object.keys(chart.keysounds).length > 0) ? (
              // Chart not loaded yet or auto-load pending — show spinner to prevent button flicker
              <AudioLoadingProgress />
            ) : audioPhase === 'idle' ? (
              <button onClick={loadAudio} className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-300">
                <Volume2 className="h-3.5 w-3.5" />
                {t('editor:routes.editor.playback.loadAudio')}
              </button>
            ) : audioPhase === 'loading' ? (
              <AudioLoadingProgress />
            ) : audioPhase === 'error' ? (
              <button onClick={loadAudio} className="flex items-center gap-1.5 px-3 py-1 bg-red-900/40 hover:bg-red-900/60 border border-red-800/60 rounded transition-colors text-red-300" title={t('editor:routes.editor.playback.audioErrorTitle')}>
                <Volume2 className="h-3.5 w-3.5" />
                {t('editor:routes.editor.playback.retryAudio')}
              </button>
            ) : (
              <>
                <button onClick={handlePlaybackToggle} className="p-2 rounded hover:bg-muted transition-colors" title={t('editor:routes.editor.playback.playPauseTitle')}>
                  {audioPhase === 'playing' ? <Pause className="h-4 w-4 text-orange-400" /> : <Play className="h-4 w-4 text-green-400" />}
                </button>
                <button onClick={handlePlaybackStop} className="p-2 rounded hover:bg-muted transition-colors" title={t('editor:routes.editor.playback.stopTitle')}>
                  <Square className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <PlaybackTimeDisplay />
                <PlaybackSeekbar onSeek={handleSeek} />
                {/* A-B Loop indicator */}
                {(loopA !== null || loopB !== null) && (
                  <button
                    onClick={() => { store.setLoopA(null); store.setLoopB(null); }}
                    className="px-2 py-1 rounded text-xs bg-orange-900/50 text-orange-300 hover:bg-orange-800/50"
                    title={t('editor:routes.editor.playback.clearLoopTitle')}
                  >
                    🔁 {loopA !== null ? Math.floor(loopA / 4) : '?'}-{loopB !== null ? Math.floor(loopB / 4) : '?'}
                  </button>
                )}
                <div className="w-px h-4 bg-zinc-700" />
                {/* Speed control — select for presets + slider for fine control */}
                <select
                  value={[0.25, 0.5, 0.75, 1, 1.5, 2].includes(playbackSpeed) ? String(playbackSpeed) : 'custom'}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) store.setPlaybackSpeed(v); }}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-1.5 py-1 cursor-pointer"
                  title={t('editor:routes.editor.playback.speedPresetTitle')}
                >
                  {([0.25, 0.5, 0.75, 1, 1.5, 2] as const).map((s) => (
                    <option key={s} value={String(s)}>{s}×</option>
                  ))}
                  {![0.25, 0.5, 0.75, 1, 1.5, 2].includes(playbackSpeed) && (
                    <option value="custom">{playbackSpeed.toFixed(2)}×</option>
                  )}
                </select>
                <div className="w-px h-4 bg-zinc-700" />
                <button onClick={() => store.setVolume(volume > 0 ? 0 : 0.8)} className="p-2 rounded hover:bg-muted transition-colors" title={volume > 0 ? t('editor:routes.editor.playback.muteTitle') : t('editor:routes.editor.playback.unmuteTitle')}>
                  {volume > 0 ? <Volume2 className="h-3.5 w-3.5 text-muted-foreground" /> : <VolumeX className="h-3.5 w-3.5 text-zinc-500" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    store.setVolume(v);
                    audioPreloaderRef.current?.setMasterVolume?.(v);
                  }}
                  className="w-16 h-1 accent-blue-500 cursor-pointer"
                  title={t('editor:routes.editor.playback.volumeTitle', { percent: Math.round(volume * 100) })}
                />
                <div className="flex-1" />
                <div className="w-px h-4 bg-zinc-700" />
                {/* BPM tap + Play test — moved from header to transport context */}
                <button
                  onClick={() => openModal('bpmTap')}
                  className="p-2 rounded hover:bg-zinc-800 transition-colors text-zinc-400"
                  title={t('editor:routes.editor.playback.bpmTapTitle')}
                  data-testid="bpm-btn"
                >
                  <Timer className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handlePlayTest}
                  className="p-2 rounded hover:bg-zinc-800 transition-colors text-zinc-400"
                  title={t('editor:routes.editor.playback.playTestTitle')}
                  data-testid="play-test-btn"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {/* View toggles — always visible (regardless of audio state) */}
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              <div className="w-px h-4 bg-zinc-700 mx-0.5" />
              <button onClick={store.toggleLeftPanel} aria-pressed={showLeftPanel} aria-label={t('editor:routes.editor.playback.keysoundPanelTitle')} className="p-1.5 rounded hover:bg-zinc-800 transition-colors text-zinc-400" title={t('editor:routes.editor.playback.keysoundPanelTitle')} data-testid="toggle-left-panel">
                {showLeftPanel ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
              </button>
              <button onClick={store.toggleRightPanel} aria-pressed={showRightPanel} aria-label={t('editor:routes.editor.playback.infoPanelTitle')} className="p-1.5 rounded hover:bg-zinc-800 transition-colors text-zinc-400" title={t('editor:routes.editor.playback.infoPanelTitle')} data-testid="toggle-right-panel">
                {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              </button>
              <button onClick={store.toggleMinimap} aria-pressed={showMinimap} aria-label={t('editor:routes.editor.playback.minimapTitle')} className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${showMinimap ? 'text-zinc-200' : 'text-zinc-400'}`} title={t('editor:routes.editor.playback.minimapTitle')} data-testid="toggle-minimap">
                <LucideMap className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => activeOverlay === 'diff' ? setActiveOverlay(null) : openOverlay('diff')} aria-pressed={activeOverlay === 'diff'} aria-label={t('editor:routes.editor.playback.diffTitle')} className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${activeOverlay === 'diff' ? 'text-orange-400' : 'text-zinc-400'}`} title={t('editor:routes.editor.playback.diffTitle')} data-testid="diff-btn">
                <GitCompare className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Canvas with Context Menu */}
          <EditorContextMenu
            selectedCount={selectedNotes.size}
            hasClipboard={clipboard.length > 0}
            onCopy={store.copy}
            onCut={store.cut}
            onPaste={pasteWithChecks}
            onDelete={() => store.deleteNotes(Array.from(selectedNotes))}
            onSelectAll={store.selectAll}
            onClearSelection={store.clearSelection}
            onChangeType={store.changeNoteType}
          >
            <div className="flex-1 min-h-0 overflow-hidden relative" role="application" aria-label={t('editor:routes.editor.canvas.ariaLabel')}>
              {/* Keysound hover info overlay */}
              {hoverKeysoundInfo && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none px-3 py-1 bg-zinc-900/90 border border-zinc-700 rounded text-xs text-zinc-300 font-mono shadow-lg">
                  {hoverKeysoundInfo}
                </div>
              )}
              {/* Current keysound indicator for addNote/keysound tool */}
              {(activeTool === 'addNote' || activeTool === 'keysound') && currentKeysound && !hoverKeysoundInfo && (
                <div className="absolute top-2 right-3 z-10 pointer-events-none px-2 py-1 bg-zinc-900/80 border border-zinc-700/50 rounded text-xs text-zinc-400 font-mono">
                  {t('editor:routes.editor.canvas.keysoundIndicator', {
                    id: currentKeysound,
                    name: keysoundRecord[currentKeysound] ? ` (${keysoundRecord[currentKeysound]})` : currentKeysound === '00' ? t('editor:routes.editor.canvas.silentKeysound') : '',
                  })}
                </div>
              )}
              {chart && (
                <NoteChartEditorBridge
                  notes={notes}
                  keyMode={keyMode}
                  totalBeats={totalBeats}
                  height="100%"
                  activeTool={activeTool}
                  gridSnap={gridSnap}
                  snapEnabled={snapEnabled}
                  gridSnapOverrides={gridSnapOverrides}
                  layerConfig={layerConfig}
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
                  timeSignatures={timeSignatures}
                  bgmChannelCount={bgmChannelCount}
                  onBpmChange={store.changeBpm}
                  onBpmRequest={store.requestBpmAdd}
                  onBpmEditRequest={store.requestBpmEdit}
                  onStopRequest={store.requestStopAdd}
                  onStopEditRequest={store.requestStopEdit}
                  onStopDelete={store.deleteStop}
                  onKeysoundAssign={handleKeysoundAssign}
                  onDropKeysound={handleDropKeysound}
                  onNoteHover={handleNoteHover}
                  highlightKeysound={highlightKeysound}
                  noteHeight={noteHeight}
                  hasUnsavedChanges={hasUnsavedChanges}
                  onScrollChange={store.setCurrentBeat}
                  scrollBeatImperativeRef={audioPhase === 'playing' ? playbackBeatRef : undefined}
                  zoomControlRef={zoomControlRef}
                  onBeatScaleChange={setCurrentBeatScale}
                  customColors={customColors}
                />
              )}
            </div>
          </EditorContextMenu>
        </div>

        {/* ===== MINIMAP SIDEBAR (togglable, between canvas and right panel) ===== */}
        {chart && showMinimap && !minimapPopout && !narrowCenter && (
          <div className="w-20 border-l border-zinc-800 flex flex-col bg-zinc-950 shrink-0 min-h-0" data-testid="minimap-sidebar">
            <div className="px-1.5 py-1 flex items-center justify-between border-b border-zinc-800 shrink-0">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('editor:routes.editor.minimap.sidebarLabel')}</span>
              <button
                onClick={() => setMinimapPopout(true)}
                className="p-1.5 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-300"
                title={t('editor:routes.editor.minimap.popoutTitle')}
                aria-label={t('editor:routes.editor.minimap.popoutTitle')}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <MinimapBridge
                notes={notes}
                totalBeats={totalBeats}
                viewportBeats={16}
                onNavigate={store.setCurrentBeat}
                densityData={minimapDensityData}
                bookmarks={minimapBookmarks}
                hideHeader
              />
            </div>
          </div>
        )}

        {/* --- RIGHT: Header Editor + Note Info + Minimap --- */}
        {!showRightPanel && (
          <button onClick={store.toggleRightPanel} className="shrink-0 w-6 flex items-center justify-center bg-zinc-900 border-l border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200" title={t('editor:routes.editor.rightPanel.openPanelTitle')}>
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
        )}
        {showRightPanel && (
          <>
          <div
            className="w-1.5 bg-zinc-800 hover:bg-blue-600 transition-colors cursor-col-resize flex items-center justify-center shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = rightPanelWidth;
              let lastW = startW;
              const onMove = (ev: MouseEvent) => {
                lastW = Math.max(180, Math.min(400, startW - (ev.clientX - startX)));
                setRightPanelWidth(lastW);
              };
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                panelDragCleanupRef.current = null;
                try { localStorage.setItem('editor-right-w', String(lastW)); } catch { /* quota */ }
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
              panelDragCleanupRef.current = onUp;
            }}
          >
            <GripVertical className="h-4 w-2.5 text-zinc-600" />
          </div>
          <div style={{ width: rightPanelWidth }} className="border-l border-zinc-800 flex flex-col bg-zinc-900 shrink-0 min-h-0 overflow-y-auto overflow-x-hidden" data-testid="right-panel">
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
          <div className="border-b border-zinc-800 shrink-0">
            <button onClick={() => toggleSection('timeline')} className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
              <span>{t('editor:routes.editor.rightPanel.timelineSection')}</span><span>{collapsedSections.has('timeline') ? '▸' : '▾'}</span>
            </button>
          </div>
          {!collapsedSections.has('timeline') && <div className="border-b border-zinc-800 shrink-0 max-h-48 overflow-y-auto overflow-x-hidden">
            <BeatKeysoundPanelBridge
              notes={notes}
              wavDefinitions={wavDefinitions}
              onPreview={previewKeysound}
              isAudioReady={isAudioReady}
              showBgmManager
              onSelectBgmNotes={(ids) => store.selectNotes(ids)}
              onDeleteNotes={store.deleteNotes}
              bgmSoloChannel={bgmSoloChannel}
              bgmMutedChannels={bgmMutedChannels}
              onToggleSolo={store.toggleBgmSolo}
              onToggleMute={store.toggleBgmMute}
            />
          </div>}
          {/* Chart Statistics */}
          <div className="border-b border-zinc-800 shrink-0">
            <button onClick={() => toggleSection('stats')} className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors">
              <span>{t('editor:routes.editor.rightPanel.statsSection')}</span><span>{collapsedSections.has('stats') ? '▸' : '▾'}</span>
            </button>
            {!collapsedSections.has('stats') && (
              <div className="px-3 py-2">
                <ChartStatsView notes={notes} bpm={editedBaseBpm} totalBeats={totalBeats} />
              </div>
            )}
          </div>
          {/* Layer Panel */}
          <div className="border-b border-zinc-800 shrink-0">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <button onClick={() => toggleSection('layers')} className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1"><span>{t('editor:routes.editor.rightPanel.layersSection')}</span><span className="text-xs">{collapsedSections.has('layers') ? '▸' : '▾'}</span></button>
              <button
                onClick={store.resetLayerConfig}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                title={t('editor:routes.editor.rightPanel.resetLayersTitle')}
              >{t('editor:routes.editor.rightPanel.resetLayers')}</button>
            </div>
            {!collapsedSections.has('layers') && (
              <LayerPanel
                layerConfig={layerConfig}
                onVisibleToggle={(layer) => store.setLayerVisible(layer, !layerConfig[layer].visible)}
                onLockToggle={(layer) => store.setLayerLocked(layer, !layerConfig[layer].locked)}
                onOpacityChange={(layer, opacity) => store.setLayerOpacity(layer, opacity)}
              />
            )}
          </div>
          <div className={headerCollapsed ? 'shrink-0' : 'flex-1 min-h-[220px] flex flex-col'}>
            <button
              onClick={store.toggleHeaderCollapsed}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800 shrink-0"
            >
              <span>{t('editor:routes.editor.rightPanel.chartInfoSection')}</span>
              <span className="text-xs">{headerCollapsed ? '▸' : '▾'}</span>
            </button>
            {!headerCollapsed && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {currentEditableChart ? (
                  <HeaderEditorPanel
                    chart={currentEditableChart}
                    onHeaderChange={store.changeHeader}
                    onCustomHeaderSet={store.setCustomHeader}
                    onCustomHeaderDelete={store.deleteCustomHeader}
                    onWavDefSet={store.setWavDef}
                    onWavDefDelete={store.deleteWavDef}
                    onBmpDefSet={store.setBmpDef}
                    onBmpDefDelete={store.deleteBmpDef}
                    onRawApply={store.applyRawHeaders}
                  />
                ) : chart && (
                  <div className="p-3 text-xs space-y-3">
                    <div>
                      <label className="text-zinc-500">{t('editor:routes.editor.rightPanel.titleLabel')}</label>
                      <div className="mt-0.5 text-zinc-200">{chart.songInfo?.title || '-'}</div>
                    </div>
                    <div>
                      <label className="text-zinc-500">{t('editor:routes.editor.rightPanel.artistLabel')}</label>
                      <div className="mt-0.5 text-zinc-200">{chart.songInfo?.artist || '-'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
          </>
        )}

      </div>

      {/* ===== MINIMAP FLOATING POPOUT ===== */}
      {minimapPopout && chart && (
        <div
          style={{ position: 'fixed', left: popoutPos.x, top: popoutPos.y, zIndex: 50, width: 180, height: 260 }}
          className="border border-zinc-700 rounded bg-zinc-900 shadow-xl flex flex-col"
          data-testid="minimap-popout"
        >
          {/* Drag handle header — drag near right edge to re-dock */}
          <div
            className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-700 shrink-0 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              popoutDragRef.current = { startX: e.clientX, startY: e.clientY, originX: popoutPos.x, originY: popoutPos.y };
            }}
            onPointerMove={(e) => {
              if (!popoutDragRef.current) return;
              const SNAP = 48;
              const PW = 180, PH = 260;
              const W = window.innerWidth, H = window.innerHeight;
              let nx = popoutDragRef.current.originX + (e.clientX - popoutDragRef.current.startX);
              let ny = popoutDragRef.current.originY + (e.clientY - popoutDragRef.current.startY);
              if (nx < SNAP) nx = 0;
              if (nx + PW > W - SNAP) nx = W - PW;
              if (ny < SNAP) ny = 0;
              if (ny + PH > H - SNAP) ny = H - PH;
              setPopoutPos({ x: nx, y: ny });
            }}
            onPointerUp={(e) => {
              const dr = popoutDragRef.current;
              const wasDragging = dr !== null && (Math.abs(e.clientX - dr.startX) > 5 || Math.abs(e.clientY - dr.startY) > 5);
              popoutDragRef.current = null;
              // Auto-dock only when actually dragged to right edge (not on plain click)
              if (wasDragging && popoutPos.x + 180 >= window.innerWidth - rightPanelWidth - 6) {
                setMinimapPopout(false);
              }
            }}
          >
            <span>{t('editor:routes.editor.minimap.popoutLabel')}</span>
            <div className="flex items-center gap-0.5">
              {/* Dock back to sidebar */}
              <button
                onClick={() => setMinimapPopout(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title={t('editor:routes.editor.minimap.dockToSidebar')}
                aria-label={t('editor:routes.editor.minimap.dockToSidebarAria')}
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
              {/* Close popout — return to inline sidebar */}
              <button
                onClick={() => setMinimapPopout(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title={t('editor:routes.editor.minimap.closePopout')}
                aria-label={t('editor:routes.editor.minimap.closePopoutAria')}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MinimapBridge
              notes={notes}
              totalBeats={totalBeats}
              viewportBeats={16}
              onNavigate={store.setCurrentBeat}
              densityData={minimapDensityData}
              bookmarks={minimapBookmarks}
              hideHeader
            />
          </div>
        </div>
      )}

      {/* ===== STATUS BAR ===== */}
      <div className="flex items-center border-t border-zinc-800 bg-zinc-900" data-testid="status-bar">
        <div className="flex-1 min-w-0">
          <StatusBarBridge gridSnap={gridSnap} selectedCount={selectedNotes.size} totalNotes={notes.length} bpm={editedBaseBpm} noteHeight={noteHeight} audioReady={isAudioReady} />
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 text-xs text-zinc-400 border-l border-zinc-800">
          {midiRecordingMode !== 'off' && (
            <span className="text-green-400">MIDI: {midiRecordingMode === 'step' ? t('editor:routes.editor.statusBar.midiStep') : t('editor:routes.editor.statusBar.midiRealtime')}</span>
          )}
          {(undoStack.length > 0 || redoStack.length > 0) && (
            <span className="flex items-center gap-1">
              <Undo2 className="h-3 w-3" />{undoStack.length}
              <Redo2 className="h-3 w-3 ml-1" />{redoStack.length}
            </span>
          )}
          {t('editor:routes.editor.statusBar.estimatedDifficulty')} <span className="text-zinc-300 font-semibold">{estimateDifficulty(notes, editedBaseBpm, totalBeats) || '-'}</span>/12
          <LanguageSwitcher variant="compact" />
        </div>
      </div>

      {/* ===== INPUT DIALOG (BPM/STOP/TIMESIG) ===== */}
      <AccessibleDialog
        open={!!inputDialog}
        onClose={() => store.setInputDialog(null)}
        title={inputDialog?.type === 'bpm-add' ? t('editor:routes.editor.inputDialog.bpmAdd') : inputDialog?.type === 'bpm-edit' ? t('editor:routes.editor.inputDialog.bpmEdit') : inputDialog?.type === 'stop-add' ? t('editor:routes.editor.inputDialog.stopAdd') : inputDialog?.type === 'stop-edit' ? t('editor:routes.editor.inputDialog.stopEdit') : t('editor:routes.editor.inputDialog.timeSig', { measure: inputDialog?.measure ?? 0 })}
        className="border border-zinc-700 p-4 w-72"
      >
        {inputDialog && (
          <>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              {inputDialog.type === 'bpm-add' && t('editor:routes.editor.inputDialog.bpmAdd')}
              {inputDialog.type === 'bpm-edit' && t('editor:routes.editor.inputDialog.bpmEdit')}
              {inputDialog.type === 'stop-add' && t('editor:routes.editor.inputDialog.stopAdd')}
              {inputDialog.type === 'stop-edit' && t('editor:routes.editor.inputDialog.stopEdit')}
              {inputDialog.type === 'timesig-edit' && t('editor:routes.editor.inputDialog.timeSig', { measure: inputDialog.measure ?? 0 })}
            </h3>
            {(inputDialog.type === 'stop-add' || inputDialog.type === 'stop-edit') && (
              <p className="text-xs text-zinc-400 mb-2">{t('editor:routes.editor.inputDialog.stopHint')}</p>
            )}
            {inputDialog.type === 'timesig-edit' && (
              <p className="text-xs text-zinc-400 mb-2">{t('editor:routes.editor.inputDialog.timeSigHint')}</p>
            )}
            <form onSubmit={(e) => { e.preventDefault(); store.submitInputDialog(inputDialogRef.current?.value || ''); }}>
              <input
                ref={inputDialogRef} type="number" step="any" defaultValue={inputDialog.defaultValue} autoFocus
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" onClick={() => store.setInputDialog(null)} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">{t('editor:routes.editor.inputDialog.cancel')}</button>
                <button type="submit" className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">{t('editor:routes.editor.inputDialog.confirm')}</button>
              </div>
            </form>
          </>
        )}
      </AccessibleDialog>

      {/* ===== BACK CONFIRMATION ===== */}
      <AccessibleDialog open={showBackConfirm} onClose={() => store.setShowBackConfirm(false)} title={t('editor:routes.editor.backConfirm.title')} className="border border-zinc-700 p-4 w-80">
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">{t('editor:routes.editor.backConfirm.title')}</h3>
        <p className="text-xs text-zinc-400 mb-4">{t('editor:routes.editor.backConfirm.body')}</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => store.setShowBackConfirm(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">{t('editor:routes.editor.backConfirm.cancel')}</button>
          <button
            onClick={() => { store.setShowBackConfirm(false); handlePlaybackStop(); onBack(); }}
            className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
          >{t('editor:routes.editor.backConfirm.discard')}</button>
          <button
            onClick={async () => { const ok = await handleSaveWithCleanup(); if (!ok) return; store.setShowBackConfirm(false); handlePlaybackStop(); onBack(); }}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >{t('editor:routes.editor.backConfirm.saveAndLeave')}</button>
        </div>
      </AccessibleDialog>

      {/* ===== BPM TAP DIALOG ===== */}
      {activeModal === 'bpmTap' && (
        <BpmTapDialog
          onClose={() => setActiveModal(null)}
          onApply={(bpm) => { store.changeHeader('bpm', bpm); setActiveModal(null); }}
        />
      )}

      {/* ===== MEASURE INSERT/DELETE DIALOG ===== */}
      <AccessibleDialog
        open={activeModal === 'measureInsert' || activeModal === 'measureDelete'}
        onClose={() => setActiveModal(null)}
        title={activeModal === 'measureInsert' ? t('editor:routes.editor.measureDialog.insertTitle') : t('editor:routes.editor.measureDialog.deleteTitle')}
        className="border border-zinc-700 p-4 w-80"
      >
        <h3 data-testid="measure-dialog-title" className="text-sm font-semibold text-zinc-200 mb-3">
          {activeModal === 'measureInsert' ? t('editor:routes.editor.measureDialog.insertTitle') : t('editor:routes.editor.measureDialog.deleteTitle')}
        </h3>

        {/* Quick action buttons */}
        {activeModal === 'measureInsert' ? (
          <div className="flex flex-col gap-1.5 mb-3">
            <button
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 rounded text-left transition-colors"
              onClick={() => {
                const m = store.beatToMF(modalBeatRef.current).measure;
                store.insertMeasure(m);
                setActiveModal(null);
              }}
            >
              <span className="text-blue-400 font-bold">↑</span>
              <span>{t('editor:routes.editor.measureDialog.insertBefore', { measure: store.beatToMF(modalBeatRef.current).measure })}</span>
              <span className="ml-auto text-zinc-500">{t('editor:routes.editor.measureDialog.currentMeasureLabel')}</span>
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 rounded text-left transition-colors"
              onClick={() => {
                const m = store.beatToMF(modalBeatRef.current).measure;
                store.insertMeasure(m + 1);
                setActiveModal(null);
              }}
            >
              <span className="text-blue-400 font-bold">↓</span>
              <span>{t('editor:routes.editor.measureDialog.insertAfter', { measure: store.beatToMF(modalBeatRef.current).measure })}</span>
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <button
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-red-700 rounded text-left w-full transition-colors"
              onClick={() => {
                const m = store.beatToMF(modalBeatRef.current).measure;
                store.deleteMeasure(m);
                setActiveModal(null);
              }}
            >
              <span className="text-red-400 font-bold">✕</span>
              <span>{t('editor:routes.editor.measureDialog.deleteCurrent', { measure: store.beatToMF(modalBeatRef.current).measure })}</span>
              <span className="ml-auto text-zinc-500">{t('editor:routes.editor.measureDialog.currentMeasureLabel')}</span>
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 border-t border-zinc-700" />
          <span className="text-xs text-zinc-500">{t('editor:routes.editor.measureDialog.dividerLabel')}</span>
          <div className="flex-1 border-t border-zinc-700" />
        </div>

        {/* Manual input form */}
        <form onSubmit={(e) => {
          e.preventDefault();
          const val = parseInt(measureInputRef.current?.value || '');
          if (isNaN(val) || val < 0) return;
          if (activeModal === 'measureInsert') store.insertMeasure(val);
          else store.deleteMeasure(val);
          setActiveModal(null);
        }}>
          <input
            ref={measureInputRef}
            type="number" min={0} step={1}
            defaultValue={store.beatToMF(modalBeatRef.current).measure}
            className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
            placeholder={t('editor:routes.editor.measureDialog.measurePlaceholder')}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800">{t('editor:routes.editor.measureDialog.cancel')}</button>
            <button type="submit" className={`px-3 py-1 text-xs text-white rounded ${activeModal === 'measureInsert' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {activeModal === 'measureInsert' ? t('editor:routes.editor.measureDialog.insert') : t('editor:routes.editor.measureDialog.delete')}
            </button>
          </div>
        </form>
      </AccessibleDialog>

      {/* ===== AUTO-SAVE RECOVERY ===== */}
      <AccessibleDialog open={activeModal === 'autoSaveRecovery'} onClose={() => setActiveModal(null)} title={t('editor:routes.editor.autoSaveRecovery.title')} className="border border-zinc-700 p-4 w-80">
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">{t('editor:routes.editor.autoSaveRecovery.title')}</h3>
        <p className="text-xs text-zinc-400 mb-4">{t('editor:routes.editor.autoSaveRecovery.body')}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setActiveModal(null);
              autoSaveContentRef.current = null;
              window.api.file.deleteAutoSave(file.path).catch(() => {});
            }}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          >{t('editor:routes.editor.autoSaveRecovery.ignore')}</button>
          <button
            onClick={async () => {
              if (autoSaveContentRef.current) {
                await window.api.file.saveBms(file.path, autoSaveContentRef.current);
                await window.api.file.deleteAutoSave(file.path).catch(() => {});
                autoSaveContentRef.current = null;
                load(file.path);
              }
              setActiveModal(null);
            }}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >{t('editor:routes.editor.autoSaveRecovery.recover')}</button>
        </div>
      </AccessibleDialog>

      {/* ===== ADD / RENAME BOOKMARK DIALOG ===== */}
      <AccessibleDialog
        open={activeModal === 'addBookmark'}
        onClose={() => setActiveModal(null)}
        title={bookmarkEditMode === 'rename' ? t('editor:routes.editor.bookmarkDialog.editTitle') : t('editor:routes.editor.bookmarkDialog.addTitle')}
        className="border border-zinc-700 p-4 w-72"
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
          <Bookmark className="h-4 w-4 text-yellow-400" />
          {t('editor:routes.editor.bookmarkDialog.measureBookmark', { measure: pendingBookmarkMeasure })}
        </h3>
        <p className="text-xs text-zinc-400 mb-3">
          {bookmarkEditMode === 'rename'
            ? t('editor:routes.editor.bookmarkDialog.renamePrompt')
            : t('editor:routes.editor.bookmarkDialog.addPrompt')}
        </p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const name = bookmarkNameRef.current?.value?.trim();
          if (name) {
            if (bookmarkEditMode === 'rename') {
              store.renameBookmark(pendingBookmarkMeasure, name);
            } else {
              store.addBookmark(pendingBookmarkMeasure, name);
            }
          }
          setActiveModal(null);
        }}>
          <input
            ref={bookmarkNameRef}
            key={`${pendingBookmarkMeasure}-${bookmarkEditMode}`}
            type="text"
            defaultValue={bookmarkEditMode === 'rename'
              ? (bookmarks.find((b) => b.measure === pendingBookmarkMeasure)?.name ?? `Bookmark ${pendingBookmarkMeasure}`)
              : `Bookmark ${pendingBookmarkMeasure}`}
            autoFocus
            className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500 mb-3"
            placeholder={t('editor:routes.editor.bookmarkDialog.namePlaceholder')}
          />
          <div className="flex justify-between gap-2">
            {bookmarkEditMode === 'rename' && (
              <button
                type="button"
                onClick={() => { store.removeBookmark(pendingBookmarkMeasure); setActiveModal(null); }}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 rounded hover:bg-zinc-800 transition-colors"
              >{t('editor:routes.editor.bookmarkDialog.delete')}</button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">{t('editor:routes.editor.bookmarkDialog.cancel')}</button>
              <button type="submit" className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">
                {bookmarkEditMode === 'rename' ? t('editor:routes.editor.bookmarkDialog.save') : t('editor:routes.editor.bookmarkDialog.add')}
              </button>
            </div>
          </div>
        </form>
      </AccessibleDialog>

      {/* ===== CLIPBOARD HISTORY DIALOG ===== */}
      <AccessibleDialog
        open={activeModal === 'clipboardHistory'}
        onClose={() => setActiveModal(null)}
        title={t('editor:routes.editor.clipboardHistory.title')}
        className="border border-zinc-700 p-4 w-80"
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">{t('editor:routes.editor.clipboardHistory.title')}</h3>
        <p className="text-xs text-zinc-400 mb-3">{t('editor:routes.editor.clipboardHistory.hint')}</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {clipboardHistory.map((entry, i) => {
            const keysounds = [...new Set(entry.map((n) => n.keysound).filter(Boolean))].slice(0, 3);
            const isCurrentClipboard = clipboard === entry;
            return (
              <button
                key={i}
                onClick={() => {
                  store.selectClipboardHistory(i);
                  pasteWithChecks();
                  setActiveModal(null);
                }}
                className="w-full text-left px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-mono">{t('editor:routes.editor.clipboardHistory.noteCount', { count: entry.length })}</span>
                  {isCurrentClipboard && <span className="text-xs text-blue-400">{t('editor:routes.editor.clipboardHistory.currentLabel')}</span>}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 truncate">
                  {keysounds.length > 0 ? keysounds.join(', ') + (keysounds.length < [...new Set(entry.map((n) => n.keysound).filter(Boolean))].length ? ' …' : '') : t('editor:routes.editor.clipboardHistory.noKeysounds')}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors">{t('editor:routes.editor.clipboardHistory.close')}</button>
        </div>
      </AccessibleDialog>

      {/* ===== PLAY TEST OVERLAY ===== */}
      {activeOverlay === 'playTest' && (
        <div className="fixed inset-0 z-[60] bg-zinc-950">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-1.5 bg-zinc-900/90 border border-zinc-700 rounded-full text-xs text-zinc-400 shadow-lg">
            <span>{t('editor:routes.editor.playTest.label')}</span>
            <span className="text-zinc-600">|</span>
            <button onClick={() => setActiveOverlay(null)} className="text-blue-400 hover:text-blue-300">{t('editor:routes.editor.playTest.returnToEditor')}</button>
          </div>
          <Player
            file={file}
            onBack={() => setActiveOverlay(null)}
            onRegisterGuard={() => {}}
          />
        </div>
      )}

      {/* ===== CHART DIFF ===== */}
      {activeOverlay === 'diff' && chart && originalChartInfoRef.current && (
        <div className="fixed inset-0 z-[55] bg-zinc-950/95 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
            <h2 className="text-sm font-bold text-zinc-200">{t('editor:routes.editor.diff.title')}</h2>
            <button onClick={() => setActiveOverlay(null)} className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">{t('editor:routes.editor.diff.close')}</button>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <BmsChartDiff
              oldChart={originalChartInfoRef.current}
              newChart={{
                notes: notes.map((n) => ({ beat: n.beat, column: n.column, keysound: n.keysound, noteType: n.noteType, endBeat: n.endBeat })),
                keyMode: keyMode,
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
              className="h-full"
              viewerHeight={Math.max(400, windowHeight - 140)}
            />
          </div>
        </div>
      )}

      {/* ===== NOTE SEARCH ===== */}
      {chart && (
        <NoteSearchDialog
          open={activeModal === 'noteSearch'}
          onClose={() => setActiveModal(null)}
          notes={notes}
          keyMode={keyMode}
          wavDefinitions={wavDefinitions}
          onSelectNotes={(ids: string[]) => store.selectNotes(ids)}
          onNavigate={store.setCurrentBeat}
        />
      )}

      {/* ===== REPLACE KEYSOUND DIALOG ===== */}
      {activeModal === 'replaceKeysound' && replaceKeysoundTarget && (
        <AccessibleDialog
          open={true}
          onClose={() => { setActiveModal(null); setReplaceKeysoundTarget(null); }}
          title={t('editor:routes.editor.replaceKeysoundTitle')}
        >
          <div className="p-4 space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">{t('editor:routes.editor.replaceKeysound.sourceLabel')} </span>
              <span className="font-mono font-bold">{replaceKeysoundTarget}</span>
              {keysoundRecord[replaceKeysoundTarget] && (
                <span className="text-muted-foreground ml-2">({keysoundRecord[replaceKeysoundTarget]})</span>
              )}
              <span className="text-muted-foreground ml-2">{t('editor:routes.editor.replaceKeysound.noteCount', { count: keysoundUsageCounts[replaceKeysoundTarget] || 0 })}</span>
            </div>
            <div className="text-sm text-muted-foreground">{t('editor:routes.editor.replaceKeysound.targetPrompt')}</div>
            <div className="h-64 border rounded overflow-hidden">
              <KeysoundPanel
                keysounds={keysoundRecord}
                currentKeysound={replaceKeysoundTarget}
                onSelect={(toId: string) => {
                  if (toId === replaceKeysoundTarget) return;
                  const count = keysoundUsageCounts[replaceKeysoundTarget] || 0;
                  store.replaceKeysound(replaceKeysoundTarget, toId);
                  showToast(t('editor:routes.editor.toast.keysoundReplaced', { count, from: replaceKeysoundTarget, to: toId }), 'success');
                  setActiveModal(null);
                  setReplaceKeysoundTarget(null);
                }}
                onPreview={previewKeysound}
                isAudioReady={isAudioReady}
                isAudioLoading={audioPhase === 'loading'}
              />
            </div>
            <div className="flex justify-end">
              <button
                className="px-3 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
                onClick={() => { setActiveModal(null); setReplaceKeysoundTarget(null); }}
              >
                {t('editor:routes.editor.replaceKeysound.cancel')}
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}

      {/* ===== AUTO CHART DIALOG ===== */}
      {activeModal === 'autoChart' && (
        <AutoChartDialog
          open={activeModal === 'autoChart'}
          onClose={() => setActiveModal(null)}
          existingNotes={notes
            .filter((n): n is typeof n & { column: string } => n.noteType === 'playable' && typeof n.column === 'string')
            .map((n) => ({
              beat: n.beat,
              column: n.column,
              columnIndex: laneIds.indexOf(n.column),
            }))}
          laneIds={laneIds}
          bpm={editedBaseBpm}
          currentBeat={useEditorStore.getState().currentBeat}
          gridSnap={gridSnap}
          onApplyNotes={(allGenerated: GeneratedNote[]) => {
            const s = useEditorStore.getState();
            // Drop generated notes that would sit on top of an existing note in
            // the same column (within half a 32nd); the user keeps what they wrote.
            const occupied = new Set(s.notes.filter((n) => n.column).map((n) => `${n.column}@${Math.round(n.beat * 16)}`));
            const generatedNotes = allGenerated.filter((gn) => !occupied.has(`${laneIds[gn.columnIndex] || ''}@${Math.round(gn.beat * 16)}`));
            const skipped = allGenerated.length - generatedNotes.length;
            if (skipped > 0) showToast(t('editor:routes.editor.toast.autoChartSkipped', { count: skipped }), 'info');
            if (generatedNotes.length === 0) return;
            let nextId = s.nextNoteId;
            const newNotes: EditableBMSNote[] = generatedNotes.map((gn) => {
              const col = laneIds[gn.columnIndex] || laneIds[0] || '';
              const { measure, fraction } = store.beatToMF(gn.beat);
              const tick = beatToTick(gn.beat);
              const endTick = gn.endBeat !== undefined ? beatToTick(gn.endBeat) : undefined;
              return {
                id: `note-${nextId++}`,
                beat: gn.beat,
                tick,
                column: col,
                noteType: gn.noteType,
                keysound: s.currentKeysound,
                measure,
                fraction,
                channel: '',
                endBeat: gn.endBeat,
                endTick,
              };
            });
            // Single undo entry; beats normalised to ticks and the note index rebuilt.
            useEditorStore.setState({ nextNoteId: nextId });
            store.addNotesBulk(newNotes, 'Auto-generate chart');
            showToast(t('editor:routes.editor.toast.notesGenerated', { count: newNotes.length }), 'success');
          }}
        />
      )}

      {/* ===== AUDIO SLICER ===== */}
      {activeOverlay === 'audioSlicer' && (
        <AudioSlicer
          open={activeOverlay === 'audioSlicer'}
          onClose={() => setActiveOverlay(null)}
          bmsFilePath={file.path}
          usedWavIds={new Set(Object.keys(keysoundRecord).map((k) => k.toUpperCase()))}
          onError={(kind, message) => {
            showToast(t(kind === 'load' ? 'editor:routes.editor.toast.sliceLoadFailed' : 'editor:routes.editor.toast.sliceSaveFailed', { message }), 'error');
          }}
          onSlicesCreated={(wavDefs) => {
            store.updateHeadersWithWavDefs(wavDefs, 'Add sliced keysounds');
            // Make the first new slice the active keysound so it can be placed right away.
            const firstId = Object.keys(wavDefs).sort()[0];
            if (firstId) store.setCurrentKeysound(firstId);
            showToast(t('editor:routes.editor.toast.slicesSaved', { count: Object.keys(wavDefs).length }), 'success');
            setActiveOverlay(null);
          }}
        />
      )}

      {/* ===== MIDI MAPPING DIALOG ===== */}
      <MidiMappingDialog
        open={activeModal === 'midi'}
        onClose={() => setActiveModal(null)}
        laneIds={laneIds}
        mapping={midiMapping}
        onMappingChange={setMidiMapping}
        recordingMode={midiRecordingMode}
        onRecordingModeChange={setMidiRecordingMode}
        onMidiNote={handleMidiNote}
      />

      {/* ===== KEY BINDINGS DIALOG ===== */}
      <KeyBindingsDialog
        open={activeModal === 'keyBindings'}
        onClose={() => setActiveModal(null)}
        bindings={keyBindings}
        onBindingsChange={setKeyBindings}
      />

      {/* ===== NOTE COLOR DIALOG ===== */}
      <NoteColorDialog
        open={activeModal === 'noteColor'}
        onClose={() => setActiveModal(null)}
        colors={customColors}
        onSetColor={(key, value) => store.setCustomColor(key, value)}
        onResetAll={store.resetCustomColors}
      />

      {/* ===== TOAST STACK ===== */}
      <ToastStack toasts={toastStack} onDismiss={dismissToast} />
    </div>
  );
}
