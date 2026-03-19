import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Notechart, AudioPreloader, GamePlayer } from '@rhythm-archive/bms-player';
import type { FileMap, ScoreState, NotechartInput } from '@rhythm-archive/bms-player';
import { BMSParser, Timing, Positioning, Spacing, SongInfo, KeySounds, Notes } from '@rhythm-archive/bms-core';
import type { CurrentFile } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';
import { createLocalAudioWorker } from '../lib/LocalAudioWorker';

interface PlayerProps {
  file: CurrentFile;
  onBack: () => void;
}

type PlayerPhase = 'loading-chart' | 'loading-audio' | 'ready' | 'playing' | 'result' | 'error';

export function Player({ file, onBack }: PlayerProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();
  const [phase, setPhase] = useState<PlayerPhase>('loading-chart');
  const [audioProgress, setAudioProgress] = useState({ loaded: 0, total: 0 });
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notechart, setNotechart] = useState<Notechart | null>(null);
  const [preloader, setPreloader] = useState<AudioPreloader | null>(null);
  const [finalScore, setFinalScore] = useState<ScoreState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Re-parse the BMS file to get full bms-core objects for Notechart
        const buffer = await window.api.file.readBms(file.path);
        const parser = new BMSParser();
        const bmsString = await parser.readBuffer(buffer);
        const bmsChart = parser.compileString(bmsString);

        const timing = Timing.fromBMSChart(bmsChart);
        const positioning = Positioning.fromBMSChart(bmsChart, timing);
        const spacing = Spacing.fromBMSChart(bmsChart);
        const keysounds = KeySounds.fromBMSChart(bmsChart);
        const songInfo = SongInfo.fromBMSChart(bmsChart);
        const notesObj = Notes.fromBMSChart(bmsChart, { mapping: bmsChart.headers.get('lntype') === '2' ? 2 : 1 });
        const allNotes = notesObj.all();

        // Build bar lines (one per measure)
        const maxMeasure = Math.max(...allNotes.map(n => Math.floor(n.beat / 4)), 0) + 2;
        const barLines: number[] = [];
        for (let m = 0; m <= maxMeasure; m++) {
          barLines.push(bmsChart.timeSignatures.measureToBeat(m, 0));
        }

        // Separate playable vs landmine notes
        const playableNotes = allNotes.filter(n => n.noteType !== 'landmine');
        const landmineNotes = allNotes.filter(n => n.noteType === 'landmine');

        const notechartInput: NotechartInput = {
          notes: playableNotes,
          landmineNotes,
          timing,
          keysounds,
          songInfo,
          positioning,
          spacing,
          barLines,
        };

        const nc = new Notechart(notechartInput);
        if (cancelled) return;
        setNotechart(nc);

        // Create file map for AudioPreloader
        const fileMap: FileMap = {};
        for (const [id, filename] of Object.entries(chart.keysounds)) {
          fileMap[id] = filename;
        }

        // Create local audio worker shim
        const worker = createLocalAudioWorker(file.path);

        const total = Object.keys(fileMap).length;
        const audioPreloader = new AudioPreloader(
          file.folderPath,
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

        setPreloader(audioPreloader);
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
    };
  }, [chart, isLoading, file.path, file.folderPath]);

  // Cleanup preloader on unmount
  useEffect(() => {
    return () => {
      preloader?.releaseAllResources();
    };
  }, [preloader]);

  const handleComplete = useCallback((score: ScoreState, _cleared: boolean) => {
    setFinalScore(score);
    setPhase('result');
  }, []);

  const handleExit = useCallback(() => {
    preloader?.stopAllAudio();
    onBack();
  }, [preloader, onBack]);

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
          <span className="font-mono text-yellow-400">{finalScore.pgreat}</span>
          <span className="text-zinc-500">GREAT</span>
          <span className="font-mono text-yellow-300">{finalScore.great}</span>
          <span className="text-zinc-500">GOOD</span>
          <span className="font-mono text-green-400">{finalScore.good}</span>
          <span className="text-zinc-500">BAD</span>
          <span className="font-mono text-blue-400">{finalScore.bad}</span>
          <span className="text-zinc-500">POOR</span>
          <span className="font-mono text-red-400">{finalScore.poor}</span>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setPhase('ready')}
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
        </div>
      </div>

      {/* Game canvas */}
      <div className="flex-1 flex items-center justify-center">
        <GamePlayer
          notechart={notechart}
          keysoundPlayer={preloader as unknown as Parameters<typeof GamePlayer>[0]['keysoundPlayer']}
          width={containerRef.current?.clientWidth ?? 500}
          height={(containerRef.current?.clientHeight ?? 800) - 36}
          onComplete={handleComplete}
          onExit={handleExit}
          options={{ autoStart: false }}
        />
      </div>
    </div>
  );
}
