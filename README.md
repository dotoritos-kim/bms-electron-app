# BMS Desktop

> Cross-package BMS (Be-Music Script) 데스크톱 애플리케이션 — 리듬 게임 플레이어와 채보 에디터를 하나의 Electron 앱으로 통합한 프로젝트입니다.

[![Release](https://github.com/dotoritos-kim/bms-electron-app/actions/workflows/release.yml/badge.svg)](https://github.com/dotoritos-kim/bms-electron-app/actions/workflows/release.yml)
[![CI](https://github.com/dotoritos-kim/bms-electron-app/actions/workflows/ci.yml/badge.svg)](https://github.com/dotoritos-kim/bms-electron-app/actions/workflows/ci.yml)

## 소개

`bms-electron-app`은 BMS 계열 채보 파일(`.bms`, `.bme`, `.bml`, `.pms`, `.bmson`)을 재생하고 편집할 수 있는 Windows 데스크톱 앱입니다. 본 저장소는 다음 sibling 패키지들을 통합하는 셸 역할을 합니다.

- [`bms-core`](https://github.com/dotoritos-kim/bms-core) — 파서 / 도메인 모델 / 오디오 엔진 코어
- [`bms-player`](https://github.com/dotoritos-kim/bms-player) — 플레이어 UI 및 노트 렌더링
- [`bms-editor`](https://github.com/dotoritos-kim/bms-editor) — 채보 에디터 (편집 / 단축키 / 패턴 라이브러리)

### 주요 기능

- **Player** — 채보 재생, 키사운드 / 오디오 슬라이서, 파형 오버레이
- **Editor** — 노트 편집, BPM Tap, MIDI 매핑, 패턴 라이브러리, 자동 채보
- **세션 복원** — 마지막으로 열었던 파일과 라우트를 자동으로 복구
- **파일 연관(File Association)** — `.bms` / `.bme` / `.bml` / `.pms` / `.bmson` 더블클릭으로 실행
- **메뉴 단축키** — `Ctrl+O` / `Ctrl+Shift+O` / `Ctrl+S` / `Ctrl+Shift+S`

## 요구 사항

- **Node.js** 20.x (CI 기준)
- **npm** 10+
- **Windows 10/11** (배포 타겟; 개발은 macOS/Linux에서도 가능)
- **Git submodule 지원** — sibling 패키지(`bms-core`, `bms-player`, `bms-editor`)는 `vendor/` 하위에 submodule로 포함되며 npm workspaces로 연결됩니다.

## 빠른 시작

```bash
# 저장소 클론 (submodule 포함)
git clone --recurse-submodules https://github.com/dotoritos-kim/bms-electron-app.git
cd bms-electron-app

# 이미 clone한 경우라면
# git submodule update --init --recursive

# 워크스페이스 전체 의존성 설치 (root + vendor/*)
npm ci --legacy-peer-deps

# sibling 패키지 빌드 (npm workspaces)
npm run build --workspace=@rhythm-archive/bms-core
npm run build --workspace=@rhythm-archive/bms-player
npm run build --workspace=@rhythm-archive/bms-editor

# 앱 실행
npm run dev
```

> 개발 중에는 `electron.vite.config.ts`의 별칭이 `vendor/<pkg>/src/index.ts`를 직접 가리키므로, sibling 패키지를 매번 다시 빌드하지 않아도 HMR이 동작합니다. 단, `npm run package`로 배포 빌드를 만들 때는 위 sibling 빌드가 선행되어야 합니다.

## npm 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `npm run dev` | electron-vite 개발 서버 + Electron 메인 프로세스 동시 실행 (HMR) |
| `npm run build` | main / preload / renderer 번들을 `out/`에 빌드 |
| `npm start` | 빌드된 결과물을 Electron으로 실행 |
| `npm run preview` | electron-vite preview |
| `npm run package` | `electron-builder --win`으로 NSIS / Portable 패키징 |
| `npm run type-check` | `tsconfig.node.json` + `tsconfig.web.json` 타입 검사 |
| `npm test` | Vitest 단위 테스트 (1회) |
| `npm run test:watch` | Vitest watch 모드 |
| `npm run test:coverage` | v8 커버리지 리포트 |
| `npm run test:compat` | `tests/compatibility/` 호환성 스위트 |
| `npm run test:e2e` | Playwright E2E |
| `npm run test:all` | Vitest + Playwright 전부 실행 |
| `npm run test:mutation` | Stryker 변이 테스트 |

## 프로젝트 구조

```
bms-electron-app/
├── src/                       # 앱 본체 (main / preload / renderer / shared)
│   ├── main/                  # Electron Main 프로세스
│   │   ├── index.ts           # 앱 부트, BrowserWindow 생성
│   │   ├── menu.ts            # 애플리케이션 메뉴
│   │   └── ipc/               # IPC 핸들러 (file / audio / handle)
│   ├── preload/               # contextBridge — window.api 노출
│   ├── renderer/              # React 19 + Vite 렌더러
│   │   ├── App.tsx
│   │   ├── routes/            # Home / Player / Editor
│   │   ├── components/, stores/, hooks/, lib/, workers/
│   │   └── global.css         # Tailwind v4 entry
│   └── shared/
│       └── ipc-contract.ts    # main ↔ renderer IPC 타입 계약
├── vendor/                    # Git submodule (npm workspace)
│   ├── bms-core/              # 파서 / 도메인 모델 / 오디오 엔진 코어
│   ├── bms-player/            # 플레이어 UI 및 노트 렌더링
│   └── bms-editor/            # 채보 에디터
├── scripts/                   # dev.js, generate-test-fixtures.ts ...
├── tests/                     # Vitest + Playwright
├── docs/                      # QA 전략 / 변경 이력 / 프롬프트 기록
├── electron.vite.config.ts
├── .gitmodules                # vendor/* submodule URL 정의
├── playwright.config.ts
├── stryker.config.mjs
├── vitest.config.ts
└── package.json               # npm workspaces 루트
```

### 아키텍처 메모

- **Main ↔ Renderer 계약**은 [src/shared/ipc-contract.ts](src/shared/ipc-contract.ts)에 단일 진실 공급원으로 정의되며, preload에서 `window.api`로 노출됩니다 (`contextIsolation: true`, `nodeIntegration: false`).
- **렌더러는 React 19 + Tailwind v4 + Zustand + react-three/fiber** 조합을 사용합니다.
- **개발 모드 별칭**: `electron.vite.config.ts`에서 `@rhythm-archive/bms-*`를 `vendor/<pkg>/src/index.ts`로 직접 별칭 처리하여, sibling 패키지를 다시 빌드하지 않고도 HMR이 동작합니다.
- **세션 영속화**는 `lib/sessionStorage.ts`에서 처리하며, 마지막 라우트와 파일 경로를 저장합니다.

## 빌드 & 배포

### 로컬 패키징 (Windows)

```bash
npm run build       # out/ 빌드
npm run package     # NSIS 설치 파일 + Portable 빌드 → dist/
```

`electron-builder` 설정은 `package.json`의 `build` 필드에 있습니다.

- `appId`: `net.dotoritos.bms-desktop`
- `productName`: `BMS Desktop`
- 타겟: `nsis` (인스톨러), `portable` (단일 실행 파일)
- 파일 연관: `.bms` / `.bme` / `.bml` / `.pms` / `.bmson`

### GitHub Releases 자동 배포

`v*` 태그를 푸시하거나 [Release workflow](.github/workflows/release.yml)를 수동 실행하면 다음이 자동으로 진행됩니다.

1. `bms-electron-app` 체크아웃 (submodule 재귀 포함)
2. `npm ci`로 워크스페이스 전체 의존성 설치
3. `npm run build --workspace=...`로 sibling 패키지 빌드
4. `bms-electron-app` 빌드 + `electron-builder --win --publish always`
5. NSIS / Portable 인스톨러를 GitHub Releases에 첨부 + 워크플로 아티팩트로도 업로드

릴리스 절차:

```bash
# 버전 갱신
npm version patch    # or minor / major

# 태그 푸시
git push --follow-tags
```

태그가 푸시되면 [release.yml](.github/workflows/release.yml)이 자동 트리거되며, submodule이 비공개 저장소에 있는 경우 `SIBLING_REPO_TOKEN` secret이 사용됩니다 (없으면 `GITHUB_TOKEN`로 폴백).

## 테스트 전략

- **Unit / Component**: Vitest + Testing Library + jsdom
- **E2E**: Playwright (`tests/` 하위)
- **Mutation**: Stryker (`stryker.config.mjs`)
- **호환성**: `tests/compatibility/` — 다른 BMS 플레이어와의 동작 비교

자세한 전략은 [docs/QA_TEST_STRATEGY.md](docs/QA_TEST_STRATEGY.md)를 참고하세요.

## 라이선스

[MIT License](LICENSE) — Copyright (c) 2026 dotoritos-kim

`vendor/` 하위 sibling 패키지(`bms-core`, `bms-player`, `bms-editor`)도 모두 MIT 라이선스이며, 각 저장소의 `LICENSE` 파일에 동일한 저작권 표기가 포함되어 있습니다.

## 관련 문서

- [REFACTOR-PLAN.md](REFACTOR-PLAN.md) — 진행 중인 리팩터링 계획
- [docs/QA_TEST_STRATEGY.md](docs/QA_TEST_STRATEGY.md)
- [docs/QA_CHANGELOG.md](docs/QA_CHANGELOG.md)
