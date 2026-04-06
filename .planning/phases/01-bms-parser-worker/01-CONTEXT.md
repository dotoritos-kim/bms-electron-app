# Phase 1: BMS Parser Worker - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning
**Mode:** Auto-generated from CEO+Eng Review decisions

<domain>
## Phase Boundary

BMS 파싱을 Web Worker로 이전하여 메인 스레드 블로킹을 완전히 제거한다.
두 개의 신규 파일을 생성한다:
- `src/renderer/workers/bmsParser.worker.ts` — Worker 내부 파싱 로직
- `src/renderer/hooks/useHomeBmsFile.ts` — Worker 기반 Home 화면 전용 hook

기존 `useLocalBmsFile`은 Editor용으로 유지한다 (bmsChart 인스턴스 직렬화 불가).

</domain>

<decisions>
## Implementation Decisions

### Worker 아키텍처
- per-request 방식: 파일 선택마다 new Worker() 생성, terminate()로 취소
- 싱글턴 아님 — 취소가 terminate()로 단순해짐
- Worker 프로토콜: PARSE_PHASE1 수신 → PHASE1_DONE 전송 → 자동으로 Phase2 실행 → PHASE2_DONE 전송
- 별도 PARSE_PHASE2 메시지 불필요 (Worker가 자동 연속)

### 취소 메커니즘 (requestId)
- 파일 선택 시 requestId 증가 (++requestIdRef.current)
- Worker에게 postMessage 시 requestId 포함
- Worker는 응답에 requestId를 그대로 포함
- onmessage에서 data.requestId !== reqId면 무시 (레이스 컨디션 방지)
- 이전 Worker는 즉시 terminate()

### Transferable ArrayBuffer
- Worker postMessage 시 buffer를 Transferable로 전달: worker.postMessage(msg, [buffer])
- transfer 후 메인 스레드에서 buffer 접근 안 함 (Worker가 소유권)

### 2단계 파싱 상태 (phase 필드)
- useHomeBmsFile state에 phase: 'idle' | 'phase1' | 'ready' 추가
- PHASE1_DONE: phase: 'phase1' (제목/BPM/키모드 즉시 표시)
- PHASE2_DONE: phase: 'ready' (stats 업데이트)
- Home UI: phase === 'phase1'이면 stats 카드에 스켈레톤/로딩 표시

### 에러 핸들링
- Worker try/catch: 파싱 실패 시 PARSE_ERROR 메시지 (requestId 포함)
- worker.onerror: 예외 외 Worker 크래시도 처리
- 에러 시 setState({ error: data.error, isLoading: false, phase: 'idle' })

### Home vs Editor hook 분리
- useHomeBmsFile: Worker 기반, stats/headers/keysounds만 (Timing/Positioning/Spacing 없음)
- useLocalBmsFile: 기존 유지, Editor 전용 (bmsChart 인스턴스 필요)
- Worker에서 Timing/Positioning/Spacing/KeySounds 오브젝트 빌드 안 함

### Claude's Discretion
- Worker 내부 Phase1/Phase2 경계 구현 세부사항
- useHomeBmsFile의 정확한 state shape (LocalBmsChartInfo와 호환되는 subset)
- 기존 Home.tsx에서 useLocalBmsFile → useHomeBmsFile 교체 방식

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/workers/bmsParser.worker.ts` — 신규 파일 (gameLoop.worker.ts, audioScheduler.worker.ts 패턴 참고)
- `bms-core/src/parser/modules/reader/index.ts` — read() 함수, TextDecoder 기반, Worker 호환 확인됨
- `bms-core/src/parser/index.ts` — BMSParser (compileString, getNotes, getSongInfo 등)
- `src/renderer/lib/LocalAudioWorker.ts` — Worker-like 객체 패턴 참고

### Established Patterns
- Worker entry: `import '../../../../bms-player/src/game/AudioSchedulerWorker';`
- Vite worker import: `import BmsParserWorker from '../workers/bmsParser.worker?worker';`
- 기존 useLocalBmsFile: read → compileString → getNotes → Timing/Positioning 순서

### Integration Points
- `src/renderer/routes/Home.tsx`: useLocalBmsFile → useHomeBmsFile 교체
- Worker는 Transferable ArrayBuffer 받아 파싱, requestId 포함 응답
- Home.tsx의 현재 file 선택 시 load() 호출 흐름 유지

</code_context>

<specifics>
## Specific Ideas

- Phase 1 응답에서 추출할 데이터: songInfo (title/artist/genre/level), bpm (initial/min/max), keyMode, lnType
- Phase 2 응답에서 추출할 데이터: notes[], stats (total/scratch/longNotes/landmines/invisible), bpmChanges[], stops[], scrollChanges[], keysounds{}, barLines[]
- Home.tsx에서 phase === 'phase1'인 동안 StatCard에 "..." 표시 또는 로딩 인디케이터
- TICKS_PER_BEAT는 Worker에서 사용하지 않음 (Home은 beat 기반으로 충분)

</specifics>

<deferred>
## Deferred Ideas

- .bms.meta 파싱 결과 캐시 — 별도 마일스톤
- Worker 싱글턴 (requestId 방식) — per-request가 더 단순하므로 현재 불필요
- Timing/Positioning을 Worker에서 직렬화 — Home에서 불필요

</deferred>
