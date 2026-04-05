import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Notechart, AudioPreloader, GamePlayer } from '@rhythm-archive/bms-player';
import type { FileMap, ScoreState, NotechartInput } from '@rhythm-archive/bms-player';
import type { CurrentFile, NavigationGuard } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';
import { createLocalAudioWorker } from '../lib/LocalAudioWorker';
import { createKeysoundPlayerAdapter } from '../lib/keysoundPlayerAdapter';
import type { KeysoundPlayer } from '../lib/keysoundPlayerAdapter';

interface PlayerProps {
  file: CurrentFile;
  onBack: () => void;
  onRegisterGuard: (guard: NavigationGuard | null) => void;
}

type PlayerPhase = 'loading-chart' | 'loading-audio' | 'ready' | 'playing' | 'result' | 'error';

export function Player({ file, onBack, onRegisterGuard }: PlayerProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();
  const [phase, setPhase] = useState<PlayerPhase>('loading-chart');
  const [audioProgress, setAudioProgress] = useState({ loaded: 0, total: 0 });
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notechart, setNotechart] = useState<Notechart | null>(null);
  const [keysoundPlayer, setKeysoundPlayer] = useState<KeysoundPlayer | null>(null);
  const [finalScore, setFinalScore] = useState<ScoreState | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [hiSpeed, setHiSpeed] = useState(1.0);
  const [floatingHiSpeed, setFloatingHiSpeed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioPreloaderRef = useRef<AudioPreloader | null>(null);
  const filePathRef = useRef(file.path);
  const fileFolderRef = useRef(file.folderPath);
  // Keep file path refs in sync with props
  useLayoutEffect(() => {
    filePathRef.current = file.path;
    fileFolderRef.current = file.folderPath;
  });
  const [containerSize, setContainerSize] = useState({ width: 500, height: 700 });

  // Calculate green number from initial BPM
  const initialBpm = chart?.bpm?.initial ?? 150;
  const greenNumber = useMemo(() => Math.round((8 * 60 * 1000) / (initialBpm * hiSpeed)), [initialBpm, hiSpeed]);

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
  // Dependencies: chart/isLoading only. file path accessed via refs to prevent
  // stale initAudio from running with old chart + new file path on file switch.
  useEffect(() => {
    if (!chart || isLoading) return;

    let cancelled = false;

    const initAudio = async () => {
      setPhase('loading-audio');
      setAudioError(null);

      try {
        // Use pre-built bms-core objects from useLocalBmsFile (no re-parsing)
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

        // Create file map for AudioPreloader
        const fileMap: FileMap = {};
        for (const [id, filename] of Object.entries(chart.keysounds)) {
          fileMap[id] = filename;
        }

        // Use refs for file paths (avoids stale initAudio with old chart + new file)
        const currentFilePath = filePathRef.current;
        const currentFolderPath = fileFolderRef.current;

        // Create local audio worker shim
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

        // Load and decode all audio
        await audioPreloader.loadAll();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        await audioPreloader.decodeAll();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        await audioPreloader.initAudioWorklet();
        if (cancelled) { audioPreloader.releaseAllResources(); return; }

        // Dispose previous preloader before setting new one
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
      // Immediately release the old preloader (close AudioContext + stop AudioWorklet)
      // to prevent previous song's keysounds from mixing with the new song
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
    if (gameStarted && phase !== 'result') {
      onRegisterGuard(() => ({
        blocked: true,
        message: '게임 플레이 중입니다. 나가시겠습니까?',
      }));
    } else {
      onRegisterGuard(null);
    }
  }, [gameStarted, phase, onRegisterGuard]);

  // Clear guard on unmount
  useEffect(() => {
    return () => onRegisterGuard(null);
  }, [onRegisterGuard]);

  // Handle start: resume AudioContext and trigger game start
  const handleStart = useCallback(() => {
    const ctx = audioPreloaderRef.current?.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    setGameStarted(true);
  }, []);

  // SPACE key to start, ↑↓ to adjust speed from ready screen
  useEffect(() => {
    if (phase !== 'ready' || gameStarted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleStart();
      }
      // Hi-speed adjustment on ready screen
      let delta = 0;
      if (e.code === 'ArrowUp') delta = 0.25;
      else if (e.code === 'ArrowDown') delta = -0.25;
      else if (e.code === 'PageUp') delta = 1.0;
      else if (e.code === 'PageDown') delta = -1.0;
      if (delta !== 0) {
        e.preventDefault();
        setHiSpeed(prev => Math.max(0.5, Math.min(10, Math.round((prev + delta) * 100) / 100)));
      }
      if (e.code === 'Backquote') {
        e.preventDefault();
        setFloatingHiSpeed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, gameStarted, handleStart]);

  const handleComplete = useCallback((score: ScoreState, _cleared: boolean) => {
    setFinalScore(score);
    setPhase('result');
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
        <button onClick={onBack} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">
          Back to Home
        </button>
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

  // Result screen
  if (phase === 'result' && finalScore) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-zinc-950 gap-6">
        <h2 className="text-2xl font-bold">Results</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <span className="text-zinc-500">EX Score</span>
          <span className="font-mono">{finalScore.exScore}</span>
          <span className="text-zinc-500">Max Combo</span>
          <span className="font-mono">{finalScore.maxCombo}</span>
          <span className="text-zinc-500">PGREAT</span>
          <span className="font-mono text-yellow-400">{finalScore.pgreatCount}</span>
          <span className="text-zinc-500">GREAT</span>
          <span className="font-mono text-yellow-300">{finalScore.greatCount}</span>
          <span className="text-zinc-500">GOOD</span>
          <span className="font-mono text-green-400">{finalScore.goodCount}</span>
          <span className="text-zinc-500">BAD</span>
          <span className="font-mono text-blue-400">{finalScore.badCount}</span>
          <span className="text-zinc-500">POOR</span>
          <span className="font-mono text-red-400">{finalScore.poorCount}</span>
          <span className="text-zinc-500">MISS</span>
          <span className="font-mono text-zinc-500">{finalScore.missCount}</span>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => { audioPreloaderRef.current?.stopAllAudio(); setPhase('ready'); setGameStarted(false); setRetryCount(c => c + 1); }}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
          >
            Retry
          </button>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm font-medium transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Ready / Playing - render GamePlayer
  return (
    <div className="h-full flex flex-col bg-black" ref={containerRef}>
      {/* Minimal header */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900/80 border-b border-zinc-800 z-10">
        <button onClick={handleExit} className="p-1 rounded hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 text-xs text-zinc-400 truncate">
          {chart?.songInfo?.title || file.name} — {chart?.keyMode} | BPM {chart?.bpm.initial}
          {autoplay && <span className="ml-2 text-orange-400 font-bold">AUTOPLAY</span>}
        </div>
      </div>

      {/* Game canvas */}
      <div className="flex-1 relative flex items-center justify-center">
        <GamePlayer
          key={retryCount}
          notechart={notechart}
          keysoundPlayer={keysoundPlayer}
          width={containerSize.width}
          height={containerSize.height}
          onComplete={handleComplete}
          onExit={handleExit}
          options={{ autoStart: gameStarted, autoplay, hiSpeed }}
        />

        {/* Custom ready overlay — renders above the R3F Canvas */}
        {phase === 'ready' && !gameStarted && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
            <div className="text-3xl text-white mb-5 font-sans">READY</div>

            {/* Speed settings panel */}
            <div className="rounded-lg mb-5 text-center font-mono bg-zinc-900/90 border border-zinc-700 px-7 py-3.5 min-w-60">
              <div className="text-xs text-zinc-500 mb-1">HI-SPEED (↑↓ adjust)</div>
              <div className="text-3xl font-bold text-yellow-400">
                {hiSpeed.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                BPM {Math.round(initialBpm)} × {hiSpeed.toFixed(2)} = {Math.round(initialBpm * hiSpeed)}
              </div>
              <div className="text-sm mt-1 text-emerald-400">
                GREEN NUMBER: {greenNumber}
              </div>
              <div
                className={`mt-2 text-xs cursor-pointer select-none ${floatingHiSpeed ? 'text-orange-500' : 'text-zinc-600'}`}
                onClick={() => setFloatingHiSpeed(prev => !prev)}
              >
                {floatingHiSpeed ? '● FLOATING HI-SPEED ON' : '○ FLOATING HI-SPEED OFF'}
                <span className="text-zinc-600 ml-1.5">(` key)</span>
              </div>
            </div>

            <button
              onClick={handleStart}
              className="px-10 py-4 text-xl font-medium text-white border-none rounded-lg cursor-pointer bg-orange-600 hover:bg-orange-500 transition-colors"
            >
              START
            </button>
            <label className="mt-5 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoplay}
                onChange={(e) => setAutoplay(e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-sm text-zinc-300">AUTOPLAY</span>
            </label>
            <div className="mt-3 text-sm text-zinc-500">
              Press SPACE or click to start
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              ↑↓ Hi-Speed ±0.25 | PgUp/PgDn ±1.0 | ` Floating
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
