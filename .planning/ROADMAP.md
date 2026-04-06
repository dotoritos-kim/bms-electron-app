# Roadmap — BMS Editor (bms-electron-app)

## Milestones

- ✅ **v1.0 파일 로딩 프리징 버그 수정** — Phases 1-5 (shipped 2026-04-06)
- ✅ **v1.1 에디터 UI 개선 — 미니맵 & 패널** — Phases 6-7 (shipped 2026-04-06)

## Phases

<details>
<summary>✅ v1.0 파일 로딩 프리징 버그 수정 (Phases 1-5) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: BMS Parser Worker (1/1 plan) — 2026-04-06 (2c49ec1)
- [x] Phase 2: AudioPreloader Abort (1/1 plan) — 2026-04-06 (bms-player: 41fd339)
- [x] Phase 3: Editor Graceful Shutdown (1/1 plan) — 2026-04-06 (76d118e)
- [x] Phase 4: scanDir 병렬화 (1/1 plan) — 2026-04-06 (b88ffa2)
- [x] Phase 5: 회귀 테스트 (1/1 plan) — 2026-04-06 (c2205c6)

Archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

---

### ✅ v1.1 에디터 UI 개선 — 미니맵 & 패널 (SHIPPED 2026-04-06)

**Milestone Goal:** 에디터 우측에 수직 미니맵 사이드바를 추가하고, 타임라인 북마크·레이어 패널 UI를 완성한다.

- [x] **Phase 6: 수직 미니맵 사이드바** — 클릭 이동·뷰포트 팟·밀도 히트맵·북마크 마커를 갖춘 Canvas 2D 미니맵 컴포넌트
- [x] **Phase 7: 북마크 추가/삭제 UI + 레이어 패널** — 북마크 생성·삭제 단축키 및 레이어별 가시성·잠금·opacity 조절 패널

## Phase Details

### Phase 6: 수직 미니맵 사이드바
**Goal**: 에디터 우측에 수직 Canvas 2D 미니맵이 표시되고, 클릭으로 이동하며, 뷰포트 위치와 노트 밀도가 시각화된다
**Depends on**: Phase 5 (v1.0 complete — densityMap.ts, MinimapBridge, bookmark store actions all exist)
**Requirements**: MINI-01, MINI-02, MINI-03, MINI-04, BK-01, BK-02
**Success Criteria** (what must be TRUE):
  1. 에디터 우측에 수직 미니맵 사이드바가 항상 표시된다
  2. 미니맵의 임의 위치를 클릭하면 에디터 뷰포트가 해당 마디로 즉시 이동한다
  3. 현재 화면에 보이는 범위가 미니맵에 반투명 팟(박스)으로 표시되며 스크롤에 따라 움직인다
  4. 마디별 노트 밀도가 densityMap.ts 색상(저밀도→고밀도 그라디언트)으로 시각화된다
  5. 저장된 북마크가 미니맵 위에 마커로 표시되고, 해당 마커를 클릭하면 그 위치로 이동한다
**Plans**: 1 plan
Plans:
- [ ] 06-01-PLAN.md — Minimap density bar + bookmark text + showMinimap toggle
**UI hint**: yes

### Phase 7: 북마크 추가/삭제 UI + 레이어 패널
**Goal**: 에디터에서 북마크를 직접 추가·삭제할 수 있고, 레이어별 가시성·잠금·불투명도를 패널 UI로 제어할 수 있다
**Depends on**: Phase 6
**Requirements**: BK-03, LAYER-01, LAYER-02, LAYER-03
**Success Criteria** (what must be TRUE):
  1. 현재 커서 위치에 우클릭 메뉴 또는 단축키로 북마크를 추가하고, 기존 북마크를 삭제할 수 있다
  2. 레이어 패널에서 playable·invisible·landmine·bgm 각 레이어의 눈 아이콘을 클릭해 가시성을 토글할 수 있다
  3. 레이어 패널에서 각 레이어의 잠금 아이콘을 클릭해 잠금 상태를 토글하면 해당 레이어 노트를 편집할 수 없다
  4. 레이어 패널에서 각 레이어의 슬라이더를 드래그해 불투명도(0~1)를 조절하면 에디터 캔버스에 즉시 반영된다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. BMS Parser Worker | v1.0 | 1/1 | Complete | 2026-04-06 |
| 2. AudioPreloader Abort | v1.0 | 1/1 | Complete | 2026-04-06 |
| 3. Editor Graceful Shutdown | v1.0 | 1/1 | Complete | 2026-04-06 |
| 4. scanDir 병렬화 | v1.0 | 1/1 | Complete | 2026-04-06 |
| 5. 회귀 테스트 | v1.0 | 1/1 | Complete | 2026-04-06 |
| 6. 수직 미니맵 사이드바 | v1.1 | 1/1 | Complete | 2026-04-06 |
| 7. 북마크 추가/삭제 UI + 레이어 패널 | v1.1 | 1/1 | Complete | 2026-04-06 |
