import { useState, useCallback, useRef, useEffect } from 'react';
import i18next from 'i18next';
import { BMSParser, Timing, Positioning, Spacing, SongInfo, KeySounds, Notes, DEFAULT_BPM, extendedBpmHeader, encodeText, styleForKeyMode } from '@rhythm-archive/bms-core';
import type { BMSChart, BMSNote, EditableChartStyle, ISongInfoData } from '@rhythm-archive/bms-core';
import { detectKeyMode } from '@rhythm-archive/bms-editor';
import type { KeyMode, BpmChange, StopEvent, ScrollSpeedChange } from '@rhythm-archive/bms-editor';
import { metaKeyMode, readWithLayout, readWithSavedKeyMode } from '../lib/keyModePersistence';
import { isScratchColumn, playedLanes } from '../lib/keyModeLanes';

export interface LocalBmsChartInfo {
  songInfo: ISongInfoData | null;
  notes: BMSNote[];
  keyMode: KeyMode;
  totalBeats: number;
  bpm: { initial: number; min: number; max: number };
  bpmChanges: BpmChange[];
  lnType: number;
  stats: { total: number; scratch: number; longNotes: number; landmines: number; invisible: number };
  stops: StopEvent[];
  scrollChanges: ScrollSpeedChange[];
  /** WAV id → file. Keys: lower-case (base36) or case-preserved (`#BASE 62`), see `keysoundKey`. */
  keysounds: Record<string, string>;
  /** `#BASE 62`: object IDs are case-sensitive ("0a" != "0A"). */
  base62: boolean;
  /** Global `#VOLWAV` (percent, default 100). */
  volWav: number;
  positioning: Positioning | null;
  timing: Timing | null;
  // Full bms-core objects for Player (avoids re-parsing)
  spacing: Spacing | null;
  keysoundsObj: KeySounds | null;
  songInfoObj: SongInfo | null;
  barLines: number[];
  /** Raw BMSChart object for Editor (BMSWriter.fromBMSChart) */
  bmsChart: BMSChart | null;
  /**
   * Channel layout the lanes were read with when the .bms.meta key mode
   * overrides auto-detection; pass it to `BMSWriter.fromBMSChart`.
   */
  layoutStyle?: EditableChartStyle;
  /** Encoding the file was read with (WHATWG label, e.g. 'shift_jis'); the editor saves in it. */
  sourceEncoding: string;
  /** Whether the file started with a byte order mark. */
  sourceBom: boolean;
  /** The .bms.meta sidecar as read with the chart (null when absent), so the editor need not read it again. */
  metaJson: string | null;
}

/**
 * Encodes chart text for saving in the encoding the file was read with, so a
 * Shift_JIS / EUC-KR chart stays readable by players that do not detect UTF-8.
 * UTF-8 sources are written as text (unchanged behaviour). When the text has a
 * character the source encoding cannot represent, it is written as UTF-8 with
 * a BOM and `fellBack` is set so the caller can tell the user.
 */
export function encodeForSave(
  text: string,
  chart: Pick<LocalBmsChartInfo, 'sourceEncoding' | 'sourceBom'> | null | undefined,
): { content: string | Uint8Array; fellBack: boolean } {
  const encoding = chart?.sourceEncoding ?? 'utf-8';
  if (encoding === 'utf-8' && !chart?.sourceBom) return { content: text, fellBack: false };
  const r = encodeText(text, encoding, chart?.sourceBom ?? false);
  return { content: r.bytes, fellBack: !r.exact };
}

/**
 * Whether a parsed note becomes an editable note. BGM notes always do; lane
 * notes only when their channel maps to a column. Lane objects without a
 * column (extension lanes 1A-2Z, channels outside the detected layout) are kept
 * verbatim by `BMSWriter.fromBMSChart` (`extraObjects`) instead, as editable
 * notes they would also be written back on the BGM channel (01).
 */
export function isEditableNote(note: Pick<BMSNote, 'noteType' | 'column'>): boolean {
  return note.noteType === 'bgm' || !!note.column;
}

interface UseLocalBmsFileState {
  chart: LocalBmsChartInfo | null;
  isLoading: boolean;
  error: string | null;
}

export function useLocalBmsFile() {
  const [state, setState] = useState<UseLocalBmsFileState>({
    chart: null,
    isLoading: false,
    error: null,
  });

  // Each load() gets a ticket; responses from superseded or unmounted loads
  // are dropped so a slow earlier file cannot overwrite a newer one.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async (filePath: string) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestIdRef.current === requestId;
    setState({ chart: null, isLoading: true, error: null });

    try {
      // Read file and sidecar from disk via IPC (the sidecar once, in parallel)
      const metaPromise = Promise.resolve().then(() => window.api.file.readMeta(filePath)).catch(() => null);
      const buffer = await window.api.file.readBms(filePath);
      const parser = new BMSParser();
      // readBuffer is async: reads buffer → detects encoding → returns string
      const bmsString = await parser.readBuffer(buffer);
      // compileString parses the BMS text into a BMSChart structure
      const chart = parser.compileString(bmsString);
      // Yield one frame so the loading spinner can animate before sync work continues
      await new Promise<void>((r) => setTimeout(r, 0));
      if (!isCurrent()) return;
      const songInfo = parser.getSongInfo();
      const notesObj = parser.getNotes();

      if (!notesObj) {
        throw new Error('Failed to parse notes');
      }

      let notes = notesObj.all();
      // Detect key mode (static import, no dynamic import)
      let keyMode = detectKeyMode(notes, chart.headers);
      // A key mode recorded at save time wins, read with the layout it was written in
      const metaJson = await metaPromise;
      let saved = readWithSavedKeyMode(chart, notes, metaKeyMode(metaJson), bmsString);
      if (!isCurrent()) return;
      if (!saved && playedLanes(keyMode)) {
        // #4K / #6K / #8K lanes sit on fixed IIDX channels whatever the channel usage suggests
        saved = readWithLayout(chart, keyMode, styleForKeyMode(keyMode));
      }
      if (saved) {
        notes = saved.notes;
        keyMode = saved.keyMode;
      }

      // Extract BPM info
      const bpmHeader = chart.headers.get('bpm');
      const initialBpm = bpmHeader ? parseFloat(bpmHeader) : DEFAULT_BPM;
      let minBpm = initialBpm;
      let maxBpm = initialBpm;

      // Single-pass extraction: BPM changes, stops, and scroll speed changes
      const bpmChanges: BpmChange[] = [];
      const stops: StopEvent[] = [];
      const scrollChanges: ScrollSpeedChange[] = [];
      for (const obj of chart.objects.allSorted()) {
        const ch = obj.channel;
        if (ch === '03') {
          const bpmValue = parseInt(obj.value, 16);
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        } else if (ch === '08') {
          const bpmValue = parseFloat(extendedBpmHeader(chart.headers, obj.value) || '');
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        } else if (ch === '09') {
          const stopHeader = chart.headers.get('stop' + obj.value);
          if (stopHeader) {
            const stopValue = parseInt(stopHeader, 10) / 192;
            if (!isNaN(stopValue) && stopValue !== 0) {
              stops.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                duration: stopValue,
              });
            }
          }
        } else if (ch.toUpperCase() === 'SC') {
          const scrollHeader = chart.headers.get('scroll' + obj.value);
          if (scrollHeader) {
            const scrollValue = parseFloat(scrollHeader);
            if (!isNaN(scrollValue)) {
              scrollChanges.push({
                beat: chart.measureToBeat(obj.measure, obj.fraction),
                speed: scrollValue,
              });
            }
          }
        }
      }

      // LN type
      const lnTypeHeader = chart.headers.get('lntype');
      const lnType = lnTypeHeader ? parseInt(lnTypeHeader) : 1;

      // Build all bms-core objects (avoids re-parsing in Player)
      const timing = Timing.fromBMSChart(chart);
      const positioning = Positioning.fromBMSChart(chart, timing);
      const spacing = Spacing.fromBMSChart(chart);
      const keysoundsObj = KeySounds.fromBMSChart(chart);
      // Keysound map: base-aware. #BASE 62 ids are case-sensitive (folding
      // them merged different keysounds into one).
      const keysounds: Record<string, string> = { ...keysoundsObj.all() };
      const base62 = keysoundsObj.base62;
      const volWav = parseVolWav(chart.headers.get('volwav'));
      const songInfoObj = SongInfo.fromBMSChart(chart);

      // Build bar lines (BUG-P3: compute measure boundaries accounting for time signature changes)
      let maxMeasure = 0;
      for (const n of notes) {
        const { measure } = chart.timeSignatures.beatToMeasure(n.endBeat ?? n.beat);
        if (measure > maxMeasure) maxMeasure = measure;
      }
      maxMeasure += 2;
      const barLines: number[] = [];
      for (let m = 0; m <= maxMeasure; m++) {
        barLines.push(chart.timeSignatures.measureToBeat(m, 0));
      }

      // Calculate stats
      let total = 0, scratch = 0, longNotes = 0, landmines = 0, invisible = 0;
      const lanes = playedLanes(keyMode);
      for (const note of notes) {
        if (!note.column || (lanes && !lanes.has(note.column))) continue;
        const noteType = note.noteType || 'playable';
        if (noteType === 'landmine') landmines++;
        else if (noteType === 'invisible') invisible++;
        else if (noteType === 'playable') {
          total++;
          if (isScratchColumn(note.column, keyMode)) scratch++;
          if (note.endBeat !== undefined) longNotes++;
        }
      }

      // Total beats
      let maxBeat = 0;
      for (const note of notes) {
        const endBeat = note.endBeat ?? note.beat;
        if (endBeat > maxBeat) maxBeat = endBeat;
      }

      if (!isCurrent()) return;
      setState({
        chart: {
          songInfo: songInfo
            ? {
                title: songInfo.title,
                subtitles: songInfo.subtitles,
                artist: songInfo.artist,
                subartists: songInfo.subartists,
                genre: songInfo.genre,
                difficulty: songInfo.difficulty,
                level: songInfo.level,
              }
            : null,
          notes,
          keyMode,
          ...(saved ? { layoutStyle: saved.style } : {}),
          totalBeats: Math.ceil(maxBeat) + 4,
          bpm: { initial: initialBpm, min: minBpm, max: maxBpm },
          bpmChanges,
          lnType,
          stats: { total, scratch, longNotes, landmines, invisible },
          stops,
          scrollChanges,
          keysounds,
          base62,
          volWav,
          positioning,
          timing,
          spacing,
          keysoundsObj,
          songInfoObj,
          barLines,
          bmsChart: chart,
          sourceEncoding: parser.encoding ?? 'utf-8',
          sourceBom: parser.bom,
          metaJson,
        },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      let message = 'Failed to load BMS file';
      if (err instanceof Error) {
        // User-friendly messages for common file system errors
        if (err.message.includes('ENOENT') || err.message.includes('no such file')) {
          message = i18next.t('errors:bms.fileNotFound');
        } else if (err.message.includes('EACCES') || err.message.includes('EPERM')) {
          message = i18next.t('errors:bms.fileAccessDenied');
        } else if (err.message.includes('EBUSY')) {
          message = i18next.t('errors:bms.fileBusy');
        } else {
          message = err.message;
        }
      }
      if (!isCurrent()) return;
      setState({
        chart: null,
        isLoading: false,
        error: message,
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ chart: null, isLoading: false, error: null });
  }, []);

  return { ...state, load, reset };
}

/** Global `#VOLWAV n`: percent of the keysound volume (default 100). */
export function parseVolWav(value: string | undefined): number {
  const v = value === undefined ? NaN : parseFloat(value);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 1000) : 100;
}
