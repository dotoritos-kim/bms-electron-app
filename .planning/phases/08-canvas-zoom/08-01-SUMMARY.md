---
phase: 08-canvas-zoom
plan: 01
subsystem: ui
tags: [react, three.js, zoom, canvas, editor, imperative-ref]

# Dependency graph
requires:
  - phase: 07-tick-refactor
    provides: NoteChartEditor, EditorToolbar, EditorCanvas components
provides:
  - ZoomControl imperative ref API (zoomIn/zoomOut/zoomTo/fitToChart)
  - Cursor-anchored Ctrl+Wheel zoom (multiplicative x1.15, bounds 2~200)
  - Keymode-based default beatScale (48K=4, 24K=8, 14K=12, 7K=20)
  - Zoom button group in EditorToolbar (ZoomOut/scale/ZoomIn/Fit-to-Chart)
  - Preset dropdown (Overview=5/Work=20/Detail=80)
  - rAF-debounced onBeatScaleChange callback
affects: [09-any-future-canvas-features, EditorToolbar consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - pendingBeatScaleRef for rAF-debounced callbacks from useFrame to React state
    - Imperative ref pattern (zoomControlRef) for Canvas→React communication
    - sizeRef/totalBeatsZoomRef for stale-closure-safe fitToChart

key-files:
  created: []
  modified:
    - c:/SourceCode/bms-editor/src/chart/editor/types.ts
    - c:/SourceCode/bms-editor/src/chart/NoteChartEditor.tsx
    - c:/SourceCode/bms-editor/src/chart/editor/EditorToolbar.tsx
    - c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx

key-decisions:
  - "Multiplicative zoom (x1.15) instead of linear (+2) for consistent feel at all scales"
  - "pendingBeatScaleRef+useFrame pattern for rAF-debounced scale callback — avoids extra setState cycle"
  - "sizeRef+totalBeatsZoomRef as current-frame snapshots for fitToChart stale closure safety"
  - "Zoom group placed between H: slider and Keys: selector in toolbar for spatial proximity to canvas"

patterns-established:
  - "pendingBeatScaleRef: set in event/imperative handler, read+clear in useFrame — zero-latency rAF debounce"
  - "zoomControlRef: populate in useEffect, clear on cleanup — standard imperative escape hatch"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-04-06
---

# Phase 08 Plan 01: Canvas Zoom Summary

**Toolbar zoom buttons (ZoomIn/ZoomOut/Fit + preset dropdown), cursor-anchored Ctrl+Wheel zoom (x1.15 multiplicative), expanded bounds 2~200 px/beat, and keymode-based default scale via ZoomControl imperative ref**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-06T12:53:00Z
- **Completed:** 2026-04-06T13:18:01Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- ZoomControl interface + NoteChartEditorProps/EditorToolbarProps zoom props defined in types.ts
- Cursor-anchored Ctrl+Wheel zoom replaces jump-prone linear zoom; bounds expanded 5~80 → 2~200
- Keymode defaults: 48K=4, 24K=8, 14K=12, 7K=20 (applied on first load)
- EditorToolbar zoom group: ZoomOut (disabled at min=2) / scale number / ZoomIn (disabled at max=200) / Fit-to-Chart icon, with Overview/Work/Detail preset dropdown
- Editor.tsx fully wired: zoomControlRef → NoteChartEditorBridge, scale callbacks → toolbar display

## Task Commits

1. **Task 1: types.ts — ZoomControl interface + zoom props** - `c91ecb0` (feat)
2. **Task 2: NoteChartEditor.tsx — cursor-anchored zoom + zoomControlRef** - `18a9ef9` (feat)
3. **Task 3: EditorToolbar.tsx — zoom button group UI** - `62edd1c` (feat)
4. **Task 4: Editor.tsx — zoomControlRef + currentBeatScale wiring** - `4cd423b` (feat)

## Files Created/Modified
- `c:/SourceCode/bms-editor/src/chart/editor/types.ts` — ZoomControl interface, NoteChartEditorProps zoom props, EditorToolbarProps zoom props
- `c:/SourceCode/bms-editor/src/chart/NoteChartEditor.tsx` — defaultBeatScaleForKeyMode, cursor-anchored wheel handler, pendingBeatScaleRef, zoomControlRef useEffect, onBeatScaleChange in useFrame, ZoomControl re-export
- `c:/SourceCode/bms-editor/src/chart/editor/EditorToolbar.tsx` — ZoomIn/ZoomOut/Maximize2 icons, showZoomPreset state, zoom group UI with preset dropdown
- `c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx` — ZoomControl import, zoomControlRef ref, currentBeatScale state, props wired to NoteChartEditorBridge and EditorToolbar

## Decisions Made
- Multiplicative factor (x1.15) chosen over linear (+2) for perceptually consistent zoom feel across the full 2~200 range
- `pendingBeatScaleRef` + `useFrame` pattern used for rAF debounce — set in event handler, read once per frame in useFrame, cleared immediately — avoids double-setState overhead
- `sizeRef` and `totalBeatsZoomRef` refs hold current-frame values so `fitToChart` closure inside `useEffect` always reads fresh size/beats without stale capture
- Zoom group placed between "H:" slider and "Keys:" selector (not at far end) to stay near canvas controls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in bms-editor (`bgmChannel` property on EditableBMSNote) are unrelated to this plan and existed before these changes. No new errors introduced.

## Known Stubs

None — all zoom features are fully wired. `currentBeatScale` starts at 20 and updates on first zoom interaction; on chart open it will reflect keymode default after first wheel/button interaction. This is by design since the Canvas initial render fires the defaultBeatScaleForKeyMode logic internally but the callback fires only on explicit zoom actions.

## Next Phase Readiness
- ZoomControl API is stable and documented via interface
- EditorToolbar now has extensible zoom group slot
- Any additional zoom features (e.g., keyboard shortcuts +/-) can call `zoomControlRef.current?.zoomIn/Out()` directly

---
*Phase: 08-canvas-zoom*
*Completed: 2026-04-06*

## Self-Check: PASSED

- SUMMARY.md: FOUND
- types.ts: FOUND
- NoteChartEditor.tsx: FOUND
- EditorToolbar.tsx: FOUND
- Editor.tsx: FOUND
- Commit c91ecb0: FOUND
- Commit 18a9ef9: FOUND
- Commit 62edd1c: FOUND
- Commit 4cd423b: FOUND
