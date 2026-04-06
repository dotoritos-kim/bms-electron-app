# Phase 4 Summary: scanDir 병렬화

**Status:** Complete
**Commit:** b88ffa2

## What Was Built

`src/main/ipc/file.ts`에서 `scanDir` 함수를 두 단계로 분리:

1. `collectBmsPaths()` — readdir만으로 BMS 파일 경로 수집 (stat 없음)
2. `file:listBmsFolder` — batchSize=20 병렬 stat으로 파일 정보 수집

## Results

- stat 호출이 20개씩 병렬로 실행됨
- 대용량 폴더에서 최대 20x 성능 향상 가능
- 기존 동작 완전 호환 (BmsFileInfo[] 타입 동일)
- 테스트: `tests/unit/ipc/file-scandir.test.ts` (6개 통과)

## Requirements Satisfied

- SCAN-01: BMS 파일 stat이 batchSize=20으로 병렬 실행됨
