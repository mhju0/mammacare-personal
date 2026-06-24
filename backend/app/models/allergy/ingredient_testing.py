import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


if TYPE_CHECKING:
    from app.models.baby_user import BabyUser
    from app.models.ingredient import Ingredient
    from app.models.allergy.symptom_check import SymptomCheck



test_status_enum = ENUM(
    "testing", "completed_safe", "completed_reaction",
    name="test_status_enum",
    create_type=True,
)

#======================================================


class IngredientTesting(Base):
    __tablename__ = "ingredient_testing"
    __table_args__ = (
        # 테스트 이력 조회(baby_id) + 중복 체크(baby_id + ingredient_id) 둘 다 커버
        Index("ix_ingredient_testing_baby_ingredient", "baby_id", "ingredient_id"),
        # "한 아기당 동시 1개" 불변식은 DB EXCLUDE 제약 ex_ingredient_testing_no_overlap 으로 강제한다.
        # btree_gist 기반이라 ORM 모델이 아닌 직접 SQL로 관리(마이그레이션 안 씀). 신규 DB는 해당 SQL을
        # 별도 실행해야 함. 앱 레벨 단일 관문은 crud.allergy.ingredient_testing._assert_no_active_overlap().
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("baby_user.id"), nullable=False
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredient.id"), nullable=False
    )
    test_start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    test_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # NULL = 미래 식단(예약됨) / "testing" = 72h 이내 진행 중 / "completed_safe/reaction" = 완료
    test_status: Mapped[str | None] = mapped_column(test_status_enum, nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    baby: Mapped["BabyUser"] = relationship("BabyUser", back_populates="ingredient_testings")
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="ingredient_testings")
    symptom_checks: Mapped[list["SymptomCheck"]] = relationship(
        "SymptomCheck", back_populates="ingredient_testing", cascade="all, delete-orphan"
    )
