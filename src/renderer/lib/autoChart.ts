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
  const gridStep = 4 / gridSnap;

  // Convert times to beats
  let onsetBeats = onsetTimes.map((t) => (t * bpm) / 60);

  // Quantize if requested
  if (quantize) {
    onsetBeats = onsetBeats.map((b) => Math.round(b / gridStep) * gridStep);
    // Remove duplicates
    onsetBeats = [...new Set(onsetBeats)].sort((a, b) => a - b);
  }

  // Difficulty → density factor
  // Low difficulty = skip more onsets, high = use all + add chords
  const densityFactor = Math.min(1, (difficulty / 12) * 1.2);
  const chordChance = Math.max(0, (difficulty - 6) / 12);

  // Filter onsets by density
  const filteredBeats = onsetBeats.filter(() => Math.random() < densityFactor);
  if (filteredBeats.length === 0) return [];

  // Column distribution algorithm
  let prevCol = Math.floor(columnCount / 2);
  const colUsage = new Array(columnCount).fill(0);

  for (const beat of filteredBeats) {
    // Pick column: prefer movement, avoid same column (anti-jack)
    let col = pickColumn(prevCol, columnCount, colUsage, difficulty);

    // Determine if long note
    const isLN = Math.random() < lnRatio;
    const endBeat = isLN ? beat + gridStep * (1 + Math.floor(Math.random() * 3)) : undefined;

    notes.push({
      beat,
      columnIndex: col,
      noteType: 'playable',
      endBeat,
    });

    colUsage[col]++;
    prevCol = col;

    // Maybe add chord (extra note at same beat)
    if (Math.random() < chordChance) {
      const chordCol = pickColumn(col, columnCount, colUsage, difficulty);
      if (chordCol !== col) {
        notes.push({
          beat,
          columnIndex: chordCol,
          noteType: 'playable',
        });
        colUsage[chordCol]++;
      }
    }
  }

  return notes;
}

function pickColumn(
  prevCol: number,
  columnCount: number,
  colUsage: number[],
  difficulty: number,
): number {
  // Higher difficulty = more spread, lower = more central
  const candidates: number[] = [];
  const weights: number[] = [];

  for (let c = 0; c < columnCount; c++) {
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
  let r = Math.random() * totalWeight;
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
  const channelData = buffer.getChannelData(0);
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
    const timeDelta = Math.round((curr.beat - prev.beat) / gridStep);

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
      let r = Math.random() * total;
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
      nextCol = Math.floor(Math.random() * columnCount);
      timeDelta = 1;
    }

    currentBeat += timeDelta * gridStep;
    currentCol = nextCol % columnCount;

    result.push({
      beat: currentBeat,
      columnIndex: currentCol,
      noteType: 'playable',
    });
  }

  return result;
}
