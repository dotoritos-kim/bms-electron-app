# Phase 7 Summary — 북마크 추가/삭제 UI + 레이어 패널

**Status**: COMPLETE
**Completed**: 2026-04-06
**Commit**: 00ee25b (feat(v1.1): Phase 7 — 북마크 추가/삭제 UI + 레이어 패널)

## What Was Built

### LayerPanel Component (inline in Editor.tsx)
- `LAYER_KEYS` constant array: `['playable', 'invisible', 'landmine', 'bgm']`
- `LAYER_LABELS` map: Korean display names per layer
- `LayerPanel` React component with props:
  - `layerConfig: LayerConfig` — current layer state
  - `onVisibleToggle`, `onLockToggle`, `onOpacityChange` callbacks
- Per-layer row rendering:
  - Eye/EyeOff (Lucide) — visibility toggle, `data-testid="layer-visible-{layer}"`
  - Lock/Unlock (Lucide) — lock toggle (yellow when locked), `data-testid="layer-lock-{layer}"`
  - Label (10px, truncated)
  - `<input type="range">` slider 0–1 step 0.05, `data-testid="layer-opacity-{layer}"`
- Reset button calls `store.resetLayerConfig()`
- Placed in right panel between "통계" and "차트 정보" sections

### Bookmark Add/Remove Modal
- `ModalType` union extended with `'addBookmark'`
- `pendingBookmarkMeasure` state + `bookmarkNameRef` for input ref
- `addBookmark` keydown case updated:
  - Uses `store.beatToMF()` for accurate measure (not Math.floor approximation)
  - Toggle: existing bookmark → `store.removeBookmark()` immediately; none → open modal
  - Modal: `AccessibleDialog` with text input (defaultValue = "Bookmark N"), form submit → `store.addBookmark()`
- `Bookmark`, `Eye`, `EyeOff`, `Lock`, `Unlock` added to lucide imports
- `LayerConfig` type added to editorStore imports

## Requirements Covered

| REQ-ID | Status |
|--------|--------|
| BK-03 | DONE — Ctrl+B add (dialog) or remove (toggle) at current measure |
| LAYER-01 | DONE — Eye icon per layer in LayerPanel |
| LAYER-02 | DONE — Lock icon per layer in LayerPanel |
| LAYER-03 | DONE — opacity slider per layer in LayerPanel |

## Tests

No new unit tests (UI components). All 1118/1118 existing tests pass.
TypeScript check clean.

## Files Modified

- `src/renderer/routes/Editor.tsx` — LayerPanel component + bookmark modal + lucide imports
