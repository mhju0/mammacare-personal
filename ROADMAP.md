# ROADMAP — MammaCare (personal)

> **코드 + 로컬 DB가 1차 진실.** 이 표는 read-only 감사(`git log`/`status`, 코드 읽기, DB 제약 조회)로 갱신한다.
> ✅는 `[Verified]`된 것만. **"코드 완료" ≠ "E2E 검증 완료".** 남은 작업은 **데모 크리티컬 패스 순(P1→P5)**.

## 최종 목표 (North Star)
- 최종 산출물은 **iOS 앱 단독**. 웹 서비스는 제공하지 않는다.
- React/Vite 코드는 **Capacitor iOS 빌드의 소스**이자 **개발 중 브라우저 E2E 도구**로 유지한다.
  삭제 대상은 "웹 서비스 전용 표면"(웹 배포 설정, 마케팅 홈 등)이며, READ-ONLY 인벤토리 후 delete-only 슬라이스로 진행한다.
- **공개 목표: 채용 담당자가 클론 없이 5분 안에 평가할 수 있는 공개 GitHub 저장소.**
  스크린샷 + 데모 GIF가 상단에 박힌 README, 마감된 케이스 스터디, 신규 클론 재현 가능한 SETUP, 1분 데모 영상.
  세부 항목은 하단 **R — GitHub 공개 체크리스트**.

## 현재 위치
- **M0~M3 코드 레벨 완료(전부 2026-06). 실클릭 E2E 0회 — 지금까지 검증은 전부 code-tracing.**
- **warm-kr 디자인 오버홀 진행 중(2026-07)** — 기준 시안 `docs/mocks/warm-kr/`(da248e2), 토큰 레이어 `theme.css:68~`(4bf2fac), Dashboard(42f7622)·Observe(2bd4e2c) 적용 커밋됨. Allergy 포함 나머지 화면 20개는 구 clinic 토큰 그대로 [Verified 2026-07-13, grep].
- **미커밋 WIP 슬라이스 1개** — 식재료 도감(`pages/Ingredients/` 신규 + `/ingredients` 라우트 + 대시보드 진입 링크) + 반응 재테스트 동의 게이트를 `components/ReactionRetestConfirm.tsx`로 추출(Allergy·Ingredients 공유, 카피 verbatim). `pnpm build` 통과 [Verified 2026-07-13]. **동의 게이트 접점 → 커밋 전 NEEDS SENIOR REVIEW.**
- 다음 한 걸음: ① WIP 슬라이스 리뷰 → 커밋, ② **P1 브라우저 E2E 1회차** (`/e2e-check` 스킬 사용). P1이 M3의 done gate.

## 실행 계획 (2026-07-13 grill 확정 — 순서 = 검증 슬라이스마다 push)
> 리포지토리는 이미 public(`github.com/mhju0/mammacare-personal`). 리노베이션 상태가 그대로 노출되므로 **검증된 슬라이스마다 커밋+push**(에이전트 위임 승인). 브랜치는 `main` 유지(솔로 의미 단위 커밋, PR theater 없음).
1. **WIP 슬라이스** — code-reviewer 통과(동의 게이트 접점 → 에스컬레이션 노트) → 커밋 → push. 도감은 **현행 카드 그리드**로 커밋(스탬프는 P3에서 재작업).
2. **P1 E2E** — 에이전트 구동, **신규 테스트 계정+아기**로 데모 스파인+동의 게이트 5체크(**현행 nav** 위에서). 스크린샷 증거 리포트, 심각도 랭크.
3. **P2** — P1 결함 심각도순 수정, 알레르기/DB는 런당 1슬라이스.
4. **Nav 재구성 슬라이스** — mock nav(홈/도감/관찰/리포트/프로필). 관찰 독립 랜딩 + 리포트 전용 라우트 추출 + 일정/커뮤니티/식단/레시피 **detab만(삭제는 P5)**.
5. **P3 폴리시(hybrid, token-only, 런당 1화면)** — 도감 스탬프 그리드 **CSS `StampBadge`(이미지 에셋 없음)**, 알레르기 타임라인, 리포트/음식여권, 동의 다이얼로그 블루 그라디언트 교정, 대시보드 안심문구/큰숫자 타일. **추가 mock 생성 안 함**(hybrid 2장에서 추정).
6. **P4** — iOS 시뮬 스파인 재검증(Capacitor 부팅 실패 시 브라우저 뷰포트 폴백, 폴백 전 보고). 1분 녹화 → GitHub release asset, ~15초 머니모먼트 GIF + 스크린샷 3컷 → README, 케이스 스터디 정량 지표 측정·기입(개인 동기 📌는 오너 몫).
7. **P5** — 데드코드 퍼지(read-only 인벤토리 → delete-only), `_status_from_dates` 단일화, `.npmrc`/`package.json` 불일치, `@capacitor/android`+speech-recognition 의존성 제거. `[PROPOSED CUT]`은 손대지 않음.
8. **R** — 최소 GitHub Actions CI(backend import + `pnpm build`), README 히어로+영어 TL;DR, mermaid 아키텍처, 케이스 스터디 마감, 신규 클론 재현 게이트. About/topics는 오너가 GitHub UI에서.

---

## 완료 (terse history)
- [x] **M0 — 정리 & 탈Azure** (done, 2026-06) — AI/Azure·docker·android·legacy 제거, pnpm 표준화, 이미지 로컬 `backend/uploads/` + `/api/media`.
- [x] **M1 — 디자인 시스템** (done, 2026-06) — 시맨틱 토큰(`theme.css`) + `StatusChip`/`Card`, 신호등 3색, 색 단독 의미 전달 금지.
- [x] **M2 — 홈 대시보드 히어로** (done, 2026-06) — 신호등 카운트·다음 추천·진행바·최근 기록. 빈/로딩/에러 4영역 구현.
- [x] **M3 — 알레르기 플로우 (A안) 코드 레벨** (done, 2026-06) — (baby, ingredient)당 단일 행 + in-place window advance. EXCLUDE 409 가드, SymptomCheck child→parent 삭제+blob 정리, 반응 즉시 빨강, 교차반응 경고(이름 기반 보조), 재테스트 동의 게이트(커밋 `35e0b3d` 확정), `uq_..._baby_ingredient` 제거·EXCLUDE 유지(DB 라이브 확인).
  - ⚠️ **E2E 미검증** — P1 통과 전까지 M3 close 아님.
- [x] 동의 게이트 커밋 확정 여부 재확인 — `35e0b3d` [Verified]
- [x] 이미 빨강 재료 반응 모달 동작 — 동의 게이트로 대응 확인됨

---

## 데모 이후 로드맵

- **Phase 1 (현재)**: M4–M5 + design-polish + 데모 녹화. 현행 스택(FastAPI + 로컬 Postgres) 유지.
- **Phase 2 (데모 후, 확정)**: Docker화(backend + Postgres 로컬 컨테이너), 웹 서비스 표면 인벤토리 → 제거, iOS 빌드 정리.
- **Phase 3 (결정 게이트)**: Supabase 이관 여부 결정. 이관 시 FastAPI/자체 JWT/manual_sql을 Supabase(Postgres/Auth/RLS)로 전면 교체하며, 케이스 스터디의 "로컬 완결/프라이버시/백엔드 역량" 서사를 다시 써야 함. 미이관 시 FastAPI 유지. → 포지셔닝 선택임을 명시.

---

## 남은 작업 — 데모 크리티컬 패스 순

### P1 — 브라우저 E2E 1회차 (M3 close gate) ✅ 2026-07-13 [Verified, 실클릭]
데모 스파인 6/6 PASS · 동의 게이트 4/5 PASS(1 미실행). 신규 계정 `e2etest0713`+아기 지후(10개월)로 실클릭.
- [x] 데모 스파인: 로그인→대시보드 히어로 → 새우 도입 시작(테스트중+1·72h 타임라인·in-progress 행) → 대시보드 "3일 중 1일째"·Observe day stepper Day1 → 반응 기록→즉시 빨강 completed_reaction(반응+1) → 교차반응 경고(새우→게/가재/바닷가재 높음, 낙지/오징어/문어 낮음, SDAP 2.0) → 음식여권 PDF **한글 정상**(JPEG 라스터 육안 확인).
- [x] 동의 게이트: ①빨강(새우) 재제출→ReactionRetestConfirm 다이얼로그 ✓ ②취소→무변경·선택유지 ✓ ④신규(감자)→다이얼로그 안 뜸 ✓ ⑤취소 버튼 시각 무게(solid blue) > 다시 테스트 시작(outline) ✓ / ③초록 재테스트 미실행(completed_safe 재료 필요 — 게이트 스코프는 ①+④로 검증됨).
- [ ] 보너스(재테스트 고아 이미지·미래 예약) — 미실행(P4 iOS 재검증 때).

#### P2 백로그 — P1에서 발견 (심각도순)
- [x] **주소 강제 제거** (30e160f, 오너 결정: 필드 자체 삭제) — 주소 UI·Daum postcode 스크립트·검증 게이트 전부 삭제. 리뷰어 PASS(순수 UI 필드 삭제, 에스컬레이션 불필요). 브라우저 검증: 부모님 정보 → 계정 정보 주소 없이 진행 [Verified 2026-07-13].
- [x] **signup inline `baby_profile` 데드 경로 제거** (5c30b9b) — 스키마/서비스 불일치로 항상 AttributeError→무로그 500이던 도달 불가 분기 삭제(-60줄). 리뷰어 PASS + NEEDS SENIOR REVIEW(auth 경로, 절차상). 검증: import OK · parent-only 201 · baby_profile 포함 요청 500→201 [Verified 2026-07-13].
- [ ] **[Med/이식성] 리포트 PDF 한글 폰트가 시스템 폰트 fallback 의존** (오너 결정: 지금은 보류, Docker 워크스트림 전 처리) — `report.html`은 `font-family:'Pretendard'`인데 `@font-face` 번들 없음. macOS는 AppleSDGothicNeo fallback으로 정상[P1 Verified], **한글 폰트 없는 최소 Linux/Docker 이미지에선 깨짐**.
- [x] ~~대시보드 "진행 중인 테스트" 카드 → Observe 딥링크~~ — 정상. `Dashboard.tsx:271` `onClick navigate(/observe/:id)` + 키보드 핸들러 확인. E2E 좌표 클릭 미스였음(버그 아님).
- [ ] **[Low/P5] 마케팅 홈 "안드로이드 앱 다운로드" 버튼** — android 제거 서사와 모순(P5 데드코드 항목 보강).
- 절차·증거 형식: `.claude/skills/e2e-check/` (체크리스트 포함)

### P2 — E2E 발견 사항 fix pass
- [ ] P1에서 나온 결함 심각도순 수정. 알레르기/DB 로직은 **런당 1슬라이스** (`/ship` 루프).

### P3 — 디자인 폴리시 = 하이브리드 마이그레이션 (데모 3화면 한정, token-only)
기준 시안: **`docs/mocks/hybrid/`** (2026-07-13 오너 확정: warm-kr 셸 + 스탬프 언어는 도감·리포트 한정). 커버리지·미생성 시안·생성 스크립트·외부 레퍼런스는 **`docs/mocks/README.md`**.
- [x] 대시보드 히어로 — warm-kr 적용 커밋됨(42f7622) + 안심문구(c76c0f2) [Verified]
- [x] 알레르기 화면(타임라인 포함) — warm-kr 토큰 마이그레이션 완료: 본문+타임라인(fdccf55), 모달+병원 안내(a3cef58). 시안 없이 hybrid 2장에서 추정(그릴 확정 Q5-d). 두 커밋 reviewer PASS WITH NOTES + 절차적 NEEDS SENIOR REVIEW(제출 핸들러 버튼·삭제 경로 접점 — 핸들러 byte-identical 검증) [Verified 2026-07-13]
- [x] 리포트 화면 — 라우트 추출(1c68181)부터 warm-kr 토큰, hex 0. 음식여권 **스탬프 연출**은 기능 추가라 token-migration 범위 밖 → 선택 항목으로 P4 이후 오너 결정
- [x] 도감 화면 스탬프 그리드 — CSS StampBadge 커밋됨(6cf1f5c) [Verified]
- [x] 동의 다이얼로그 취소 버튼 — clinic-블루 그라디언트 → warm-brand 솔리드(50fe7d7) [Verified]
- [x] BottomNav 재구성 — 홈/도감/관찰/리포트/프로필 5탭 확정·커밋(1c68181) [Verified]
- [x] 전역 스크롤바 thumb clinic-블루(#D9F0FF, globals.css) → `var(--warm-border)` (fdccf55 포함) — 앱 전역 적용
- 절차: `.claude/skills/design-polish/` (hex 하드코딩 게이트 포함), 런당 1화면.
- 데모 경로 밖 화면(Community/Nutrition/Recipes/Schedule 등)은 **폴리시 금지** — P5 퍼지에서 삭제 여부부터 결정한다(삭제할 화면을 재도색하지 않는다).

### P4 — iOS 시뮬레이터 E2E + 패키징
- [x] iOS 시뮬레이터 데모 스파인 재검증 — iPhone 17(iOS 26.1), 로그인→대시보드→도감 스탬프→반응 재료 동의 게이트→관찰→리포트 전부 통과 [Verified 2026-07-13]. 발견 결함 1건 즉시 수정: `viewport-fit=cover` 누락으로 safe-area 미적용(헤더가 Dynamic Island 아래 깔리고 탭바 클리핑) → 4010a62
- [x] 1분 데모 녹화 — `simctl recordVideo` 69.9초, `~/Desktop/mammacare-demo-1min.mp4`. **GitHub release asset 업로드는 오너 몫**(gh CLI 미설치): Releases → new release(tag 예: `v0.9-demo`) → asset 첨부
- [x] 스크린샷 4컷(`docs/screenshots/`: dashboard·ingredients·observe·reports) + 동의 게이트 GIF(~10초) → README 반영 (c0863ca)
- [x] `docs/CASE_STUDY.draft.md` 정량 지표 기입(엔드포인트 112 · 라우트 34 · 재료 145종 등). 개인 동기 📌는 오너 몫, CI 줄은 R 단계에서 갱신 후 `CASE_STUDY.md`로 마감

### P5 — 잔여 위생 (데모 이후, 포트폴리오 저장소 품질)
- [x] `_status_from_dates` 이중 정의 단일화 — services의 사본(+동일 중복이던 `_test_end_date`/`_has_reaction_record`) 삭제, `crud/allergy/ingredient_testing.py` 단일 정의를 import. 두 사본 semantic 동일성 reviewer 검증, 판정 스팟체크 통과 [Verified 2026-07-13]
- [x] `.npmrc` ↔ `package.json` `onlyBuiltDependencies` 불일치 정리 — pnpm 11이 더 이상 읽지 않는 package.json `pnpm` 필드 삭제, `.npmrc`가 단일 진실 (8c05277)
- [x] 잔존 의존성 제거: `@capacitor/android` + `@capacitor-community/speech-recognition` 삭제 — 소스 참조 0건 확인, cap sync 플러그인 5개·SPM 경고 해소 (8c05277)
- [PROPOSED CUT] 대시보드 카운트 dedup 방어 코드 — A안 단일 행으로 구조적 해소, 데모·케이스 스터디 무관
- [PROPOSED CUT] P3 3화면 밖 소소한 UI 폴리시 — 데모에 안 보이는 화면 폴리시는 scope creep
- [PROPOSED CUT] 활성 아기 없을 때 빈 상태 "아기 등록 유도" 보강 — 데모는 아기 등록부터 시작하므로 현행 빈 상태로 충분(P1에서 반증되면 P2로 승격)
- [ ] **Docker 워크스트림** (데모 녹화 이후 착수) — backend(FastAPI)+postgres를 docker-compose로 묶는 재현용 옵션. 로컬 개발 워크플로는 계속 native(루트 `venv` + brew `postgresql@16`), iOS 시뮬레이터 데모도 native localhost 백엔드 사용.
  - 가드레일: compose postgres host 포트는 5432(brew native)·5433(filing-digest docker)와 안 겹치게 별도 포트(예: 5434) 사용.
  - 가드레일: `.env` / JWT·OAuth·Firebase secret / `*.dump`(PII)는 이미지에 굽지 않고 커밋도 안 함 → `.dockerignore`로 제외.
  - 가드레일: Azure/AI/Android 제외는 Docker 도입과 무관하게 계속 유지.
  - 가드레일: 절대 규칙(Alembic 금지, `/api` prefix, RefreshToken 부활 금지, async/httpx/logging only)은 Docker와 무관하게 유지.
- [x] **프론트 dead-code purge** — read-only 인벤토리(Explore) 후 라우트 단위 삭제 완료 [Verified 2026-07-13]: 일정/커뮤니티/식단/레시피 페이지 9파일(~5,500줄) + RecipeScheduleModal + 튜토리얼 webp 16장 + 라우트 5개 삭제. `TimeDropdown`은 `components/`로 이동(Allergy가 사용). 알림 딥링크는 삭제된 라우트로 못 가게 타입 가드(`REMOVED_ROUTE_TYPES`) 추가 — 백엔드 `target_route` passthrough가 /schedule을 계속 심는 것을 리뷰어가 발견해 보강.
  - [x] **[백엔드 후속]** meal_reminder 잡 + 전용 템플릿 제거, Settings의 이유식/커뮤니티 알림 토글 삭제(백엔드 profile 필드는 유지). allergy_check/auto_complete 잡은 byte-identical, 기존 알림 행은 아이콘+/notifications 라우팅으로 계속 렌더 [Verified 2026-07-13]

### R — GitHub 공개 체크리스트 (P4 산출물 이후, 최종 게이트)
> 목표: 채용 담당자가 클론 없이 5분 안에 "잘 만든 프로젝트"라고 판단할 수 있는 저장소.
- [x] README 히어로 재구성 — CI 배지 + 영어 TL;DR + 시뮬레이터 실캡처 3컷 + 동의 게이트 GIF를 최상단에 배치, 주요 화면 표를 새 IA(홈/도감/관찰/리포트)로 갱신 [Verified 2026-07-13]
- [x] 아키텍처 다이어그램 — README에 mermaid 플로차트 추가 (Client → SPA → FastAPI /api → PostgreSQL/uploads) [Verified 2026-07-13]
- [x] `docs/CASE_STUDY.draft.md` → `docs/CASE_STUDY.md` 마감 — 정량 지표·CI 줄 반영, README/CLAUDE.md 링크 갱신. 개인 동기 📌 1곳만 오너 몫으로 잔존
- [x] 비밀값 히스토리 위생 — 전 히스토리에 `.env`/`*.dump`/`*.pem` 추가 이력 없음 [Verified 2026-07-13, `git log --all --diff-filter=A`]
- [x] LICENSE(MIT) 존재(158ac53) + `frontend/package.json` `license: "MIT"` 필드 [Verified 2026-07-13]
- [ ] 저장소 About 1줄 + topics 설정(fastapi, react, typescript, capacitor, allergy-tracking) — GitHub UI에서 수동
- [x] 공개 직전 최종 게이트 — GitHub Actions가 클린 Ubuntu 러너에서 신규 클론 재현을 매 push마다 수행(backend `import app.main` + `tsc --noEmit` + `pnpm build`, run 3124036 green [Verified 2026-07-13]). 데모 스파인은 iOS 시뮬레이터에서 1회 통과(P4). 로컬 DB 덤프 복원 절차는 CI 밖(SETUP.md 수동 경로)
- [ ] **[오너 수동]** 1분 데모 mp4(`~/Desktop/mammacare-demo-1min.mp4`)를 GitHub Release asset으로 업로드

<!-- 갱신 규칙(컨텍스트에 로드되지 않음): 마일스톤 상태 추측 금지. read-only 감사로 [Verified]된 변화만 반영. [PROPOSED CUT]은 삭제하지 말 것 — 오너가 결정한다. -->
