# BMS Editor (bms-electron-app)

## What This Is

Electron 기반 BMS 차트 에디터 앱. 리듬 게임용 .bms/.bme/.bml 파일을 편집하고 플레이할 수 있는 데스크톱 애플리케이션. React 19 + Three.js 기반 에디터 UI, Web Audio API 기반 키음 재생 엔진, Canvas 2D 미니맵·레이어 패널을 갖춘다.

## Core Value

에디터에서 차트를 빠르고 직관적으로 편집할 수 있어야 한다 — 파일 탐색, 노트 편집, 오디오 미리듣기가 모두 끊김 없이 동작해야 한다.

## Requirements

### Validated

- tick 기반 노트 시스템 (960 ticks/beat) — Phase 1-7 완료
- Web Worker 기반 오디오 스케줄러 (Alt-tab 문제 해결)
- 에디터 스토어 (Zustand) — 전체 에디터 상태 관리
- 파일 IPC 인프라 (read/save/autosave/meta)
- 홈 화면 파일 브라우저 (폴더 스캔 + 최근 파일)
- AudioPreloader (IndexedDB 캐시, progressive decode, EQ/컴프레서)
- **PERF-01**: Worker 기반 BMS 파싱 — v1.0
- **PERF-02**: requestId 취소 가드 — v1.0
- **PERF-03**: Editor abort + graceful shutdown — v1.0
- **PERF-04**: 병렬 scanDir (batchSize=20) — v1.0
- **TEST-01~05**: 회귀 테스트 33개 — v1.0
- **MINI-01**: 수직 사이드바 미니맵 컴포넌트 — v1.1
- **MINI-02**: 미니맵 클릭 이동 — v1.1
- **MINI-03**: 뷰포트 팟 표시 — v1.1
- **MINI-04**: 노트 밀도 히트맵 — v1.1
- **BK-01/02**: 타임라인 북마크 마커 + 클릭 이동 — v1.1
- **BK-03**: Ctrl+B 북마크 추가/삭제 — v1.1
- **LAYER-01**: 레이어 가시성 토글 — v1.1
- **LAYER-02**: 레이어 잠금 토글 — v1.1
- **LAYER-03**: 레이어 불투명도 슬라이더 — v1.1

### Active

(Next milestone requirements — defined when /gsd:new-milestone is run)

### Out of Scope

- .bms.meta 파싱 결과 캐시 — 백로그
- AudioContext 앱 수준 싱글턴 — per-request 방식 유지
- Home에서 Timing/Positioning Worker 직렬화 — Home은 stats/headers만 필요
- 미니맵 드래그 스크롤 — v1.1에서 클릭 이동만 구현
- 북마크 이름 편집 UI — renameBookmark 액션은 있으나 UI 미구현
- 레이어 커스텀 이름 지정

## Context

- **Stack**: Electron + React 19 + Three.js + Zustand + Vite
- **Local packages**: bms-core (파서/라이터), bms-player (게임 엔진), bms-editor (차트 에디터 UI)
- **현재 상태 (v1.1 shipped 2026-04-06)**: 미니맵 사이드바 + 북마크 UI + 레이어 패널 완료
- **Worker 패턴**: bmsParser.worker.ts (per-request), gameLoop.worker.ts, audioScheduler.worker.ts
- **테스트**: 1118/1118 통과 (Vitest 4.x)
- **파일 규모**: Editor.tsx ~1900줄, editorStore.ts ~1500줄

## Constraints

- **Tech stack**: 기존 Worker 패턴 유지 (Vite `?worker` suffix import)
- **bms-core TextDecoder**: Worker 환경에서 동작 확인됨 (DOM API 미사용)
- **Transferable**: Worker postMessage 시 ArrayBuffer transfer (복사 없음)
- **테스트**: Vitest 4.x, vi.mock으로 Worker 모킹

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Home/Editor hook 분리 (useHomeBmsFile vs useLocalBmsFile) | Editor는 bmsChart 인스턴스 필요 (직렬화 불가) | ✓ v1.0 |
| Worker per-request (매번 생성/종료) | 취소 = terminate(), 싱글턴보다 단순 | ✓ v1.0 |
| Worker Phase1/2 자동 연속 실행 | 메시지 왕복 줄이고 Worker 내부 상태 불필요 | ✓ v1.0 |
| requestId guard | PHASE2_DONE 레이스 컨디션 방지 | ✓ v1.0 |
| inProgressPreloaderRef | cleanup 시 loadAll/decodeAll 중인 preloader 추적 | ✓ v1.0 |
| AudioPreloader.abort() | decodeAll 중 즉시 bail-out 가능 | ✓ v1.0 |
| Canvas 2D minimap (not Three.js) | 경량 — rAF 없이 React useEffect로 충분 | ✓ v1.1 |
| MinimapDensityEntry color pre-computed | 앱에서 densityToColor() 계산 후 string 전달 — bms-editor 순환 의존 방지 | ✓ v1.1 |
| showMinimap toggle (default: true) | 사용자가 숨길 수 있음 — MINI-01 기본 표시로 충족 | ✓ v1.1 |
| LayerPanel inline component in Editor.tsx | 단일 위치에서만 사용 — 별도 파일 불필요 | ✓ v1.1 |
| Ctrl+B toggle (not always-add) | 직관적 — 같은 위치 재호출 시 삭제 | ✓ v1.1 |
| async initFromChart + yield | BMS 파싱 후 macrotask yield로 UI 프리징 방지 | ✓ v1.1 QA |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-04-06 — v1.1 milestone shipped*
