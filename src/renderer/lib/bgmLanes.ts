/**
 * BGM lane layout.
 *
 * A BMS file has a single BGM channel (01); editors such as BMSE / iBMSC show
 * it as columns B1, B2, … by writing column N as the Nth `#xxx01:` line of a
 * measure, so composers often keep one instrument per column. The editor can
 * lay BGM notes out two ways:
 *   - 'packed': per tick, notes fill lanes 0, 1, 2, … from the left.
 *   - 'source': each note goes to the lane of the line it was read from
 *     (`sourceBgmLine`); notes without one (placed in the editor, bmson)
 *     take the lowest free lane on their tick.
 */
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

export type BgmLaneLayout = 'packed' | 'source';

/**
 * New `bgmChannel` for every BGM note. Notes in `fixed` (e.g. locked layers)
 * keep their current lane and are placed around.
 */
export function computeBgmLanes(
  notes: readonly EditableBMSNote[],
  layout: BgmLaneLayout,
  fixed?: ReadonlySet<string>,
): Map<string, number> {
  const byTick = new Map<number, EditableBMSNote[]>();
  for (const n of notes) {
    if (n.noteType !== 'bgm') continue;
    const group = byTick.get(n.tick);
    if (group) group.push(n);
    else byTick.set(n.tick, [n]);
  }

  const result = new Map<string, number>();
  for (const group of byTick.values()) {
    const taken = new Set<number>();
    const free = () => { let ch = 0; while (taken.has(ch)) ch++; return ch; };
    const place = (n: EditableBMSNote, ch: number) => { taken.add(ch); result.set(n.id, ch); };

    const movable: EditableBMSNote[] = [];
    for (const n of group) {
      if (fixed?.has(n.id)) place(n, n.bgmChannel ?? 0);
      else movable.push(n);
    }

    if (layout === 'source') {
      // Lines first (in line order, so a clash keeps the lower line in place),
      // then notes without a source line.
      const sourced = movable.filter((n) => n.sourceBgmLine !== undefined)
        .sort((a, b) => a.sourceBgmLine! - b.sourceBgmLine!);
      for (const n of sourced) place(n, taken.has(n.sourceBgmLine!) ? free() : n.sourceBgmLine!);
      for (const n of movable) if (n.sourceBgmLine === undefined) place(n, free());
    } else {
      // Keep the notes' current left-to-right order
      const ordered = [...movable].sort((a, b) => (a.bgmChannel ?? 0) - (b.bgmChannel ?? 0));
      for (const n of ordered) place(n, free());
    }
  }
  return result;
}

/**
 * Lanes for BGM notes that were just put somewhere (moved, pasted). A note
 * whose lane is taken on its tick, by a note already there or by an earlier
 * one of `placed`, goes to the nearest free lane: to the right, or to the left
 * first when the notes were moved left (`direction` -1), so a note stepped
 * left with the keyboard passes the taken lane instead of stopping at it.
 * Returns the new lane of the notes that have to change lane.
 *
 * Same rule as the site editor (U_E-storage-project bgmLanes.ts). Two BGM
 * notes on one lane and tick would be drawn on top of each other, and the
 * writer moves one of them to another line on save.
 */
export function settleBgmLanes(
  existing: readonly EditableBMSNote[],
  placed: readonly EditableBMSNote[],
  direction: 1 | -1 = 1,
): Map<string, number> {
  const result = new Map<string, number>();
  const ticks = new Set<number>();
  for (const n of placed) if (n.noteType === 'bgm') ticks.add(n.tick);
  if (ticks.size === 0) return result;

  const taken = new Map<number, Set<number>>();
  for (const tick of ticks) taken.set(tick, new Set());
  for (const n of existing) {
    if (n.noteType === 'bgm') taken.get(n.tick)?.add(n.bgmChannel ?? 0);
  }
  // In lane order, so notes that clash with each other keep their left-to-right order
  const ordered = placed
    .filter((n) => n.noteType === 'bgm')
    .sort((a, b) => (a.bgmChannel ?? 0) - (b.bgmChannel ?? 0));
  for (const n of ordered) {
    const used = taken.get(n.tick)!;
    const want = Math.max(0, n.bgmChannel ?? 0);
    let ch = want;
    if (direction < 0) {
      while (ch >= 0 && used.has(ch)) ch--;
      if (ch < 0) ch = want;
    }
    while (used.has(ch)) ch++;
    used.add(ch);
    if (ch !== n.bgmChannel) result.set(n.id, ch);
  }
  return result;
}
