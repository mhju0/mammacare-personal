-- =============================================================================
-- 001_drop_ingredient_testing_full_unique.sql
-- -----------------------------------------------------------------------------
-- 목적:
--   ingredient_testing 테이블의 잔재 UNIQUE 제약
--   uq_ingredient_testing_baby_ingredient (UNIQUE(baby_id, ingredient_id)) 를 제거한다.
--   이 제약은 "한 아기 + 한 재료" 조합을 전체 기간에 걸쳐 단 1번만 허용하므로,
--   알레르기 재테스트(같은 재료를 나중에 다시 테스트)를 영구히 막는다.
--   해당 제약은 ORM 모델(__table_args__)에 선언이 없는 잔재이므로,
--   1회 DROP 하면 create_all() 이 다시 만들지 않는다(영구 제거).
--
-- 작성일: 2026-06-26
--
-- 주의(매우 중요):
--   * EXCLUDE 제약 ex_ingredient_testing_no_overlap 은 "한 아기당 동시 1개"라는
--     별개의 불변식을 강제한다. 이 파일은 그 제약을 절대 건드리지 않는다(미언급).
--   * 다른 제약/인덱스(ix_ingredient_testing_baby_ingredient 등)도 손대지 않는다.
--
-- 적용 방법(psql, 검증 결과 직접 확인 후 수동 COMMIT 권장):
--   psql "$DATABASE_URL" -f backend/manual_sql/001_drop_ingredient_testing_full_unique.sql
--
--   이 파일은 BEGIN ~ COMMIT 으로 감싸져 있다. pre/post 검증 SELECT 결과를 눈으로
--   확인하고 싶다면, 마지막 COMMIT 줄을 잠시 주석 처리한 뒤 -f 로 실행하여 출력만
--   확인하고, 별도 psql 세션에서 수동으로 COMMIT/ROLLBACK 하는 방식을 써도 된다.
--   기본 실행(아래 그대로)은 검증 SELECT 를 출력하면서 트랜잭션을 COMMIT 한다.
--
-- 되돌리는 법(필요 시 재생성):
--   ALTER TABLE ingredient_testing
--     ADD CONSTRAINT uq_ingredient_testing_baby_ingredient UNIQUE (baby_id, ingredient_id);
--   (단, 재생성은 재테스트를 다시 막으므로 의도적으로만 수행할 것.
--    중복 행이 이미 존재하면 ADD CONSTRAINT 가 실패한다.)
-- =============================================================================

BEGIN;

-- [pre] 적용 전 상태 검증:
--   uq_present = 1  → 제거 대상 UNIQUE 제약이 현재 존재함(정상)
--   ex_present = 1  → 유지해야 할 EXCLUDE 제약이 현재 존재함(정상, 건드리지 않음)
SELECT
    (SELECT count(*) FROM pg_constraint
       WHERE conname = 'uq_ingredient_testing_baby_ingredient') AS uq_present,
    (SELECT count(*) FROM pg_constraint
       WHERE conname = 'ex_ingredient_testing_no_overlap')      AS ex_present;

-- 멱등 DROP: 이미 제거된 환경(신규 DB 등)에서도 에러 없이 통과한다.
-- EXCLUDE 제약은 여기서 언급하지 않으므로 그대로 유지된다.
ALTER TABLE ingredient_testing
    DROP CONSTRAINT IF EXISTS uq_ingredient_testing_baby_ingredient;

-- [post] 적용 후 상태 검증:
--   uq_present = 0  → UNIQUE 제약이 제거됨(성공)
--   ex_present = 1  → EXCLUDE 제약은 여전히 존재함(보존 확인)
SELECT
    (SELECT count(*) FROM pg_constraint
       WHERE conname = 'uq_ingredient_testing_baby_ingredient') AS uq_present,
    (SELECT count(*) FROM pg_constraint
       WHERE conname = 'ex_ingredient_testing_no_overlap')      AS ex_present;

-- 검증 결과(post 의 uq_present=0, ex_present=1)를 확인한 뒤 커밋한다.
-- 만약 결과가 기대와 다르거나 의심스러우면 COMMIT 대신 ROLLBACK 하라:
--   ROLLBACK;
COMMIT;
