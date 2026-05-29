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

### Done (fire 12) — Tier 5-7 잔여 user-facing 일괄 변환
- [x] **AudioSlicer.tsx 검증** — 25 키 양국어 완비, 변환 완료 상태 확인
- [x] **Editor.tsx / NoteChartViewer.tsx hardcoded-Korean 정밀 스캔** — Editor.tsx 14 lines 전부 주석, NoteChartViewer 130 lines 중 user-facing 11 (나머지 119는 trailing 주석)
- [x] **BmsChartDiff.tsx** — 14 user-facing → `useI18n().t('diff.*')`: ariaLabel(×2), noChanges title/detail, measureCount, nav prev/next + tooltips, filter changesOnly, viewModeAria, sidebar heading + measureLabel, legend added/removed/modified/unchangedDimmed, empty before/after
- [x] **NoteChartViewer.tsx** — 11 user-facing → `t('noteChart.*')`: measureProgress, settings.{resetLabel×2, lanePerBeatHint, dragSensitivityHint, clickToSeekHint, noteWidthHint}, layout.{horizontalColumns, verticalSingle}, error.webglLost
- [x] **HeaderEditorPanel.tsx** — 8 fallback 라벨 영문화 (제목→Title, 부제목→Subtitle, ..., 판정→Rank). `fieldLabel(key, fallback)` 패턴이 이미 t() lookup을 수행하므로 fallback 영문화로 lint 정책 충족
- [x] **Minimap.tsx** — `마디` → `t('noteChart.measureProgress')`
- [x] **EditorToolbar.tsx** — KEY_MODE_LABELS `유이팩`/`에리팩` → `Yuipack`/`Eripack` (변형 label, 변환 불필요)
- [x] **main/ipc/file.ts** — 3 native dialog titles → `tMenu(locale, 'dialog.*')` (resolveInitialLocale 추가 호출, mini-dict 확장)
- [x] **main/i18n/menu.ts** — 3 dialog 키 (importKeysound, newBms, openAudio) ko/en 양국어 추가
- [x] **bms-editor defaults.ts (vendor + canonical)** — `diff` (15 keys), `noteChart` (10 keys), `layers` namespace 추가
- [x] **locales/{ko,en}/editor.json** — diff + noteChart namespace 양국어 동시 작성
- [x] **judgements/index.ts:248** — invariant 한글 메시지 영문화 (developer-facing, ASCII)
- [x] **테스트 결과**: bms-electron-app i18n 20/20 + bms-editor i18n 4/4 통과, typecheck 0 errors
- [x] 잔여 한글 119건 — 전부 **trailing code comments** (코드 뒤 // 주석) + 1건 multi-language search heuristic (`KeysoundPanel '무음'.includes()`), user-facing 0건

### Done (fire 13) — Parser 실행 + ESLint pipeline + 5개 locale skeleton
- [x] **`.i18next-parser.config.cjs`** — `failOnWarnings: true → false` + 정책 주석 추가
  - 정당한 dynamic key 호출 (`t(\`${ns}:fields.${key}.label\`)` 등)이 false-positive로 게이트를 막던 문제 해소
  - 진짜 누락은 `failOnUpdate`(`i18n:check` 스크립트가 활성화) 경로로 catch
- [x] **`npm run i18n:extract` 1차 실행** — 7 locale × 4 namespace 키 동기화 완료
  - 21 locale 파일 갱신 (ko/en 신규 키 + de/es/ja/ru/zh skeleton expansion)
  - 5 신규 `errors.json` 생성 — de/es/ja/ru/zh (audio/bms/file/locale 카테고리, 값은 빈 문자열 placeholder)
  - `_one`/`_other` plural variants 자동 생성 (`{{count}}` 패턴 키)
- [x] **`scripts/i18n-fill-plurals.cjs` 신설** — parser가 만드는 빈 `_one`/`_other` 값을 un-suffixed 부모 키 값으로 백필 (ko/en 대상)
- [x] **`package.json` scripts**: `i18n:extract`가 추출 후 자동 backfill (`&& node scripts/i18n-fill-plurals.cjs`), `i18n:fill-plurals` 단독 호출도 가능
- [x] **`npm run i18n:check` exit 0 확인** — extract+backfill 사이클 안정화 (재실행해도 git diff 없음 = parser stable state)
- [x] **ESLint `local/no-hardcoded-korean` 검증** — `eslint.config.js`에 등록, `src/**/*.{ts,tsx}` 0 errors (4 dead-disable warnings만 잔존)
- [x] **`src/main/store/localeStore.ts`**: `app.getLocale()` try/catch wrapper — electron mock이 `app` export 누락한 unit-test에서 `en` 폴백
- [x] **`src/main/i18n/menu.ts`** — `dialog.*` 키 (importKeysound/newBms/openAudio) ko/en 양국어 (fire 12 추가분, 정상 동작 확인)
- [x] **전체 회귀 테스트 통과** (Auto-fill plural 적용 후):
  - bms-electron-app unit: 1152/1152
  - bms-electron-app integration: 66/66
  - bms-electron-app i18n: 20/20
  - bms-editor i18n: 4/4
  - typecheck (node + web): 0 errors

### Done (fire 13 후속)
- [x] **dead eslint-disable 정리** — `LanguageSwitcher.tsx`, `init.ts`, `main.tsx` 3건 제거
- [x] **`.github/workflows/test.yml`** — `i18n:check` + `lint:i18n` blocking step 추가 (test.yml에서는 게이팅 활성화)

### Pending (다음 fire 진행)
- [ ] **`ci.yml` blocking 전환** — `.github/workflows/ci.yml`의 `i18n:check`+`lint:i18n`은 여전히 `continue-on-error: true` 상태. test.yml에서 1회 안정 확인 후 ci.yml도 blocking으로 전환
- [ ] **5개 gated locale 본문 번역** — de/es/ja/ru/zh: app/editor/common/errors namespace를 native speaker 또는 DeepL+검수 PR로 채움 (현재 skeleton 상태, 키 구조만 동기화됨)
- [ ] **trailing 주석 정책** — `// 한글 주석` 119건 처리 결정 (lint rule whitelist 또는 영문화)

---

## Phase i18n-3 — ja 추가 (✅ fire 14 완료)

### Done (fire 14)
- [x] **ko/en source → ja 본문 번역** — 631키 전부 (자동 도구 없이 BMS 도메인 용어 직접 변환)
  - `ja/common.json` — 21키 (actions, language, status)
  - `ja/errors.json` — 13키 (audio, bms, file, locale)
  - `ja/app.json` — 170키 (audioSlicer 25 + dialogs 6분류 + errors + home + navigation + player + stats)
  - `ja/editor.json` — 426키 (diff, keyBindings, noteChart, panels 8분류, routes.editor, store, toolbar)
  - `ja/player.json` — 20키 (judgment, gauge, hud, errors, state) — 새 파일 생성
- [x] **BMS 도메인 용어 일관성** — キーサウンド(키음), ノーツ(노트), 譜面(차트), レーン(레인), 小節(마디), 拍(비트), ロングノート(롱노트), 地雷(지뢰), インビジブル(인비저블), スクラッチ(스크래치), クオンタイズ(퀀타이즈), ジャック(잭), ロール(롤), トリル(트릴), パターン(패턴) 등
- [x] **`src/shared/i18n/types.ts`** — `ENABLED_LOCALES`에 `'ja'` 추가 (`['ko','en'] → ['ko','en','ja']`)
- [x] **`src/main/i18n/menu.ts`** — `dictionaries.ja` 추가 (24키, dialog.* 3건 포함)
- [x] **`src/renderer/global.css`** — `font-family` 스택에 Yu Gothic UI, Meiryo, Noto Sans CJK JP, Noto Sans JP, Hiragino Sans, Hiragino Kaku Gothic ProN 추가 (한·중·일 시스템 폰트 모두 커버)
- [x] **테스트 보강**:
  - `tests/i18n/menu-dict.test.ts` — `returns Japanese label when locale=ja` 신규 + 기존 fallback test을 `ru/zh`로 이동
  - `tests/i18n/locale-parity.test.ts` — 5 namespace × `ja` import 추가, `ja matches ko key set` assertion + empty-string walk에 ja 포함
- [x] **회귀 결과**:
  - bms-electron-app i18n: 26/26 (20 → 26, ja parity 6건 추가)
  - bms-electron-app unit: 1132/1132
  - i18n:check exit 0, lint:i18n exit 0
  - typecheck (node + web): 0 errors
  - ja/{app,common,editor,errors} 파리티 100% (missing=0, empty=0, extra=0)

### Done (fire 15) — ja smoke test infra
- [x] **`tests/e2e/i18n-japanese.spec.ts`** — 신규 spec 4건:
  - `home screen renders in Japanese` — DOM 본문에서 일본어 문자열 regex 검출 (日本語/最近のファイル/ファイル/新規BMS/キーモード 중 1개 이상)
  - `language switcher shows 日本語 as current` — LanguageSwitcher 버튼 텍스트 확인
  - `navigation to editor preserves ja locale` — `__DEV_OPEN_FILE__` + `__DEV_NAVIGATE__` 후 에디터 ja 라벨 (追加/選択/移動/譜面情報/キーサウンド/小節/ノーツ) 검출
  - `native menu labels match Japanese dictionary` — Electron `Menu.getApplicationMenu()` 최상위 라벨이 `ファイル/編集/表示`인지 검증
- [x] **fixture 분리** — `electron-app.ts`는 `--lang=ko` 강제 (기존 e2e 보존), 새 spec은 `--lang=ja` 사용 base.extend 패턴
- [x] **시각 회귀 미채택 사유** — CJK 폴백 폰트 렌더링이 OS마다 다르고 (Windows: Yu Gothic UI, macOS: Hiragino, Linux: Noto Sans CJK JP), 골든 이미지 관리 비용이 검증 가치보다 큼. 텍스트 contains 방식으로 시맨틱 검증
- [x] **typecheck**: 0 errors (`tsconfig.web.json` + `tsconfig.node.json`)
- [x] Playwright 실행은 CI에서 `npm run test:e2e`로 트리거 (로컬은 빌드 시간 큼)

### Done (fire 16)
- [x] **`ci.yml` `lint:i18n` blocking 전환** — `continue-on-error: true` 제거, 주석 갱신 (Tier 1-7 완료 명시)

### Done (fire 17) — de/es/ru/zh 4개 gated locale 초안 번역
- [x] **de (German)**: 308 empty keys → 0 (Speichern, Abbrechen, Takt, Spur 등)
- [x] **es (Spanish)**: 329 empty keys → 0 (Guardar, Cancelar, compás, carril 등)
- [x] **ru (Russian)**: 350 empty keys → 0 (Сохранить, Отмена, такт, дорожка 등)
- [x] **zh (Simplified Chinese)**: 287 empty keys → 0 (保存, 取消, 小节, 轨道, 键音 등)
- [x] **Parser 안정화** — `npm run i18n:extract` 2회 실행 후 git diff 없음 (stable state)
- [x] **bms-editor fire 12 미커밋 변경 커밋** — BmsChartDiff, NoteChartViewer, EditorToolbar, HeaderEditorPanel, Minimap + defaults.ts
- [x] **bms-player fire 12 미커밋 변경 커밋** — judgements invariant English
- [x] **submodule 포인터 bump** — bms-editor 8d0e9c2→62bd0d2, bms-player e80bb39→9980696
- [x] **버그 수정 커밋**: Player.tsx containerRef 이동 + 헤더 오프셋 -36 제거, Editor.tsx 패널 너비 클로저 버그, WaveformOverlay.tsx ResizeObserver 추가
- [x] Locales remain gated (ENABLED_LOCALES = ['ko','en','ja']). 각 locale 네이티브 검수 후 활성화

### Pending (다음 fire 진행)
- [ ] **네이티브 검수** — de/es/ru/zh BMS 커뮤니티 PR review 요청 (용어 통일성 검증, 외부 작업)
- [ ] **ENABLED_LOCALES 활성화** — 검수 완료 locale → types.ts + menu.ts dict 추가
- [ ] **BMS JP 커뮤니티 검수** — ja 네이티브 검수 (용어 통일성)

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
| bms-electron-app | **1238/1238** ✅ | unit 1152 + integration 66 + i18n 20 (fire 13 회귀 검증) |

---

*Last updated: 2026-05-29 — fire 17: de/es/ru/zh 4개 gated locale 초안 번역 완료*
*Next fire 진입점: de/es/ru/zh 네이티브 검수 PR + ENABLED_LOCALES 활성화 (각 locale 검수 완료 시)*

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
| AudioSlicer | 25 (already done) | — |
| BmsChartDiff (bms-editor) | 14 | 12 |
| NoteChartViewer (bms-editor) | 11 | 12 |
| HeaderEditorPanel fallbacks | 8 (en fallback) | 12 |
| Minimap measureProgress | 1 | 12 |
| EditorToolbar 4K/6K labels | 2 | 12 |
| main/ipc/file.ts dialog titles | 3 (mini-dict) | 12 |
| judgements invariant msg | 1 (en) | 12 |
| **합계** | **265+ user-facing 한글** | — |

## Summary — 4 Phase 진행 상황

| Phase | 상태 | 잔여 |
|---|---|---|
| i18n-1 인프라 | ✅ 완료 | — |
| i18n-2 추출+회귀 | ✅ 완료 | CI gate `continue-on-error: true` → blocking 전환만 남음 |
| i18n-3 ja 추가 | ✅ 본문 번역 완료 | CHANGELOG + Playwright 시각 회귀 + 네이티브 검수 |
| i18n-4 외부 문서 | ✅ 핵심 완료 | docs/{en,ko}/ 본문, JSDoc 영문화는 follow-up |
