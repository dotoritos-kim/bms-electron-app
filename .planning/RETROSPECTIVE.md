# Retrospective — BMS Editor (bms-electron-app)

## Milestone: v1.0 — 파일 로딩 프리징 버그 수정

**Shipped:** 2026-04-06
**Phases:** 5 | **Plans:** 5

### What Was Built

- BMS 파싱 Worker 이전 — 메인 스레드 UI 프리징 완전 제거 (2단계 프로토콜, requestId guard)
- AudioPreloader.abort() — decodeAll/loadAll 중 즉시 중단 가능 (고아 Promise 제거)
- Editor graceful shutdown — 언마운트 시 오디오 로딩 즉시 abort + 리소스 해제
- scanDir batchSize=20 병렬 stat — 대용량 폴더 최대 20x 성능 향상
- 회귀 테스트 5 스위트 33개 — 1118/1118 통과

### What Worked

- **Worker per-request 패턴**: 취소 = terminate(), 단순하고 확실. 싱글턴 + abort signal보다 훨씬 쉬움
- **2단계 Worker 프로토콜**: PHASE1_DONE으로 빠른 UI 피드백, PHASE2_DONE으로 완전한 데이터. 사용자 경험 크게 개선
- **inProgressPreloaderRef 패턴**: cleanup useEffect에서 ref 하나로 in-progress 상태 추적 — 단순하고 안전
- **gsd-verifier 서브에이전트**: 각 단계마다 독립 검증. 회귀 없이 빠른 반복 가능
- **retroactive GSD 아티팩트**: 이미 커밋된 코드에 대한 CONTEXT/PLAN/SUMMARY 소급 생성이 감사에 문제없이 동작

### What Was Inefficient

- **SUMMARY.md 일부 phases `requirements-completed: []`**: retroactive 아티팩트라 frontmatter가 비어있음 → 감사 시 3-source cross-check에서 수동 보완 필요
- **ROADMAP.md overview table stale**: milestone complete CLI가 overview table을 업데이트하지 않아 "Not Started" 표시 유지 → 수동 수정 필요
- **MILESTONES.md accomplishments**: Phase 2/3 SUMMARY.md가 one_liner가 아닌 "Status:" 반환 → CLI 추출 실패, 수동 수정 필요

### Patterns Established

- **Worker per-request**: load() 시 새 Worker 생성, 이전 Worker terminate() — 취소 메커니즘 내장
- **requestId guard**: `if (data.requestId !== reqId) return` — 레이스 컨디션 방지 원라이너
- **inProgressRef abort pattern**: `const inProgressRef = useRef<Abortable | null>(null)` + cleanup에서 `.abort()` + `.release()`
- **App key remount**: `<Component key={id} />` — 파일 변경 시 모든 ref/state 초기화 보장
- **Retroactive GSD artifacts**: 이미 커밋된 코드에 대해 CONTEXT/PLAN/SUMMARY 소급 생성 → 감사 통과

### Key Lessons

- BMS 파싱 Worker 이전 시 Phase1이 "헤더만"이 아님 — detectKeyMode도 note scan 필요. 계획에 명시해야 함
- ArrayBuffer vs Uint8Array IPC 경계: `window.api.file.readBms()`는 Uint8Array 반환 → test mock도 Uint8Array 사용 필요 (ArrayBuffer 아님)
- vitest globals mode에서 `import from 'vitest'` 혼용 금지

### Cost Observations

- Sessions: 1 (autonomous 5-phase execution)
- Model: Sonnet 4.6 throughout
- Notable: Phases 2-4 were pre-committed before GSD tracking — retroactive artifacts added ~15% overhead but enabled clean audit

---

## Milestone: v1.1 — 에디터 UI 개선 — 미니맵 & 패널

**Shipped:** 2026-04-06
**Phases:** 2 | **Plans:** 2

### What Was Built

- Canvas 2D 수직 미니맵 사이드바 — density heatmap, viewport indicator, bookmark markers
- Ctrl+B 북마크 토글 — AccessibleDialog 이름 입력 (prompt() 대체)
- LayerPanel — 4레이어 가시성·잠금·불투명도 슬라이더 (inline component)
- QA 성능 수정 — async initFromChart + yield으로 파일 오픈 프리징 제거

### What Worked

- **Bridge component isolation**: MinimapBridge, StatusBarBridge 등 currentBeat 구독 격리로 불필요한 re-render 방지
- **Pre-computed color in app layer**: densityToColor()를 bms-editor 안이 아닌 앱에서 호출하여 순환 의존 없이 색상 전달
- **Toggle-to-remove pattern**: Ctrl+B 동일 위치 재호출 = 삭제 → 별도 삭제 단축키 불필요
- **Inline component for single-use UI**: LayerPanel은 단일 위치에서만 사용 → 파일 분리 없이 Editor.tsx 내 inline 정의

### What Was Inefficient

- **GSD tool auto-modifying artifacts**: milestone complete CLI가 ROADMAP.md/STATE.md를 자동 수정하여 수동 수정분이 덮어씌워짐 → 아티팩트 update 후 재검증 필요
- **SUMMARY.md frontmatter 없음**: SUMMARY.md에 YAML frontmatter 없어 `summary-extract` CLI가 "One-liner:"/"Status" 반환 → MILESTONES.md 수동 수정 필요
- **Phase 6 was partially pre-executed**: 첫 번째 /gsd:autonomous 실행 중 Phase 6 커밋(6ede91e)이 이미 완료 상태 → duplicate execution 피하기 위해 상태 확인 필요

### Patterns Established

- **async useEffect + cancelled ref**: 비동기 초기화 useEffect에서 `let cancelled = false` + cleanup `return () => { cancelled = true }` — 파일 전환 시 stale state 방지
- **setTimeout(r, 0) yield**: 무거운 sync 작업 전 macrotask yield로 loading spinner 애니메이션 허용
- **data-testid on new UI**: LayerPanel 모든 인터랙티브 요소에 data-testid — E2E 테스트 대비

### Key Lessons

- GSD autonomous 모드에서 이미 커밋된 phase는 `roadmap_complete: true` 체크 후 건너뛰어야 함 — 현재는 plan/execute를 다시 시도함
- SUMMARY.md 생성 시 `requirements-completed:` YAML frontmatter 포함 권장 — CLI 추출 정확도 향상
- Canvas 2D minimap은 jsdom에서 테스트 불가 — RTL 컴포넌트 테스트 대신 E2E playwright로 커버 필요

### Cost Observations

- Sessions: 2 (autonomous + continuation)
- Model: Sonnet 4.6 throughout
- Notable: v1.1은 v1.0 mega-commit(6ede91e)에 이미 일부 포함 → retroactive separation 필요

---

## Cross-Milestone Trends

| Milestone | Phases | Tests Added | Pass Rate | Key Pattern |
|-----------|--------|-------------|-----------|-------------|
| v1.0 | 5 | 33 | 1118/1118 | Worker per-request |
| v1.1 | 2 | 0 (UI-only) | 1118/1118 | Canvas 2D + bridge isolation |

