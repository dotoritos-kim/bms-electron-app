/**
 * Note Density Map — 마디별 노트 밀도 계산
 *
 * 미니맵/스크롤바 옆에 히트맵으로 표시하기 위한 유틸리티.
 * useMemo 캐시로 노트 변경 시에만 재계산.
 */

import type { EditableBMSNote } from '@rhythm-archive/bms-core';

export interface MeasureDensity {
  measure: number;
  count: number;
  /** 0.0 ~ 1.0 normalized density (count / maxCount) */
  normalized: number;
}

/**
 * 마디별 노트 밀도를 계산합니다.
 *
 * @param notes 노트 배열
 * @param totalMeasures 총 마디 수
 * @returns 마디별 밀도 배열
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
 * 밀도 값을 색상으로 변환 (green → yellow → red)
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
