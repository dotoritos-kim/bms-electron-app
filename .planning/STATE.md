---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: 에디터 UI 개선 — 미니맵 & 패널
status: Defining requirements
last_updated: "2026-04-06T00:00:00.000Z"
last_activity: 2026-04-06
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** 파일 탐색, 노트 편집, 오디오 미리듣기가 모두 끊김 없이 동작
**Current focus:** v1.1 — 에디터 UI 개선 (미니맵, 북마크 UI, 레이어 패널)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-06 — Milestone v1.1 started

## Accumulated Context

### From v1.0 (carried forward)

- BMS 파싱 Worker: per-request (매번 생성/terminate로 취소) ✅
- Worker Protocol: PARSE_PHASE1 -> PHASE1_DONE -> PHASE2_DONE (자동 연속) ✅
- requestId guard: Phase2 메시지 레이스 컨디션 방지 ✅
- useHomeBmsFile (신규) vs useLocalBmsFile (Editor 기존 유지) ✅
- AudioPreloader.abort(): decodeAll/loadAll 내부 abort 플래그 체크 ✅
- inProgressPreloaderRef: cleanup에서 in-progress preloader 즉시 abort ✅
- App.tsx key={currentFile.path}: Editor 강제 리마운트 -> ref 초기화 ✅

### Existing Building Blocks (v1.1 활용 가능)

- densityMap.ts (Phase 7.1) — computeDensityMap(), densityToColor() 구현 완료
- addBookmark/removeBookmark/renameBookmark 액션 (Phase 6.2) — store에 있음
- LayerConfig + setLayerVisible/Locked/Opacity 액션 (Phase 4) — store에 있음
- react-resizable-panels v4 레이아웃 (Panel/Separator) — Editor.tsx에 적용 중
- MiniMap (MinimapBridge) — currentBeat 구독 브릿지 컴포넌트 있음

### Test Results

- Total: 1118/1118 tests passing (v1.0 기준)

## Blockers / Concerns

None
