import type { NoteType } from '@rhythm-archive/bms-core';

export interface AutoChartOptions {
  /** Target difficulty 1-12 */
  difficulty: number;
  /** Number of playable columns */
  columnCount: number;
  /** Include scratch column */
  useScratch: boolean;
  /** Long note ratio (0-1) */
  lnRatio: number;
  /** Whether to quantize to grid */
  quantize: boolean;
  /** Grid snap value (4=quarter, 8=eighth, 16=sixteenth) */
  gridSnap: number;
  /** Base BPM for density calculation */
  bpm: number;
  /** Seed for the pseudo-random generator — same seed + same input = same chart. */
  seed?: number;
  /** Indices (into the lane list) that may receive key notes. Defaults to every column. */
  keyColumnIndices?: number[];
  /** Index of the scratch lane, or null/undefined when the key mode has none. */
  scratchColumnIndex?: number | null;
  /** Audio start offset in seconds: onset time minus this is beat 0. */
  audioOffsetSec?: number;
}

/** Small deterministic PRNG (mulberry32) so a seed reproduces a generation. */
export function createRng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lane ids that are not key columns (scratch / foot pedal) in the editor's lane naming. */
const NON_KEY_LANE = /^(SC2?|FZ2?)$/;
export function isKeyLane(laneId: string): boolean {
  return !NON_KEY_LANE.test(laneId);
}

export interface GeneratedNote {
  beat: number;
  columnIndex: number;
  noteType: NoteType;
  endBeat?: number;
}

/**
 * Generate a chart from onset times using algorithmic column distribution.
 */
export function generateChartFromOnsets(
  onsetTimes: number[],
  bpm: number,
  options: AutoChartOptions,
): GeneratedNote[] {
  if (onsetTimes.length === 0) return [];

  const notes: GeneratedNote[] = [];
  const { columnCount, difficulty, lnRatio, quantize, gridSnap } = options;
  // No seed → plain Math.random (keeps the historical behaviour and lets tests stub it).
  const rng = options.seed !== undefined ? createRng(options.seed) : Math.random;
  const keyColumns = (options.keyColumnIndices && options.keyColumnIndices.length > 0)
    ? options.keyColumnIndices.filter((c) => c >= 0 && c < columnCount)
    : Array.from({ length: columnCount }, (_, i) => i);
  if (keyColumns.length === 0) return [];
  const scratchCol = options.useScratch && options.scratchColumnIndex != null && options.scratchColumnIndex >= 0
    ? options.scratchColumnIndex : null;
  const scratchChance = scratchCol === null ? 0 : Math.min(0.25, 0.05 + difficulty * 0.012);
  const audioOffset = options.audioOffsetSec ?? 0;
  const gridStep = 4 / gridSnap;
  // Tick-based snap helper (960 ticks/beat, no floating point drift)
  const TICKS_PER_BEAT = 960;
  const gridTicks = Math.round(TICKS_PER_BEAT * 4 / gridSnap);
  const snapBeat = (b: number) => {
    const tick = Math.round(b * TICKS_PER_BEAT);
    return Math.round(tick / gridTicks) * gridTicks / TICKS_PER_BEAT;
  };

  // Convert times to beats (relative to the audio offset; onsets before it are dropped)
  let onsetBeats = onsetTimes.map((t) => ((t - audioOffset) * bpm) / 60).filter((b) => b >= 0);

  // Quantize if requested
  if (quantize) {
    onsetBeats = onsetBeats.map(snapBeat);
    // Remove duplicates
    onsetBeats = [...new Set(onsetBeats)].sort((a, b) => a - b);
  }

  // Difficulty → density factor
  // Low difficulty = skip more onsets, high = use all + add chords
  const densityFactor = Math.min(1, (difficulty / 12) * 1.2);
  const chordChance = Math.max(0, (difficulty - 6) / 12);

  // Filter onsets by density
  const filteredBeats = onsetBeats.filter(() => rng() < densityFactor);
  if (filteredBeats.length === 0) return [];

  // Column distribution algorithm
  let prevCol = keyColumns[Math.floor(keyColumns.length / 2)];
  const colUsage = new Array(columnCount).fill(0);
  // Beat until which each column is occupied by a long note (no note may land inside).
  const busyUntil = new Array<number>(columnCount).fill(-Infinity);
  const freeColumns = (beat: number) => keyColumns.filter((c) => busyUntil[c] <= beat);

  for (const beat of filteredBeats) {
    // Scratch: occasionally route an onset to the turntable instead of a key.
    if (scratchCol !== null && busyUntil[scratchCol] <= beat && rng() < scratchChance) {
      notes.push({ beat, columnIndex: scratchCol, noteType: 'playable' });
      colUsage[scratchCol]++;
      continue;
    }

    const available = freeColumns(beat);
    if (available.length === 0) continue; // every key column is inside a hold

    // Pick column: prefer movement, avoid same column (anti-jack)
    const col = pickColumn(prevCol, available, colUsage, difficulty, rng);

    // Determine if long note
    const isLN = rng() < lnRatio;
    const endBeat = isLN ? beat + gridStep * (1 + Math.floor(rng() * 3)) : undefined;

    notes.push({
      beat,
      columnIndex: col,
      noteType: 'playable',
      endBeat,
    });
    if (endBeat !== undefined) busyUntil[col] = endBeat;

    colUsage[col]++;
    prevCol = col;

    // Maybe add chord (extra note at same beat)
    if (rng() < chordChance) {
      const chordChoices = available.filter((c) => c !== col);
      if (chordChoices.length > 0) {
        const chordCol = pickColumn(col, chordChoices, colUsage, difficulty, rng);
        notes.push({
          beat,
          columnIndex: chordCol,
          noteType: 'playable',
        });
        colUsage[chordCol]++;
      }
    }
  }

  // A long note must end before the next note in its column; shorten it, and
  // drop the hold entirely when there is no room for even one grid step.
  notes.sort((a, b) => a.beat - b.beat || a.columnIndex - b.columnIndex);
  const nextBeatInColumn = new Map<number, number>();
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.endBeat !== undefined) {
      const next = nextBeatInColumn.get(n.columnIndex);
      if (next !== undefined && n.endBeat > next - gridStep) {
        const capped = next - gridStep;
        if (capped - n.beat >= gridStep) n.endBeat = capped;
        else delete n.endBeat;
      }
    }
    nextBeatInColumn.set(n.columnIndex, n.beat);
  }

  return notes;
}

function pickColumn(
  prevCol: number,
  allowedColumns: number[],
  colUsage: number[],
  difficulty: number,
  rng: () => number = Math.random,
): number {
  // Higher difficulty = more spread, lower = more central
  const candidates: number[] = [];
  const weights: number[] = [];

  for (const c of allowedColumns) {
    const dist = Math.abs(c - prevCol);
    // Avoid same column (anti-jack bias), unless high difficulty
    const jackPenalty = dist === 0 ? (difficulty > 8 ? 0.3 : 0.05) : 1;
    // Prefer movement
    const movementBonus = dist > 0 ? 1 + dist * 0.2 : 0.3;
    // Balance usage
    const usagePenalty = 1 / (1 + colUsage[c] * 0.1);

    candidates.push(c);
    weights.push(jackPenalty * movementBonus * usagePenalty);
  }

  // Weighted random selection
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = rng() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Simple onset detection from AudioBuffer for auto-chart generation.
 * Reuses the same algorithm as the slicer but tuned for note generation.
 */
export function detectOnsetsFromBuffer(
  buffer: AudioBuffer,
  threshold = 0.1,
): number[] {
  // Mix every channel down so a hard-panned hit is still detected.
  let channelData = buffer.getChannelData(0);
  if (buffer.numberOfChannels > 1) {
    const mono = new Float32Array(buffer.length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / buffer.numberOfChannels;
    }
    channelData = mono;
  }
  const sampleRate = buffer.sampleRate;
  const hopSize = Math.floor(sampleRate * 0.01);
  const windowSize = Math.floor(sampleRate * 0.02);
  const onsets: number[] = [];
  let prevEnergy = 0;
  const minGapSamples = sampleRate * 0.03; // 30ms min gap for finer detection
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

// --- Markov Chain Pattern Suggestion ---

interface PatternState {
  /** Column of the note */
  col: number;
  /** Relative timing to prev note (quantized to grid steps) */
  timeDelta: number;
}

/**
 * Build a Markov transition table from existing notes.
 */
export function buildMarkovModel(
  notes: Array<{ beat: number; columnIndex: number }>,
  columnCount: number,
  gridStep: number,
): Map<string, Map<string, number>> {
  const transitions = new Map<string, Map<string, number>>();

  const sorted = [...notes].sort((a, b) => a.beat - b.beat);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    // Chords (delta 0) would freeze the suggested pattern on one beat; always advance.
    const timeDelta = Math.max(1, Math.round((curr.beat - prev.beat) / gridStep));

    const fromKey = `${prev.columnIndex}`;
    const toKey = `${curr.columnIndex}_${Math.min(timeDelta, 8)}`; // cap delta at 8 steps

    if (!transitions.has(fromKey)) transitions.set(fromKey, new Map());
    const entry = transitions.get(fromKey)!;
    entry.set(toKey, (entry.get(toKey) || 0) + 1);
  }

  return transitions;
}

/**
 * Generate suggested notes using Markov chain.
 */
export function suggestPattern(
  model: Map<string, Map<string, number>>,
  startBeat: number,
  startCol: number,
  columnCount: number,
  noteCount: number,
  gridStep: number,
  rng: () => number = Math.random,
): GeneratedNote[] {
  const result: GeneratedNote[] = [];
  let currentCol = startCol;
  let currentBeat = startBeat;

  for (let i = 0; i < noteCount; i++) {
    const fromKey = `${currentCol}`;
    const nextStates = model.get(fromKey);

    let nextCol: number;
    let timeDelta: number;

    if (nextStates && nextStates.size > 0) {
      // Weighted random from transitions
      const entries = Array.from(nextStates.entries());
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = rng() * total;
      let chosen = entries[0][0];
      for (const [key, weight] of entries) {
        r -= weight;
        if (r <= 0) { chosen = key; break; }
      }
      const [colStr, deltaStr] = chosen.split('_');
      nextCol = parseInt(colStr);
      timeDelta = parseInt(deltaStr);
    } else {
      // Fallback: random column, step forward
      nextCol = Math.floor(rng() * columnCount);
      timeDelta = 1;
    }

    currentBeat += Math.max(1, timeDelta) * gridStep;
    currentCol = nextCol % columnCount;

    result.push({
      beat: currentBeat,
      columnIndex: currentCol,
      noteType: 'playable',
    });
  }

  return result;
}
