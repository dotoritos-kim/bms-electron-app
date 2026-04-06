# Phase 1 Plan: BMS Parser Worker

**Phase:** 01-bms-parser-worker
**Status:** Ready to execute

## Overview

BMS 파싱을 Web Worker로 이전하여 메인 스레드 블로킹을 제거하고, Home 화면에 2단계 로딩(Phase1: 헤더 즉시 표시, Phase2: 노트/stats 업데이트)을 제공한다.

**New files:**
1. `src/renderer/workers/bmsParser.worker.ts` — Worker 내부 파싱 로직
2. `src/renderer/hooks/useHomeBmsFile.ts` — Worker 기반 Home 전용 hook

**Modified files:**
1. `src/renderer/routes/Home.tsx` — useLocalBmsFile → useHomeBmsFile 교체

---

## Step 1: bmsParser.worker.ts 생성

**File:** `src/renderer/workers/bmsParser.worker.ts`

Worker 프로토콜:
- `PARSE_PHASE1` 수신 → Phase1 파싱 → `PHASE1_DONE` 전송 → 자동으로 Phase2 실행 → `PHASE2_DONE` 전송
- 에러 발생 시 `PARSE_ERROR` 전송 (requestId 포함)
- Transferable ArrayBuffer: `postMessage(msg, [buffer])` 로 받음

Phase1 추출 데이터: songInfo(title/artist/genre/level), bpm(initial/min/max), keyMode, lnType
Phase2 추출 데이터: notes[], stats, bpmChanges[], stops[], scrollChanges[], keysounds{}, barLines[]

**Acceptance criteria:**
- Worker가 Vite `?worker` suffix로 import 가능
- PARSE_PHASE1 메시지 수신 시 파싱 시작
- PHASE1_DONE: requestId + Phase1 데이터 포함
- PHASE2_DONE: requestId + 전체 데이터 포함
- PARSE_ERROR: requestId + error.message 포함
- Worker try/catch + onerror 핸들러 양쪽 에러 처리

---

## Step 2: useHomeBmsFile.ts 생성

**File:** `src/renderer/hooks/useHomeBmsFile.ts`

State shape:
```ts
interface HomeBmsChartInfo {
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
}

interface UseHomeBmsFileState {
  chart: HomeBmsChartInfo | null;
  isLoading: boolean;
  phase: 'idle' | 'phase1' | 'ready';
  error: string | null;
}
```

동작:
- `load(filePath)` 호출 시:
  1. `++requestIdRef.current` 로 requestId 증가
  2. 이전 Worker `terminate()`
  3. `window.api.file.readBms(filePath)` 로 ArrayBuffer 읽기
  4. `new BmsParserWorker()` 생성, `inWorkerRef`에 저장
  5. `worker.postMessage({ type: 'PARSE_PHASE1', buffer, requestId }, [buffer])`
  6. `onmessage`에서:
     - `PHASE1_DONE`: requestId 확인 후 phase: 'phase1' setState (songInfo/bpm/keyMode/lnType)
     - `PHASE2_DONE`: requestId 확인 후 phase: 'ready' setState (전체 데이터)
     - `PARSE_ERROR`: requestId 확인 후 error setState
  7. `onerror`: error setState
- `reset()`: state 초기화, Worker terminate

**Acceptance criteria:**
- per-request Worker (파일마다 새 Worker 생성)
- requestId 불일치 메시지 무시
- PHASE1_DONE 수신 시 phase: 'phase1' (제목/BPM/키모드 즉시 표시)
- PHASE2_DONE 수신 시 phase: 'ready' (stats 완성)
- 파일 B 선택 시 파일 A Worker terminate()
- 에러 시 error 상태 설정

---

## Step 3: Home.tsx 업데이트

**File:** `src/renderer/routes/Home.tsx`

변경 사항:
1. `import { useLocalBmsFile }` → `import { useHomeBmsFile }`
2. `const { chart, isLoading, error, load } = useLocalBmsFile()` → `const { chart, isLoading, phase, error, load } = useHomeBmsFile()`
3. StatCard에서 phase === 'phase1'인 동안 stats 카드(Total Notes, Long Notes, Scratch, Keysounds)에 `"..."` 또는 로딩 표시

**UI 변경:**
- `phase === 'phase1'` 동안: 제목/아티스트/BPM/키모드는 즉시 표시, stats 카드는 `"..."` 표시
- `phase === 'ready'` 시: 모든 데이터 표시
- `isLoading` (phase1 도달 전): 기존 스피너 유지

**Acceptance criteria:**
- Home.tsx에서 useLocalBmsFile 미사용
- 파일 선택 즉시 제목/BPM/키모드 표시
- stats 카드가 Phase2 완료 전 `"..."` 표시
- Phase2 완료 후 정확한 stats 표시

---

## UAT Checklist

- [ ] 파일 선택 후 UI가 즉시 반응 (스피너 → 제목 즉시 표시)
- [ ] Phase1 완료 후 제목/아티스트/BPM/키모드 즉시 표시
- [ ] Phase2 완료 후 stats(노트 수 등) 업데이트
- [ ] 파일 B 선택 시 파일 A 로딩 취소 (이전 Worker terminate)
- [ ] 빠른 연속 선택 시 마지막 파일 결과만 표시
- [ ] 깨진 BMS 파일 → error 상태 표시
- [ ] 기존 useLocalBmsFile (Editor용) 미변경
