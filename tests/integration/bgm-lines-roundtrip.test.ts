/**
 * Saving keeps the BGM columns. The writer puts a BGM note on line
 * `bgmChannel` of its measure, so reopening the saved file reads each note
 * back on the lane it had, and markSaved() gives the open editor the same
 * view without a reload.
 */
import { useEditorStore } from '../../src/renderer/stores/editorStore';
import { BMSParser, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

function bgm(id: string, beat: number, bgmChannel: number, keysound: string): EditableBMSNote {
  return {
    id, beat, measure: Math.floor(beat / 4), fraction: (beat % 4) / 4, tick: beat * 240,
    keysound, noteType: 'bgm', bgmChannel, channel: '01',
  } as EditableBMSNote;
}

describe('BGM lanes survive a save', () => {
  it('a note on lane N is read back from line N, and markSaved matches that', () => {
    const chart = BMSWriter.createEmptyChart();
    chart.headers.wav.set('01', 'drum.wav');
    chart.headers.wav.set('02', 'bass.wav');
    chart.headers.wav.set('03', 'pad.wav');
    // Same beat on lanes 0 and 2 (lane 1 left empty), another on lane 3 later.
    const notes = [bgm('drum', 4, 0, '01'), bgm('bass', 4, 2, '02'), bgm('pad', 6, 3, '03')];
    chart.notes = notes;

    const text = new BMSWriter().write(chart);
    const parser = new BMSParser();
    parser.compileString(text);
    const readBack = parser.getNotes()!.all().filter((n) => !n.column);
    const lineOf = (keysound: string) => readBack.find((n) => n.keysound?.toLowerCase() === keysound)?.bgmLine;
    expect(lineOf('01')).toBe(0);
    expect(lineOf('02')).toBe(2);
    expect(lineOf('03')).toBe(3);

    // The editor that saved it: sourceBgmLine was unset (notes placed in the editor).
    useEditorStore.getState().reset();
    useEditorStore.getState().initFromChart(chart, notes, 100);
    useEditorStore.getState().markSaved();
    const saved = useEditorStore.getState().notes;
    expect(saved.map((n) => [n.id, n.sourceBgmLine])).toEqual([['drum', 0], ['bass', 2], ['pad', 3]]);
    expect(useEditorStore.getState().relayoutBgmLanes('source')).toBe(0);
  });
});
