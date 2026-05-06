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
- **sibling 저장소 체크아웃** — 같은 부모 폴더에 다음과 같이 배치되어 있어야 합니다.

```
parent/
├── bms-core/
├── bms-player/
├── bms-editor/
└── bms-electron-app/   ← 이 저장소
```

`package.json`이 `file:../bms-core` 등의 로컬 경로 의존성으로 sibling 패키지를 참조하기 때문입니다.

## 빠른 시작

```bash
# sibling 저장소 클론
git clone https://github.com/dotoritos-kim/bms-core.git
git clone https://github.com/dotoritos-kim/bms-player.git
git clone https://github.com/dotoritos-kim/bms-editor.git
git clone https://github.com/dotoritos-kim/bms-electron-app.git

# sibling 패키지 빌드 (각 디렉터리에서)
cd bms-core    && npm ci --legacy-peer-deps && npm run build && cd ..
cd bms-player  && npm ci --legacy-peer-deps && npm run build && cd ..
cd bms-editor  && npm ci --legacy-peer-deps && npm run build && cd ..

# 앱 실행
cd bms-electron-app
npm ci
npm run dev
```

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
├── src/
│   ├── main/                  # Electron Main 프로세스
│   │   ├── index.ts           # 앱 부트, BrowserWindow 생성
│   │   ├── menu.ts            # 애플리케이션 메뉴
│   │   └── ipc/               # IPC 핸들러 (file / audio / handle)
│   ├── preload/               # contextBridge — window.api 노출
│   │   ├── index.ts
│   │   └── index.d.ts
│   ├── renderer/              # React 19 + Vite 렌더러
│   │   ├── App.tsx            # 라우트(home / player / editor) + 세션 복원
│   │   ├── main.tsx
│   │   ├── index.html
│   │   ├── routes/            # Home / Player / Editor
│   │   ├── components/        # Layout, Dialog, Toast, Waveform, ...
│   │   ├── stores/            # Zustand 스토어 (editorStore)
│   │   ├── hooks/, lib/, workers/
│   │   └── global.css         # Tailwind v4 entry
│   └── shared/
│       └── ipc-contract.ts    # main ↔ renderer IPC 타입 계약
├── scripts/
│   ├── dev.js                 # ELECTRON_RUN_AS_NODE 정리 + electron-vite dev
│   └── generate-test-fixtures.ts
├── tests/                     # Vitest + Playwright
├── docs/                      # QA 전략 / 변경 이력 / 프롬프트 기록
├── electron.vite.config.ts    # main / preload / renderer 빌드 설정
├── playwright.config.ts
├── stryker.config.mjs
├── vitest.config.ts
└── package.json
```

### 아키텍처 메모

- **Main ↔ Renderer 계약**은 [src/shared/ipc-contract.ts](src/shared/ipc-contract.ts)에 단일 진실 공급원으로 정의되며, preload에서 `window.api`로 노출됩니다 (`contextIsolation: true`, `nodeIntegration: false`).
- **렌더러는 React 19 + Tailwind v4 + Zustand + react-three/fiber** 조합을 사용합니다.
- **개발 모드 별칭**: `electron.vite.config.ts`에서 `@rhythm-archive/bms-*`를 sibling 저장소 `src/index.ts`로 직접 별칭 처리하여, sibling 패키지를 다시 빌드하지 않고도 HMR이 동작합니다.
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

릴리즈는 [release-please](https://github.com/googleapis/release-please) 기반으로 완전 자동화되어 있습니다. 개발자는 수동으로 버전을 올리거나 태그를 푸시할 필요가 없습니다.

릴리스 흐름:

1. PR이 default 브랜치에 머지되면 [release-please.yml](.github/workflows/release-please.yml)이 실행되어, [Conventional Commits](https://www.conventionalcommits.org/) 형식의 커밋(`feat:`, `fix:`, `perf:` 등)을 분석합니다.
2. release-please가 **Release PR**을 자동 생성/업데이트합니다 — `package.json` 버전 bump + `CHANGELOG.md` 갱신을 포함합니다.
3. Release PR을 머지하면 release-please가 GitHub Release와 `v*` 태그를 자동 생성합니다.
4. 태그 생성으로 [release.yml](.github/workflows/release.yml)이 트리거되어 다음을 수행합니다.
   - `bms-core`, `bms-player`, `bms-editor` sibling 저장소 체크아웃
   - 각 sibling 패키지 빌드
   - `bms-electron-app` 빌드 + `electron-builder --win --publish always`
   - NSIS / Portable 인스톨러를 GitHub Releases에 첨부 + 워크플로 아티팩트로도 업로드

커밋 메시지 규칙:

| Prefix | 의미 | 버전 영향 |
|--------|------|-----------|
| `feat:` | 새 기능 | minor bump |
| `fix:` | 버그 수정 | patch bump |
| `perf:` | 성능 개선 | patch bump |
| `feat!:` / `BREAKING CHANGE:` | 호환성 깨는 변경 | major bump (1.0.0 이후) |
| `chore:` / `docs:` / `test:` / `ci:` / `build:` / `refactor:` | CHANGELOG 비공개 | bump 없음 |

`SIBLING_REPO_TOKEN` secret은 release-please가 Release PR과 태그를 생성할 때, 그리고 `release.yml`이 sibling 저장소를 체크아웃할 때 사용됩니다. 부재 시 `GITHUB_TOKEN`로 폴백합니다.

> 긴급 hotfix 등 수동으로 릴리즈를 강제할 경우, `release.yml`을 `workflow_dispatch`로 직접 실행해 기존 태그를 재배포할 수 있습니다.

## 테스트 전략

- **Unit / Component**: Vitest + Testing Library + jsdom
- **E2E**: Playwright (`tests/` 하위)
- **Mutation**: Stryker (`stryker.config.mjs`)
- **호환성**: `tests/compatibility/` — 다른 BMS 플레이어와의 동작 비교

자세한 전략은 [docs/QA_TEST_STRATEGY.md](docs/QA_TEST_STRATEGY.md)를 참고하세요.

## 라이선스

본 저장소의 라이선스 정책은 별도로 명시되지 않은 경우 sibling 저장소(`bms-core` 등)의 라이선스를 따릅니다. 사용 전 각 저장소의 LICENSE를 확인하세요.

## 관련 문서

- [REFACTOR-PLAN.md](REFACTOR-PLAN.md) — 진행 중인 리팩터링 계획
- [docs/QA_TEST_STRATEGY.md](docs/QA_TEST_STRATEGY.md)
- [docs/QA_CHANGELOG.md](docs/QA_CHANGELOG.md)
