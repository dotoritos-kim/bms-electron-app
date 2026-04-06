# Phase 2: AudioPreloader Abort - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

AudioPreloader에 abort() 메서드를 추가하여 decodeAll/loadAll 중 즉시 중단 가능하게 함. bms-player 패키지 내 AudioPreloader.ts 단일 파일 변경.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Method added to bms-player/src/audio/loader/AudioPreloader.ts with internal abort flag pattern.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- AudioPreloader.ts in bms-player/src/audio/loader/
- Existing decodeAll()/loadAll() methods to add abort checks into

### Established Patterns
- Private flag pattern (`private aborted = false`)
- Promise-based async with early return on flag check

### Integration Points
- Editor.tsx inProgressPreloaderRef calls abort() on unmount
- Phase 3 depends on this abort() API existing

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase, abort() method added.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
