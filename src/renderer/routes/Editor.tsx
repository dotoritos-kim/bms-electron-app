import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Save, RefreshCw, Undo2, Redo2 } from 'lucide-react';
import {
  NoteChartViewer,
  NoteChartEditor,
  GRID_SNAP_OPTIONS,
  NoteInfoPanel,
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'viewer'>('viewer');
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

    // Build EditableBMSChart from the parsed file (for save)
    const loadEditableChart = async () => {
      try {
        const buffer = await window.api.file.readBms(file.path);
        const parser = new BMSParser();
        const bmsString = await parser.readBuffer(buffer);
        parser.compileString(bmsString);
        if (parser.chart) {
          const ec = BMSWriter.fromBMSChart(parser.chart);
          setOriginalEditableChart(ec);
        }
      } catch (err) {
        console.warn('[Editor] Could not build editable chart for save:', err);
      }
    };
    loadEditableChart();
  }, [chart, file.path]);

  // WAV definitions map
  const wavDefinitions = useMemo(() => {
    if (!chart) return new Map<string, string>();
    return new Map(Object.entries(chart.keysounds));
  }, [chart]);

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
      // Merge current notes into the original editable chart structure
      const chartToSave: EditableBMSChart = {
        ...originalEditableChart,
        notes, // Use current edited notes
      };
      const bmsContent = writer.write(chartToSave);
      await window.api.file.saveBms(file.path, bmsContent);
      setHasUnsavedChanges(false);
      console.log('[Editor] Saved successfully');
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">Loading chart for editing...</span>
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

  const selectedNotesList = useMemo(
    () => notes.filter((n) => selectedNotes.has(n.id)),
    [notes, selectedNotes],
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium truncate max-w-48">
          {chart?.songInfo?.title || file.name}
        </span>

        {hasUnsavedChanges && <span className="text-xs text-yellow-500">*</span>}

        <div className="mx-2 h-4 border-l border-zinc-700" />

        {/* View toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'viewer' ? 'editor' : 'viewer')}
          className={`px-2 py-1 text-xs rounded ${viewMode === 'editor' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'} transition-colors`}
        >
          {viewMode === 'editor' ? 'Edit Mode' : 'View Mode'}
        </button>

        {viewMode === 'editor' && (
          <>
            <div className="mx-2 h-4 border-l border-zinc-700" />
            {/* Undo/Redo */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="mx-2 h-4 border-l border-zinc-700" />

            {/* Grid snap */}
            <label className="text-xs text-zinc-500">Grid:</label>
            <select
              value={gridSnap}
              onChange={(e) => setGridSnap(Number(e.target.value) as GridSnap)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5"
            >
              {GRID_SNAP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>1/{opt}</option>
              ))}
            </select>
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chart area */}
        <div className="flex-1 overflow-hidden">
          {chart && viewMode === 'viewer' && (
            <NoteChartViewer
              notes={chart.notes}
              keyMode={chart.keyMode}
              totalBeats={chart.totalBeats}
              bpm={chart.bpm.initial}
              bpmChanges={chart.bpmChanges}
              stops={chart.stops}
              scrollChanges={chart.scrollChanges}
              keysounds={chart.keysounds}
              positioning={chart.positioning}
              timing={chart.timing}
            />
          )}

          {chart && viewMode === 'editor' && (
            <NoteChartEditor
              notes={notes}
              keyMode={chart.keyMode}
              totalBeats={chart.totalBeats}
              activeTool={activeTool}
              gridSnap={gridSnap}
              selectedNotes={selectedNotes}
              selectedNoteType={selectedNoteType}
              currentKeysound={currentKeysound}
              onNoteAdd={handleNoteAdd}
              onNoteDelete={handleNoteDelete}
              onNoteMove={handleNoteMove}
              onNoteSelect={handleNoteSelect}
              bpmChanges={chart.bpmChanges.map((b) => ({
                beat: b.beat,
                bpm: b.bpm,
                measure: Math.floor(b.beat / 4),
                fraction: (b.beat % 4) / 4,
              }))}
              baseBpm={chart.bpm.initial}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          )}
        </div>

        {/* Right sidebar (editor mode) */}
        {viewMode === 'editor' && (
          <div className="w-56 border-l border-zinc-800 overflow-y-auto bg-zinc-900">
            <NoteInfoPanel
              selectedNotes={selectedNotesList}
              wavDefinitions={wavDefinitions}
              bpmChanges={chart?.bpmChanges.map((b) => ({
                beat: b.beat,
                bpm: b.bpm,
                measure: Math.floor(b.beat / 4),
                fraction: (b.beat % 4) / 4,
              })) || []}
              stopEvents={chart?.stops.map((s) => ({
                beat: s.beat,
                duration: s.duration,
                measure: Math.floor(s.beat / 4),
                fraction: (s.beat % 4) / 4,
              })) || []}
              initialBpm={chart?.bpm.initial || 130}
              gridSnap={gridSnap}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      {chart && (
        <div className="h-6 px-3 bg-zinc-900 border-t border-zinc-800 flex items-center text-xs text-zinc-500 gap-4">
          <span>{chart.keyMode}</span>
          <span>BPM {chart.bpm.initial}</span>
          <span>{notes.length} notes</span>
          <span>{selectedNotes.size} selected</span>
          <span className="ml-auto">Grid 1/{gridSnap}</span>
        </div>
      )}
    </div>
  );
}
