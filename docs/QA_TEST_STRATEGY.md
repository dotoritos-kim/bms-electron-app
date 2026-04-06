# BMS Desktop - QA 테스트 전략 및 구현 보고서

> 작성일: 2026-04-05
> 범위: 단위 테스트, 통합 테스트, E2E 테스트, Beatoraja 호환성 테스트, CI/CD 파이프라인

---

## 1. 개요

BMS Desktop은 Electron 33 + React 19 + Three.js 기반의 리듬게임 차트 에디터/플레이어 앱이다.
기존 3개 라이브러리(bms-core, bms-player, bms-editor)에 17개 테스트 파일(~395 케이스)이 있었으나,
**Electron 앱 자체는 테스트가 전무**했다.

본 QA 작업에서 다음을 설계하고 구현했다:

- 렌더러(Electron 내장 Chrome) 동작 테스트
- 전체 함수 단위 테스트
- E2E 사용자 시나리오
- 실제 차트 제작 후 Beatoraja 호환성 테스트

---

## 2. 테스트 결과 요약

| 항목 | 수치 |
|------|------|
| 신규 테스트 파일 | 19개 (unit 13 + integration 2 + compatibility 2 + e2e 4) |
| 신규 테스트 케이스 | 506 (unit/integration/compatibility) + 25 (E2E 시나리오) |
| 커버리지 (Statements) | **95.7%** |
| 커버리지 (Lines) | **96.8%** |
| 커버리지 (Functions) | **97.2%** |
| 발견 및 수정된 버그 | 2건 (`audio.ts:28` entries 미정의, `Editor.tsx` TDZ 에러) |

---

## 3. 발견 및 수정된 버그

### BUG-001: `audio.ts` — `entries` 미정의 참조

- **파일**: `src/main/ipc/audio.ts:28`
- **심각도**: Critical
- **증상**: `readdir` 실패 시 `entries` 변수가 아직 정의되지 않은 상태에서 참조되어 앱 크래시
- **원인**: `const entries = Object.entries(keysoundMap)`가 line 38에 선언되었으나, line 28의 catch 블록에서 먼저 사용
- **수정**: `entries` 선언을 `readdir` 호출 전으로 이동
- **회귀 테스트**: `tests/unit/ipc/audio.test.ts` — "directory not found" 테스트 케이스

### BUG-002: `Editor.tsx` — Temporal Dead Zone 에러

- **파일**: `src/renderer/routes/Editor.tsx`
- **심각도**: Critical
- **증상**: 에디터 화면 진입 시 "Cannot access 'handleSaveWithCleanup' before initialization" 크래시
- **원인**: `useEffect` 키보드 핸들러 내에서 `handleSaveWithCleanup`, `handlePlayTest`, `handlePlaybackToggle` 콜백을 참조하나, 이들이 `const`/`useCallback`으로 해당 `useEffect` 이후에 선언됨 (TDZ)
- **수정**: `useRef` 패턴으로 전환 — 콜백을 ref에 저장하고 키보드 핸들러에서 ref를 통해 접근
- **회귀 테스트**: E2E `tests/e2e/editor.spec.ts` — "editor renders without crash"

---

## 4. 테스트 아키텍처

### 4.1 프레임워크 스택

| 레이어 | 도구 | 용도 |
|--------|------|------|
| 단위 테스트 | Vitest 4.x | 순수 로직, 스토어, IPC 핸들러 |
| 통합 테스트 | Vitest 4.x | 차트 라운드트립, 에디터 워크플로우 |
| E2E | Playwright (`_electron.launch()`) | Electron 앱 실제 구동 테스트 |
| 호환성 | Vitest 4.x | BMS 포맷 준수, Beatoraja 호환 |
| 스냅샷 | Vitest inline snapshots | BMSWriter 출력 변경 자동 감지 |
| 뮤테이션 | Stryker Mutator | 테스트 품질 검증 |
| 커버리지 | @vitest/coverage-v8 | 패키지별 커버리지 추적 |
| CI/CD | GitHub Actions | PR/Push 자동 테스트, 야간 빌드 |

### 4.2 디렉토리 구조

```
tests/
├── unit/
│   ├── stores/
│   │   └── editorStore.test.ts        (176 tests)
│   ├── lib/
│   │   ├── autoChart.test.ts          (22 tests)
│   │   ├── keyBindings.test.ts        (53 tests)
│   │   ├── keysoundPlayerAdapter.test.ts (8 tests)
│   │   ├── LocalAudioWorker.test.ts   (10 tests)
│   │   ├── midiInput.test.ts          (30 tests)
│   │   ├── pathUtils.test.ts          (24 tests)
│   │   └── patternTemplates.test.ts   (24 tests)
│   ├── ipc/
│   │   ├── file.test.ts               (46 tests)
│   │   └── audio.test.ts              (10 tests)
│   └── electron-specific.test.ts      (23 tests)
├── integration/
│   ├── chart-roundtrip.test.ts        (15 tests)
│   └── editor-workflow.test.ts        (20 tests)
├── compatibility/
│   ├── format-compliance.test.ts      (30 tests)
│   └── writer-snapshots.test.ts       (15 tests)
└── e2e/
    ├── electron-app.ts                (shared fixture)
    ├── home.spec.ts                   (5 scenarios)
    ├── editor.spec.ts                 (10 scenarios)
    ├── player.spec.ts                 (4 scenarios)
    └── navigation.spec.ts            (6 scenarios)
```

### 4.3 설정 파일

| 파일 | 용도 |
|------|------|
| `vitest.config.ts` | 단위/통합/호환성 테스트 설정 (jsdom, globals, coverage) |
| `playwright.config.ts` | E2E 테스트 설정 (Electron 앱 실행) |
| `stryker.config.mjs` | 뮤테이션 테스트 대상 모듈 및 임계값 |
| `.github/workflows/test.yml` | PR/Push 시 자동 테스트 + E2E |
| `.github/workflows/nightly.yml` | 야간 뮤테이션 + 호환성 테스트 |

---

## 5. 단위 테스트 상세

### 5.1 editorStore.ts (176 tests) — 최고 ROI

Zustand 스토어의 모든 액션을 테스트한다. DOM/Electron 의존 없이 순수 로직만 검증.

| 카테고리 | 테스트 수 | 설명 |
|----------|----------|------|
| beatToMF | 4 | measure/fraction 계산 |
| 초기화 | 9 | reset(), initFromChart() |
| Undo/Redo | 11 | 스택 push/pop, 50개 제한 |
| 노트 CRUD | 27 | add/delete/move/select/update |
| 마디 관리 | 16 | insertMeasure, deleteMeasure |
| 변환 | 18 | mirror/flip/random/quantize |
| 키음 레이어 | 6 | addKeysoundLayer, removeKeysoundLayer |
| 클립보드 | 13 | copy/cut/paste |
| BPM/STOP | 14 | changeBpm, submitInputDialog |
| 헤더 | 6 | changeHeader, updateHeadersWithWavDefs |
| 세터 | 23 | 모든 set*/toggle 메서드 |
| 패턴 | 18 | applyPattern, selectionToPatternData |
| 엣지 케이스 | 5 | 라운드트립, 순차 ID 등 |

### 5.2 커버리지 상세

| 모듈 | Stmts | Branch | Funcs | Lines |
|------|-------|--------|-------|-------|
| editorStore.ts | 97.8% | 89.6% | 100% | 100% |
| keyBindings.ts | 100% | 100% | 100% | 100% |
| pathUtils.ts | 100% | 100% | 100% | 100% |
| keysoundPlayerAdapter.ts | 100% | 100% | 100% | 100% |
| audio.ts (IPC) | 100% | 83.3% | 100% | 100% |
| patternTemplates.ts | 97.4% | 100% | 100% | 97.2% |
| LocalAudioWorker.ts | 97.4% | 61.1% | 90% | 97.3% |
| autoChart.ts | 80% | 80% | 83.3% | 79.2% |
| midiInput.ts | 100% | 91.2% | 100% | 100% |
| file.ts (IPC) | 96.8% | 85.9% | 87.5% | 98.2% |

> `autoChart.ts`의 낮은 커버리지는 Markov chain 학습 내부 루프 때문이며, 알고리즘 동작은 통합 테스트로 보완된다.

---

## 6. 통합 테스트

### 6.1 차트 라운드트립 (15 tests)

BMS 문자열 파싱 → 에디터 수정 → BMSWriter 출력 → 재파싱의 전체 주기를 검증한다.

- 노트 수/위치/키음 보존
- 헤더(title, artist, BPM) 보존
- BPM 변경/STOP 이벤트 보존
- insertMeasure/deleteMeasure 후 재직렬화
- LN(long note) endBeat 보존
- 빈 차트/대형 차트(100+ 노트) 처리

### 6.2 에디터 워크플로우 (20 tests)

크로스 모듈 상호작용을 검증한다.

- 새 차트 생성 → 노트 추가 → BMS 출력
- 복사/붙여넣기 워크플로우
- 패턴 적용 → Undo → 복원
- BPM 변경 → 타이밍 재계산
- 연속 작업의 일관성

---

## 7. E2E 테스트 (Playwright)

Electron 앱을 실제로 실행하여 사용자 시나리오를 검증한다.

### 7.1 홈 화면 (5 scenarios)

- 앱 윈도우 정상 실행
- 버튼 렌더링
- 최소 윈도우 크기 (800x600)
- 시작 시 콘솔 에러 없음
- DEV 헬퍼를 통한 네비게이션

### 7.2 에디터 (10 scenarios)

- 크래시 없는 렌더링
- 키보드 단축키 응답 (Escape, V/A/D/M/K/B/T)
- Undo/Redo (Ctrl+Z/Y)
- 새 파일 (Ctrl+N), 검색 (Ctrl+F), 퀀타이즈 (Q), 패턴 패널 (P)
- 홈으로 복귀
- 스크린샷 베이스라인

### 7.3 플레이어 (4 scenarios)

- 크래시 없는 렌더링
- 콘텐츠 표시
- 홈으로 복귀
- 스크린샷 베이스라인

### 7.4 네비게이션 (6 scenarios)

- 전체 라우트 사이클 (home → editor → home → player → home)
- preload API 노출 검증 (window.api.file.*, window.api.audio.*)
- IPC 브릿지 메서드 완전성 (13개 file 메서드 + 2개 audio 메서드)
- DEV 헬퍼 존재
- 빠른 연속 네비게이션 스트레스 테스트
- localStorage 접근 및 영속성

---

## 8. Beatoraja 호환성 테스트

### 8.1 포맷 준수 (30 tests)

BMSWriter 출력이 BMS 사양을 준수하는지 검증한다.

**헤더**:
- `#PLAYER` (1/2/3), `#BPM` (양수), `#RANK` (0-3), `#PLAYLEVEL` (정수)
- `#LNTYPE 1` (LN 존재 시), `#WAVxx` (base-36, 중복 없음)

**채널 인코딩**:
- 01: BGM, 03: 인라인 BPM, 08: 확장 BPM, 09: STOP
- 11-17: 1P 플레이, 16: 스크래치

**마디 데이터**:
- `#MMMCC:data` 형식 준수
- 짝수 길이 base-36 쌍, `00` = 빈 슬롯

**엣지 케이스**:
- BPM > 255 → 확장 BPM 필수
- 소수점 BPM → 확장 BPM 필수
- 마디 경계 노트, 고밀도 마디

### 8.2 스냅샷 테스트 (15 tests)

BMSWriter 출력을 스냅샷으로 고정하여 리팩토링 시 의도치 않은 변경을 감지한다.

| 스냅샷 | 내용 |
|--------|------|
| 빈 차트 | 최소 BMS 출력 |
| 7K 기본 | 3노트 차트 |
| 인라인 BPM | BPM <= 255 |
| 확장 BPM | BPM > 255 |
| STOP 이벤트 | 정지 타이밍 |
| LN | 롱노트 인코딩 |
| 박자표 변경 | 채널 02 |
| BGM/인비저블/랜드마인 | 특수 채널 |
| 14K DP | PLAYER 2 |
| 기타 | 멀티 키음, 다중 마디, 고밀도 |

### 8.3 크로스 플레이어 호환 매트릭스

| 기능 | Beatoraja | LR2 |
|------|-----------|-----|
| 7K SP | Must Pass | Should Pass |
| 5K SP | Must Pass | Should Pass |
| 14K DP | Must Pass | Should Pass |
| LN Type 1 | Must Pass | Must Pass |
| Extended BPM | Must Pass | Must Pass |
| STOP | Must Pass | Must Pass |
| Landmine | Must Pass | N/A |
| Multi-keysound | Must Pass | Should Pass |

---

## 9. Electron 렌더러 Chrome 특수 테스트 (23 tests)

### 9.1 IPC 브릿지 타입 계약 (7 tests)
preload에서 노출된 `ElectronAPI` 인터페이스 형상 검증.

### 9.2 TypedArray 직렬화 (5 tests)
IPC 경계를 넘는 Float32Array/Int16 변환, 클리핑, Buffer 라운드트립.

### 9.3 localStorage 신뢰성 (5 tests)
대용량 데이터(4MB), JSON.parse 에러 복구, Map 직렬화, 동시 읽기/쓰기.

### 9.4 Worker 메시지 프로토콜 (3 tests)
MessageEvent 생성, postMessage/onmessage, addEventListener 수명주기.

### 9.5 Web Audio API (2 tests)
AudioContext 상태 머신, 미사용 시 안전한 폴백.

### 9.6 메모리 패턴 (1 test)
100MB Float32Array 할당 (디코딩된 오디오 버퍼 시뮬레이션).

---

## 10. CI/CD 파이프라인

### 10.1 PR/Push 워크플로우 (`.github/workflows/test.yml`)

```
push/PR to main/master
  ├── unit-test (windows-latest)
  │   ├── npm ci
  │   ├── vitest run (unit + integration + compatibility)
  │   ├── vitest run --coverage
  │   └── upload coverage artifact
  └── e2e-test (windows-latest, needs unit-test)
      ├── npm ci
      ├── playwright install
      ├── electron-vite build
      ├── playwright test
      └── upload traces on failure
```

### 10.2 야간 빌드 (`.github/workflows/nightly.yml`)

```
Daily 03:00 UTC (or manual)
  ├── mutation-test
  │   ├── stryker run
  │   └── upload mutation report
  └── compatibility-test
      └── vitest run tests/compatibility/
```

### 10.3 Stryker 뮤테이션 테스트 대상

| 모듈 | 이유 |
|------|------|
| editorStore.ts | 50+ 액션, 조건 분기 다수 |
| autoChart.ts | 알고리즘 로직, 수치 경계값 |
| keyBindings.ts | 문자열 정규화, 미묘한 버그 가능 |
| ipc/file.ts | WAV 헤더 바이트 오프셋 — 1바이트 차이 = 파일 손상 |

임계값: high 80%, low 60%, break 50%

---

## 11. 실행 방법

```bash
# devDependencies 포함 설치 (npm omit=dev 설정 시 필수)
npm install --include=dev

# 단위 + 통합 + 호환성 테스트
npm test -- tests/unit tests/integration tests/compatibility

# 커버리지 리포트
npm run test:coverage -- tests/unit tests/integration tests/compatibility

# E2E 테스트 (앱 빌드 필요)
npm run build && npm run test:e2e

# 호환성 테스트만
npm run test:compat

# 뮤테이션 테스트
npm run test:mutation

# 전체 실행
npm run test:all
```

---

## 12. 향후 개선 사항

| 항목 | 우선순위 | 설명 |
|------|---------|------|
| ~~midiInput.ts 커버리지~~ | ~~Medium~~ | ✅ 완료 — Web MIDI API 모킹으로 100% 커버리지 달성 |
| ~~file.ts dialog 핸들러~~ | ~~Medium~~ | ✅ 완료 — saveAs, importKeysounds, openAudioFile, saveWavSlices 추가 (96.8%) |
| 비주얼 리그레션 | Low | Playwright 스크린샷 비교 자동화 |
| Beatoraja 실제 구동 | Low | CI에 Beatoraja headless 설치 및 BMS 로딩 검증 |
| LR2 호환 검증 | Low | 포맷 준수로 대체 (LR2는 자동화 불가) |
| 성능 벤치마크 | Low | GameLoop tick() 정확도, 오디오 지연 측정 |
