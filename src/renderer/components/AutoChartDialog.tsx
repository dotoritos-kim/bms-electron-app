import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Wand2, Lightbulb } from 'lucide-react';
import type { GeneratedNote, AutoChartOptions } from '../lib/autoChart';
import {
  generateChartFromOnsets,
  detectOnsetsFromBuffer,
  buildMarkovModel,
  suggestPattern,
} from '../lib/autoChart';

interface AutoChartDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current notes in the chart (for pattern suggestion) */
  existingNotes: Array<{ beat: number; column: string; columnIndex: number }>;
  /** Available lane IDs */
  laneIds: string[];
  /** Current BPM */
  bpm: number;
  /** Current beat position */
  currentBeat: number;
  /** Grid snap value */
  gridSnap: number;
  /** Apply generated notes */
  onApplyNotes: (notes: GeneratedNote[]) => void;
}

type Mode = 'generate' | 'suggest';

export function AutoChartDialog({
  open,
  onClose,
  existingNotes,
  laneIds,
  bpm,
  currentBeat,
  gridSnap,
  onApplyNotes,
}: AutoChartDialogProps) {
  const [mode, setMode] = useState<Mode>('suggest');
  const [difficulty, setDifficulty] = useState(5);
  const [lnRatio, setLnRatio] = useState(0);
  const [useScratch, setUseScratch] = useState(false);
  const [quantize, setQuantize] = useState(true);
  const [suggestCount, setSuggestCount] = useState(16);
  const [preview, setPreview] = useState<GeneratedNote[]>([]);
  const [generateAttempted, setGenerateAttempted] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const columnCount = laneIds.length;

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // Load audio for onset detection
  const handleLoadAudio = useCallback(async () => {
    const path = await window.api.file.openAudioFile();
    if (!path) return;
    setLoadingAudio(true);
    try {
      const arrayBuffer = await window.api.audio.readFile(path);
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const buffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
    } catch (err) {
      console.error('[AutoChart] Audio load failed:', err);
    } finally {
      setLoadingAudio(false);
    }
  }, []);

  // Generate chart from audio
  const handleGenerate = useCallback(() => {
    if (!audioBuffer) return;

    const onsetTimes = detectOnsetsFromBuffer(audioBuffer, 0.08 + (12 - difficulty) * 0.02);
    const options: AutoChartOptions = {
      difficulty,
      columnCount,
      useScratch,
      lnRatio,
      quantize,
      gridSnap,
      bpm,
    };

    const generated = generateChartFromOnsets(onsetTimes, bpm, options);
    setPreview(generated);
    setGenerateAttempted(true);
  }, [audioBuffer, difficulty, columnCount, useScratch, lnRatio, quantize, gridSnap, bpm]);

  // Suggest pattern from existing notes
  const handleSuggest = useCallback(() => {
    if (existingNotes.length < 4) return;

    const gridStep = 4 / gridSnap;
    const notesWithIdx = existingNotes.map((n) => ({
      beat: n.beat,
      columnIndex: laneIds.indexOf(n.column),
    })).filter((n) => n.columnIndex >= 0);

    const model = buildMarkovModel(notesWithIdx, columnCount, gridStep);

    // Find last note before current beat for starting point
    const before = notesWithIdx.filter((n) => n.beat <= currentBeat);
    const startCol = before.length > 0 ? before[before.length - 1].columnIndex : Math.floor(columnCount / 2);

    const suggested = suggestPattern(model, currentBeat, startCol, columnCount, suggestCount, gridStep);
    setPreview(suggested);
  }, [existingNotes, laneIds, columnCount, currentBeat, gridSnap, suggestCount]);

  const handleApply = useCallback(() => {
    if (preview.length === 0) return;
    onApplyNotes(preview);
    onClose();
  }, [preview, onApplyNotes, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-[520px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            AI 차트 생성
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setMode('generate')}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'generate' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5 inline mr-1" />
            오디오 → 차트 생성
          </button>
          <button
            onClick={() => setMode('suggest')}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'suggest' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Lightbulb className="h-3.5 w-3.5 inline mr-1" />
            패턴 제안
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
          {mode === 'generate' ? (
            <>
              {/* Audio source */}
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">오디오 소스</h3>
                <button
                  onClick={handleLoadAudio}
                  disabled={loadingAudio}
                  className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                >
                  {loadingAudio ? '로딩...' : audioBuffer ? `로드됨 (${audioBuffer.duration.toFixed(1)}s)` : '오디오 파일 열기'}
                </button>
              </div>

              {/* Difficulty */}
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  난이도: <span className="text-zinc-300">{difficulty}</span>/12
                </h3>
                <input
                  type="range" min={1} max={12} value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              {/* LN Ratio */}
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  LN 비율: <span className="text-zinc-300">{Math.round(lnRatio * 100)}%</span>
                </h3>
                <input
                  type="range" min={0} max={1} step={0.05} value={lnRatio}
                  onChange={(e) => setLnRatio(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              {/* Options */}
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <input type="checkbox" checked={quantize} onChange={(e) => setQuantize(e.target.checked)} className="accent-blue-500" />
                  그리드 스냅
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <input type="checkbox" checked={useScratch} onChange={(e) => setUseScratch(e.target.checked)} className="accent-blue-500" />
                  스크래치 포함
                </label>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!audioBuffer}
                className="w-full py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors flex items-center justify-center gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" />
                차트 생성
              </button>
            </>
          ) : (
            <>
              {/* Suggest mode */}
              <div className="text-xs text-zinc-400 bg-zinc-800/50 rounded p-2">
                기존 노트 패턴을 분석하여 다음 마디의 노트를 제안합니다.
                현재 차트에 {existingNotes.length}개 노트가 있습니다.
              </div>

              <div>
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  생성할 노트 수: <span className="text-zinc-300">{suggestCount}</span>
                </h3>
                <input
                  type="range" min={4} max={64} value={suggestCount}
                  onChange={(e) => setSuggestCount(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              <button
                onClick={handleSuggest}
                disabled={existingNotes.length < 4}
                className="w-full py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded transition-colors flex items-center justify-center gap-1.5"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                패턴 제안 생성
              </button>
              {existingNotes.length < 4 && (
                <div className="text-[10px] text-yellow-500">최소 4개 이상의 노트가 필요합니다</div>
              )}
            </>
          )}

          {/* Preview */}
          {generateAttempted && preview.length === 0 && (
            <div className="text-[10px] text-yellow-500 bg-yellow-900/20 rounded p-2">
              감지된 온셋이 없습니다. 오디오 볼륨이 너무 낮거나 무음일 수 있습니다. 난이도를 낮추면 감도가 올라갑니다.
            </div>
          )}
          {preview.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                미리보기 ({preview.length}개 노트)
              </h3>
              <div className="bg-zinc-800/50 rounded p-2 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-8 gap-0.5 text-[9px] font-mono text-zinc-400">
                  <div className="font-semibold text-zinc-500">Beat</div>
                  <div className="font-semibold text-zinc-500">Col</div>
                  <div className="col-span-6"></div>
                  {preview.slice(0, 50).map((n, i) => (
                    <div key={i} className="contents">
                      <div>{n.beat.toFixed(2)}</div>
                      <div className="text-blue-400">{laneIds[n.columnIndex] || n.columnIndex}</div>
                      <div className="col-span-6">
                        {n.endBeat !== undefined && <span className="text-purple-400">LN→{n.endBeat.toFixed(2)}</span>}
                      </div>
                    </div>
                  ))}
                  {preview.length > 50 && <div className="col-span-8 text-zinc-600">... +{preview.length - 50} more</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          <div className="text-[10px] text-zinc-500">
            {preview.length > 0 && `${preview.length}개 노트 생성됨`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={preview.length === 0}
              className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
