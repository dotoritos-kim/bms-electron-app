/**
 * Editing must not knock notes off their grid. Positions the 960-ticks-per-beat
 * grid cannot hold (septuplets, measures of odd length) keep their exact
 * measure/fraction through moves, measure insert/delete, paste and time
 * signature changes, and are saved on their own line resolution.
 */
import { BMSParser, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { useEditorStore } from '../../src/renderer/stores/editorStore';
import { isEditableNote } from '../../src/renderer/hooks/useLocalBmsFile';

const HEAD = `#PLAYER 1
#BPM 150
#LNTYPE 1
#WAV01 a.wav
#WAV02 b.wav
`;
const SEPTUPLETS = '01010101010101';

/** Loads a chart into the store the way the editor route does. */
function load(body: string): void {
  const parser = new BMSParser();
  const chart = parser.compileString(HEAD + body);
  const ec = BMSWriter.fromBMSChart(chart);
  const notes = parser.getNotes()!.all().filter(isEditableNote).map((n, i) => ({
    id: `note-${i}`, beat: n.beat, tick: Math.round(n.beat * 960), column: n.column || '',
    noteType: n.noteType || 'playable', keysound: (n.keysound || '00').toUpperCase(),
    endBeat: n.endBeat, endTick: n.endBeat !== undefined ? Math.round(n.endBeat * 960) : undefined,
    endMeasure: n.endMeasure, endFraction: n.endFraction,
    measure: n.measure, fraction: n.fraction, channel: n.channel || '',
  })) as EditableBMSNote[];
  const s = useEditorStore.getState();
  s.reset();
  s.initFromChart(ec, notes, notes.length);
}

function save(): string {
  return new BMSWriter({ lnMode: 'channel' }).write(useEditorStore.getState().savableChart()!);
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => /^#\d{5}:/.test(l));
}

const store = () => useEditorStore.getState();
const allIds = () => store().notes.map((n) => n.id);

describe('Off-grid positions survive editing', () => {
  it('insert measure shifts septuplets without rounding them', () => {
    load(`#00211:${SEPTUPLETS}\n#00311:${SEPTUPLETS}\n`);
    store().insertMeasure(0);
    expect(lines(save())).toEqual([`#00311:${SEPTUPLETS}`, `#00411:${SEPTUPLETS}`]);
  });

  it('delete measure shifts septuplets without rounding them', () => {
    load(`#00111:01\n#00311:${SEPTUPLETS}\n`);
    store().deleteMeasure(1);
    expect(lines(save())).toEqual([`#00211:${SEPTUPLETS}`]);
  });

  it('moving septuplets by a measure keeps them septuplets', () => {
    load(`#00211:${SEPTUPLETS}\n`);
    store().moveNotes(allIds(), { beat: 4 }, []);
    expect(lines(save())).toEqual([`#00311:${SEPTUPLETS}`]);
  });

  it('moving a septuplet by a 1/16 step lands between both grids exactly', () => {
    load('#00211:00010000000000\n');
    store().moveNotes(allIds(), { beat: 0.25 }, []);
    // 1/7 + 1/16 = 23/112
    const expected = Array.from({ length: 112 }, (_, i) => (i === 23 ? '01' : '00')).join('');
    expect(lines(save())).toEqual([`#00211:${expected}`]);
  });

  it('pasting septuplets keeps them septuplets', () => {
    load(`#00211:${SEPTUPLETS}\n`);
    store().selectNotes(allIds());
    store().copy();
    store().setCurrentBeat(16);
    store().paste();
    expect(lines(save())).toEqual([`#00211:${SEPTUPLETS}`, `#00411:${SEPTUPLETS}`]);
  });

  it('a long note ending on a septuplet keeps its end when moved', () => {
    load('#00251:01000000000000\n#00351:00010000000000\n');
    store().moveNotes(allIds(), { beat: 4 }, []);
    expect(lines(save())).toEqual(['#00351:01', '#00451:00010000000000']);
  });

  it('a time signature change keeps septuplets in time', () => {
    load(`#00211:${SEPTUPLETS}
`);
    store().setTimeSignature(0, 0.75);
    // Measure 0 is now 3 beats, so measure 2 starts on beat 7. The septuplets
    // (beats 8 + 4k/7) are 1/4 + k/7 into it; the last one spills 3/28 into measure 3.
    const slots = (n: number, ...at: number[]) => Array.from({ length: n }, (_, i) => (at.includes(i) ? '01' : '00')).join('');
    expect(lines(save())).toEqual([
      '#00002:0.75',
      `#00211:${slots(28, 7, 11, 15, 19, 23, 27)}`,
      `#00311:${slots(28, 3)}`,
    ]);
  });
});

describe('Notes placed in measures of another length', () => {
  it('a note on the drawn 3/4 grid is saved on that grid', () => {
    load('#00002:0.75\n#00111:01\n');
    // Grid 16 in a 3-beat measure: line 5 is at 5 * 3/16 beats
    store().addNote({ beat: (5 * 3) / 16, column: store().notes[0].column, noteType: 'playable', keysound: '02', measure: 0, fraction: 0, channel: '' } as never);
    const expected = Array.from({ length: 16 }, (_, i) => (i === 5 ? '02' : '00')).join('');
    expect(lines(save())).toContain(`#00011:${expected}`);
  });

  it('quantize snaps to the drawn grid of a 3/4 measure', () => {
    load('#00002:0.75\n#00111:01\n');
    const column = store().notes[0].column;
    store().addNote({ beat: 1.0, column, noteType: 'playable', keysound: '02', measure: 0, fraction: 0, channel: '' } as never);
    const added = store().notes.find((n) => n.keysound === '02')!;
    store().selectNotes([added.id]);
    store().quantizeNotes();
    // Nearest of the 16 lines (every 0.1875 beat) to beat 1.0 is line 5 (0.9375)
    const expected = Array.from({ length: 16 }, (_, i) => (i === 5 ? '02' : '00')).join('');
    expect(lines(save())).toContain(`#00011:${expected}`);
  });
});
