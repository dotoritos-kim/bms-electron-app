# Phase 5: 회귀 테스트 - Context

**Status:** Complete
**Goal:** 핵심 버그 수정에 대한 테스트를 추가하여 회귀를 방지

## Test Suites (5개)

1. `tests/unit/workers/bmsParser.worker.test.ts` — T1 Phase1, T2 Phase2, T3 PARSE_ERROR
2. `tests/unit/hooks/useHomeBmsFile.test.ts` — T4 requestId race condition
3. `tests/unit/routes/Editor-audio.test.ts` — T5 abort bail-out
4. `tests/unit/lib/AudioPreloader-abort.test.ts` — abort() 동작
5. `tests/unit/ipc/file-scandir.test.ts` — 병렬 stat 결과 동일성
