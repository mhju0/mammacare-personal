# manual_sql — 수동 DB 변경 관리

이 디렉토리는 **Alembic 등 자동 마이그레이션 도구를 쓰지 않는** 정책 하에서,
ORM 모델(`create_all()`)로 표현할 수 없거나 표현하지 않는 DB 스키마 변경을
**손으로 관리**하기 위한 곳이다.

대표적으로 다음과 같은 변경이 여기에 들어온다.

- `btree_gist` 기반 **EXCLUDE 제약**처럼 SQLAlchemy 모델로 두지 않고 직접 SQL로
  관리하는 제약.
- 모델에 선언이 없는 **잔재 제약/인덱스의 제거**(예: `uq_ingredient_testing_baby_ingredient`).
- 데이터 정리/백필 등 1회성 운영 SQL.

이런 "직접 관리(direct-managed)" 제약/스키마는 **모델 코드가 아니라 이 디렉토리**에서
다룬다. 모델(`__table_args__`)에는 의도를 설명하는 주석만 남기고, 실제 DDL은 여기에 둔다.

## 파일 네이밍 규칙

```
NNN_<의미가-드러나는-설명>.sql
```

- `NNN` = 적용 순서를 나타내는 3자리 0패딩 번호(`001`, `002`, …).
- 뒤에는 무엇을 하는지 한눈에 보이는 영어 kebab 설명.
- 예: `001_drop_ingredient_testing_full_unique.sql`

## 적용 절차

1. **psql 접속**
   ```bash
   psql "$DATABASE_URL"
   ```
2. **파일 실행** (별도 셸에서 `-f` 로 실행해도 된다)
   ```bash
   psql "$DATABASE_URL" -f backend/manual_sql/001_drop_ingredient_testing_full_unique.sql
   ```
3. **pre/post 검증 결과 확인**
   각 파일은 변경 전(`[pre]`)·후(`[post]`) 상태를 `SELECT` 로 출력한다.
   기대값이 맞는지 **눈으로 확인**한다.
4. **수동 COMMIT / ROLLBACK**
   파일은 `BEGIN … COMMIT` 으로 감싼다. 검증 결과가 기대와 다르면
   COMMIT 대신 `ROLLBACK;` 으로 되돌린다. 확실히 검증한 뒤에만 커밋한다.

## 원칙

- **멱등성(idempotent)**: 같은 파일을 여러 번 실행해도 안전해야 한다.
  `DROP ... IF EXISTS`, `CREATE ... IF NOT EXISTS` 등을 사용한다.
  신규 DB(이미 깨끗한 상태)에서 돌려도 에러 없이 통과해야 한다.
- **최소 침습**: 한 파일은 한 가지 변경만 다룬다. 건드리지 않아야 할 제약/인덱스는
  파일 안에서 언급조차 하지 않는다(예: EXCLUDE 제약 `ex_ingredient_testing_no_overlap`은
  보존 대상이므로 DROP 대상 파일에서 절대 언급하지 않는다).
- **검증 우선**: 변경 전후 상태를 SELECT 로 남겨, 적용 결과를 항상 확인 가능하게 한다.
- **되돌리기 명시**: 각 파일 헤더 주석에 되돌리는 SQL을 적어 둔다.
