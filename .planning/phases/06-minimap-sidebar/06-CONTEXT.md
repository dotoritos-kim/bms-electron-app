# Phase 6: 수직 미니맵 사이드바 - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

에디터 최우측에 전용 수직 미니맵 strip을 추가한다.
기존 Minimap.tsx(Canvas 2D)를 새 위치에 통합하고, density bar와 북마크 마커를 추가한다.
클릭 이동과 뷰포트 팟은 기존 구현 그대로 활용.

**범위 외**: 레이어 패널 UI, 북마크 추가/삭제 UI (→ Phase 7)

</domain>

<decisions>
## Implementation Decisions

### 미니맵 위치 및 레이아웃
- **D-01**: 에디터 최우측에 별도 수직 strip 패널 추가 (너비 ~80px, 고정)
  - 기존 왼쪽 패널 하단 `h-48` MinimapBridge는 제거
  - 레이아웃: `[좌 패널] | [캔버스] | [우 패널] | [미니맵 strip]` 순서
- **D-02**: 헤더바에 별도 토글 버튼 추가 (현재 PanelRightOpen/Close는 NoteInfo 패널용 그대로 유지)
  - 미니맵 strip 전용 `showMinimap` 상태 (editorStore 또는 로컬 useState)
  - 기본값: 표시 (showMinimap = true)
- **D-03**: 커스텀 resize handle 패턴 사용 (react-resizable-panels 아님) — 기존 좌/우 패널과 동일한 방식

### 밀도 히트맵 시각화
- **D-04**: 미니맵 캔버스 왼쪽에 별도 ~8px density bar 추가
  - `densityToColor(normalized)` 색상 사용 (green→yellow→red)
  - density bar는 마디별 `MeasureDensity.normalized`로 색상 블록을 그림
  - 레인 노트 렌더링은 기존 그대로 유지 (상호 보완적)
- **D-05**: `computeDensityMap(notes, totalMeasures)` → useMemo로 캐싱

### 북마크 마커
- **D-06**: 미니맵 캔버스에 북마크 위치에 수평 선 + 오른쪽에 이름 텍스트 표시
  - 색상: `bookmark.color` 있으면 사용, 없으면 `#ffd700` (골드)
  - 선 두께: 1.5px
  - 이름: 8px 폰트, 우측 정렬 (canvas clipText로 overflow 방지)
  - 마커를 클릭하면 해당 위치로 이동 (기존 navigateFromEvent 활용)
- **D-07**: 북마크 데이터: `measure` 기준 → beat 변환 (1 measure = 4 beats 기본, 실제는 timeSignatures로 계산)

### Claude's Discretion
- 미니맵 strip 정확한 너비 (80~100px 범위에서 최적 선택)
- density bar와 노트 캔버스 사이 구분선 스타일 (1px border or gap)
- 북마크 이름 텍스트 최대 글자 수 (canvas 너비에 맞게 clamp)
- MinimapBridge 컴포넌트 재사용 vs 새 컴포넌트 생성

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 미니맵 구현
- `c:/SourceCode/bms-editor/src/chart/panels/Minimap.tsx` — 현재 Minimap 컴포넌트 (Canvas 2D, 뷰포트 팟, 클릭 이동 모두 구현됨)

### 밀도 히트맵 유틸리티
- `src/renderer/lib/densityMap.ts` — computeDensityMap(), densityToColor() 구현체

### 에디터 레이아웃 통합
- `src/renderer/routes/Editor.tsx` — MinimapBridge 위치, 패널 레이아웃, 커스텀 resize handle 패턴, showLeftPanel/showRightPanel 토글 패턴
- `src/renderer/stores/editorStore.ts` — bookmarks 상태 구조 ({ measure, name, color? }[])

### 요구사항
- `.planning/REQUIREMENTS.md` — MINI-01, MINI-02, MINI-03, MINI-04, BK-01, BK-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Minimap` (bms-editor): Canvas 2D, 뷰포트 팟, 클릭/드래그 이동 이미 구현 → density bar + 북마크 마커만 추가
- `MinimapBridge` (Editor.tsx:139): currentBeat Zustand 구독 격리 컴포넌트 → 재사용 또는 유사 패턴 적용
- `computeDensityMap` + `densityToColor` (densityMap.ts): beat 기반 밀도 계산 + 색상 변환 즉시 사용 가능
- `bookmarks` store 액션: addBookmark/removeBookmark/renameBookmark (Phase 6.2에서 구현됨)

### Established Patterns
- **패널 토글**: `showLeftPanel`/`showRightPanel` (editorStore boolean) + `localStorage` 너비 저장
- **커스텀 resize handle**: `onMouseDown → document.addEventListener → onUp` 패턴 (Editor.tsx 참고)
- **currentBeat 격리**: Bridge 컴포넌트 패턴 (high-frequency 업데이트 격리)
- **useMemo 캐싱**: 노트 관련 계산은 useMemo로 캐싱 (sortedNotes, bgmTickGroups 등)

### Integration Points
- **왼쪽 패널 하단** `h-48` MinimapBridge 제거
- **에디터 최우측**에 새 strip div 추가 (현재 우측 패널 오른쪽)
- **헤더바** 뷰 토글 그룹에 미니맵 토글 버튼 추가 (PanelLeftClose 버튼 근처)

</code_context>

<specifics>
## Specific Ideas

- density bar: 8px 고정 너비, 미니맵 왼쪽 가장자리에 붙임
- 미니맵 strip 너비: 80~100px (density bar 8px + 노트 캔버스 나머지)
- 북마크 수평선: 미니맵 전체 너비에 걸침 (density bar 포함)
- 기존 Minimap.tsx의 `beat` 기반 좌표 → 북마크는 `measure * beatsPerMeasure`로 beat 변환 필요

</specifics>

<deferred>
## Deferred Ideas

- 미니맵 드래그 스크롤 (클릭 이동으로 충분, Phase 7+로 연기)
- 북마크 이름 편집 UI (→ Phase 7)
- 미니맵 너비 리사이즈 (고정 너비로 충분)

</deferred>

---

*Phase: 06-minimap-sidebar*
*Context gathered: 2026-04-06*
