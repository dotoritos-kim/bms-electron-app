---
phase: 06-minimap-sidebar
plan: 01
subsystem: editor-minimap
tags: [minimap, density-bar, bookmarks, ui-toggle]
dependency_graph:
  requires: []
  provides: [MINI-04, BK-01, showMinimap-toggle]
  affects: [Editor.tsx, Minimap.tsx, editorStore.ts]
tech_stack:
  added: []
  patterns: [Canvas 2D rendering, Zustand boolean toggle, Lucide icon import alias]
key_files:
  created: []
  modified:
    - c:/SourceCode/bms-editor/src/chart/panels/Minimap.tsx
    - c:/SourceCode/bms-electron-app/src/renderer/stores/editorStore.ts
    - c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx
decisions:
  - "DENSITY_BAR_WIDTH=8 constant in useEffect render scope (not module-level) for clarity"
  - "Map icon imported as LucideMap to avoid conflict with JS Map global"
  - "Toggle button shows active state: text-zinc-200 when minimap visible vs text-zinc-400 when hidden"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-06T12:47:49Z"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 3
---

# Phase 06 Plan 01: Minimap Density Bar + Bookmark Text + showMinimap Toggle Summary

**One-liner:** 8px density bar as dedicated left strip with separator line, bookmark right-aligned name text replacing triangle indicator, 80px sidebar width, and header bar toggle button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refine Minimap density bar and bookmark rendering | bms-editor@c6e456b | Minimap.tsx |
| 2 | Add showMinimap toggle state and update Editor.tsx layout | d15827c | editorStore.ts, Editor.tsx |

## Task 3: Awaiting Human Verification

Checkpoint: `human-verify` — visual and functional check required before plan is complete.

## What Was Built

### Task 1 — Minimap.tsx (bms-editor)

- `DENSITY_BAR_WIDTH = 8` constant in render scope
- `hasDensity` flag used to compute `padX`: `DENSITY_BAR_WIDTH + 2` (10) when density present, `2` otherwise
- `laneW` recalculated: `(cw - padX - 2) / laneCount` to account for density bar space
- Density rectangles drawn in left 8px only: `fillRect(0, y1, DENSITY_BAR_WIDTH, stripH)` at `globalAlpha = 0.85`
- 1px vertical separator at `x = DENSITY_BAR_WIDTH` in color `#2a2a44`
- Bookmark triangle indicator removed
- Bookmark name text: `textAlign='right'`, `textBaseline='bottom'`, 8px sans-serif, clipped to `cw - 4` max width, drawn at `(cw - 2, y - 2)`

### Task 2 — editorStore.ts + Editor.tsx (bms-electron-app)

- `showMinimap: boolean` added to EditorState type (line 264)
- `toggleMinimap: () => void` added to actions type (line 372)
- `showMinimap: true` in initial state (line 473)
- `toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap }))` implementation (line 1442)
- `Map as LucideMap` imported from lucide-react
- `showMinimap: s.showMinimap` added to useShallow selector
- Toggle button: `data-testid="toggle-minimap"`, active indicator via text color
- Sidebar condition: `{chart && showMinimap && (`
- Sidebar width: `w-20` (80px, was `w-16` 64px)

## Deviations from Plan

### Pre-existing TypeScript Errors in bms-editor

- **Found during:** Task 1 verification
- **Issue:** `npx tsc --noEmit --skipLibCheck` exits non-zero in bms-editor due to 4 pre-existing errors in `editorUtils.ts` and `NoteChartEditor.tsx` (`bgmChannel` property mismatch)
- **Action:** These errors are in unrelated files not touched by this plan. `Minimap.tsx` itself has no TypeScript errors.
- **Rule:** Out-of-scope pre-existing errors per deviation scope boundary — logged to deferred-items

## Known Stubs

None — density data wiring (`minimapDensityData`) and bookmark wiring (`minimapBookmarks`) were already implemented in MinimapBridge. All data flows correctly.

## Self-Check

- [x] `c:/SourceCode/bms-editor/src/chart/panels/Minimap.tsx` — modified (bms-editor commit c6e456b)
- [x] `c:/SourceCode/bms-electron-app/src/renderer/stores/editorStore.ts` — modified (d15827c)
- [x] `c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx` — modified (d15827c)
- [x] DENSITY_BAR_WIDTH=8 present in Minimap.tsx
- [x] textAlign='right' in bookmark block
- [x] showMinimap in editorStore (all 4 locations)
- [x] toggle-minimap data-testid in Editor.tsx
- [x] w-20 in minimap sidebar div
- [x] chart && showMinimap condition
- [x] npx tsc --noEmit --skipLibCheck passes in bms-electron-app (0 errors)

## Self-Check: PASSED
