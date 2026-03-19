import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { CurrentFile } from '../App';
import { useLocalBmsFile } from '../hooks/useLocalBmsFile';

interface PlayerProps {
  file: CurrentFile;
  onBack: () => void;
}

export function Player({ file, onBack }: PlayerProps) {
  const { chart, isLoading, error, load } = useLocalBmsFile();
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ loaded: 0, total: 0 });

  useEffect(() => {
    load(file.path);
  }, [file.path, load]);

  // Load audio when chart is ready
  useEffect(() => {
    if (!chart) return;

    const loadAudio = async () => {
      setAudioLoading(true);
      try {
        const { results, errors } = await window.api.audio.readBatch(
          file.path,
          chart.keysounds,
        );
        const total = Object.keys(chart.keysounds).length;
        const loaded = Object.keys(results).length;
        setAudioProgress({ loaded, total });

        if (Object.keys(errors).length > 0) {
          console.warn(`[Player] ${Object.keys(errors).length} keysounds failed to load`);
        }

        // TODO: Initialize GamePlayer with loaded audio buffers
        // This requires creating a LocalAudioPreloader adapter
        console.log(`[Player] Loaded ${loaded}/${total} keysounds`);
      } catch (err) {
        console.error('[Player] Audio loading failed:', err);
      } finally {
        setAudioLoading(false);
      }
    };

    loadAudio();
  }, [chart, file.path]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-zinc-400">Loading chart...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-red-400">Error: {error}</div>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {chart?.songInfo?.title || file.name}
          </div>
          {chart?.songInfo?.artist && (
            <div className="text-xs text-zinc-500 truncate">{chart.songInfo.artist}</div>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          {chart?.keyMode} | BPM {chart?.bpm.initial}
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 bg-black flex items-center justify-center">
        {audioLoading ? (
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <div className="text-zinc-400">
              Loading keysounds... {audioProgress.loaded}/{audioProgress.total}
            </div>
            {audioProgress.total > 0 && (
              <div className="w-64 h-1.5 bg-zinc-800 rounded-full mt-3 mx-auto overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{
                    width: `${(audioProgress.loaded / audioProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-zinc-600">
            <p className="text-xl mb-2">Game Player</p>
            <p className="text-sm">
              GamePlayer component integration will be connected here.
            </p>
            <p className="text-sm mt-1">
              Press Space or Enter to start when ready.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
