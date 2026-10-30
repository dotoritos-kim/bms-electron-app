/**
 * Keeps the editor key mode across save → reload.
 *
 * A BMS file has no key-mode field: the loader infers the channel layout
 * (IIDX / keyboard / PMS) from channel usage and the key mode from the lanes
 * in use. 4K/6K are subsets of the 7K channels, and a keyboard layout with a
 * sparse lane 7 reads as IIDX, so the inferred mode or lanes can differ from
 * what was written. When they would, the mode is recorded in the .bms.meta
 * sidecar and the file is read back with the layout it was written in.
 *
 * Qwilight's 4K/6K/8K are told apart by their #4K / #6K / #8K command, which
 * the editor writes, so they reload by themselves and need no sidecar entry.
 */

import { BMSParser, BMSWriter, Notes, styleForKeyMode, columnMappingForStyle } from '@rhythm-archive/bms-core';
import type { BMSChart, BMSNote, EditableChartStyle } from '@rhythm-archive/bms-core';
import { detectKeyMode, getLaneIds } from '@rhythm-archive/bms-editor';
import type { KeyMode } from '@rhythm-archive/bms-editor';
import { applyMetaToState, deserializeMeta } from './bmsMeta';

/**
 * True when reloading `bmsContent` would not give back `keyMode` with the
 * lanes it was written in (different detected mode or channel layout).
 * @param style layout the text was written in (default: the key mode's own)
 */
export function keyModeNeedsMeta(bmsContent: string, keyMode: KeyMode, style: EditableChartStyle = styleForKeyMode(keyMode)): boolean {
  try {
    const chart = new BMSParser().compileString(bmsContent);
    const reloaded = BMSWriter.fromBMSChart(chart);
    const detected = detectKeyMode(reloaded.notes as Parameters<typeof detectKeyMode>[0], chart.headers);
    return detected !== keyMode || reloaded.style?.id !== style.id;
  } catch {
    return true;
  }
}

/** FNV-1a (32-bit) of the BMS text, hex. Identifies the exact text a key mode was saved with. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SavedKeyMode {
  keyMode: KeyMode;
  contentHash?: string;
  /** Layout it was saved in; absent in sidecars written by 0.5.5. */
  style?: EditableChartStyle;
}

/**
 * Sidecar fields for a save of `bmsContent` in `keyMode` (written in `style`):
 * the mode, layout and text hash when reloading would not give the mode back,
 * nothing otherwise.
 */
export function keyModeMetaFields(
  bmsContent: string,
  keyMode: KeyMode,
  style: EditableChartStyle = styleForKeyMode(keyMode),
): { keyMode?: KeyMode; keyModeContentHash?: string; keyModeStyle?: EditableChartStyle } {
  return keyModeNeedsMeta(bmsContent, keyMode, style)
    ? { keyMode, keyModeContentHash: contentHash(bmsContent), keyModeStyle: { id: style.id, isDP: style.isDP } }
    : {};
}

/** Key mode recorded in a .bms.meta sidecar's JSON, if any (never throws). */
export function metaKeyMode(json: string | null | undefined): SavedKeyMode | undefined {
  try {
    if (!json) return undefined;
    const meta = deserializeMeta(json);
    const keyMode = applyMetaToState(meta).keyMode;
    const style = meta.keyModeStyle;
    return keyMode
      ? {
        keyMode,
        contentHash: meta.keyModeContentHash,
        ...(style && typeof style.id === 'string' ? { style: { id: style.id, isDP: !!style.isDP } as EditableChartStyle } : {}),
      }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the chart's lanes with a given channel layout. */
export function readWithLayout(
  chart: BMSChart,
  keyMode: KeyMode,
  style: EditableChartStyle,
): { keyMode: KeyMode; style: EditableChartStyle; notes: BMSNote[] } {
  return { keyMode, style, notes: Notes.fromBMSChart(chart, { mapping: { ...columnMappingForStyle(style) } }).all() };
}

/**
 * 0.5.5 wrote 8K as 8 keyboard lanes on channels 11-18. 8K is now Qwilight's
 * #8K (channel 16 as the leftmost key, then 11-15, 18, 19): keep each note in
 * the same lane position.
 */
const LEGACY_8K_COLUMNS: Record<string, string> = {
  '1': 'SC', '2': '1', '3': '2', '4': '3', '5': '4', '6': '5', '7': '6', '8': '7',
};

/**
 * Reads the chart's lanes with the layout the saved key mode is written in.
 * When `bmsText` is exactly the text it was saved with, the mode is trusted
 * (lanes the mode hides, kept from a mode switch, are fine). Otherwise the
 * file was changed elsewhere (or the sidecar write failed), and the mode is
 * used only if it still fits: null when some lane object would land outside
 * the mode's lanes, or fewer lane objects would map than with auto-detection.
 */
export function readWithSavedKeyMode(
  chart: BMSChart,
  detectedNotes: readonly BMSNote[],
  saved: SavedKeyMode | undefined,
  bmsText: string,
): { keyMode: KeyMode; style: EditableChartStyle; notes: BMSNote[] } | null {
  if (!saved) return null;
  const { keyMode } = saved;
  const legacy8K = keyMode === '8K' && !saved.style && !chart.headers.has('8k');
  const style: EditableChartStyle = saved.style
    ?? (legacy8K ? { id: 'keyboard', isDP: false } : styleForKeyMode(keyMode));
  let notes = Notes.fromBMSChart(chart, { mapping: { ...columnMappingForStyle(style) } }).all();
  if (legacy8K) {
    notes = notes.map((n) => (n.column && LEGACY_8K_COLUMNS[n.column] ? { ...n, column: LEGACY_8K_COLUMNS[n.column] } : n));
  }
  if (saved.contentHash && saved.contentHash === contentHash(bmsText)) return { keyMode, style, notes };
  const lanes = new Set(getLaneIds(keyMode));
  let mapped = 0;
  for (const n of notes) {
    if (!n.column) continue;
    if (!lanes.has(n.column)) return null;
    mapped++;
  }
  const detectedMapped = detectedNotes.filter((n) => n.column).length;
  if (mapped < detectedMapped) return null;
  return { keyMode, style, notes };
}

/**
 * Autosave files are plain BMS text; the key mode rides along as a leading
 * line without `#`, which BMS readers skip as a comment.
 */
const AUTOSAVE_KEYMODE_PREFIX = '*bms-editor-keymode ';

export function tagAutoSave(content: string, keyMode: KeyMode, style?: EditableChartStyle): string {
  const layout = style ? ` ${style.id} ${style.isDP ? 'dp' : 'sp'}` : '';
  return `${AUTOSAVE_KEYMODE_PREFIX}${keyMode}${layout}\r\n${content}`;
}

export function untagAutoSave(content: string): { content: string; keyMode?: string; style?: EditableChartStyle } {
  if (!content.startsWith(AUTOSAVE_KEYMODE_PREFIX)) return { content };
  const eol = content.indexOf('\n');
  const line = eol === -1 ? content : content.slice(0, eol);
  const [keyMode, id, side] = line.slice(AUTOSAVE_KEYMODE_PREFIX.length).trim().split(/\s+/);
  return {
    content: eol === -1 ? '' : content.slice(eol + 1),
    keyMode,
    ...(id ? { style: { id, isDP: side === 'dp' } as EditableChartStyle } : {}),
  };
}
