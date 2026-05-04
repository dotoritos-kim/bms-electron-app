# bms-electron-app 리팩토링 계획

> 분석 일자: 2026-05-05 / 분석 범위: `src/` 42 파일 / 11,302 LoC
> 목표: 디자인 패턴 정돈 + any/unknown 제거 + 검증 계획 수립

---

## 1. Executive Summary

- **strict는 이미 활성화됨** (tsconfig.web.json L7, tsconfig.node.json L7 모두 `"strict": true`). 루트 `tsconfig.json`은 project references만 가진 솔루션 파일. 즉 "strict 미활성"은 사실 오인이며 **추가 strict 옵션**(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`)이 켜지지 않은 상태가 진짜 갭.
- **명시적 any/unknown 6건 중 2건만 진성 any** (Editor.tsx L1620–1621). 나머지는 의도적 IPC 광역 채널 핸들러(`unknown[]`)와 워커 호환 캐스트.
- **가장 큰 구조 부채**: `Editor.tsx` 2,529줄 + `editorStore.ts` 1,792줄 단일 파일 비대화, IPC 채널 문자열 리터럴 4중 산재(main/preload/.d.ts/renderer), preload `on()` 채널 화이트리스트 부재(보안), `useLocalBmsFile`이 `../../../../bms-editor/src/...`로 sibling 소스 직접 참조(레이어 경계 위반).
- **권장 패턴**: ① IPC 채널 단일 진실 소스(`shared/ipc-contract.ts`) + Adapter, ② Repository(키음/메타/오토세이브 파일 작업), ③ Discriminated Union(IPC 응답 Result 타입), ④ Editor를 feature slice로 쪼개고 store를 도메인별 slice로 분할.
- **strict 추가 단계**는 점진적 (Phase A: 채널 계약 → Phase B: store/Editor 분할 → Phase C: extra strict 플래그) 권장.

---

## 2. 현재 구조 매핑

```
src/
├── main/                      (메인 프로세스 / Node)
│   ├── index.ts               65줄 — BrowserWindow 생성, IPC 등록 진입점
│   ├── menu.ts                75줄 — 앱 메뉴, webContents.send('menu:*')
│   └── ipc/
│       ├── audio.ts           69줄 — audio:readFile, audio:readBatch
│       └── file.ts            438줄 — dialog/file/io 17개 핸들러 (거대)
├── preload/
│   ├── index.ts               69줄 — contextBridge: window.api 노출
│   └── index.d.ts             41줄 — ElectronAPI 타입 (수동 동기화)
└── renderer/                  (React + Zustand)
    ├── App.tsx                246줄 — 라우트 분기, ErrorBoundary, 메뉴 IPC 수신
    ├── routes/
    │   ├── Home.tsx           433줄
    │   ├── Player.tsx         290줄
    │   └── Editor.tsx         2,529줄 ⚠️ 비대화
    ├── stores/
    │   └── editorStore.ts     1,792줄 ⚠️ 단일 store, 80+ 액션, EditorState 인터페이스 260줄
    ├── components/            13개 (633줄짜리 AudioSlicer 포함)
    ├── hooks/                 useHomeBmsFile, useLocalBmsFile (각 178/235줄)
    ├── lib/                   12개 유틸 (autoChart, midiInput, beatConverter, ...)
    └── workers/               3개 (audioScheduler, bmsParser, gameLoop) — 모두 5–193줄 shim
```

### 책임 분리 현황
| 영역 | 담당 | 평가 |
|---|---|---|
| 메인 (Node API) | 파일/오디오 IO, 다이얼로그, WAV 작성 | ✅ 분리 양호. 다만 `ipc/file.ts`가 dialog+IO+생성 혼재 |
| 프리로드 (브리지) | `window.api` 노출 | ⚠️ 채널명 하드코딩, `on()` 채널 화이트리스트 없음 |
| 렌더러 (UI/상태) | 라우팅, Zustand 단일 store, BMS 라이브러리 통합 | ⚠️ Editor/store 거대, 라이브러리 직접 의존 |

---

## 3. tsconfig 현황 및 strict 활성화 전략

### 현재 설정
| 파일 | strict | 추가 옵션 | 대상 |
|---|---|---|---|
| `tsconfig.json` | — | references 전용 | 루트 솔루션 |
| `tsconfig.node.json` | **true** | composite, esModuleInterop, skipLibCheck, forceConsistentCasingInFileNames | `src/main/**`, `src/preload/**`, `electron.vite.config.ts` |
| `tsconfig.web.json` | **true** | composite, isolatedModules, jsx=react-jsx, noUnusedLocals=**false**, noUnusedParameters=**false** | `src/renderer/**`, `src/preload/index.d.ts` |

> ✏️ 사용자 지시 ("strict 활성 안 됨")는 부분적으로 부정확. 양 서브 프로젝트 모두 `"strict": true`. 다만 다음 추가 옵션 미적용.

### 추가로 권장하는 strict 옵션
| 옵션 | 효과 | 예상 영향 |
|---|---|---|
| `noUncheckedIndexedAccess` | `arr[i]`, `Record<>[k]` 결과에 `\| undefined` | **HIGH** — `keysoundMap[key]`, `chart.objects[…]` 등 다수 |
| `exactOptionalPropertyTypes` | `prop?: T` ≠ `prop?: T \| undefined` | MID — props 오용 노출 |
| `noImplicitReturns` | 함수 모든 분기 return 강제 | LOW — 일부 IPC 핸들러 |
| `noFallthroughCasesInSwitch` | switch fallthrough 차단 | LOW |
| `useUnknownInCatchVariables` (default since 4.4) | `catch (e: unknown)` | 기 적용 |
| `noUnusedLocals/Parameters` 재활성 | 런타임 코드 청소 | MID — 다수 미사용 변수 추정 |

### 점진 활성화 경로
1. **Phase A (즉시)**: `noImplicitReturns`, `noFallthroughCasesInSwitch` — 거의 무영향.
2. **Phase B (디자인 패턴 적용 후)**: `noUnusedLocals/Parameters=true` — Editor 분할 후 dead code 정리.
3. **Phase C (타입 안전성 단계 끝)**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — 다수 콜사이트에 `??`/가드 추가 필요.

---

## 4. IPC 표면 / 외부 라이브러리 의존

### 4.1 IPC 채널 카탈로그 (renderer ⇄ main)
| 채널 | 방향 | 인자 | 응답 | 정의 위치 |
|---|---|---|---|---|
| `dialog:openBmsFile` | invoke | — | `string \| null` | file.ts L30 |
| `dialog:openBmsFolder` | invoke | — | `string \| null` | file.ts L55 |
| `dialog:openAudioFile` | invoke | — | `string \| null` | file.ts L281 |
| `file:readBms` | invoke | `path` | `Buffer` (→ Uint8Array 캐스팅) | file.ts L76 |
| `file:saveBms` | invoke | `path, content` | `boolean` | file.ts L82 |
| `file:saveAs` | invoke | `content, name?` | `string \| null` | file.ts L114 |
| `file:readMeta` / `saveMeta` | invoke | … | … | file.ts L96/107 |
| `file:writeAutoSave` / `checkAutoSave` / `deleteAutoSave` | invoke | … | … | file.ts L185/192/211 |
| `file:listBmsFolder` | invoke | `folder` | `BmsFileInfo[]` | file.ts L395 |
| `file:importKeysounds` | invoke | `bmsPath` | `Array<{filename,destPath}>` | file.ts L147 |
| `file:createNewBms` | invoke | `{title,artist,bpm,keyMode}` | `{path,name,folderPath} \| null` | file.ts L218 |
| `file:saveWavSlice` / `saveWavSlices` | invoke | … | `boolean` / `string[]` | file.ts L306/351 |
| `audio:readFile` | invoke | `path` | `ArrayBuffer` | audio.ts L9 |
| `audio:readBatch` | invoke | `bmsPath, map` | `{results, errors}` | audio.ts L16 |
| `menu:openFile` / `openFolder` / `save` / `saveAs` | send→on | — | — | menu.ts L13–38, App.tsx L138–164 |

> 19개 invoke 채널 + 4개 send 채널. **모두 채널 문자열 리터럴이 main/preload/renderer 3중 산재**.

### 4.2 외부 라이브러리 의존 (sibling packages)
- `@rhythm-archive/bms-core` — `BMSParser`, `Timing`, `Positioning`, `Spacing`, `KeySounds`, `SongInfo`, `Notes`, `BMSWriter`, 타입 다수.
- `@rhythm-archive/bms-editor` — `NoteChartEditor`, `EditorToolbar`, `KeysoundPanel`, `Minimap`, `getLaneIds`, 타입(`NoteChartEditorProps`, `KeyMode`, `EditorTool`, …).
- `@rhythm-archive/bms-player` — `AudioPreloader`, `WorkerAudioScheduler`, `FileMap`, `SchedulerNote`.
- ⚠️ `useLocalBmsFile.ts` L4: `import { detectKeyMode } from '../../../../bms-editor/src/chart/useBmsChart'` — **alias 우회 깊은 상대경로**, 캡슐화 위반.
- ⚠️ `electron-store` 패키지가 deps에 있으나 `src/`에서 사용 안 함(localStorage가 sessionStorage 대용). **데드 의존성**.

---

## 5. 식별된 이슈

### HIGH
1. **거대 라우트/스토어** — `Editor.tsx` 2,529줄, `editorStore.ts` 1,792줄. 단일 책임 원칙 위반, 진단/리팩토링 비용 높음.
2. **IPC 채널 문자열 4중 산재** — main 핸들러/preload invoke/.d.ts/renderer 호출자 모두 리터럴. 오타 시 런타임 실패. Single Source of Truth 부재.
3. **preload `on()` 채널 화이트리스트 없음** — `index.ts` L58: `on: (channel: string, callback)` — 임의 채널 등록 가능. contextIsolation은 켜져 있으나 채널 표면 좁히지 못함. 보안/유지보수 리스크.
4. **명시적 `as any` (Editor.tsx L1620–1621)** — `layer as any`로 타입 시스템 우회. `keyof LayerConfig`로 좁힐 수 있는데 캐스트로 방치.
5. **Cross-package 소스 직접 참조** — `useLocalBmsFile.ts` L4, sibling `bms-editor/src/chart/useBmsChart`를 `../../../../`로 가져옴. alias 무시. 패키지 경계 무너짐.

### MID
6. **Renderer→IPC 호출이 컴포넌트 내부에 직접 산재** — `window.api.file.*` 호출이 Editor/Home/AudioSlicer/AutoChartDialog/hooks 등 ≥10개 위치. 테스트 mock·교체 어려움.
7. **`ipc/file.ts` 단일 파일 17개 핸들러** — dialog/IO/WAV write/스캔이 한 파일에 혼재.
8. **WAV 인코딩 로직 중복** (file.ts L306–348 vs L351–392). 단일/배치 핸들러가 동일 인코더 두 번 구현.
9. **`dialogOpen` 모듈 전역 플래그** — file.ts L26, 다중 윈도우/멀티 호출 시 race 위험. mutex/큐 패턴 부재.
10. **메인 프로세스 입력 검증 부재** — `filePath: string` 매개변수에 traversal/허용경로 검증 없음. `readFile(arbitraryPath)` 가능. 샌드박스가 아닌 IPC라서 신뢰 가능하지만, BMS 폴더 외부 임의 파일 읽기 가능.
11. **`Editor.tsx`의 메뉴 단축키 dispatch 우회** — App.tsx L156–165: `menu:save` 수신 시 `KeyboardEvent` 합성 dispatch. Editor 내부와 결합도 높음 (Command 패턴 부재).
12. **`window` 글로벌 데브 헬퍼 (`__DEV_OPEN_FILE__`)** — App.tsx L124–131, `Record<string, unknown>` 캐스트로 부착. 빌드 산출물에서 분리되지 않을 가능성.

### LOW
13. **`electron-store` deps 미사용** — package.json:28에 있으나 src/에서 0회 사용. localStorage로 대체된 것으로 보임. 제거 또는 채택 결정 필요.
14. **`tsconfig.web.json`에 `noUnusedLocals: false`** — 명시적으로 꺼져 있음. 정리 압박 부재.
15. **TS strict 추가 옵션 비활성** (3장 참조).
16. **Buffer→ArrayBuffer 변환 코드 중복** (audio.ts L11, L52-55).
17. **`LocalAudioWorker.ts` `as unknown as Worker`** (L109) — Worker 호환 shim, 의도적이지만 더 좋은 추상화(EventEmitter 인터페이스) 가능.

---

## 6. 디자인 패턴 적용 계획 (전/후 스니펫)

### 6.1 Channel 타이핑 + Adapter (HIGH 우선) — 채널 SSOT
**문제**: 같은 채널명 `'file:readBms'`가 main/preload/.d.ts/renderer에서 4번 등장.

**Before** (파편화):
```ts
// main/ipc/file.ts
ipcMain.handle('file:readBms', async (_e, filePath: string) => readFile(filePath));
// preload/index.ts
readBms: (filePath: string): Promise<Uint8Array> => ipcRenderer.invoke('file:readBms', filePath),
// preload/index.d.ts (수동 동기화)
readBms: (filePath: string) => Promise<Uint8Array>;
```

**After** (`src/shared/ipc-contract.ts` 신설):
```ts
export interface IpcInvokeMap {
  'file:readBms':       { in: [filePath: string]; out: Uint8Array };
  'file:saveBms':       { in: [filePath: string, content: string]; out: boolean };
  'audio:readBatch':    { in: [bmsPath: string, map: Record<string, string>]; out: { results: Record<string, ArrayBuffer>; errors: Record<string, string> } };
  // ... 19 channels
}
export interface IpcSendMap {
  'menu:openFile': []; 'menu:openFolder': []; 'menu:save': []; 'menu:saveAs': [];
}
export type IpcChannel = keyof IpcInvokeMap;

// main 헬퍼
export function handle<K extends IpcChannel>(
  ch: K,
  fn: (e: IpcMainInvokeEvent, ...args: IpcInvokeMap[K]['in']) => Promise<IpcInvokeMap[K]['out']>,
) { ipcMain.handle(ch, fn as any); }

// preload 헬퍼
export function invoke<K extends IpcChannel>(ch: K, ...args: IpcInvokeMap[K]['in']):
  Promise<IpcInvokeMap[K]['out']> { return ipcRenderer.invoke(ch, ...args); }
```
→ 오타·인자 불일치를 컴파일 타임에 차단. `index.d.ts` 수동 동기화 제거.

### 6.2 Repository 패턴 (MID) — 파일/메타/오토세이브 그룹화
`src/main/repositories/BmsFileRepository.ts`, `KeysoundRepository.ts`, `AutoSaveRepository.ts`로 분리. 각 IPC 핸들러는 얇은 어댑터로만 동작.

```ts
// repositories/BmsFileRepository.ts
export class BmsFileRepository {
  async read(path: string): Promise<Buffer> { return readFile(path); }
  async writeAtomic(path: string, content: string): Promise<void> { /* tmp+rename */ }
  async readMeta(path: string): Promise<string | null> { /* sidecar */ }
  // ...
}
// main/ipc/file.ts (얇아짐)
const repo = new BmsFileRepository();
handle('file:readBms', (_e, p) => repo.read(p).then(toUint8));
```

### 6.3 Facade 패턴 (MID) — Renderer에서 IPC 사용 단일화
`src/renderer/services/FileService.ts`, `AudioService.ts`, `MenuService.ts`. 컴포넌트는 서비스만 호출, `window.api`는 서비스에서만 import.

```ts
// services/FileService.ts
export const fileService = {
  async openBms(): Promise<CurrentFile | null> {
    const path = await window.api.file.openBmsFile();
    if (!path) return null;
    return { path, name: basename(path), folderPath: dirname(path) };
  },
  // ...
};
```
→ vitest mocking 단순화, IPC 교체 가능, Editor.tsx의 `window.api.*` 18회 호출 제거.

### 6.4 Discriminated Union — IPC Result 타입 (HIGH for boundary)
**문제**: `audio:readBatch`가 `{results, errors}`로 부분 실패 표현하지만, 다른 핸들러는 throw 또는 `null`로 통일성 없음.

**After**:
```ts
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
// IPC 경계의 응답을 Result로 통일 → preload에서 throw 변환 또는 그대로 전달
```

### 6.5 Type Guard at IPC Boundary (HIGH)
preload `on()`이 `unknown[]`로 받기 때문에 핸들러 측에서 가드 필요. **현재 모든 send 채널은 인자 없음**(`menu:*`)이지만, 향후 추가 시:
```ts
function isFilePathPayload(x: unknown): x is { path: string } {
  return typeof x === 'object' && x !== null && typeof (x as any).path === 'string';
}
```
또한 preload `on()`을 **화이트리스트**로 좁힘:
```ts
const ALLOWED_RECV: ReadonlyArray<keyof IpcSendMap> = ['menu:openFile', 'menu:openFolder', 'menu:save', 'menu:saveAs'];
on<K extends keyof IpcSendMap>(channel: K, cb: (...args: IpcSendMap[K]) => void) {
  if (!ALLOWED_RECV.includes(channel)) throw new Error(`disallowed channel ${channel}`);
  // ...
}
```

### 6.6 Store Slice 패턴 (HIGH) — editorStore 분할
1,792줄 단일 store를 도메인 슬라이스로 쪼갬 (zustand `combine` / slice composition):
- `notesSlice` (notes, selection, layerConfig, undo/redo)
- `audioSlice` (audioPhase, playbackTime, loopA/B, volume)
- `uiSlice` (panel toggles, toast, dialogs, headerCollapsed)
- `headerSlice` (BMSHeaderData, custom/wav/bmp 맵)
- `clipboardSlice`, `bookmarkSlice`, `groupSlice`

각 slice는 독립 파일에서 정의/테스트. 현재 80+ 액션이 5–8개 슬라이스로 응집.

### 6.7 Command 패턴 (MID) — 메뉴/단축키
현재 App.tsx가 `menu:save` 수신 → 합성 KeyboardEvent dispatch → Editor 핸들러 가로채기. Command 객체로 분리:
```ts
interface EditorCommand { id: string; canExecute(): boolean; execute(): Promise<void> | void; }
const commands: Record<string, EditorCommand> = { save: { ... }, saveAs: { ... } };
// menu:save 수신 → commands.save.execute()
```

### 6.8 우선순위 매트릭스
| 패턴 | 영향 | 난이도 | 우선 |
|---|---|---|---|
| 6.1 Channel 타이핑 | HIGH | 낮음 | **1** |
| 6.6 Store slice | HIGH | 중 | **2** |
| 6.3 Facade(Service) | MID | 낮음 | 3 |
| 6.5 Channel whitelist | HIGH(보안) | 낮음 | 3 |
| 6.2 Repository | MID | 중 | 4 |
| 6.4 Result Union | MID | 낮음 | 4 |
| 6.7 Command | MID | 중 | 5 |

---

## 7. 타입 안전성 정리 계획

### 7.1 명시적 any/unknown 위치별 처리
| 위치 | 라인 | 현재 | 원인 | 해결 전략 | IPC 경계? |
|---|---|---|---|---|---|
| `preload/index.ts` | 58 | `(channel: string, callback: (...args: unknown[]) => void)` | 광역 채널 핸들러 | **Generic + IpcSendMap 화이트리스트**: `on<K extends keyof IpcSendMap>(ch: K, cb: (...args: IpcSendMap[K]) => void)` | ✅ |
| `preload/index.ts` | 59 | `(_event, ...args: unknown[]) => callback(...args)` | 동일 | 동일 (위 generic 적용 시 자연 해소) | ✅ |
| `preload/index.d.ts` | 34 | `on: (channel: string, callback: (...args: unknown[]) => void)` | 수동 타입 정의 | SSOT(`shared/ipc-contract.ts`)로 이전 → 수동 .d.ts 폐기 | ✅ |
| `renderer/lib/LocalAudioWorker.ts` | 109 | `return fakeWorker as unknown as Worker;` | DOM Worker 인터페이스 호환 shim | **Adapter 인터페이스 도입** 또는 부족한 Worker 메서드 추가하여 직접 호환. 차선: 명시적 타입 단언을 좁힌 인터페이스로 (`as unknown as Pick<Worker, 'postMessage'\|'addEventListener'\|...>`) | — |
| `renderer/routes/Editor.tsx` | 1620 | `store.setLayerVisible(layer as any, ...)` | toolbar 콜백 인자가 broad string | **Type Predicate**: `function isLayerKey(x: string): x is keyof LayerConfig { return ['playable','invisible','landmine','bgm'].includes(x as any); }` 또는 toolbar 콜백 시그니처를 `(layer: keyof LayerConfig)`로 좁힘 | — |
| `renderer/routes/Editor.tsx` | 1621 | `store.setLayerLocked(layer as any, ...)` | 동일 | 동일 | — |

### 7.2 추정 암묵적 any (strict 추가 옵션 활성 시 발생 예측)
> 현재 `strict: true`라 진성 암묵적 any는 거의 없을 가능성. 다만 `noUncheckedIndexedAccess` 활성 시 다음 위치가 에러 후보:

| 위치 | 코드 패턴 | 영향 | 수정 |
|---|---|---|---|
| `LocalAudioWorker.ts` L138, L147 | `fileMap[key] \|\| key` (이미 `\|\|` 가드 있음) | 안전 | — |
| `editorStore.ts` Map/Record 인덱싱 다수 | `result.wav!.set(...)` (L34–39) — non-null assertion 사용 중 | 안전(설계상 항상 init) | 유지 가능 |
| `audio.ts` L46 `parse(filename).name`, L53 `baseNameToPath.get(baseName)` | `Map.get` 결과 `\| undefined` | **현재 `if (resolvedPath)` 가드 있음** | 그대로 |
| `file.ts` L48 `result.filePaths[0]` | 배열 인덱싱 | 가드 있음(`length === 0` 체크) | 그대로 OK |
| `Home.tsx`, `AudioSlicer.tsx` 다수 폼/배열 | `files[i]` 류 | 일부 새 가드 필요 | `??`/early return 추가 |
| `editorStore.ts` `keysoundMap[id]` 류 | Record 인덱싱 다수 | **다수 사이트** | 슬라이스 분할 시 함께 정리 |
| `LocalAudioWorker.ts` L70 `message.payload` | discriminated union — OK | 안전 | — |
| `bmsParser.worker.ts`, `useLocalBmsFile.ts` parsing 코드 | 정규식 match 결과 `string \| undefined` (L127 `match[1].toLowerCase()`) | **에러 후보** | `if (match)` 후 `match[1] ?? ''` |

**예상 신규 에러 수**: `noUncheckedIndexedAccess` 활성 시 50–150건 추정 (대부분 `??`/가드 한 줄 수정).

### 7.3 IPC 경계 가드 명세
- **모든 invoke 핸들러는 인자 검증** — 패스 traversal 방지(`isAbsolute(p) && p.startsWith(allowedRoot)` 권장).
- **모든 invoke 응답은 직렬화 가능 타입만** — 현재 `Float32Array`, `Buffer`, `ArrayBuffer` 사용 중. Buffer→Uint8Array 변환은 preload에서 처리.
- **`menu:*` send는 인자 없음 유지** — 인자 추가 시 `IpcSendMap`에 정의 후 type guard 의무화.

---

## 8. 폴더/파일 재구성 제안

### 제안 트리
```
src/
├── shared/                          (NEW — main/renderer 공용)
│   ├── ipc-contract.ts              IpcInvokeMap, IpcSendMap, Result<T,E>
│   ├── domain-types.ts              BmsFileInfo, CurrentFile, LayerConfig 등
│   └── path-guards.ts               경로 검증 유틸
│
├── main/
│   ├── index.ts
│   ├── menu/
│   │   └── createMenu.ts
│   ├── ipc/
│   │   ├── register.ts              모든 핸들러 등록 진입점
│   │   ├── file.handlers.ts         (얇은 어댑터)
│   │   ├── audio.handlers.ts
│   │   └── dialog.handlers.ts       (NEW — dialog 분리)
│   ├── repositories/                (NEW)
│   │   ├── BmsFileRepository.ts
│   │   ├── AutoSaveRepository.ts
│   │   ├── KeysoundRepository.ts
│   │   └── WavEncoder.ts            (NEW — WAV 인코딩 단일화)
│   └── infra/
│       ├── DialogService.ts         dialogOpen mutex 캡슐화
│       └── refocusWindow.ts
│
├── preload/
│   └── index.ts                     contextBridge + invoke/on 헬퍼
│
└── renderer/
    ├── App.tsx
    ├── routes/
    │   ├── Home.tsx
    │   ├── Player.tsx
    │   └── editor/                  (Editor.tsx 분할)
    │       ├── Editor.tsx           ~400줄 (컨테이너)
    │       ├── EditorToolbarPanel.tsx
    │       ├── EditorPlaybackBar.tsx
    │       ├── EditorOverlays.tsx
    │       └── hooks/
    │           ├── useEditorAudio.ts
    │           ├── useEditorAutoSave.ts
    │           ├── useEditorKeyBindings.ts
    │           └── useEditorMidi.ts
    ├── stores/                      (slice 분할)
    │   ├── index.ts                 useEditorStore composition
    │   ├── notesSlice.ts
    │   ├── audioSlice.ts
    │   ├── uiSlice.ts
    │   ├── headerSlice.ts
    │   ├── clipboardSlice.ts
    │   ├── bookmarkSlice.ts
    │   └── groupSlice.ts
    ├── services/                    (NEW — Facade)
    │   ├── FileService.ts
    │   ├── AudioService.ts
    │   ├── MenuService.ts
    │   └── AutoSaveService.ts
    ├── components/                  (현 구조 유지, AudioSlicer 분할 검토)
    ├── hooks/
    ├── lib/
    └── workers/
```

### 주요 이동
- `src/preload/index.d.ts` 폐기 → `shared/ipc-contract.ts`로 SSOT.
- `useLocalBmsFile.ts` L4 cross-package import → `bms-editor` 공식 export로 이전 또는 `bms-editor`에 `detectKeyMode` 공식 export 추가.
- `Editor.tsx` 2,529줄 → 컨테이너 + 4–6 sub-component + 4 hooks (각 200–500줄).
- `editorStore.ts` 1,792줄 → 7 slice (각 150–400줄).

---

## 9. 단계별 실행 계획

### Phase 0 — 준비 (반나절)
- [ ] 본 REFACTOR-PLAN.md 검토 및 합의
- [ ] 현 메인/리포 코드 baseline 태그
- [ ] vitest, playwright, stryker 회귀 베이스라인 캡처 (테스트 통과율, 커버리지)

### Phase 1 — IPC 계약 SSOT (1–2일) ← 6.1, 6.5
1. `src/shared/ipc-contract.ts` 작성 (19 invoke + 4 send 채널 매핑)
2. `main/ipc/handle()` generic 헬퍼 도입 → 기존 17개 핸들러를 generic으로 교체 (시그니처 보존)
3. `preload/index.ts`에서 `invoke`/`on` generic 헬퍼 사용, `on` 화이트리스트 적용
4. `preload/index.d.ts` 폐기, `shared`로 단일화
5. **검증**: `npm run type-check`, vitest, playwright 회귀
6. **결과**: 명시적 any 4건 (preload 2 + .d.ts 1 + Editor 2)이 3건으로 감소 (Editor 2건은 7.1 별도 작업).

### Phase 2 — 타입 가드 / Editor any 제거 (반나절) ← 7.1
1. Editor.tsx L1620–1621: `keyof LayerConfig` 타입 술어 도입
2. `LocalAudioWorker.ts` L109: shim Worker 인터페이스 좁힘
3. **결과**: 명시적 any/unknown 0건.

### Phase 3 — Facade(Service) 도입 (1일) ← 6.3
1. `services/FileService`, `AudioService`, `MenuService`, `AutoSaveService` 작성
2. `App.tsx`, `Home.tsx`, `Editor.tsx`, `AudioSlicer.tsx`, `AutoChartDialog.tsx`, hooks의 `window.api.*` 호출 18곳을 service 경유로 교체
3. **검증**: vitest mock을 service 경유로 단순화 (test:compat 호환)

### Phase 4 — Repository + DialogService (1–2일) ← 6.2, MID #7,8,9
1. `BmsFileRepository`, `AutoSaveRepository`, `KeysoundRepository`, `WavEncoder` 추출
2. `dialogOpen` 모듈 전역 → `DialogService` 인스턴스
3. `ipc/file.ts` 438줄 → `file.handlers.ts` 200줄 + `dialog.handlers.ts` + `repositories/*`
4. **검증**: 기존 IPC 시그니처 100% 유지 → 렌더러 변경 없음.

### Phase 5 — Editor 분할 (3–5일) ← 6.6, HIGH #1
1. `editorStore.ts` slice 분할 (7개)
2. `Editor.tsx` → 컨테이너 + sub-component + hooks
3. **검증**: playwright E2E 그대로 통과해야 함. 각 슬라이스 단위 vitest 추가.

### Phase 6 — Discriminated Union / Result (1일) ← 6.4
1. 부분 실패 의미 가진 핸들러(`audio:readBatch`, `file:saveWavSlices`)를 `Result<T,E>`로 통일
2. 렌더러 호출자 업데이트

### Phase 7 — Command 패턴 (1일) ← 6.7, MID #11
1. `App.tsx`의 KeyboardEvent 합성 dispatch 제거
2. Editor가 `commandRegistry`에 등록 → `MenuService`가 커맨드 호출

### Phase 8 — strict 추가 옵션 점진 활성 ← 3장
1. `noImplicitReturns`, `noFallthroughCasesInSwitch` 활성 (Phase A 즉시)
2. `noUnusedLocals/Parameters` 활성 (Phase 5 후)
3. `noUncheckedIndexedAccess` 활성 (Phase 6 후)
4. `exactOptionalPropertyTypes` 활성 (마지막)

### 누적 영향
| Phase | LoC 변동 | any/unknown 감소 | 외부 시그니처 변동 |
|---|---|---|---|
| 1 | +200(shared) -50 | 4건 → 1건(Editor만 잔존) | 없음 |
| 2 | -10 | 1 → 0 | 없음 |
| 3 | +400(services) -100 | — | 없음 |
| 4 | +300 -250 | — | 없음 |
| 5 | 0 (재배치) | — | 없음 |
| 6 | +50 -10 | — | **있음** (응답 형태) |
| 7 | +150 -80 | — | App↔Editor 결합 감소 |
| 8 | 가드 +50 ~ +200 | — | 없음 |

---

## 10. 검증 계획

### 10.1 정적 검증
- `tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json` (CI 게이트)
- 각 Phase 끝나고 0 에러 확인
- Phase 8 strict 옵션 추가 시 점진 게이트

### 10.2 단위 (vitest)
- **신규**: 각 service Facade(`FileService`, `AudioService`)의 mock 기반 단위 테스트
- **신규**: 각 store slice의 액션 단위 테스트 (현재 store 테스트 유무 확인 필요)
- **신규**: `WavEncoder` 단일화된 인코더 단위 테스트
- **신규**: `path-guards`, IPC 채널 type guard 단위 테스트
- 커버리지 베이스라인 ±5% 이내 유지

### 10.3 통합/E2E (playwright + puppeteer-core)
- 기존 `tests/e2e/`, `tests/integration/` 회귀 통과
- **신규 IPC 계약 테스트**: 각 채널마다 main 핸들러 ↔ preload invoke 왕복 → 타입 시그니처 일치 검증
  - `tests/integration/ipc-contract.spec.ts`: `IpcInvokeMap`의 모든 채널을 enumerate, 더미 인자로 호출, 응답 형태 단언
- **회귀 시나리오**: 파일 열기→편집→저장, 새 파일 생성, 키음 가져오기, WAV 슬라이스 저장, 자동 저장 복구, 메뉴 단축키

### 10.4 호환성 (test:compat)
- `tests/compatibility/` 기존 통과 유지 (IPC 시그니처 변경 없을 시)
- Phase 6에서 응답 형태 변경 시 호환 레이어 또는 baseline 갱신

### 10.5 변이 (stryker)
- `stryker run` 베이스라인 점수 기록
- Phase 4(Repository) 후 store 분할 전에 한 번, Phase 5 후 다시 → 변이 점수 향상 확인

### 10.6 보안 검증
- preload `on()` 화이트리스트 negative test (허용 외 채널 throw)
- IPC 인자 traversal 가드 negative test (`../`, 절대경로 외부 디렉터리)

### 10.7 수동 (smoke)
- 다이얼로그 race(Windows): 빠른 더블 클릭, 다중 윈도우 시나리오
- 메뉴 단축키 (Ctrl+S/Shift+S/N/O) 4 항목

---

## 11. 위험 요소

| ID | 위험 | 발생 가능성 | 영향 | 완화 |
|---|---|---|---|---|
| R1 | Editor 분할 중 zustand selector 의존성으로 무한 리렌더 도입 | 중 | 높음 | 슬라이스 단위 vitest, React DevTools 프로파일러로 비교 |
| R2 | IPC contract 도입 시 preload `as any` 잔존 | 낮음 | 중 | 핸들러 매핑 generic 헬퍼로 강제 |
| R3 | sibling 패키지(`bms-core/editor/player`) 동시 리팩토링 시 브레이킹 | 높음 | 높음 | 본 워크스페이스 6병렬 계획에서 인터페이스 변경 합의 절차 명시 |
| R4 | `noUncheckedIndexedAccess` 활성 시 50–150건 에러 일시 부담 | 높음 | 중 | Phase 8 마지막에 한 번에 해결, 타입 narrowing 헬퍼(`safeGet<T>(rec, k)`) 도입 |
| R5 | electron-store 채택 결정 미정 (deps만 있고 미사용) | 중 | 낮음 | 결정: ① 제거(localStorage 유지), ② 채택(앱 설정 영속화). 별도 의사결정 |
| R6 | `useLocalBmsFile.ts` cross-package import 정리 시 `bms-editor` 변경 필요 | 높음 | 중 | bms-editor 담당 에이전트와 인터페이스 합의 (detectKeyMode 공식 export) |
| R7 | preload `on()` 화이트리스트 도입 시 메뉴 채널 누락으로 단축키 깨짐 | 낮음 | 중 | E2E 회귀로 커버 (이미 존재) |
| R8 | strict 추가 옵션이 sibling 패키지 빌드까지 전파 | 낮음 | 낮음 | composite 분리되어 격리됨 (현재 구조 유지) |
| R9 | `Float32Array` IPC 직렬화 비용 — 대용량 슬라이스 저장 시 복사 발생 | 중 | 중 | 현재 동작 변경 없음. 향후 transferable 검토는 별도 |
| R10 | dialogOpen mutex를 service로 옮길 때 race | 낮음 | 중 | 단위 테스트로 reentrant 시나리오 커버 |

---

## 부록 A — 본 분석에서 명확화된 사항 (사용자 지시 대비)

| 사용자 지시 | 실제 |
|---|---|
| "TS strict 활성 안 됨" | tsconfig.web/node.json 모두 `strict: true`. 루트 `tsconfig.json`은 references 전용. **추가 strict 옵션**(noUncheckedIndexedAccess 등)이 비활성. |
| "암묵적 any가 다수 숨어있을 가능성" | strict 자체는 켜져 있어 진성 암묵적 any는 거의 없음. `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/`noUnusedLocals` 활성 시 다수 에러 예상. |
| "any/unknown 6건 / 4파일" | 확인. 단 명시적 진성 any는 Editor.tsx 2건뿐, 나머지 4건은 의도적 unknown(IPC 광역) 또는 Worker shim 캐스트. |
| "electron-store 의존" | package.json에는 있으나 src/에서 0회 사용. 데드 의존성 또는 미구현 기능. |

## 부록 B — 메트릭 요약
- 총 LoC (src/): **11,302** (사용자 제공) / 본 분석 wc: 11,294 (workers 포함)
- 가장 큰 파일: Editor.tsx 2,529 / editorStore.ts 1,792 / AudioSlicer.tsx 633 / file.ts(main) 438
- IPC 채널: invoke 19 + send 4 = 23
- 명시적 any/unknown: 6건 / 4파일 (확인 일치)
- 외부 sibling 패키지 의존: 3개 (bms-core, bms-editor, bms-player)
