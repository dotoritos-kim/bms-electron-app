# Milestones

## v1.0 파일 로딩 프리징 버그 수정 (Shipped: 2026-04-06)

**Phases completed:** 5 phases, 5 plans, 3 tasks

**Key accomplishments:**

- BMS 파싱 Worker 이전 (PHASE1_DONE <50ms 헤더, PHASE2_DONE stats) — 메인 스레드 UI 프리징 완전 제거
- AudioPreloader.abort() 구현 — decodeAll/loadAll 즉시 중단, 고아 Promise 제거
- Editor 언마운트 시 graceful shutdown (inProgressPreloaderRef + loadAbortRef + App key 리마운트)
- scanDir batchSize=20 병렬 stat — 대용량 폴더 최대 20x 성능 향상
- 회귀 테스트 5개 스위트 33개 추가 — 1118/1118 통과

**Git range:** 76d118e → bba97c2
**Files:** 33 changed, +2507 / -74 lines

---
