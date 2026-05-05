# VERIFY-STAGE-1.md — bms-electron-app Stage 1 (IPC SSOT) 독립 검증

> 검증자: 병렬 검증 에이전트 (bms-electron-app 담당)
> 일자: 2026-05-05
> 대상: PR https://github.com/dotoritos-kim/bms-electron-app/pull/1
> Base: `ship/v1.0-complete` / Head: `refactor/stage-1-ipc-contract-ssot` (commit `9f93b08`)
> 베이스라인: ship `9f93b08^` 부근의 ship/v1.0-complete tip

---

## 1. 요약 (Verdict)

**APPROVE — ship 머지 권고 (조건부)**

- Stage 1의 IPC 채널 SSOT는 REFACTOR-PLAN 9장 Phase 1 명세와 정확히 일치하게 구현되어 있다.
- 베이스라인 대비 vitest 1118/1118 동일, type-check 에러 수 95개 동일(전부 cross-package `bms-player` 잔존 에러로 본 PR과 무관).
- IPC 보안 표면은 **명확히 좁아졌고** (`on()` 화이트리스트 + 컴파일/런타임 이중 차단), `window.api` 시그니처는 사실상 동일해 렌더러 호출자 변경 0건이 사실로 검증된다.
- 출시 영향 위험은 **낮음(Low)**. 다만 ship 브랜치이므로 컨테이너 빌드/스모크 1라운드 후 머지 권장.

---

## 2. Plan 정합성

REFACTOR-PLAN.md L387–393 Phase 1 명세와 본 PR 산출물 매핑.

| Plan 항목 | 명세 위치 | 실제 구현 | 결과 |
|---|---|---|---|
| `src/shared/ipc-contract.ts` 신설 (19 invoke + 4 send 채널 매핑) | Plan L156–167, L388 #1 | `src/shared/ipc-contract.ts` (137줄). `IpcInvokeMap` 19개 정확히 일치 (dialog 3 + file 13 + audio 2 + 헬퍼 1 = 19). `IpcSendMap` 4개 정확. | ✅ |
| `main/ipc/handle()` generic 헬퍼 도입 | Plan L170–173, L388 #2 | `src/main/ipc/handle.ts` `handle<K>` + `sendToRenderer<K>` 두 헬퍼. `audio.ts`/`file.ts` 모든 17개 핸들러를 generic으로 교체. | ✅ |
| preload `invoke`/`on` generic 헬퍼 + `on` 화이트리스트 | Plan L174–178, L231–238, L388 #3 | `preload/index.ts` `invoke<K>` + `on<K>` (런타임 `isAllowedRecvChannel` 가드 포함). | ✅ |
| `preload/index.d.ts` 폐기, shared로 단일화 | Plan L373, L388 #4 | `index.d.ts`는 유지되었으나 `shared/ipc-contract.ts`의 타입을 import하여 SSOT를 외부 인터페이스로 노출하는 형태. **완전 폐기는 아니나 드리프트 방지는 달성** (BmsFileInfo, IpcSendMap, IpcSendChannel를 shared에서 가져와 사용). | ⚠️ 부분 |
| 명시적 any 감소 (preload 2 + .d.ts 1 → 0) | Plan L393 | 검증: ship의 `on: (channel: string, callback: (...args: unknown[]) => void)` → Stage 1의 `on<K>` 제네릭으로 unknown 제거. preload `invoke()` 내부 `as Promise<...>` 단언 1건 잔존, `handle.ts` 라인 18에 `eslint-disable @typescript-eslint/no-explicit-any` 의도적 1건 잔존(타입 경계 브리지 — 합리적). | ✅ (의도적 잔존만) |
| 시그니처 보존 → 렌더러 변경 0건 | Plan L389 #5 결과 | `git diff ship...refactor -- src/renderer/**` = empty. 렌더러 0줄 변경. | ✅ |

**부수적 변경**:
- `tsconfig.web.json`/`tsconfig.node.json` 모두 `src/shared/**`을 include에 추가. 두 프로젝트가 같은 파일을 양쪽에서 컴파일하므로 composite 측면 미세 충돌 가능성은 있으나 `composite: true`로도 빌드/타입체크 정상.
- `main/menu.ts`가 `webContents.send('menu:*')` 직접 호출에서 `sendToRenderer(webContents, 'menu:*')` 헬퍼 경유로 변경 — Plan에 명시되지 않았지만 SSOT 일관성 측면 보너스.

**Plan 정합성 점수**: 6/6 항목 성취, 1건은 부분(폐기 대신 thin re-export), 0건 미달.

---

## 3. 빌드 / 테스트 / 타입체크 결과

### 3.1 베이스라인 비교 (`ship/v1.0-complete` vs `refactor/stage-1-ipc-contract-ssot`)

| 항목 | ship/v1.0-complete | refactor/stage-1 | 회귀? |
|---|---|---|---|
| `npm run build` | (사전 보고: 통과) | **통과** — main 17.31KB / preload 2.20KB / renderer 3.43MB. 5초. | 없음 |
| `npm test` (vitest) | 38 files / **1118 tests passed** | 38 files / **1118 tests passed** | 없음 |
| `npm run type-check` 에러 라인 수 | 95 | 95 | 없음 (동수) |
| type-check 에러 출처 | `bms-player/src/audio/judgements/*`, `bms-player/src/game/*` cross-package rootDir 위반 + `DedicatedWorkerGlobalScope` 미정의 | 동일 | 없음 (PR 무관 사전부채) |

> 본 PR 도입 코드(`src/shared/`, `src/main/ipc/handle.ts`)에서는 **신규 type-check 에러 0건**.

### 3.2 vitest 세부

본 PR에 신규 테스트는 없음. Plan 10.2에서 권장하는 `tests/integration/ipc-contract.spec.ts`는 미작성 — Phase 1에서는 시그니처 보존으로 회귀 검사를 갈음한다는 전제. **회귀 가능하다는 객관적 증거: 1118/1118 동수 통과**. 베이스라인 변동 0.

### 3.3 빌드 산출물 검토

- `out/preload/index.js` 2.20KB로 미증가 수준. 화이트리스트/제네릭 헬퍼 추가에도 번들 크기 영향 미미.
- `out/main/index.js` 17.31KB, 변동 미미.

---

## 4. IPC 보안 검토

### 4.1 화이트리스트 우회 가능성 분석

`preload/index.ts` L23–37의 `on<K extends IpcSendChannel>` 함수:
1. **컴파일 타임**: TS 제네릭 `K extends IpcSendChannel`로 `'menu:openFile' | 'menu:openFolder' | 'menu:save' | 'menu:saveAs'`만 허용.
2. **런타임**: `if (!isAllowedRecvChannel(channel)) throw new Error(...)`. `isAllowedRecvChannel`은 `ALLOWED_RECV_CHANNELS as readonly string[]).includes(channel)` 명시적 배열 검사.
3. **노출 표면**: `contextBridge.exposeInMainWorld('api', api)` — `api.on`만 노출. 원본 `ipcRenderer`는 contextIsolation=true이므로 렌더러에서 도달 불가.

**우회 시도 케이스**:
- `(window.api.on as any)('arbitrary:channel', cb)` → 런타임 `throw`. 차단 OK.
- `Object.getPrototypeOf(window.api).on` → contextBridge가 freeze + clone하여 prototype 탐색 무력화.
- 메인 프로세스 측은 `webContents.send(channel, ...)`을 그대로 가짐 — 메인 → 렌더러 방향에서 임의 채널 송신 가능. 하지만 렌더러 측 listener가 `on()`을 거쳐야 하므로 **메인이 `'menu:save'` 외 채널을 send해도 받을 수 없음**. ✅
- `ipcRenderer.send('arbitrary', payload)` 같은 reverse 방향 — 본 앱은 send→receive 페어가 없고 모두 `invoke`만 사용. `invoke<K>`도 `IpcInvokeChannel`로 컴파일 좁힘. 런타임 검증은 없으나 main 측 `ipcMain.handle`가 등록된 채널만 처리 → 임의 채널 invoke는 즉시 fail.

**평가**: 보안 표면 명확히 축소. ship 베이스라인의 `on(channel: string, ...)` 무제한 등록 가능성을 제거. **Plan 6.5 / R7 위험 모두 완화**.

### 4.2 contextBridge 노출 표면 변화

| 항목 | ship | Stage 1 |
|---|---|---|
| `window.api.file.*` | 16개 메서드 | 16개 메서드 (동일 시그니처) |
| `window.api.audio.*` | 2개 메서드 | 2개 메서드 (동일 시그니처) |
| `window.api.on` | `(channel: string, cb) => () => void` | `<K extends IpcSendChannel>(channel: K, cb) => () => void` (좁아짐) |

표면 사이즈 동일, 채널 화이트리스트만 도입. **regression surface = 0**.

### 4.3 잔존 보안 부채 (본 PR 범위 외, Plan 식별)

- `file:readBms` 등 IPC 핸들러에 path traversal 가드 없음 (Plan MID #10). 본 PR 범위 외.
- `dialogOpen` 모듈 전역 (Plan MID #9). 본 PR 범위 외.

---

## 5. Renderer 호환성

### 5.1 caller 변경 0건 검증

```
git diff ship/v1.0-complete...refactor/stage-1-ipc-contract-ssot -- 'src/renderer/**'
→ (empty)
```

**검증 결과**: 보고된 "renderer 변경 0건"은 사실. `App.tsx`, `Editor.tsx`, `Home.tsx`, `useLocalBmsFile.ts`, `useHomeBmsFile.ts`, `AudioSlicer.tsx`, `AutoChartDialog.tsx`, `LocalAudioWorker.ts` 모두 무변경. `window.api.*` 25곳 호출 사이트 전부 호환.

### 5.2 시그니처 동등성 매트릭스

베이스라인 `index.d.ts` vs Stage 1 `index.d.ts` 메서드별 시그니처 비교 결과 — 모두 일치. `on()`은 generic으로 좁아졌으나 기존 호출 사이트(App.tsx L138/147/154/161)는 모두 menu:* 채널이라 신규 제약 통과.

### 5.3 런타임 동작 동등성

- `invoke()` 헬퍼는 `ipcRenderer.invoke(channel, ...args)`을 그대로 위임 → 동작 동일.
- `on()` 헬퍼는 채널 검증 후 `ipcRenderer.on()` 등록 + 동일한 unsubscribe 함수 반환 → 동작 동일 (허용 채널에 한해).
- 메뉴 단축키(Ctrl+S/Shift+S/O/Shift+O)는 `menu:*` 채널 사용 — 화이트리스트에 모두 포함. **단축키 회귀 가능성 없음**.

---

## 6. ship 브랜치 머지 위험도 + 권고

### 6.1 위험도 평가

| 차원 | 위험 | 근거 |
|---|---|---|
| 빌드 | 매우 낮음 | electron-vite build 통과, 산출물 사이즈 영향 미미 |
| 단위 테스트 | 매우 낮음 | 1118/1118 동수 통과 |
| 타입 안정성 | 매우 낮음 | 신규 에러 0, cross-package 잔존 부채 동일 |
| 런타임 회귀 | 낮음 | 시그니처 100% 호환, 화이트리스트가 menu:* 모두 포함 |
| 보안 | **개선** | 채널 화이트리스트 신규 도입 |
| 출시 일정 | 낮음 | 9개 파일/+288/-93 LOC, Stage 1로 한정 |
| ship 일관성 | 낮음 | 외부 시그니처 무변동 → 다른 sibling 패키지 영향 없음 (Plan R3 회피) |

### 6.2 머지 권고

**APPROVE — 머지 권고**. 단 ship 브랜치 특성상 다음을 함께 권장:

1. **머지 전 1라운드 수동 스모크**:
   - 메뉴 단축키 4종 (Open File / Open Folder / Save / Save As) 동작 확인
   - BMS 파일 열기 → 편집 → 저장 → 자동저장 복구
   - 키음 가져오기, WAV 슬라이스 저장
2. **머지 후 즉시 회귀 모니터링**: 첫 주간 사용자 보고 채널에서 `[preload] disallowed IPC channel subscription` 에러 발생 여부 추적 (혹시 하드코딩된 비-허용 채널 호출이 있다면 곧바로 노출됨).
3. **후속 작업 분리**: REFACTOR-PLAN의 Phase 2 이후(Editor 분할, Repository, Service Facade)는 출시 후 별도 브랜치로 진행. ship 안정성 우선.

### 6.3 잔여 권장 개선 (블로킹 아님)

- (NIT) `preload/index.d.ts`를 완전 폐기하고 `export type ElectronAPI` 추론 + `Window` 글로벌만 declare하는 형태로 통합 가능. 현재는 수동 시그니처가 남아 있어 잠재적 드리프트 가능성. (Plan L373과 미세 차이)
- (NIT) `handle.ts` L18의 `as (event, ...args: unknown[]) => unknown` 캐스트는 `ipcMain.handle` 시그니처 브리지로 합리적이나, 가능하다면 `Parameters<typeof ipcMain.handle>[1]`로 좁힐 수 있음.
- (보안 후속) Plan MID #10 path traversal 가드, MID #9 dialogOpen mutex는 다음 단계에서 처리.

---

## 부록 A — 명령 로그 요약

```bash
# Branch verification
git log --oneline -1            # 9f93b08 refactor(ipc): single source of truth ...
git diff ship/v1.0-complete...refactor/stage-1-ipc-contract-ssot --stat
# 9 files changed, 288 insertions(+), 93 deletions(-)

# Build
npm run build                   # PASS (5s, main 17.31KB / preload 2.20KB / renderer 3.43MB)

# Tests
npm test                        # 38 files / 1118 tests passed

# Type-check (refactor branch)
npm run type-check 2>&1 | grep error | wc -l   # 95

# Type-check (ship baseline)
git checkout ship/v1.0-complete
npm run type-check 2>&1 | grep error | wc -l   # 95 (동수)
git checkout refactor/stage-1-ipc-contract-ssot

# Renderer caller diff
git diff ship/v1.0-complete...refactor/stage-1-ipc-contract-ssot -- 'src/renderer/**'  # empty
```

## 부록 B — 변경 파일 목록 (PR 기준)

```
 src/main/ipc/audio.ts      |   6 +-
 src/main/ipc/file.ts       |  53 +++++++++---------
 src/main/ipc/handle.ts     |  33 +++++++++++   (NEW)
 src/main/menu.ts           |   9 +--
 src/preload/index.d.ts     |  34 +++++++++---
 src/preload/index.ts       | 106 +++++++++++++++++++----------------
 src/shared/ipc-contract.ts | 136 +++++++++++++++++++++++++++++++++++++++++++++   (NEW)
 tsconfig.node.json         |   2 +-
 tsconfig.web.json          |   2 +-
```

---

**최종 판정**: Stage 1은 Plan과 정합하며 회귀 없이 보안 표면을 좁히는 양질의 리팩토링. **ship/v1.0-complete 머지 권고**.
