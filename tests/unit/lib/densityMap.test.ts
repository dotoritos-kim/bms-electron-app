import { describe, it, expect } from 'vitest';
import { computeDensityMap, densityToColor } from '../../../src/renderer/lib/densityMap';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

const makeNote = (measure: number): EditableBMSNote => ({
  id: `n-${measure}-${Math.random()}`,
  beat: measure * 4,
  tick: measure * 3840,
  measure,
  fraction: 0,
  column: '1',
  keysound: '01',
  noteType: 'playable',
  channel: '11',
});

describe('computeDensityMap', () => {
  it('returns empty array for 0 measures', () => {
    expect(computeDensityMap([], 0)).toEqual([]);
  });

  it('returns zero density for measures with no notes', () => {
    const result = computeDensityMap([], 4);
    expect(result).toHaveLength(4);
    expect(result.every((d) => d.count === 0)).toBe(true);
    expect(result.every((d) => d.normalized === 0)).toBe(true);
  });

  it('counts notes per measure', () => {
    const notes = [
      makeNote(0), makeNote(0), makeNote(0),
      makeNote(1),
      makeNote(3), makeNote(3),
    ];
    const result = computeDensityMap(notes, 4);
    expect(result[0].count).toBe(3);
    expect(result[1].count).toBe(1);
    expect(result[2].count).toBe(0);
    expect(result[3].count).toBe(2);
  });

  it('normalizes to max count', () => {
    const notes = [
      makeNote(0), makeNote(0), makeNote(0), makeNote(0), // 4 notes
      makeNote(1), makeNote(1), // 2 notes
    ];
    const result = computeDensityMap(notes, 2);
    expect(result[0].normalized).toBe(1.0); // 4/4
    expect(result[1].normalized).toBe(0.5); // 2/4
  });
});

describe('densityToColor', () => {
  it('returns dark color for 0', () => {
    expect(densityToColor(0)).toBe('#1a1a2e');
  });

  it('returns green-ish for low density', () => {
    const color = densityToColor(0.1);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns red-ish for high density', () => {
    const color = densityToColor(1.0);
    expect(color.startsWith('#ff')).toBe(true);
  });

  it('clamps values outside 0-1', () => {
    expect(densityToColor(-1)).toBe('#1a1a2e');
    const color = densityToColor(2);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
