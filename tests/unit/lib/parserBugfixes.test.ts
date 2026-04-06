/**
 * Regression tests for BMS parser bug fixes (P1~P4)
 *
 * BUG-P1: Unmatched long notes silently dropped
 * BUG-P2: LNOBJ mode applied to invisible/landmine notes
 * BUG-P3: barLines calculation ignoring time signatures
 * BUG-P4: Zero-size measure causes infinite loop
 */
import { BMSParser, Notes, TimeSignatures, BMSChart, BMSWriter } from '@rhythm-archive/bms-core';
import type { BMSNote, EditableBMSNote } from '@rhythm-archive/bms-core';

// --- Helper ---

function parseBms(bmsString: string): { chart: BMSChart; notes: BMSNote[] } {
  const parser = new BMSParser();
  const chart = parser.compileString(bmsString);
  const notes = Notes.fromBMSChart(chart).all();
  return { chart, notes };
}

// ============================================================
// BUG-P1: Unmatched long notes — should NOT be silently dropped
// ============================================================
describe('BUG-P1: Unmatched long notes recovered as normal notes', () => {
  it('LN start (5x) without matching end (6x) is still present in output', () => {
    // Channel 51 = LN start for column 1, no matching end event
    const bms = `
#PLAYER 1
#BPM 120
#WAV01 kick.wav
#00151:01
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');

    // Before fix: 0 notes (silently dropped). After fix: 1 note recovered.
    expect(playableNotes.length).toBe(1);
    expect(playableNotes[0].keysound).toBe('01');
    expect(playableNotes[0].endBeat).toBeUndefined();
  });

  it('matched LN pair still works correctly', () => {
    // 51 start at beat 0, 51 end at beat 2
    const bms = `
#PLAYER 1
#BPM 120
#WAV01 kick.wav
#00151:0100
#00151:0001
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');

    expect(playableNotes.length).toBe(1);
    expect(playableNotes[0].endBeat).toBeDefined();
    expect(playableNotes[0].endBeat).toBeGreaterThan(playableNotes[0].beat);
  });

  it('multiple unmatched LNs across different channels are all recovered', () => {
    const bms = `
#PLAYER 1
#BPM 120
#WAV01 kick.wav
#WAV02 snare.wav
#00151:01
#00152:02
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');

    expect(playableNotes.length).toBe(2);
    // All recovered as normal notes (no endBeat)
    expect(playableNotes.every((n) => n.endBeat === undefined)).toBe(true);
  });

  it('mixed matched and unmatched LNs: matched has endBeat, unmatched does not', () => {
    // Channel 51: matched pair (start + end)
    // Channel 52: only start (unmatched)
    const bms = `
#PLAYER 1
#BPM 120
#WAV01 kick.wav
#WAV02 snare.wav
#00151:0100
#00151:0001
#00152:02
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');

    expect(playableNotes.length).toBe(2);
    const matched = playableNotes.find((n) => n.keysound === '01');
    const unmatched = playableNotes.find((n) => n.keysound === '02');
    expect(matched?.endBeat).toBeDefined();
    expect(unmatched?.endBeat).toBeUndefined();
  });
});

// ============================================================
// BUG-P2: LNOBJ mode — should only apply to playable notes
// ============================================================
describe('BUG-P2: LNOBJ only applies to playable notes', () => {
  it('LNOBJ marker on invisible channel does NOT create LN end', () => {
    // With LNOBJ mode, value 'ZZ' = LN end marker
    // Channel 31 = invisible for column 1
    // Before fix: invisible note with value ZZ would be treated as LNOBJ end
    const bms = `
#PLAYER 1
#BPM 120
#LNOBJ ZZ
#WAV01 kick.wav
#WAVZZ dummy.wav
#00111:01
#00131:ZZ
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');
    const invisibleNotes = notes.filter((n) => n.noteType === 'invisible');

    // Playable note should NOT have endBeat (invisible ZZ is not an LNOBJ trigger)
    expect(playableNotes.length).toBe(1);
    expect(playableNotes[0].endBeat).toBeUndefined();

    // Invisible note should exist as a normal note
    expect(invisibleNotes.length).toBe(1);
    expect(invisibleNotes[0].keysound).toBe('ZZ');
  });

  it('LNOBJ marker on playable channel correctly creates LN', () => {
    const bms = `
#PLAYER 1
#BPM 120
#LNOBJ ZZ
#WAV01 kick.wav
#WAVZZ dummy.wav
#00111:01000000
#00111:000000ZZ
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');

    // Should create one LN (start note + LNOBJ end)
    expect(playableNotes.length).toBe(1);
    expect(playableNotes[0].endBeat).toBeDefined();
    expect(playableNotes[0].endBeat).toBeGreaterThan(playableNotes[0].beat);
  });

  it('LNOBJ marker on landmine channel does NOT create LN end', () => {
    const bms = `
#PLAYER 1
#BPM 120
#LNOBJ ZZ
#WAV01 kick.wav
#WAVZZ dummy.wav
#00111:01
#001D1:ZZ
`.trim();

    const { notes } = parseBms(bms);
    const playableNotes = notes.filter((n) => n.noteType === 'playable');
    const landmineNotes = notes.filter((n) => n.noteType === 'landmine');

    expect(playableNotes.length).toBe(1);
    expect(playableNotes[0].endBeat).toBeUndefined();
    expect(landmineNotes.length).toBe(1);
  });
});

// ============================================================
// BUG-P4: TimeSignatures zero/negative size guard
// ============================================================
describe('BUG-P4: TimeSignatures rejects zero/negative measure sizes', () => {
  it('set(measure, 0) defaults to 1', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0);
    expect(ts.get(0)).toBe(1);
    expect(ts.getBeats(0)).toBe(4);
  });

  it('set(measure, -1) defaults to 1', () => {
    const ts = new TimeSignatures();
    ts.set(0, -1);
    expect(ts.get(0)).toBe(1);
  });

  it('set(measure, -0.5) defaults to 1', () => {
    const ts = new TimeSignatures();
    ts.set(2, -0.5);
    expect(ts.get(2)).toBe(1);
  });

  it('positive values are preserved', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0.75);
    expect(ts.get(0)).toBe(0.75);
    ts.set(1, 1.25);
    expect(ts.get(1)).toBe(1.25);
  });

  it('measureToBeat does not infinite loop with zero-guarded values', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0); // guarded to 1
    ts.set(1, -5); // guarded to 1
    // Should compute normally: measure 0 = 4 beats, measure 1 = 4 beats
    expect(ts.measureToBeat(2, 0)).toBe(8);
  });

  it('beatToMeasure does not divide by zero with zero-guarded values', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0); // guarded to 1
    const result = ts.beatToMeasure(2);
    expect(result.measure).toBe(0);
    expect(result.fraction).toBeCloseTo(0.5);
  });

  it('fromMap guards zero/negative values', () => {
    const map = new Map<number, number>([
      [0, 0],
      [1, -1],
      [2, 0.75],
    ]);
    const ts = TimeSignatures.fromMap(map);
    expect(ts.get(0)).toBe(1);
    expect(ts.get(1)).toBe(1);
    expect(ts.get(2)).toBe(0.75);
  });
});

// ============================================================
// BUG-P3: barLines — test via TimeSignatures.beatToMeasure
// (useLocalBmsFile is a React hook, so we test the underlying logic)
// ============================================================
describe('BUG-P3: beatToMeasure correctly handles non-4/4 time signatures', () => {
  it('3/4 time (size=0.75): beat 3 = end of measure 0', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0.75); // 3/4 = 3 beats per measure
    const result = ts.beatToMeasure(3);
    expect(result.measure).toBe(1);
    expect(result.fraction).toBeCloseTo(0);
  });

  it('3/4 time: beat 1.5 = halfway through measure 0', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0.75);
    const result = ts.beatToMeasure(1.5);
    expect(result.measure).toBe(0);
    expect(result.fraction).toBeCloseTo(0.5);
  });

  it('5/4 time (size=1.25): beat 5 = end of measure 0', () => {
    const ts = new TimeSignatures();
    ts.set(0, 1.25); // 5/4 = 5 beats per measure
    const result = ts.beatToMeasure(5);
    expect(result.measure).toBe(1);
    expect(result.fraction).toBeCloseTo(0);
  });

  it('mixed time: measure 0 = 3/4, measure 1 = 4/4', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0.75); // 3 beats
    // measure 1 defaults to 4 beats
    // beat 3 = start of measure 1, beat 5 = half of measure 1
    const result = ts.beatToMeasure(5);
    expect(result.measure).toBe(1);
    expect(result.fraction).toBeCloseTo(0.5);
  });

  it('Math.floor(beat/4) would give WRONG measure for 3/4 (the old bug)', () => {
    const ts = new TimeSignatures();
    ts.set(0, 0.75); // 3 beats per measure

    // A note at beat 3.5 is in measure 1 (3/4 measure = 3 beats, then 4/4 measure starts)
    const correct = ts.beatToMeasure(3.5);
    const oldBuggy = Math.floor(3.5 / 4); // = 0 (WRONG!)

    expect(correct.measure).toBe(1);
    expect(oldBuggy).toBe(0); // confirms the old code would be wrong
  });
});

// ============================================================
// BUG-WRITER-1: 64분 셋잇단(64th-note triplet) roundtrip 손실
// 원인: BMSWriter resolution=192 하드코딩 → tick 10 위치가 0 또는 1/192로 이동
// 수정: tick 기반 동적 해상도 계산 (findMinResolutionFromTicks)
// ============================================================
describe('BUG-WRITER-1: 64th-note triplet roundtrip fidelity', () => {
  const TICKS_PER_BEAT = 960;
  const TICKS_PER_MEASURE_44 = TICKS_PER_BEAT * 4; // 3840

  /**
   * 64분 셋잇단 = 64th note * (2/3) = 1/64 * 2/3 = 1/96 beat = 10 ticks
   * 4/4 마디에서 위치: tick 0, 10, 20, 30, ...
   */
  function makeTripletNotes(count: number): EditableBMSNote[] {
    const notes: EditableBMSNote[] = [];
    for (let i = 0; i < count; i++) {
      const tick = i * 10; // 10 ticks = 1/96 beat = 64th triplet interval
      const fraction = tick / TICKS_PER_MEASURE_44;
      notes.push({
        id: `note-${i}`,
        tick,
        endTick: undefined,
        measure: 0,
        fraction,
        beat: tick / TICKS_PER_BEAT,
        channel: '11',
        column: '1',
        keysound: (i + 1).toString(36).toUpperCase().padStart(2, '0'),
        noteType: 'playable',
      });
    }
    return notes;
  }

  function roundtripNotes(notes: EditableBMSNote[]): EditableBMSNote[] {
    const chart = {
      headers: {
        wav: new Map(notes.map((n) => [n.keysound, `sound_${n.keysound}.wav`])),
        bmp: new Map(),
        bpmDef: new Map(),
        stopDef: new Map(),
        custom: new Map(),
        bpm: 120,
        player: 1,
      },
      notes,
      timeSignatures: new Map<number, number>(),
      bpmChanges: [],
      stopEvents: [],
      bgaEvents: [],
    };
    const writer = new BMSWriter();
    const output = writer.write(chart);
    const parser = new BMSParser();
    const reparsed = parser.compileString(output);
    return BMSWriter.fromBMSChart(reparsed).notes;
  }

  it('tick=10 (1/96 beat) survives roundtrip without position shift', () => {
    const notes = makeTripletNotes(2); // tick 0, 10
    const reparsed = roundtripNotes(notes);

    expect(reparsed.length).toBe(2);
    // tick=0 노트 (비트 0.0)
    expect(reparsed[0].beat).toBeCloseTo(0, 5);
    // tick=10 노트 (비트 10/960 = 0.010416...)
    expect(reparsed[1].beat).toBeCloseTo(10 / TICKS_PER_BEAT, 5);
  });

  it('3개 연속 64분 셋잇단 (tick 0,10,20) 모두 정확한 위치 유지', () => {
    const notes = makeTripletNotes(3);
    const reparsed = roundtripNotes(notes);

    expect(reparsed.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      const expectedBeat = (i * 10) / TICKS_PER_BEAT;
      expect(reparsed[i].beat).toBeCloseTo(expectedBeat, 5);
    }
  });

  it('tick=10,20이 서로 다른 슬롯에 배치됨 (충돌 없음)', () => {
    const notes = makeTripletNotes(3);
    const reparsed = roundtripNotes(notes);

    // 세 노트 모두 서로 다른 beat에 위치해야 함
    const beats = reparsed.map((n) => n.beat);
    const uniqueBeats = new Set(beats.map((b) => Math.round(b * 100000)));
    expect(uniqueBeats.size).toBe(3);
  });

  it('일반 192 resolution 노트는 여전히 정확하게 roundtrip', () => {
    // tick 240 = 1/4 beat = 16분음표 → 192 분해능에서도 정확
    const notes: EditableBMSNote[] = [
      {
        id: 'n1',
        tick: 0,
        measure: 0,
        fraction: 0,
        beat: 0,
        channel: '11',
        column: '1',
        keysound: '01',
        noteType: 'playable',
      },
      {
        id: 'n2',
        tick: 240, // 1/4 beat
        measure: 0,
        fraction: 240 / TICKS_PER_MEASURE_44,
        beat: 240 / TICKS_PER_BEAT,
        channel: '11',
        column: '1',
        keysound: '02',
        noteType: 'playable',
      },
    ];
    const reparsed = roundtripNotes(notes);
    expect(reparsed.length).toBe(2);
    expect(reparsed[0].beat).toBeCloseTo(0, 5);
    expect(reparsed[1].beat).toBeCloseTo(0.25, 5);
  });

  it('BMS 출력에서 384 이상의 슬롯 수를 가진 채널 라인 생성됨', () => {
    // 64분 셋잇단 노트가 있으면 채널 데이터 해상도가 384 이상이어야 함
    const notes = makeTripletNotes(3);
    const chart = {
      headers: {
        wav: new Map(notes.map((n) => [n.keysound, `s.wav`])),
        bmp: new Map(),
        bpmDef: new Map(),
        stopDef: new Map(),
        custom: new Map(),
        bpm: 120,
        player: 1,
      },
      notes,
      timeSignatures: new Map<number, number>(),
      bpmChanges: [],
      stopEvents: [],
      bgaEvents: [],
    };
    const writer = new BMSWriter();
    const output = writer.write(chart);

    // #00011: 라인에서 채널 데이터 슬롯 수 확인
    const match = output.match(/#00011:([0-9A-Za-z]+)/);
    expect(match).not.toBeNull();
    const channelData = match![1];
    const slotCount = channelData.length / 2;
    // 192 이하면 버그, 384 이상이어야 함
    expect(slotCount).toBeGreaterThanOrEqual(384);
  });

  it('기존 resolution=192 동작은 tick 없는 노트에서 유지됨 (하위호환)', () => {
    // tick 필드 없는 레거시 노트 — fraction=0.5 (beat 2.0 in 4/4)
    const legacyNote = {
      id: 'legacy',
      tick: undefined as unknown as number,
      measure: 0,
      fraction: 0.5,
      beat: 2.0,
      channel: '11',
      column: '1',
      keysound: '01',
      noteType: 'playable' as const,
    };
    const chart = {
      headers: {
        wav: new Map([['01', 'kick.wav']]),
        bmp: new Map(),
        bpmDef: new Map(),
        stopDef: new Map(),
        custom: new Map(),
        bpm: 120,
        player: 1,
      },
      notes: [legacyNote],
      timeSignatures: new Map<number, number>(),
      bpmChanges: [],
      stopEvents: [],
      bgaEvents: [],
    };
    const writer = new BMSWriter();
    const output = writer.write(chart);
    const parser = new BMSParser();
    const reparsed = parser.compileString(output);
    const reparsedNotes = BMSWriter.fromBMSChart(reparsed).notes;
    expect(reparsedNotes[0].beat).toBeCloseTo(2.0, 5);
  });
});
