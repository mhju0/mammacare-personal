-- =============================================================================
-- 002_notification_baby_id_drop_not_null.sql
-- -----------------------------------------------------------------------------
-- 목적:
--   notification.baby_id 컬럼의 NOT NULL 제약을 제거한다(nullable 화).
--   현재 notification.baby_id 는 NOT NULL 이라, 아기가 없는 부모(baby-less)는
--   커뮤니티 알림(댓글/좋아요/신고 등 baby 와 무관한 알림)을 받지 못한다.
--   커뮤니티 알림 생성자 4곳은 _get_first_baby_id 로 아무 baby_id 나 끌어오되,
--   None 이면 경고 로그만 남기고 알림 자체를 skip 한다(= 알림 유실).
--   baby_id 를 nullable 로 바꾸면 baby 없는 부모도 baby_id=NULL 로 알림을 받는다.
--
--   컬럼 타입/FK 변경이 아니라 NOT NULL 만 푸는 것이므로 기존 데이터는 그대로 유지된다.
--   create_all() 은 기존 컬럼의 NOT NULL 을 자동으로 완화하지 않으므로, 모델의
--   nullable=True 선언만으로는 로컬 DB 가 바뀌지 않는다 → 이 수동 SQL 이 반드시 필요.
--
-- 작성일: 2026-07-05
--
-- 주의(매우 중요):
--   * 스케줄러 경로(meal_reminder/allergy_check)는 항상 실제 baby_id 를 전달하므로
--     이 변경의 영향을 받지 않는다(NULL 을 넣지 않음). 이 파일은 baby_id 컬럼의
--     NOT NULL 만 제거할 뿐, FK/타입/다른 제약/인덱스는 전혀 건드리지 않는다.
--   * 기존 알림 행은 백필하지 않는다(과거 유실 알림 복구 없음). 이 변경은
--     "앞으로 생성될" 커뮤니티 알림에만 영향을 준다.
--
-- 적용 방법(psql, 검증 결과 직접 확인 후 수동 COMMIT 권장):
--   psql "$DATABASE_URL" -f backend/manual_sql/002_notification_baby_id_drop_not_null.sql
--
--   이 파일은 BEGIN ~ COMMIT 으로 감싸져 있다. pre/post 검증 SELECT 결과를 눈으로
--   확인하고 싶다면, 마지막 COMMIT 줄을 잠시 주석 처리한 뒤 -f 로 실행하여 출력만
--   확인하고, 별도 psql 세션에서 수동으로 COMMIT/ROLLBACK 하는 방식을 써도 된다.
--   기본 실행(아래 그대로)은 검증 SELECT 를 출력하면서 트랜잭션을 COMMIT 한다.
--
-- 되돌리는 법(필요 시 재적용):
--   ALTER TABLE notification ALTER COLUMN baby_id SET NOT NULL;
--   (단, baby_id=NULL 인 행이 이미 존재하면 SET NOT NULL 이 실패한다.
--    되돌리려면 먼저 NULL 행을 정리하거나 삭제해야 한다.)
-- =============================================================================

BEGIN;

-- [pre] 적용 전 상태 검증:
--   is_nullable = 'NO'  → baby_id 가 현재 NOT NULL 임(제거 대상, 정상)
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'notification'
  AND column_name = 'baby_id';

-- 멱등 완화: 이미 nullable 인 환경에서도 에러 없이 통과한다.
-- FK(baby_user.id, ondelete=CASCADE)/타입/인덱스는 그대로 유지된다.
ALTER TABLE notification
    ALTER COLUMN baby_id DROP NOT NULL;

-- [post] 적용 후 상태 검증:
--   is_nullable = 'YES'  → baby_id 가 nullable 로 완화됨(성공)
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'notification'
  AND column_name = 'baby_id';

-- 검증 결과(post 의 is_nullable='YES')를 확인한 뒤 커밋한다.
-- 만약 결과가 기대와 다르거나 의심스러우면 COMMIT 대신 ROLLBACK 하라:
--   ROLLBACK;
COMMIT;
