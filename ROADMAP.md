# ROADMAP — MammaCare (personal)

> **코드 + 로컬 DB가 1차 진실.** 이 표는 read-only 감사(`git log`/`status`, 코드 읽기, DB 제약 조회)로 갱신한다.
> 마일스톤 상태: ✅ 완료 / 🟡 진행·부분 / ⬜ 미착수. 추측으로 ✅ 표기 금지 — `[Verified]`된 것만.

## 현재 위치
- **M0~M2 완료. M3는 코드 완료·브라우저 E2E 미검증. M4·M5 미착수.**
- **남은 phase: M3 마무리 + M4 + M5 = 실질 2.5개.**
- 다음 한 걸음: **M3을 닫는 브라우저/iOS 시뮬레이터 E2E 1회차.** (지금까지 검증은 전부 code-tracing, 실클릭 0회)

---

## 마일스톤

### M0 — 정리 & 탈Azure ✅
- AI/Azure 전부 제거(챗봇·AI 식단·STT·NLP·Content Safety·Blob/OpenAI/Speech/Language). docker/android/legacy 제거. pnpm 표준화(`packageManager: pnpm@11.8.0`).
- 이미지: 클라우드 → 로컬 `backend/uploads/` + `/api/media`.
- **Done when:** 로컬에서 AI/클라우드 키 없이 가입→아기→재료→알레르기→리포트 완결 → **충족.**

### M1 — 디자인 시스템 ✅
- 시맨틱 색 토큰(`theme.css`, `:root` + Tailwind `@theme`), `StatusChip`/`Card`/`Button`. 신호등(safe/testing/reaction) + Clinic 블루.
- 접근성: 색만으로 의미 전달 금지(아이콘+텍스트, `aria-label`).
- **Done when:** 토큰 → 컴포넌트 일관 적용 → **충족.**

### M2 — 홈 대시보드(히어로) ✅
- 로그인 + 활성 아기 → 홈을 알레르기 대시보드로 전환(`HomeRoute.tsx`). 신호등 카운트 · 규칙 기반(월령) 다음 도입 추천 · 관찰 진행바 · 최근 기록.
- 빈/로딩/에러 4영역 모두 구현.
- **Done when:** happy + 빈/로딩/에러 동등 설계 → **충족.**

### M3 — 알레르기 플로우 (A안) 🟡 코드 완료, E2E 미검증
- **A안 아키텍처:** (baby, ingredient)당 **단일 행** = 현재 상태. 재테스트는 history 행 생성 없이 **in-place update + window advance.**
- **완료(코드 레벨 검증):**
  - EXCLUDE 충돌 409 가드 (`ex_ingredient_testing_no_overlap`)
  - SymptomCheck child→parent 삭제 + blob 정리(단일 트랜잭션)
  - 반응 기록 시 즉시 `completed_reaction` (72h 대기 없음)
  - 교차반응 경고(이름 기반 보조, 메인 판정은 `ingredient_id`로 분리)
  - 재테스트 동의 게이트(공유 제출 핸들러 인터셉트, `handleAddIngredientClick`)
- **DB 라이브 상태(읽기 전용 확인):** `uq_ingredient_testing_baby_ingredient` **제거됨** / `ex_..._no_overlap`(EXCLUDE) **유지.**
- **Done when:** 데모 스파인이 브라우저/시뮬레이터에서 끊김 없이 동작 → **미충족.**
  - 데모 스파인: 재테스트 → 증상 기록 → 즉시 빨강 → 재도입 **동의 게이트** → 교차반응 경고 → 리포트(PDF/JPG).

### M4 — 보강 & 다듬기 ⬜
- 후보: 코드 위생 항목 정리(아래 "열린 항목"), 활성 아기 없을 때 빈 상태 보강(아기 등록 유도), 소소한 UI 폴리시.
- **Done when:** 위생 항목 정리 + 데모 동선 흠집 제거.

### M5 — 패키징 & 발표 ⬜
- iOS 시뮬레이터 데모 녹화. 스크린샷 3컷(`docs/screenshots/`: 대시보드·알레르기 타임라인·리포트) 채우고 README 주석 해제.
- README / `docs/CASE_STUDY.draft.md` 마감(📌 정량 지표 채우기).
- **Done when:** 포트폴리오로 제출 가능한 상태.

---

## 열린 항목 (추적 — 체크 시 해당 마일스톤에 반영)
- [ ] **브라우저/시뮬레이터 E2E 1회차** — M3을 닫는 게이트
- [ ] 동의 게이트 커밋 확정 여부 재확인
- [ ] `.npmrc` ↔ `package.json` pnpm `onlyBuiltDependencies` 불일치 정리
- [ ] `_status_from_dates` service/crud 이중 정의 단일화
- [ ] 대시보드 카운트 dedup (A안으로 구조적 해소됨 — 방어 코드는 선택)
- [ ] 이미 빨강인 재료에 반응 모달 동작 (동의 게이트로 대응 확인됨)
- [ ] `@capacitor/android` 의존성 잔존 (`android/` 폴더는 제거됨)

<!-- 갱신 규칙(이 주석은 컨텍스트에 로드되지 않음): 마일스톤 상태는 추측 금지. read-only 감사로 [Verified]된 변화만 ✅/🟡/⬜에 반영. "코드 완료"와 "E2E 검증 완료"를 절대 혼동하지 말 것. -->
