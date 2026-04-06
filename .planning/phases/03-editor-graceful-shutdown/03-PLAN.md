# Phase 3 Plan: Editor Graceful Shutdown

**Phase:** 03-editor-graceful-shutdown
**Status:** Complete (implemented before GSD tracking)

## Overview

Editor 언마운트 시 in-progress 오디오 로딩을 즉시 중단하고 리소스를 안전하게 해제한다.

**Modified files:**
1. `src/renderer/routes/Editor.tsx` — loadAbortRef + inProgressPreloaderRef 추가
2. `src/renderer/App.tsx` — key={currentFile.path} 강제 리마운트

---

## Step 1: Editor.tsx cleanup 추가

- `loadAbortRef = useRef(false)` 추가
- `inProgressPreloaderRef = useRef<AudioPreloader | null>(null)` 추가
- `loadAudio()` 시작 즉시 `inProgressPreloaderRef.current = preloader`
- `loadAll()` / `decodeAll()` 완료 후 `loadAbortRef` 체크 → bail-out
- cleanup useEffect: `loadAbortRef.current = true` + `inProgressPreloaderRef.current?.abort()`

## Step 2: App.tsx 강제 리마운트

- `<Editor key={currentFile.path} ...>` 로 파일 변경 시 강제 리마운트
- 리마운트로 `loadAbortRef`/`autoLoadedRef` 등 모든 ref 초기화 보장

---

## UAT Checklist

- [x] Editor 언마운트 시 inProgressPreloaderRef.current?.abort() 호출
- [x] loadAudio bail-out 체크포인트 3개 동작
- [x] App.tsx key={currentFile.path} 리마운트
- [x] 리마운트 후 ref 초기화
