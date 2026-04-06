# Phase 4 Plan: scanDir 병렬화

**Status:** Complete (commit b88ffa2)

## Step 1: collectBmsPaths + 병렬 stat

**File:** `src/main/ipc/file.ts`

- `scanDir` 함수를 `collectBmsPaths`로 rename — stat 없이 경로만 수집
- `file:listBmsFolder` handler에서 두 단계로 분리:
  1. `collectBmsPaths` → `Array<{name, path, ext}>`
  2. `batchSize=20` `Promise.all` 병렬 stat

**Acceptance criteria:**
- [ ] stat이 batchSize=20으로 병렬 실행됨
- [ ] 반환 결과가 기존과 동일함
- [ ] 재귀 스캔 정상 동작
