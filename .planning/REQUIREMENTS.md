# Requirements — v1.1 에디터 UI 개선 — 미니맵 & 패널

## Milestone Goal

에디터 오른쪽에 수직 미니맵 사이드바를 추가하고, 타임라인 북마크·레이어 패널 UI를 완성한다.

---

## v1.1 Requirements

### 미니맵 (MINI)

- [ ] **MINI-01**: 에디터 우측에 수직 사이드바 미니맵 컴포넌트가 표시된다
- [ ] **MINI-02**: 미니맵을 클릭하면 해당 위치로 에디터 뷰포트가 이동한다
- [ ] **MINI-03**: 현재 뷰포트 영역이 미니맵에 반투명 팟(박스)으로 표시된다
- [ ] **MINI-04**: 마디별 노트 밀도가 densityMap.ts 색상으로 시각화된다

### 타임라인 북마크 (BK)

- [ ] **BK-01**: 북마크가 미니맵/타임라인에 마커로 표시된다
- [ ] **BK-02**: 북마크 마커를 클릭하면 해당 위치로 이동한다
- [ ] **BK-03**: 우클릭 또는 단축키로 북마크를 추가/삭제할 수 있다

### 레이어 패널 (LAYER)

- [ ] **LAYER-01**: 레이어 패널에서 각 레이어(playable/invisible/landmine/bgm)의 가시성을 토글할 수 있다
- [ ] **LAYER-02**: 레이어별 잠금(locked) 상태를 토글할 수 있다
- [ ] **LAYER-03**: 레이어별 불투명도(opacity)를 슬라이더로 조절할 수 있다

---

## Future Requirements (Deferred)

- 미니맵 드래그 스크롤 (클릭 이동만 v1.1 대상)
- 미니맵 줌 레벨 표시
- 북마크 이름 편집 UI (renameBookmark 액션은 있음)
- 레이어 커스텀 이름 지정

## Out of Scope

- 미니맵 Three.js 렌더러 — Canvas 2D로 구현 (경량)
- 북마크 파일 저장 — .bms.meta 사이드카에 저장 (기존 IPC 활용)

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| MINI-01 | TBD | pending |
| MINI-02 | TBD | pending |
| MINI-03 | TBD | pending |
| MINI-04 | TBD | pending |
| BK-01 | TBD | pending |
| BK-02 | TBD | pending |
| BK-03 | TBD | pending |
| LAYER-01 | TBD | pending |
| LAYER-02 | TBD | pending |
| LAYER-03 | TBD | pending |
