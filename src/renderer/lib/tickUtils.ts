/**
 * Tick Utilities — 960 ticks/beat 정수 기반 시간 표현
 *
 * BMS 에디터의 모든 시간 연산을 정수 tick으로 수행하여
 * 부동소수점 오차를 완전히 제거합니다.
 *
 * 해상도: 960 ticks/beat (MIDI 표준)
 * - 3840 ticks/measure (4/4 기준)
 * - 1/96 beat = 10 ticks (정확)
 * - 1/64 beat = 15 ticks (정확)
 * - 1/5 beat = 192 ticks (정확)
 *
 * 지원하는 모든 분할:
 * 1/2=480, 1/3=320, 1/4=240, 1/5=192, 1/6=160,
 * 1/8=120, 1/12=80, 1/16=60, 1/24=40, 1/32=30,
 * 1/48=20, 1/64=15, 1/96=10 ticks
 */

/** 1 beat = 960 ticks */
export const TICKS_PER_BEAT = 960;

/** 1 measure (4/4) = 3840 ticks */
export const TICKS_PER_MEASURE_4_4 = TICKS_PER_BEAT * 4;

// --- Beat ↔ Tick Conversion ---

/** Beat (float) → Tick (int). 가장 가까운 tick으로 반올림. */
export function beatToTick(beat: number): number {
  return Math.round(beat * TICKS_PER_BEAT);
}

/** Tick (int) → Beat (float). */
export function tickToBeat(tick: number): number {
  return tick / TICKS_PER_BEAT;
}

// --- Grid Snap ---

/**
 * Grid divisions per measure → ticks per grid line
 *
 * @param gridSnap divisions per measure (e.g., 4, 8, 16, 48, 96, 192, 384)
 * @param beatsInMeasure beats in the current measure (default: 4 for 4/4)
 * @returns ticks per grid step
 */
export function gridSnapToTicks(gridSnap: number, beatsInMeasure: number = 4): number {
  const ticksInMeasure = beatsInMeasure * TICKS_PER_BEAT;
  return Math.round(ticksInMeasure / gridSnap);
}

/**
 * Snap a tick to the nearest grid line.
 *
 * @param tick current tick position
 * @param gridTicks ticks per grid step (from gridSnapToTicks)
 * @returns snapped tick (always integer)
 */
export function snapTickToGrid(tick: number, gridTicks: number): number {
  if (gridTicks <= 0) return tick;
  return Math.round(tick / gridTicks) * gridTicks;
}

/**
 * Snap a beat to the nearest grid line using integer arithmetic.
 * Drop-in replacement for the old floating-point snapBeatToGrid.
 *
 * @param beat current beat position (float)
 * @param gridSnap divisions per measure
 * @param beatsInMeasure beats in the current measure (default: 4)
 * @returns snapped beat (float, but exactly representable from tick)
 */
export function snapBeatToGridPrecise(
  beat: number,
  gridSnap: number,
  beatsInMeasure: number = 4,
): number {
  const tick = beatToTick(beat);
  const gridTicks = gridSnapToTicks(gridSnap, beatsInMeasure);
  const snapped = snapTickToGrid(tick, gridTicks);
  return tickToBeat(snapped);
}

// --- Grid Snap Options ---

/**
 * Standard grid snap options (divisions per measure).
 * Includes triplet divisions (12, 24) and extended precision (128, 256, 384).
 */
export const EXTENDED_GRID_SNAP_OPTIONS = [
  4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384,
] as const;

export type ExtendedGridSnap = (typeof EXTENDED_GRID_SNAP_OPTIONS)[number] | number;

/**
 * Validate that a custom grid snap value can be exactly represented.
 *
 * @param gridSnap divisions per measure
 * @param beatsInMeasure beats in the current measure (default: 4)
 * @returns true if gridSnap produces integer tick values
 */
export function isValidGridSnap(gridSnap: number, beatsInMeasure: number = 4): boolean {
  if (gridSnap <= 0 || !Number.isInteger(gridSnap)) return false;
  const ticksInMeasure = beatsInMeasure * TICKS_PER_BEAT;
  return ticksInMeasure % gridSnap === 0;
}

/**
 * Get the nearest valid grid snap for a custom value.
 *
 * @param desired desired divisions per measure
 * @param beatsInMeasure beats in the current measure (default: 4)
 * @returns nearest valid grid snap that divides evenly into ticks
 */
export function nearestValidGridSnap(desired: number, beatsInMeasure: number = 4): number {
  if (isValidGridSnap(desired, beatsInMeasure)) return desired;
  const ticksInMeasure = beatsInMeasure * TICKS_PER_BEAT;
  // Find nearest divisor
  let best = 1;
  let bestDist = Math.abs(desired - 1);
  for (let d = 2; d <= ticksInMeasure; d++) {
    if (ticksInMeasure % d === 0) {
      const dist = Math.abs(desired - d);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
      if (d > desired + bestDist) break; // past useful range
    }
  }
  return best;
}

// --- On-Grid Check ---

/**
 * Check if a tick is exactly on the grid.
 *
 * @param tick position in ticks
 * @param gridTicks ticks per grid step
 * @returns true if tick is an exact multiple of gridTicks
 */
export function isOnGrid(tick: number, gridTicks: number): boolean {
  if (gridTicks <= 0) return true;
  return tick % gridTicks === 0;
}

/**
 * Check if a beat is on the grid (tick-based, no floating point issues).
 */
export function isBeatOnGrid(beat: number, gridSnap: number, beatsInMeasure: number = 4): boolean {
  const tick = beatToTick(beat);
  const gridTicks = gridSnapToTicks(gridSnap, beatsInMeasure);
  return isOnGrid(tick, gridTicks);
}

// --- Measure/Fraction ↔ Tick ---

/**
 * Tick → Measure/Fraction (4/4 only, fast path).
 */
export function tickToMeasureFraction44(tick: number): { measure: number; fraction: number } {
  const measure = Math.floor(tick / TICKS_PER_MEASURE_4_4);
  const remainder = tick - measure * TICKS_PER_MEASURE_4_4;
  const fraction = remainder / TICKS_PER_MEASURE_4_4;
  return { measure, fraction };
}

/**
 * Measure/Fraction → Tick (4/4 only, fast path).
 */
export function measureFractionToTick44(measure: number, fraction: number): number {
  return measure * TICKS_PER_MEASURE_4_4 + Math.round(fraction * TICKS_PER_MEASURE_4_4);
}

// --- BMS Resolution ---

/**
 * Convert tick to BMS fraction at a given resolution.
 *
 * @param tick position within a measure (0 to ticksInMeasure-1)
 * @param ticksInMeasure total ticks in this measure
 * @param maxResolution BMS output resolution (default: 3840 for high-res, 192 for standard)
 * @returns quantized fraction (0.0 to ~1.0)
 */
export function tickToBmsFraction(
  tick: number,
  ticksInMeasure: number,
  maxResolution: number = 3840,
): number {
  // Direct: tick / ticksInMeasure is already the fraction
  // But for BMS output, we need to quantize to maxResolution slots
  const slot = Math.round((tick / ticksInMeasure) * maxResolution);
  return slot / maxResolution;
}

/**
 * Find the minimum BMS resolution needed for a set of ticks within a measure.
 *
 * @param ticks array of tick positions within a measure
 * @param ticksInMeasure total ticks in this measure
 * @param maxResolution maximum allowed resolution
 * @returns minimum resolution that exactly represents all positions
 */
export function findMinBmsResolution(
  ticks: number[],
  ticksInMeasure: number,
  maxResolution: number = 3840,
): number {
  if (ticks.length === 0) return 1;

  // Convert ticks to slots at maxResolution
  const slots = ticks.map((t) => Math.round((t / ticksInMeasure) * maxResolution));

  // GCD of all slots and maxResolution
  let divisor = maxResolution;
  for (const s of slots) {
    if (s > 0) divisor = gcd(divisor, s);
  }
  return maxResolution / divisor;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// --- Display ---

/**
 * Format a grid snap value for display.
 * gridSnap 48 → "1/12" (48 divisions per 4-beat measure = 12 per beat)
 */
export function formatGridSnap(gridSnap: number, beatsInMeasure: number = 4): string {
  const perBeat = gridSnap / beatsInMeasure;
  if (Number.isInteger(perBeat)) {
    return `1/${perBeat}`;
  }
  return `${gridSnap}/m`;
}
