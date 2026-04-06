# Phase 2 Plan: AudioPreloader Abort

**Phase:** 02-audiopreloader-abort
**Status:** Complete (implemented before GSD tracking)

## Overview

AudioPreloader에 `abort()` 메서드를 추가하여 `decodeAll()`/`loadAll()` 중 즉시 중단 가능하게 한다.

**Modified files:**
1. `bms-player/src/audio/loader/AudioPreloader.ts` — abort() 메서드 + aborted 플래그 추가

---

## Step 1: abort() 메서드 구현

**File:** `bms-player/src/audio/loader/AudioPreloader.ts`

- `private aborted = false` 플래그 추가
- `abort()` 메서드: `this.aborted = true` + 진행 중인 decode resolve 호출
- `decodeAll()` 내부 루프: `if (this.aborted) return` 체크
- `loadAll()` 내부: abort 시 즉시 resolve

**Acceptance criteria:**
- abort() 호출 후 decodeAll()이 각 decode 결과 저장을 스킵함
- abort() 호출 후 loadAll()이 DONE 수신 시 즉시 resolve함
- abort 상태에서 새 AudioPreloader 생성 시 독립적으로 동작함

---

## UAT Checklist

- [x] abort() 호출 후 decodeAll() 즉시 중단
- [x] abort() 호출 후 loadAll() 즉시 resolve
- [x] 새 인스턴스는 abort 상태에 영향받지 않음
