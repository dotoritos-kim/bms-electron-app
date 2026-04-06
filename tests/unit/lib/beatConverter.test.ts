import { createBeatConverter, beatToMF44, mfToBeat44 } from '../../../src/renderer/lib/beatConverter';

describe('beatConverter', () => {
  // === Test Case 1: 기본 4/4 → 기존 동작 동일 (regression) ===
  describe('4/4 only (empty timeSignatures)', () => {
    const converter = createBeatConverter(new Map());

    it('beat 0 → measure 0, fraction 0', () => {
      const result = converter.beatToMF(0);
      expect(result).toEqual({ measure: 0, fraction: 0 });
    });

    it('beat 2 → measure 0, fraction 0.5', () => {
      const result = converter.beatToMF(2);
      expect(result).toEqual({ measure: 0, fraction: 0.5 });
    });

    it('beat 4 → measure 1, fraction 0', () => {
      const result = converter.beatToMF(4);
      expect(result).toEqual({ measure: 1, fraction: 0 });
    });

    it('beat 7 → measure 1, fraction 0.75', () => {
      const result = converter.beatToMF(7);
      expect(result).toEqual({ measure: 1, fraction: 0.75 });
    });

    it('matches beatToMF44 for various beats', () => {
      for (const beat of [0, 1, 2.5, 4, 7.25, 12, 15.5, 100]) {
        expect(converter.beatToMF(beat)).toEqual(beatToMF44(beat));
      }
    });

    it('mfToBeat matches mfToBeat44', () => {
      for (const [m, f] of [[0, 0], [0, 0.5], [1, 0], [1, 0.75], [3, 0.25]] as [number, number][]) {
        expect(converter.mfToBeat(m, f)).toBe(mfToBeat44(m, f));
      }
    });
  });

  // === Test Case 2: 3/4 단일 마디 ===
  describe('single 3/4 measure', () => {
    // measure 1 is 3/4 (size 0.75 → 3 beats)
    const converter = createBeatConverter(new Map([[1, 0.75]]));

    it('measure 0 is still 4/4 → 4 beats', () => {
      expect(converter.getBeatsInMeasure(0)).toBe(4);
    });

    it('measure 1 is 3/4 → 3 beats', () => {
      expect(converter.getBeatsInMeasure(1)).toBe(3);
    });

    it('beat 4 → start of measure 1', () => {
      expect(converter.beatToMF(4)).toEqual({ measure: 1, fraction: 0 });
    });

    it('beat 5.5 → measure 1, fraction 0.5', () => {
      const result = converter.beatToMF(5.5);
      expect(result.measure).toBe(1);
      expect(result.fraction).toBeCloseTo(0.5, 10);
    });

    it('beat 7 → start of measure 2 (4 + 3 = 7)', () => {
      expect(converter.beatToMF(7)).toEqual({ measure: 2, fraction: 0 });
    });

    it('mfToBeat(1, 0) → 4', () => {
      expect(converter.mfToBeat(1, 0)).toBe(4);
    });

    it('mfToBeat(2, 0) → 7 (4 + 3)', () => {
      expect(converter.mfToBeat(2, 0)).toBe(7);
    });
  });

  // === Test Case 3: 혼합 박자 (마디0: 4/4, 마디1: 3/4, 마디2: 5/4) ===
  describe('mixed time signatures (4/4, 3/4, 5/4)', () => {
    // measure 0: default 4/4 (4 beats)
    // measure 1: 3/4 (3 beats)
    // measure 2: 5/4 (5 beats)
    // measure 3: default 4/4 (4 beats)
    const converter = createBeatConverter(new Map([
      [1, 0.75],  // 3/4
      [2, 1.25],  // 5/4
    ]));

    it('cumulative beats: 0, 4, 7, 12, 16', () => {
      expect(converter.mfToBeat(0, 0)).toBe(0);
      expect(converter.mfToBeat(1, 0)).toBe(4);
      expect(converter.mfToBeat(2, 0)).toBe(7);   // 4 + 3
      expect(converter.mfToBeat(3, 0)).toBe(12);  // 4 + 3 + 5
      expect(converter.mfToBeat(4, 0)).toBe(16);  // 4 + 3 + 5 + 4
    });

    it('beatToMF at measure boundaries', () => {
      expect(converter.beatToMF(0)).toEqual({ measure: 0, fraction: 0 });
      expect(converter.beatToMF(4)).toEqual({ measure: 1, fraction: 0 });
      expect(converter.beatToMF(7)).toEqual({ measure: 2, fraction: 0 });
      expect(converter.beatToMF(12)).toEqual({ measure: 3, fraction: 0 });
    });

    it('beatToMF within 5/4 measure', () => {
      // beat 9.5 is in measure 2 (starts at 7, 5 beats long)
      // fraction = (9.5 - 7) / 5 = 0.5
      const result = converter.beatToMF(9.5);
      expect(result.measure).toBe(2);
      expect(result.fraction).toBeCloseTo(0.5, 10);
    });
  });

  // === Test Case 4: roundtrip (beatToMF → mfToBeat) ===
  describe('roundtrip: beatToMF → mfToBeat', () => {
    const timeSigs = new Map([
      [1, 0.75],   // 3/4
      [3, 1.25],   // 5/4
      [5, 0.5],    // 2/4
      [7, 1.75],   // 7/4
    ]);
    const converter = createBeatConverter(timeSigs);

    it('100 random beats roundtrip correctly', () => {
      // Generate deterministic "random" beats
      for (let i = 0; i < 100; i++) {
        const beat = (i * 7.31 + 0.13) % 50; // pseudo-random, 0~50 range
        const { measure, fraction } = converter.beatToMF(beat);
        const reconstructed = converter.mfToBeat(measure, fraction);
        expect(reconstructed).toBeCloseTo(beat, 8);
      }
    });

    it('integer beats roundtrip correctly', () => {
      for (let beat = 0; beat <= 40; beat++) {
        const { measure, fraction } = converter.beatToMF(beat);
        const reconstructed = converter.mfToBeat(measure, fraction);
        expect(reconstructed).toBeCloseTo(beat, 10);
      }
    });
  });

  // === Test Case 5: beatToMF44 / mfToBeat44 fallback ===
  describe('beatToMF44 / mfToBeat44 (4/4 fallback)', () => {
    it('beat 0', () => {
      expect(beatToMF44(0)).toEqual({ measure: 0, fraction: 0 });
    });

    it('beat 6', () => {
      expect(beatToMF44(6)).toEqual({ measure: 1, fraction: 0.5 });
    });

    it('mfToBeat44 roundtrip', () => {
      for (let beat = 0; beat < 20; beat += 0.25) {
        const { measure, fraction } = beatToMF44(beat);
        expect(mfToBeat44(measure, fraction)).toBeCloseTo(beat, 10);
      }
    });
  });

  // === Test Case 6: edge cases ===
  describe('edge cases', () => {
    const converter = createBeatConverter(new Map([[0, 0.75]])); // measure 0 is 3/4

    it('beat 0 → measure 0, fraction 0', () => {
      expect(converter.beatToMF(0)).toEqual({ measure: 0, fraction: 0 });
    });

    it('negative beat → measure 0, fraction 0', () => {
      expect(converter.beatToMF(-5)).toEqual({ measure: 0, fraction: 0 });
    });

    it('very large beat doesn\'t crash', () => {
      const result = converter.beatToMF(10000);
      expect(result.measure).toBeGreaterThan(0);
      expect(result.fraction).toBeGreaterThanOrEqual(0);
      expect(result.fraction).toBeLessThan(1);
    });
  });

  // === Test Case 7: cache works correctly ===
  describe('memoize cache', () => {
    it('repeated calls return same reference', () => {
      const converter = createBeatConverter(new Map([[1, 0.75]]));
      const r1 = converter.beatToMF(5.5);
      const r2 = converter.beatToMF(5.5);
      expect(r1).toBe(r2); // same object reference (cached)
    });

    it('clearCache invalidates cache', () => {
      const converter = createBeatConverter(new Map());
      const r1 = converter.beatToMF(4);
      converter.clearCache();
      const r2 = converter.beatToMF(4);
      expect(r1).toEqual(r2);
      expect(r1).not.toBe(r2); // different object after cache clear
    });
  });
});

describe('TimeSignatures.beatToMeasure (bms-core)', () => {
  // Direct test of the bms-core class
  it('fromMap creates correct TimeSignatures', () => {
    const { TimeSignatures } = require('@rhythm-archive/bms-core');
    const ts = TimeSignatures.fromMap(new Map([[1, 0.75]]));
    expect(ts.get(0)).toBe(1);
    expect(ts.get(1)).toBe(0.75);
    expect(ts.getBeats(1)).toBe(3);
  });

  it('beatToMeasure is inverse of measureToBeat', () => {
    const { TimeSignatures } = require('@rhythm-archive/bms-core');
    const ts = TimeSignatures.fromMap(new Map([
      [1, 0.75],
      [3, 1.25],
    ]));

    for (let m = 0; m < 6; m++) {
      for (const f of [0, 0.25, 0.5, 0.75]) {
        const beat = ts.measureToBeat(m, f);
        const result = ts.beatToMeasure(beat);
        expect(result.measure).toBe(m);
        expect(result.fraction).toBeCloseTo(f, 10);
      }
    }
  });

  it('toMap returns correct Map', () => {
    const { TimeSignatures } = require('@rhythm-archive/bms-core');
    const ts = new TimeSignatures();
    ts.set(1, 0.75);
    ts.set(3, 1.25);
    const map = ts.toMap();
    expect(map.get(1)).toBe(0.75);
    expect(map.get(3)).toBe(1.25);
    expect(map.size).toBe(2);
  });
});
