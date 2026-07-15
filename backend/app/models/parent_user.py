# 파일명: parent_user.py
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# [ParentUser]
class ParentUser(Base):
    __tablename__ = "parent_user"

    # PK — UUID(서버에서 생성). 자동 증가 정수 대신 UUID를 쓰는 이유:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # 로그인 아이디 — unique + index 둘 다. 검색이 빈번하고 중복 검사가 필수
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    # 이메일 — 비밀번호 찾기에 사용
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # 비밀번호 해시 — 로컬 로그인용
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    name: Mapped[str] = mapped_column(String(64), nullable=False)        # 실명
    # 닉네임 — 화면 표시용. unique 제약으로 중복 닉네임 방지
    nickname: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # 전화번호/주소 — 선택 입력(nullable)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # FCM 디바이스/브라우저 토큰 — 푸시 알림 발송용. 토큰이 없으면 푸시 미발송
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    notify_meal_time: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_allergy_check: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_community: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # 가입 시각 — DB의 NOW() 함수로 서버 시간 기준 자동 입력
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── 관계(Relationship) — 부모 삭제 시 자녀/연동계정/리프레시토큰 모두 같이 삭제 ──
    babies: Mapped[list["BabyUser"]] = relationship(  # noqa: F821
        back_populates="parent", cascade="all, delete-orphan"
    )
    # 알림 — 부모 삭제 시 같이 삭제
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        back_populates="parent", cascade="all, delete-orphan"
    )
    # 로그인 접속 기록 — 세션 제어가 아니라 표시용 기기 목록으로 사용
    login_devices: Mapped[list["ParentLoginDevice"]] = relationship(  # noqa: F821
        back_populates="parent", cascade="all, delete-orphan"
    )
