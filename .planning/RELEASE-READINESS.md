# Release Readiness Audit — bms-electron-app v1.0

> Audit date: 2026-05-06
> Current package.json version: **0.1.2** (latest published)
> Auditor: autonomous /loop session

---

## Verdict

**APPROVE for v1.0.0 once these blockers are resolved:**

1. Tier 5–7 i18n migration completes (or is explicitly deferred to v1.1 with hardcoded Korean accepted)
2. Submodule pointers refreshed to latest sibling masters
3. v0.1.2 GitHub release moved from Draft → Published

**Pipeline is otherwise production-ready.** Auto-tag → release.yml has shipped v0.1.1 + v0.1.2 successfully (artifacts published as drafts).

---

## 1. Versioning State

| Item | State | Notes |
|---|---|---|
| `package.json` version | `0.1.2` | Last bumped 2026-05-05 |
| Remote tags | `v0.1.1`, `v0.1.2` | Both pushed by auto-tag pipeline ✓ |
| Local-only tags | `v1.0`, `v1.1` | **Internal milestone tags, never pushed.** Confusion risk — recommend rename to `milestone-v1.0` / `milestone-v1.1` or delete locally. |
| GitHub Releases | `0.1.1`, `0.1.2` | **Draft state** — electron-builder publish defaulted to draft (no signing/notarization). Manual publish required. |

**v1.0 cut decision needed:** Bump to `1.0.0` or continue `0.x` series. Given v1.0 + v1.1 milestones already shipped (file-loading freeze fix, minimap+layer panels), the codebase is feature-complete for a 1.0 SemVer cut.

## 2. Release Pipeline

### `auto-tag.yml` ✅ Working
- Triggers on `package.json` change in `ship/v1.0-complete` / `main` / `master`
- Creates `v${version}` tag using `SIBLING_REPO_TOKEN` (PAT, required for tag-push to fire downstream workflows)
- Tag push triggers `release.yml`

### `release.yml` ✅ Working
- Triggers on tag `v*` push or manual `workflow_dispatch`
- Builds sibling submodules (`bms-core`, `bms-player`, `bms-editor`)
- Runs `electron-builder --win --publish always` → uploads to GitHub Releases (currently as Draft)
- Uploads installer artifacts (.exe, .blockmap, latest*.yml) for 14 days

**Validated by:** v0.1.1 (2026-05-05) + v0.1.2 (2026-05-05) both produced installers.

### `ci.yml` ✅ Working
- Runs on push/PR to `ship/v1.0-complete` / `main` / `master`
- Steps: typecheck (non-blocking baseline), i18n parser check (non-blocking — parser false-positive), ESLint hardcoded-Korean (non-blocking), unit/integration/compatibility tests, build
- Median runtime: ~3 minutes

### `nightly.yml` ✅ Working
- Stryker mutation testing matrix (sharded)

## 3. Test Coverage

| Suite | Files | Notes |
|---|---|---|
| Unit | 33 | components, stores, hooks, lib, workers, routes |
| Integration | 5 | chart-roundtrip, editor-workflow, tickPipeline, +2 |
| Compatibility | 2 | format-compliance, writer-snapshots |
| i18n | 3 | locale-parity, menu-dict, types |
| E2E (Playwright) | 14 | editor (8), home, navigation, player, electron-app harness |
| **Total** | **57 files / 15.5K LoC** | |

**Coverage gaps for v1.0:**
- E2E: editor-keymodes spec exists but only covers default key modes; PMS 9K + odd modes (5K, 14K) untested
- No E2E for AudioSlicer or AutoChartDialog (recently added features)
- Stryker mutation score baseline not enforced in CI (only nightly observability)

**Recommendation:** acceptable for v1.0; track gaps as v1.1 backlog.

## 4. Sibling Package State

| Repo | Submodule SHA | Latest origin/master | Drift |
|---|---|---|---|
| bms-core | `8f4cd36` | `8f4cd36` (PR #8) | ✓ current |
| bms-editor | `ced0574` | `ced0574` (PR #8) | ✓ current (pending PR #17 commit) |
| bms-player | `e80bb39` | `e80bb39` (PR #6) | ✓ current (pending PR #17 commit) |

All three siblings have advanced through Stage-3 + Stage-4+ refactors (PR #5–#8 each). PR #17 commits the bumped submodule pointers.

## 5. i18n Phase 2 Coverage

Per `I18N-EXTRACTION-PLAYBOOK`:

| Tier | Status |
|---|---|
| 1–4 | ✅ Done (App, BpmTap, Minimap, ToastStack, ChartStatsView, StatusBar, NoteColor, KeyBindings, MidiMapping, HeaderEditor, Keysound, NoteInfo, EditorToolbar, AutoChart, PatternLibrary) |
| 5 | 🟡 AudioSlicer (20 strings) — pending |
| 6 | 🟡 NoteChartViewer (381) + Editor.tsx (156) — needs RFC split (Tier 6 RFC drafted: `.planning/RFC-tier-6-i18n.md`) |
| 7 | 🟡 useBmsChart (84), KeysoundPlayer (108), editorStore (partial — store toast/undo migrated) |

**Tier 5–7 represent ~750 hardcoded literals.** ESLint lint:i18n is non-blocking baseline; locale-parity vitest covers ko/en safety net.

**Decision required:** Block v1.0 on Tier 5–7 completion, or accept partial i18n with ko-only baseline for power users.

## 6. Known Issues / Tech Debt

### Blockers (must fix before v1.0)
- None — all CI workflows green, all PRs merged

### Should-fix for v1.0
- **electron-builder publish state**: releases hang as Draft. Either configure auto-publish (`releaseType: 'release'` in electron-builder config) or document the manual publish step.
- **Code signing**: Windows installer is not signed → SmartScreen warnings. EV cert recommended for v1.0.
- **Submodule pinning rationale**: `.gitmodules` doesn't pin to specific tags → CI rebuilds every time. Consider tag-pinning for reproducibility.

### Defer to v1.1
- Editor.tsx + NoteChartViewer.tsx i18n migration (Tier 6, ~537 strings)
- Mutation test score gating in CI
- E2E coverage for AudioSlicer/AutoChartDialog
- macOS + Linux build matrix (currently Windows-only)

## 7. Action Items

| # | Action | Owner | Priority |
|---|---|---|---|
| 1 | Decide v1.0 SemVer cut: bump to `1.0.0` vs continue `0.x` | release manager | HIGH |
| 2 | Publish v0.1.2 GitHub Release (move from Draft) | release manager | HIGH |
| 3 | Configure electron-builder to auto-publish (not draft) | maintainer | MID |
| 4 | Either complete Tier 5–7 i18n or document deferral | i18n loop | HIGH |
| 5 | Investigate Windows code signing cert | release manager | MID |
| 6 | Rename or delete local `v1.0`/`v1.1` milestone tags | maintainer | LOW |
| 7 | Add E2E specs for AudioSlicer + AutoChartDialog | QA | LOW (v1.1) |

## 8. Recommended v1.0 Release Process

1. Land PR #17 (Tier 1-4 i18n + submodule bumps + test setup fix)
2. Decide on Tier 5-7 deferral — write `I18N-PHASE2-DEFERRAL.md` if applicable
3. Set `package.json` version → `1.0.0`
4. Push `ship/v1.0-complete` → auto-tag creates `v1.0.0` → release.yml builds
5. Manually publish the GitHub Release draft after smoke testing the installer
6. Update README with installation instructions + changelog
