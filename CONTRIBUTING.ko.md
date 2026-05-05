# BMS Desktop 컨트리뷰션 가이드

기여를 검토해 주셔서 감사합니다. 모든 PR이 머지 전에 통과해야 하는 실무
체크 사항을 정리합니다.

🇬🇧 [English guide](CONTRIBUTING.md)

## PR 작성 전 체크

1. **`main` 브랜치에서 분기**. `feat/`, `fix/`, `chore/` prefix 사용.
2. **타입 검사**: `npm run type-check` 통과.
3. **테스트**: `npm test` 통과. 버그 수정 시 회귀 테스트 추가 필수.
4. **린트**: 린터 경고는 머지 차단.
5. **i18n 위생**:
   - `src/shared/i18n/locales/` 밖에 한국어/외국어 리터럴 금지.
     `scripts/eslint-no-hardcoded-korean.cjs` 룰이 CI에서 차단합니다.
     `npm run i18n:check`로 로컬에서 미리 확인 가능합니다.
   - 새 사용자 노출 문자열은 활성화된 모든 로케일의 적절한 네임스페이스
     (`common`, `app`, `errors`)에 키를 동시에 추가하세요. 빈 값은 CI 실패.

## i18n 기여

현재 활성화 로케일은 `ko`, `en` 두 개이며 `ja`, `zh`, `es`, `de`, `ru`는
인프라는 갖춰져 있지만 `ENABLED_LOCALES`에서 제외되어 있습니다.

| 작업 | 필요 리뷰어 |
| --- | --- |
| `ko` / `en`에 새 키 추가 | 메인테이너 리뷰만 |
| 기존 `ko` / `en` 번역 갱신 | 메인테이너 리뷰만 |
| **ko/en 외 언어** 추가 / 갱신 | 해당 언어 **원어민 2명** |
| `ENABLED_LOCALES`에 언어 추가 | 메인테이너 + 원어민 2명, 키 커버리지 ≥95% PR 요구 |

기계 번역(DeepL, Claude 등) 결과물은 **사람 검수의 베이스**로만 환영
받습니다 — 최종 커밋이 될 수 없습니다. 그런 PR은 `needs-native-review`
라벨을 붙여 주세요.

### 새 키 추가 절차

1. `ko` JSON에 키 추가 (예: `src/shared/i18n/locales/ko/app.json`).
2. `en` JSON에 동일 키 영문 작성. 키 트리는 평행 유지.
3. 다른 로케일은 비워 두면 CI가 placeholder 또는 번역을 요청.
4. 코드에서 `t('namespace:key.path')`로 참조. 인라인 금지.

### 라이브러리 패키지(`bms-editor`, `bms-player`)

라이브러리는 `react-i18next`에 의존하지 **않습니다**. 컨슈머가 채우는
`I18nProvider` Context를 노출합니다 ([bms-editor/I18N.md](
../bms-editor/I18N.md), [bms-player/I18N.md](../bms-player/I18N.md) 참조).
라이브러리 내부에 키를 추가할 때:

1. `src/i18n/defaults.ts`에 영문 기본값으로 추가.
2. 호출부에서 `useI18n().t('your.key')` 사용.
3. 패키지 minor 버전 bump (추가는 minor, 제거/이름변경은 major).
4. 컨슈머(이 저장소)의 동일 namespace locale JSON에 동일 키 추가.

## 문서

- 외부 공개 문서(`README.md`, `CONTRIBUTING.md`, `docs/en/*`)는 **영문이
  source of truth**. 한국어 번역(`README.ko.md`, `docs/ko/*`)은 같은
  PR에서 갱신하거나 `docs-translation-pending` 라벨을 붙여 주세요.
- `.planning/**` 내부 문서는 한국어 단일 — 외부 산출물이 아닌 작업 노트입니다.
- 번역 문서는 frontmatter `last_synced: <commit-sha>` 필드를 가지며,
  `scripts/docs-drift-check` 잡이 drift를 경고합니다.

## 코드 스타일

- TypeScript `strict` 모드 (이미 활성화). 좁은 타입 우선, 설명 없는
  `any` 추가 금지.
- React 컴포넌트는 prop drilling 회피 — 가로축 관심사는 Context 사용
  (`useTranslation()` / `useI18n()`이 좋은 예).
- IPC 채널은 `src/shared/ipc-contract.ts`에 정의. 신규 채널 추가 시
  `IpcInvokeMap` / `IpcSendMap`에 선언하고 preload에서 노출. 렌더러에서
  raw `ipcRenderer.invoke(...)` 호출 금지.

## 커밋 / PR 스타일

- 명령형 (`add`, `fix`, `refactor`).
- PR은 작고 한 가지에 집중. 리팩토링과 기능은 별도 PR.
- 릴리스는 태그 기반. 기능 PR에서 `package.json` 버전을 올리지 마세요.

## 이슈 보고

근본 원인이 `bms-core` / `bms-player` / `bms-editor`에 있는 경우 해당
sibling 저장소에 등록해 주세요. 패키지 경계를 넘거나 셸에 한정된 이슈는
이 저장소에 등록합니다.
