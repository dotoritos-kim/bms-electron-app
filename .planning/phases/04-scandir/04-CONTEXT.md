# Phase 4: scanDir 병렬화 - Context

**Status:** Complete
**Goal:** 폴더 스캔 시 stat() 호출을 병렬화하여 대용량 폴더 성능 개선

## Implementation Decisions

- `readdir`로 BMS 파일 경로만 먼저 수집 (stat 없음)
- 수집된 경로를 `batchSize=20`으로 나눠 `Promise.all` 병렬 stat
- 반환 결과는 기존과 동일한 `BmsFileInfo[]` 타입

## Files Modified

- `src/main/ipc/file.ts` — `scanDir` → `collectBmsPaths` + 병렬 stat
