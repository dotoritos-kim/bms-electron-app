# RFC: Tier 6 i18n migration granularity

> Phase i18n-2 final block. Decides how to split the two largest remaining
> components — `NoteChartViewer.tsx` (4,646 LoC) and `Editor.tsx`
> (2,542 LoC) — into reviewable chunks before any code change.
>
> Status: **proposed** — needs sign-off from the loop owner before fire 12.
> Owner: i18n migration loop. Created: 2026-05-06.

## 1. Context

Tiers 1–5 finished single-component PRs in one fire each. Tier 6 cannot use
that grain:

| File | LoC | Total Korean lines | User-facing literals (non-comment) |
| --- | ---: | ---: | ---: |
| `bms-editor/src/chart/NoteChartViewer.tsx` | 4,646 | 386 | 166 (mostly inline JSDoc; ~50 user-visible UI strings) |
| `bms-electron-app/src/renderer/routes/Editor.tsx` | 2,542 | 183 | ~95 user-facing (toasts, confirms, layer labels, tooltips, JSX text) |

Both files are central to the editor product and are touched by **multiple
parallel work streams** (Stage 3 refactor, layer system, toolbar
extension). A single 156-edit PR would conflict with every concurrent
branch.

## 2. Decision

Split each file **by feature surface, not by line range**. Each slice is
one fire/PR. Slices are ordered so earlier ones unblock later ones (e.g.
toast namespace must exist before toast call sites can be migrated).

This RFC does **not** propose code restructuring of the two files —
extraction the JSX surface only, no logic moves.

## 3. Slice plan — `Editor.tsx` (5 fires)

| Fire | Slice | Surface | Korean count | Notes |
| ---: | --- | --- | ---: | --- |
| 12.1 | **layer panel** | `LAYER_LABELS` const + 4 tooltip/aria patterns (visible/locked/opacity) at lines 170–225 | 12 | Pure UI labels; mechanical extract. Adds `app:editor.layers.*` namespace block. |
| 12.2 | **toast messages** | All `showToast(…)` / `setToast({message: …})` calls (≈ 12 sites) | 14 | Most are template strings with interpolation — use `t('app:editor.toasts.x', { count })`. |
| 12.3 | **confirm dialogs + loading** | `confirm()` / inline confirm-builder strings, audio-load progress pill (line 116, 532) | 4 | Includes one multi-line confirm string (line 532) — keep newline `\n` inside JSON value, render with `<Trans>`. |
| 12.4 | **JSX text + tooltips** | Inline JSX text and `title=`/`aria-label=` attributes outside the layer panel (search dialog header, toolbar custom labels, etc.) | ~50 | Mostly mechanical. Group by visual section to keep diff readable. |
| 12.5 | **internal JSDoc + comments** | All `//` and `/** */` Korean blocks (e.g. lines 63, 74, 136, 142, 156, 164) | 20+ | Translate to English. No runtime impact. ESLint allowlist already excludes comments — this is a pure docs PR. |

**Out of scope:** The "isolated subscriber" subcomponents
(`PlaybackTimeDisplay`, `Seekbar`, `BeatKeysoundPanel`) are inline
function definitions inside `Editor.tsx`. Their localized strings are
included in the slice that owns the surrounding feature.

## 4. Slice plan — `NoteChartViewer.tsx` (4 fires)

This file's 386 Korean lines decompose very differently from `Editor.tsx`:
the bulk is internal JSDoc, not UI text. Slice by *audience*.

| Fire | Slice | Surface | Korean count |
| ---: | --- | --- | ---: |
| 13.1 | **public API JSDoc** | Exported types + props (`KeyMode`, `BpmChange`, `BMSChartViewerProps`, `EqualizerBand`, etc.) lines 30–340 | ~120 |
| 13.2 | **NumericInput inline subcomponent** | The embedded `<NumericInput>` and its UI labels — title attribute on line 264, slider tooltips, etc. | ~15 |
| 13.3 | **toolbar/HUD JSX** | Play/pause icons, fullscreen, EQ panel, mini-map toggle text — every `title=`/`aria-label=`/JSX text reachable by users | ~30 |
| 13.4 | **internal helper comments** | All `// ...` and inline `/** ... */` blocks deep in render bodies | ~210 |

13.1 unblocks the IDE hover docs for downstream consumers and is the
highest-value slice. 13.4 has no runtime risk and can ship anytime.

## 5. PR shape

- **One slice = one PR.** Each PR adds its keys to `locales/{ko,en}/app.json`
  (or `editor.json` for the bms-editor file) **before** flipping any call
  site, so partial reverts never break the build.
- **Mandatory checks per PR:**
  1. `npm run i18n:check` — locale parity holds.
  2. `npm run lint:i18n` — no NEW Korean literal in changed lines (use
     ESLint's `--rulesdir` overlay or rely on the file-scoped diff).
  3. Visual QA of one screen per slice (recorded in PR description).
- **Snapshots:** Editor.tsx slice 12.4 will alter many JSX strings; bump
  Storybook/Playwright snapshot baselines in the same PR.

## 6. Sequencing

```
fire 12.1  →  12.2  →  12.3  →  12.4  →  12.5   (Editor.tsx)
            ↓ (12.2 unblocks toast key reuse in 13.x)
            └→ 13.1 → 13.2 → 13.3 → 13.4         (NoteChartViewer.tsx)
```

12.1 first because it introduces the `editor.layers` namespace also used
by Tier 7 (editorStore). 13.x can run in parallel with 12.4–12.5 since
they touch different packages.

## 7. Risk register

| Risk | Mitigation |
| --- | --- |
| Concurrent Stage 3 refactor renames functions inside `Editor.tsx` | Slice 12.x PRs touch JSX strings only; no signature changes. Rebase locally before push. |
| `i18n:check` flagging keys that still exist in JSON but never get a t() call | This RFC slices keys *into* JSON only when a call site lands in the same PR. `keepRemoved: true` covers any in-flight gap. |
| Plural / count interpolation regressions (e.g. `${count}개 노트`) | Use i18next pluralization syntax with `_one`/`_other` pairs; compare visual output for `count=0,1,2,11` per slice. |
| `<Trans>` + JSX child reordering for sentences that wrap a button | Two known cases (Editor.tsx 532 confirm; one in 13.3 EQ help text). Document in slice PR. |

## 8. Decision needed

- [ ] **Approve slice grain** — 5 + 4 = 9 PRs feels right? (Alt: collapse
      12.4 into 12.2/12.3 = 4+4 PRs, larger but fewer rebases.)
- [ ] **Approve sequencing** — start with 12.1 next fire?
- [ ] **Approve "comments are a separate slice"** — would unblock all
      runtime work first; doc-only PRs (12.5, 13.4) can ship last.

After sign-off, append the green-lit slice list to
`I18N-PROGRESS.md` Phase i18n-2 "Pending" section and start fire 12.1.
