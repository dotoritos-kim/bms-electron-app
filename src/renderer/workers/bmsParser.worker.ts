/**
 * BMS Parser Worker
 * Parses BMS files off the main thread in two phases:
 *   Phase 1: songInfo, bpm, keyMode, lnType  (fast — no note iteration)
 *   Phase 2: notes, stats, bpmChanges, stops, scrollChanges, keysounds, barLines
 *
 * Protocol:
 *   PARSE_PHASE1 {buffer: ArrayBuffer, requestId: number} → auto-runs both phases
 *   PHASE1_DONE  {requestId, ...phase1Data}
 *   PHASE2_DONE  {requestId, ...phase2Data}
 *   PARSE_ERROR  {requestId, error: string}
 */

import { BMSParser } from '@rhythm-archive/bms-core';
import { detectKeyMode } from '@rhythm-archive/bms-editor';

interface ParsePhase1Message {
  type: 'PARSE_PHASE1';
  buffer: ArrayBuffer;
  requestId: number;
}

type WorkerInMessage = ParsePhase1Message;

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { type, requestId } = event.data;

  if (type !== 'PARSE_PHASE1') return;

  const { buffer } = event.data;

  try {
    const parser = new BMSParser();
    const bmsString = await parser.readBuffer(buffer);
    const chart = parser.compileString(bmsString);

    // ── Phase 1: headers only ──────────────────────────────────────────────
    const songInfoObj = parser.getSongInfo();
    const songInfo = songInfoObj
      ? {
          title: songInfoObj.title,
          subtitles: songInfoObj.subtitles,
          artist: songInfoObj.artist,
          subartists: songInfoObj.subartists,
          genre: songInfoObj.genre,
          difficulty: songInfoObj.difficulty,
          level: songInfoObj.level,
        }
      : null;

    const bpmHeader = chart.headers.get('bpm');
    const initialBpm = bpmHeader ? parseFloat(bpmHeader) : 130;
    const lnTypeHeader = chart.headers.get('lntype');
    const lnType = lnTypeHeader ? parseInt(lnTypeHeader) : 1;

    // Quick keyMode from headers only (no note scan yet)
    const notesObj = parser.getNotes();
    const notes = notesObj ? notesObj.all() : [];
    const keyMode = detectKeyMode(notes, chart.headers);

    self.postMessage({
      type: 'PHASE1_DONE',
      requestId,
      songInfo,
      bpm: { initial: initialBpm, min: initialBpm, max: initialBpm },
      keyMode,
      lnType,
    });

    // ── Phase 2: full note/stats scan ─────────────────────────────────────
    const objects = chart.objects.allSorted();

    let minBpm = initialBpm;
    let maxBpm = initialBpm;
    const bpmChanges: Array<{ beat: number; bpm: number }> = [];

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

    const stops: Array<{ beat: number; duration: number }> = [];
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

    const scrollChanges: Array<{ beat: number; speed: number }> = [];
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

    const keysounds: Record<string, string> = {};
    chart.headers.each((key: string, value: string) => {
      const match = key.match(/^wav(\S\S)$/i);
      if (match) {
        keysounds[match[1].toLowerCase()] = value;
      }
    });

    let total = 0, scratch = 0, longNotes = 0, landmines = 0, invisible = 0;
    let maxMeasure = 0;
    let maxBeat = 0;

    for (const note of notes) {
      const endBeat = note.endBeat ?? note.beat;
      if (endBeat > maxBeat) maxBeat = endBeat;
      const { measure } = chart.timeSignatures.beatToMeasure(note.endBeat ?? note.beat);
      if (measure > maxMeasure) maxMeasure = measure;

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

    maxMeasure += 2;
    const barLines: number[] = [];
    for (let m = 0; m <= maxMeasure; m++) {
      barLines.push(chart.timeSignatures.measureToBeat(m, 0));
    }

    self.postMessage({
      type: 'PHASE2_DONE',
      requestId,
      notes,
      stats: { total, scratch, longNotes, landmines, invisible },
      bpm: { initial: initialBpm, min: minBpm, max: maxBpm },
      bpmChanges,
      stops,
      scrollChanges,
      keysounds,
      barLines,
      totalBeats: Math.ceil(maxBeat) + 4,
    });
  } catch (err) {
    self.postMessage({
      type: 'PARSE_ERROR',
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

self.onerror = (event: string | Event) => {
  // Crash-level error — requestId unknown, send -1 as sentinel.
  // OnErrorEventHandler signature is `string | Event`; narrow to ErrorEvent for .message access.
  const message = typeof event === 'string'
    ? event
    : (event as ErrorEvent).message ?? 'Worker crashed';
  self.postMessage({
    type: 'PARSE_ERROR',
    requestId: -1,
    error: message,
  });
};
