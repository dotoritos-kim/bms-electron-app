/**
 * editorStore: placement integrity with many keysounds / BGM notes:
 * moves keep off-grid timing, lane conversions don't stack notes, locked
 * layers stay untouched, removed #WAV ids leave no dangling references,
 * and undo snapshots don't deep-clone the chart.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

const act = () => useEditorStore.getState();
const LANES = ['1', '2', '3', '4', '5', '6', '7', 'SC'];

let seq = 0;
const note = (o: Partial<EditableBMSNote> & { tick: number }): EditableBMSNote => ({
  id: `n${seq++}`,
  beat: o.tick / 960,
  measure: 0,
  fraction: 0,
  column: '1',
  keysound: '01',
  noteType: 'playable',
  channel: '',
  ...o,
} as EditableBMSNote);

function seed(notes: EditableBMSNote[], headers?: Partial<{ wav: Map<string, string> }>) {
  useEditorStore.setState({
    notes,
    nextNoteId: notes.length + 1,
    ...(headers ? { headers: { wav: new Map(), bmp: new Map(), bpmDef: new Map(), stopDef: new Map(), custom: new Map(), ...headers } as never } : {}),
  });
}

beforeEach(() => {
  act().reset();
  seq = 0;
});

describe('moveNotes', () => {
  it('keeps relative timing of off-grid notes (no per-note re-snap)', () => {
    // 1/192 and triplet positions inside one 1/16 grid cell
    const a = note({ tick: 20 });
    const b = note({ tick: 100, column: '2' });
    seed([a, b]);
    useEditorStore.setState({ gridSnap: 16 });
    act().moveNotes([a.id, b.id], { beat: 4 }, LANES);
    const ticks = act().notes.map((n) => n.tick).sort((x, y) => x - y);
    expect(ticks).toEqual([3860, 3940]);
  });

  it('column-only moves do not change timing', () => {
    const a = note({ tick: 320 }); // 1/12 position
    seed([a]);
    useEditorStore.setState({ gridSnap: 16 });
    act().moveNotes([a.id], { columnDelta: 1 }, LANES);
    expect(act().notes[0]).toMatchObject({ tick: 320, column: '2' });
  });

  it('moves BGM notes between BGM lanes by channel', () => {
    const g = note({ tick: 0, noteType: 'bgm', column: undefined, bgmChannel: 2 });
    seed([g]);
    act().moveNotes([g.id], { columnDelta: 3 }, LANES);
    expect(act().notes[0].bgmChannel).toBe(5);
    act().moveNotes([g.id], { columnDelta: -10 }, LANES);
    expect(act().notes[0].bgmChannel).toBe(0);
  });
});

describe('convertNotes', () => {
  it('playable → BGM gives each note on a tick its own free channel', () => {
    const existing = note({ tick: 0, noteType: 'bgm', column: undefined, bgmChannel: 1 });
    const c1 = note({ tick: 0, column: '1' });
    const c2 = note({ tick: 0, column: '3' });
    const c3 = note({ tick: 960, column: '2', endTick: 1920, endBeat: 2 });
    seed([existing, c1, c2, c3]);
    act().convertNotes([c1.id, c2.id, c3.id], { kind: 'bgm', channel: 1 }, LANES);
    const byId = new Map(act().notes.map((n) => [n.id, n]));
    expect(byId.get(c1.id)!.bgmChannel).toBe(2); // 1 is taken
    expect(byId.get(c2.id)!.bgmChannel).toBe(3);
    expect(byId.get(c3.id)!.bgmChannel).toBe(1);
    expect(byId.get(c3.id)!.endTick).toBeUndefined(); // BGM notes are not LNs
    expect(act().undoStack).toHaveLength(1);
  });

  it('BGM → playable keeps the relative lane layout instead of stacking', () => {
    const g0 = note({ tick: 0, noteType: 'bgm', column: undefined, bgmChannel: 4 });
    const g1 = note({ tick: 0, noteType: 'bgm', column: undefined, bgmChannel: 5 });
    seed([g0, g1]);
    act().convertNotes([g0.id, g1.id], { kind: 'playable', column: '3' }, LANES);
    const cols = act().notes.map((n) => n.column).sort();
    expect(cols).toEqual(['3', '4']);
    expect(act().notes.every((n) => n.noteType === 'playable')).toBe(true);
  });
});

describe('note index stays in sync', () => {
  it('adding a note where a converted (now BGM) note sat does not delete it', () => {
    const p = note({ tick: 960, beat: 1, column: '1', keysound: '0A' });
    seed([p]);
    useEditorStore.setState({ _noteIndex: new Map([['1:1', p.id]]) } as never);
    act().selectNotes([p.id]);
    act().changeNoteType('bgm');
    act().addNote({ beat: 1, column: '1', noteType: 'playable', keysound: '0B', measure: 0, fraction: 0.25, channel: '' } as never);
    const keysounds = act().notes.map((n) => n.keysound).sort();
    expect(keysounds).toEqual(['0A', '0B']);
  });

  it('changeNoteType to non-playable drops long-note data', () => {
    const ln = note({ tick: 0, endTick: 960, endBeat: 1 });
    seed([ln]);
    act().selectNotes([ln.id]);
    act().changeNoteType('invisible');
    expect(act().notes[0].endTick).toBeUndefined();
    expect(act().notes[0].endBeat).toBeUndefined();
  });
});

describe('locked layers', () => {
  it('cut / quantize / mirror skip locked notes', () => {
    const bgm = note({ tick: 7, noteType: 'bgm', column: undefined, bgmChannel: 0 });
    const inv = note({ tick: 7, noteType: 'invisible', column: '1' });
    seed([bgm, inv]);
    act().setLayerLocked('bgm', true);
    act().setLayerLocked('invisible', true);
    act().selectNotes([bgm.id, inv.id]);
    act().quantizeNotes();
    act().mirrorNotes(LANES);
    expect(act().notes.map((n) => [n.tick, n.column])).toEqual([[7, undefined], [7, '1']]);
    act().cut();
    expect(act().notes).toHaveLength(2);
  });

  it('selectByFilter does not select notes on locked or hidden layers', () => {
    const bgm = note({ tick: 0, noteType: 'bgm', column: undefined, keysound: '0A' });
    const p = note({ tick: 0, keysound: '0A' });
    seed([bgm, p]);
    act().setLayerLocked('bgm', true);
    act().selectByFilter({ keysounds: ['0A'] });
    expect([...act().selectedNotes]).toEqual([p.id]);
  });
});

describe('removeWavDefinitions', () => {
  it('keeps the note keysound id and drops removed layers in one undo step', () => {
    const a = note({ tick: 0, keysound: '0A' });
    const b = note({ tick: 0, keysound: '0B', additionalKeysounds: [{ keysound: '0a', type: 'bgm' }, { keysound: '0C', type: 'bgm' }] });
    seed([a, b], { wav: new Map([['0A', 'a.wav'], ['0B', 'b.wav'], ['0C', 'c.wav']]) });
    act().removeWavDefinitions(['0a']);
    const [na, nb] = act().notes;
    expect(na.keysound).toBe('0A');
    expect(nb.additionalKeysounds).toEqual([{ keysound: '0C', type: 'bgm' }]);
    expect([...act().headers!.wav.keys()]).toEqual(['0B', '0C']);
    expect(act().undoStack).toHaveLength(1);
    act().undo();
    expect(act().notes[0].keysound).toBe('0A');
    expect(act().headers!.wav.has('0A')).toBe(true);
  });
});

describe('undo snapshots', () => {
  it('store references instead of deep clones (O(1) per edit)', () => {
    const notes = Array.from({ length: 1000 }, (_, i) => note({ tick: i * 10 }));
    seed(notes);
    const before = act().notes;
    act().pushUndo('x');
    expect(act().undoStack[0].notes).toBe(before);
  });

  it('flip handles very large selections (no Math.min spread overflow)', () => {
    const notes = Array.from({ length: 150_000 }, (_, i) => note({ tick: i, column: '1' }));
    seed(notes);
    useEditorStore.setState({ selectedNotes: new Set(notes.map((n) => n.id)) });
    expect(() => act().flipNotes()).not.toThrow();
  });
});

describe('measure insert / delete keep measure-numbered data aligned', () => {
  it('shifts bookmarks and per-measure grid overrides, and undo restores them', () => {
    seed([note({ tick: 3840 * 3 })]);
    useEditorStore.setState({
      bookmarks: [{ measure: 1, name: 'A' }, { measure: 3, name: 'B' }],
      gridSnapOverrides: new Map([[3, 12]]),
    });
    act().insertMeasure(2);
    expect(act().bookmarks.map((b) => b.measure)).toEqual([1, 4]);
    expect([...act().gridSnapOverrides]).toEqual([[4, 12]]);
    act().undo();
    expect(act().bookmarks.map((b) => b.measure)).toEqual([1, 3]);
    expect([...act().gridSnapOverrides]).toEqual([[3, 12]]);
    act().redo();
    expect(act().bookmarks.map((b) => b.measure)).toEqual([1, 4]);

    act().deleteMeasure(1);
    expect(act().bookmarks.map((b) => b.measure)).toEqual([3]);
    expect([...act().gridSnapOverrides]).toEqual([[3, 12]]);
  });

  it('undo of an ordinary edit does not touch bookmarks', () => {
    seed([note({ tick: 0 })]);
    act().moveNotes([act().notes[0].id], { beat: 1 }, LANES);
    useEditorStore.setState({ bookmarks: [{ measure: 0, name: 'new' }] });
    act().undo();
    expect(act().bookmarks).toHaveLength(1);
  });
});

describe('undo back to the saved state is clean', () => {
  const chart = (notes: EditableBMSNote[]) => ({
    headers: null, notes, timeSignatures: new Map(), bpmChanges: [], stopEvents: [], bgaEvents: [],
  }) as never;

  it('clears the modified flag when undo returns to the loaded chart', () => {
    const n = note({ tick: 0 });
    act().initFromChart(chart([n]), [n], 2);
    act().moveNotes([n.id], { beat: 1 }, LANES);
    act().moveNotes([n.id], { beat: 1 }, LANES);
    expect(act().hasUnsavedChanges).toBe(true);
    act().undo();
    expect(act().hasUnsavedChanges).toBe(true);
    act().undo();
    expect(act().hasUnsavedChanges).toBe(false);
    act().redo();
    expect(act().hasUnsavedChanges).toBe(true);
  });

  it('a save moves the clean point', () => {
    const n = note({ tick: 0 });
    act().initFromChart(chart([n]), [n], 2);
    act().moveNotes([n.id], { beat: 1 }, LANES);
    act().setHasUnsavedChanges(false); // saved
    act().undo();
    expect(act().hasUnsavedChanges).toBe(true);
    act().redo();
    expect(act().hasUnsavedChanges).toBe(false);
  });
});

describe('#BASE 62 keysound ids are case-sensitive', () => {
  const base62Headers = (wav: Map<string, string>) => ({
    wav, bmp: new Map(), bpmDef: new Map(), stopDef: new Map(), custom: new Map([['BASE', '62']]),
  }) as never;

  it('removing "0a" leaves "0A" and its notes alone', () => {
    const a = note({ tick: 0, keysound: '0a', noteType: 'bgm', column: undefined });
    const b = note({ tick: 0, keysound: '0A', noteType: 'bgm', column: undefined, bgmChannel: 1 });
    useEditorStore.setState({ notes: [a, b], headers: base62Headers(new Map([['0a', 'x.wav'], ['0A', 'y.wav']])) });
    act().removeWavDefinitions(['0a']);
    expect([...act().headers!.wav.keys()]).toEqual(['0A']);
    expect(act().notes.map((n) => n.keysound)).toEqual(['0a', '0A']);
  });

  it('filter and replace distinguish ids that differ only by case', () => {
    const a = note({ tick: 0, keysound: 'Kp' });
    const b = note({ tick: 960, keysound: 'KP', column: '2' });
    useEditorStore.setState({ notes: [a, b], headers: base62Headers(new Map([['Kp', 'p.wav'], ['KP', 'q.wav']])) });
    act().selectByFilter({ keysounds: ['Kp'] });
    expect([...act().selectedNotes]).toEqual([a.id]);
    act().replaceKeysound('Kp', 'zz');
    expect(act().notes.map((n) => n.keysound)).toEqual(['zz', 'KP']);
  });

  it('base36 charts still treat ids case-insensitively', () => {
    const a = note({ tick: 0, keysound: '0A' });
    useEditorStore.setState({ notes: [a], headers: base62Headers(new Map([['0A', 'x.wav']])) });
    useEditorStore.setState({ headers: { ...act().headers!, custom: new Map() } });
    act().selectByFilter({ keysounds: ['0a'] });
    expect([...act().selectedNotes]).toEqual([a.id]);
  });
});
