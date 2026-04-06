/**
 * Beat ↔ Measure/Fraction 변환 유틸리티
 *
 * TimeSignatures를 인식하여 비표준 박자(3/4, 5/4, 7/8 등)에서도
 * 정확한 beat ↔ measure/fraction 변환을 수행합니다.
 *
 * 캐시를 통해 반복 호출 시 O(1) 성능을 보장합니다.
 */

import { TimeSignatures } from '@rhythm-archive/bms-core';

export interface MeasureFraction {
  measure: number;
  fraction: number;
}

/**
 * TimeSignatures-aware beat 변환기를 생성합니다.
 *
 * 반환된 객체는 beatToMF / mfToBeat 메서드를 제공하며,
 * 내부적으로 결과를 캐싱합니다.
 *
 * @param timeSignatures 에디터의 Map<number, number> 형식 박자표
 */
export function createBeatConverter(timeSignatures: Map<number, number>) {
  const ts = TimeSignatures.fromMap(timeSignatures);

  // Memoize cache: beat (4자리 소수점 키) → { measure, fraction }
  const beatToMFCache = new Map<string, MeasureFraction>();
  // Memoize cache: "measure:fraction" → beat
  const mfToBeatCache = new Map<string, number>();

  /**
   * Beat → { measure, fraction } 변환 (캐시 적용)
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
   * { measure, fraction } → Beat 변환 (캐시 적용)
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
   * 특정 마디의 비트 수를 반환합니다.
   * 4/4 → 4, 3/4 → 3, 5/4 → 5
   */
  function getBeatsInMeasure(measure: number): number {
    return ts.getBeats(measure);
  }

  /**
   * 캐시를 초기화합니다.
   * timeSignatures가 변경되면 새 converter를 생성하므로 수동 초기화는 보통 불필요합니다.
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
    /** 내부 TimeSignatures 인스턴스 접근 (테스트용) */
    _ts: ts,
  };
}

export type BeatConverter = ReturnType<typeof createBeatConverter>;

/**
 * 4/4 전용 빠른 변환 (fallback / timeSignatures 없을 때)
 */
export function beatToMF44(beat: number): MeasureFraction {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return { measure, fraction };
}

/**
 * 4/4 전용 역변환 (fallback)
 */
export function mfToBeat44(measure: number, fraction: number): number {
  return measure * 4 + fraction * 4;
}
