import { useState, useMemo, useCallback, useEffect } from 'react';

interface BpmTapDialogProps {
  onClose: () => void;
  onApply: (bpm: number) => void;
}

export function BpmTapDialog({ onClose, onApply }: BpmTapDialogProps) {
  const [taps, setTaps] = useState<number[]>([]);
  const [wasReset, setWasReset] = useState(false);
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
      if (prev.length > 0 && now - prev[prev.length - 1] > 3000) {
        setWasReset(true);
        setTimeout(() => setWasReset(false), 1500);
        return [now];
      }
      return [...prev.slice(-20), now];
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); handleTap(); }
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [handleTap, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">BPM 탭</h3>
        <div className="text-center mb-4">
          <div className="text-4xl font-bold text-blue-400 font-mono">{bpm > 0 ? bpm : '--'}</div>
          <div className="text-xs text-zinc-500 mt-1">
            BPM ({taps.length} taps)
            {wasReset && <span className="ml-1 text-yellow-400">리셋됨</span>}
          </div>
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
