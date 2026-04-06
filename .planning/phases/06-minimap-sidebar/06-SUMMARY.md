# Phase 6 Summary — 수직 미니맵 사이드바

**Status**: COMPLETE
**Completed**: 2026-04-06
**Commit**: 6ede91e (feat(v1.0): complete editor features, test infrastructure, and CI/CD)

## What Was Built

### Minimap Canvas 2D Component (bms-editor)
- `bms-editor/src/chart/panels/Minimap.tsx` — added `densityData` and `bookmarks` props
  - Density heatmap layer rendered as semi-transparent filled rects per measure (behind lane backgrounds)
  - Bookmark markers rendered as horizontal colored lines + left triangle indicators
  - Updated `useEffect` deps to include `densityData, bookmarks`
- `bms-editor/src/index.ts` — exported new types `MinimapDensityEntry`, `MinimapBookmark`

### Editor Integration (bms-electron-app)
- `src/renderer/routes/Editor.tsx`:
  - Imported `computeDensityMap`, `densityToColor` from `lib/densityMap`
  - Imported `MinimapDensityEntry`, `MinimapBookmark` types from `@rhythm-archive/bms-editor`
  - Added `bookmarks` to `useShallow` selector
  - Added `minimapDensityData` useMemo — pre-computes density per measure with color strings
  - Added `minimapBookmarks` useMemo — converts bookmark store entries (measure) to beat space via `store.mfToBeat`
  - Updated `MinimapBridge` to accept and pass `densityData` + `bookmarks` props
  - Removed minimap from inside `showRightPanel` conditional block
  - Added always-visible `w-16` minimap sidebar (renders when chart is loaded), `data-testid="minimap-sidebar"`

### Performance Fixes (QA)
- `src/renderer/hooks/useLocalBmsFile.ts`:
  - Added `await new Promise<void>((r) => setTimeout(r, 0))` yield after `compileString()` to let UI repaint before sync work
  - Merged 3 separate O(N) loops (BPM changes, stops, scroll speed) into 1 single pass
- `src/renderer/routes/Editor.tsx`:
  - `initFromChart` useEffect made async with `cancelled` ref to prevent stale state updates
  - Added yield after `BMSWriter.fromBMSChart()` to allow UI update before note mapping

## Requirements Covered

| REQ-ID | Status |
|--------|--------|
| MINI-01 | ✅ 에디터 우측 w-16 사이드바 항상 표시 |
| MINI-02 | ✅ 클릭 → `onNavigate(beat)` → `store.setCurrentBeat` |
| MINI-03 | ✅ 뷰포트 팟: 반투명 dim + `#6699ff` 테두리 |
| MINI-04 | ✅ densityMap.ts 색상 히트맵 오버레이 |
| BK-01 | ✅ 북마크 마커 — 수평선 + 삼각형 인디케이터 |
| BK-02 | ✅ 북마크 클릭 → 미니맵 navigateFromEvent |

## Tests

No new tests added (UI components — Canvas 2D rendering is non-testable in jsdom).
All 1118/1118 existing tests continue to pass.
TypeScript check clean (npx tsc --noEmit --skipLibCheck).
