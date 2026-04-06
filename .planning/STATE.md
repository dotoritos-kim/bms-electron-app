# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** 파일 탐색, 노트 편집, 오디오 미리듣기가 모두 끊김 없이 동작
**Current focus:** Milestone v1.0 시작 — 파일 로딩 프리징 버그 수정

## Current Position

Phase: Not started (defining requirements)
Plan: --
Status: Defining requirements
Last activity: 2026-04-06 -- Milestone v1.0 started

## Accumulated Context

### Architecture Decisions (from CEO+Eng Review)
- BMS 파싱 Worker: per-request (매번 생성/terminate로 취소)
- Worker Protocol: PARSE_PHASE1 -> PHASE1_DONE -> PHASE2_DONE (자동 연속)
- requestId guard: Phase2 메시지 레이스 컨디션 방지
- useHomeBmsFile (신규) vs useLocalBmsFile (Editor 기존 유지)
- AudioPreloader.abort(): decodeAll/loadAll 내부 abort 플래그 체크
- inProgressPreloaderRef: cleanup에서 in-progress preloader 즉시 abort
- App.tsx key={currentFile.path}: Editor 강제 리마운트 -> ref 초기화
- scanDir: batchSize=20 병렬 stat

### Root Causes Identified
- BUG-1: useLocalBmsFile.load() 6개 동기 블록이 렌더러 메인 스레드 블로킹
- BUG-2: 취소 메커니즘 없음 -> 빠른 연속 선택 시 sync work 누적
- BUG-3: Editor 언마운트 후 decodeAll() 고아 Promise 수십 초 실행

### Test Plan (5 new suites)
- tests/unit/workers/bmsParser.worker.test.ts (T1 Phase1, T2 Phase2, T3 PARSE_ERROR)
- tests/unit/hooks/useHomeBmsFile.test.ts (T4 requestId race)
- tests/unit/routes/Editor-audio.test.ts (T5 abort bail-out)
- tests/unit/ipc/file-scandir.test.ts (parallel stat)
- tests/unit/lib/AudioPreloader-abort.test.ts (abort() method)

## Blockers / Concerns

None
