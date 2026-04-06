import { useRef, useEffect, useMemo } from 'react';
import type { AudioPreloader } from '@rhythm-archive/bms-player';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

interface WaveformOverlayProps {
  /** Audio preloader with decoded buffers */
  preloader: AudioPreloader | null;
  /** All notes (to find BGM keysounds and their beat positions) */
  notes: EditableBMSNote[];
  /** Current BPM */
  bpm: number;
  /** Current scroll position in beats */
  currentBeat: number;
  /** Beats visible in viewport */
  viewportBeats: number;
  /** Total beats */
  totalBeats: number;
  /** Whether overlay is enabled */
  enabled: boolean;
}

interface WaveformSegment {
  startBeat: number;
  data: Float32Array;
  samplesPerBeat: number;
}

export function WaveformOverlay({
  preloader,
  notes,
  bpm,
  currentBeat,
  viewportBeats,
  totalBeats,
  enabled,
}: WaveformOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build waveform segments from BGM notes
  const segments = useMemo<WaveformSegment[]>(() => {
    if (!preloader || !enabled || bpm <= 0) return [];

    const samplesPerBeat = 16;
    const result: WaveformSegment[] = [];
    const processed = new Set<string>();

    // Get all BGM notes and main keysounds
    const bgmNotes = notes.filter((n) => n.noteType === 'bgm' && n.keysound && n.keysound !== '00');

    for (const note of bgmNotes) {
      const key = `${note.keysound}-${note.beat.toFixed(4)}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const data = preloader.getWaveformData(note.keysound.toLowerCase(), samplesPerBeat, bpm);
      if (data) {
        result.push({ startBeat: note.beat, data, samplesPerBeat });
      }
    }

    return result;
  }, [preloader, notes, bpm, enabled]);

  // Render waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || segments.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Viewport: currentBeat - a few beats to currentBeat + viewportBeats
    const viewStart = Math.max(0, currentBeat - 2);
    const viewEnd = currentBeat + viewportBeats + 2;
    const pxPerBeat = h / viewportBeats; // vertical layout (beats go up)

    for (const seg of segments) {
      const segEndBeat = seg.startBeat + seg.data.length / seg.samplesPerBeat;

      // Skip if outside viewport
      if (segEndBeat < viewStart || seg.startBeat > viewEnd) continue;

      ctx.fillStyle = 'rgba(96, 165, 250, 0.12)'; // blue-400 very transparent

      for (let i = 0; i < seg.data.length; i++) {
        const beat = seg.startBeat + i / seg.samplesPerBeat;
        if (beat < viewStart || beat > viewEnd) continue;

        const amp = seg.data[i];
        if (amp < 0.01) continue;

        // Convert beat to Y position (bottom = currentBeat, top = currentBeat + viewportBeats)
        const y = h - ((beat - currentBeat) / viewportBeats) * h;
        const barH = Math.max(1, pxPerBeat / seg.samplesPerBeat);
        const barW = amp * w * 0.4; // max 40% width

        // Draw centered
        ctx.fillRect((w - barW) / 2, y, barW, barH);
      }
    }
  }, [segments, currentBeat, viewportBeats, enabled]);

  if (!enabled || segments.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[1]"
      style={{ opacity: 0.6 }}
    />
  );
}
