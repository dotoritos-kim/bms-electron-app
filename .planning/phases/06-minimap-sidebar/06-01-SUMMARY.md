---
phase: 06-minimap-sidebar
plan: 01
subsystem: editor-minimap
tags: [minimap, density-bar, bookmarks, ui-toggle, popout, drag]
dependency_graph:
  requires: []
  provides: [MINI-04, BK-01, showMinimap-toggle, minimap-popout-drag]
  affects: [Editor.tsx, Minimap.tsx, editorStore.ts]
tech_stack:
  added: []
  patterns: [Canvas 2D rendering, Zustand boolean toggle, Lucide icon import alias, pointer capture drag, fixed positioning]
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
  - "Minimap strip positioned between canvas and right panel (flex row order) — was incorrectly appended after right panel"
  - "Popout uses pointer capture (setPointerCapture) for smooth drag without mouseleave interruption"
  - "Inline strip hidden when popout is active (!minimapPopout guard) to avoid duplication"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-06"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 06 Plan 01: Minimap Density Bar + Bookmark Text + showMinimap Toggle Summary

**One-liner:** 8px density bar strip with bookmark text, 80px sidebar between canvas and right panel, toggle button, and detachable floating drag window via pointer capture.

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments
- Minimap density bar rendered as 8px left strip with vertical separator; bookmark names right-aligned in text
- `showMinimap` toggle in editorStore + header bar Map icon button with active state indicator
- Minimap strip repositioned between canvas and right panel (left of NoteInfoPanel/BeatKeysoundPanel)
- Maximize2 popout button in minimap strip header opens draggable floating overlay panel
- Floating panel uses pointer capture for robust drag across the full editor window

## Task Commits

Each task was committed atomically:

1. **Task 1: Refine Minimap density bar and bookmark rendering** - `bms-editor@c6e456b` (feat)
2. **Task 2: Add showMinimap toggle state and update Editor.tsx layout** - `d15827c` (feat)
3. **Task 3: Fix minimap position + add popout drag window** - `a50dd8c` (fix)

## Files Created/Modified
- `c:/SourceCode/bms-editor/src/chart/panels/Minimap.tsx` - 8px density bar, separator, right-aligned bookmark names
- `c:/SourceCode/bms-electron-app/src/renderer/stores/editorStore.ts` - showMinimap state + toggleMinimap action
- `c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx` - minimap sidebar repositioned before right panel, Maximize2 popout button, floating draggable panel

## Decisions Made
- Minimap strip placed in flex row BEFORE `{showRightPanel}` block so it renders left of the right panel
- Popout state (`minimapPopout`, `popoutPos`, `popoutDragRef`) kept in local React state (not editorStore) — ephemeral UI-only state
- Pointer capture API (`setPointerCapture`) used so drag works even if pointer leaves the header element
- Inline strip hidden when popout is open (`!minimapPopout` guard) to avoid showing both simultaneously

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Minimap strip rendered after right panel instead of between canvas and right panel**
- **Found during:** Task 3 (user-reported after checkpoint)
- **Issue:** Minimap sidebar div was appended AFTER the `{showRightPanel}` block, placing it visually to the right of the NoteInfoPanel
- **Fix:** Moved minimap sidebar JSX to before `{showRightPanel && (` block; flex row order now: canvas | minimap | right-panel
- **Files modified:** `src/renderer/routes/Editor.tsx`
- **Committed in:** a50dd8c

**2. [Rule 2 - Missing Critical] Popout drag window not implemented**
- **Found during:** Task 3 (user requested in checkpoint response)
- **Issue:** Plan had minimap as a fixed sidebar only; user required ability to detach into floating window
- **Fix:** Added `minimapPopout`/`popoutPos`/`popoutDragRef` local state + Maximize2 button in strip header + floating panel JSX with pointer-capture drag
- **Files modified:** `src/renderer/routes/Editor.tsx`
- **Committed in:** a50dd8c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing feature added per user direction)
**Impact on plan:** Both fixes improve correctness and usability. No scope creep beyond user-specified requirements.

### Pre-existing TypeScript Errors in bms-editor

- **Found during:** Task 1 verification
- **Issue:** `npx tsc --noEmit --skipLibCheck` exits non-zero in bms-editor due to 4 pre-existing errors in `editorUtils.ts` and `NoteChartEditor.tsx` (`bgmChannel` property mismatch)
- **Action:** These errors are in unrelated files not touched by this plan. `Minimap.tsx` itself has no TypeScript errors.
- **Rule:** Out-of-scope pre-existing errors per deviation scope boundary

## Known Stubs

None — density data wiring (`minimapDensityData`) and bookmark wiring (`minimapBookmarks`) were already implemented in MinimapBridge. All data flows correctly.

## Self-Check

- [x] `c:/SourceCode/bms-editor/src/chart/panels/Minimap.tsx` — modified (bms-editor commit c6e456b)
- [x] `c:/SourceCode/bms-electron-app/src/renderer/stores/editorStore.ts` — modified (d15827c)
- [x] `c:/SourceCode/bms-electron-app/src/renderer/routes/Editor.tsx` — modified (a50dd8c)
- [x] Minimap strip is BEFORE `{showRightPanel}` block in Editor.tsx
- [x] `!minimapPopout` guard on inline strip
- [x] Maximize2 button triggers `setMinimapPopout(true)`
- [x] Floating panel: `position: 'fixed'`, `zIndex: 50`, pointer-capture drag
- [x] Close button in popout: `setMinimapPopout(false)`
- [x] `npx tsc --noEmit --skipLibCheck` passes in bms-electron-app (0 errors)

## Self-Check: PASSED

## Next Phase Readiness
- Minimap sidebar fully functional with toggle, repositioned correctly, and detachable as floating window
- Ready for any further editor panel layout work
- bms-editor pre-existing TS errors (bgmChannel) remain deferred — separate issue

---
*Phase: 06-minimap-sidebar*
*Completed: 2026-04-06*
