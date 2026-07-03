# ROADMAP — MammaCare (personal)

> **코드 + 로컬 DB가 1차 진실.** 이 표는 read-only 감사(`git log`/`status`, 코드 읽기, DB 제약 조회)로 갱신한다.
> ✅는 `[Verified]`된 것만. **"코드 완료" ≠ "E2E 검증 완료".** 남은 작업은 **데모 크리티컬 패스 순(P1→P5)**.

## 현재 위치
- **M0~M3 코드 레벨 완료(전부 2026-06). 실클릭 E2E 0회 — 지금까지 검증은 전부 code-tracing.**
- 다음 한 걸음: **P1 브라우저 E2E 1회차** (`/e2e-check` 스킬 사용). 이것이 M3의 done gate.

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

## 남은 작업 — 데모 크리티컬 패스 순

### P1 — 브라우저 E2E 1회차 (M3 close gate)
- [ ] 데모 스파인 실클릭: 아기 등록→대시보드→도입 시작→3일 진행바→반응 기록→즉시 빨강→교차반응 경고→음식 여권 PDF(한글 폰트)
- [ ] 동의 게이트 5체크(빨강 재제출 다이얼로그·취소 무변경·재테스트 진행·초록 안 뜸·신규 안 뜸·취소 버튼 시각 무게)
- [ ] 보너스: 재테스트 후 잔존 SymptomCheck/고아 이미지 0, 미래 예약 테스트 즉시 확정 안 됨
- 절차·증거 형식: `.claude/skills/e2e-check/` (체크리스트 포함)

### P2 — E2E 발견 사항 fix pass
- [ ] P1에서 나온 결함 심각도순 수정. 알레르기/DB 로직은 **런당 1슬라이스** (`/ship` 루프).

### P3 — 디자인 폴리시 (3화면 한정, token-only)
- [ ] 대시보드 히어로
- [ ] 알레르기 타임라인
- [ ] 리포트 화면
- 절차: `.claude/skills/design-polish/` (hex 하드코딩 게이트 포함). 알려진 위반: 동의 다이얼로그 인라인 hex 그라디언트 `frontend/src/pages/Allergy/index.tsx:2644`.

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

<!-- 갱신 규칙(컨텍스트에 로드되지 않음): 마일스톤 상태 추측 금지. read-only 감사로 [Verified]된 변화만 반영. [PROPOSED CUT]은 삭제하지 말 것 — 오너가 결정한다. -->
