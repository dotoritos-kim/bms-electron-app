/**
 * Beat ↔ Measure/Fraction conversion utilities
 *
 * TimeSignatures-aware: correctly converts beat ↔ measure/fraction
 * for non-standard time signatures (3/4, 5/4, 7/8, etc.).
 *
 * Results are cached to guarantee O(1) performance on repeated calls.
 */

import { TimeSignatures } from '@rhythm-archive/bms-core';

export interface MeasureFraction {
  measure: number;
  fraction: number;
}

/**
 * Creates a TimeSignatures-aware beat converter.
 *
 * The returned object provides beatToMF / mfToBeat methods
 * and caches results internally.
 *
 * @param timeSignatures Editor time signature map in Map<number, number> format
 */
export function createBeatConverter(timeSignatures: Map<number, number>) {
  const ts = TimeSignatures.fromMap(timeSignatures);

  // Memoize cache: beat (6-decimal key) → { measure, fraction }
  const beatToMFCache = new Map<string, MeasureFraction>();
  // Memoize cache: "measure:fraction" → beat
  const mfToBeatCache = new Map<string, number>();

  /**
   * Beat → { measure, fraction } conversion (cached)
   */
  function beatToMF(beat: number): MeasureFraction {
    const key = beat.toFixed(6);
    const cached = beatToMFCache.get(key);
    if (cached) return cached;

    const result = ts.beatToMeasure(beat);
    beatToMFCache.set(key, result);
    return result;
  }

  /**
   * { measure, fraction } → Beat conversion (cached)
   */
  function mfToBeat(measure: number, fraction: number): number {
    const key = `${measure}:${fraction.toFixed(6)}`;
    const cached = mfToBeatCache.get(key);
    if (cached !== undefined) return cached;

    const result = ts.measureToBeat(measure, fraction);
    mfToBeatCache.set(key, result);
    return result;
  }

  /**
   * Returns the number of beats in the given measure.
   * 4/4 → 4, 3/4 → 3, 5/4 → 5
   */
  function getBeatsInMeasure(measure: number): number {
    return ts.getBeats(measure);
  }

  /**
   * Clears the internal caches.
   * Normally not needed manually — when timeSignatures change, create a new converter instead.
   */
  function clearCache() {
    beatToMFCache.clear();
    mfToBeatCache.clear();
  }

  return {
    beatToMF,
    mfToBeat,
    getBeatsInMeasure,
    clearCache,
    /** Access to the internal TimeSignatures instance (for testing) */
    _ts: ts,
  };
}

export type BeatConverter = ReturnType<typeof createBeatConverter>;

/**
 * Fast 4/4-only conversion (fallback when no timeSignatures are available)
 */
export function beatToMF44(beat: number): MeasureFraction {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
}

/**
 * Fast 4/4-only inverse conversion (fallback)
 */
export function mfToBeat44(measure: number, fraction: number): number {
  return measure * 4 + fraction * 4;
}
