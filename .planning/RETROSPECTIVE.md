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

## Cross-Milestone Trends

| Milestone | Phases | Tests Added | Pass Rate | Key Pattern |
|-----------|--------|-------------|-----------|-------------|
| v1.0 | 5 | 33 | 1118/1118 | Worker per-request |

