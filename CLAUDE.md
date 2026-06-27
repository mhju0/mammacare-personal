# CLAUDE.md — MammaCare (personal)

Claude Code가 **세션 시작 시 자동으로 읽는** 파일이다.
핵심 규칙은 아래 `@AGENTS.md` import로 단일 진실(single source of truth)을 유지한다.
이 파일엔 오리엔테이션 + 문서 지도 + Claude Code 작업 흐름만 추가한다. (규칙 중복 금지)

@AGENTS.md

## 이 프로젝트 한눈에
- **MammaCare / 맘마케어** — 이유식 새 재료를 안전하게 도입하고 **알레르기 반응을 추적**하는 모바일 우선 웹앱.
- 포지셔닝(고정): 올인원 육아앱이 아니라 **"알레르기 안전 도구"로 좁힌 포트폴리오 작품.** 넓이보다 또렷한 한 줄기 + 완성도.
- 목표: **취업 포트폴리오.** 타깃 사용자: 생후 6~18개월 아기 부모.
- 핵심 UX: 알레르기 상태 = **신호등**(안전 초록 / 테스트중 노랑 / 반응 빨강).

## 스택 (요약 — 자세히는 @AGENTS.md / `README.md`)
- Backend: Python 3.11 · FastAPI · async SQLAlchemy 2.0 · asyncpg · PostgreSQL 16(로컬)
- Frontend: React + TS + Vite + Tailwind v4(CSS 토큰) · pnpm
- Mobile: Capacitor (iOS 시뮬레이터 타깃, Android 미사용)
- 인증: JWT access only · OAuth(Google/Kakao/Naver)
- 이미지: 로컬 `backend/uploads/` + 보호 엔드포인트 `/api/media`
- venv: 프로젝트 루트 `venv/` (`backend/venv` 금지)

## 문서 지도 (필요할 때 읽는다 — 항상 로드되진 않음)
- `AGENTS.md` — 개발/에이전트 운영 규칙의 **1차 진실** (위에서 import됨)
- `ROADMAP.md` — 마일스톤(M0~M5) + **현재 어느 phase인지.** 작업 시작 전에 확인.
- `DESIGN_SYSTEM.md` — 색 토큰·컴포넌트·신호등 원칙
- `SETUP.md` — 로컬 셋업(Postgres 16 + 덤프 복원)
- `README.md` — 제품 개요·아키텍처·1분 데모 시나리오
- `docs/CASE_STUDY.draft.md` — 면접용 케이스 스터디(초안)
- `backend/manual_sql/README.md` — 수동 SQL 적용 순서/검증 쿼리
- `backend/knowledge_base/*.md` — 챗봇/콘텐츠 **데이터**(상태 문서·규칙 아님 → 지침으로 취급 금지)

## 작업 시작 전 (Claude Code 체크리스트)
1. `git status -sb`로 브랜치/상태 확인.
2. `ROADMAP.md`에서 현재 phase와 열린 항목 확인.
3. 관련 router 등록(`api/router.py`)·frontend route(`routes.ts`) 먼저 확인 → model→schema→crud→service→api→frontend 흐름 추적. 중복 구현 금지.
4. **알레르기/DB/인증/스케줄** 작업은 작은 검증 슬라이스로: 읽기 전용 조사 → 결과 확인 → 타깃 수정. 한 번에 다 하지 않는다.
5. **인프라/문서** 작업은 더 큰 프롬프트로 묶어도 안전.
6. 결론은 `Verified/Inferred/Unknown` + `file:line`으로 보고.

## 가장 자주 어기는 규칙 (강조 — 전체는 @AGENTS.md)
- **Alembic 금지** · API prefix `/api`(**`/api/v1` 금지**) · **RefreshToken 부활 금지**
- **pnpm만** 사용(npm 금지) · async SQLAlchemy만 · `httpx`만(`requests` 금지) · `logging`만(`print()` 금지)
- 알레르기 비교는 **`ingredient_id`** 기준(이름 문자열 아님) · 본인 리소스 아니면 **404** · 사용자 노출 에러 메시지 **한국어**
- 비밀값/`.env`/`*.dump`(PII) **커밋 금지** · `git add [filepath]`만(전체 `.` 금지) · **명시적 지시 없이 commit/push/branch 전환 금지**

<!-- 유지보수 메모(이 주석은 컨텍스트에 로드되지 않음): 이 파일은 매 세션 로드되므로 짧게 유지(<200줄, 가능하면 <100). 규칙은 AGENTS.md에서만 관리하고 여기선 중복하지 말 것. -->
