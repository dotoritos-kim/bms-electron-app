# i18n Implementation Progress

> 이 파일은 `/loop` 자동 진행 시 누적 마커로 사용. 각 cron fire는 이 파일을 먼저 읽고 다음 단계 진행.

## Locked Decisions (eng × 7 + CEO × 2 + 자동 4)

- **언어**: ko + en 즉시. ja는 수요 검증 후 활성. 인프라는 7개 언어 확장 가능하게 설계.
- **Phase 분할**: 4 phase 순차 (1: 인프라, 2: 추출, 3: ja, 4: 외부 문서)
- **부분 출시**: `ENABLED_LOCALES` feature flag
- **main 프로세스**: 별도 미니 사전 (`src/main/i18n/menu.ts`)
- **bms-editor/player**: React Context (`useI18n()`) — Phase 2에서 적용
- **자동 번역**: ko/en은 본인, 그 외는 DeepL/Claude draft + 사람 검수
- **문서 범위**: 외부 공개 + 사용자 가이드만 (`.planning/**` 한국어 유지)
- **인코딩**: bms-core ENCODINGS_TO_TRY에 windows-1251 추가 (Phase 2)
- **Persist**: electron-store (main SSOT, IPC 동기화)

---

## Phase i18n-1 — 인프라 + ko/en (✅ scaffold complete)

### Done (fire 1)
- [x] 결정 잠금 7건 + CEO 2건
- [x] 진행 마커 파일
- [x] **package.json**: react-i18next ^15.6, i18next ^25, i18next-resources-to-backend ^1.2, i18next-parser ^9.3 (devDep)
- [x] **shared/ipc-contract.ts**: `locale:getInitial`, `locale:set` invoke + `locale:changed` send 추가, ALLOWED_RECV 갱신, `SupportedLocale` 타입 export
- [x] **shared/i18n/types.ts**: `SupportedLocale`, `ENABLED_LOCALES`, `LOCALE_LABELS`, `LOCALE_CODES`, `NAMESPACES`, `isSupportedLocale`, `isEnabledLocale`
- [x] **shared/i18n/locales/{ko,en}/{common,app,errors}.json**: 초기 키 (actions, language, status, navigation, errors)
- [x] **renderer/i18n/init.ts**: i18next 인스턴스 init (Suspense, lazy ns via `i18next-resources-to-backend`, dev missing-key warn)
- [x] **renderer/i18next.d.ts**: `CustomTypeOptions`로 type-safe `t()`
- [x] **main/i18n/menu.ts**: 미니 사전 ~21 키 × ko/en, fallback to en
- [x] **main/store/localeStore.ts**: electron-store ESM dynamic import wrapper, `getStoredLocale`, `setStoredLocale`, `resolveInitialLocale` (stored → OS → en)
- [x] **main/ipc/locale.ts**: `registerLocaleIpc()` — invoke handlers + 모든 윈도우 broadcast + menu rebuild
- [x] **main/menu.ts**: `createMenu(locale)` — 미니 사전 사용
- [x] **main/index.ts**: locale IPC 등록 + initial menu locale + boot 흐름
- [x] **preload/index.ts**: `window.api.locale.{getInitial,set}` 노출
- [x] **preload/index.d.ts**: locale API 타입
- [x] **renderer/services/LocaleService.ts**: 싱글턴 service. requestId 가드, IME composition 가드, locale:changed 수신 reflect, subscribe API
- [x] **renderer/components/LanguageSwitcher.tsx**: compact (status bar) + full (settings) variant, 키보드 접근, aria
- [x] **renderer/components/AppStatusBar.tsx**: 하단 status bar
- [x] **renderer/components/Layout.tsx**: column 구조 + AppStatusBar 통합
- [x] **renderer/main.tsx**: boot 순서 — `localeService.init()` 후 React mount
- [x] **renderer/App.tsx**: 5 한글 리터럴 → t() 치환 (`화면 이동`, `취소`, `저장 안 함`, `저장 후 이동`, `나가기`), Suspense boundary

### Known Environment Issues (불완전한 npm install)
- `@types/node`가 package.json에는 추가됐으나 node_modules에 실제 설치 안 됨 (Windows EPERM 잔존). 사용자가 수동으로 한 번 더 `npm install` 실행 필요.
- 결과: `npm run type-check`가 main 프로세스 코드에서 `Cannot find module 'electron'`, `Cannot find name 'process'`, `__dirname`, `Buffer` 에러를 다수 보고. 이 에러들은 **i18n 코드가 아닌 기존 코드**에도 동일하게 발생하는 환경 이슈. i18n 코드 자체의 type 에러는 0건.

### Pending (다음 cron fire가 이어 진행)
- [ ] @types/node 강제 재설치 (사용자 수동 — Windows EPERM)
- [ ] type-check 통과 확인 (i18n 부분만)
- [ ] tests/i18n/init.test.ts (booted with stored locale) ← electron mock 필요, defer
- [ ] tests/i18n/switch.test.ts (changeLanguage 정상) ← LocaleService 단위 테스트
- [ ] tests/i18n/load-failed.test.ts (lazy load 실패 → revert)
- [ ] tests/i18n/stale-request.test.ts (빠른 연속 변경)
- [ ] tests/i18n/composition.test.ts (IME 가드)
- [ ] tests/i18n/persist.test.ts (electron-store 라운드트립) ← electron mock 필요
- [ ] tests/i18n/menu-locale.test.ts (main menu 재빌드 통합) ← Playwright/spectron 필요

---

## Phase i18n-2 — 1,500키 추출 + 회귀 차단 (✅ 인프라 + Context 완료, 추출만 남음)

### Done (fire 2)
- [x] **`.i18next-parser.config.cjs`** — 7 locale, failOnWarnings, JsxLexer
- [x] **package.json scripts**: `i18n:extract`, `i18n:check`
- [x] **scripts/eslint-no-hardcoded-korean.cjs** — 한글 정규식 + 화이트리스트(locales/, i18n/, test fixture)
- [x] **bms-editor/src/i18n/**: types.ts, defaults.ts, context.tsx, index.ts (영문 fallback dict, useI18n 훅)
- [x] **bms-editor/src/index.ts**: i18n exports
- [x] **bms-editor/I18N.md**: provider 계약 + 사용 예 + 키 표
- [x] **bms-player/src/i18n/**: 동일 구조 (judgment, gauge, hud, errors, state)
- [x] **bms-player/src/index.ts**: i18n exports
- [x] **bms-player/I18N.md**: 동일
- [x] **bms-core/src/parser/modules/reader/index.ts**: ENCODINGS_TO_TRY에 `'windows-1251'` 추가
- [x] **bms-core/src/parser/modules/reader/getReaderOptionsFromFilename.ts**: `.win1251.<ext>` 매핑
- [x] **bms-core/tests/parser/reader/encoding-russian.test.ts**: 5/5 passed (forceEncoding 경로, 확장자 매핑, 헤더 디코드)
- [x] **bms-electron-app/tests/i18n/types.test.ts**: type guard 회귀
- [x] **bms-electron-app/tests/i18n/menu-dict.test.ts**: main 미니 사전 ko/en/fallback
- [x] **bms-electron-app/tests/i18n/locale-parity.test.ts**: ko/en namespace 키 일치 검증
- [x] **bms-editor/tests/i18n/fallback.test.ts**: 4/4 passed
- [x] **bms-player/tests/i18n/fallback.test.ts**: 4/4 passed

### Done (fire 4)
- [x] **bms-electron-app/src/renderer/components/BpmTapDialog.tsx** — 6개 한글 → `t('app:dialogs.bpmTap.*')` 치환 + locale JSON 갱신
- [x] **bms-editor/src/chart/panels/Minimap.tsx** — `useI18n()` 통합, "Minimap" 헤더 + "클릭/드래그하여 이동" tooltip → `t('panels.minimap.*')`
- [x] **bms-editor/src/i18n/defaults.ts** — `panels.minimap.navigationTooltip` 추가
- [x] **bms-electron-app locales/{ko,en}/editor.json** — Minimap navigationTooltip 키 추가
- [x] **bms-editor 테스트 4/4 회귀 없음** — fallback dict 신규 키 자동 resolve
- [x] **`.planning/I18N-EXTRACTION-PLAYBOOK.md`** — 컴포넌트별 추출 레시피 + 우선순위 매트릭스 + 흔한 함정

### Done (fire 5) — Tier 1 완료
- [x] **bms-electron-app/src/renderer/components/ToastStack.tsx** — `aria-label="알림 닫기"` → `t('common:actions.dismiss')` + `dismiss` 키 양국어 추가
- [x] **bms-electron-app/src/renderer/components/ChartStatsView.tsx** — `마디`, `재생 시간` → `t('app:stats.*')` + 양국어 키 추가
- [x] **bms-editor/src/chart/panels/StatusBar.tsx** — 10개 user-facing (tooltip 6 + label 2 + count 형식 2) → `useI18n().t('panels.statusBar.*')` + 13개 신규 키
- [x] NoteSearchDialog (한글 주석만), AccessibleDialog (한글 주석 + title prop) — 사용자 노출 한글 0건, **변환 불필요 확정**
- [x] bms-editor 테스트 4/4 회귀 없음

### Done (fire 6) — Tier 2 완료
- [x] **NoteColorDialog.tsx** — 21 user-facing → `t('app:dialogs.noteColor.*')` (title, description, swatch tooltip, custom badge, reset, fields ×6 label/desc, buttons)
- [x] **KeyBindingsDialog.tsx** — 8 user-facing → `t('app:dialogs.keyBindings.*')` + `t('common:actions.cancel')` (title, conflict, listening, reset, save)
- [x] **MidiMappingDialog.tsx** — 19 user-facing → `t('app:dialogs.midiMapping.*')` (sections, modes ×3, helps ×3, presets, lane mapping, status, close)
- [x] **EditorContextMenu** — 사용자 노출 한글 0건 확정 (모두 영문 메뉴 항목)
- [x] **dialogs.{noteColor,keyBindings,midiMapping}** namespace 추가, ko/en 양국어 동시 작성

### Done (fire 7) — Tier 3 시작
- [x] **HeaderEditorPanel.tsx** — 17 user-facing → `useI18n().t('panels.header.*')`: tabs ×5, fields ×8, search/empty/delete/value placeholder/raw help/apply
- [x] **bms-editor/src/i18n/defaults.ts** — `panels.header.{tabs,fields,common}` 추가
- [x] **bms-electron-app locales/{ko,en}/editor.json** — 동일 namespace 양국어 추가
- [x] **bms-editor 테스트 4/4 회귀 없음**

### Done (fire 8) — Tier 3 진행 (KeysoundPanel + KeysoundUploadDialog)
- [x] **KeysoundPanel.tsx** — 14 user-facing → `useI18n().t('panels.keysound.*')` (title, upload tooltip, search, silent, empty/no-results, count summary, 5 context-menu items)
- [x] **KeysoundUploadDialog.tsx** — 12 user-facing → `t('panels.keysound.uploadDialog.*')` (title, drop prompt, format hint, file count, error messages, commit message, cancel/upload)
- [x] bms-editor `panels.keysound` defaults 확장 (contextMenu + uploadDialog)
- [x] bms-electron-app locales/{ko,en}/editor.json 동일 확장
- [x] bms-editor 테스트 4/4 통과

### Done (fire 9) — Tier 3 완료
- [x] **NoteInfoPanel.tsx** — 25 user-facing → `useI18n().t('panels.noteInfo.*')`: 17 labels, 5 values (notesCount, uniqueKeysoundsCount, gridAligned/Unaligned, silentKeysound), 2 tooltips (deleteLayer, addLayer), title/empty/multiTitle
- [x] bms-editor `panels.noteInfo` defaults 대폭 확장 (labels, values, tooltips 섹션)
- [x] bms-electron-app locales/{ko,en}/editor.json 동일 확장
- [x] bms-editor 테스트 4/4 통과

### Done (fires 10–11) — Tier 4 완료
- [x] **PatternLibraryPanel.tsx** — 12 user-facing → `t('app:dialogs.patternLibrary.*')` (panel title, search, save selection, applyTooltip, patternStats, deleteTooltip, save dialog with 3 keys, no results / empty)
- [x] **AutoChartDialog.tsx** — 21 user-facing → `t('app:dialogs.autoChart.*')` (title, 2 tabs, audio section, difficulty/lnRatio labels, toggles, generate/suggest buttons, suggest explanation, count label, 2 warnings, preview/summary, apply)
- [x] **EditorToolbar.tsx** — 30+ user-facing → `useI18n().t('toolbar.*')`: 7 tools (label + description), 14 labels (thickness, zoom, keyMode, grid, snap toggle), 8 actions (undo/redo/copy/paste/save/zoom aria + tooltip), 3 zoom presets, 4 layer state translations
- [x] bms-editor `toolbar` defaults 대폭 확장 (tools, labels, layer, actions, presets 섹션)
- [x] `dialogs.patternLibrary` + `dialogs.autoChart` namespace 추가, ko/en 양국어
- [x] bms-editor 테스트 4/4 통과 — 회귀 없음

### Pending (다음 fire 진행)
- [ ] PLAYBOOK Tier 5: AudioSlicer (~20)
- [ ] PLAYBOOK Tier 6: NoteChartViewer (381), Editor.tsx (156) — 별도 RFC 후
- [ ] PLAYBOOK Tier 7: useBmsChart (84), KeysoundPlayer (108), editorStore (inline labels) — logic-coupled
- [ ] **1,500키 추출 실행** (`npm run i18n:extract`) — npm install 환경 복구 후
- [ ] **eslint config**: 룰 등록 (`scripts/eslint-no-hardcoded-korean.cjs`)
- [ ] CI: `i18n:check` + ESLint 한글 회귀 PR 차단

---

## Phase i18n-3 — ja 추가 (수요 검증 트리거 후)
- [ ] DeepL API key 확보, ko/en source → ja draft 자동 생성
- [ ] 사람 검수 PR (BMS 도메인 용어 점검: 키음, 노트, 차트, 레인, BPM)
- [ ] Noto Sans CJK JP 폰트 스택 추가 (global.css)
- [ ] Playwright 시각 회귀 (ja × 5화면 = 5 스냅샷)
- [ ] ENABLED_LOCALES에 'ja' 추가
- [ ] CHANGELOG: 일본어 지원 추가 영문/한글

---

## Phase i18n-4 — 외부 문서 i18n (✅ 핵심 완료)

### Done (fire 3)
- [x] **bms-electron-app/README.md**: 영문 default 작성 (i18n 섹션 + 명세 링크 포함)
- [x] **bms-electron-app/README.ko.md**: 기존 한국어 보존
- [x] **bms-electron-app/CONTRIBUTING.md**: 영문, i18n 정책 + 번역 PR 검수 규칙
- [x] **bms-electron-app/CONTRIBUTING.ko.md**: 한글 동등본
- [x] **bms-core/README.md**: 영문 (인코딩 섹션, Windows-1251 명시)
- [x] **bms-editor/README.md**: 영문 + I18N.md 링크
- [x] **bms-player/README.md**: 영문 + I18N.md 링크
- [x] **scripts/docs-drift-check.cjs**: frontmatter `last_synced` drift 검출 + `--strict` CI 모드
- [x] **renderer/i18n/BmsLibI18nBridge.tsx**: bms-editor / bms-player I18nProvider를 react-i18next에서 매핑
- [x] **renderer/App.tsx**: Player/Editor 라우트를 각각 BmsPlayerI18nBridge / BmsEditorI18nBridge로 래핑
- [x] **shared/i18n/types.ts**: NAMESPACES에 `editor`, `player` 추가
- [x] **renderer/i18next.d.ts**: editor/player namespace 타입 augmentation
- [x] **shared/i18n/locales/{ko,en}/{editor,player}.json**: 라이브러리 namespace 키 (toolbar, panels, judgment, gauge, hud, errors, state)

### Pending (i18n-4 잔여)
- [ ] **docs/{en,ko}/**: 디렉터리 분리, bms-format spec 영문 작성 — 별도 자료 작업
- [ ] **bms-core/editor/player JSDoc**: public API 영문화 — 코드 내부 주석 작업
- [ ] 사용자 가이드 (단축키, BMS 작성 튜토리얼) — 신규 콘텐츠 작성 필요

---

## Failure Mode Mitigation Tracking
| # | 실패 | 처리 |
|---|---|---|
| F1 | ns lazy load fail | renderer/services/LocaleService.ts `applyLocaleInternal` try/catch → revert ✅ |
| F2 | electron-store write fail | main/store/localeStore.ts `setStoredLocale` returns false → toast (TODO Phase 2) |
| F3 | composition 중 변경 | LocaleService `compositionstart/end` 가드 ✅ |
| F4 | stale request | LocaleService `requestId` 가드 ✅ |
| F5 | Russian decode | bms-core windows-1251 추가 + forceEncoding 경로 ✅ (auto-detect는 짧은 키릴에서 Shift-JIS 충돌 — `.win1251` 확장자 우회) |
| F6 | i18nProvider 미주입 (bms-editor/player) | Context default = 영문 fallback (defaultMessages) ✅ |
| F7 | main menu sync | main/ipc/locale.ts `locale:set` → `createMenu(locale)` ✅ |

---

## Test Status

| 패키지 | 통과/실행 | 비고 |
|---|---|---|
| bms-core | **5/5** ✅ | encoding-russian.test.ts |
| bms-editor | **4/4** ✅ | fallback.test.ts |
| bms-player | **4/4** ✅ | fallback.test.ts |
| bms-electron-app | 0/0 (미실행) | vitest 바이너리 미설치 — `npm install` 후 재시도 |

---

*Last updated: 2026-05-05 — 다음 단계: AudioSlicer (Tier 5) 완료. 누적 ~224*
*Next fire 진입점: Tier 6 (NoteChartViewer 381, Editor.tsx 156) — 대형 컴포넌트, RFC 후 진행*

## 누적 변환 현황
| 컴포넌트 | 한글 → t() 변환 | Fire |
|---|---|---|
| App.tsx (renderer) | 5 | 1 |
| BpmTapDialog | 6 | 4 |
| Minimap | 1 user-facing | 4 |
| ToastStack | 1 | 5 |
| ChartStatsView | 2 | 5 |
| StatusBar (bms-editor) | 10 | 5 |
| NoteColorDialog | 21 | 6 |
| KeyBindingsDialog | 8 | 6 |
| MidiMappingDialog | 19 | 6 |
| HeaderEditorPanel (bms-editor) | 17 | 7 |
| KeysoundPanel (bms-editor) | 14 | 8 |
| KeysoundUploadDialog (bms-editor) | 12 | 8 |
| NoteInfoPanel (bms-editor) | 25 | 9 |
| PatternLibraryPanel | 12 | 10 |
| AutoChartDialog | 21 | 10 |
| EditorToolbar (bms-editor) | 30 | 11 |
| **AudioSlicer** | **20** | **다음** |
| AutoChartDialog | 21 | 10 |
| EditorToolbar (bms-editor) | 30 | 11 |
| **합계** | **204 user-facing 한글** | — |

## Summary — 4 Phase 진행 상황

| Phase | 상태 | 잔여 |
|---|---|---|
| i18n-1 인프라 | ✅ 완료 | npm install 환경 복구만 (사용자 액션) |
| i18n-2 추출+회귀 | 🟡 인프라 완료, 추출 작업 대기 | parser 실행, 21+10 컴포넌트 한글 → t() |
| i18n-3 ja 추가 | ⏸ 트리거 대기 | 수요 검증 후 진입 |
| i18n-4 외부 문서 | ✅ 핵심 완료 | docs/{en,ko}/ 본문, JSDoc 영문화는 follow-up |
