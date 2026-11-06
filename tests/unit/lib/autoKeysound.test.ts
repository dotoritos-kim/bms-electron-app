import { buildKeysoundPool, matchKeysounds } from '../../../src/renderer/lib/autoKeysound';

describe('autoKeysound', () => {
  const notes = [
    { id: 'a', beat: 0, keysound: 'AA', noteType: 'bgm' },
    { id: 'b', beat: 0, keysound: 'AB', noteType: 'bgm' },
    { id: 'c', beat: 1, keysound: 'BB', noteType: 'invisible' },
    { id: 'd', beat: 2, keysound: '00', noteType: 'bgm' },
    { id: 'e', beat: 3, keysound: 'CC', noteType: 'playable' },
  ];
  const pool = buildKeysoundPool(notes);
  const keysounds = (beats: number[], tol?: number) => matchKeysounds(pool, beats, tol).matches.map((m) => m?.keysound ?? null);

  it('pool keeps only BGM/invisible notes with a real keysound, sorted', () => {
    expect(pool.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('takes the keysound at the same beat and spreads a chord over distinct sources in file order', () => {
    expect(keysounds([0, 0, 1])).toEqual(['AA', 'AB', 'BB']);
  });

  it('hands every source over only once and lists them as consumed', () => {
    const { matches, consumedIds } = matchKeysounds(pool, [1, 1]);
    expect(matches[0]).toEqual({ keysound: 'BB', additionalKeysounds: undefined });
    expect(matches[1]).toBeNull();
    expect(consumedIds).toEqual(['c']);
  });

  it('returns null and consumes nothing where nothing is sounding', () => {
    const { matches, consumedIds } = matchKeysounds(pool, [2, 10]);
    expect(matches).toEqual([null, null]);
    expect(consumedIds).toEqual([]);
  });

  it('matches within tolerance only (edge inclusive)', () => {
    expect(keysounds([1.3])).toEqual([null]);
    expect(keysounds([1.1])).toEqual(['BB']);
    expect(keysounds([1.125])).toEqual(['BB']);
    expect(keysounds([1.126])).toEqual([null]);
  });

  it('keeps float-noise beats on the window edge inside', () => {
    expect(keysounds([1 + 0.125 + 1e-12])).toEqual(['BB']);
  });

  it('a note exactly on a source is not robbed by an earlier neighbour', () => {
    const p = buildKeysoundPool([{ id: 'x', beat: 0.125, keysound: 'XX', noteType: 'bgm' }]);
    const { matches } = matchKeysounds(p, [0, 0.125]);
    expect(matches[0]).toBeNull();
    expect(matches[1]?.keysound).toBe('XX');
  });

  it('does not depend on the input order of the beats', () => {
    const p = buildKeysoundPool([{ id: 'x', beat: 0.125, keysound: 'XX', noteType: 'bgm' }]);
    expect(matchKeysounds(p, [0.125, 0]).matches.map((m) => m?.keysound ?? null)).toEqual(['XX', null]);
  });

  it('carries layered keysounds over', () => {
    const layered = buildKeysoundPool([{ id: 'x', beat: 0, keysound: 'AA', noteType: 'bgm', additionalKeysounds: [{ keysound: 'ZZ', layerType: 'bgm' }] }]);
    expect(matchKeysounds(layered, [0]).matches[0]?.additionalKeysounds).toEqual([{ keysound: 'ZZ', layerType: 'bgm' }]);
  });

  it('copes with an empty pool and no beats', () => {
    expect(matchKeysounds([], [0, 1])).toEqual({ matches: [null, null], consumedIds: [] });
    expect(matchKeysounds(pool, [])).toEqual({ matches: [], consumedIds: [] });
  });
});
