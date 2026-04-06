# Phase 6: 수직 미니맵 사이드바 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 06-minimap-sidebar
**Areas discussed:** 미니맵 위치 및 레이아웃, 밀도 히트맵 시각화, 북마크 마커 스타일

---

## 미니맵 위치 및 레이아웃

| Option | Description | Selected |
|--------|-------------|----------|
| 새 우측 strip | 에디터 가장 오른쪽에 별도 수직 패널 추가 (70~90px 고정 너비) | ✓ |
| 기존 우측 패널 내부 이동 | 현재 우측 패널(NoteInfoPanel 등)에 미니맵 이동 | |
| 왼쪽 패널 풀 높이 | 현재도 왼쪽에 있지만 h-48 → flex-1 풀 높이로 확장 | |

**User's choice:** 새 우측 strip (Recommended)
**Notes:** 헤더바에 별도 토글 버튼 추가, PanelRight 버튼(NoteInfo 패널용)과는 분리

---

## 밀도 히트맵 시각화

| Option | Description | Selected |
|--------|-------------|----------|
| 미니맵 왼쪽에 별도 density bar | ~8px 직선 density bar를 왼쪽에 추가. 레인 노트 렌더링과 상호 보완적 | ✓ |
| 레인 노트 대신 density blocks | 새 모드 — 레인 대신 전체 너비가 마디별 density 미리보기 color로 채움 | |
| 레인 노트 위에 오버레이 | density 진한 구역은 전체 배경에 density 색상 반투명 오버레이 | |

**User's choice:** 미니맵 왼쪽에 별도 density bar (Recommended)
**Notes:** densityToColor() 색상 그라디언트 사용

---

## 북마크 마커 스타일

| Option | Description | Selected |
|--------|-------------|----------|
| 수평 선 + 이름 | 해당 위치에 돌이끼는 수평선 (bookmark.color 또는 화이트). 오른쪽에 자른 이름 텍스트 | ✓ |
| 삼각형 마커 | 왼쪽 가장자리에 작은 삼각형 (6px). 클릭할 수 있는 영역이 오직 삼각형이라 제야함 | |
| 다이아몬드 + 라인 | 다이아몬드 마커(6px) + 미니맵 전체 너비에 수평선 조합 | |

**User's choice:** 수평 선 + 이름 (Recommended)
**Notes:** bookmark.color 없으면 #ffd700 (골드), 8px 폰트 canvas clipText

---

## Claude's Discretion

- 미니맵 strip 정확한 너비 (80~100px 범위)
- density bar와 노트 캔버스 사이 구분선 스타일
- 북마크 이름 텍스트 최대 글자 수

## Deferred Ideas

- 미니맵 드래그 스크롤 (Phase 7+ 연기)
- 북마크 이름 편집 UI (Phase 7)
- 미니맵 너비 리사이즈
