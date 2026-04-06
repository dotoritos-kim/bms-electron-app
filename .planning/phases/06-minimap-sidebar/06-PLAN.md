# Phase 6 Plan: 수직 미니맵 사이드바

**Goal**: 에디터 우측에 수직 Canvas 2D 미니맵이 표시되고, 클릭으로 이동하며, 뷰포트 위치와 노트 밀도가 시각화된다

## What Already Exists
- `Minimap` component in `bms-editor/src/chart/panels/Minimap.tsx` — Canvas 2D, click/drag navigate, viewport indicator ✓
- `MinimapBridge` in Editor.tsx — currentBeat isolation ✓
- `densityMap.ts` — `computeDensityMap()`, `densityToColor()` ✓
- `bookmarks` store actions — addBookmark/removeBookmark/renameBookmark ✓

## Gap Analysis
- MINI-01: Minimap hidden when `showRightPanel=false` → move to always-visible sidebar
- MINI-04: No density heatmap rendering → add densityData prop to Minimap
- BK-01/02: No bookmark markers in minimap → add bookmarks prop to Minimap

## Changes

### Plan 1: Minimap.tsx — add densityData + bookmarks props
**File**: `bms-editor/src/chart/panels/Minimap.tsx`

Add optional props:
```ts
densityData?: Array<{ normalized: number; color: string; startBeat: number; endBeat: number }>;
bookmarks?: Array<{ beat: number; name: string; color?: string }>;
```

Render order in canvas:
1. Background + lane backgrounds (existing)
2. **Density layer**: semi-transparent filled rect per measure entry
3. Measure lines (existing)
4. Notes (existing)
5. Viewport indicator (existing)
6. **Bookmark markers**: horizontal colored line at each bookmark's beat Y

### Plan 2: Editor.tsx — minimap sidebar + data wiring
**File**: `src/renderer/routes/Editor.tsx`

Changes:
1. Add `bookmarks` to `useShallow` selector
2. Import `computeDensityMap`, `densityToColor` from `'../lib/densityMap'`
3. Add `densityData` useMemo — calls computeDensityMap + densityToColor, maps to startBeat/endBeat using chart.barLines
4. Add `bookmarkBeats` useMemo — converts measure→beat via store.mfToBeat
5. Update `MinimapBridge` signature to accept + forward densityData, bookmarks
6. **Extract minimap from right panel** — remove the `h-48 shrink-0` minimap block from inside `showRightPanel`
7. **Add always-visible minimap sidebar** — a separate `<div>` (w-16 = 64px) at the far right of the editor flex row, outside `showRightPanel`, renders `MinimapBridge` whenever chart is loaded

## Acceptance Criteria
- [ ] Minimap visible even when right panel is hidden (MINI-01)
- [ ] Click on minimap navigates editor viewport (MINI-02) — existing behavior preserved
- [ ] Viewport box shows current position (MINI-03) — existing behavior preserved
- [ ] Density heatmap colors visible (green→red) per measure (MINI-04)
- [ ] Bookmark markers visible as horizontal lines on minimap (BK-01)
- [ ] Clicking near bookmark navigates there (BK-02) — via normal click handler
