# AGENTS.md — MammaCare (personal)

이 문서는 `mammacare-personal`에서 작업하는 사람과 AI 코딩 에이전트를 위한 운영 가이드다.
코드가 동작의 1차 진실, 로컬 DB schema가 제약의 1차 진실이다. 문서가 다르면 코드+DB를 먼저 확인하고 문서를 갱신한다.

## 프로젝트 개요

- 맘마케어 솔로 포트폴리오 버전. **이유식 알레르기 안전 추적 도구**로 집중.
- Backend: `backend/app` FastAPI (async SQLAlchemy + PostgreSQL 16 로컬).
- Frontend: `frontend` React + TS + Vite + Tailwind (pnpm).
- 모바일: Capacitor, iOS 시뮬레이터 타깃.
- **제거됨(부활 금지)**: AI 챗봇, AI 식단, STT, NLP(Global STT), Content Safety, Azure Blob/OpenAI/Speech/Language.
- 이미지: 로컬 `backend/uploads/` + 보호 엔드포인트 `/api/media`.

## 로컬 실행

```bash
# backend
cd backend && source ../venv/bin/activate && uvicorn app.main:app --reload
# frontend
cd frontend && pnpm install && pnpm dev
```
최소 검증:
```bash
cd backend && ../venv/bin/python -c "import app.main"
cd frontend && pnpm build
```

## 폴더 구조 (요약)

```
backend/app/main.py        FastAPI entry/lifespan(create_all)/scheduler
backend/app/api/           routers (/api 아래 mount)
backend/app/services/      business logic, schedulers
backend/app/crud/          DB helpers
backend/app/models/        SQLAlchemy ORM
backend/app/schemas/       Pydantic models
backend/app/core/          config, deps, security, storage, limiter
backend/manual_sql/        수동 DB 변경 SQL
backend/uploads/           로컬 이미지 (gitignore)
frontend/src/api/          API wrappers + apiFetch
frontend/src/pages/        feature pages
frontend/src/context/      AppContext (auth/baby state)
```

## 핵심 규칙

- **API**: 모든 라우터 `/api` 아래. `/api/v1` 금지. 현재 사용자 `/api/users/me`(`/api/auth/me` 금지).
- **DB**: Alembic 금지. 구조 변경은 `backend/manual_sql/`의 수동 SQL + 적용 순서 + 검증 쿼리(`BEGIN/COMMIT`, pre/post SELECT). `create_all()`은 컬럼 타입/FK/enum/제약을 자동 변경하지 않는다.
- **Auth**: JWT access token만. RefreshToken 부활 금지. OAuth는 fragment(`#`) 토큰 전달, HMAC state, last-login-method 보존.
- **코드**: async만, `httpx`만, `logging`만. 라우터 얇게. 에러 메시지 한국어. 본인 리소스 아니면 404.
- **보안**: 비밀값/데이터 커밋 금지. `.env`, secret, key, `.pem` 절대 출력/커밋 안 함. DB 덤프(`*.dump`)는 PII이므로 gitignore 처리(로컬/외장 보관만).
- **Git**: 명시적 지시 없이 commit/push/branch 전환 금지. `git add [filepath]`(전체 `.` 지양). 솔로지만 의미 단위 커밋.

## 알레르기 규칙 (최우선)

- 알레르기 안전이 최고 심각도다. 알레르겐 필터 실패는 Critical.
- 알레르기 비교는 이름 문자열이 아니라 `ingredient_id`로.
- 알레르기 테스트 생성은 사용자가 고른 재료 기준(수동). 같은 아기가 완료 재료를 **재테스트할 수 있어야 함**.
- 동시 진행 테스트는 겹치면 안 됨(`ex_ingredient_testing_no_overlap` EXCLUDE).
- **재테스트 제약**: `uq_ingredient_testing_baby_ingredient`(full unique)가 재테스트를 막던 문제는 수동 SQL로 **제거 완료**(EXCLUDE는 유지·검증됨). 같은 재료 재테스트는 앱 레벨에서 "재료당 1행" in-place update(window advance)로 처리한다.

## 에이전트 작업 절차

1. `git status -sb`로 브랜치/상태 확인.
2. 관련 router 등록(`api/router.py`)과 frontend route(`routes.ts`) 먼저 확인.
3. backend 변경은 model→schema→crud→service→api→frontend caller 함께 추적.
4. DB 변경은 `create_all()` 한계 고려해 수동 SQL 필요 여부 판단.
5. 알레르기/알림/스케줄 작업은 insert 경로, dedup key, unique/EXCLUDE 제약 확인.
6. 가장 작은 안전 검증 실행, 못한 검증은 보고.
7. 결론은 `Verified/Inferred/Unknown` + `file:line`로 보고.
