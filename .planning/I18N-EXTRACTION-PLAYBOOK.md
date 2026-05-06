# i18n Extraction Playbook

> Step-by-step recipe for converting one component's Korean literals to
> `t()` calls. Each cron fire (or human contributor) processes one component
> per pass. Keep PRs small — one component per PR is the recommended grain.

## Choose the next component

Priority order (smallest → largest, isolated → entangled):

| Tier | Component | Korean literals | Risk |
| --- | --- | --- | --- |
| ✅ exemplar | bms-electron-app/src/renderer/App.tsx | 5 | done fire 1 |
| ✅ exemplar | bms-electron-app/src/renderer/components/BpmTapDialog.tsx | 6 | done fire 4 |
| ✅ exemplar | bms-editor/src/chart/panels/Minimap.tsx | 1 user-facing + 4 comments | done fire 4 |
| ✅ Tier 1 | bms-electron-app/src/renderer/components/ToastStack.tsx | 1 | done fire 5 |
| ✅ Tier 1 | bms-editor/src/chart/panels/NoteSearchDialog.tsx | 0 user-facing (한글은 주석만) | done fire 5 (no-op) |
| ✅ Tier 1 | bms-editor/src/chart/panels/StatusBar.tsx | 10 user-facing | done fire 5 |
| ✅ Tier 1 | bms-electron-app/src/renderer/components/ChartStatsView.tsx | 2 | done fire 5 |
| ✅ Tier 1 | bms-electron-app/src/renderer/components/AccessibleDialog.tsx | 0 user-facing (한글은 주석만, title은 prop) | done fire 5 (no-op) |
| ✅ Tier 2 | bms-electron-app/src/renderer/components/NoteColorDialog.tsx | 21 (title, description, swatch tooltip, custom badge, reset, fields ×6 label/desc, buttons) | done fire 6 |
| ✅ Tier 2 | bms-editor/src/chart/EditorContextMenu.tsx | 0 user-facing (모두 영문 또는 주석) | done fire 6 (no-op) |
| ✅ Tier 2 | bms-electron-app/src/renderer/components/KeyBindingsDialog.tsx | 8 (title, conflict, listening, reset, save, cancel) | done fire 6 |
| ✅ Tier 2 | bms-electron-app/src/renderer/components/MidiMappingDialog.tsx | 19 (sections, modes, presets, lane mapping, status) | done fire 6 |
| ✅ Tier 3 | bms-editor/src/chart/panels/HeaderEditorPanel.tsx | 17 user-facing (tabs ×5, fields ×8, search/empty/delete/value/raw help/apply) | done fire 7 |
| ✅ Tier 3 | bms-editor/src/chart/panels/KeysoundPanel.tsx | 14 user-facing (title, search, silent, no-results, count, 5 context-menu) | done fire 8 |
| ✅ Tier 3 | bms-editor/src/chart/panels/KeysoundUploadDialog.tsx | 12 user-facing (title, prompt, hint, error msgs, commit, count, buttons) | done fire 8 |
| ✅ Tier 3 | bms-editor/src/chart/panels/NoteInfoPanel.tsx | 25 user-facing (17 labels + 5 values + 2 tooltips + 3 headings) | done fire 9 |
| ✅ Tier 4 | bms-editor/src/chart/editor/EditorToolbar.tsx | 30 user-facing (7 tools × label/desc, 14 labels, 8 actions, 3 presets, 4 layer states) | done fire 11 |
| ✅ Tier 4 | bms-electron-app/src/renderer/components/AutoChartDialog.tsx | 21 (title, 2 tabs, audio section, 2 sliders, 2 toggles, 2 buttons, suggest text, 2 warnings, preview/summary, apply) | done fire 10 |
| ✅ Tier 4 | bms-electron-app/src/renderer/components/PatternLibraryPanel.tsx | 12 (panel title, search, save selection, applyTooltip, patternStats, deleteTooltip, save dialog ×3, no results, empty) | done fire 10 |
| 5 | bms-electron-app/src/renderer/components/AudioSlicer.tsx | 20 | medium-high |
| 6 | bms-editor/src/chart/NoteChartViewer.tsx | 381 | HIGH (large + many touchpoints) |
| 6 | bms-electron-app/src/renderer/routes/Editor.tsx | 156 | HIGH (2,529 LoC) |
| 7 | bms-editor/src/chart/useBmsChart.ts | 84 (logic) | logic-coupled |
| 7 | bms-editor/src/chart/KeysoundPlayer.ts | 108 (errors/logs) | logic-coupled |
| 7 | bms-electron-app/src/renderer/stores/editorStore.ts | inline labels in actions | coupled |

## Recipe (per component)

### 1. Choose target namespace
| If component lives in… | Use namespace | Example key |
| --- | --- | --- |
| `bms-electron-app/src/renderer/routes/` | `app` | `t('app:editor.toolbar.save')` |
| `bms-electron-app/src/renderer/components/` (dialog) | `app` under `dialogs.<name>` | `t('app:dialogs.bpmTap.title')` |
| `bms-editor/src/chart/**` | bms-editor's `defaultMessages` | `useI18n().t('panels.minimap.title')` |
| `bms-player/src/**` | bms-player's `defaultMessages` | `useI18n().t('judgment.miss')` |

### 2. Add hook + replace literal

```tsx
// before
export function MyDialog() {
  return <h3>제목</h3>;
}

// after — bms-electron-app component
import { useTranslation } from 'react-i18next';
export function MyDialog() {
  const { t } = useTranslation('app');
  return <h3>{t('app:dialogs.myDialog.title')}</h3>;
}

// after — bms-editor / bms-player component
import { useI18n } from '../../i18n';
export function MyPanel() {
  const { t } = useI18n();
  return <h3>{t('panels.myPanel.title')}</h3>;
}
```

### 3. Add the key + Korean translation

For `app` namespace: edit
- `bms-electron-app/src/shared/i18n/locales/ko/app.json`
- `bms-electron-app/src/shared/i18n/locales/en/app.json`

For library packages: edit
- `bms-editor/src/i18n/defaults.ts` (English baked-in fallback)
- `bms-electron-app/src/shared/i18n/locales/{ko,en}/editor.json` (consumer translations)

Both ko and en MUST be updated in the same PR — CI parity test fails otherwise.

### 4. Verify

```bash
# In the package you edited (or the workspace root):
npx vitest run tests/i18n/

# ko/en parity should still pass:
npx vitest run tests/i18n/locale-parity.test.ts
```

### 5. Open the PR

- Title: `i18n: extract <Component>` 
- Body: list the new keys.
- Tag with the `i18n` label.
- One component per PR. Resist the urge to bundle.

## What NOT to translate

- **Code comments** — they're for developers, not users.
- **`console.log` / `console.warn` strings** — diagnostic only.
- **Test fixture strings**.
- **User chart data** — `#TITLE`, `#ARTIST`, keysound filenames are user
  input and pass through unchanged.
- **HTML attribute values that aren't user-visible** (`data-*`, `aria-hidden`
  values, etc.).

## Common pitfalls

- **Ellipses** — Korean often uses `...` where English uses `…` (U+2026).
  The keys are language-specific values; don't normalize across locales.
- **Plurals** — use `t('panels.statusBar.notes', { count })` and provide
  i18next plural keys (`notes_one`, `notes_other`) when the language
  requires it. Korean uses a single form; English needs both.
- **Interpolation order** — i18next replaces `{{name}}` regardless of
  position. If a translation needs to reorder values, that's already
  handled by writing the target string in the natural word order for that
  language.
- **`title` attributes** — these surface as tooltips; translate them.
- **`aria-label`** — these are read by screen readers; translate them.
- **Unit suffixes** — append in the locale string, not in JSX
  (`{`{{count}} notes`}` not `{count} {t('notes')}`).

## Tracking

Mark each row in this file as `done <fire-number>` when its PR merges. The
table doubles as a progress dashboard the next fire reads to pick its
target.
