import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Upload, Scissors, Play, Square, ZoomIn, ZoomOut, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function getDirname(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const idx = filePath.lastIndexOf(sep);
  return idx >= 0 ? filePath.substring(0, idx) : filePath;
}

interface AudioSlicerProps {
  open: boolean;
  onClose: () => void;
  bmsFilePath: string;
  usedWavIds: Set<string>;
  onSlicesCreated: (wavDefs: Record<string, string>) => void;
  /** Decode / write failures — the host shows them (the slicer has no toast of its own). */
  onError?: (kind: 'load' | 'save', message: string) => void;
}

interface SliceMarker {
  time: number; // seconds
  label: string;
}

function detectOnsets(channelData: Float32Array, sampleRate: number, threshold = 0.15): number[] {
  // Amplitude-based onset detection with energy envelope
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms window
  const onsets: number[] = [];
  let prevEnergy = 0;
  const minGapSamples = sampleRate * 0.05; // 50ms minimum gap
  let lastOnset = -minGapSamples;

  for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += channelData[i + j] * channelData[i + j];
    }
    energy /= windowSize;

    const diff = energy - prevEnergy;
    if (diff > threshold * threshold && (i - lastOnset) > minGapSamples) {
      onsets.push(i / sampleRate);
      lastOnset = i;
    }
    prevEnergy = energy;
  }

  return onsets;
}

/** Average all channels into one signal so hard-panned hits are neither invisible nor undetected. */
function mixdownToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.numberOfChannels;
  if (n === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let ch = 0; ch < n; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / n;
  }
  return out;
}

/**
 * Sensitivity (0..1, higher = more onsets) → energy threshold used by
 * detectOnsets. 0.5 maps to the historical default of 0.15.
 */
function thresholdFromSensitivity(sensitivity: number): number {
  const s = Math.max(0, Math.min(1, sensitivity));
  return 0.005 + (1 - s) * 0.29;
}

/** Fade length applied at both ends of every slice to avoid clicks. */
const SLICE_FADE_SEC = 0.002;

function downsampleWaveform(channelData: Float32Array, targetPoints: number): { min: Float32Array; max: Float32Array } {
  const samplesPerPoint = Math.max(1, Math.floor(channelData.length / targetPoints));
  const actualPoints = Math.ceil(channelData.length / samplesPerPoint);
  const min = new Float32Array(actualPoints);
  const max = new Float32Array(actualPoints);

  for (let i = 0; i < actualPoints; i++) {
    const start = i * samplesPerPoint;
    const end = Math.min(start + samplesPerPoint, channelData.length);
    let lo = 1, hi = -1;
    for (let j = start; j < end; j++) {
      const v = channelData[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo;
    max[i] = hi;
  }

  return { min, max };
}

export function AudioSlicer({ open, onClose, bmsFilePath, usedWavIds, onSlicesCreated, onError }: AudioSlicerProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  /** Safe file-name stem used to prefix generated slice files. */
  const sliceBaseName = (fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 24) || 'slice');
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState<SliceMarker[]>([]);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewDuration, setViewDuration] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slicing, setSlicing] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.5);
  const onsetThreshold = thresholdFromSensitivity(sensitivity);
  /** Marker history for local undo (Ctrl+Z inside the slicer). */
  const markerHistoryRef = useRef<SliceMarker[][]>([]);
  const pushMarkerHistory = useCallback((prev: SliceMarker[]) => {
    markerHistoryRef.current = [...markerHistoryRef.current.slice(-49), prev];
  }, []);
  const undoMarkers = useCallback(() => {
    const hist = markerHistoryRef.current;
    if (hist.length === 0) return false;
    const last = hist[hist.length - 1];
    markerHistoryRef.current = hist.slice(0, -1);
    setMarkers(last);
    return true;
  }, []);
  // isDragging removed — use isDraggingRef only to avoid toolbar re-render flicker
  const [autoSliceMsgType, setAutoSliceMsgType] = useState<'warning' | 'success' | null>(null);
  const [autoSliceCount, setAutoSliceCount] = useState(0);
  const draggingMarkerRef = useRef<number | null>(null);
  const { t } = useTranslation('app');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isDraggingRef = useRef(false);
  const waveformRef = useRef<{ min: Float32Array; max: Float32Array } | null>(null);
  const monoRef = useRef<Float32Array | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 300 });

  // Keep canvas resolution in sync with display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (w > 0 && h > 0) setCanvasSize({ width: w, height: h });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [audioBuffer]);

  // Attach non-passive wheel listener to allow preventDefault (React onWheel is passive)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const rect = canvas.getBoundingClientRect();
        const factor = e.deltaY > 0 ? 1.2 : 0.8;
        const newDuration = Math.max(0.5, Math.min(audioBuffer.duration, viewDuration * factor));
        const mouseRatio = (e.clientX - rect.left) / rect.width;
        const mouseTime = viewStart + mouseRatio * viewDuration;
        const newStart = Math.max(0, mouseTime - mouseRatio * newDuration);
        setViewStart(Math.min(newStart, audioBuffer.duration - newDuration));
        setViewDuration(newDuration);
      } else {
        const scrollAmount = viewDuration * 0.1 * Math.sign(e.deltaY);
        setViewStart((prev) => Math.max(0, Math.min(audioBuffer.duration - viewDuration, prev + scrollAmount)));
      }
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [audioBuffer, viewDuration, viewStart]);

  // Load audio file
  const handleOpenFile = useCallback(async () => {
    const path = await window.api.file.openAudioFile();
    if (!path) return;

    setLoading(true);
    try {
      const arrayBuffer = await window.api.audio.readFile(path);
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const buffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(buffer);
      setFileName(path.split(/[/\\]/).pop() || '');
      setViewStart(0);
      setViewDuration(Math.min(10, buffer.duration));
      setMarkers((prev) => { pushMarkerHistory(prev); return []; });
      setSelStart(null);
      setSelEnd(null);
      monoRef.current = mixdownToMono(buffer);
      waveformRef.current = downsampleWaveform(monoRef.current, 4000);
      markerHistoryRef.current = [];
    } catch (err) {
      console.error('[AudioSlicer] Failed to load:', err);
      onError?.('load', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  // Auto onset detection
  const handleAutoSlice = useCallback(() => {
    if (!audioBuffer) return;
    const channelData = monoRef.current ?? mixdownToMono(audioBuffer);
    const onsets = detectOnsets(channelData, audioBuffer.sampleRate, onsetThreshold);
    if (onsets.length === 0) {
      setAutoSliceMsgType('warning');
      setAutoSliceCount(0);
    } else {
      setMarkers((prev) => { pushMarkerHistory(prev); return onsets.map((ts, i) => ({ time: ts, label: `${i + 1}` })); });
      setAutoSliceMsgType('success');
      setAutoSliceCount(onsets.length);
    }
  }, [audioBuffer, onsetThreshold, pushMarkerHistory]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || !waveformRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;
    const duration = audioBuffer.duration;
    const { min, max } = waveformRef.current;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, w, h);

    // Grid lines (every second)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let t = Math.ceil(viewStart); t < viewStart + viewDuration; t++) {
      const x = ((t - viewStart) / viewDuration) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = '#555';
      ctx.font = '9px monospace';
      const m = Math.floor(t / 60);
      const s = t % 60;
      ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, x + 2, 10);
    }

    // Selection highlight
    if (selStart !== null && selEnd !== null) {
      const x1 = ((Math.min(selStart, selEnd) - viewStart) / viewDuration) * w;
      const x2 = ((Math.max(selStart, selEnd) - viewStart) / viewDuration) * w;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(x1, 0, x2 - x1, h);
    }

    // Waveform
    const startIdx = Math.floor((viewStart / duration) * min.length);
    const endIdx = Math.ceil(((viewStart + viewDuration) / duration) * min.length);

    ctx.fillStyle = '#60a5fa';
    for (let px = 0; px < w; px++) {
      const i0 = startIdx + Math.floor((px / w) * (endIdx - startIdx));
      const i1 = startIdx + Math.ceil(((px + 1) / w) * (endIdx - startIdx));
      let lo = 0, hi = 0;
      for (let i = Math.max(0, i0); i < Math.min(min.length, i1); i++) {
        if (min[i] < lo) lo = min[i];
        if (max[i] > hi) hi = max[i];
      }
      const y1 = midY - hi * midY;
      const y2 = midY - lo * midY;
      ctx.fillRect(px, y1, 1, Math.max(1, y2 - y1));
    }

    // Markers
    for (const marker of markers) {
      if (marker.time < viewStart || marker.time > viewStart + viewDuration) continue;
      const x = ((marker.time - viewStart) / viewDuration) * w;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = '8px sans-serif';
      ctx.fillText(marker.label, x + 2, h - 3);
    }

    // Center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
  }, [audioBuffer, viewStart, viewDuration, markers, selStart, selEnd, canvasSize]);

  // Mouse handlers for selection
  const getTimeFromX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return viewStart + ratio * viewDuration;
  }, [viewStart, viewDuration]);

  // Middle-button panning state
  const panningRef = useRef<{ startX: number; startViewStart: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle button → start panning
    if (e.button === 1) {
      e.preventDefault();
      panningRef.current = { startX: e.clientX, startViewStart: viewStart };
      isDraggingRef.current = true;
      return;
    }
    const t = getTimeFromX(e.clientX);
    // Check if clicking near a marker → start marker drag
    const tolerance = viewDuration * 0.008;
    const nearIdx = markers.findIndex((m) => Math.abs(m.time - t) < tolerance);
    if (nearIdx >= 0) {
      draggingMarkerRef.current = nearIdx;
      isDraggingRef.current = true;
      return;
    }
    setSelStart(t);
    setSelEnd(null); // Don't set selEnd yet — only on drag
    isDraggingRef.current = true;
  }, [getTimeFromX, markers, viewDuration, viewStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    // Middle-button panning
    if (panningRef.current) {
      const canvas = canvasRef.current;
      if (!canvas || !audioBuffer) return;
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - panningRef.current.startX;
      const timeDelta = -(dx / rect.width) * viewDuration;
      const maxStart = Math.max(0, audioBuffer.duration - viewDuration);
      setViewStart(Math.max(0, Math.min(maxStart, panningRef.current.startViewStart + timeDelta)));
      return;
    }
    if (draggingMarkerRef.current !== null) {
      const t = Math.min(audioBuffer?.duration ?? Infinity, Math.max(0, getTimeFromX(e.clientX)));
      setMarkers((prev) => {
        const updated = [...prev];
        updated[draggingMarkerRef.current!] = { ...updated[draggingMarkerRef.current!], time: t };
        return updated;
      });
      return;
    }
    setSelEnd(getTimeFromX(e.clientX));
  }, [getTimeFromX, viewDuration, audioBuffer]);

  const handleMouseUp = useCallback(() => {
    if (panningRef.current) {
      panningRef.current = null;
    }
    if (draggingMarkerRef.current !== null) {
      setMarkers((prev) => {
        const sorted = [...prev].sort((a, b) => a.time - b.time);
        return sorted.map((m, i) => ({ ...m, label: `${i + 1}` }));
      });
      draggingMarkerRef.current = null;
    }
    isDraggingRef.current = false;
  }, []);

  // Double-click: toggle marker at click position (add if none nearby, delete if near existing)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const t = Math.min(audioBuffer?.duration ?? Infinity, Math.max(0, getTimeFromX(e.clientX)));
    const tolerance = viewDuration * 0.01; // 1% of view as tolerance
    const nearIdx = markers.findIndex((m) => Math.abs(m.time - t) < tolerance);
    if (nearIdx >= 0) {
      // Delete marker
      setMarkers((prev) => { pushMarkerHistory(prev); return prev.filter((_, i) => i !== nearIdx).map((m, i) => ({ ...m, label: `${i + 1}` })); });
    } else {
      // Add marker
      setMarkers((prev) => {
        pushMarkerHistory(prev);
        const newMarkers = [...prev, { time: t, label: `${prev.length + 1}` }];
        newMarkers.sort((a, b) => a.time - b.time);
        return newMarkers.map((m, i) => ({ ...m, label: `${i + 1}` }));
      });
    }
  }, [getTimeFromX, markers, viewDuration, audioBuffer, pushMarkerHistory]);

  // Zoom around the centre of the current view and keep the view inside the file.
  const zoomTo = useCallback((next: number) => {
    if (!audioBuffer) return;
    const clamped = Math.max(0.5, Math.min(audioBuffer.duration, next));
    setViewStart((vs) => {
      const centre = vs + viewDuration / 2;
      const maxStart = Math.max(0, audioBuffer.duration - clamped);
      return Math.max(0, Math.min(maxStart, centre - clamped / 2));
    });
    setViewDuration(clamped);
  }, [audioBuffer, viewDuration]);
  const handleZoomIn = useCallback(() => zoomTo(viewDuration * 0.7), [zoomTo, viewDuration]);
  const handleZoomOut = useCallback(() => zoomTo(viewDuration * 1.4), [zoomTo, viewDuration]);

  // Play selection or full
  const handlePlay = useCallback(() => {
    if (!audioBuffer || !audioCtxRef.current) return;
    if (isPlaying) {
      sourceRef.current?.stop();
      setIsPlaying(false);
      return;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const hasSel = selStart !== null && selEnd !== null && Math.abs(selEnd - selStart) > 0.001;
    const start = hasSel ? Math.min(selStart!, selEnd!) : 0;
    const dur = hasSel ? Math.abs(selEnd! - selStart!) : audioBuffer.duration;

    source.start(0, start, dur);
    source.onended = () => setIsPlaying(false);
    sourceRef.current = source;
    setIsPlaying(true);
  }, [audioBuffer, selStart, selEnd, isPlaying]);

  // Add marker at click position
  const handleAddMarker = useCallback(() => {
    if (selStart === null) return;
    setMarkers((prev) => {
      pushMarkerHistory(prev);
      const time = Math.min(audioBuffer?.duration ?? Infinity, Math.max(0, selStart));
      const newMarkers = [...prev, { time, label: `${prev.length + 1}` }];
      newMarkers.sort((a, b) => a.time - b.time);
      return newMarkers.map((m, i) => ({ ...m, label: `${i + 1}` }));
    });
  }, [selStart, audioBuffer, pushMarkerHistory]);

  // Keyboard shortcuts while the slicer is open (capture phase so the
  // editor's global shortcuts don't also fire): Space play/stop, M add marker,
  // Ctrl+Z undo markers, +/- zoom.
  useEffect(() => {
    if (!open || !audioBuffer) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); undoMarkers(); return; }
      if (ctrl) return; // leave Ctrl+S etc. to the editor
      switch (e.key) {
        case ' ': e.preventDefault(); e.stopImmediatePropagation(); handlePlay(); break;
        case 'm': case 'M': e.preventDefault(); e.stopImmediatePropagation(); handleAddMarker(); break;
        case '+': case '=': e.preventDefault(); e.stopImmediatePropagation(); handleZoomIn(); break;
        case '-': case '_': e.preventDefault(); e.stopImmediatePropagation(); handleZoomOut(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, audioBuffer, undoMarkers, handlePlay, handleAddMarker, handleZoomIn, handleZoomOut]);

  // Slice and save
  const handleSliceAndSave = useCallback(async () => {
    if (!audioBuffer || markers.length === 0) return;
    setSlicing(true);

    try {
      const bmsDir = getDirname(bmsFilePath);
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;

      // Create slice boundaries: [0, marker1, marker2, ..., end]
      const boundaries = [0, ...markers.map((m) => m.time), audioBuffer.duration];
      // Remove duplicates and sort
      const uniqueBounds = [...new Set(boundaries)].sort((a, b) => a - b);

      // Find next available WAV IDs
      const allUsed = new Set(Array.from(usedWavIds).map((id) => id.toUpperCase()));
      const getNextWavId = (): string => {
        for (let i = 1; i <= 1295; i++) {
          const id = i.toString(36).toUpperCase().padStart(2, '0');
          if (!allUsed.has(id)) {
            allUsed.add(id);
            return id;
          }
        }
        return '';
      };

      const slices: Array<{ filename: string; pcmData: Float32Array; sampleRate: number; channels: number }> = [];
      const wavDefs: Record<string, string> = {};

      for (let i = 0; i < uniqueBounds.length - 1; i++) {
        const startSample = Math.floor(uniqueBounds[i] * sampleRate);
        const endSample = Math.min(Math.floor(uniqueBounds[i + 1] * sampleRate), audioBuffer.length);
        if (endSample <= startSample) continue;

        const wavId = getNextWavId();
        if (!wavId) break;

        const length = endSample - startSample;
        const pcm = new Float32Array(length * channels);

        // Short linear fade in/out so cuts made mid-waveform don't click.
        const fadeLen = Math.min(Math.floor(SLICE_FADE_SEC * sampleRate), Math.floor(length / 2));
        for (let ch = 0; ch < channels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          for (let s = 0; s < length; s++) {
            let gain = 1;
            if (fadeLen > 0) {
              if (s < fadeLen) gain = s / fadeLen;
              else if (s >= length - fadeLen) gain = (length - 1 - s) / fadeLen;
            }
            pcm[s * channels + ch] = channelData[startSample + s] * gain;
          }
        }

        // Prefix with the source name so slicing a second file into the same
        // folder does not overwrite slice_001.wav... from the first one.
        const filename = `${sliceBaseName}_${String(i + 1).padStart(3, '0')}.wav`;
        slices.push({ filename, pcmData: pcm, sampleRate, channels });
        wavDefs[wavId] = filename;
      }

      if (slices.length > 0) {
        await window.api.file.saveWavSlices(bmsDir, slices);
        onSlicesCreated(wavDefs);
      }
    } catch (err) {
      console.error('[AudioSlicer] Slice failed:', err);
      onError?.('save', err instanceof Error ? err.message : String(err));
    } finally {
      setSlicing(false);
    }
  }, [audioBuffer, markers, bmsFilePath, usedWavIds, onSlicesCreated, onError, sliceBaseName]);

  // Reset playing state when dialog closes
  useEffect(() => {
    if (!open) {
      sourceRef.current?.stop();
      sourceRef.current = null;
      setIsPlaying(false);
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sourceRef.current?.stop();
      sourceRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] bg-zinc-950/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Scissors className="h-4 w-4" />
          {t('audioSlicer.title')}
        </h2>
        {fileName && <span className="text-xs text-zinc-500">{fileName}</span>}
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 shrink-0 text-xs">
        <button
          onClick={handleOpenFile}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          {loading ? t('audioSlicer.loading') : t('audioSlicer.openButton')}
        </button>
        {audioBuffer && (
          <>
            <div className="w-px h-4 bg-zinc-700" />
            <button onClick={handlePlay} className={`flex items-center gap-1 px-2 py-1.5 rounded text-zinc-300 ${isPlaying ? 'bg-red-900/50 hover:bg-red-900/70 ring-1 ring-red-500/50' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
              {isPlaying ? <Square className="h-3.5 w-3.5 text-red-400" /> : <Play className="h-3.5 w-3.5 text-green-400" />}
              {isPlaying ? t('audioSlicer.stopButton') : (selStart !== null && selEnd !== null && Math.abs(selEnd - selStart) > 0.01) ? t('audioSlicer.playSelectionButton') : t('audioSlicer.playButton')}
              {isPlaying && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            </button>
            <div className="w-px h-4 bg-zinc-700" />
            <button onClick={handleZoomIn} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button onClick={handleZoomOut} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-zinc-700" />
            <button onClick={handleAddMarker} disabled={selStart === null} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded text-zinc-300">
              {t('audioSlicer.addMarkerButton')}
            </button>
            <button onClick={() => setMarkers([])} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">
              {t('audioSlicer.clearMarkersButton')}
            </button>
            <div className="w-px h-4 bg-zinc-700" />
            <button
              onClick={handleAutoSlice}
              className="flex items-center gap-1 px-2 py-1.5 bg-orange-900/50 hover:bg-orange-900/70 rounded text-orange-300"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {t('audioSlicer.autoDetectButton')}
            </button>
            <label className="flex items-center gap-1 text-zinc-500">
              {t('audioSlicer.sensitivityLabel')}:
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(sensitivity * 100)}
                onChange={(e) => setSensitivity(parseInt(e.target.value, 10) / 100)}
                className="w-20 h-1 accent-orange-500"
                title={t('audioSlicer.sensitivityHint')}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(sensitivity * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 0 && v <= 100) setSensitivity(v / 100);
                }}
                className="w-14 px-1 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-center"
              />
              <span className="text-zinc-600">%</span>
            </label>
            {autoSliceMsgType && (
              <span className={`text-xs px-2 py-1 rounded font-medium ${autoSliceMsgType === 'warning' ? 'text-yellow-300 bg-yellow-800/60 border border-yellow-600/50 animate-pulse' : 'text-green-400 bg-green-950/40'}`}>
                {autoSliceMsgType === 'warning' ? t('audioSlicer.autoDetectNoResults') : t('audioSlicer.autoDetectSuccess', { count: autoSliceCount })}
              </span>
            )}
            <div className="flex-1" />
            <span className="text-zinc-500">{t('audioSlicer.markerCountSummary', { markerCount: markers.length, sliceCount: markers.length + 1 })}</span>
            <button
              onClick={handleSliceAndSave}
              disabled={markers.length === 0 || slicing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              <Scissors className="h-3.5 w-3.5" />
              {slicing ? t('audioSlicer.slicingButton') : t('audioSlicer.sliceAndSaveButton')}
            </button>
          </>
        )}
      </div>

      {/* Waveform canvas */}
      <div className="flex-1 min-h-0 px-4 py-2">
        {audioBuffer ? (
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="w-full h-full rounded border border-zinc-800 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onAuxClick={(e) => e.preventDefault()}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600">
            <div className="text-center">
              <Scissors className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t('audioSlicer.emptyTitle')}</p>
              <p className="text-xs mt-1">{t('audioSlicer.emptyFormats')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      {audioBuffer && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-zinc-800 text-xs text-zinc-500 shrink-0">
          <span>{t('audioSlicer.infoLength')}: {audioBuffer.duration.toFixed(2)}s</span>
          <span>{t('audioSlicer.infoSampleRate')}: {audioBuffer.sampleRate}Hz</span>
          <span>{t('audioSlicer.infoChannels')}: {audioBuffer.numberOfChannels}</span>
          <span>{t('audioSlicer.infoView')}: {viewStart.toFixed(1)}s - {(viewStart + viewDuration).toFixed(1)}s</span>
          {selStart !== null && selEnd !== null && (
            <span className="text-blue-400">
              {t('audioSlicer.infoSelection')}: {Math.min(selStart, selEnd).toFixed(3)}s - {Math.max(selStart, selEnd).toFixed(3)}s
              ({Math.abs(selEnd - selStart).toFixed(3)}s)
            </span>
          )}
          {/* Mini overview bar showing viewport position within full audio */}
          <div className="flex-1" />
          <div className="w-32 h-2 bg-zinc-800 rounded-full relative overflow-hidden" title={t('audioSlicer.viewportTooltip')}>
            <div
              className="absolute top-0 h-full bg-blue-500/50 rounded-full"
              style={{
                left: `${(viewStart / audioBuffer.duration) * 100}%`,
                width: `${Math.max(2, (viewDuration / audioBuffer.duration) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
