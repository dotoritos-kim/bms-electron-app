# BMS 스펙 준수 현황

기준 문서: [BMS command memo (hitkey)](https://hitkey.nekokan.dyndns.info/cmds.htm)
최초 조사: 2026-10-20 · 재조사: 2026-11-07
대상(코드 기준 커밋): `src/` (앱 `d34f7cd`), `vendor/bms-core` (`1398d58`), `vendor/bms-player` (`9415223`), `vendor/bms-editor` (`65a7fce`)

상태 표기: ✅ 지원 · ⚠️ 부분 지원 · ❌ 미지원/무시 · 🐞 스펙과 다르게 동작(버그)
수정된 칸에는 고친 라운드를 `(N차)`로 적는다. 라운드별 내용은 8절 참고.

---

## 1. 요약: 우선순위 버그

| # | 문제 | 위치 | 상태 |
|---|---|---|---|
| 1 | 투명 노트(31-4Z)가 일반 노트로 표시·판정됨 | `src/renderer/routes/Player.tsx` `splitPlayerNotes` | ✅ 1차 수정 |
| 2 | 노트 히트 시 키음 2회 재생 (메인 스레드 캐시 + 워커 `playSound`) | `bms-player/src/game/WorkerGameLoop.ts`, `GameEngine.ts` | ✅ 1차 수정 |
| 3 | `#RANK`/`#DEFEXRANK`/`#TOTAL`이 엔진에 전달되지 않음 → 항상 NORMAL / TOTAL 200 | `src/renderer/routes/Player.tsx` `chartJudgeOptions` | ✅ 1차 수정 |
| 4 | BPM 변화 시 스크롤 속도가 BPM²에 비례 | `bms-core/.../positioning/index.ts` | ✅ 1차 수정 |
| 5 | 최상위 `#SWITCH…#SKIP…#ENDSW` 이후 내용 전부 유실 | `bms-core/.../compiler/controlFlow.ts` | ✅ 1차 수정 |
| 6 | 파일 내 `#SETRANDOM`/`#SETSWITCH` 무시 → 모든 `#IF` 스킵 / 모든 `#CASE` 적용 | `bms-core/.../compiler/index.ts` | ✅ 1차 수정 |
| 7 | 중첩 `#RANDOM`/`#IF`가 부모 스킵 상태 무시, `#CASE` fallthrough 없음, `#DEF` 위치 의존, `#END IF` 미인식, 미선택 분기의 `#WAV`/`#BMP`가 덮어씀 | `controlFlow.ts`, `compiler/index.ts` | ✅ 1차 수정 |
| 8 | `#BPM` 미지정 기본값 불일치: 런타임 60 / UI 130 / 저장 120 (스펙 130) | `timing/index.ts` `DEFAULT_BPM`, `headerWriter.ts`, `useLocalBmsFile.ts` | ✅ 1차 수정 |
| 9 | 지뢰 데미지 `값/256` (스펙 `값/2` %), `ZZ` 즉사 미구현 | `bms-core/.../notes/channels.ts`, `GameEngine.ts` | ✅ 1차 수정 (`#WAV00` 폭발음은 ❌ 미구현) |
| 10 | 10K 레인 불일치 (파서 2P = 8~12열, player/editor 레인 6~10) → 노트 소실·잘못 저장 | `styleStrategy.ts`, player/editor `laneConfig.ts` | ✅ 2차 수정 |
| 11 | EUC-KR 차트가 Shift_JIS/GBK로 오인 (판별 순서) | `bms-core/.../reader/index.ts` | ✅ 2차 수정 |

### 남은 버그 (2026-11-07 기준)

| 문제 | 위치 | 상태 |
|---|---|---|
| LN 끝 키음을 시작 키음으로 덮어써 저장 (파서도 끝 오브젝트 값을 버림) | `bms-core/src/writer/channelWriter.ts` `endValue`, `notes/index.ts` `_handleLongNote` | 🐞 |
| `#PLAYLEVEL`/`#RANK`가 숫자가 아니면 `NaN`으로 저장, `#TOTAL`·`#PLAYLEVEL` 소수점 버림 | `bms-core/src/writer/headerWriter.ts` `formatHeaderValue`, `parseHeadersToData` | 🐞 |
| `#OCT/FP`, `#@BGAxx`가 헤더 정규식(`\w+`)에 걸리지 않아 무시되고 저장 시 유실 | `bms-core/.../compiler/index.ts` `matchers.bms.header` | 🐞 |
| `#WAVCMD`를 에디터 헤더 변환이 ID `CMD`인 WAV 정의로 분류 | `headerWriter.ts` `parseHeadersToData` (`startsWith('wav')`) | 🐞 |
| 원시 헤더 편집을 적용하면 `#STOPxx` 값이 정수로 잘림 | `src/renderer/stores/editorStore.ts` `parseRawHeaderText` (`parseInt`) | 🐞 |

---

## 2. 헤더 명령

| 명령 | 파서 | 플레이어 | 에디터/저장 | 테스트 |
|---|---|---|---|---|
| `#PLAYER` | raw (스타일 판별에 `3`만 사용) | - | 없으면 `#PLAYER 1` 추가 | 있음 |
| `#BASE 62` | ✅ 대소문자 구분 ID (1차) | ✅ | ✅ ID 대소문자 유지 | 있음 |
| `#RANK` | raw | ✅ 0~4 전달 (1차) | ⚠️ UI 0~3만, 없으면 `#RANK 3` 추가, 비숫자 → `NaN` | 있음 |
| `#DEFEXRANK` | raw (앱이 직접 해석). `exrank` 모듈은 ⚠️ 정수만, `0` 거부, 미export | ✅ RANK 2 판정창 × `d/100`, `#RANK`와 공존 시 EOF에 가까운 쪽 (1차) | custom 헤더 | 있음 |
| `#EXRANKxx` + A0 | ⚠️ 미정의 ID 처리 스펙과 다름, 모듈 미export | ❌ | custom 헤더 + A0 채널 보존 (2차) | 저장만 |
| `#TOTAL` | raw | ✅ 전달, 없거나 0 이하면 200 (1차) | ⚠️ 소수점 버림 | 있음 |
| `#VOLWAV` | raw (비표준 `#VOLWAVxx`는 지원) | ✅ | ✅ | 없음 |
| `#STAGEFILE` / `#BANNER` / `#BACKBMP` | raw | ❌ 표시 안 함 | ✅ 필드 | 헤더만 |
| `#PLAYLEVEL` | ⚠️ 문자열 → 0 | ❌ 표시 안 함 | 🐞 문자열 → `NaN`, 소수 버림 | 일부 |
| `#DIFFICULTY` | ✅ | ❌ 표시 안 함 | ✅ | 있음 |
| `#TITLE` / `#SUBTITLE` | ⚠️ 암묵 부제 일부 패턴 누락 | 제목만 | SUBTITLE 다중 → 마지막만 | 있음 |
| `#ARTIST` / `#SUBARTIST` | ✅ | ARTIST만 | SUBARTIST 다중 → 마지막만 | ARTIST만 |
| `#GENRE` / `#GENLE` | GENLE 별칭 미지원 | ✅ | ✅ | GENRE만 |
| `#MAKER` / `#COMMENT` | raw | - | COMMENT 다중 → 마지막만 | 없음 |
| `#TEXTxx` / `#SONGxx` | ⚠️ Text 모듈 미export | ❌ | custom 헤더 + 99 채널 보존 (2차) | 저장만 |
| `#PATH_WAV` | raw, 경로에 미적용 | ❌ | custom | 없음 |
| `#BPM` | ✅ 기본 130 (1차) | ✅ (1차) | ✅ 없으면 `#BPM 130` 기록 (1차). 새 차트 기본값은 120 | 있음 |
| `#BASEBPM` | raw. 스크롤 위치에 쓰지 않음 (1차), `effectiveSpeed` 비율 계산에만 사용 | ✅ (1차) | custom | 있음 |
| `#BPMxx` | ✅ | ✅ | ✅ | 있음 |
| `#EXBPMxx` | ✅ 08 채널이 `#BPMxx` 다음으로 조회 (3차) | ✅ (3차) | ✅ `#BPMxx`로 기록 (3차) | 있음 |
| `#STOPxx` | ✅ 소수 OK, 음수는 되감기로 처리 | ✅ | ✅ (원시 헤더 편집 적용 시 🐞 정수로 잘림) | 소수만 |
| `#STP` | raw | ❌ | 다중 → 마지막만 (스펙은 누적) | 없음 |
| `#LNTYPE 1` | ⚠️ LN 끝 키음 폐기 | ⚠️ 끝까지 홀드해도 GREAT | 🐞 끝 키음을 시작 키음으로 덮어씀 | 일부 |
| `#LNTYPE 2` | ✅ MGQ 표기 (3차) | ✅ (3차) | ✅ RDM 표기 + `#LNTYPE 1`로 저장 (3차) | 있음 |
| `#LNOBJ` | ⚠️ 1개만 | ✅ | ⚠️ 1개만 | 단일만 |
| `#LNMODE` | raw | ❌ 항상 CN | custom | 없음 |
| `#4K` / `#6K` / `#8K` (Qwilight 확장, 값 없음) | ✅ 값 없는 명령 보존, `BMSHeaders.has()` (4차) | ✅ 모드 레인 밖 노트 제외 (4차) | ✅ 키 모드에 맞춰 추가·제거, IIDX SP 채널로 저장 (4차) | 있음 |
| `#KEYMODE` | raw | ✅ 키 모드 판별에 사용 | ✅ 키 모드와 동기화 (4차) | 있음 |
| `#OCT/FP` | 🐞 헤더 정규식(`\w+`) 불일치로 무시 | ❌ | 유실 | 없음 |
| `#WAVxx` | ✅ (base-36/62) | ✅ 확장자 폴백 .ogg>.wav>.flac>.mp3>.m4a | ✅ | 있음 |
| `#WAV00` | - | ❌ 지뢰 폭발음 미재생 | 무음 취급 | 없음 |
| `#EXWAVxx` / `#WAVCMD` | raw / raw (키음 표에는 안 들어감) | ❌ | custom / 🐞 ID `CMD`인 WAV 정의로 분류 | 없음 |
| `#BMPxx` / `#EXBMPxx` | raw | ❌ BGA 미구현 | ✅ / custom | 없음 |
| `#BGAxx` / `#@BGAxx` | ⚠️ 모듈 미export / 🐞 `@` 정규식 불일치로 무시 | ❌ | custom / 유실 | 없음 |
| `#POORBGA` `#SWBGAxx` `#ARGBxx` `#VIDEO*` `#MOVIE` `#CHARFILE` `#MIDIFILE` `#CDDA` `#SEEKxx` `#CHANGEOPTIONxx` `#OPTION` `#ExtChr` `#MATERIALS*` `#DIVIDEPROP` `#PREVIEW` | raw | ❌ (크래시 없음) | custom, 관련 채널(05, A1~A6) 보존 (2차) | 05만 |
| `#CHARSET` | 무시 | - | custom | 없음 |
| 주석 (`#` 아닌 줄) | ✅ / 인라인 `//` 미처리 | - | 원본 주석 미보존 | no-throw만 |

## 3. 제어 흐름

파서가 `Math.random`으로 분기를 확정하므로 **로드할 때마다 다른 분기**가 선택되고, 에디터 저장 시 선택된 분기만 평탄화되어 **나머지 분기와 `#RANDOM` 구조가 영구 유실**된다. Home/Player/Editor가 각자 파싱하므로 화면마다 다른 분기가 될 수 있다. (2026-11-07 기준 변함없음)

| 명령 | 상태 | 테스트 |
|---|---|---|
| `#RANDOM` | ⚠️ 로드 시 확정. `#random5`(구분자 없음), `#RONDAM` 인식 (1차) | 있음 |
| `#SETRANDOM` | ✅ (1차) | 있음 |
| `#IF` / `#ELSEIF` / `#ELSE` | ✅ 중첩 시 부모 스킵 반영 (1차) | 있음 |
| `#ENDIF` / `#END IF` / `#IFEND` | ✅ (1차) | 있음 |
| `#ENDRANDOM` | ✅ (생략 허용) | 있음 |
| 중첩 `#RANDOM` | ✅ 미선택 분기 안의 `#RANDOM`은 난수를 쓰지 않음 (1차) | 있음 |
| `#SWITCH` / `#CASE` | ✅ fallthrough (1차) | 있음 |
| `#SETSWITCH` | ✅ (1차) | 있음 |
| `#SKIP` / `#ENDSW` | ✅ 최상위 `#ENDSW` 뒤 파싱 재개, `#IF` 안 닫히지 않은 `#SWITCH`는 `#ENDIF`가 함께 닫음 (1차) | 있음 |
| `#DEF` | ✅ `#CASE` 앞에 있어도 동작, fallthrough 진입 (1차) | 있음 |

## 4. 채널

| 채널 | 파서 | 플레이어 | 저장 | 테스트 |
|---|---|---|---|---|
| 01 BGM (다중 행) | ✅ 마디 안 `#xxx01` 줄 순서(`bgmLine`) 기록 (4차) | ✅ | ✅ 파일은 다시 채워 쓰고, 에디터 BGM 레인 배치는 `.bms.meta`에 보관 | 있음 |
| 02 마디 길이 | ✅ (≤0 → 1) | ✅ | ✅ | 있음 |
| 03 BPM (hex) | ✅ | ✅ | ✅ | 있음 |
| 04 / 06 / 07 BGA | raw | ❌ | ✅ 보존 | 없음 |
| 05, 0A, 0B~0E, 97, 98, A1~A6 | raw | ❌ | ✅ 원본 보존 (2차) | 05·97만 |
| 08 exBPM / 09 STOP | ✅ `#EXBPMxx` 포함 (3차) | ✅ | ✅ | 있음 |
| 99 TEXT / A0 JUDGE | ⚠️ 모듈 미export | ❌ | ✅ 원본 보존 (2차) | 저장만 |
| 11-19 / 21-29 | ✅ | ⚠️ 키 바인딩은 스크래치+1~7키뿐 (DP 2P, PMS 8·9키 불가) | ✅ | 있음 |
| 1A-1Z / 2A-2Z (확장) | ⚠️ 열 매핑 없음 | ❌ BGM으로 재생 | ✅ 원본 보존, 더 이상 01로 저장하지 않음 (2차) | 저장만 |
| 17 / 27 풋 페달 | ⚠️ 많으면 키보드 모드로 오판 | ❌ 레인 없음, 항상 MISS | ✅ | 없음 |
| 31-4Z 투명 | ✅ (1x/2x로 정규화) | ✅ 노트차트에서 제외 (1차) | ✅ | 있음 |
| 51-6Z LN | ✅ (`#LNTYPE 2` 포함, 3차) | ⚠️ | ⚠️ 끝 키음 유실 | 있음 |
| D1-D9 / E1-E9 지뢰 | ✅ 데미지 `값/2`%, `ZZ` 즉사 (1차) | ✅ 데미지 0은 무해 (1차). `#WAV00` 폭발음 ❌ | ✅ | 있음 |

## 5. 키 모드

| 모드 | 플레이어 | 에디터 |
|---|---|---|
| 4K / 6K / 8K (Qwilight U_E, `#4K`/`#6K`/`#8K`로 구분) | ✅ 4K `11,12,14,15` · 6K `11,12,13,15,18,19` · 8K `16`(일반 키)+`11-15,18,19`. 다른 레인 노트는 제외 (4차) | ✅ 같은 채널로 저장, 다시 열어도 모드 유지 (4차) |
| 5K / 7K | ✅ | ✅ |
| 10K | ✅ 2P = 열 `8`~`12`, `SC2` (2차) | ✅ 21~26 채널로 저장 (2차) |
| 14K (DP) | ⚠️ 2P측·SC2는 오토플레이만 | ✅ |
| PMS 9K | ⚠️ 8·9키 바인딩 불가 | ✅ |
| PMS BME-type | ⚠️ 레인 순서 스펙과 다름 | ⚠️ |
| PMS 5버튼 | ⚠️ 7K로 인식 | ⚠️ |
| DSC / OCT / FP | ⚠️ DP로 처리 | ⚠️ |

## 6. 인코딩·파일

| 항목 | 상태 | 테스트 |
|---|---|---|
| Shift_JIS 읽기 | ✅ | 있음 |
| EUC-KR 읽기 | ✅ 점수 비교로 판별 (2차) | 있음 |
| 저장 인코딩 | ✅ 원본 인코딩·BOM 유지, 불가능하면 UTF-8(BOM) + 경고 (3차) | 있음 |
| BOM / CRLF / 소문자 헤더 / 전각 공백 | ✅ (전각 `＃` 미지원) | CRLF, BOM |
| 비ASCII 키음 파일명 | ✅ 디렉터리 목록 기반 대소문자 무시 매칭 | 없음 |

---

## 7. 테스트 공백

### 구조적 문제
- 앱 CI(`.github/workflows/ci.yml`, `test.yml`)는 `tests/unit`, `tests/integration`, `tests/compatibility`만 실행. vendor 패키지 테스트(판정 테이블, 게이지, 제어 흐름, writer 등)는 각 패키지 저장소에서만 돈다.
- bms-core의 `parser` / `extreme` / `stress` / `writer` 테스트는 `INTEGRATION=1` + `S:/` 드라이브의 실제 차트가 필요 → CI에서 사실상 미실행.
- `tests/e2e/player.spec.ts`는 존재하지 않는 `C:\test\song.bms`를 열고 "Rendering Error" 부재만 확인 → 에러 화면에서도 통과.
- ~~`compiler-controlFlow.test.ts`가 스펙과 다른 동작을 기대값으로 고정~~ → 1차에서 기대값 수정, `compiler-controlFlow-spec.test.ts` 추가.

### 구현은 있으나 테스트 없음
- 엔진 LN 머리/꼬리 판정 및 자동 처리
- `#VOLWAV` 마스터 볼륨, `#VOLWAVxx`, `parseVolWav`
- 음수 STOP 되감기, 런타임 소수 STOP
- 에디터 저장 후 BGA 이벤트 유지
- `#RANDOM` 로드별 분기 선택 / 에디터 평탄화
- 클리어 판정·결과 화면

2026-11-07 기준 테스트가 생긴 항목: 엔진 지뢰 판정·데미지(`bms-player/tests/workerKeysound.test.ts`), 워커 모드 키음 캐시(같은 파일), `#BASEBPM`/BPM 스크롤(`bms-core/tests/positioning-bpm.test.ts`).

### 스펙 항목인데 테스트 전무
`#EXRANKxx`(판정 적용), 채널 0A~0E·98·A1~A6, 풋 페달 17, PMS 5버튼/BME-type, 다중 `#LNOBJ`, LN 끝 키음, 0 BPM, 음수 STOP, 소문자 헤더(파서), 전각 공백.

2026-11-07 기준 테스트가 생긴 항목: `#SETRANDOM`, `#SETSWITCH`, 중첩 `#RANDOM`, `#END IF`, `#DEFEXRANK`, `#RANK 4`, 채널 05·97·99·A0과 확장 레인 1A(저장 보존), `#LNTYPE 2`, BOM, EUC-KR.

---

## 8. 수정 진행 기록

| 날짜 | 항목 | 내용 |
|---|---|---|
| 2026-10-20 | - | 문서 작성, 1차 수정 착수 (#1~#9) |
| 2026-10-20 | #1 투명 노트 | `Player.tsx` `splitPlayerNotes`: 투명 노트를 notechart에서 제외 (키음 프리로드는 `#WAV` 테이블 기준이라 영향 없음) |
| 2026-10-20 | #3 판정/게이지 | `Player.tsx` `chartJudgeOptions`: `#RANK`(0~4), `#TOTAL` 전달. `#DEFEXRANK`는 엔진에 그대로 전달 (2026-10-21 `JudgmentEngine` 식 수정 후 적용) |
| 2026-10-20 | #2 키음 2회 | keyDown 메시지에 `playedKeysound {keysound, offset}` 추가. 워커는 판정 노트의 키음이 메인에서 이미 재생된 것과 같을 때만 생략 |
| 2026-10-20 | #8 BPM 기본값 | `DEFAULT_BPM = 130` (timing, writer) |
| 2026-10-20 | #9 지뢰 | 데미지 `base36/2`%, `ZZ` → `LANDMINE_INSTANT_GAMEOVER`(Infinity) → 모든 게이지에서 즉시 실패 |
| 2026-10-20 | #5~#7 제어 흐름 | `controlFlow.ts` 단일 프레임 스택으로 재작성: 중첩 스킵, `#SETRANDOM`/`#SETSWITCH`, fallthrough, `#DEF`(IIDXv 방식), `#END IF`/`#IFEND`/`#RONDAM`/구분자 생략, 미선택 분기 `#WAV`/`#BMP` 무시 |
| 2026-10-20 | #4 BPM² 스크롤 | 확인됨. `positioning` BPM 정규화 제거 → position = beat × SCROLL. 에디터 뷰어 그리드도 박 기준으로 바뀜 |
| 2026-10-21 | 후속 DEFEXRANK | `JudgmentEngine`: 활성 스타일 RANK 2 판정창 × `d/100` (bad 창은 유지). `Player.tsx`가 defexrank를 그대로 전달 |
| 2026-10-21 | 후속 RANK/DEFEXRANK 순서 | `BMSHeaders.order(name)` 추가 (마지막 정의의 파일 내 순서). `chartJudgeOptions`는 둘 다 유효하면 EOF에 가까운 쪽을 사용 |
| 2026-10-21 | 후속 지뢰 데미지 0 | `GameEngine`: 데미지 0은 그대로 0 (무해한 지뢰). 데미지 정보가 없는 노트차트만 5% 대체 |
| 2026-10-21 | 후속 `#TOTAL < 100` | `GameEngine`: 100 클램프 제거. 없거나 0 이하/비유한 값만 기본값 200 |
| 2026-10-21 | 후속 MISS 키음 중복 | `GameEngine`: 빈 입력(또는 다른 노트 판정)에서 메인 스레드가 미리 재생한 다음 노트를 기억해 해당 노트 MISS 시 다시 울리지 않음 |
| 2026-10-21 | 후속 `#ENDSW` 누락 | `controlFlow.endIf`: `#SWITCH` 프레임을 넘어 `#IF`를 찾아 닫음 (`#IF` 안의 닫히지 않은 `#SWITCH`도 함께 닫힘) |
| 2026-10-21 | 후속 난이도 추정 | 앱 `estimateDifficulty`: 투명 노트 제외 |
| 2026-10-21 | 후속 공개 export | bms-core에서 `DEFAULT_BPM`, `LANDMINE_INSTANT_GAMEOVER`, `calculateLandmineDamage` export. 앱 파서 경로의 `130` 하드코딩을 `DEFAULT_BPM`으로 교체 |
| 2026-10-21 | 테스트 | `keysoundPlayerAdapter.test.ts`를 `chokeGroup`/`catchUp` 옵션과 `#BASE 62` 대소문자 유지에 맞춰 갱신 |
| 2026-10-21 | 2차 #10 10K 레인 | player `LANE_CONFIG_10K_2P`와 editor `10K` 레인을 파서와 같은 열(2P = `8`~`12`, `SC2`)로 변경. 2P 노트가 표시·판정되고, 저장 시 21~26 채널로 기록됨 |
| 2026-10-21 | 2차 #11 EUC-KR | `reader`: UTF-8을 엄격하게 먼저 시도한 뒤, 레거시 인코딩 중 오류 없이 디코딩되는 것들의 "텍스트다움" 점수(자주 쓰는 한글 음절, 가나, 한자 등)를 비교해 가장 높은 쪽 선택. 동점이면 기존 순서(Shift-JIS 우선). 로컬 차트 15개에서 결과 동일 |
| 2026-10-21 | 3차 `#EXBPMxx` | 08 채널이 `#BPMxx` 다음으로 `#EXBPMxx`를 조회. 저장 시 `#BPMxx`로 기록 |
| 2026-10-21 | 3차 `#LNTYPE 2` | MGQ 표기 LN 파싱(`notes/mgq.ts`). 저장은 RDM 표기 + `#LNTYPE 1` |
| 2026-10-21 | 3차 저장 인코딩 | `BMSParser.encoding`/`bom` + `encodeText` → 에디터가 원본 인코딩으로 저장, 불가능하면 UTF-8(BOM) + 경고. IPC `file:saveBms`/`file:saveAs`가 바이트도 받음 |
| 2026-10-21 | 2차 저장 시 채널 유실 | `EditableBMSChart.extraObjects` 추가: 에디터가 다루지 않는 채널(05, 0A~0E, 97/98, 99 TEXT, A0 JUDGE, A1~A6, 확장 레인 1A~2Z 등)을 원본 그대로 보관하고 저장 시 원래 해상도로 다시 기록. 열 매핑이 없는 레인 오브젝트는 더 이상 BGM(01)으로 저장되지 않음 |
| 2026-10-26~27 | 4차 4K/6K/8K | Qwilight U_E(Yuipack) 모드를 값 없는 `#4K`/`#6K`/`#8K`로만 구분 (`#6K 1`처럼 값이 있으면 명령 아님). writer가 값 없는 custom 헤더를 보존하고 `BMSHeaders.has()` 추가. 4K/6K/8K는 항상 IIDX SP 채널로 저장(8K는 16 = 맨 왼쪽 일반 키). 플레이어는 모드에 레인이 없는 채널의 노트를 Qwilight처럼 제외. `#KEYMODE`도 키 모드와 동기화 (bms-core `9cedf82`·`25525de`, bms-player `803869b`, bms-editor `156faa9`, 앱 `90b867f`·`c9065a3`) |
| 2026-11-05 | 4차 BGM 줄 순서 | 파서가 BGM 오브젝트마다 마디 안 몇 번째 `#xxx01` 줄인지(`bgmLine`, 전부 `00`인 줄 포함) 기록. 에디터는 이를 BGM 레인으로 펼쳐 보여 주고 배치는 `.bms.meta`에 보관. 저장 파일의 01 채널은 이전처럼 다시 채워 씀 (bms-core `1398d58`, 앱 `b5ce6be`) |
| 2026-11-07 | 재조사 | 2~6절 표를 현재 코드 기준으로 갱신. 남은 버그 표 추가. `#WAVCMD` 파서 칸 정정: 키음 표(`KeySounds`)는 `wav` 뒤 두 글자만 받으므로 처음부터 오인하지 않았고, 오인은 에디터 헤더 변환(`parseHeadersToData`) 쪽 |

### 1차 수정 후 후속 과제
- ✅ (2026-10-21 처리) `JudgmentEngine` DEFEXRANK 판정창을 활성 스타일의 RANK 2 판정창 × `d/100`으로 변경하고, `Player.tsx`는 defexrank를 그대로 전달. `defexrankToRank` 근사 제거.
- ✅ (2026-10-21) `#RANK`와 `#DEFEXRANK` 공존 시 "EOF에 가까운 쪽 우선": `BMSHeaders.order()`로 구현.
- ✅ (2026-10-21) `GameEngine` 지뢰 데미지 0 → 5% 대체 제거.
- ✅ (2026-10-21) `GameEngine` `#TOTAL < 100` 클램프 제거 (작은 TOTAL도 그대로 사용).
- ✅ (2026-10-21) 선재생된 노트 키음이 MISS 처리 시 한 번 더 울리던 문제.
- ✅ (2026-10-21) `#IF` 안 `#SWITCH`에 `#ENDSW`가 없을 때 `#ENDIF`가 둘 다 닫음.
- ✅ (2026-10-21) `estimateDifficulty` 투명 노트 제외.
- ✅ (2026-10-21) `DEFAULT_BPM`, `LANDMINE_INSTANT_GAMEOVER` 공개 export.

### 2차 라운드 (2026-10-21)
- ✅ #10 10K 레인 불일치: player/editor 10K 2P 레인을 열 `8`~`12`로 통일.
- ✅ #11 EUC-KR 판별 순서: "처음 오류 없는 인코딩" 대신 점수 비교로 판별.
- ✅ 에디터 저장 시 채널 유실: `extraObjects`로 비편집 채널 원본 보존.
- 확인 결과 `08` EXBPM 이벤트는 이미 보존되고 있었음 (`#BPMxx` 정의 + 08 채널로 기록). 2절 표의 "`#EXBPMxx`"는 `#EXBPM` 헤더 자체를 08 채널에서 참조하지 않는 파서 문제이며 별도 항목 (3차에서 처리).

### 3차 라운드 (2026-10-21)
- ✅ `#EXBPMxx`: 스펙상 `#BPMxx`의 별칭(nanasi 등). 08 채널이 `#BPMxx`가 없으면 `#EXBPMxx`를 조회 (`extendedBpmHeader`). 파서 타이밍, 앱/에디터 BPM 표시, 저장(`#BPMxx`로 기록) 모두 반영.
- ✅ `#LNTYPE 2` (MGQ 표기): 0이 아닌 오브젝트가 이어지는 동안 LN이 계속되고 다음 `00`에서 닫힘, 마디 경계를 넘어 이어짐(스펙 예제 기준). 파서와 에디터 로드 모두 지원하고, 저장 시에는 RDM 표기(`#LNTYPE 1`)로 기록.
- ✅ 저장 시 원본 인코딩 유지: 읽을 때 판별한 인코딩(Shift_JIS, EUC-KR, GBK, Big5, Windows-1251, UTF-8 BOM 여부)을 기억해 같은 인코딩으로 저장. 편집으로 원본 인코딩에 없는 문자가 들어가면 UTF-8(BOM)로 저장하고 경고 토스트 표시. 인코더 표는 런타임 `TextDecoder`에서 만들어 의존성 없이 읽기와 쓰기가 일치.
  - 주의: Node(ICU)의 `euc-kr` 디코더는 CP949 확장 음절(예: 똠)을 모름. Electron(Chromium)은 지원하며, 인코더 표가 런타임 디코더에서 만들어지므로 어느 쪽이든 읽기·쓰기가 서로 맞음.
  - 자동 저장(`.autosave`)은 UTF-8 텍스트로 유지하고, 복구할 때 원본 인코딩으로 다시 저장.

### 4차 라운드 (2026-10-26 ~ 2026-11-05)
- ✅ Qwilight 4K/6K/8K: 값 없는 확장 명령으로 판별·저장, 모드별 채널 배치, 플레이어 레인 제외 규칙.
- ✅ BGM `#xxx01` 줄 순서 보존(`bgmLine`): 에디터 BGM 레인 표시용. 저장 파일의 01 채널 배치는 바뀌지 않음.

### 보류 (스펙상 정의가 없거나 구현마다 다름)
- 풋 페달(17/27): 스펙상 17은 FREE-ZONE이 원래 의미이고, 풋 페달·18KEYS 버튼·9KEYS(BME-type) 버튼으로 쓰는 것은 구현마다 다름. 현재처럼 `FZ` 열로 유지.
- PMS 5버튼: 스펙 문서에 별도 채널 배치 정의 없음 (9KEYS BMS-DP / BME-SP / 18KEYS만 정의).
- PMS BME-type(11-15, 18, 19, 16, 17): `.pms` 확장자 정보가 파서까지 오지 않아 BMS 7K/IIDX와 구분할 근거가 없음. 확장자 전달이 먼저 필요.
- 확장 레인(1A~2Z) 표시·편집: 스펙상 pomu2 등 일부 구현의 확장이고 열 배치 정의가 없음. 2차에서 저장 시 보존까지만 처리.
- 2~6절 표는 2026-11-07 재조사 결과다. 이후 수정은 8절 표에 기록하고 해당 칸에 `(N차)`를 붙인다.
