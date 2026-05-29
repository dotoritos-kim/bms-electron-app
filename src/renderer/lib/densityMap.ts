/**
 * Note Density Map — per-measure note density calculation
 *
 * Utility for rendering a heatmap alongside the minimap/scrollbar.
 * Recomputes only when notes change via useMemo caching.
 */

import type { EditableBMSNote } from '@rhythm-archive/bms-core';

export interface MeasureDensity {
  measure: number;
  count: number;
  /** 0.0 ~ 1.0 normalized density (count / maxCount) */
  normalized: number;
}

/**
 * Computes note density per measure.
 *
 * @param notes array of notes
 * @param totalMeasures total number of measures
 * @returns array of per-measure density entries
 */
export function computeDensityMap(
  notes: EditableBMSNote[],
  totalMeasures: number,
): MeasureDensity[] {
  const counts = new Map<number, number>();

  for (const note of notes) {
    const m = note.measure;
    counts.set(m, (counts.get(m) || 0) + 1);
  }

  let maxCount = 1;
  for (const c of counts.values()) {
    if (c > maxCount) maxCount = c;
  }

  const result: MeasureDensity[] = [];
  for (let m = 0; m < totalMeasures; m++) {
    const count = counts.get(m) || 0;
    result.push({
      measure: m,
      count,
      normalized: count / maxCount,
    });
  }

  return result;
}

/**
 * Converts a density value to a color (green → yellow → red)
 *
 * @param normalized 0.0 ~ 1.0
 * @returns hex color string (#rrggbb)
 */
export function densityToColor(normalized: number): string {
  const clamped = Math.max(0, Math.min(1, normalized));
  if (clamped === 0) return '#1a1a2e';

  // Green (0.0) → Yellow (0.5) → Red (1.0)
  let r: number, g: number, b: number;
  if (clamped <= 0.5) {
    const t = clamped * 2; // 0 → 1
    r = Math.round(t * 255);
    g = 200;
    b = 50;
  } else {
    const t = (clamped - 0.5) * 2; // 0 → 1
    r = 255;
    g = Math.round(200 * (1 - t));
    b = 50;
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
