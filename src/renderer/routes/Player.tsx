import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Notechart, AudioPreloader, GamePlayer } from '@rhythm-archive/bms-player';
import type { FileMap, ScoreState, NotechartInput } from '@rhythm-archive/bms-player';
import type { CurrentFile, NavigationGuard } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';
import { createLocalAudioWorker } from '../lib/LocalAudioWorker';
import { createKeysoundPlayerAdapter } from '../lib/keysoundPlayerAdapter';
import type { KeysoundPlayer } from '../lib/keysoundPlayerAdapter';
import GameLoopWorkerConstructor from '../workers/gameLoop.worker?worker';

interface PlayerProps {
  file: CurrentFile;
  onBack: () => void;
  onClearFile?: () => void;
  onRegisterGuard: (guard: NavigationGuard | null) => void;
}

type PlayerPhase = 'loading-chart' | 'loading-audio' | 'ready' | 'error';

export function Player({ file, onBack, onClearFile, onRegisterGuard }: PlayerProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();
  const [phase, setPhase] = useState<PlayerPhase>('loading-chart');
  const [audioProgress, setAudioProgress] = useState({ loaded: 0, total: 0 });
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notechart, setNotechart] = useState<Notechart | null>(null);
  const [keysoundPlayer, setKeysoundPlayer] = useState<KeysoundPlayer | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioPreloaderRef = useRef<AudioPreloader | null>(null);
  const gameWorkerRef = useRef<Worker | null>(null);

  // Create Worker once on mount
  useEffect(() => {
    gameWorkerRef.current = new GameLoopWorkerConstructor();
    return () => {
      gameWorkerRef.current?.terminate();
      gameWorkerRef.current = null;
    };
  }, []);
  const filePathRef = useRef(file.path);
  const fileFolderRef = useRef(file.folderPath);
  // Keep file path refs in sync with props
  useLayoutEffect(() => {
    filePathRef.current = file.path;
    fileFolderRef.current = file.folderPath;
  });
  const [containerSize, setContainerSize] = useState({ width: 500, height: 700 });

  // Track container size with ResizeObserver
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width: Math.round(width), height: Math.round(height) - 36 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load chart
  useEffect(() => {
    setPhase('loading-chart');
    load(file.path);
  }, [file.path, load]);

  // Build notechart and load audio when chart is ready
  useEffect(() => {
    if (!chart || isLoading) return;

    let cancelled = false;

    const initAudio = async () => {
      setPhase('loading-audio');
      setAudioError(null);

      try {
        if (!chart.timing || !chart.positioning || !chart.spacing || !chart.keysoundsObj || !chart.songInfoObj) {
          throw new Error('Chart data incomplete — missing timing/positioning/spacing/keysounds/songInfo');
        }

        const playableNotes = chart.notes.filter(n => n.noteType !== 'landmine');
        const landmineNotes = chart.notes.filter(n => n.noteType === 'landmine');

        const notechartInput: NotechartInput = {
          notes: playableNotes,
          landmineNotes,
          timing: chart.timing,
          keysounds: chart.keysoundsObj,
          songInfo: chart.songInfoObj,
          positioning: chart.positioning,
          spacing: chart.spacing,
          barLines: chart.barLines,
        };

        if (cancelled) return;
        const nc = new Notechart(notechartInput);
        setNotechart(nc);

        const fileMap: FileMap = {};
        for (const [id, filename] of Object.entries(chart.keysounds)) {
          fileMap[id] = filename;
        }

        const currentFilePath = filePathRef.current;
        const currentFolderPath = fileFolderRef.current;
        const worker = createLocalAudioWorker(currentFilePath);

        const total = Object.keys(fileMap).length;
        const audioPreloader = new AudioPreloader(
          currentFolderPath,
          fileMap,
          worker,
          (type, payload) => {
            if (type === 'PROGRESS') {
              const p = payload as { loadedCount: number; total: number };
              setAudioProgress({ loaded: p.loadedCount, total: p.total });
            }
          },
          { progressiveDecode: true, useCache: false, useIndexedDBCache: false },
        );

        if (cancelled) return;

        await audioPreloader.loadAll();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        await audioPreloader.decodeAll();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        await audioPreloader.initAudioWorklet();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        audioPreloaderRef.current?.releaseAllResources();
        audioPreloaderRef.current = audioPreloader;

        setKeysoundPlayer(createKeysoundPlayerAdapter(audioPreloader));
        setAudioProgress({ loaded: total, total });
        setPhase('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('[Player] Audio init failed:', err);
          setAudioError(err instanceof Error ? err.message : 'Audio loading failed');
          setPhase('error');
        }
      }
    };

    initAudio();

    return () => {
      cancelled = true;
      if (audioPreloaderRef.current) {
        audioPreloaderRef.current.releaseAllResources();
        audioPreloaderRef.current = null;
      }
    };
  }, [chart, isLoading]);

  // Cleanup audio preloader on unmount
  useEffect(() => {
    return () => {
      audioPreloaderRef.current?.releaseAllResources();
      audioPreloaderRef.current = null;
    };
  }, []);

  // Navigation guard: block sidebar navigation while game is active
  useEffect(() => {
    if (phase === 'ready') {
      onRegisterGuard(() => ({
        blocked: true,
        message: '게임 플레이 중입니다. 나가시겠습니까?',
      }));
    } else {
      onRegisterGuard(null);
    }
  }, [phase, onRegisterGuard]);

  // Clear guard on unmount
  useEffect(() => {
    return () => onRegisterGuard(null);
  }, [onRegisterGuard]);

  const handleComplete = useCallback((_score: ScoreState, _cleared: boolean) => {
    // GamePlayer handles its own result screen with RETRY and EXIT buttons
  }, []);

  const handleExit = useCallback(() => {
    keysoundPlayer?.stopAll();
    onBack();
  }, [keysoundPlayer, onBack]);

  // Error states
  if (error || phase === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-zinc-950">
        <div className="text-red-400 text-center">
          <p className="text-lg mb-1">Error</p>
          <p className="text-sm">{error || audioError}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setPhase('loading-chart'); load(file.path); }}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-300"
          >
            다시 시도
          </button>
          <button
            onClick={() => { onClearFile?.(); onBack(); }}
            className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300"
          >
            홈으로
          </button>
        </div>
      </div>
    );
  }

  // Loading chart
  if (phase === 'loading-chart' || isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">Loading chart...</span>
      </div>
    );
  }

  // Loading audio
  if (phase === 'loading-audio') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-zinc-950">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-4" />
        <div className="text-zinc-300 text-lg mb-1">
          {chart?.songInfo?.title || file.name}
        </div>
        <div className="text-zinc-500 text-sm mb-4">
          Loading keysounds... {audioProgress.loaded}/{audioProgress.total}
        </div>
        {audioProgress.total > 0 && (
          <div className="w-80 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${(audioProgress.loaded / audioProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // Ready / Playing / Result — GamePlayer handles all game UI including ready screen and result screen
  return (
    <div className="h-full flex flex-col bg-black" ref={containerRef}>
      {/* Minimal header */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900/80 border-b border-zinc-800 z-10">
        <button onClick={handleExit} className="p-1 rounded hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 text-xs text-zinc-400 truncate" title="키 설정은 편집 화면 > 도구 > 키 바인딩 설정에서 변경할 수 있습니다">
          {chart?.songInfo?.title || file.name} — {chart?.keyMode} | BPM {chart?.bpm.initial}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(e) => setAutoplay(e.target.checked)}
            className="w-3.5 h-3.5 accent-orange-500"
          />
          <span className="text-[10px] text-zinc-500">AUTOPLAY</span>
        </label>
      </div>

      {/* Game canvas — GamePlayer renders ready screen, game, and result screen */}
      <div className="flex-1 relative flex items-center justify-center">
        <GamePlayer
          notechart={notechart}
          keysoundPlayer={keysoundPlayer}
          width={containerSize.width}
          height={containerSize.height}
          onComplete={handleComplete}
          onExit={handleExit}
          options={{ autoplay, worker: gameWorkerRef.current ?? undefined }}
        />
      </div>
    </div>
  );
}
