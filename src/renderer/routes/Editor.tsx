import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Save, RefreshCw, Undo2, Redo2, Music } from 'lucide-react';
import {
  NoteChartEditor,
  EditorToolbar,
  GRID_SNAP_OPTIONS,
  NoteInfoPanel,
  KeysoundPanel,
  HeaderEditorPanel,
  Minimap,
  StatusBar,
} from '@rhythm-archive/bms-editor';
import type {
  EditorTool,
  SelectedNoteType,
  GridSnap,
} from '@rhythm-archive/bms-editor';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { BMSWriter, BMSParser } from '@rhythm-archive/bms-core';
import type { EditableBMSChart } from '@rhythm-archive/bms-core';
import type { CurrentFile } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';

interface EditorProps {
  file: CurrentFile;
  onBack: () => void;
}

interface UndoEntry {
  notes: EditableBMSNote[];
  description: string;
}

export function Editor({ file, onBack }: EditorProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();

  // Editor state
  const [notes, setNotes] = useState<EditableBMSNote[]>([]);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [gridSnap, setGridSnap] = useState<GridSnap>(16);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [selectedNoteType, setSelectedNoteType] = useState<SelectedNoteType>('playable');
  const [currentKeysound, setCurrentKeysound] = useState('01');
  const [currentBeat, setCurrentBeat] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalEditableChart, setOriginalEditableChart] = useState<EditableBMSChart | null>(null);

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const nextNoteId = useRef(1);

  useEffect(() => {
    load(file.path);
  }, [file.path, load]);

  // Initialize notes from chart + build editable chart for save
  useEffect(() => {
    if (!chart) return;

    const editableNotes: EditableBMSNote[] = chart.notes.map((n, i) => ({
      id: `note-${i}`,
      beat: n.beat,
      column: n.column || '',
      noteType: (n.noteType as EditableBMSNote['noteType']) || 'playable',
      keysound: n.keysound || '00',
      endBeat: n.endBeat,
      measure: Math.floor(n.beat / 4),
      channel: n.channel || '',
    }));
    setNotes(editableNotes);
    nextNoteId.current = editableNotes.length + 1;

    const loadEditableChart = async () => {
      try {
        const buffer = await window.api.file.readBms(file.path);
        const parser = new BMSParser();
        const bmsString = await parser.readBuffer(buffer);
        parser.compileString(bmsString);
        if (parser.chart) {
          setOriginalEditableChart(BMSWriter.fromBMSChart(parser.chart));
        }
      } catch (err) {
        console.warn('[Editor] Could not build editable chart for save:', err);
      }
    };
    loadEditableChart();
  }, [chart, file.path]);

  // WAV definitions
  const wavDefinitions = useMemo(() => {
    if (!chart) return new Map<string, string>();
    return new Map(Object.entries(chart.keysounds));
  }, [chart]);

  const keysoundRecord = useMemo(() => chart?.keysounds || {}, [chart]);

  // BPM changes in the format NoteChartEditor expects
  const bpmChanges = useMemo(() => {
    if (!chart) return [];
    return chart.bpmChanges.map((b) => ({
      beat: b.beat,
      bpm: b.bpm,
      measure: Math.floor(b.beat / 4),
      fraction: (b.beat % 4) / 4,
    }));
  }, [chart]);

  const stopEvents = useMemo(() => {
    if (!chart) return [];
    return chart.stops.map((s) => ({
      beat: s.beat,
      duration: s.duration,
      measure: Math.floor(s.beat / 4),
      fraction: (s.beat % 4) / 4,
    }));
  }, [chart]);

  const totalBeats = chart?.totalBeats || 100;

  // Undo/Redo
  const pushUndo = useCallback((currentNotes: EditableBMSNote[], description: string) => {
    setUndoStack((prev) => [...prev.slice(-50), { notes: [...currentNotes], description }]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, { notes: [...notes], description: entry.description }]);
    setNotes(entry.notes);
    setUndoStack((prev) => prev.slice(0, -1));
    setHasUnsavedChanges(true);
  }, [undoStack, notes]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, { notes: [...notes], description: entry.description }]);
    setNotes(entry.notes);
    setRedoStack((prev) => prev.slice(0, -1));
    setHasUnsavedChanges(true);
  }, [redoStack, notes]);

  const handleNoteAdd = useCallback(
    (note: Omit<EditableBMSNote, 'id'>) => {
      setNotes((prev) => {
        pushUndo(prev, 'Add note');
        const id = `note-${nextNoteId.current++}`;
        return [...prev, { ...note, id } as EditableBMSNote];
      });
      setHasUnsavedChanges(true);
    },
    [pushUndo],
  );

  const handleNoteDelete = useCallback(
    (noteIds: string[]) => {
      setNotes((prev) => {
        pushUndo(prev, 'Delete notes');
        const idsSet = new Set(noteIds);
        return prev.filter((n) => !idsSet.has(n.id));
      });
      setSelectedNotes(new Set());
      setHasUnsavedChanges(true);
    },
    [pushUndo],
  );

  const handleNoteMove = useCallback(
    (noteIds: string[], delta: { beat?: number; columnDelta?: number }) => {
      setNotes((prev) => {
        pushUndo(prev, 'Move notes');
        const idsSet = new Set(noteIds);
        return prev.map((n) => {
          if (!idsSet.has(n.id)) return n;
          return {
            ...n,
            beat: n.beat + (delta.beat || 0),
            endBeat: n.endBeat !== undefined ? n.endBeat + (delta.beat || 0) : undefined,
          };
        });
      });
      setHasUnsavedChanges(true);
    },
    [pushUndo],
  );

  const handleNoteSelect = useCallback((noteIds: string[], additive?: boolean) => {
    setSelectedNotes((prev) => {
      if (additive) {
        const next = new Set(prev);
        for (const id of noteIds) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      }
      return new Set(noteIds);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!chart || !originalEditableChart) return;
    try {
      const writer = new BMSWriter();
      const chartToSave: EditableBMSChart = { ...originalEditableChart, notes };
      const bmsContent = writer.write(chartToSave);
      await window.api.file.saveBms(file.path, bmsContent);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('[Editor] Save failed:', err);
    }
  }, [chart, notes, file.path, originalEditableChart]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSave]);

  const selectedNotesList = useMemo(
    () => notes.filter((n) => selectedNotes.has(n.id)),
    [notes, selectedNotes],
  );

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
        <button onClick={onBack} className="p-1 rounded hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{chart?.songInfo?.title || file.name}</span>
        {hasUnsavedChanges && <span className="text-yellow-500 text-xs font-bold">● 수정 중</span>}
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={!hasUnsavedChanges}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          저장
        </button>
      </div>

      {/* ===== EDITOR TOOLBAR ===== */}
      <EditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        gridSnap={gridSnap}
        onGridSnapChange={setGridSnap}
        selectedNoteType={selectedNoteType}
        onNoteTypeChange={setSelectedNoteType}
        keyMode={chart?.keyMode || '7K'}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* ===== MAIN 3-COLUMN LAYOUT ===== */}
      <div className="flex flex-1 min-h-0">

        {/* --- LEFT: Keysound Panel --- */}
        <div className="w-44 border-r border-zinc-800 flex flex-col bg-zinc-900 shrink-0">
          <KeysoundPanel
            keysounds={keysoundRecord}
            currentKeysound={currentKeysound}
            onSelect={setCurrentKeysound}
          />
        </div>

        {/* --- CENTER: Note Chart Editor --- */}
        <div className="flex-1 flex flex-col min-w-0">
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
                onNoteAdd={handleNoteAdd}
                onNoteDelete={handleNoteDelete}
                onNoteMove={handleNoteMove}
                onNoteSelect={handleNoteSelect}
                bpmChanges={bpmChanges}
                baseBpm={chart.bpm.initial}
                hasUnsavedChanges={hasUnsavedChanges}
                scrollToBeat={currentBeat}
                onScrollChange={setCurrentBeat}
              />
            )}
          </div>
        </div>

        {/* --- RIGHT: Chart Info + Note Info + Minimap --- */}
        <div className="w-56 border-l border-zinc-800 flex flex-col bg-zinc-900 shrink-0 min-h-0 overflow-hidden">
          {/* Note Info (when notes selected) */}
          {selectedNotesList.length > 0 && (
            <div className="border-b border-zinc-800 shrink-0">
              <NoteInfoPanel
                selectedNotes={selectedNotesList}
                wavDefinitions={wavDefinitions}
                bpmChanges={bpmChanges}
                stopEvents={stopEvents}
                initialBpm={chart?.bpm.initial || 130}
                gridSnap={gridSnap}
              />
            </div>
          )}

          {/* Chart Header Info */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs space-y-3">
            <h3 className="font-semibold text-zinc-300">차트 정보</h3>
            {chart && (
              <>
                <div>
                  <label className="text-zinc-500">제목</label>
                  <div className="mt-0.5 text-zinc-200">{chart.songInfo?.title || '-'}</div>
                </div>
                <div>
                  <label className="text-zinc-500">아티스트</label>
                  <div className="mt-0.5 text-zinc-200">{chart.songInfo?.artist || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-500">BPM</label>
                    <div className="mt-0.5 text-zinc-200">{chart.bpm.initial}</div>
                  </div>
                  <div>
                    <label className="text-zinc-500">키 모드</label>
                    <div className="mt-0.5 text-zinc-200">{chart.keyMode}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-zinc-500">Total</label>
                    <div className="mt-0.5 text-zinc-200">{chart.stats.total}</div>
                  </div>
                  <div>
                    <label className="text-zinc-500">LN</label>
                    <div className="mt-0.5 text-zinc-200">{chart.stats.longNotes}</div>
                  </div>
                </div>
                {chart.songInfo?.genre && (
                  <div>
                    <label className="text-zinc-500">장르</label>
                    <div className="mt-0.5 text-zinc-200">{chart.songInfo.genre}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Minimap */}
          <div className="border-t border-zinc-800 h-48 shrink-0">
            {chart && (
              <Minimap
                notes={chart.notes}
                totalBeats={totalBeats}
                currentBeat={currentBeat}
                viewportBeats={16}
                onNavigate={setCurrentBeat}
              />
            )}
          </div>
        </div>
      </div>

      {/* ===== STATUS BAR ===== */}
      <StatusBar
        currentBeat={currentBeat}
        gridSnap={gridSnap}
        selectedCount={selectedNotes.size}
        totalNotes={notes.length}
        bpm={chart?.bpm.initial || 130}
        zoom={1}
      />
    </div>
  );
}
