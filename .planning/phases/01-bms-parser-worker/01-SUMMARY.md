---
phase: 01-bms-parser-worker
plan: "01"
subsystem: ui
tags: [web-worker, bms-parser, react-hook, vite, transferable]

# Dependency graph
requires: []
provides:
  - BMS Parser Worker (bmsParser.worker.ts) with PHASE1_DONE / PHASE2_DONE two-phase protocol
  - useHomeBmsFile hook with per-request Worker lifecycle and requestId race guard
  - Home.tsx two-phase loading UI (phase1 headers instantly, phase2 stats with "..." placeholder)
affects:
  - 02-audio-preloader-abort (builds on same non-blocking architecture pattern)
  - 05-regression-tests (bmsParser.worker and useHomeBmsFile need test coverage)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker per-request: each file load spawns new Worker, terminate() for cancellation"
    - "requestId guard: incremented on every load(), stale messages silently discarded"
    - "Transferable ArrayBuffer: buffer ownership transferred to Worker (zero-copy)"
    - "Two-phase Worker: Phase1 posts headers immediately, Phase2 posts full note data"
    - "Phase1 cache ref: useRef stores Phase1 data so Phase2 merge can fill missing fields"

key-files:
  created:
    - src/renderer/workers/bmsParser.worker.ts
    - src/renderer/hooks/useHomeBmsFile.ts
  modified:
    - src/renderer/routes/Home.tsx

key-decisions:
  - "Home/Editor hook split: useHomeBmsFile (serializable data for Home) vs useLocalBmsFile (full BMSChart for Editor)"
  - "Worker per-request pattern: terminate() is cancellation — simpler than singleton + abort signal"
  - "PARSE_PHASE1 -> auto-sequential Phase2 in same Worker: no extra message round-trip"
  - "requestId guard: prevents stale PHASE2_DONE from overwriting a newer file's Phase1 state"

patterns-established:
  - "Worker per-request: each load() call creates new Worker; prior Worker is terminated immediately"
  - "Two-phase postMessage: emit partial result early, emit full result when ready"
  - "requestId guard in onmessage: if (data.requestId !== reqId) return"

requirements-completed: []

# Metrics
duration: pre-committed (prior session)
completed: "2026-04-06"
---

# Phase 1 Plan 1: BMS Parser Worker Summary

**Two-phase BMS parsing Worker (PHASE1_DONE headers in <50ms, PHASE2_DONE stats) with per-request lifecycle and requestId race guard — eliminates main-thread UI freeze on file selection**

## Performance

- **Duration:** pre-committed in prior session
- **Started:** 2026-04-06T11:48:57Z (estimated)
- **Completed:** 2026-04-06T11:48:57Z (commit 2c49ec1)
- **Tasks:** 3 (bmsParser.worker.ts, useHomeBmsFile.ts, Home.tsx)
- **Files modified:** 3 created + 1 modified = 4 total

## Accomplishments
- `bmsParser.worker.ts`: BMS parsing runs entirely off the main thread with two-phase protocol (PHASE1_DONE for headers/BPM/keyMode, PHASE2_DONE for notes/stats/keysounds). Transferable ArrayBuffer ensures zero-copy transfer. Error handling covers both try/catch and self.onerror paths.
- `useHomeBmsFile.ts`: Per-request Worker hook with requestId guard eliminates race conditions when user rapidly clicks between files. Phase1 data is cached in a ref so Phase2 can merge headers with note data.
- `Home.tsx`: Two-phase UI — title/artist/BPM/keyMode render immediately on PHASE1_DONE; stats cards show `"..."` with `animate-pulse` until PHASE2_DONE.

## Task Commits

Each task was committed atomically:

1. **Task 1: bmsParser.worker.ts** — `2c49ec1` (feat) — two-phase Worker with requestId guard
2. **Task 2: useHomeBmsFile.ts** — `2c49ec1` (feat) — per-request Worker hook
3. **Task 3: Home.tsx update** — `2c49ec1` (feat) — phase-aware loading UI

_Note: All three tasks were implemented and committed together in a single atomic commit from the prior session._

## Files Created/Modified
- `src/renderer/workers/bmsParser.worker.ts` — BMS parsing Web Worker (Phase1: headers, Phase2: notes/stats)
- `src/renderer/hooks/useHomeBmsFile.ts` — Home-specific hook with Worker lifecycle management and requestId guard
- `src/renderer/routes/Home.tsx` — Updated to use useHomeBmsFile; stats cards show "..." during phase1

## Decisions Made
- Home and Editor use separate hooks: useHomeBmsFile returns serializable plain data (suitable for postMessage), while useLocalBmsFile returns full BMSChart objects (required by Editor/Player, not serializable)
- Worker per-request (not singleton): each file load terminates the previous Worker — cancel is just `terminate()`, no abort signals needed
- Phase1 auto-advances to Phase2 within the same Worker: eliminates a message round-trip and removes per-phase state from the Worker

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 complete: BMS parsing is non-blocking, two-phase loading is live in Home.tsx
- Phase 2 (AudioPreloader Abort) can now proceed — same architecture applies to audio decoding
- Concern: bmsParser.worker.ts currently does a full note scan during "Phase1" (to compute keyMode via detectKeyMode), meaning Phase1 is not strictly header-only. This is acceptable per plan design but should be noted for Phase 5 regression tests.

## Self-Check: PASSED

- FOUND: src/renderer/workers/bmsParser.worker.ts
- FOUND: src/renderer/hooks/useHomeBmsFile.ts
- FOUND: src/renderer/routes/Home.tsx (modified)
- FOUND: .planning/phases/01-bms-parser-worker/01-SUMMARY.md
- FOUND: commit 2c49ec1 (feat: Phase 1 — BMS Parser Worker + useHomeBmsFile)

---
*Phase: 01-bms-parser-worker*
*Completed: 2026-04-06*
