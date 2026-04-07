/**
 * .bms.meta — Sidecar metadata file for BMS editor
 *
 * Stores editor-specific data that doesn't belong in the BMS format:
 * - Note groups
 * - Timeline bookmarks
 * - Per-measure gridSnap overrides
 * - Custom note skin/color settings
 * - Clipboard history
 * - A/B comparison snapshots
 *
 * File is stored alongside the .bms file as <filename>.bms.meta (JSON)
 */

/** Schema version for forward compatibility */
const META_VERSION = 1;

export interface BmsMetaBookmark {
  measure: number;
  name: string;
  color?: string;
}

export interface BmsMetaNoteGroup {
  id: string;
  name: string;
  noteIds: string[];
  color?: string;
}

export interface BmsMetaData {
  version: number;
  /** Per-measure gridSnap overrides */
  gridSnapOverrides?: Record<number, number>;
  /** Timeline bookmarks */
  bookmarks?: BmsMetaBookmark[];
  /** Note groups */
  noteGroups?: BmsMetaNoteGroup[];
  /** Custom note skin/color settings */
  customColors?: {
    playable?: string;
    invisible?: string;
    landmine?: string;
    bgm?: string;
    selection?: string;
    background?: string;
  };
  /** Layer config overrides */
  layerConfig?: {
    playable?: { visible?: boolean; locked?: boolean; opacity?: number };
    invisible?: { visible?: boolean; locked?: boolean; opacity?: number };
    landmine?: { visible?: boolean; locked?: boolean; opacity?: number };
    bgm?: { visible?: boolean; locked?: boolean; opacity?: number };
  };
  /** Writer resolution preference */
  writerResolution?: number;
  /** Minimum long note length (beats) */
  minLnLength?: number;
  /** BGM channel assignments (noteId → bgmChannel number) */
  bgmChannels?: Record<string, number>;
}

/**
 * Get the .bms.meta file path from a .bms file path
 */
export function getMetaPath(bmsFilePath: string): string {
  return bmsFilePath + '.meta';
}

/**
 * Create a default empty meta
 */
export function createDefaultMeta(): BmsMetaData {
  return { version: META_VERSION };
}

/**
 * Serialize meta to JSON string
 */
export function serializeMeta(meta: BmsMetaData): string {
  return JSON.stringify(meta, null, 2);
}

/**
 * Deserialize meta from JSON string, with version migration
 */
export function deserializeMeta(json: string): BmsMetaData {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return createDefaultMeta();
    // Version migration (future-proofing)
    if (!data.version || data.version < META_VERSION) {
      data.version = META_VERSION;
    }
    return data as BmsMetaData;
  } catch {
    return createDefaultMeta();
  }
}

/**
 * Convert gridSnapOverrides Map to Record for serialization
 */
export function gridSnapOverridesToRecord(map: Map<number, number>): Record<number, number> | undefined {
  if (map.size === 0) return undefined;
  const record: Record<number, number> = {};
  for (const [k, v] of map) record[k] = v;
  return record;
}

/**
 * Convert Record back to Map for store
 */
export function recordToGridSnapOverrides(record: Record<number, number> | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!record) return map;
  for (const [k, v] of Object.entries(record)) {
    map.set(Number(k), v);
  }
  return map;
}

/**
 * Build meta from current editor state
 */
export function buildMetaFromState(state: {
  gridSnapOverrides: Map<number, number>;
  minLnLength: number;
  layerConfig?: {
    playable: { visible: boolean; locked: boolean; opacity: number };
    invisible: { visible: boolean; locked: boolean; opacity: number };
    landmine: { visible: boolean; locked: boolean; opacity: number };
    bgm: { visible: boolean; locked: boolean; opacity: number };
  };
  bookmarks?: BmsMetaBookmark[];
  noteGroups?: BmsMetaNoteGroup[];
  notes?: Array<{ id: string; noteType?: string; bgmChannel?: number }>;
  customColors?: {
    playable?: string;
    invisible?: string;
    landmine?: string;
    bgm?: string;
    selection?: string;
    background?: string;
  };
}): BmsMetaData {
  const meta: BmsMetaData = { version: META_VERSION };

  const overrides = gridSnapOverridesToRecord(state.gridSnapOverrides);
  if (overrides) meta.gridSnapOverrides = overrides;

  if (state.minLnLength !== 0.25) meta.minLnLength = state.minLnLength;

  if (state.bookmarks && state.bookmarks.length > 0) meta.bookmarks = state.bookmarks;
  if (state.noteGroups && state.noteGroups.length > 0) meta.noteGroups = state.noteGroups;

  if (state.customColors && Object.keys(state.customColors).length > 0) {
    meta.customColors = state.customColors;
  }

  // BGM channel assignments
  if (state.notes) {
    const bgmChannels: Record<string, number> = {};
    let hasBgmChannels = false;
    for (const note of state.notes) {
      if (note.noteType === 'bgm' && note.bgmChannel !== undefined) {
        bgmChannels[note.id] = note.bgmChannel;
        hasBgmChannels = true;
      }
    }
    if (hasBgmChannels) meta.bgmChannels = bgmChannels;
  }

  return meta;
}

/**
 * Apply meta to editor state (returns partial state update)
 */
export function applyMetaToState(meta: BmsMetaData): {
  gridSnapOverrides: Map<number, number>;
  minLnLength?: number;
  customColors?: BmsMetaData['customColors'];
  bookmarks?: BmsMetaBookmark[];
  noteGroups?: BmsMetaNoteGroup[];
} {
  return {
    gridSnapOverrides: recordToGridSnapOverrides(meta.gridSnapOverrides),
    ...(meta.minLnLength !== undefined ? { minLnLength: meta.minLnLength } : {}),
    ...(meta.customColors ? { customColors: meta.customColors } : {}),
    ...(meta.bookmarks ? { bookmarks: meta.bookmarks } : {}),
    ...(meta.noteGroups ? { noteGroups: meta.noteGroups } : {}),
  };
}
