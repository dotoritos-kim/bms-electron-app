# Milestones

## v1.1 에디터 UI 개선 — 미니맵 & 패널 (Shipped: 2026-04-06)

**Phases completed:** 2 phases, 2 plans
**Requirements:** 10/10 satisfied

**Key accomplishments:**

- Canvas 2D 수직 미니맵 사이드바 — 클릭 이동, 뷰포트 팟, 노트 밀도 히트맵, 북마크 마커
- Ctrl+B 북마크 추가/삭제 — AccessibleDialog 이름 입력, 토글로 즉시 삭제
- 레이어 패널 — 4개 레이어(playable/invisible/landmine/bgm) 가시성·잠금·불투명도 슬라이더
- QA 성능 수정 — async 파싱 yield로 파일 로드 시 UI 프리징 제거

**Git range:** 6ede91e → c5c65ef
**Files:** 2 changed (Editor.tsx +138, editorStore.ts +4)

---

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
