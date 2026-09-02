import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Wand2, Lightbulb, Dices } from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';
import type { GeneratedNote, AutoChartOptions } from '../lib/autoChart';
import {
  generateChartFromOnsets,
  detectOnsetsFromBuffer,
  buildMarkovModel,
  suggestPattern,
  createRng,
  isKeyLane,
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
  const { t } = useTranslation(['app', 'common']);
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
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => (Date.now() % 100000));
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const columnCount = laneIds.length;
  // Key columns exclude the turntable / foot pedal lanes; scratch is opt-in.
  const keyColumnIndices = useMemo(() => laneIds.map((id, i) => (isKeyLane(id) ? i : -1)).filter((i) => i >= 0), [laneIds]);
  const scratchColumnIndex = useMemo(() => { const i = laneIds.indexOf('SC'); return i >= 0 ? i : null; }, [laneIds]);

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
    setError(null);
    try {
      const arrayBuffer = await window.api.audio.readFile(path);
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const buffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
    } catch (err) {
      console.error('[AutoChart] Audio load failed:', err);
      setError(t('dialogs.autoChart.audioLoadFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoadingAudio(false);
    }
  }, [t]);

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
      seed,
      keyColumnIndices,
      scratchColumnIndex,
      audioOffsetSec: audioOffsetMs / 1000,
    };

    const generated = generateChartFromOnsets(onsetTimes, bpm, options);
    setPreview(generated);
    setGenerateAttempted(true);
  }, [audioBuffer, difficulty, columnCount, useScratch, lnRatio, quantize, gridSnap, bpm, seed, keyColumnIndices, scratchColumnIndex, audioOffsetMs]);

  // New seed → different but reproducible result
  const handleReseed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 100000));
  }, []);
  const seedRef = useRef(seed);
  useEffect(() => {
    // Regenerate automatically when the seed changes after a generation.
    if (seedRef.current !== seed && audioBuffer && generateAttempted) handleGenerate();
    seedRef.current = seed;
  }, [seed, audioBuffer, generateAttempted, handleGenerate]);

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

    const suggested = suggestPattern(model, currentBeat, startCol, columnCount, suggestCount, gridStep, createRng(seed));
    setPreview(suggested);
  }, [existingNotes, laneIds, columnCount, currentBeat, gridSnap, suggestCount, seed]);

  const handleApply = useCallback(() => {
    if (preview.length === 0) return;
    onApplyNotes(preview);
    onClose();
  }, [preview, onApplyNotes, onClose]);

  const audioLabel = useMemo(() => {
    if (loadingAudio) return t('dialogs.autoChart.audioLoading');
    if (audioBuffer) return t('dialogs.autoChart.audioLoaded', { duration: audioBuffer.duration.toFixed(1) });
    return t('dialogs.autoChart.audioOpenButton');
  }, [loadingAudio, audioBuffer, t]);

  return (
    <AccessibleDialog open={open} onClose={onClose} title={t('dialogs.autoChart.title')} className="border border-zinc-700 w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            {t('dialogs.autoChart.title')}
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
            {t('dialogs.autoChart.tabs.generate')}
          </button>
          <button
            onClick={() => setMode('suggest')}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'suggest' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Lightbulb className="h-3.5 w-3.5 inline mr-1" />
            {t('dialogs.autoChart.tabs.suggest')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
          {mode === 'generate' ? (
            <>
              {/* Audio source */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{t('dialogs.autoChart.audioSection')}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleLoadAudio}
                    disabled={loadingAudio}
                    className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                  >
                    {audioLabel}
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                    {t('dialogs.autoChart.offsetLabel')}
                    <input
                      type="number"
                      step={10}
                      value={audioOffsetMs}
                      onChange={(e) => setAudioOffsetMs(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)}
                      className="w-20 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
                      title={t('dialogs.autoChart.offsetHint')}
                    />
                    ms
                  </label>
                </div>
                {error && <div role="alert" className="mt-1.5 text-xs text-red-400">{error}</div>}
              </div>

              {/* Difficulty */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  {t('dialogs.autoChart.difficultyLabel')}: <span className="text-zinc-300">{difficulty}</span>/12
                </h3>
                <input
                  type="range" min={1} max={12} value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-blue-500"
                />
              </div>

              {/* LN Ratio */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  {t('dialogs.autoChart.lnRatioLabel')}: <span className="text-zinc-300">{Math.round(lnRatio * 100)}%</span>
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
                  {t('dialogs.autoChart.gridSnapToggle')}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-400" title={scratchColumnIndex === null ? t('dialogs.autoChart.noScratchLane') : undefined}>
                  <input type="checkbox" checked={useScratch && scratchColumnIndex !== null} disabled={scratchColumnIndex === null} onChange={(e) => setUseScratch(e.target.checked)} className="accent-blue-500" />
                  {t('dialogs.autoChart.scratchToggle')}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-400 ml-auto">
                  {t('dialogs.autoChart.seedLabel')}
                  <span className="font-mono text-zinc-300">{seed}</span>
                  <button type="button" onClick={handleReseed} className="p-1 rounded hover:bg-zinc-800 text-zinc-400" title={t('dialogs.autoChart.regenerateButton')} aria-label={t('dialogs.autoChart.regenerateButton')}>
                    <Dices className="h-3.5 w-3.5" />
                  </button>
                </label>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!audioBuffer}
                className="w-full py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors flex items-center justify-center gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {t('dialogs.autoChart.generateButton')}
              </button>
            </>
          ) : (
            <>
              {/* Suggest mode */}
              <div className="text-xs text-zinc-400 bg-zinc-800/50 rounded p-2">
                {t('dialogs.autoChart.suggestExplanation', { count: existingNotes.length })}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                  {t('dialogs.autoChart.suggestCountLabel')}: <span className="text-zinc-300">{suggestCount}</span>
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
                {t('dialogs.autoChart.suggestButton')}
              </button>
              {existingNotes.length < 4 && (
                <div className="text-xs text-yellow-500">{t('dialogs.autoChart.minNotesWarning')}</div>
              )}
            </>
          )}

          {/* Preview */}
          {generateAttempted && preview.length === 0 && (
            <div className="text-xs text-yellow-500 bg-yellow-900/20 rounded p-2">
              {t('dialogs.autoChart.noOnsetsWarning')}
            </div>
          )}
          {preview.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                {t('dialogs.autoChart.previewLabel', { count: preview.length })}
              </h3>
              <div className="bg-zinc-800/50 rounded p-2 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-8 gap-0.5 text-xs font-mono text-zinc-400">
                  <div className="font-semibold text-zinc-500">{t('dialogs.autoChart.previewBeat')}</div>
                  <div className="font-semibold text-zinc-500">{t('dialogs.autoChart.previewCol')}</div>
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
                  {preview.length > 50 && <div className="col-span-8 text-zinc-600">{t('dialogs.autoChart.previewMore', { count: preview.length - 50 })}</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 shrink-0">
          <div className="text-xs text-zinc-500">
            {preview.length > 0 && t('dialogs.autoChart.generatedSummary', { count: preview.length })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              {t('common:actions.cancel')}
            </button>
            <button
              onClick={handleApply}
              disabled={preview.length === 0}
              className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              {t('dialogs.autoChart.applyButton')}
            </button>
          </div>
        </div>
    </AccessibleDialog>
  );
}
