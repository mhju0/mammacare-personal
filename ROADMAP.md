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
- [ ] **[Med/UX] 회원가입이 주소를 강제** — 주소 검색 팝업(외부 우편번호 서비스)이 이 환경에서 **빈 화면**으로 뜸 → UI 신규가입 불가. API는 `SignupRequest.address: str | None`(선택)이므로 **프론트 단독 강제**. 알레르기 도구가 집 주소를 받는 것 자체가 불필요 PII(포지셔닝/프라이버시 서사와 충돌). **결정 필요: 주소 필드 제거 vs 선택화.** (auth 터치 → NEEDS SENIOR REVIEW)
- [ ] **[Med] signup의 inline `baby_profile` 경로 항상 500** — `auth_service.signup`이 `baby_payload.birth_year/feeding_status/photo/height…`를 읽지만 `BabyCreate`엔 `birth_date/…`만 존재 → AttributeError를 bare `except`가 **로그 없이** 삼킴. 실제 UI는 signup 전에 baby_profile을 떼고 `/babies`로 따로 생성하므로 **도달 불가 데드코드**지만 landmine + 무로그. 조치: `SignupRequest.baby_profile` 필드 + 죽은 분기 제거, 또는 그 except에 로깅. (auth/schema 터치 → NEEDS SENIOR REVIEW)
- [ ] **[Med/이식성] 리포트 PDF 한글 폰트가 시스템 폰트 fallback 의존** — `report.html`은 `font-family:'Pretendard'`인데 `@font-face` 번들 없음. macOS는 AppleSDGothicNeo로 fallback되어 정상이지만, **한글 시스템 폰트 없는 최소 Linux/Docker 이미지에선 깨짐**. Docker 워크스트림 전 `@font-face`로 한글 폰트 번들 필요.
- [x] ~~대시보드 "진행 중인 테스트" 카드 → Observe 딥링크~~ — 정상. `Dashboard.tsx:271` `onClick navigate(/observe/:id)` + 키보드 핸들러 확인. E2E 좌표 클릭 미스였음(버그 아님).
- [ ] **[Low/P5] 마케팅 홈 "안드로이드 앱 다운로드" 버튼** — android 제거 서사와 모순(P5 데드코드 항목 보강).
- 절차·증거 형식: `.claude/skills/e2e-check/` (체크리스트 포함)

### P2 — E2E 발견 사항 fix pass
- [ ] P1에서 나온 결함 심각도순 수정. 알레르기/DB 로직은 **런당 1슬라이스** (`/ship` 루프).

### P3 — 디자인 폴리시 = 하이브리드 마이그레이션 (데모 3화면 한정, token-only)
기준 시안: **`docs/mocks/hybrid/`** (2026-07-13 오너 확정: warm-kr 셸 + 스탬프 언어는 도감·리포트 한정). 커버리지·미생성 시안·생성 스크립트·외부 레퍼런스는 **`docs/mocks/README.md`**.
- [x] 대시보드 히어로 — warm-kr 적용 커밋됨(42f7622) [Verified]
- [ ] 알레르기 화면(타임라인 포함) — 최대 잔여 화면. 시안 미생성(크레딧 소진) → `docs/mocks/generate-remaining.sh`부터
- [ ] 리포트 화면(음식 여권, 스탬프 언어) — 시안 미생성(크레딧 소진) → 상동
- [ ] 도감 화면을 스탬프 그리드 시안(`hybrid/ingredients.png`)에 맞게 재해석 — WIP 카드 그리드의 후속
- [ ] 동의 다이얼로그 취소 버튼의 clinic-블루 그라디언트(`--action-soft-bg`, theme.css:60) — warm-kr 세계관과 불일치. 구 "인라인 hex 위반"은 토큰화로 해소됨 [Verified 2026-07-13]
- [ ] BottomNav 재구성 결정 — 시안은 Home/Ingredients/Observe/Reports/Profile 5탭, 현재 `Layout.tsx`는 메뉴/일정/홈/알레르기/커뮤니티. P5 데드코드 퍼지와 함께 결정(오너 결정 사항)
- 절차: `.claude/skills/design-polish/` (hex 하드코딩 게이트 포함), 런당 1화면.
- 데모 경로 밖 화면(Community/Nutrition/Recipes/Schedule 등)은 **폴리시 금지** — P5 퍼지에서 삭제 여부부터 결정한다(삭제할 화면을 재도색하지 않는다).

### P4 — iOS 시뮬레이터 E2E + 패키징
- [ ] iOS 시뮬레이터에서 데모 스파인 1회 재검증
- [ ] 1분 데모 녹화
- [ ] 스크린샷 3컷(`docs/screenshots/`: 대시보드·알레르기 타임라인·리포트) → README 주석 해제
- [ ] `docs/CASE_STUDY.draft.md` 정량 지표(📌) 채우고 마감

### P5 — 잔여 위생 (데모 이후, 포트폴리오 저장소 품질)
- [ ] `_status_from_dates` 이중 정의 단일화 — `services/allergy_service.py:28` / `crud/allergy/ingredient_testing.py:96` (그 전까지 둘 다 수정 필수, reviewer가 강제)
- [ ] `.npmrc` ↔ `package.json` `onlyBuiltDependencies` 불일치 정리 — 현재 완전 disjoint(`.npmrc`: tailwind-oxide/esbuild vs pkg: firebase-util/protobufjs). 신규 클론 재현성 문제.
- [ ] 잔존 의존성 제거: `@capacitor/android`(package.json:13), `@capacitor-community/speech-recognition`(:12) — "android/STT 제거" 케이스 스터디 서사와 모순
- [PROPOSED CUT] 대시보드 카운트 dedup 방어 코드 — A안 단일 행으로 구조적 해소, 데모·케이스 스터디 무관
- [PROPOSED CUT] P3 3화면 밖 소소한 UI 폴리시 — 데모에 안 보이는 화면 폴리시는 scope creep
- [PROPOSED CUT] 활성 아기 없을 때 빈 상태 "아기 등록 유도" 보강 — 데모는 아기 등록부터 시작하므로 현행 빈 상태로 충분(P1에서 반증되면 P2로 승격)
- [ ] **Docker 워크스트림** (데모 녹화 이후 착수) — backend(FastAPI)+postgres를 docker-compose로 묶는 재현용 옵션. 로컬 개발 워크플로는 계속 native(루트 `venv` + brew `postgresql@16`), iOS 시뮬레이터 데모도 native localhost 백엔드 사용.
  - 가드레일: compose postgres host 포트는 5432(brew native)·5433(filing-digest docker)와 안 겹치게 별도 포트(예: 5434) 사용.
  - 가드레일: `.env` / JWT·OAuth·Firebase secret / `*.dump`(PII)는 이미지에 굽지 않고 커밋도 안 함 → `.dockerignore`로 제외.
  - 가드레일: Azure/AI/Android 제외는 Docker 도입과 무관하게 계속 유지.
  - 가드레일: 절대 규칙(Alembic 금지, `/api` prefix, RefreshToken 부활 금지, async/httpx/logging only)은 Docker와 무관하게 유지.
- [ ] **프론트 정리 방향** — 전면 rebuild 안 함, delete-only. 구 웹 서비스 잔재는 라우트 단위 삭제로 정리해 iOS 중심 경험으로 좁힌다.
  - Frontend dead-code purge 워크스트림: 데모 경로(로그인→대시보드 히어로→알레르기→리포트)에서 도달 불가능한 구 웹 서비스 페이지/라우트/컴포넌트를 식별해 라우트 단위로 삭제. 실제 삭제는 별도 READ-ONLY 인벤토리 후 진행 — 이번엔 방향만 기록.

### R — GitHub 공개 체크리스트 (P4 산출물 이후, 최종 게이트)
> 목표: 채용 담당자가 클론 없이 5분 안에 "잘 만든 프로젝트"라고 판단할 수 있는 저장소.
- [ ] README 히어로 재구성 — 스크린샷 3컷 + 데모 GIF를 최상단에, 그 아래 **영어 TL;DR 1문단**(비한국어 리뷰어용) 추가, 한국어 본문은 유지
- [ ] 아키텍처 다이어그램 1장 — README 내 mermaid 코드블록이면 충분(이미지 파일 불필요)
- [ ] `docs/CASE_STUDY.draft.md` → `docs/CASE_STUDY.md` 마감 (P4의 정량 지표 채움과 동일 항목)
- [x] 비밀값 히스토리 위생 — 전 히스토리에 `.env`/`*.dump`/`*.pem` 추가 이력 없음 [Verified 2026-07-13, `git log --all --diff-filter=A`]
- [x] LICENSE(MIT) 존재(158ac53) + `frontend/package.json` `license: "MIT"` 필드 [Verified 2026-07-13]
- [ ] 저장소 About 1줄 + topics 설정(fastapi, react, typescript, capacitor, allergy-tracking) — GitHub UI에서 수동
- [ ] 공개 직전 최종 게이트 — 신규 클론에서 `SETUP.md` 그대로 재현: backend import + `pnpm build` + 데모 스파인 1회

<!-- 갱신 규칙(컨텍스트에 로드되지 않음): 마일스톤 상태 추측 금지. read-only 감사로 [Verified]된 변화만 반영. [PROPOSED CUT]은 삭제하지 말 것 — 오너가 결정한다. -->
