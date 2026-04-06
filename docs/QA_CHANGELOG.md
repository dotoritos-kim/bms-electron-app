# QA 테스트 작업 변경 기록

> 작성일: 2026-04-05
> 작업 범위: QA_TEST_STRATEGY.md 문서 기반 테스트 인프라 구축 및 버그 수정

---

## 1. 작업 요약

QA_TEST_STRATEGY.md 설계 문서를 기반으로 테스트 인프라를 구축하고, 실행 과정에서
발견된 모든 버그와 설정 오류를 수정하여 **531개 테스트(Vitest 506 + E2E 25)가
100% 통과**하는 상태로 완성했다.

### 최종 수치

| 항목 | 수치 |
|------|------|
| Vitest 테스트 파일 | 15개 |
| Vitest 테스트 케이스 | 506개 (all passed) |
| E2E 시나리오 | 25개 (all passed) |
| 커버리지 (Statements) | 95.7% |
| 커버리지 (Lines) | 96.8% |
| 커버리지 (Functions) | 97.2% |
| 발견/수정된 앱 버그 | 2건 |
| 수정된 테스트 인프라 문제 | 4건 |

---

## 2. 발견 및 수정된 앱 버그 (2건)

### BUG-001: `audio.ts` — `entries` 미정의 참조 (이전 세션에서 수정)

- **파일**: `src/main/ipc/audio.ts:28`
- **심각도**: Critical
- **증상**: `readdir` 실패 시 `entries` 변수가 정의 전 참조 → 앱 크래시
- **원인**: `const entries = Object.entries(keysoundMap)`가 line 38에 선언되었으나,
  line 28의 catch 블록에서 먼저 사용
- **수정**: `entries` 선언을 `readdir` 호출 전(line 24)으로 이동
- **회귀 테스트**: `tests/unit/ipc/audio.test.ts` — "directory not found" 케이스

### BUG-002: `Editor.tsx` — Temporal Dead Zone 에러

- **파일**: `src/renderer/routes/Editor.tsx`
- **심각도**: Critical (에디터 진입 불가)
- **증상**: 에디터 화면 진입 시 `Cannot access 'handleSaveWithCleanup' before initialization` 크래시.
  이후 `handlePlayTest`, `handlePlaybackToggle`도 동일 TDZ 에러 발생.
- **원인**: `useEffect` 키보드 핸들러(line ~635) 내에서 3개 콜백을 참조하나,
  이들이 모두 `const`/`useCallback`으로 해당 `useEffect` **이후**에 선언되어 있었음.
  - `handleSaveWithCleanup` → line 945
  - `handlePlaybackToggle` → line 844
  - `handlePlayTest` → line 969
- **수정**:
  1. `handleSaveWithCleanup` 정의를 키보드 핸들러 이전(line 627)으로 이동
  2. 나머지 2개 콜백은 `useRef` 패턴으로 전환:
     - `handlePlayTestRef`, `handlePlaybackToggleRef` ref 생성
     - 키보드 핸들러에서 `ref.current?.()` 호출
     - 각 콜백 정의 직후 ref 갱신
  3. `useEffect` 의존성 배열에서 3개 콜백 제거 (ref 사용으로 불필요)
- **회귀 테스트**: E2E `tests/e2e/editor.spec.ts` — "editor renders without crash"
- **변경된 코드** (diff 요약):
  ```
  src/renderer/routes/Editor.tsx | 31 insertions, 12 deletions
  ```

---

## 3. 수정된 테스트 인프라 문제 (4건)

### INFRA-001: Vitest `globals: true`와 `import from 'vitest'` 충돌

- **영향 파일** (10개):
  - `tests/unit/ipc/audio.test.ts`
  - `tests/unit/ipc/file.test.ts`
  - `tests/unit/lib/keyBindings.test.ts`
  - `tests/unit/lib/keysoundPlayerAdapter.test.ts`
  - `tests/unit/lib/LocalAudioWorker.test.ts`
  - `tests/unit/lib/midiInput.test.ts`
  - `tests/compatibility/format-compliance.test.ts`
  - `tests/compatibility/writer-snapshots.test.ts`
  - `tests/integration/chart-roundtrip.test.ts`
  - `tests/integration/editor-workflow.test.ts`
- **증상**: 두 가지 에러가 혼재
  - `Error: Vitest failed to find the runner` — `// @vitest-environment node` + 명시적 import 조합
  - `TypeError: Cannot read properties of undefined (reading 'config')` — jsdom 환경에서 명시적 import
- **원인**: `vitest.config.ts`에 `globals: true`가 설정되어 `describe`, `it`, `expect`,
  `vi`, `beforeEach` 등이 전역 사용 가능한데, 테스트 파일에서 `import { ... } from 'vitest'`를
  명시적으로 호출하면 Vitest 러너 초기화 타이밍과 충돌
- **수정**: 10개 파일에서 `import { ... } from 'vitest'` 구문 일괄 제거
- **교훈**: `globals: true` 설정 시 vitest에서 직접 import하면 안 됨

### INFRA-002: WAV 헤더 오프셋 테스트 오류

- **파일**: `tests/unit/ipc/file.test.ts:282`
- **증상**: `file:saveWavSlice` 테스트에서 `blockAlign` 값 검증 실패
  - `expect(buffer.readUInt16LE(30)).toBe(4)` → 실제 값 2
- **원인**: 테스트가 WAV 표준과 다른 비표준 오프셋을 사용. 소스 코드는 정확했음:
  - offset 32: `blockAlign` (channels * 2)
  - offset 34: `bitsPerSample` (16)
- **수정**: 테스트 오프셋을 소스 코드와 일치하도록 수정 (30→32, 32→34)

### INFRA-003: E2E Playwright `ELECTRON_RUN_AS_NODE` 환경변수 간섭

- **파일**: `tests/e2e/electron-app.ts`
- **증상**: 모든 E2E 테스트에서 `Error: Process failed to launch!`
- **원인**: Claude Code (VSCode 확장) 실행 환경에서 `ELECTRON_RUN_AS_NODE=1`이 설정됨.
  Playwright의 `_electron.launch()`가 `process.env`를 그대로 전달하면
  Electron이 Node.js 모드로 실행되어 `electron.app`이 undefined가 됨.
- **수정**: fixture에서 `ELECTRON_RUN_AS_NODE`를 제거한 환경변수 전달:
  ```ts
  const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
  ```

### INFRA-004: 루트 레벨 중복 테스트 파일

- **삭제된 파일** (5개):
  - `tests/autoChart.test.ts`
  - `tests/editorStore.test.ts`
  - `tests/ipc-audio.test.ts` (jsdom 환경에서 node 모듈 import 시도로 실패)
  - `tests/pathUtils.test.ts`
  - `tests/wavWriter.test.ts`
- **원인**: 테스트를 `tests/unit/` 하위 디렉토리로 정리하면서 루트 레벨 원본이 남아있었음
- **영향**: `npm test` (디렉토리 미지정) 실행 시 `ipc-audio.test.ts`가 실패

---

## 4. 커버리지 개선 작업

### 4.1 midiInput.ts: 49.2% → 100%

- **추가된 테스트**: 15개 (총 15 → 30)
- **새로 커버된 함수**:
  - `requestMidiAccess()` — 성공, 캐시, 거부 3개 케이스
  - `getMidiInputDevices()` — 미접속, 정상, 미명명 디바이스
  - `connectMidiInput()` — 미접속, 미존재 디바이스, 정상 연결
  - MIDI 메시지 처리 — Note On, Note Off(velocity 0), CC, 짧은 메시지
  - `disconnectMidiInput()` / `isConnected()` — 연결 해제, 디바이스 교체
- **기법**: `vi.resetModules()` + dynamic import로 모듈 레벨 상태 격리,
  `navigator.requestMIDIAccess` 런타임 모킹

### 4.2 file.ts (IPC): 59.5% → 96.8%

- **추가된 테스트**: 16개 (총 30 → 46)
- **새로 커버된 핸들러**:
  - `file:readBms` — 버퍼 반환
  - `file:saveAs` — 취소, 성공, rename 실패 폴백, null 윈도우
  - `file:importKeysounds` — 취소, 복사 성공, 동일 경로 스킵, null 윈도우
  - `dialog:openAudioFile` — 취소, 성공, null 윈도우
  - `file:saveWavSlices` — 다중 슬라이스, RIFF/WAVE 헤더, 빈 배열, float→int16 변환

---

## 5. 변경된 파일 전체 목록

### 소스 코드 (앱 버그 수정)

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/main/ipc/audio.ts` | Modified | BUG-001: entries 선언 위치 이동 |
| `src/renderer/routes/Editor.tsx` | Modified | BUG-002: TDZ 에러 — ref 패턴 전환 |

### 테스트 파일 (신규 생성)

| 파일 | 테스트 수 | 설명 |
|------|----------|------|
| `tests/unit/stores/editorStore.test.ts` | 176 | Zustand 스토어 전체 액션 |
| `tests/unit/lib/autoChart.test.ts` | 22 | AI 채보 생성 알고리즘 |
| `tests/unit/lib/keyBindings.test.ts` | 53 | 단축키 바인딩/직렬화 |
| `tests/unit/lib/keysoundPlayerAdapter.test.ts` | 8 | 오디오 어댑터 |
| `tests/unit/lib/LocalAudioWorker.test.ts` | 10 | IPC 기반 Worker shim |
| `tests/unit/lib/midiInput.test.ts` | 30 | MIDI 입력/매핑/저장 |
| `tests/unit/lib/pathUtils.test.ts` | 24 | 경로 유틸리티 |
| `tests/unit/lib/patternTemplates.test.ts` | 24 | 패턴 템플릿 CRUD |
| `tests/unit/ipc/file.test.ts` | 46 | 파일 IPC 핸들러 |
| `tests/unit/ipc/audio.test.ts` | 10 | 오디오 IPC 핸들러 |
| `tests/unit/electron-specific.test.ts` | 23 | Electron 렌더러 특수 동작 |
| `tests/integration/chart-roundtrip.test.ts` | 15 | BMS 파싱→수정→출력 주기 |
| `tests/integration/editor-workflow.test.ts` | 20 | 크로스 모듈 워크플로우 |
| `tests/compatibility/format-compliance.test.ts` | 30 | BMS 사양 준수 |
| `tests/compatibility/writer-snapshots.test.ts` | 15 | BMSWriter 출력 스냅샷 |
| `tests/e2e/electron-app.ts` | — | Playwright 공유 fixture |
| `tests/e2e/home.spec.ts` | 5 | 홈 화면 시나리오 |
| `tests/e2e/editor.spec.ts` | 10 | 에디터 시나리오 |
| `tests/e2e/player.spec.ts` | 4 | 플레이어 시나리오 |
| `tests/e2e/navigation.spec.ts` | 6 | 네비게이션 시나리오 |

### 테스트 파일 (수정)

| 파일 | 변경 | 설명 |
|------|------|------|
| `tests/unit/ipc/audio.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/unit/ipc/file.test.ts` | import 제거 + WAV 오프셋 수정 + 16개 테스트 추가 | INFRA-001, INFRA-002, 커버리지 개선 |
| `tests/unit/lib/keyBindings.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/unit/lib/keysoundPlayerAdapter.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/unit/lib/LocalAudioWorker.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/unit/lib/midiInput.test.ts` | import 제거 + 15개 테스트 추가 | INFRA-001, 커버리지 개선 |
| `tests/compatibility/format-compliance.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/compatibility/writer-snapshots.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/integration/chart-roundtrip.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/integration/editor-workflow.test.ts` | `import from 'vitest'` 제거 | INFRA-001 |
| `tests/e2e/electron-app.ts` | `ELECTRON_RUN_AS_NODE` 환경변수 제거 | INFRA-003 |

### 테스트 파일 (삭제)

| 파일 | 사유 |
|------|------|
| `tests/autoChart.test.ts` | `tests/unit/lib/autoChart.test.ts`와 중복 |
| `tests/editorStore.test.ts` | `tests/unit/stores/editorStore.test.ts`와 중복 |
| `tests/ipc-audio.test.ts` | `tests/unit/ipc/audio.test.ts`와 중복 + jsdom 환경 오류 |
| `tests/pathUtils.test.ts` | `tests/unit/lib/pathUtils.test.ts`와 중복 |
| `tests/wavWriter.test.ts` | `tests/unit/ipc/file.test.ts`에 통합 |

### 설정/CI 파일 (신규 생성)

| 파일 | 설명 |
|------|------|
| `vitest.config.ts` | 단위/통합/호환성 테스트 설정 |
| `playwright.config.ts` | E2E 테스트 설정 |
| `stryker.config.mjs` | 뮤테이션 테스트 설정 |
| `.github/workflows/test.yml` | PR/Push 자동 테스트 + E2E |
| `.github/workflows/nightly.yml` | 야간 뮤테이션 + 호환성 테스트 |

### 문서

| 파일 | 설명 |
|------|------|
| `docs/QA_TEST_STRATEGY.md` | 커버리지 수치/테스트 수/버그 정보 업데이트 |
| `docs/QA_CHANGELOG.md` | 본 문서 (작업 변경 기록) |

---

## 6. 검증 방법

```bash
# 전체 Vitest 실행 (506 tests)
npm test

# 커버리지 리포트
npm run test:coverage

# E2E 테스트 (빌드 후 실행, 25 scenarios)
npm run build && npm run test:e2e

# 전체 실행
npm run test:all
```

---

## 7. GUI 테스트 자동화 확장 (2026-04-05)

> 에디터 5K~48K 전 키 모드 GUI 검증 및 모든 인터랙티브 컴포넌트 테스트 자동화

### 7.1 작업 요약

| 항목 | 이전 | 이후 |
|------|------|------|
| Vitest 테스트 파일 | 15개 | 22개 (+7) |
| Vitest 테스트 케이스 | 506개 | 833개 (+327) |
| E2E spec 파일 | 5개 | 9개 (+4) |
| E2E 시나리오 | 32개 | ~130개 (+~98) |
| BMS 테스트 픽스처 | 1개 (7K) | 13개 (4K~48K + stress) |
| RTL 컴포넌트 테스트 | 0개 | 68개 |
| 키 모드 커버리지 | 1개 (7K 묵시적) | 12개 (전 모드) |

### 7.2 Phase별 작업 내역

#### Phase 0: 테스트 인프라 구축

| 파일 | 설명 |
|------|------|
| `tests/setup.ts` | RTL jest-dom 설정 (`@testing-library/jest-dom` import) |
| `tests/utils/renderWithStore.tsx` | Zustand 스토어 + React 렌더 래퍼 |
| `scripts/generate-test-fixtures.ts` | 12개 키 모드별 BMS 픽스처 자동 생성 스크립트 |
| `vitest.config.ts` | `setupFiles` 추가, `process.env.NODE_ENV` define 추가 |
| `src/renderer/routes/Editor.tsx` | 14개 `data-testid` 어트리뷰트 추가 |

**생성된 픽스처** (`tests/e2e/fixtures/`):
- `test-4k.bms` ~ `test-48k.bms` (11개 모드)
- `test-stress.bms` (7K, 50마디, 2000+ 노트)

**추가된 `data-testid`**:
`back-btn`, `toggle-left-panel`, `toggle-right-panel`, `diff-btn`, `bpm-btn`, `play-test-btn`, `ai-btn`, `slicer-btn`, `midi-btn`, `keybindings-btn`, `save-btn`, `left-panel`, `right-panel`, `playback-controls`, `status-bar`

#### Phase 1: 레인 설정 단위 테스트 (기존 완료)

- **파일**: `tests/unit/laneConfig.test.ts` (107 테스트)
- 이전 QA 세션에서 12개 전 모드 레인 설정 검증 완료
- 레인 개수, ID, 스크래치/FZ, 폭, 색상, x좌표 단조 증가 등 전수 검증

#### Phase 2: 트랜스폼 정합성 — 키 모드 교차 검증 (신규)

- **파일**: `tests/unit/stores/editorStore-transforms.test.ts` (115 테스트)
- **Tier A 4개 대표 모드**: 7K (IIDX SP), 9K (PMS), 14K (IIDX DP), 24K (KB DP)
- **검증 항목**:
  - Mirror: 첫번째↔마지막 레인, SC↔SC2, FZ↔FZ2, 이중 미러 = 항등, 9K 중앙 레인 불변
  - Random: 컬럼 유효성, 중복 없음, 미선택 노트 보존
  - Flip: 비트 역전, LN beat<endBeat 보장, 이중 플립 = 항등
  - Quantize: 그리드 스냅, 정렬된 노트 불변
  - Undo: 모든 트랜스폼 후 복원 정합성
- **14K 특수 테스트**: SC→SC2, FZ→FZ2, 컬럼1→14, 컬럼7→8, 전체 레인 미러
- **24K 특수 테스트**: 1→24, 12→13, 24→1
- **9K 특수 테스트**: 중앙 레인(5) 미러 불변, 1→9

#### Phase 3: RTL 컴포넌트 테스트 — 다이얼로그 (신규)

| 파일 | 테스트 수 | 주요 검증 항목 |
|------|----------|--------------|
| `tests/unit/components/KeyBindingsDialog.test.tsx` | 20 | 편집 모드, 충돌 감지, 저장/리셋/취소, ARIA |
| `tests/unit/components/AutoChartDialog.test.tsx` | 16 | 생성/제안 탭, 슬라이더, Apply/Cancel |
| `tests/unit/components/MidiMappingDialog.test.tsx` | 15 | 장치, 프리셋, 녹음 모드, Learn |
| `tests/unit/components/PatternLibraryPanel.test.tsx` | 17 | 카테고리, 검색, 적용, 사용자 패턴 삭제 |

**RTL 환경 설정 이슈**: React 19의 프로덕션 빌드는 `React.act`를 export하지 않아 RTL v16이 실패함. `vitest.config.ts`에 `define: { 'process.env.NODE_ENV': '"development"' }` 추가로 해결.

#### Phase 4: 에디터 패널 & 상태 테스트 (신규)

- **파일**: `tests/unit/components/EditorPanels.test.ts` (34 테스트)
- **검증 항목**:
  - `estimateDifficulty`: 빈 노트→0, 1-12 범위, NPS/BPM/LN 기여도, 12 클램핑
  - `computeChartStats`: 타입별 카운트, NPS 계산, 마디 수, 재생 시간
  - `formatTime`: m:ss 포맷, 소수 절삭
  - 스토어 UI 상태: 패널 토글, Toast, BackConfirm, InputDialog, AudioPhase, 볼륨, A-B 루프

#### Phase 5: Playwright E2E — 키 모드별 렌더링 (업데이트)

- **파일**: `tests/e2e/editor-keymodes.spec.ts` (~48 시나리오)
- 12개 전 모드 로딩 + 크래시 미발생 + 제목 표시 + 스크린샷
- 모드별 툴바/패널 표시, 도구 전환
- DP 모드 (10K, 14K): 양측 노트 로딩 검증
- 키보드 모드 (8K, 9K, 12K, 18K): 스크래치 없는 렌더링
- 확장 모드 (24K, 48K): 좁은 레인 렌더링, 기본 조작 응답

#### Phase 6: Playwright E2E — 다이얼로그 심층 인터랙션 (업데이트)

- **파일**: `tests/e2e/editor-dialogs.spec.ts` (~30 시나리오)
- **추가된 테스트**:
  - BPM 탭: 탭 등록→BPM 표시, 리셋으로 초기화
  - 키 바인딩: 리바인딩 편집 모드, 기본값 복원
  - 차트 Diff: 변경 후 비교 오버레이 표시/닫기
- **기존**: 노트 검색, AI 차트, 키 바인딩, MIDI, 슬라이서, 마디 삽입/삭제, Back 확인, BPM 입력

#### Phase 7: 성능 & 스트레스 테스트 (신규)

- **파일**: `tests/e2e/editor-performance.spec.ts` (5 시나리오)
- 스트레스 차트 (2000+ 노트) 10초 이내 로딩
- 도구 빠른 전환 20사이클 (V→A→D→M→K→B→T)
- 대량 Undo/Redo 10회 정합성
- 48K 모드 기본 조작 (선택, 퀀타이즈, 언두)
- 다이얼로그 연속 개폐 사이클

#### Phase 8: 접근성 테스트 (신규)

- **파일**: `tests/e2e/editor-accessibility.spec.ts` (~15 시나리오)
- 도구 단축키 (V/A/D/M/K/B/T) 전부 기능 동작
- Ctrl+Z/Y, Ctrl+C/X/V, A-B 루프 ([ ] \), P 패턴 패널
- Escape 키: 노트 검색, 키 바인딩, BPM 탭 다이얼로그 닫기
- 아이콘 버튼 `title` 어트리뷰트 존재 검증
- 좌측/우측 패널 토글 동작

### 7.3 신규 파일 전체 목록

| 파일 | 유형 | 테스트 수 |
|------|------|----------|
| `tests/setup.ts` | 설정 | — |
| `tests/utils/renderWithStore.tsx` | 헬퍼 | — |
| `scripts/generate-test-fixtures.ts` | 스크립트 | — |
| `tests/unit/stores/editorStore-transforms.test.ts` | 단위 | 115 |
| `tests/unit/components/KeyBindingsDialog.test.tsx` | RTL | 20 |
| `tests/unit/components/AutoChartDialog.test.tsx` | RTL | 16 |
| `tests/unit/components/MidiMappingDialog.test.tsx` | RTL | 15 |
| `tests/unit/components/PatternLibraryPanel.test.tsx` | RTL | 17 |
| `tests/unit/components/EditorPanels.test.ts` | 단위 | 34 |
| `tests/e2e/editor-keymodes.spec.ts` | E2E | ~48 |
| `tests/e2e/editor-dialogs.spec.ts` | E2E | ~30 |
| `tests/e2e/editor-performance.spec.ts` | E2E | 5 |
| `tests/e2e/editor-accessibility.spec.ts` | E2E | ~15 |
| `tests/e2e/fixtures/test-{4k..48k}.bms` | 픽스처 | — |
| `tests/e2e/fixtures/test-stress.bms` | 픽스처 | — |

### 7.4 수정된 기존 파일

| 파일 | 변경 내용 |
|------|----------|
| `vitest.config.ts` | `setupFiles`, `define` 추가 |
| `src/renderer/routes/Editor.tsx` | 14개 `data-testid` 어트리뷰트 추가 |
| `tests/e2e/editor-keymodes.spec.ts` | 픽스처 경로 수정 (`test-chart-XK` → `test-xk`), 타이틀/BPM 기대값 수정 |
| `tests/e2e/editor-dialogs.spec.ts` | BPM 탭, 키 바인딩, Diff 심층 테스트 추가 |

### 7.5 검증 방법

```bash
# 전체 Vitest 실행 (833 tests)
npm test

# 컴포넌트 테스트만
npx vitest run tests/unit/components/

# 트랜스폼 테스트만
npx vitest run tests/unit/stores/editorStore-transforms.test.ts

# E2E 전체 (빌드 필요)
npx electron-vite build && npx playwright test

# 키 모드 E2E만
npx playwright test tests/e2e/editor-keymodes.spec.ts
```

---

## 8. 향후 주의사항

1. **RTL 테스트 시 NODE_ENV**: `vitest.config.ts`의 `define: { 'process.env.NODE_ENV': '"development"' }`를
   제거하면 React 19 프로덕션 빌드가 로드되어 `React.act is not a function` 에러 발생.
   RTL v16 컴포넌트 테스트에 필수.

2. **BMS 픽스처 갱신**: 채널 매핑이 변경되면 `scripts/generate-test-fixtures.ts`를 수정 후
   `npx tsx scripts/generate-test-fixtures.ts`로 재생성해야 함.

3. **data-testid 유지**: E2E 테스트가 `[data-testid="..."]` 셀렉터에 의존하므로,
   Editor.tsx의 data-testid 어트리뷰트를 임의 제거하면 E2E 실패.

4. **Vitest import 금지**: `vitest.config.ts`에 `globals: true`가 설정되어 있으므로
   테스트 파일에서 `import { describe, it, ... } from 'vitest'`를 절대 사용하지 않아야 함.
   전역 함수(`describe`, `it`, `expect`, `vi`, `beforeEach` 등)를 직접 사용.

2. **E2E 환경변수**: Playwright Electron 테스트 시 `ELECTRON_RUN_AS_NODE` 환경변수가
   설정되어 있으면 Electron이 Node.js 모드로 실행됨. fixture에서 반드시 제거해야 함.

3. **Editor.tsx 콜백 순서**: 키보드 핸들러에서 참조하는 콜백을 추가/변경할 경우,
   해당 콜백이 `useEffect` 이전에 선언되어야 함. 이후에 선언해야 하는 경우 ref 패턴 사용.
