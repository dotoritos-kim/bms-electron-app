# Phase 5 Plan: 회귀 테스트

**Status:** Complete (commit c2205c6)

## Test Files

1. `tests/unit/workers/bmsParser.worker.test.ts` — bms-core 파싱 로직 직접 검증
2. `tests/unit/hooks/useHomeBmsFile.test.ts` — Worker 모킹 + requestId guard
3. `tests/unit/routes/Editor-audio.test.ts` — AudioPreloader abort bail-out
4. `tests/unit/lib/AudioPreloader-abort.test.ts` — abort() 동작 검증
5. `tests/unit/ipc/file-scandir.test.ts` — 병렬 stat (fs/promises 모킹)

## Acceptance criteria

- [ ] T1: Worker Phase1 — Shift-JIS 파일 제목 올바르게 반환
- [ ] T2: Worker Phase2 — 노트 수/stats 올바르게 반환
- [ ] T3: Worker PARSE_ERROR — 깨진 BMS 파일 → error 상태
- [ ] T4: requestId race — 구버전 PHASE2_DONE 결과 무시 확인
- [ ] T5: loadAudio abort — decodeAll 후 bail-out → preloader 해제 확인
- [ ] 모든 5개 테스트 파일이 vitest 통과
