import { generateChartFromOnsets, buildMarkovModel, suggestPattern } from '../../../src/renderer/lib/autoChart';
import type { AutoChartOptions, GeneratedNote } from '../../../src/renderer/lib/autoChart';

function makeOptions(overrides: Partial<AutoChartOptions> = {}): AutoChartOptions {
  return {
    difficulty: 6,
    columnCount: 7,
    useScratch: false,
    lnRatio: 0,
    quantize: false,
    gridSnap: 16,
    bpm: 120,
    ...overrides,
  };
}

describe('generateChartFromOnsets', () => {
  let originalRandom: () => number;

  beforeEach(() => {
    originalRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('returns empty array for empty onsets', () => {
    const result = generateChartFromOnsets([], 120, makeOptions());
    expect(result).toEqual([]);
  });

  it('returns at least one note for a single onset', () => {
    // Make random always return 0 so density filter always passes
    Math.random = vi.fn(() => 0);
    const result = generateChartFromOnsets([1.0], 120, makeOptions());
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('quantizes onsets to grid and removes duplicates', () => {
    Math.random = vi.fn(() => 0); // always pass density filter
    const opts = makeOptions({ quantize: true, gridSnap: 4 }); // gridStep = 1
    // 0.1s and 0.12s at 120bpm => beats 0.24 and 0.24 => both round to 0 => one unique
    const result = generateChartFromOnsets([0.1, 0.12], 120, opts);
    // Should have only 1 note because duplicates removed
    const beats = result.map((n) => n.beat);
    const uniqueBeats = new Set(beats);
    // All notes at same beat are from chord logic, but unique onset beats = 1
    expect(uniqueBeats.size).toBe(1);
  });

  it('difficulty 1 filters many onsets (low density)', () => {
    // densityFactor = min(1, (1/12)*1.2) = 0.1
    // random returns 0.5 which is > 0.1 => filtered out most of the time
    let callCount = 0;
    Math.random = vi.fn(() => {
      callCount++;
      return 0.5; // > densityFactor (0.1) => filtered
    });
    const onsets = Array.from({ length: 20 }, (_, i) => i * 0.5);
    const result = generateChartFromOnsets(onsets, 120, makeOptions({ difficulty: 1 }));
    expect(result).toEqual([]); // all filtered since 0.5 > 0.1
  });

  it('difficulty 12 keeps all onsets and may add chords', () => {
    // densityFactor = min(1, (12/12)*1.2) = 1.0, chordChance = (12-6)/12 = 0.5
    // Alternate random values: 0 passes density, 0.3 for column pick, 0 triggers chord, 0.8 for chord column pick
    let callIdx = 0;
    const values = [0, 0.3, 0, 0.8, 0, 0.3, 0, 0.8, 0, 0.3, 0, 0.8];
    Math.random = vi.fn(() => values[callIdx++ % values.length]);
    const onsets = [0.5, 1.0, 1.5];
    const result = generateChartFromOnsets(onsets, 120, makeOptions({ difficulty: 12 }));
    // At difficulty 12, chordChance = 0.5, so chords should be attempted
    // At minimum, all 3 onsets should produce notes
    expect(result.length).toBeGreaterThanOrEqual(3);
    // With these random values, at least some chords should be added
    expect(result.length).toBeGreaterThan(3);
  });

  it('lnRatio 0 produces no long notes', () => {
    Math.random = vi.fn(() => 0);
    const result = generateChartFromOnsets([0.5, 1.0], 120, makeOptions({ lnRatio: 0 }));
    expect(result.length).toBeGreaterThan(0);
    for (const note of result) {
      expect(note.endBeat).toBeUndefined();
    }
  });

  it('lnRatio 1 produces long notes with endBeat', () => {
    Math.random = vi.fn(() => 0); // 0 < 1 => isLN true
    const result = generateChartFromOnsets([0.5, 1.0], 120, makeOptions({ lnRatio: 1 }));
    const notesAtOnsetBeats = result.filter((n) => {
      // Only primary notes (not chord additions) would have endBeat
      return n.endBeat !== undefined;
    });
    expect(notesAtOnsetBeats.length).toBeGreaterThan(0);
  });

  it('all notes have noteType "playable"', () => {
    Math.random = vi.fn(() => 0);
    const result = generateChartFromOnsets([0.5, 1.0, 1.5], 120, makeOptions());
    for (const note of result) {
      expect(note.noteType).toBe('playable');
    }
  });

  it('distributes notes across multiple columns', () => {
    // Use varying random to get different columns
    let i = 0;
    Math.random = vi.fn(() => {
      return (i++ % 10) / 10;
    });
    const onsets = Array.from({ length: 20 }, (_, idx) => idx * 0.5);
    const result = generateChartFromOnsets(onsets, 120, makeOptions({ difficulty: 12 }));
    const uniqueCols = new Set(result.map((n) => n.columnIndex));
    expect(uniqueCols.size).toBeGreaterThan(1);
  });

  it('converts onset time to beat correctly: beat = (time * bpm) / 60', () => {
    Math.random = vi.fn(() => 0);
    const bpm = 120;
    const time = 1.5; // expected beat = (1.5 * 120) / 60 = 3.0
    const result = generateChartFromOnsets([time], bpm, makeOptions({ quantize: false }));
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].beat).toBe(3.0);
  });

  it('returns empty when density filter removes all onsets', () => {
    // densityFactor for difficulty 1 = 0.1, random = 0.99 => all filtered
    Math.random = vi.fn(() => 0.99);
    const result = generateChartFromOnsets([0.5], 120, makeOptions({ difficulty: 1 }));
    expect(result).toEqual([]);
  });
});

describe('buildMarkovModel', () => {
  it('returns empty map for empty notes', () => {
    const model = buildMarkovModel([], 7, 0.25);
    expect(model.size).toBe(0);
  });

  it('returns empty map for single note (no transitions)', () => {
    const model = buildMarkovModel([{ beat: 0, columnIndex: 3 }], 7, 0.25);
    expect(model.size).toBe(0);
  });

  it('creates one transition entry for two notes', () => {
    const notes = [
      { beat: 0, columnIndex: 2 },
      { beat: 0.25, columnIndex: 5 },
    ];
    const model = buildMarkovModel(notes, 7, 0.25);
    expect(model.size).toBe(1);
    expect(model.has('2')).toBe(true);
    const transitions = model.get('2')!;
    expect(transitions.has('5_1')).toBe(true);
    expect(transitions.get('5_1')).toBe(1);
  });

  it('caps timeDelta at 8', () => {
    const notes = [
      { beat: 0, columnIndex: 0 },
      { beat: 100, columnIndex: 1 }, // huge gap
    ];
    const model = buildMarkovModel(notes, 7, 0.25);
    const transitions = model.get('0')!;
    // key should have delta capped at 8
    const keys = Array.from(transitions.keys());
    expect(keys[0]).toBe('1_8');
  });

  it('tracks multiple transitions from same column with correct counts', () => {
    const notes = [
      { beat: 0, columnIndex: 0 },
      { beat: 0.25, columnIndex: 1 },
      { beat: 0.5, columnIndex: 0 },
      { beat: 0.75, columnIndex: 1 },
      { beat: 1.0, columnIndex: 0 },
    ];
    const model = buildMarkovModel(notes, 7, 0.25);
    // From col 0 -> col 1 (delta 1) happens twice
    const from0 = model.get('0')!;
    expect(from0.get('1_1')).toBe(2);
    // From col 1 -> col 0 (delta 1) happens twice
    const from1 = model.get('1')!;
    expect(from1.get('0_1')).toBe(2);
  });
});

describe('suggestPattern', () => {
  let originalRandom: () => number;

  beforeEach(() => {
    originalRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('uses transitions from model', () => {
    Math.random = vi.fn(() => 0);
    const model = new Map<string, Map<string, number>>();
    model.set('3', new Map([['5_2', 10]])); // from col 3, always go to col 5, delta 2
    model.set('5', new Map([['3_1', 10]])); // from col 5, always go to col 3, delta 1

    const result = suggestPattern(model, 0, 3, 7, 4, 0.25);
    expect(result.length).toBe(4);
    // First note: from col 3 -> col 5
    expect(result[0].columnIndex).toBe(5);
    // Second note: from col 5 -> col 3
    expect(result[1].columnIndex).toBe(3);
  });

  it('falls back to random when model has no entry for current column', () => {
    Math.random = vi.fn(() => 0); // floor(0 * 7) = 0
    const model = new Map<string, Map<string, number>>(); // empty model

    const result = suggestPattern(model, 0, 2, 7, 3, 0.25);
    expect(result.length).toBe(3);
    // With fallback: nextCol = floor(random * columnCount) = 0, timeDelta = 1
    expect(result[0].columnIndex).toBe(0);
  });

  it('generates correct number of notes', () => {
    Math.random = vi.fn(() => 0);
    const model = new Map<string, Map<string, number>>();
    const result = suggestPattern(model, 0, 0, 7, 8, 0.25);
    expect(result.length).toBe(8);
  });

  it('increments beats based on timeDelta * gridStep', () => {
    Math.random = vi.fn(() => 0);
    const gridStep = 0.5;
    const model = new Map<string, Map<string, number>>();
    model.set('0', new Map([['1_3', 10]])); // delta=3
    model.set('1', new Map([['0_2', 10]])); // delta=2

    const result = suggestPattern(model, 4.0, 0, 7, 2, gridStep);
    // First note: beat = 4.0 + 3*0.5 = 5.5
    expect(result[0].beat).toBe(5.5);
    // Second note: beat = 5.5 + 2*0.5 = 6.5
    expect(result[1].beat).toBe(6.5);
  });

  it('keeps column within columnCount bounds via modulo', () => {
    Math.random = vi.fn(() => 0);
    // Model returns col 10, but columnCount is 7 => 10 % 7 = 3
    const model = new Map<string, Map<string, number>>();
    model.set('0', new Map([['10_1', 10]]));

    const result = suggestPattern(model, 0, 0, 7, 1, 0.25);
    expect(result[0].columnIndex).toBe(3); // 10 % 7
  });

  it('all generated notes have noteType "playable"', () => {
    Math.random = vi.fn(() => 0);
    const model = new Map<string, Map<string, number>>();
    const result = suggestPattern(model, 0, 0, 7, 5, 0.25);
    for (const note of result) {
      expect(note.noteType).toBe('playable');
    }
  });
});
