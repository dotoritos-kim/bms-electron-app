/**
 * BGM lane layout: packed (fill from the left per tick) vs. source (the
 * #xxx01 line each note was read from), and the undoable store action.
 */
import { computeBgmLanes, settleBgmLanes } from '../../../src/renderer/lib/bgmLanes';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

function bgm(id: string, tick: number, overrides: Partial<EditableBMSNote> = {}): EditableBMSNote {
  return {
    id, tick, beat: tick / 960, measure: 0, fraction: 0,
    keysound: '01', noteType: 'bgm', channel: '01',
    ...overrides,
  } as EditableBMSNote;
}

const lanesOf = (map: Map<string, number>) => Object.fromEntries(map);

describe('computeBgmLanes', () => {
  it('packed: fills lanes from 0 per tick, keeping the current order', () => {
    const notes = [
      bgm('a', 0, { bgmChannel: 3 }),
      bgm('b', 0, { bgmChannel: 1 }),
      bgm('c', 960, { bgmChannel: 5 }),
    ];
    expect(lanesOf(computeBgmLanes(notes, 'packed'))).toEqual({ b: 0, a: 1, c: 0 });
  });

  it('source: puts each note on the lane of its source line', () => {
    const notes = [
      bgm('drum', 0, { sourceBgmLine: 2 }),
      bgm('bass', 960, { sourceBgmLine: 1 }),
      bgm('piano', 960, { sourceBgmLine: 0 }),
    ];
    expect(lanesOf(computeBgmLanes(notes, 'source'))).toEqual({ drum: 2, bass: 1, piano: 0 });
  });

  it('source: notes without a source line take the lowest free lane on their tick', () => {
    const notes = [
      bgm('line0', 0, { sourceBgmLine: 0 }),
      bgm('line2', 0, { sourceBgmLine: 2 }),
      bgm('placed', 0),
      bgm('alone', 960),
    ];
    expect(lanesOf(computeBgmLanes(notes, 'source'))).toEqual({ line0: 0, line2: 2, placed: 1, alone: 0 });
  });

  it('source: a clash on one line keeps the first note and moves the other to a free lane', () => {
    const notes = [bgm('x', 0, { sourceBgmLine: 0 }), bgm('y', 0, { sourceBgmLine: 0 })];
    expect(lanesOf(computeBgmLanes(notes, 'source'))).toEqual({ x: 0, y: 1 });
  });

  it('fixed notes keep their lane and others go around them', () => {
    const notes = [bgm('locked', 0, { bgmChannel: 0, sourceBgmLine: 4 }), bgm('free', 0, { sourceBgmLine: 0 })];
    expect(lanesOf(computeBgmLanes(notes, 'source', new Set(['locked'])))).toEqual({ locked: 0, free: 1 });
  });

  it('ignores key lane notes', () => {
    const notes = [bgm('k', 0, { noteType: 'playable', column: '1' }), bgm('b', 0)];
    expect(lanesOf(computeBgmLanes(notes, 'packed'))).toEqual({ b: 0 });
  });
});

describe('editorStore.relayoutBgmLanes', () => {
  const s = () => useEditorStore.getState();
  const lane = (id: string) => s().notes.find((n) => n.id === id)!.bgmChannel;

  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  it('moves notes to their source lines in one undo step', () => {
    useEditorStore.setState({
      notes: [bgm('a', 0, { bgmChannel: 0, sourceBgmLine: 3 }), bgm('b', 0, { bgmChannel: 1, sourceBgmLine: 0 })],
      undoStack: [], hasUnsavedChanges: false,
    });
    expect(s().relayoutBgmLanes('source')).toBe(2);
    expect(lane('a')).toBe(3);
    expect(lane('b')).toBe(0);
    expect(s().undoStack).toHaveLength(1);
    expect(s().hasUnsavedChanges).toBe(true);

    s().undo();
    expect(lane('a')).toBe(0);
    expect(lane('b')).toBe(1);
  });

  it('does nothing (no undo entry) when the layout is already in place', () => {
    useEditorStore.setState({ notes: [bgm('a', 0, { bgmChannel: 0 })], undoStack: [] });
    expect(s().relayoutBgmLanes('packed')).toBe(0);
    expect(s().undoStack).toHaveLength(0);
  });

  it('leaves notes on a locked BGM layer in place', () => {
    useEditorStore.setState({
      notes: [bgm('a', 0, { bgmChannel: 0, sourceBgmLine: 2 }), bgm('b', 0, { bgmChannel: 1, sourceBgmLine: 0 })],
      layerConfig: { ...s().layerConfig, bgm: { ...s().layerConfig.bgm, locked: true } },
    });
    expect(s().relayoutBgmLanes('source')).toBe(0);
    expect(lane('a')).toBe(0);
  });
});

describe('settleBgmLanes', () => {
  it('leaves notes whose lane is free alone', () => {
    const existing = [bgm('x', 0, { bgmChannel: 0 })];
    expect(settleBgmLanes(existing, [bgm('a', 0, { bgmChannel: 1 }), bgm('b', 960, { bgmChannel: 0 })]).size).toBe(0);
  });

  it('a taken lane sends the note to the next free lane on the right', () => {
    const existing = [bgm('x', 0, { bgmChannel: 1 }), bgm('y', 0, { bgmChannel: 2 })];
    expect(lanesOf(settleBgmLanes(existing, [bgm('a', 0, { bgmChannel: 1 })]))).toEqual({ a: 3 });
  });

  it('moved left, the note passes the taken lane to the left; at the edge it goes right', () => {
    const existing = [bgm('x', 0, { bgmChannel: 1 })];
    expect(lanesOf(settleBgmLanes(existing, [bgm('a', 0, { bgmChannel: 1 })], -1))).toEqual({ a: 0 });
    const full = [bgm('x', 0, { bgmChannel: 0 }), bgm('y', 0, { bgmChannel: 1 })];
    expect(lanesOf(settleBgmLanes(full, [bgm('a', 0, { bgmChannel: 1 })], -1))).toEqual({ a: 2 });
  });

  it('notes placed together keep their left-to-right order', () => {
    // Both clamped onto lane 0 (moved left past the edge)
    const placed = [bgm('right', 0, { bgmChannel: 0 }), bgm('left', 0, { bgmChannel: 0 })];
    const lanes = settleBgmLanes([], placed);
    expect(new Set([0, 1])).toEqual(new Set(placed.map((n) => lanes.get(n.id) ?? n.bgmChannel)));
    const ordered = [bgm('l', 0, { bgmChannel: 1 }), bgm('r', 0, { bgmChannel: 2 })];
    expect(lanesOf(settleBgmLanes([bgm('x', 0, { bgmChannel: 1 })], ordered))).toEqual({ l: 2, r: 3 });
  });

  it('only notes on the same tick clash; key notes are ignored', () => {
    const existing = [bgm('x', 960, { bgmChannel: 0 }), { ...bgm('k', 0), noteType: 'playable', column: '1' } as EditableBMSNote];
    expect(settleBgmLanes(existing, [bgm('a', 0, { bgmChannel: 0 })]).size).toBe(0);
  });
});

describe('editorStore: BGM notes never share a lane after a move or a paste', () => {
  const s = () => useEditorStore.getState();
  const lane = (id: string) => s().notes.find((n) => n.id === id)?.bgmChannel;

  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  it('moving a note sideways onto another goes on to the next free lane', () => {
    useEditorStore.setState({ notes: [bgm('a', 0, { bgmChannel: 0 }), bgm('b', 0, { bgmChannel: 1 }), bgm('c', 0, { bgmChannel: 2 })] });
    s().moveNotes(['a'], { columnDelta: 1 }, []);
    expect([lane('a'), lane('b'), lane('c')]).toEqual([3, 1, 2]);
    s().moveNotes(['c'], { columnDelta: -1 }, []);
    expect([lane('a'), lane('b'), lane('c')]).toEqual([3, 1, 0]);
  });

  it('moving a note in time onto a taken lane takes a free lane there', () => {
    useEditorStore.setState({ notes: [bgm('a', 0, { bgmChannel: 0 }), bgm('b', 960, { bgmChannel: 0 })] });
    s().moveNotes(['a'], { beat: 1 }, []);
    expect(s().notes.find((n) => n.id === 'a')?.tick).toBe(960);
    expect([lane('a'), lane('b')]).toEqual([1, 0]);
    s().undo();
    expect([lane('a'), lane('b')]).toEqual([0, 0]);
  });

  it('a group moved left past the edge keeps one lane per note', () => {
    useEditorStore.setState({ notes: [bgm('a', 0, { bgmChannel: 0 }), bgm('b', 0, { bgmChannel: 1 })] });
    s().moveNotes(['a', 'b'], { columnDelta: -1 }, []);
    expect([lane('a'), lane('b')]).toEqual([0, 1]);
  });

  it('pasted notes take free lanes next to the notes already there', () => {
    useEditorStore.setState({
      notes: [bgm('a', 0, { bgmChannel: 0 }), bgm('b', 0, { bgmChannel: 1 })],
      clipboard: [bgm('a', 0, { bgmChannel: 0 }), bgm('b', 0, { bgmChannel: 1 })],
      currentBeat: 0, nextNoteId: 10,
    });
    s().paste();
    const lanes = s().notes.filter((n) => n.tick === 0).map((n) => n.bgmChannel).sort();
    expect(lanes).toEqual([0, 1, 2, 3]);

    useEditorStore.setState({ currentBeat: 0 });
    s().preparePaste([]);
    expect(s().notes.filter((n) => n.tick === 0).map((n) => n.bgmChannel).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

