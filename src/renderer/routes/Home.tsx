import { useState, useCallback, useEffect, useRef } from 'react';
import { FolderOpen, File, FilePlus, Play, Edit, Music, RefreshCw, Pin, PinOff, X, Clock } from 'lucide-react';
import type { CurrentFile } from '../App';
import { useHomeBmsFile } from '../hooks/useHomeBmsFile';
import { dirname, basename } from '../lib/pathUtils';
import { loadRecentFiles, addRecentFile, removeRecentFile, togglePinRecentFile } from '../lib/sessionStorage';
import type { RecentFileEntry } from '../lib/sessionStorage';

interface HomeProps {
  currentFile: CurrentFile | null;
  onOpenFile: (file: CurrentFile) => void;
  onPlay: () => void;
  onEdit: () => void;
}

interface BmsFileEntry {
  name: string;
  path: string;
  size: number;
  ext: string;
}

type KeyModeOption = '5K' | '7K' | '10K' | '14K';

const KEY_MODE_OPTIONS: { value: KeyModeOption; label: string }[] = [
  { value: '7K', label: '7K+SC (IIDX SP)' },
  { value: '5K', label: '5K+SC' },
  { value: '14K', label: '14K (IIDX DP)' },
  { value: '10K', label: '10K (DP)' },
];

export function Home({ currentFile, onOpenFile, onPlay, onEdit }: HomeProps) {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [files, setFiles] = useState<BmsFileEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const { chart, isLoading, phase, error, load } = useHomeBmsFile();

  // New File dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newBpm, setNewBpm] = useState('130');
  const [newKeyMode, setNewKeyMode] = useState<KeyModeOption>('7K');
  const [creating, setCreating] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() => loadRecentFiles());

  useEffect(() => {
    if (currentFile) {
      setRecentFiles(addRecentFile(currentFile));
      load(currentFile.path);
    }
  }, [currentFile, load]);

  const handleOpenFile = useCallback(async () => {
    if (dialogBusy) return;
    setDialogBusy(true);
    try {
      const filePath = await window.api.file.openBmsFile();
      if (filePath) {
        onOpenFile({
          path: filePath,
          name: basename(filePath),
          folderPath: dirname(filePath),
        });
      }
    } finally {
      setDialogBusy(false);
    }
  }, [onOpenFile, dialogBusy]);

  const handleOpenFolder = useCallback(async () => {
    if (dialogBusy) return;
    setDialogBusy(true);
    try {
      const path = await window.api.file.openBmsFolder();
      if (path) {
        setFolderPath(path);
        setScanning(true);
        try {
          const bmsFiles = await window.api.file.listBmsFolder(path);
          setFiles(bmsFiles);
        } catch (err) {
          console.error('[Home] Folder scan failed:', err);
          setFiles([]);
        } finally {
          setScanning(false);
        }
      }
    } finally {
      setDialogBusy(false);
    }
  }, [dialogBusy]);

  const handleSelectFile = useCallback(
    (file: BmsFileEntry) => {
      onOpenFile({
        path: file.path,
        name: file.name,
        folderPath: dirname(file.path),
      });
    },
    [onOpenFile],
  );

  const handleNewFile = useCallback(async () => {
    const bpm = parseFloat(newBpm);
    if (isNaN(bpm) || bpm <= 0) return;

    setCreating(true);
    try {
      const result = await window.api.file.createNewBms({
        title: newTitle || 'Untitled',
        artist: newArtist,
        bpm,
        keyMode: newKeyMode,
      });
      if (result) {
        setShowNewDialog(false);
        setNewTitle('');
        setNewArtist('');
        setNewBpm('130');
        onOpenFile({
          path: result.path,
          name: result.name,
          folderPath: result.folderPath,
        });
        // Navigate directly to editor
        onEdit();
      }
    } catch (err) {
      console.error('[Home] Create new file failed:', err);
    } finally {
      setCreating(false);
    }
  }, [newTitle, newArtist, newBpm, newKeyMode, onOpenFile, onEdit]);

  // Ctrl+N / Ctrl+O shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setShowNewDialog(true);
      }
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpenFile]);

  // Auto-focus title input when dialog opens
  useEffect(() => {
    if (showNewDialog) {
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [showNewDialog]);

  return (
    <div className="flex h-full">
      {/* Left: File Browser */}
      <div className="w-80 border-r border-zinc-800 flex flex-col">
        {/* Actions */}
        <div className="p-3 border-b border-zinc-800 flex gap-2 flex-wrap">
          <button
            onClick={() => setShowNewDialog(true)}
            disabled={dialogBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          >
            <FilePlus className="h-4 w-4" />
            New
          </button>
          <button
            onClick={handleOpenFile}
            disabled={dialogBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          >
            <File className="h-4 w-4" />
            Open
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={dialogBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          >
            <FolderOpen className="h-4 w-4" />
            Folder
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {folderPath && (
            <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800 flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {folderPath}
              {scanning && <RefreshCw className="h-3 w-3 animate-spin ml-auto" />}
            </div>
          )}
          {files.length === 0 && !scanning && recentFiles.length === 0 && (
            <div className="p-6 text-center text-sm text-zinc-500">
              Open a file or folder to get started
            </div>
          )}
          {files.length === 0 && !scanning && !folderPath && recentFiles.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                최근 파일
              </div>
              {recentFiles.map((rf) => (
                <div
                  key={rf.path}
                  className={`group w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 ${
                    currentFile?.path === rf.path ? 'bg-zinc-800 text-blue-400' : 'text-zinc-300'
                  }`}
                >
                  <button
                    onClick={() => onOpenFile({ path: rf.path, name: rf.name, folderPath: rf.folderPath })}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    {rf.pinned && <Pin className="h-3 w-3 shrink-0 text-yellow-500" />}
                    {!rf.pinned && <Music className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                    <span className="truncate">{rf.name}</span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRecentFiles(togglePinRecentFile(rf.path)); }}
                      className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500"
                      title={rf.pinned ? '고정 해제' : '고정'}
                    >
                      {rf.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRecentFiles(removeRecentFile(rf.path)); }}
                      className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500"
                      title="목록에서 제거"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => handleSelectFile(file)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 ${
                currentFile?.path === file.path ? 'bg-zinc-800 text-blue-400' : 'text-zinc-300'
              }`}
            >
              <Music className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">{file.name}</span>
              <span className="text-xs text-zinc-600 ml-auto shrink-0">
                {(file.size / 1024).toFixed(0)}KB
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Chart Info */}
      <div className="flex-1 overflow-y-auto p-6">
        {!currentFile && (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <Music className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg">Select a BMS file to view details</p>
              <p className="text-sm mt-1">Ctrl+N to create new, Ctrl+O to open</p>
            </div>
          </div>
        )}

        {currentFile && isLoading && phase === 'idle' && (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}

        {currentFile && error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            Error: {error}
          </div>
        )}

        {currentFile && chart && (
          <div>
            <h1 className="text-2xl font-bold mb-1">
              {chart.songInfo?.title || currentFile.name}
            </h1>
            {chart.songInfo?.artist && (
              <p className="text-lg text-zinc-400 mb-4">{chart.songInfo.artist}</p>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label="키 모드" value={chart.keyMode} />
              <StatCard
                label="BPM"
                value={
                  chart.bpm.min === chart.bpm.max
                    ? `${chart.bpm.initial}`
                    : `${chart.bpm.min} - ${chart.bpm.max}`
                }
              />
              <StatCard label="총 노트" value={phase === 'ready' ? chart.stats.total.toString() : '...'} loading={phase === 'phase1'} />
              <StatCard label="롱노트" value={phase === 'ready' ? chart.stats.longNotes.toString() : '...'} loading={phase === 'phase1'} />
              <StatCard label="스크래치" value={phase === 'ready' ? chart.stats.scratch.toString() : '...'} loading={phase === 'phase1'} />
              <StatCard label="키음" value={phase === 'ready' ? Object.keys(chart.keysounds).length.toString() : '...'} loading={phase === 'phase1'} />
            </div>
            {phase === 'ready' && (chart.stats.landmines > 0 || chart.stats.invisible > 0) && (
              <div className="flex gap-4 mb-4 text-xs text-zinc-500">
                {chart.stats.landmines > 0 && <span>지뢰: {chart.stats.landmines}</span>}
                {chart.stats.invisible > 0 && <span>인비저블: {chart.stats.invisible}</span>}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onPlay}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors"
              >
                <Play className="h-5 w-5" />
                Play
              </button>
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-lg font-semibold transition-colors"
              >
                <Edit className="h-5 w-5" />
                Edit
              </button>
            </div>
            {(chart.songInfo?.genre || currentFile) && (
              <div className="mt-4 space-y-1 text-xs text-zinc-500">
                {chart.songInfo?.genre && <div>장르: {chart.songInfo.genre}</div>}
                <div className="truncate" title={currentFile.path}>파일: {currentFile.name}</div>
                <div className="truncate text-zinc-600" title={currentFile.folderPath}>{currentFile.folderPath}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== NEW FILE DIALOG ===== */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewDialog(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-200 mb-4">새 BMS 파일 만들기</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleNewFile(); }}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">제목</label>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Untitled"
                    className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">아티스트</label>
                  <input
                    type="text"
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                    placeholder="Unknown"
                    className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">BPM</label>
                    <input
                      type="number"
                      value={newBpm}
                      onChange={(e) => setNewBpm(e.target.value)}
                      min={1}
                      max={999}
                      step="any"
                      className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">키 모드</label>
                    <select
                      value={newKeyMode}
                      onChange={(e) => setNewKeyMode(e.target.value as KeyModeOption)}
                      className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
                    >
                      {KEY_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowNewDialog(false)}
                  className="px-4 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  {creating ? '생성 중...' : '만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${loading ? 'text-zinc-600 animate-pulse' : ''}`}>{value}</div>
    </div>
  );
}
