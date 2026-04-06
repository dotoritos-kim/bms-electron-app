/**
 * BMSWriter Snapshot Tests
 *
 * Captures exact BMSWriter output for regression detection.
 * Uses Vitest's toMatchSnapshot() -- snapshot files are auto-created
 * in __snapshots__/ on first run.
 */
import { BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSChart, BMSHeaderData } from '@rhythm-archive/bms-core';
import { IIDX_SP_REVERSE, IIDX_DP_REVERSE } from '@rhythm-archive/bms-core';

// ---------------------------------------------------------------------------
// Helper: create a base headers object
// ---------------------------------------------------------------------------

function makeHeaders(overrides: Partial<BMSHeaderData> = {}): BMSHeaderData {
  return {
    player: 1,
    genre: '',
    title: '',
    subtitle: '',
    artist: '',
    subartist: '',
    bpm: 120,
    playlevel: 1,
    rank: 3,
    total: undefined,
    difficulty: undefined,
    stagefile: '',
    banner: '',
    backbmp: '',
    lntype: undefined,
    lnobj: '',
    wav: new Map(),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(),
    ...overrides,
  };
}

function makeChart(overrides: Partial<EditableBMSChart> = {}): EditableBMSChart {
  return {
    headers: makeHeaders(),
    notes: [],
    timeSignatures: new Map(),
    bpmChanges: [],
    stopEvents: [],
    bgaEvents: [],
    ...overrides,
  };
}

const writer = new BMSWriter({ includeComments: false });

// ---------------------------------------------------------------------------
// Snapshot Tests
// ---------------------------------------------------------------------------

describe('BMSWriter Snapshots', () => {
  it('1. empty chart', () => {
    const chart = BMSWriter.createEmptyChart();
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('2. minimal 7K chart with 3 notes', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'snare.wav'], ['03', 'hat.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Minimal 7K', bpm: 150, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 1, measure: 0, fraction: 0.25, column: '3', keysound: '02', noteType: 'playable', channel: '13' },
        { id: 'n3', beat: 2, measure: 0, fraction: 0.5, column: '5', keysound: '03', noteType: 'playable', channel: '15' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('3. chart with inline BPM change (<=255)', () => {
    const wav = new Map([['01', 'kick.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Inline BPM', bpm: 120, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
      ],
      bpmChanges: [
        { measure: 0, fraction: 0.5, bpm: 180, extended: false },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('4. chart with extended BPM change (>255)', () => {
    const wav = new Map([['01', 'kick.wav']]);
    const bpmDef = new Map([['01', 300.5]]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Extended BPM', bpm: 130, wav, bpmDef }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
      ],
      bpmChanges: [
        { measure: 0, fraction: 0.5, bpm: 300.5, extended: true, bpmDefKey: '01' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('5. chart with STOP event', () => {
    const wav = new Map([['01', 'kick.wav']]);
    const stopDef = new Map([['01', 48]]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Stop Event', bpm: 140, wav, stopDef }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
      ],
      stopEvents: [
        { measure: 0, fraction: 0.5, duration: 48, stopDefKey: '01' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('6. chart with LN (endBeat)', () => {
    const wav = new Map([['01', 'hold.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Long Note', bpm: 120, lntype: 1, wav }),
      notes: [
        { id: 'n1', beat: 0, endBeat: 2, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('7. chart with time signature change', () => {
    const wav = new Map([['01', 'kick.wav']]);
    const timeSignatures = new Map([[1, 0.75]]); // 3/4 time in measure 1
    const chart = makeChart({
      headers: makeHeaders({ title: 'Time Sig', bpm: 120, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 4, measure: 1, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
      ],
      timeSignatures,
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('8. chart with BGM notes', () => {
    const wav = new Map([['01', 'bgm.wav'], ['02', 'bgm2.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'BGM Notes', bpm: 130, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: undefined, keysound: '01', noteType: 'bgm', channel: '01' },
        { id: 'n2', beat: 2, measure: 0, fraction: 0.5, column: undefined, keysound: '02', noteType: 'bgm', channel: '01' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('9. chart with invisible notes', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'ghost.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Invisible', bpm: 120, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 1, measure: 0, fraction: 0.25, column: '1', keysound: '02', noteType: 'invisible', channel: '31' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('10. chart with multiple keysounds (#WAV01-#WAV05)', () => {
    const wav = new Map([
      ['01', 'kick.wav'],
      ['02', 'snare.wav'],
      ['03', 'hat.wav'],
      ['04', 'clap.wav'],
      ['05', 'ride.wav'],
    ]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Multi WAV', bpm: 140, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 1, measure: 0, fraction: 0.25, column: '2', keysound: '02', noteType: 'playable', channel: '12' },
        { id: 'n3', beat: 2, measure: 0, fraction: 0.5, column: '3', keysound: '03', noteType: 'playable', channel: '13' },
        { id: 'n4', beat: 3, measure: 0, fraction: 0.75, column: '4', keysound: '04', noteType: 'playable', channel: '14' },
        { id: 'n5', beat: 0, measure: 1, fraction: 0, column: '5', keysound: '05', noteType: 'playable', channel: '15' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('11. chart with notes in multiple measures', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'snare.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Multi Measure', bpm: 150, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 2, measure: 0, fraction: 0.5, column: '2', keysound: '02', noteType: 'playable', channel: '12' },
        { id: 'n3', beat: 4, measure: 1, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n4', beat: 6, measure: 1, fraction: 0.5, column: '3', keysound: '02', noteType: 'playable', channel: '13' },
        { id: 'n5', beat: 8, measure: 2, fraction: 0, column: '5', keysound: '01', noteType: 'playable', channel: '15' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('12. dense chart (16 notes in one measure)', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'snare.wav']]);
    const notes = [];
    for (let i = 0; i < 16; i++) {
      notes.push({
        id: `n${i}`,
        beat: i * 0.25,
        measure: 0,
        fraction: i / 16,
        column: '1',
        keysound: i % 2 === 0 ? '01' : '02',
        noteType: 'playable' as const,
        channel: '11',
      });
    }
    const chart = makeChart({
      headers: makeHeaders({ title: 'Dense Chart', bpm: 160, wav }),
      notes,
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('13. chart with mixed note types (playable + bgm + invisible)', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'bgm.wav'], ['03', 'ghost.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Mixed Types', bpm: 130, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 1, measure: 0, fraction: 0.25, column: undefined, keysound: '02', noteType: 'bgm', channel: '01' },
        { id: 'n3', beat: 2, measure: 0, fraction: 0.5, column: '3', keysound: '03', noteType: 'invisible', channel: '33' },
        { id: 'n4', beat: 3, measure: 0, fraction: 0.75, column: '5', keysound: '01', noteType: 'playable', channel: '15' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });

  it('14. 14K DP chart (PLAYER 2)', () => {
    const wav = new Map([['01', 'kick.wav'], ['02', 'snare.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'DP Chart', player: 2, bpm: 150, wav }),
      notes: [
        // 1P side
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 1, measure: 0, fraction: 0.25, column: '3', keysound: '02', noteType: 'playable', channel: '13' },
        // 2P side
        { id: 'n3', beat: 0, measure: 0, fraction: 0, column: '8', keysound: '01', noteType: 'playable', channel: '21' },
        { id: 'n4', beat: 2, measure: 0, fraction: 0.5, column: '10', keysound: '02', noteType: 'playable', channel: '23' },
      ],
    });
    const output = writer.write(chart, IIDX_DP_REVERSE);
    expect(output).toMatchSnapshot();
  });

  it('15. chart with landmine notes', () => {
    const wav = new Map([['01', 'kick.wav']]);
    const chart = makeChart({
      headers: makeHeaders({ title: 'Landmine', bpm: 120, wav }),
      notes: [
        { id: 'n1', beat: 0, measure: 0, fraction: 0, column: '1', keysound: '01', noteType: 'playable', channel: '11' },
        { id: 'n2', beat: 2, measure: 0, fraction: 0.5, column: '3', keysound: '01', noteType: 'landmine', channel: 'D3' },
      ],
    });
    const output = writer.write(chart);
    expect(output).toMatchSnapshot();
  });
});
