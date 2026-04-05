import { describe, it, expect } from 'vitest';
import {
  getMetaPath,
  createDefaultMeta,
  serializeMeta,
  deserializeMeta,
  gridSnapOverridesToRecord,
  recordToGridSnapOverrides,
  buildMetaFromState,
  applyMetaToState,
} from '../../../src/renderer/lib/bmsMeta';

describe('getMetaPath', () => {
  it('appends .meta to bms path', () => {
    expect(getMetaPath('/path/to/chart.bms')).toBe('/path/to/chart.bms.meta');
    expect(getMetaPath('C:\\Music\\test.bme')).toBe('C:\\Music\\test.bme.meta');
  });
});

describe('createDefaultMeta', () => {
  it('returns object with version 1', () => {
    const meta = createDefaultMeta();
    expect(meta.version).toBe(1);
    expect(meta.bookmarks).toBeUndefined();
    expect(meta.gridSnapOverrides).toBeUndefined();
  });
});

describe('serialize / deserialize', () => {
  it('round-trips default meta', () => {
    const meta = createDefaultMeta();
    const json = serializeMeta(meta);
    const result = deserializeMeta(json);
    expect(result.version).toBe(1);
  });

  it('round-trips meta with all fields', () => {
    const meta = {
      version: 1,
      gridSnapOverrides: { 4: 12, 8: 48 },
      bookmarks: [{ measure: 0, name: 'Intro' }, { measure: 16, name: 'Drop', color: '#ff0000' }],
      noteGroups: [{ id: 'g1', name: 'Pattern A', noteIds: ['n1', 'n2'] }],
      minLnLength: 0.5,
      writerResolution: 3840,
    };
    const json = serializeMeta(meta);
    const result = deserializeMeta(json);
    expect(result.gridSnapOverrides).toEqual({ 4: 12, 8: 48 });
    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks![1].name).toBe('Drop');
    expect(result.noteGroups).toHaveLength(1);
    expect(result.minLnLength).toBe(0.5);
  });

  it('handles invalid JSON gracefully', () => {
    expect(deserializeMeta('')).toEqual({ version: 1 });
    expect(deserializeMeta('not json')).toEqual({ version: 1 });
    expect(deserializeMeta('null')).toEqual({ version: 1 });
    expect(deserializeMeta('42')).toEqual({ version: 1 });
  });
});

describe('gridSnapOverrides conversion', () => {
  it('converts Map to Record', () => {
    const map = new Map<number, number>([[4, 12], [8, 48]]);
    const record = gridSnapOverridesToRecord(map);
    expect(record).toEqual({ 4: 12, 8: 48 });
  });

  it('returns undefined for empty Map', () => {
    expect(gridSnapOverridesToRecord(new Map())).toBeUndefined();
  });

  it('converts Record back to Map', () => {
    const map = recordToGridSnapOverrides({ 4: 12, 8: 48 });
    expect(map.get(4)).toBe(12);
    expect(map.get(8)).toBe(48);
    expect(map.size).toBe(2);
  });

  it('returns empty Map for undefined', () => {
    expect(recordToGridSnapOverrides(undefined).size).toBe(0);
  });
});

describe('buildMetaFromState', () => {
  it('builds minimal meta when all defaults', () => {
    const meta = buildMetaFromState({
      gridSnapOverrides: new Map(),
      minLnLength: 0.25,
    });
    expect(meta.version).toBe(1);
    expect(meta.gridSnapOverrides).toBeUndefined();
    expect(meta.minLnLength).toBeUndefined(); // 0.25 is default, omitted
  });

  it('includes non-default values', () => {
    const meta = buildMetaFromState({
      gridSnapOverrides: new Map([[4, 12]]),
      minLnLength: 0.5,
      bookmarks: [{ measure: 0, name: 'Start' }],
    });
    expect(meta.gridSnapOverrides).toEqual({ 4: 12 });
    expect(meta.minLnLength).toBe(0.5);
    expect(meta.bookmarks).toHaveLength(1);
  });
});

describe('applyMetaToState', () => {
  it('converts meta to partial state', () => {
    const state = applyMetaToState({
      version: 1,
      gridSnapOverrides: { 4: 12, 8: 48 },
      minLnLength: 0.5,
    });
    expect(state.gridSnapOverrides.get(4)).toBe(12);
    expect(state.minLnLength).toBe(0.5);
  });

  it('handles empty meta', () => {
    const state = applyMetaToState({ version: 1 });
    expect(state.gridSnapOverrides.size).toBe(0);
    expect(state.minLnLength).toBeUndefined();
  });
});
