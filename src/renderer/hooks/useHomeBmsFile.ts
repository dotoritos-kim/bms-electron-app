import { useState, useCallback, useRef } from 'react';
import type { BMSNote, ISongInfoData } from '@rhythm-archive/bms-core';
import type { KeyMode, BpmChange, StopEvent, ScrollSpeedChange } from '@rhythm-archive/bms-editor';
import BmsParserWorker from '../workers/bmsParser.worker?worker';

export interface HomeBmsChartInfo {
  songInfo: ISongInfoData | null;
  keyMode: KeyMode;
  bpm: { initial: number; min: number; max: number };
  lnType: number;
  notes: BMSNote[];
  stats: { total: number; scratch: number; longNotes: number; landmines: number; invisible: number };
  bpmChanges: BpmChange[];
  stops: StopEvent[];
  scrollChanges: ScrollSpeedChange[];
  keysounds: Record<string, string>;
  barLines: number[];
  totalBeats: number;
}

export type HomeBmsPhase = 'idle' | 'phase1' | 'ready';

interface UseHomeBmsFileState {
  chart: HomeBmsChartInfo | null;
  isLoading: boolean;
  phase: HomeBmsPhase;
  error: string | null;
}

// Phase1 data cached in a ref so Phase2 can merge it
interface Phase1Cache {
  songInfo: ISongInfoData | null;
  keyMode: KeyMode;
  bpm: { initial: number; min: number; max: number };
  lnType: number;
}

export function useHomeBmsFile() {
  const [state, setState] = useState<UseHomeBmsFileState>({
    chart: null,
    isLoading: false,
    phase: 'idle',
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const phase1CacheRef = useRef<Phase1Cache | null>(null);

  const load = useCallback(async (filePath: string) => {
    // Increment requestId — any prior Worker message with old id will be ignored
    const reqId = ++requestIdRef.current;

    // Terminate previous Worker immediately
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    phase1CacheRef.current = null;

    setState({ chart: null, isLoading: true, phase: 'idle', error: null });

    let buffer: ArrayBuffer;
    try {
      buffer = await window.api.file.readBms(filePath);
    } catch (err) {
      // Guard: if a newer request already started, discard this error
      if (reqId !== requestIdRef.current) return;
      setState({
        chart: null,
        isLoading: false,
        phase: 'idle',
        error: err instanceof Error ? err.message : '파일을 읽을 수 없습니다.',
      });
      return;
    }

    // Guard: another file was selected while awaiting readBms
    if (reqId !== requestIdRef.current) return;

    const worker = new BmsParserWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;

      // Ignore stale messages from a previous request
      if (data.requestId !== reqId) return;

      if (data.type === 'PHASE1_DONE') {
        const p1: Phase1Cache = {
          songInfo: data.songInfo,
          keyMode: data.keyMode,
          bpm: data.bpm,
          lnType: data.lnType,
        };
        phase1CacheRef.current = p1;

        setState({
          chart: {
            songInfo: p1.songInfo,
            keyMode: p1.keyMode,
            bpm: p1.bpm,
            lnType: p1.lnType,
            // Phase2 data not yet available — zeroed out
            notes: [],
            stats: { total: 0, scratch: 0, longNotes: 0, landmines: 0, invisible: 0 },
            bpmChanges: [],
            stops: [],
            scrollChanges: [],
            keysounds: {},
            barLines: [],
            totalBeats: 0,
          },
          isLoading: true,
          phase: 'phase1',
          error: null,
        });
      } else if (data.type === 'PHASE2_DONE') {
        const p1 = phase1CacheRef.current;
        setState({
          chart: {
            // Merge Phase1 headers with Phase2 note data
            songInfo: p1?.songInfo ?? null,
            keyMode: p1?.keyMode ?? '7K',
            lnType: p1?.lnType ?? 1,
            bpm: data.bpm, // Phase2 has accurate min/max
            notes: data.notes,
            stats: data.stats,
            bpmChanges: data.bpmChanges,
            stops: data.stops,
            scrollChanges: data.scrollChanges,
            keysounds: data.keysounds,
            barLines: data.barLines,
            totalBeats: data.totalBeats,
          },
          isLoading: false,
          phase: 'ready',
          error: null,
        });
        worker.terminate();
        workerRef.current = null;
      } else if (data.type === 'PARSE_ERROR') {
        setState({ chart: null, isLoading: false, phase: 'idle', error: data.error });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      if (reqId !== requestIdRef.current) return;
      setState({
        chart: null,
        isLoading: false,
        phase: 'idle',
        error: event.message ?? 'BMS 파싱 중 오류가 발생했습니다.',
      });
      workerRef.current = null;
    };

    // Transfer buffer ownership to Worker (zero-copy)
    worker.postMessage({ type: 'PARSE_PHASE1', buffer, requestId: reqId }, [buffer]);
  }, []);

  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    requestIdRef.current++;
    phase1CacheRef.current = null;
    setState({ chart: null, isLoading: false, phase: 'idle', error: null });
  }, []);

  return { ...state, load, reset };
}
