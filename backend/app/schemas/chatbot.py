from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="사용자 메시지")
    conversation_history: list[ChatMessage] = Field(
        default_factory=list,
        description="이전 대화 기록 (최근 순서로 전달)",
    )
    baby_id: uuid.UUID | None = Field(None, description="현재 선택된 아기 프로필 ID")


class SourceDocument(BaseModel):
    filename: str
    chunk_preview: str


class ChatResponse(BaseModel):
    answer: str
    used_fallback: bool = Field(description="True = 지식 베이스 미발견, 모델 자체 지식 사용")
    response_basis: Literal["documented", "partial_document", "general_knowledge"] = Field(
        description="documented=문서 기반, partial_document=문서 일부 근거/구체 정보 부족, general_knowledge=일반 지식 포함",
    )
    sources: list[SourceDocument] = Field(default_factory=list)
