/**
 * Keysound hand-over for generated / pattern-placed notes.
 *
 * A playable note placed by the AI chart generator or a pattern template takes
 * over the BGM / invisible note sounding at its beat: the keysound moves onto
 * the playable note and the source note is removed, so the sound is not played
 * twice. Where nothing is sounding no note is placed: a note without keysound
 * ('00') cannot be written to a BMS file and would vanish on save.
 */

export interface KeysoundSource {
  id: string;
  beat: number;
  keysound: string;
  additionalKeysounds?: Array<{ keysound: string; [key: string]: unknown }>;
}

interface SourceNote {
  id: string;
  beat: number;
  keysound?: string;
  noteType?: string;
  additionalKeysounds?: KeysoundSource['additionalKeysounds'];
}

/** Window (in beats) within which a keysound source counts as "at the same moment". */
export const DEFAULT_KEYSOUND_TOLERANCE = 0.125;
/** Beats are tick/960 floats; keep an exactly-on-the-edge source inside the window. */
const EPSILON = 1e-9;

export function isRealKeysound(id: string | undefined | null): id is string {
  return !!id && id !== '00';
}

/** BGM / invisible notes that carry a real keysound, sorted by beat. */
export function buildKeysoundPool(notes: readonly SourceNote[]): KeysoundSource[] {
  const pool: KeysoundSource[] = [];
  for (const n of notes) {
    if ((n.noteType === 'bgm' || n.noteType === 'invisible') && isRealKeysound(n.keysound)) {
      pool.push({ id: n.id, beat: n.beat, keysound: n.keysound, additionalKeysounds: n.additionalKeysounds });
    }
  }
  return pool.sort((a, b) => a.beat - b.beat);
}

export interface KeysoundTakeover {
  keysound: string;
  additionalKeysounds?: KeysoundSource['additionalKeysounds'];
}

export interface KeysoundMatch {
  /** Per input beat: the keysound taken over, or null when nothing is sounding there. */
  matches: Array<KeysoundTakeover | null>;
  /** Ids of the source notes that were handed over and must be removed. */
  consumedIds: string[];
}

/**
 * Matches every beat with at most one source within `tolerance`, and every
 * source with at most one beat. Closest pairs are matched first, so a note that
 * sits exactly on a source is never robbed of it by a neighbouring note; at
 * equal distance the earlier beat / earlier source wins (a chord gets distinct
 * sources in file order).
 */
export function matchKeysounds(
  pool: readonly KeysoundSource[],
  beats: readonly number[],
  tolerance = DEFAULT_KEYSOUND_TOLERANCE,
): KeysoundMatch {
  const lowerBound = (beat: number) => {
    let lo = 0;
    let hi = pool.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (pool[mid].beat < beat) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const pairs: Array<{ b: number; s: number; dist: number }> = [];
  beats.forEach((beat, b) => {
    for (let s = lowerBound(beat - tolerance - EPSILON); s < pool.length && pool[s].beat <= beat + tolerance + EPSILON; s++) {
      // Rounded so distances differing by float noise count as equal.
      pairs.push({ b, s, dist: Math.round(Math.abs(pool[s].beat - beat) * 1e6) });
    }
  });
  pairs.sort((x, y) => x.dist - y.dist || x.b - y.b || x.s - y.s);

  const matches: Array<KeysoundTakeover | null> = beats.map(() => null);
  const taken = new Set<number>();
  for (const { b, s } of pairs) {
    if (matches[b] || taken.has(s)) continue;
    taken.add(s);
    matches[b] = { keysound: pool[s].keysound, additionalKeysounds: pool[s].additionalKeysounds };
  }
  return { matches, consumedIds: [...taken].sort((x, y) => x - y).map((s) => pool[s].id) };
}
