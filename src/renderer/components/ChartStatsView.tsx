import { useMemo } from 'react';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

interface ChartStatsViewProps {
  notes: EditableBMSNote[];
  bpm: number;
  totalBeats: number;
}

export function ChartStatsView({ notes, bpm, totalBeats }: ChartStatsViewProps) {
  const stats = useMemo(() => {
    const playable = notes.filter((n) => n.noteType === 'playable').length;
    const invisible = notes.filter((n) => n.noteType === 'invisible').length;
    const landmine = notes.filter((n) => n.noteType === 'landmine').length;
    const bgm = notes.filter((n) => n.noteType === 'bgm').length;
    const ln = notes.filter((n) => n.endBeat !== undefined).length;
    const durationSec = totalBeats > 0 && bpm > 0 ? (totalBeats / bpm) * 60 : 0;
    const nps = durationSec > 0 ? playable / durationSec : 0;
    const measures = totalBeats > 0 ? Math.ceil(totalBeats / 4) : 0;
    return { playable, invisible, landmine, bgm, ln, durationSec, nps, measures };
  }, [notes, bpm, totalBeats]);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
      <div className="text-zinc-400">Playable</div><div className="text-zinc-300 text-right">{stats.playable}</div>
      <div className="text-zinc-400">LN</div><div className="text-zinc-300 text-right">{stats.ln}</div>
      <div className="text-zinc-400">BGM</div><div className="text-zinc-300 text-right">{stats.bgm}</div>
      <div className="text-zinc-400">Invisible</div><div className="text-zinc-300 text-right">{stats.invisible}</div>
      <div className="text-zinc-400">Landmine</div><div className="text-zinc-300 text-right">{stats.landmine}</div>
      <div className="text-zinc-400">NPS</div><div className="text-zinc-300 text-right">{stats.nps.toFixed(1)}</div>
      <div className="text-zinc-400">마디</div><div className="text-zinc-300 text-right">{stats.measures}</div>
      <div className="text-zinc-400">재생 시간</div><div className="text-zinc-300 text-right">{fmt(stats.durationSec)}</div>
    </div>
  );
}

/** Estimate chart difficulty (1-12 scale) based on note density, BPM, LN ratio */
export function estimateDifficulty(notes: EditableBMSNote[], bpm: number, totalBeats: number): number {
  if (notes.length === 0 || totalBeats <= 0) return 0;
  const playableNotes = notes.filter((n) => n.noteType === 'playable' || n.noteType === 'invisible');
  const totalPlayable = playableNotes.length;
  if (totalPlayable === 0) return 0;

  const durationSec = (totalBeats / bpm) * 60;
  const nps = totalPlayable / Math.max(durationSec, 1);

  const beatBuckets = new Map<number, number>();
  for (const n of playableNotes) {
    const bucket = Math.floor(n.beat);
    beatBuckets.set(bucket, (beatBuckets.get(bucket) || 0) + 1);
  }
  const peakDensity = Math.max(...beatBuckets.values(), 0);

  const lnCount = playableNotes.filter((n) => n.endBeat !== undefined).length;
  const lnRatio = lnCount / totalPlayable;

  const bpmFactor = Math.min(bpm / 200, 1.5);

  const rawScore = (nps * 2.5) + (peakDensity * 0.8) + (bpmFactor * 2) + (lnRatio * 1.5);
  return Math.max(1, Math.min(12, Math.round(rawScore)));
}
