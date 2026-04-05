import { useState, useCallback } from 'react';
import { BMSParser, Timing, Positioning, Spacing, SongInfo, KeySounds, Notes } from '@rhythm-archive/bms-core';
import type { BMSChart, BMSNote, ISongInfoData } from '@rhythm-archive/bms-core';
import { detectKeyMode } from '@rhythm-archive/bms-editor';
import type { KeyMode, BpmChange, StopEvent, ScrollSpeedChange } from '@rhythm-archive/bms-editor';

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
  keysounds: Record<string, string>;
  positioning: Positioning | null;
  timing: Timing | null;
  // Full bms-core objects for Player (avoids re-parsing)
  spacing: Spacing | null;
  keysoundsObj: KeySounds | null;
  songInfoObj: SongInfo | null;
  barLines: number[];
  /** Raw BMSChart object for Editor (BMSWriter.fromBMSChart) */
  bmsChart: BMSChart | null;
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

  const load = useCallback(async (filePath: string) => {
    setState({ chart: null, isLoading: true, error: null });

    try {
      // Read file from disk via IPC
      const buffer = await window.api.file.readBms(filePath);
      const parser = new BMSParser();
      // readBuffer is async: reads buffer → detects encoding → returns string
      const bmsString = await parser.readBuffer(buffer);
      // compileString parses the BMS text into a BMSChart structure
      const chart = parser.compileString(bmsString);
      const songInfo = parser.getSongInfo();
      const notesObj = parser.getNotes();

      if (!notesObj) {
        throw new Error('Failed to parse notes');
      }

      const notes = notesObj.all();

      // Extract BPM info
      const bpmHeader = chart.headers.get('bpm');
      const initialBpm = bpmHeader ? parseFloat(bpmHeader) : 130;
      let minBpm = initialBpm;
      let maxBpm = initialBpm;

      const bpmChanges: BpmChange[] = [];
      const objects = chart.objects.allSorted();

      for (const obj of objects) {
        if (obj.channel === '03') {
          const bpmValue = parseInt(obj.value, 16);
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        } else if (obj.channel === '08') {
          const bpmValue = parseFloat(chart.headers.get('bpm' + obj.value) || '');
          if (!isNaN(bpmValue) && bpmValue > 0) {
            const beat = chart.measureToBeat(obj.measure, obj.fraction);
            bpmChanges.push({ beat, bpm: bpmValue });
            if (bpmValue < minBpm) minBpm = bpmValue;
            if (bpmValue > maxBpm) maxBpm = bpmValue;
          }
        }
      }

      // LN type
      const lnTypeHeader = chart.headers.get('lntype');
      const lnType = lnTypeHeader ? parseInt(lnTypeHeader) : 1;

      // STOP events
      const stops: StopEvent[] = [];
      for (const obj of objects) {
        if (obj.channel === '09') {
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
        }
      }

      // Scroll speed changes
      const scrollChanges: ScrollSpeedChange[] = [];
      for (const obj of objects) {
        if (obj.channel.toUpperCase() === 'SC') {
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

      // Keysound map
      const keysounds: Record<string, string> = {};
      chart.headers.each((key: string, value: string) => {
        const match = key.match(/^wav(\S\S)$/i);
        if (match) {
          keysounds[match[1].toLowerCase()] = value;
        }
      });

      // Build all bms-core objects (avoids re-parsing in Player)
      const timing = Timing.fromBMSChart(chart);
      const positioning = Positioning.fromBMSChart(chart, timing);
      const spacing = Spacing.fromBMSChart(chart);
      const keysoundsObj = KeySounds.fromBMSChart(chart);
      const songInfoObj = SongInfo.fromBMSChart(chart);

      // Build bar lines
      let maxMeasure = 0;
      for (const n of notes) {
        const m = Math.floor(n.beat / 4);
        if (m > maxMeasure) maxMeasure = m;
      }
      maxMeasure += 2;
      const barLines: number[] = [];
      for (let m = 0; m <= maxMeasure; m++) {
        barLines.push(chart.timeSignatures.measureToBeat(m, 0));
      }

      // Detect key mode (static import, no dynamic import)
      const keyMode = detectKeyMode(notes, chart.headers);

      // Calculate stats
      let total = 0, scratch = 0, longNotes = 0, landmines = 0, invisible = 0;
      for (const note of notes) {
        if (!note.column) continue;
        const noteType = note.noteType || 'playable';
        if (noteType === 'landmine') landmines++;
        else if (noteType === 'invisible') invisible++;
        else if (noteType === 'playable') {
          total++;
          if (note.column === 'SC' || note.column === 'SC2') scratch++;
          if (note.endBeat !== undefined) longNotes++;
        }
      }

      // Total beats
      let maxBeat = 0;
      for (const note of notes) {
        const endBeat = note.endBeat ?? note.beat;
        if (endBeat > maxBeat) maxBeat = endBeat;
      }

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
          totalBeats: Math.ceil(maxBeat) + 4,
          bpm: { initial: initialBpm, min: minBpm, max: maxBpm },
          bpmChanges,
          lnType,
          stats: { total, scratch, longNotes, landmines, invisible },
          stops,
          scrollChanges,
          keysounds,
          positioning,
          timing,
          spacing,
          keysoundsObj,
          songInfoObj,
          barLines,
          bmsChart: chart,
        },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      let message = 'Failed to load BMS file';
      if (err instanceof Error) {
        // User-friendly messages for common file system errors
        if (err.message.includes('ENOENT') || err.message.includes('no such file')) {
          message = '파일을 찾을 수 없습니다. 파일이 이동 또는 삭제되었을 수 있습니다.';
        } else if (err.message.includes('EACCES') || err.message.includes('EPERM')) {
          message = '파일에 접근할 수 없습니다. 권한을 확인해 주세요.';
        } else if (err.message.includes('EBUSY')) {
          message = '파일이 다른 프로그램에서 사용 중입니다.';
        } else {
          message = err.message;
        }
      }
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
