# VERIFY-STAGE-2: bms-electron-app PR #3 (독립 검증)

- **PR**: https://github.com/dotoritos-kim/bms-electron-app/pull/3
- **Title**: refactor(ts): enable noImplicitReturns + noFallthroughCasesInSwitch (Stage 2)
- **Base**: `ship/v1.0-complete` ← **Head**: `refactor/stage-2-strict-returns`
- **State**: MERGED (commit `b988b1b`, 2026-05-05T00:24:42Z by dotoritos-kim)
- **Stage 2 commit**: `fa65ec3`
- **검증일**: 2026-05-05
- **검증자**: Claude (independent)

---

## 1. PR diff — 진짜 3 파일만?

PR API상 `changedFiles: 4` (README.md +175, Editor.tsx, tsconfig.node, tsconfig.web). 그러나
`README.md`는 직전 커밋 `e54a6e1 docs: add README ...`에 속하며 Stage 2와 무관 (별도 commit, 동일 head 브랜치에 동승).

**Stage 2 단일 커밋(`fa65ec3`) 만의 변경**:

```
src/renderer/routes/Editor.tsx | 3 ++-
tsconfig.node.json             | 2 ++
tsconfig.web.json              | 2 ++
3 files changed, 6 insertions(+), 1 deletion(-)
```

→ **주장과 일치**: Stage 2 자체는 정확히 3 파일 +6/-1.

---

## 2. tsconfig 양쪽 모두 적용?

### `tsconfig.node.json` (lines 8-9 added)
```json
"strict": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
```

### `tsconfig.web.json` (lines 9-10 added)
```json
"strict": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
```

→ **확인 OK**: 두 옵션 모두 두 tsconfig에 동일하게 추가됨.

---

## 3. Editor.tsx 변경 — 동작 변경 여부

**변경 위치**: `src/renderer/routes/Editor.tsx` L1037–1047 (auto-load audio useEffect).

```diff
   useEffect(() => {
-    if (!chart || autoLoadedRef.current) return;
+    if (!chart || autoLoadedRef.current) return undefined;
     if (Object.keys(chart.keysounds).length > 0) {
       autoLoadedRef.current = true;
       const timer = setTimeout(() => loadAudioRef.current?.(), 100);
       return () => clearTimeout(timer);
     }
+    return undefined;
   }, [chart]);
```

**의미 분석**:
- React `useEffect` 콜백 반환 타입은 `void | (() => void) | undefined`.
- 기존 `return;` (early-exit) 및 떨어진(fall-through) 암묵적 `void` 반환은 **런타임상 `undefined`와 동일**.
- 이 두 분기에서 cleanup이 필요 없는 경우 React는 동일하게 cleanup 미실행.
- `setTimeout` 분기에서만 `return () => clearTimeout(timer)`로 cleanup. 변경 없음.

→ **순수 타입 정합 fix, 동작/의미 변경 0**. `noImplicitReturns` 활성화로 인한 minimal compliance 변경.

→ `noFallthroughCasesInSwitch` 관련 변경은 코드 변경 없음 (즉 기존 switch에 fallthrough 없었음 → 옵션만 켜도 무사 통과).

---

## 4. 베이스라인 비교 (로컬 검증)

### 4.1 Stage 2 head (`fa65ec3`) 로컬 실행 결과

| 항목 | 결과 |
|---|---|
| `npm run type-check` | **EXIT 0 (clean)** — node + web 모두 통과 |
| `npm test` (vitest) | **38 files, 1122/1122 passed** (4.92s) |
| `npm run build` (electron-vite) | **OK** — main 17.31kB, preload 2.20kB, renderer index 3429.23kB, css 48.23kB, workers (parser/gameLoop/audioScheduler) 모두 빌드 성공, no warnings |

→ PR 주장 (1122/1122, build OK, type-check 0) **모두 재현 확인**.

### 4.2 ship/v1.0-complete (Stage 2 미적용 로컬 base) 비교

- 로컬 `ship/v1.0-complete` HEAD는 `8837f59` (CI baseline fix). origin은 PR이 머지되어 `b988b1b`까지 진행.
- 로컬 base에서 `npm run type-check` 재실행 → **EXIT 0** (clean, 두 옵션이 안 켜진 상태에서도 통과는 자명).
- 따라서 Stage 2는 **신규 에러 0건 도입**, 두 strict 옵션 활성화로도 추가 fix가 단 1개 (`Editor.tsx`)만 필요했음 → 코드베이스가 이미 사실상 두 옵션 호환 상태였음을 입증.

### 4.3 GitHub CI 검증

- **CI (Typecheck & Unit/Integration Tests)**: **SUCCESS** (run 25351005298, 2026-05-05T00:26:21Z)
- E2E (Playwright): SKIPPED (워크플로 정책)

---

## 5. ship 브랜치 안정성 영향 (보수 평가)

| 차원 | 평가 |
|---|---|
| 런타임 의미 변경 | **없음** (Editor.tsx의 `return undefined`는 React 의미상 `return;`과 동치) |
| 빌드 출력 변경 | TypeScript는 type-only fix이므로 emit 영향 없음, 번들 크기 영향 0 추정 |
| 테스트 변경 | 0 (테스트 파일 미수정, 1122/1122 그대로) |
| 의존성 변경 | 없음 |
| API/IPC 변경 | 없음 (Stage 1과 달리 contract 변경 없음) |
| 구성 노출 면 | tsconfig만 — 두 옵션은 사실상 안전망 (lint), 코드 동작과 무관 |
| 회귀 위험 | **매우 낮음** — 변경 면적 6줄, 그 중 5줄은 tsconfig flag, 1줄은 Editor.tsx의 `return;`→`return undefined;` 동치 변환 |
| 사전부채 | ZoomControl 1건 (사전 fix 머지 완료, bms-editor #4) — 본 PR에 영향 없음 |

→ **ship 안정성 영향 미미. 향후 noImplicitReturns / noFallthroughCasesInSwitch 위반을 차단하는 안전망만 강화됨**.

---

## 6. 머지 위험도 평가

| 항목 | 등급 |
|---|---|
| 변경 규모 | **XS** (+6/-1, 3 files) |
| 의미적 위험 | **None** |
| 회귀 가능성 | **Negligible** |
| 검증 커버리지 | **High** (typecheck + 1122 vitest + electron-vite build 통과) |
| 롤백 난이도 | Trivial (단일 커밋 revert로 복구 가능) |

**최종 위험도: 매우 낮음(Very Low).**

---

## Verdict

**APPROVED — 안전. ship 머지 권고 (이미 머지됨, 사후 검증 통과)**.

Stage 2의 주장은 모두 사실로 확인되었으며 (3 파일 +6/-1, 1122/1122 vitest, build OK,
type-check 0 신규 에러, 두 strict 옵션 양 tsconfig 적용, Editor.tsx 변경은 의미 보존),
GitHub CI도 성공으로 통과. 본 PR은 사실상 무위험 type-only refactor.

---

## 핵심 발견 3개

1. **변경 면적 정확히 주장과 일치**: Stage 2 단일 커밋 `fa65ec3` = `Editor.tsx 1줄 fix + tsconfig×2 (각 2줄 추가)` = +6/-1, 3 files. README.md(+175)는 별개 커밋(`e54a6e1`)으로 동일 head에만 동승, Stage 2 자체와 무관.
2. **Editor.tsx 의미 보존 검증**: `return;` → `return undefined;` 두 분기 명시화는 React `useEffect` cleanup 계약상 완전 동치. 분기 자체 추가/제거 없음, cleanup 호출 시점 동일, 동작 변경 0.
3. **재현성 확인**: 로컬에서 `type-check` (EXIT 0), `vitest run` (38 files / 1122 tests passed, 4.92s), `electron-vite build` (main+preload+renderer+3 workers 모두 성공) 전부 PR 주장 그대로 재현. GitHub CI도 SUCCESS.

---

## 산출물 경로

- **본 보고서**: `c:/SourceCode/bms-electron-app/VERIFY-STAGE-2.md`
- 참조: `REFACTOR-PLAN.md`, `VERIFY-STAGE-1.md` (동일 디렉터리)
