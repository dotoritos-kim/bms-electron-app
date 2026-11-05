/**
 * BGM lane layout: packed (fill from the left per tick) vs. source (the
 * #xxx01 line each note was read from), and the undoable store action.
 */
import { computeBgmLanes } from '../../../src/renderer/lib/bgmLanes';
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
