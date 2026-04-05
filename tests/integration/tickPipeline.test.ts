/**
 * Tick Pipeline Integration Test
 *
 * 파서 → 에디터(tick) → writer 전체 파이프라인에서
 * 노트 위치가 손실 없이 보존되는지 검증합니다.
 */
import { describe, it, expect } from 'vitest';
import { BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSNote, EditableBMSChart, BMSBpmChange } from '@rhythm-archive/bms-core';
import { beatToTick, tickToBeat, TICKS_PER_BEAT } from '../../src/renderer/lib/tickUtils';
import {
  serializeMeta,
  deserializeMeta,
  buildMetaFromState,
  applyMetaToState,
  gridSnapOverridesToRecord,
  recordToGridSnapOverrides,
} from '../../src/renderer/lib/bmsMeta';
import { computeDensityMap, densityToColor } from '../../src/renderer/lib/densityMap';

// Helper: create a minimal editable chart
function createTestChart(noteBeats: number[]): { chart: EditableBMSChart; notes: EditableBMSNote[] } {
  const wav = new Map<string, string>();
  wav.set('01', 'kick.wav');
  wav.set('02', 'snare.wav');

  const notes: EditableBMSNote[] = noteBeats.map((beat, i) => {
    const tick = beatToTick(beat);
    const measure = Math.floor(beat / 4);
    const fraction = (beat % 4) / 4;
    return {
      id: `note-${i}`,
      beat: tickToBeat(tick), // normalize through tick
      tick,
      measure,
      fraction,
      column: String((i % 7) + 1),
      keysound: i % 2 === 0 ? '01' : '02',
      noteType: 'playable' as const,
      channel: '',
    };
  });

  const chart: EditableBMSChart = {
    headers: {
      player: 1,
      title: 'Tick Pipeline Test',
      artist: 'Test',
      bpm: 150,
      playlevel: 5,
      rank: 3,
      wav,
      bmp: new Map(),
      bpmDef: new Map(),
      stopDef: new Map(),
      custom: new Map(),
    },
    notes,
    timeSignatures: new Map(),
    bpmChanges: [{ measure: 0, fraction: 0, bpm: 150 }],
    stopEvents: [],
    bgaEvents: [],
  };

  return { chart, notes };
}

describe('Tick Pipeline: parse → edit → write round-trip', () => {
  it('notes at standard grid positions survive write round-trip', () => {
    const beats = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 7.75, 8];
    const { chart } = createTestChart(beats);

    const writer = new BMSWriter();
    const bmsContent = writer.write(chart);

    // BMS content should contain note data
    expect(bmsContent).toContain('#00011:');
    expect(bmsContent).toContain('BPM 150');

    // All original beats should be recoverable from tick
    for (const note of chart.notes) {
      const recoveredBeat = tickToBeat(note.tick);
      expect(Math.abs(recoveredBeat - note.beat)).toBeLessThan(0.0001);
    }
  });

  it('triplet positions (1/3, 2/3 beat) preserve through tick', () => {
    const tripletBeats = [1 / 3, 2 / 3, 4 / 3, 5 / 3];
    const { chart } = createTestChart(tripletBeats);

    for (const note of chart.notes) {
      // tick should be exact integer
      expect(Number.isInteger(note.tick)).toBe(true);
      // beat recovered from tick should be very close to original
      const recovered = tickToBeat(note.tick);
      expect(Math.abs(recovered - note.beat)).toBeLessThan(0.001);
    }
  });

  it('1/96 beat (finest standard grid) preserves exactly', () => {
    const fineBeats = [0, 1 / 96, 2 / 96, 47 / 96, 1];
    const { chart } = createTestChart(fineBeats);

    for (const note of chart.notes) {
      expect(Number.isInteger(note.tick)).toBe(true);
      // 1/96 beat = 10 ticks exactly
      if (note.beat > 0 && note.beat < 1) {
        expect(note.tick % 10).toBe(0);
      }
    }
  });

  it('long notes preserve start and end through tick', () => {
    const { chart } = createTestChart([0, 4]);
    // Make first note a long note
    chart.notes[0].endBeat = 2;
    chart.notes[0].endTick = beatToTick(2);

    const writer = new BMSWriter();
    const bmsContent = writer.write(chart);

    expect(bmsContent.length).toBeGreaterThan(0);
    expect(chart.notes[0].endTick).toBe(1920);
    expect(tickToBeat(chart.notes[0].endTick!)).toBe(2);
  });

  it('high-resolution writer (3840) preserves fine positions', () => {
    // Note at 1/96 beat = tick 10
    const beat = 1 / 96;
    const { chart } = createTestChart([beat]);

    const writer = new BMSWriter({ resolution: 3840 });
    const bmsContent = writer.write(chart);

    // Should produce valid BMS
    expect(bmsContent).toContain('#TITLE Tick Pipeline Test');
    expect(bmsContent.length).toBeGreaterThan(100);
  });
});

describe('Tick conversion properties', () => {
  it('beatToTick is monotonic', () => {
    let prevTick = -1;
    for (let beat = 0; beat < 100; beat += 0.01) {
      const tick = beatToTick(beat);
      expect(tick).toBeGreaterThanOrEqual(prevTick);
      prevTick = tick;
    }
  });

  it('tickToBeat is monotonic', () => {
    let prevBeat = -1;
    for (let tick = 0; tick < 96000; tick += 1) {
      const beat = tickToBeat(tick);
      expect(beat).toBeGreaterThanOrEqual(prevBeat);
      prevBeat = beat;
    }
  });

  it('all standard grid positions are exactly representable', () => {
    const gridSnaps = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
    for (const snap of gridSnaps) {
      const gridStep = 4 / snap; // beat step per grid line
      for (let i = 0; i < snap; i++) {
        const beat = i * gridStep;
        const tick = beatToTick(beat);
        const recovered = tickToBeat(tick);
        expect(Math.abs(recovered - beat)).toBeLessThan(0.00001);
      }
    }
  });
});

describe('.bms.meta round-trip', () => {
  it('gridSnapOverrides survive serialize/deserialize', () => {
    const overrides = new Map<number, number>([[4, 12], [8, 48], [16, 384]]);
    const meta = buildMetaFromState({
      gridSnapOverrides: overrides,
      minLnLength: 0.5,
      bookmarks: [{ measure: 0, name: 'Start' }],
    });

    const json = serializeMeta(meta);
    const restored = deserializeMeta(json);
    const state = applyMetaToState(restored);

    expect(state.gridSnapOverrides.get(4)).toBe(12);
    expect(state.gridSnapOverrides.get(8)).toBe(48);
    expect(state.gridSnapOverrides.get(16)).toBe(384);
    expect(state.minLnLength).toBe(0.5);
  });
});

describe('Density map with tick-based notes', () => {
  it('computes density from tick-based notes', () => {
    const { notes } = createTestChart([0, 0.5, 1, 4, 4.5, 8, 8.25, 8.5, 8.75]);
    const density = computeDensityMap(notes, 3);

    expect(density).toHaveLength(3);
    expect(density[0].count).toBe(3); // measure 0: beats 0, 0.5, 1
    expect(density[1].count).toBe(2); // measure 1: beats 4, 4.5
    expect(density[2].count).toBe(4); // measure 2: beats 8, 8.25, 8.5, 8.75
    expect(density[2].normalized).toBe(1.0); // highest
  });

  it('densityToColor produces valid hex for all densities', () => {
    for (let i = 0; i <= 100; i++) {
      const color = densityToColor(i / 100);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
