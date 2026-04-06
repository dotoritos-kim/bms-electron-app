# Roadmap — Milestone v1.0: 파일 로딩 프리징 버그 수정

## Overview

**5 phases** | **15 requirements mapped** | All covered

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | BMS Parser Worker | BMS 파싱을 Worker로 이전, 2단계 로딩 | PERF-01~04, CANCEL-01~02 | Complete (2c49ec1) |
| 2 | AudioPreloader Abort | abort() 메서드로 decodeAll 즉시 중단 | AUDIO-01~03 (일부) | Not Started |
| 3 | Editor Graceful Shutdown | loadAbortRef + inProgressPreloaderRef + App key | AUDIO-01~03 (완결) | Not Started |
| 4 | scanDir 병렬화 | batchSize=20 병렬 stat | SCAN-01 | Not Started |
| 5 | 회귀 테스트 | 5개 신규 테스트 스위트 | TEST-01~05 | Not Started |

---

## Phase 1: BMS Parser Worker

**Goal:** BMS 파싱을 Web Worker로 이전하여 메인 스레드 블로킹을 제거하고 2단계 로딩으로 즉각적인 UI 피드백 제공

**Requirements:** PERF-01, PERF-02, PERF-03, PERF-04, CANCEL-01, CANCEL-02

**Files:**
- `src/renderer/workers/bmsParser.worker.ts` (신규)
- `src/renderer/hooks/useHomeBmsFile.ts` (신규)

**Success criteria:**
1. 파일 선택 후 메인 스레드가 블로킹되지 않음 (UI 즉시 반응)
2. Phase 1 완료 즉시 제목/아티스트/BPM 표시 (phase: 'phase1' 상태)
3. Phase 2 완료 후 노트 수/stats 업데이트 (phase: 'ready' 상태)
4. 파일 B 선택 시 파일 A Worker가 terminate() 됨
5. requestId 불일치 시 구버전 결과 무시됨
6. Worker 파싱 오류 시 error 상태 표시 (PARSE_ERROR 메시지)

---

## Phase 2: AudioPreloader Abort

**Goal:** AudioPreloader에 abort() 메서드를 추가하여 decodeAll/loadAll 중 즉시 중단 가능하게 함

**Requirements:** AUDIO-01, AUDIO-02, AUDIO-03 (인프라)

**Files:**
- `bms-player/src/audio/loader/AudioPreloader.ts`

**Success criteria:**
1. `abort()` 호출 후 decodeAll()이 각 decode 결과 저장을 스킵함
2. `abort()` 호출 후 loadAll()이 DONE 수신 시 즉시 resolve함
3. abort 상태에서 새 AudioPreloader 생성 시 독립적으로 동작함

---

## Phase 3: Editor Graceful Shutdown

**Goal:** Editor 언마운트 시 in-progress 오디오 로딩을 즉시 중단하고 리소스를 안전하게 해제

**Requirements:** AUDIO-01, AUDIO-02, AUDIO-03 (완결)

**Files:**
- `src/renderer/routes/Editor.tsx`
- `src/renderer/App.tsx`

**Success criteria:**
1. Editor 언마운트 시 inProgressPreloaderRef.current?.abort() 호출됨
2. loadAudio의 3개 bail-out 체크포인트에서 abort 감지 시 즉시 반환
3. App.tsx key={currentFile.path}로 파일 변경 시 Editor 강제 리마운트
4. 리마운트 후 autoLoadedRef, loadAbortRef 등 모든 ref가 초기화됨

---

## Phase 4: scanDir 병렬화

**Goal:** 폴더 스캔 시 stat() 호출을 병렬화하여 대용량 폴더 성능 개선

**Requirements:** SCAN-01

**Files:**
- `src/main/ipc/file.ts`

**Success criteria:**
1. BMS 파일 stat이 batchSize=20으로 병렬 실행됨
2. 병렬화 후 반환 결과가 기존과 동일함 (순서는 무관)
3. 깊은 서브디렉토리 구조에서도 올바르게 동작함

---

## Phase 5: 회귀 테스트

**Goal:** 핵심 버그 수정에 대한 테스트를 추가하여 회귀를 방지

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04, TEST-05

**Files:**
- `tests/unit/workers/bmsParser.worker.test.ts` (신규)
- `tests/unit/hooks/useHomeBmsFile.test.ts` (신규)
- `tests/unit/routes/Editor-audio.test.ts` (신규)
- `tests/unit/lib/AudioPreloader-abort.test.ts` (신규)
- `tests/unit/ipc/file-scandir.test.ts` (신규)

**Success criteria:**
1. T1: Worker Phase1 — Shift-JIS 파일 제목 올바르게 반환
2. T2: Worker Phase2 — 노트 수/stats 올바르게 반환
3. T3: Worker PARSE_ERROR — 깨진 BMS 파일 → error 상태
4. T4: requestId race — 구버전 PHASE2_DONE 결과 무시 확인
5. T5: loadAudio abort — decodeAll 후 bail-out → preloader 해제 확인
6. 모든 5개 테스트 파일이 vitest 통과
