---
phase: 01-bms-parser-worker
verified: 2026-04-06T12:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 1: BMS Parser Worker Verification Report

**Phase Goal:** BMS 파싱을 Web Worker로 이전하여 메인 스레드 블로킹을 제거하고 2단계 로딩으로 즉각적인 UI 피드백 제공
**Verified:** 2026-04-06T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `bmsParser.worker.ts` exists with full PARSE_PHASE1/PHASE1_DONE/PHASE2_DONE/PARSE_ERROR protocol | VERIFIED | File at `src/renderer/workers/bmsParser.worker.ts` (194 lines). All 4 message types implemented: PARSE_PHASE1 received on line 28; PHASE1_DONE posted on line 61; PHASE2_DONE posted on line 164; PARSE_ERROR posted on lines 178 and 189. Both try/catch and self.onerror paths covered. |
| 2 | `useHomeBmsFile.ts` exists with 2-phase state (phase1/ready), requestId guard, Worker terminate on new load | VERIFIED | File at `src/renderer/hooks/useHomeBmsFile.ts` (176 lines). `phase: 'idle' \| 'phase1' \| 'ready'` state shape present. `requestIdRef` incremented on every `load()` call (line 52). Stale message guard `if (data.requestId !== reqId) return` on line 88. Previous Worker terminated on line 56 before creating new one. PHASE2_DONE terminates worker on line 141. |
| 3 | `Home.tsx` uses `useHomeBmsFile` (not `useLocalBmsFile`), shows "..." during phase1 for stats cards | VERIFIED | Line 4: `import { useHomeBmsFile } from '../hooks/useHomeBmsFile'`. Line 36: destructures `{ chart, isLoading, phase, error, load }` from `useHomeBmsFile()`. No import or usage of `useLocalBmsFile` found. Lines 309-312: StatCard `value` is `phase === 'ready' ? <real value> : '...'` with `loading={phase === 'phase1'}` triggering `animate-pulse` CSS class. |
| 4 | `useLocalBmsFile.ts` still exists unchanged (Editor not broken) | VERIFIED | File at `src/renderer/hooks/useLocalBmsFile.ts` (243 lines) — full synchronous main-thread parsing implementation intact. Editor.tsx line 25 still imports `useLocalBmsFile`; line 175 uses it. No modification to this file. |
| 5 | Worker is importable via Vite `?worker` suffix pattern | VERIFIED | `useHomeBmsFile.ts` line 4: `import BmsParserWorker from '../workers/bmsParser.worker?worker'`. The same pattern is used by two other already-functional workers: `audioScheduler.worker?worker` (Editor.tsx line 23) and `gameLoop.worker?worker` (Player.tsx line 10). electron-vite inherits Vite's built-in `?worker` support; no additional config required. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/workers/bmsParser.worker.ts` | BMS parsing Web Worker, two-phase protocol | VERIFIED | 194 lines, substantive implementation, no stubs |
| `src/renderer/hooks/useHomeBmsFile.ts` | Home-specific hook with per-request Worker lifecycle | VERIFIED | 176 lines, full requestId guard, terminate logic, phase state machine |
| `src/renderer/routes/Home.tsx` | Updated to use useHomeBmsFile, phase-aware stats UI | VERIFIED | useHomeBmsFile imported and used, 4 stats cards wired to `phase === 'ready'` guard |
| `src/renderer/hooks/useLocalBmsFile.ts` | Unchanged — Editor still functional | VERIFIED | 243 lines, untouched, Editor.tsx still imports and uses it |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useHomeBmsFile.ts` | `bmsParser.worker.ts` | `import ... from '../workers/bmsParser.worker?worker'` | WIRED | Line 4 imports the Worker constructor; line 81 instantiates it with `new BmsParserWorker()` |
| `useHomeBmsFile.ts` | Worker postMessage | `worker.postMessage({ type: 'PARSE_PHASE1', buffer, requestId: reqId }, [buffer])` | WIRED | Line 162 — transfers ArrayBuffer as Transferable |
| `bmsParser.worker.ts` | PHASE1_DONE handler | `self.postMessage({ type: 'PHASE1_DONE', ... })` | WIRED | Line 61 — posts songInfo, bpm, keyMode, lnType |
| `bmsParser.worker.ts` | PHASE2_DONE handler | `self.postMessage({ type: 'PHASE2_DONE', ... })` | WIRED | Line 164 — posts notes, stats, bpmChanges, stops, scrollChanges, keysounds, barLines, totalBeats |
| `useHomeBmsFile.ts` | `Home.tsx` | `export function useHomeBmsFile()` consumed by Home | WIRED | Home.tsx line 4 imports, line 36 destructures chart/isLoading/phase/error/load |
| `Home.tsx` | Stats "..." display | `phase === 'ready' ? realValue : '...'` on StatCard | WIRED | Lines 309-312 — all 4 stats cards (Total Notes, Long Notes, Scratch, Keysounds) correctly guard behind `phase === 'ready'` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `Home.tsx` StatCard (stats) | `chart.stats.total`, `chart.stats.longNotes`, `chart.stats.scratch`, `chart.keysounds` | `useHomeBmsFile` → Worker PHASE2_DONE → `notes` iteration in bmsParser.worker.ts | Yes — lines 137-156 of worker iterate all notes, compute actual counts | FLOWING |
| `Home.tsx` header display | `chart.songInfo.title`, `chart.bpm`, `chart.keyMode` | `useHomeBmsFile` → Worker PHASE1_DONE → `parser.getSongInfo()`, `chart.headers.get('bpm')`, `detectKeyMode(notes, headers)` | Yes — real BMS parser output, not hardcoded | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires running Electron app with a real BMS file — no runnable entry point testable without starting the full Electron process).

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| PERF-01 | 차분 파일 선택 시 UI가 즉시 반응 (BMS 파싱이 메인 스레드를 블로킹하지 않음) | SATISFIED | Parsing runs entirely in bmsParser.worker.ts (off main thread). Main thread only calls `window.api.file.readBms` and creates Worker. |
| PERF-02 | 홈 화면에서 파일 선택 즉시 제목/BPM/키모드가 표시됨 (Phase 1 빠른 결과) | SATISFIED | PHASE1_DONE sets `phase: 'phase1'` with songInfo/bpm/keyMode — Home.tsx renders these immediately (lines 293-307). |
| PERF-03 | 통계(노트 수, 스크래치 수 등)가 이후 업데이트됨 (Phase 2 결과) | SATISFIED | PHASE2_DONE sets `phase: 'ready'` with stats — StatCards switch from "..." to real values. |
| PERF-04 | 파일 선택 중 오류 발생 시 에러 상태가 표시됨 (Worker PARSE_ERROR 처리) | SATISFIED | PARSE_ERROR sets `{ phase: 'idle', error: data.error }`. Home.tsx line 285-289 renders error block. worker.onerror on line 150 also sets error state. |
| CANCEL-01 | 파일 A 로딩 중 파일 B를 선택하면 A 로딩이 즉시 취소됨 | SATISFIED | `load()` calls `workerRef.current.terminate()` (line 56) before creating the new Worker. |
| CANCEL-02 | 빠른 연속 선택 시 마지막 선택 파일의 결과만 표시됨 (requestId guard) | SATISFIED | `++requestIdRef.current` on line 52; stale message check `if (data.requestId !== reqId) return` on line 88; post-readBms guard on line 79. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO/FIXME/placeholder comments found. No empty implementations. No hardcoded empty data flowing to rendered output. The `notes: []` / `stats: { total: 0 ... }` in the PHASE1_DONE handler (lines 106-113) are intentional zero-filled placeholders for Phase2 data — they are immediately replaced on PHASE2_DONE and are never the final rendered values.

---

### Human Verification Required

#### 1. Phase1 visual timing

**Test:** Open the app, select a large BMS file (1000+ notes), and observe the Home.tsx right panel.
**Expected:** Title/Artist/BPM/KeyMode appear within ~100ms of selection, while stats cards show "..." with animated pulse for a brief period before updating to real values.
**Why human:** Timing of PHASE1_DONE vs PHASE2_DONE depends on file size and CPU speed — cannot verify programmatically without running the app.

#### 2. Cancel during load

**Test:** Rapidly click between 3+ different BMS files in the file list.
**Expected:** Only the last selected file's data appears; no flicker or mixing of data from previous files.
**Why human:** Race condition behavior requires real user interaction at runtime.

#### 3. Broken BMS file error display

**Test:** Open a BMS file with invalid/corrupted content.
**Expected:** The right panel shows a red error box with an error message instead of crashing.
**Why human:** Requires a real corrupted file and running the app.

---

### Gaps Summary

No gaps found. All 5 must-haves are fully verified at all levels (exists, substantive, wired, data flowing). The phase goal is achieved:

- BMS parsing runs off the main thread in a dedicated Web Worker per file load.
- The two-phase protocol (PHASE1_DONE headers first, PHASE2_DONE stats second) is correctly implemented in the Worker and consumed by the hook.
- Home.tsx shows immediate title/BPM/keyMode on Phase1 and deferred stats on Phase2 with "..." placeholders and animate-pulse.
- The requestId guard prevents stale results from overwriting newer file state.
- Worker terminate() on new load provides cancellation.
- useLocalBmsFile.ts is untouched; Editor.tsx continues to use it without disruption.

---

_Verified: 2026-04-06T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
