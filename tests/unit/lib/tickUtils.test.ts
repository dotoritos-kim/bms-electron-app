import { describe, it, expect } from 'vitest';
import {
  TICKS_PER_BEAT,
  TICKS_PER_MEASURE_4_4,
  beatToTick,
  tickToBeat,
  gridSnapToTicks,
  snapTickToGrid,
  snapBeatToGridPrecise,
  isValidGridSnap,
  nearestValidGridSnap,
  isOnGrid,
  isBeatOnGrid,
  tickToMeasureFraction44,
  measureFractionToTick44,
  tickToBmsFraction,
  findMinBmsResolution,
  formatGridSnap,
  EXTENDED_GRID_SNAP_OPTIONS,
} from '../../../src/renderer/lib/tickUtils';

describe('tickUtils constants', () => {
  it('TICKS_PER_BEAT is 960', () => {
    expect(TICKS_PER_BEAT).toBe(960);
  });

  it('TICKS_PER_MEASURE_4_4 is 3840', () => {
    expect(TICKS_PER_MEASURE_4_4).toBe(3840);
  });
});

describe('beatToTick / tickToBeat', () => {
  it('converts beat 0 to tick 0', () => {
    expect(beatToTick(0)).toBe(0);
  });

  it('converts beat 1 to tick 960', () => {
    expect(beatToTick(1)).toBe(960);
  });

  it('converts beat 4 to tick 3840', () => {
    expect(beatToTick(4)).toBe(3840);
  });

  it('converts fractional beats correctly', () => {
    expect(beatToTick(0.5)).toBe(480);
    expect(beatToTick(0.25)).toBe(240);
    expect(beatToTick(1.0 / 3)).toBe(320);
    expect(beatToTick(1.0 / 6)).toBe(160);
  });

  it('round-trips beat → tick → beat', () => {
    const beats = [0, 0.5, 1, 1.25, 2.5, 3.75, 4, 7.125];
    for (const b of beats) {
      expect(tickToBeat(beatToTick(b))).toBeCloseTo(b, 10);
    }
  });

  it('tickToBeat produces exact values for grid-aligned ticks', () => {
    expect(tickToBeat(480)).toBe(0.5);
    expect(tickToBeat(240)).toBe(0.25);
    expect(tickToBeat(960)).toBe(1);
    expect(tickToBeat(0)).toBe(0);
  });
});

describe('gridSnapToTicks', () => {
  it('gridSnap 4 → 960 ticks (1 beat per grid)', () => {
    expect(gridSnapToTicks(4)).toBe(960);
  });

  it('gridSnap 8 → 480 ticks (1/2 beat)', () => {
    expect(gridSnapToTicks(8)).toBe(480);
  });

  it('gridSnap 16 → 240 ticks (1/4 beat)', () => {
    expect(gridSnapToTicks(16)).toBe(240);
  });

  it('gridSnap 12 → 320 ticks (1/3 beat, triplet)', () => {
    expect(gridSnapToTicks(12)).toBe(320);
  });

  it('gridSnap 24 → 160 ticks (1/6 beat)', () => {
    expect(gridSnapToTicks(24)).toBe(160);
  });

  it('gridSnap 48 → 80 ticks (1/12 beat)', () => {
    expect(gridSnapToTicks(48)).toBe(80);
  });

  it('gridSnap 96 → 40 ticks (1/24 beat)', () => {
    expect(gridSnapToTicks(96)).toBe(40);
  });

  it('gridSnap 192 → 20 ticks (1/48 beat)', () => {
    expect(gridSnapToTicks(192)).toBe(20);
  });

  it('gridSnap 384 → 10 ticks (1/96 beat)', () => {
    expect(gridSnapToTicks(384)).toBe(10);
  });

  it('gridSnap 128 → 30 ticks (1/32 beat)', () => {
    expect(gridSnapToTicks(128)).toBe(30);
  });

  it('gridSnap 256 → 15 ticks (1/64 beat)', () => {
    expect(gridSnapToTicks(256)).toBe(15);
  });

  it('handles non-4/4 time signatures', () => {
    // 3/4: 3 beats per measure = 2880 ticks/measure
    expect(gridSnapToTicks(3, 3)).toBe(960); // 3 divisions per 3 beats = 1 per beat
    expect(gridSnapToTicks(6, 3)).toBe(480); // 1/2 beat
    expect(gridSnapToTicks(12, 3)).toBe(240); // 1/4 beat
  });

  it('all standard grid snap options produce integer ticks', () => {
    for (const snap of EXTENDED_GRID_SNAP_OPTIONS) {
      const ticks = gridSnapToTicks(snap);
      expect(Number.isInteger(ticks)).toBe(true);
      expect(ticks).toBeGreaterThan(0);
    }
  });
});

describe('snapTickToGrid', () => {
  it('snaps to nearest grid line', () => {
    const gridTicks = 240; // 1/4 beat
    expect(snapTickToGrid(0, gridTicks)).toBe(0);
    expect(snapTickToGrid(119, gridTicks)).toBe(0);
    expect(snapTickToGrid(120, gridTicks)).toBe(240);  // exactly half rounds up (Math.round)
    expect(snapTickToGrid(121, gridTicks)).toBe(240);
    expect(snapTickToGrid(240, gridTicks)).toBe(240);
    expect(snapTickToGrid(360, gridTicks)).toBe(480);
  });

  it('returns exact value when already on grid', () => {
    const gridTicks = 80; // 1/12 beat
    for (let tick = 0; tick <= 3840; tick += 80) {
      expect(snapTickToGrid(tick, gridTicks)).toBe(tick);
    }
  });
});

describe('snapBeatToGridPrecise', () => {
  it('eliminates floating point errors that plagued the old function', () => {
    // Old bug: gridSnap=48, beat=1.0
    // Old: 1.0 / 0.08333... = 11.9999... → round → 12 → 12 * 0.08333 = 0.99999...
    // New: tick-based, no error
    const result = snapBeatToGridPrecise(1.0, 48);
    expect(result).toBe(1.0);
  });

  it('correctly snaps gridSnap=96, beat=2.5', () => {
    // Old bug: 2.5 / 0.04166... = 59.99999... → round → 60 → 60 * 0.04166 = 2.49999...
    const result = snapBeatToGridPrecise(2.5, 96);
    expect(result).toBe(2.5);
  });

  it('snaps to nearest 1/4 beat', () => {
    expect(snapBeatToGridPrecise(0.37, 16)).toBe(0.25);
    expect(snapBeatToGridPrecise(0.38, 16)).toBe(0.5);
  });

  it('snaps to nearest 1/3 beat (triplet)', () => {
    const result = snapBeatToGridPrecise(0.3, 12);
    expect(result).toBeCloseTo(1.0 / 3, 10);
  });

  it('handles beat 0', () => {
    expect(snapBeatToGridPrecise(0, 16)).toBe(0);
  });

  it('handles large beats', () => {
    expect(snapBeatToGridPrecise(100.0, 16)).toBe(100.0);
  });
});

describe('isValidGridSnap', () => {
  it('returns true for all standard options', () => {
    for (const snap of EXTENDED_GRID_SNAP_OPTIONS) {
      expect(isValidGridSnap(snap)).toBe(true);
    }
  });

  it('returns false for invalid values', () => {
    expect(isValidGridSnap(0)).toBe(false);
    expect(isValidGridSnap(-1)).toBe(false);
    expect(isValidGridSnap(1.5)).toBe(false);
    expect(isValidGridSnap(7)).toBe(false); // 3840/7 = 548.57... not integer
  });

  it('returns true for custom valid values', () => {
    expect(isValidGridSnap(1)).toBe(true);   // 1 division per measure = whole measure
    expect(isValidGridSnap(2)).toBe(true);   // half measure
    expect(isValidGridSnap(3)).toBe(true);   // 3 per measure
    expect(isValidGridSnap(5)).toBe(true);   // 5 per measure (3840/5=768)
    expect(isValidGridSnap(6)).toBe(true);
    expect(isValidGridSnap(10)).toBe(true);  // 3840/10=384
    expect(isValidGridSnap(20)).toBe(true);  // 3840/20=192
  });

  it('handles non-4/4 time signatures', () => {
    // 3/4: 2880 ticks per measure
    expect(isValidGridSnap(3, 3)).toBe(true);   // 2880/3=960
    expect(isValidGridSnap(6, 3)).toBe(true);   // 2880/6=480
    expect(isValidGridSnap(7, 3)).toBe(false);  // 2880/7=411.4...
  });
});

describe('nearestValidGridSnap', () => {
  it('returns same value for valid snaps', () => {
    expect(nearestValidGridSnap(16)).toBe(16);
    expect(nearestValidGridSnap(48)).toBe(48);
    expect(nearestValidGridSnap(384)).toBe(384);
  });

  it('finds nearest valid for invalid values', () => {
    const result = nearestValidGridSnap(7);
    expect(isValidGridSnap(result)).toBe(true);
    // 7 is not valid, nearest valid divisors of 3840 around 7 are 6 and 8
    expect([6, 8]).toContain(result);
  });
});

describe('isOnGrid / isBeatOnGrid', () => {
  it('tick on grid returns true', () => {
    expect(isOnGrid(0, 240)).toBe(true);
    expect(isOnGrid(240, 240)).toBe(true);
    expect(isOnGrid(480, 240)).toBe(true);
  });

  it('tick off grid returns false', () => {
    expect(isOnGrid(1, 240)).toBe(false);
    expect(isOnGrid(239, 240)).toBe(false);
    expect(isOnGrid(241, 240)).toBe(false);
  });

  it('isBeatOnGrid handles 1/4 beat grid', () => {
    expect(isBeatOnGrid(0, 16)).toBe(true);
    expect(isBeatOnGrid(0.25, 16)).toBe(true);
    expect(isBeatOnGrid(0.5, 16)).toBe(true);
    expect(isBeatOnGrid(1.0, 16)).toBe(true);
  });

  it('isBeatOnGrid detects off-grid beats', () => {
    expect(isBeatOnGrid(0.1, 16)).toBe(false);
    expect(isBeatOnGrid(0.3, 16)).toBe(false);
  });

  it('isBeatOnGrid handles triplets', () => {
    expect(isBeatOnGrid(1.0 / 3, 12)).toBe(true);
    expect(isBeatOnGrid(2.0 / 3, 12)).toBe(true);
  });
});

describe('tickToMeasureFraction44 / measureFractionToTick44', () => {
  it('tick 0 → measure 0, fraction 0', () => {
    expect(tickToMeasureFraction44(0)).toEqual({ measure: 0, fraction: 0 });
  });

  it('tick 3840 → measure 1, fraction 0', () => {
    expect(tickToMeasureFraction44(3840)).toEqual({ measure: 1, fraction: 0 });
  });

  it('tick 1920 → measure 0, fraction 0.5', () => {
    expect(tickToMeasureFraction44(1920)).toEqual({ measure: 0, fraction: 0.5 });
  });

  it('round-trips measure/fraction → tick → measure/fraction', () => {
    const cases = [
      { measure: 0, fraction: 0 },
      { measure: 0, fraction: 0.25 },
      { measure: 0, fraction: 0.5 },
      { measure: 1, fraction: 0 },
      { measure: 5, fraction: 0.75 },
      { measure: 10, fraction: 0 },
    ];
    for (const { measure, fraction } of cases) {
      const tick = measureFractionToTick44(measure, fraction);
      const result = tickToMeasureFraction44(tick);
      expect(result.measure).toBe(measure);
      expect(result.fraction).toBeCloseTo(fraction, 10);
    }
  });
});

describe('tickToBmsFraction', () => {
  it('converts tick 0 to fraction 0', () => {
    expect(tickToBmsFraction(0, 3840)).toBe(0);
  });

  it('converts tick at half measure to fraction 0.5', () => {
    expect(tickToBmsFraction(1920, 3840)).toBeCloseTo(0.5, 10);
  });

  it('quantizes to standard resolution (192)', () => {
    // 10 ticks in a 3840-tick measure → fraction = 10/3840 ≈ 0.002604
    // At resolution 192: round(0.002604 * 192) = round(0.5) = 1 → 1/192
    const result = tickToBmsFraction(10, 3840, 192);
    expect(result).toBeCloseTo(1 / 192, 10);
  });

  it('quantizes to high resolution (3840)', () => {
    // 10 ticks → slot = round(10/3840 * 3840) = 10 → 10/3840
    const result = tickToBmsFraction(10, 3840, 3840);
    expect(result).toBeCloseTo(10 / 3840, 10);
  });
});

describe('findMinBmsResolution', () => {
  it('returns 1 for empty array', () => {
    expect(findMinBmsResolution([], 3840)).toBe(1);
  });

  it('returns 4 for quarter-note positions', () => {
    // Ticks at 0, 960, 1920, 2880 → slots at 0, 960, 1920, 2880 (at res 3840)
    const result = findMinBmsResolution([960, 1920, 2880], 3840);
    expect(result).toBe(4);
  });

  it('returns 192 for standard BMS positions', () => {
    // Tick at 20 in a 3840-tick measure → slot = round(20/3840 * 192) = 1
    // minRes = 192 / gcd(192, 1) = 192
    const result = findMinBmsResolution([20], 3840, 192);
    expect(result).toBe(192);
  });

  it('returns 12 for triplet positions', () => {
    // Tick 320 → 1/3 beat → slot = round(320/3840 * 3840) = 320
    // gcd(3840, 320) = 320
    // minRes = 3840 / 320 = 12
    const result = findMinBmsResolution([320], 3840);
    expect(result).toBe(12);
  });
});

describe('formatGridSnap', () => {
  it('formats standard snaps', () => {
    expect(formatGridSnap(4)).toBe('1/1');
    expect(formatGridSnap(8)).toBe('1/2');
    expect(formatGridSnap(16)).toBe('1/4');
    expect(formatGridSnap(12)).toBe('1/3');
    expect(formatGridSnap(24)).toBe('1/6');
    expect(formatGridSnap(32)).toBe('1/8');
    expect(formatGridSnap(48)).toBe('1/12');
    expect(formatGridSnap(64)).toBe('1/16');
    expect(formatGridSnap(96)).toBe('1/24');
    expect(formatGridSnap(192)).toBe('1/48');
    expect(formatGridSnap(384)).toBe('1/96');
  });

  it('formats non-4/4 time', () => {
    // 3/4 time, 12 divisions per measure = 4 per beat
    expect(formatGridSnap(12, 3)).toBe('1/4');
  });

  it('formats non-integer per-beat as divisions/measure', () => {
    // 5 divisions per 4 beats = 1.25 per beat
    expect(formatGridSnap(5)).toBe('5/m');
  });
});

describe('floating point precision guarantee', () => {
  it('all standard grid snaps produce exact integer ticks', () => {
    const allSnaps = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
    for (const snap of allSnaps) {
      const ticks = gridSnapToTicks(snap);
      expect(Number.isInteger(ticks)).toBe(true);

      // Verify that snapping a beat on this grid round-trips exactly
      for (let i = 0; i < snap * 4; i++) {
        const beat = (i * 4) / snap;
        const tick = beatToTick(beat);
        const snapped = snapTickToGrid(tick, ticks);
        expect(snapped).toBe(tick);
      }
    }
  });

  it('snap + tickToBeat produces stable values (no drift)', () => {
    // Simulate 100 sequential snap operations
    let tick = 0;
    const gridTicks = gridSnapToTicks(48); // 1/12 beat = 80 ticks
    for (let i = 0; i < 100; i++) {
      tick += gridTicks;
      const beat = tickToBeat(tick);
      const reTick = beatToTick(beat);
      expect(reTick).toBe(tick);
    }
  });
});
