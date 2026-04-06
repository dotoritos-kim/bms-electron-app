# BMS Editor (bms-electron-app)

## Current Milestone: v1.1 에디터 UI 개선 — 미니맵 & 패널

**Goal:** 에디터 오른쪽에 수직 미니맵 사이드바를 추가하고, 타임라인 북마크·레이어 패널 UI를 완성한다.

**Target features:**
- 수직 사이드바 미니맵 (클릭 이동, 뷰포트 팟 표시, 노트 밀도 히트맵)
- 타임라인 북마크 UI (마커 시각화 + 클릭 이동)
- 레이어 패널 UI (visible/locked/opacity 토글)

## What This Is

Electron 기반 BMS 차트 에디터 앱. 리듬 게임용 .bms/.bme/.bml 파일을 편집하고 플레이할 수 있는 데스크톱 애플리케이션. React 19 + Three.js 기반 에디터 UI와 Web Audio API 기반 키음 재생 엔진을 갖춘다.

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
- **PERF-01**: Worker 기반 BMS 파싱 — Validated in Phase 1: BMS Parser Worker
- **PERF-02**: requestId 취소 가드 — Validated in Phase 1: BMS Parser Worker

- **PERF-03**: Editor abort + graceful shutdown — Validated in Phase 2+3: AudioPreloader Abort + Editor Graceful Shutdown
- **PERF-04**: 병렬 scanDir (batchSize=20) — Validated in Phase 4: scanDir 병렬화
- **TEST-01~05**: 회귀 테스트 33개 — Validated in Phase 5: 회귀 테스트

### Active

- **MINI-01**: 수직 사이드바 미니맵 컴포넌트
- **MINI-02**: 미니맵 클릭 이동
- **MINI-03**: 뷰포트 팟 표시
- **MINI-04**: 노트 밀도 히트맵 (densityMap.ts 연동)
- **BK-01**: 타임라인 북마크 UI (마커 + 클릭 이동)
- **LAYER-01**: 레이어 패널 UI (visible/locked/opacity 토글)

### Out of Scope

- .bms.meta 파싱 결과 캐시 — 이번 마일스톤 제외, 백로그
- AudioContext 앱 수준 싱글턴 — per-request 방식 유지
- Home에서 Timing/Positioning Worker 직렬화 — Home은 stats/headers만 필요

## Context

- **Stack**: Electron + React 19 + Three.js + Zustand + Vite
- **Local packages**: bms-core (파서/라이터), bms-player (게임 엔진), bms-editor (차트 에디터 UI)
- **현재 상태 (v1.0 shipped 2026-04-06)**: 파일 로딩 프리징 버그 수정 완료. BMS 파싱 Worker 이전, AudioPreloader abort, Editor graceful shutdown, scanDir 병렬화 모두 완료
- **Worker 패턴**: bmsParser.worker.ts (per-request), gameLoop.worker.ts, audioScheduler.worker.ts
- **테스트**: 1118/1118 통과 (5개 신규 회귀 테스트 스위트 포함)
- **현재 마일스톤 (v1.1)**: 에디터 미니맵 수직 사이드바 UI 개선 — 클릭 이동, 뷰포트 팟, 밀도 히트맵 + 북마크 UI + 레이어 패널 UI

## Constraints

- **Tech stack**: 기존 Worker 패턴 유지 (Vite `?worker` suffix import)
- **bms-core TextDecoder**: Worker 환경에서 동작 확인됨 (DOM API 미사용)
- **Transferable**: Worker postMessage 시 ArrayBuffer transfer (복사 없음)
- **테스트**: Vitest 4.x, vi.mock으로 Worker 모킹

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Home/Editor hook 분리 (useHomeBmsFile vs useLocalBmsFile) | Editor는 bmsChart 인스턴스 필요 (직렬화 불가) | ✓ Phase 1 |
| Worker per-request (매번 생성/종료) | 취소 = terminate(), 싱글턴보다 단순 | ✓ Phase 1 |
| Worker Phase1/2 자동 연속 실행 | 메시지 왕복 줄이고 Worker 내부 상태 불필요 | ✓ Phase 1 |
| requestId guard | PHASE2_DONE 레이스 컨디션 방지 | ✓ Phase 1 |
| inProgressPreloaderRef | cleanup 시 loadAll/decodeAll 중인 preloader 추적 | ✓ Phase 3 |
| AudioPreloader.abort() | decodeAll 중 즉시 bail-out 가능 | ✓ Phase 2 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 — milestone v1.1 started*
