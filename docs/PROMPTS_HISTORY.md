# BMS Electron App: 프롬프트 히스토리

이 문서는 프로젝트 개발 과정에서 실제로 사용된 주요 프롬프트(지시사항)를 Phase별로 기록합니다.

---

## Phase 0: 프로젝트 초기 세팅 & 플레이어

```
Electron + React 19 + Three.js 기반 BMS 에디터/플레이어 앱을 만들어줘.
로컬 패키지로 bms-core (파서/라이터), bms-player (게임 엔진), bms-editor (차트 에디터 UI)를 사용해.
```

```
GameLoop tick() 타이밍 버그 수정:
lastUpdateTime === 0 체크가 contextStartTime을 매 프레임 리셋시켜서
currentTime ≈ 0 상태가 유지되고 emitUpdate가 발동 안 되는 문제.
firstTickDone boolean 플래그로 교체해줘.
```

```
Alt-Tab 시 오디오가 끊기는 문제 수정:
- Electron: backgroundThrottling: false 설정
- Worker 기반 스케줄링: GameLoopWorker.ts, WorkerGameLoop.ts, AudioSchedulerWorker.ts
- Main Thread에서 keysound를 nextNotes 캐시에서 즉시 재생 (0ms 지연)
- Worker는 비동기로 판정 처리
```

---

## Phase 1-3: 에디터 기본 기능

```
BMS 에디터 기능 구현:
- 새 파일 생성: Ctrl+N, IPC file:createNewBms
- 노트 검색: Ctrl+F (NoteSearchDialog)
- 자동 저장: 60초 간격 .bms.autosave + 복구 프롬프트
- 플레이 테스트: F5 (Player 오버레이)
- 미러/플립/랜덤: Ctrl+M, Ctrl+R
- Quantize: Q 키
- 호버 키음 미리듣기: onNoteHover prop
- BPM 탭 툴, 난이도 추정 (1-12)
- 마디 추가/삭제: Ctrl+Shift+I/D
- 차트 통계 패널, A-B 루프 ([ ] \)
- 비주얼 diff (BmsChartDiff)
- 파형 데이터 API: AudioPreloader.getWaveformData() + WaveformOverlay 컴포넌트
```

---

## Phase 4: 10-Star 차별화 기능

### 4.1 MIDI 컨트롤러 입력

```
Web MIDI API로 MIDI 컨트롤러 입력 기능 구현:
- lib/midiInput.ts 신설
- MidiMappingDialog.tsx: MIDI note → BMS 레인 매핑, Learn 모드, IIDX 프리셋
- 스텝 레코딩: 현재 비트 위치에 노트 배치 후 그리드 스냅만큼 전진
- 실시간 레코딩: 재생 중 MIDI 입력 → 현재 재생 위치에 노트 배치
```

### 4.2 패턴 템플릿/프리셋

```
자주 사용하는 노트 패턴 저장/로드 기능:
- lib/patternTemplates.ts: 상대 좌표(beat offset, column)로 패턴 저장
- PatternLibraryPanel.tsx: 내장 패턴 (계단/코드/잭/롤/트릴) + 사용자 정의
- localStorage에 패턴 저장, 카테고리 분류
- 현재 위치에 패턴 붙여넣기
```

### 4.3 내장 오디오 슬라이서

```
전체 곡 오디오 파형 뷰어 + 슬라이서 기능:
- AudioSlicer.tsx: Canvas 2D 파형 렌더링 (Audacity 스타일), 줌/스크롤
- 마우스 드래그로 구간 선택 → WAV 파일 내보내기
- Spectral flux onset detection으로 자동 슬라이스
- IPC file:saveWavSlices: AudioBuffer → PCM → WAV 파일 저장
- 슬라이스된 파일 01-ZZ 자동 WAV ID 할당
```

### 4.4 AI 자동 차트 생성

```
오디오 onset detection 기반 자동 노트 배치:
- lib/autoChart.ts: onset → 노트 밀도 매핑, 난이도 곡선 적용
- AutoChartDialog.tsx: 난이도 슬라이더, LN 비율, 미리보기 → 확인
- 마르코프 체인 기반 패턴 제안 (기존 마디 학습)
- 목표 난이도(1-12)에 맞게 LN 비율, 동시눌림 비율 조절
```

### 4.5 커스텀 키 바인딩

```
모든 에디터 단축키 커스터마이즈 기능:
- lib/keyBindings.ts: 액션 → 키 바인딩 맵, electron-store 저장
- KeyBindingsDialog.tsx: 각 액션의 키 설정 UI
- Editor.tsx 키보드 핸들러를 동적 매핑으로 교체
```

---

## QA Phase: 테스트 인프라 구축

```
BMS 에디터 앱 전체 테스트 인프라를 구축해줘:
- Vitest 4.x: 유닛/통합 테스트
- Playwright: E2E 테스트
- Stryker: 뮤테이션 테스트
- RTL (React Testing Library): 컴포넌트 테스트
- vitest.config.ts, playwright.config.ts, stryker.config.mjs 설정
- tests/unit/, tests/integration/, tests/e2e/, tests/compatibility/ 구조
- GitHub Actions CI/CD: test.yml (push/PR), nightly.yml (mutation + compat)
```

```
발견된 버그 수정:
- BUG-001: src/main/ipc/audio.ts entries 변수 TDZ 에러
- BUG-002: Editor.tsx TDZ 에러 → ref 패턴으로 수정
- BUG-003: "저장 후 나가기"가 저장 실패 시에도 이동 → handleSave가 boolean 반환하도록
- BUG-004: 플레이 테스트가 저장 실패 시에도 진행됨 → handlePlayTest에서 결과 확인
- BUG-005: App.tsx 내비게이션 가드가 저장 실패 무시 → 수정
- BUG-006: Ctrl+Shift+S (Save As) 동작 안 함 → saveAs 액션 추가
- BUG-007: 에디터 에러 화면이 루프됨 → onClearFile로 currentFile 초기화
```

```
E2E 테스트 픽스처 생성 스크립트 작성:
- scripts/generate-test-fixtures.ts
- 12개 키 모드 (4K~48K) + 스트레스 테스트 BMS 파일 생성
- tests/e2e/fixtures/ 에 저장
```

```
RTL 컴포넌트 테스트 작성:
- KeyBindingsDialog (20 tests)
- AutoChartDialog (15 tests)
- MidiMappingDialog (14 tests)
- PatternLibraryPanel (15 tests)
- ChartStatsView, estimateDifficulty, formatTime, store UI 토글 (34 tests)
data-testid 14개 속성을 Editor.tsx에 추가
```

---

## Phase 5: UX 전면 개편 (CEO+Eng 리뷰 기반)

### 5.0 박자표 수정

```
beatToMF 함수를 TimeSignatures 인식 beatConverter로 교체:
- lib/beatConverter.ts: createBeatConverter (TimeSignatures-aware)
- bms-core에 beatToMeasure 역함수 추가
- insertMeasure/deleteMeasure에서 timeSignatures shift 처리
- 박자표 편집 UI 추가
```

### 5.1 파일 분리

```
에디터 컴포넌트 파일 분리:
- BeatKeysoundPanel.tsx 별도 파일로 분리
- ChartStatsView.tsx 별도 파일로 분리
- BpmTapDialog.tsx 별도 파일로 분리
- savableChart getter 추가 (Save 중복 3곳 제거)
```

### 5.2 다이얼로그 상태 통합

```
8개 boolean 다이얼로그 상태를 enum으로 통합:
- activeModal: ModalType | null (1계층)
- activeOverlay: OverlayType | null (2계층)
- Escape 핸들러 3줄로 단순화
```

### 5.3 헤더바 개편

```
헤더바 UX 개선:
- Lucide 아이콘 교체 (GitCompare, Timer, PlayCircle 등)
- 도구 드롭다운 메뉴 (Wrench → AI/슬라이서/MIDI/키바인딩/웨이브폼)
```

### 5.4 오디오 UX

```
오디오 로드 및 시크바 개선:
- chart 완료 후 자동 오디오 로드
- 시크바 드래그 구현 (mousedown → move → up + thumb 표시)
```

### 5.5 세션 복원

```
세션 저장/복원 기능:
- lib/sessionStorage.ts: 최근 파일 10개 LRU + 핀
- 세션 복원: lastRoute + lastFile (localStorage)
```

### 5.6 Toast & 속도 슬라이더

```
Toast 알림 시스템 구현:
- ToastStack 훅: 우측 상단, 에러 5초, 최대 5개
- Undo/Redo에 description 표시
- 속도 슬라이더: 0.1~3x
```

### 5.7 패널 리사이즈

```
react-resizable-panels v4로 패널 리사이즈 구현:
- Group/Panel/Separator 컴포넌트 사용
- 에러 화면: 파일경로 + 복사 버튼 + 안내 메시지
```

### 5.8 퍼포먼스 최적화

```
에디터 스토어 업데이트 throttle:
- onTick 콜백의 store 업데이트를 ~100ms 간격으로 throttle
```

### 6.0 웨이브폼 오버레이

```
BGM 키음 파형을 차트 위에 오버레이로 표시:
- WaveformOverlay.tsx: canvas 위 반투명 오버레이
- 토글 가능 (W 키)
```

### 6.1 접근성 다이얼로그

```
인라인 다이얼로그 4개를 AccessibleDialog로 통일:
- AccessibleDialog.tsx: focus trap, ARIA 속성
- BpmTapDialog: 3초 리셋 시 피드백 표시
```

---

## Phase 7+: Tick 기반 에디터 대개편 (CEO 리뷰 기반)

```
CEO 리뷰 피드백 반영 에디터 아키텍처 전면 개편:

핵심 결정:
1. 그리드 분할: 전체 1/2~1/96 + 커스텀 입력
2. 마디선/그리드선: 박자표 반영 + 마디별 snap
3. 부동소수점 제거: Big Bang tick 전환 (960 ticks/beat, MIDI 표준)
4. Writer 해상도: 고해상도(3840) + 표준(192) 선택 + 경고
5. 레이어: 가시성 + 잠금 + 불투명도
6. 노트 이동 스냅: 3단계 (ON / Shift=free / OFF)
7. LN 최소 길이: 설정 가능한 하한 + gridStep 기반
8. LN 생성: gridStep 기본 + 드래그 생성

확장 기능 (전부 채택):
- 마디별 gridSnap 독립 설정
- 노트 밀도 히트맵 오버레이
- 다중 선택 필터 (레이어+마디+컬럼+키음)
- 타임라인 북마크
- 멀티 클립보드 (히스토리 10개)
- 노트 그룹핑
- A/B 비교 재생
- 커스텀 노트 스킨/색상
```

### Phase 1.1: NoteChartEditor 분리

```
NoteChartEditor.tsx 2295줄을 5개 모듈로 분리:
- bms-editor/src/chart/editor/types.ts: 타입, 상수
- bms-editor/src/chart/editor/editorUtils.ts: snap, color 유틸
- bms-editor/src/chart/editor/gridRenderers.tsx: 레인/마디선/BPM/STOP 렌더러
- bms-editor/src/chart/editor/noteRenderers.tsx: 노트/호버/고스트/이펙트 렌더러
- bms-editor/src/chart/editor/EditorToolbar.tsx: 툴바
```

### Phase 1.3: tickUtils.ts

```
tick 기반 유틸리티 라이브러리 신설:
- lib/tickUtils.ts
- TICKS_PER_BEAT = 960
- beatToTick, tickToBeat, snapTickToGrid
- EXTENDED_GRID_SNAP_OPTIONS: 12, 24, 128, 256, 384 추가
- isValidGridSnap, nearestValidGridSnap (커스텀 입력 지원)
- findMinBmsResolution (BMS 출력 해상도 최적화)
- 테스트 57개 작성
```

### Phase 2: Tick 전환

```
전체 에디터를 960 ticks/beat 기반으로 Big Bang 전환:
- BMSNote.tick? + EditableBMSNote.tick (필수) 필드 추가
- editorStore 핵심 액션 7개 tick 기반 전환:
  addNote, moveNotes, quantizeNotes, updateNote, paste, insertMeasure, deleteMeasure
- snapBeatToGrid: tick 기반 정수 연산으로 교체
- isOnGrid (NoteInfoPanel): tick 기반으로 교체
- autoChart.ts onset quantize: tick 기반으로 교체
- channelWriter: tickToFractionInMeasure() 추가, tick 기반 fraction 계산 우선
```

### Phase 3: Grid & Snap 강화

```
그리드/스냅 시스템 전면 강화:
3.1 GRID_SNAP_OPTIONS 확장 (12, 24, 128, 256, 384 + Custom 입력 UI)
3.2 MeasureLinesRenderer: timeSignatures prop 추가, 마디별 비트 수 반영
3.3 Snap 3단계: snapEnabled 토글 + Shift=free move + shiftHeldRef
3.4 마디별 gridSnap: gridSnapOverrides Map, getGridSnapForMeasure
```

### Phase 4: Layer 시스템

```
노트 레이어 시스템 구현:
- LayerConfig 타입: { playable/invisible/landmine/bgm: { visible, locked, opacity } }
- DEFAULT_LAYER_CONFIG: invisible=0.4, bgm=0.6
- setLayerVisible/Locked/Opacity 액션
- NotesRenderer: layer 가시성 필터 + opacity 적용
- findNoteAtPosition: locked/hidden 레이어 노트 클릭 차단
```

### Phase 5: Long Note 개선

```
LN 최소 길이 설정 및 드래그 생성:
5.1 최소 LN 길이:
  - minLnLength 기본값 0.25 beat, setMinLnLength 액션
  - quantizeNotes: Math.max(gridTicks, minLnTicks) 하한 적용
  - LN 생성/리사이즈 최소값: Math.max(gridStep, 0.25)
5.2 LN 드래그 생성:
  - lnDragCreate 상태
  - pointerDown → Move → Up 이벤트 처리
  - 시각적 프리뷰
```

### Phase 6: 에디터 확장 기능

```
6.1 .bms.meta 사이드카 파일:
  - lib/bmsMeta.ts: JSON 사이드카 파일 읽기/쓰기
  - IPC readMeta/saveMeta
  - 테스트 13개

6.2 타임라인 북마크:
  addBookmark/removeBookmark/renameBookmark 액션

6.3 멀티 클립보드:
  clipboardHistory 배열 10개, selectClipboardHistory

6.4 노트 그룹핑:
  createGroup/deleteGroup/selectGroup/ungroupSelected

6.5 고급 선택 필터:
  NoteSelectionFilter 타입, selectByFilter 액션 (레이어+마디+컬럼+키음)

6.6 A/B 비교 재생:
  comparisonSnapshot, saveComparisonSnapshot, toggleComparison
```

### Phase 7: 시각화 & 커스터마이징

```
7.1 노트 밀도 히트맵:
  - lib/densityMap.ts: computeDensityMap, densityToColor
  - useMemo 캐시
  - 테스트 8개

7.2 커스텀 노트 스킨:
  - customColors 상태
  - setCustomColor/resetCustomColors 액션
```

### 버그 수정 사이클

```
Tick 전환 후 버그 탐색 및 수정:
- BUG-A: flipNotes에서 tick/endTick 미동기화 → 수정
- BUG-B: applyPattern에서 새 노트 tick 누락 → 수정
- BUG-C: preparePaste에서 tick 미동기화 → 수정
- 기존 52개 실패 테스트 전체 수정 (laneConfig BGM 반영 + keyBindings 34개)
- 신규 기능 테스트 46개 추가 (editorStoreNewFeatures.test.ts)
- 최종: 1012/1012 테스트 전부 통과 (0 실패)
```

---

## Draw Call 최적화

```
Three.js 렌더링 성능 최적화:
- DragGhostNotes → InstancedMesh
- LanesRenderer → InstancedMesh
- NotePassEffect → InstancedMesh
- Text 렌더링 → CanvasTexture
- Zustand useShallow로 불필요한 리렌더링 제거
목표: worst case draw call 273 → ~23 (92% 감소)

Zustand v5 주의사항:
- useShallow: zustand/react/shallow
- 안정적인 액션 참조: useMemo(() => useEditorStore.getState(), [])
```

---

## BGM 키음 겹침 버그 수정

```
BGM 채널 키음이 겹쳐서 재생되는 버그 수정:
- BGM 키음은 동일 keysoundId라도 중복 재생 허용 (일반 채널과 다름)
- 에디터 성능 최적화 추가 반영
- 키음 관리 기능 정비
```

---

## QA 마무리: insertMeasure 성능 + race condition

```
insertMeasure 성능 개선 + .bms.meta 로드 race condition 방어:
- insertMeasure: O(n) 순회 최적화
- .bms.meta 로드 시 파일 읽기 완료 전 store 업데이트 race condition 방어
```

---

## BGM 레인 원본 배치 + 키음 다중 선택 + 드래그 방향 고정 (2026-11-05)

사용자 피드백으로 시작한 작업입니다. 프롬프트는 받은 그대로 옮겼습니다.

```
BGM 키음 노트들을 왼쪽으로 정렬하는게 아니라 채널 위치 그대로 유지해서 보는 방법이 있나요? 악기별로 노트를 일괄 선택해서 노트 영역에 배치하기 위해서에요
이를 추가해야 한다면 좌우 스크롤바나 좌우 사이즈 조절이 필요해질 수 있어요
노트의 상하 위치를 고정한채로 좌우로만 움직이고 싶은 경우가 많은데, 이때에는 드래그를 하지 말고 좌우 방향키를 쓰면 되긴 하네요
나머지 대부분의 문제들은 UI에 잘 설명이 잘 되어있어서 스스로 해결할 수 있었습니다
```

이 질문에 아래 세 가지 안을 제안했습니다.

- A. 여러 키음을 묶어서 선택: 키음 패널에서 Ctrl/Shift+클릭으로 악기의 키음 여러 개를 고르고, 그 BGM 노트를 한 번에 선택
- B. 원본 줄 순서대로 BGM 레인 배치: 파일의 `#xxx01` 줄 순서(BMSE·iBMSC의 B1, B2… 열)를 레인 번호로 쓰고, 레인이 많아지면 가로 스크롤
- C. 드래그 방향 고정: 노트를 좌우 또는 상하로만 움직이기

```
A,B 기능 만들고 C 는 옵션에 설정할 수 있도록 구현
```

```
작업 계속 진행하고, 프롬프트들도 리모트에 문서로 공개
```

결과:

- bms-core: 컴파일러가 BGM 객체에 `bgmLine`(마디 안에서 몇 번째 `#xxx01:` 줄인지, 빈 `00` 줄 포함)을 기록하고, BGM 노트로 넘깁니다.
- 앱: `lib/bgmLanes.ts`의 `computeBgmLanes`('packed' / 'source'), 스토어 `relayoutBgmLanes`(되돌리기 가능), BGM 매니저의 "레인 배치" 버튼
- bms-editor: `KeysoundPanel` 다중 선택(`onSelectNotesByKeysounds`), `NoteChartEditor`의 `bgmLanesInView`(가로 스크롤바, Shift+휠)와 `dragAxisLock`
- 설정 → 편집 옵션: 노트 드래그 방향(자유 / 처음 방향 고정 / 좌우만 / 상하만), 차트를 열 때 BGM 레인 배치, 한 화면에 보일 BGM 레인 수
- 테스트: `tests/bgm-lines.test.ts`(bms-core), `tests/unit/lib/bgmLanes.test.ts`, `tests/unit/stores/editorOptionsStore.test.ts`, `tests/unit/components/KeysoundPanelMultiSelect.test.tsx`, `tests/e2e/editor-bgm-lanes.spec.ts`

---

## AI 차트·패턴 배치 시 키음 자동 이동 (2026-11-06)

프롬프트는 받은 그대로 옮겼습니다.

```
ai 차트생성이나 패턴 자동배치 시 키음의 배치가 자동으로 되어야해 무키음 노트가 배치되는 것이 아닌
```

처음에는 같은 박자의 BGM 키음을 복사해서 쓰는 방식으로 구현했고, 아래 피드백으로 옮기는 방식으로 바꿨습니다.

```
키음이 있으면 있는대로 없으면 없는대로, 노트를 빼서 옮기는 방식이여야함
```

```
작업 계속
```

```
확인해줘
```

실제 앱에서 확인해 보니 키음이 없는 노트(`00`)는 BMS 파일에 쓸 수 없어 저장하면 사라졌습니다. 그래서 아래 세 가지 안을 제안했습니다. (1) BGM이 있는 박자에만 노트를 놓음, (2) 키음 없는 위치는 선택된 키음으로 대체, (3) 키음 없는 노트로 둠(저장 시 소실).

```
BGM이 있는 박자에만 노트를 놓음
```

```
작업을 계속 해 그리고 완벽할때쯤 리모트에 커밋 푸시
```

독립 리뷰어 5명이 변경분을 점검하고 각 지적을 반박 검증한 결과, 아래 문제를 고쳤습니다. 수정 후 2차 리뷰도 한 번 더 돌렸습니다.

- 패턴의 지뢰·인비저블 노트까지 BGM 키음을 가져가면서 BGM을 지우던 문제: 키음 이동은 플레이어블 노트에만 적용하고, 나머지는 선택된 키음을 그대로 씁니다.
- 아무것도 놓이지 않은 패턴 적용이 같은 박자의 재시도를 막던 문제: 노트가 놓였을 때만 이중 클릭 방지를 켭니다.
- AI 차트가 BGM 노트를 지운 뒤 선택 목록에 지워진 id가 남던 문제
- 먼저 처리되는 노트가 정확히 맞는 다음 노트의 BGM을 가져가던 문제: 가까운 쌍부터 매칭합니다.
- 잠긴 레이어, 레이어 키음, 중복 위치, 되돌리기, AI 차트 경로에 테스트가 없던 문제

결과:

- `lib/autoKeysound.ts`의 `buildKeysoundPool` / `matchKeysounds`: 같은 박자(±0.125박)의 BGM·인비저블 노트를 가까운 쌍부터 한 번씩만 가져가고, 없으면 `null`(노트를 놓지 않음)
- 스토어 `applyPattern`(패턴)과 새 `applyGeneratedNotes`(AI 차트): 새 노트가 키음과 레이어 키음을 이어받고 원본 BGM 노트는 삭제, 되돌리기 한 번으로 복구. 공용 로직은 `buildPlacement`
- `applyPattern`의 마지막 `keysound` 인자를 없애고 `{ placed, noKeysound }`를 반환, `applyGeneratedNotes`는 `occupied`까지 반환(`addNotesBulk`는 원래대로)
- 건너뛴 노트가 있으면 토스트(`autoChartNoKeysound`, 7개 언어)로 알림, 놓인 노트가 없으면 되돌리기 기록도 남기지 않음
- 테스트: `tests/unit/lib/autoKeysound.test.ts`, `tests/unit/stores/editorStore.test.ts`

---

*최종 업데이트: 2026-11-06*
*총 완료 Phase: 1~7 + QA + UX개편 + Tick 전환 + Draw Call 최적화*
*최종 테스트: 1044/1044 통과*
