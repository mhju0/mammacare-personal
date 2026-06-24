from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from asyncio import to_thread
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator, Optional

os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY", "False")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ.setdefault("OTEL_TRACES_EXPORTER", "none")
os.environ.setdefault("OTEL_METRICS_EXPORTER", "none")
os.environ.setdefault("OTEL_LOGS_EXPORTER", "none")

try:
    import posthog as _posthog
    _posthog.disabled = True
except Exception:
    pass

import chromadb
from chromadb.config import Settings as ChromaSettings
from fastapi import HTTPException, status
from openai import AsyncAzureOpenAI

from app.core.config import settings
from app.schemas.chatbot import ChatMessage, ChatResponse, SourceDocument

logger = logging.getLogger("mammacare.chatbot")

# ── 경로 상수 ────────────────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parents[2]
KNOWLEDGE_BASE_DIR = _BASE_DIR / "knowledge_base"
CHROMA_DB_PATH = _BASE_DIR / "data" / "chroma_db"
COLLECTION_NAME = "knowledge_base"
COLLECTION_METADATA = {
    "hnsw:space": "cosine",
    "hnsw:batch_size": 1000,
    "hnsw:sync_threshold": 1000,
}
SUPPORTED_EXTENSIONS = {".md", ".txt", ".csv", ".json"}

# ── RAG 파라미터 ─────────────────────────────────────────────────────────────
RETRIEVAL_TOP_K = 10
FINAL_TOP_K = 5
RRF_K = 60
MAX_CHUNK_SIZE = 500
MIN_CHUNK_SIZE = 80
MAX_COMBINED_CONTEXT_CHARS = 4000
CHAT_HISTORY_LIMIT = 10
RESPONSE_CACHE_SIZE = 128
KNOWLEDGE_CACHE_CHECK_INTERVAL_SECONDS = 5.0

_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")
_PARAGRAPH_SEP = re.compile(r"\n{2,}")
_SENTENCE_END = re.compile(r"(?<=[.!?。])\s+|\n+")
_KOREAN_SUFFIXES = (
    "으로", "에서", "에게", "부터", "까지", "하고", "하면",
    "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "로", "해",
)
_STOPWORDS = {
    "가", "이", "은", "는", "을", "를", "에", "의", "와", "과", "도", "로",
    "으로", "하고", "하면", "해", "돼", "되", "요", "좀", "알려줘", "뭐", "무엇", "어떻게", "언제",
}

_GENERAL_KNOWLEDGE_REQUEST_PATTERNS = (
    "일반적으로",
    "문서에 없어도",
    "문서 밖",
    "외부",
    "그래도",
    "예시",
    "구체",
    "추천",
    "알려줘",
    "그냥",
    "대략",
    "보통",
)
_SPECIFIC_DETAIL_REQUEST_PATTERNS = (
    # 범용 구체 요청
    "예시",
    "구체",
    "추천",
    "어떤 종류",
    "무슨 종류",
    "어떤 방법",
    "어떤 증상",
    "어떤 제품",
    "어떤 활동",
    "종류",
    "목록",
    "이름",
    # 음식 특화
    "무슨 음식",
    "어떤 음식",
    "뭘 먹",
    "뭐 먹",
    "음식",
    "재료",
)
_REFERENCE_WORDS = (
    "그거", "그것", "그 ", "이거", "이것", "이 ", "저거", "거기",
    "그럼", "그렇다면", "더 ", "또 ", "그런데", "그 재료", "그 방법",
)

_PARTIAL_CONTEXT_MARKERS = (
    "[문서 일부 근거 - 일반 정보 보충]",
)

# 근거 라벨 상수 — 프롬프트 출력과 코드 감지 로직이 같은 값을 바라봄
_FALLBACK_LABELS = (
    "[문서 없음 - 일반 정보]",
    "[근거 부족 - 전문가 상담 필요]",
)
_ALL_BASIS_LABELS = (
    "[앱 문서 근거]",
    "[아기 기록 근거]",
    "[문서 일부 근거 - 일반 정보 보충]",
    "[문서 없음 - 일반 정보]",
    "[근거 부족 - 전문가 상담 필요]",
)

# ── 시스템 프롬프트 ───────────────────────────────────────────────────────────
_SYSTEM_WITH_CONTEXT = """\
당신은 맘마케어(MammaCare) 앱의 근거 기반 영유아 안전 어시스턴트입니다.
의료 진단과 처방은 제공하지 않으며, 근거에 기반한 안전 판단 보조와 행동 지침만 제공합니다.

[역할 및 범위]
- 아기 이유식, 영양, 알레르기, 수유, 돌봄, 성장 발달에 관한 질문만 답변합니다.
- 챗봇의 기능·역할을 묻는 질문("뭘 할 줄 알아", "뭘 도와줄 수 있어", "어떤 기능이야", "어떤 도움" 등)에는 아래 [앱 기능 목록]을 그대로 안내하세요.
- 육아와 무관한 질문(학업, 금융, 부동산, 여행, 게임, 정치 등)은 아래 문구로만 답하세요:
  "저는 아기 돌봄, 이유식, 영양, 알레르기 관련 질문만 도와드릴 수 있어요. 해당 주제로 질문해 주세요."

[앱 기능 목록 — 기능을 묻는 질문에 이 목록을 안내하세요]
1. 이유식·영양·알레르기·수유·성장 발달 질문 답변
2. 식단 등록: "어제 당근 먹였어요"처럼 입력하면 식단과 알레르기 테스팅을 자동 기록
3. 알레르기 반응 기록: 두드러기·발진 등 증상 기록 및 사진 첨부 가능
4. 레시피 검색: 재료나 키워드로 개월 수에 맞는 이유식 레시피 검색
5. AI 식단 계획: "이번 주 식단 짜줘"로 개월 수에 맞는 주간 식단 자동 생성
6. 성장 기록: "오늘 키 65cm, 몸무게 8kg"처럼 입력하면 성장 수치 자동 저장

[위험 신호 즉시 확인 — 아래 증상이 하나라도 언급되면 답변 맨 앞에서 먼저 안내하세요]
즉시 119 또는 응급실 (아나필락시스 의심):
- 호흡 곤란, 천명(쌕쌕거림), 숨 쉬기 힘들어함
- 입술·혀·얼굴·눈 주위 부기
- 의식 저하, 반응 없음
- 전신 두드러기 또는 빠르게 번지는 발진

소아과 방문 권고:
- 혈변 또는 반복 구토·설사, 탈수 의심
- 고열(38.5°C 이상) 지속 또는 경련
- 두드러기·발진이 국소적이나 계속 번짐
- 심한 보챔 또는 축 처짐이 지속됨
- 먹은 음식과 증상이 명확히 연관되어 알레르기 의심

[모호한 증상 질문 대응 — 아래 정보가 부족하면 먼저 질문하세요]
- 먹은 음식과 양 / 아기가 생후 몇 개월인지 (아기 정보가 없는 경우)
- 증상 시작 시간과 지속 시간
- 호흡 곤란·부기·의식 변화 여부

[아기 기록 사용 규칙 — [아기 정보]가 제공된 경우]
- 확진 알레르기 식품: 절대 추천하지 마세요. 해당 식품이 언급되면 즉시 알레르기 위험을 먼저 알리세요.
- 현재 테스트 중인 식품: 안전 미확인 상태임을 명시하고 안전하다고 말하지 마세요.
- 반응이 나온 식품: 재시도를 권하지 마세요. 소아과 상담을 먼저 안내하세요.
- 아기의 생후 개월 수에 맞지 않는 식품·조리법은 보수적으로 안내하세요.
- 아기 기록 기반 답변은 필요할 때만 짧게 언급하세요. "현재 등록된 아기 기록상…" 같은 긴 시작 문구를 반복하지 마세요.

[증상/알레르기 질문 출력 형식]
- 번호 목록을 사용하지 마세요.
- 6줄 이내로 답하세요.
- 아래 3개 묶음만 사용하세요: "먼저 확인", "지금 할 일", "진료 기준".
- 각 묶음은 한 줄 제목 + 최대 2개 불릿만 사용하세요.
- 위험 신호는 질문과 관련된 대표 항목만 2개까지 쓰고, 전체 목록을 나열하지 마세요.
- "관찰 기준", "근거 수준" 같은 별도 긴 섹션을 만들지 마세요.
- 근거 라벨은 마지막 줄에 대괄호 라벨만 간단히 붙이세요.

[일반 답변 구성 순서]
- 위험 신호 확인 (해당하는 경우 반드시 먼저)
- 금기 사항 및 주의 사항 (추천보다 반드시 앞에)
- 안전 판단 및 행동 지침
- 근거 수준 표시 (답변 말미에 반드시)

[근거 수준 표시 — 답변 말미에 반드시 1줄로 표시]
- [앱 문서 근거]: 앱 내 지식 문서에 명시된 내용 기반
- [아기 기록 근거]: 등록된 아기 정보 기반 내용
- [문서 일부 근거 - 일반 정보 보충]: 문서는 있으나 세부 내용 부족으로 일반 지식을 일부 보충함
- [문서 없음 - 일반 정보]: 문서 검색 결과 없음. 일반 지식 기반이며 정확하지 않을 수 있습니다.
- [근거 부족 - 전문가 상담 필요]: 문서·기록 모두에서 확인되지 않아 의료 판단이 필요

[응답 규칙]
- [참고 문서]를 최우선으로 사용하세요. 문서에 근거가 있으면 반드시 문서 기반으로만 답하세요.
- 문서에 없는 내용은 자유롭게 보충하지 마세요. 근거 부족임을 명시하고 제한적인 안내만 하세요.
- 진단·처방·약 용량·응급처치 세부 지시는 제공하지 마세요. 의료진에게 안내하세요.
- 알레르기 여부, 병명, 증상 원인은 확정 판단하지 마세요. (~일 수 있습니다 가능, ~입니다 확정 금지)
- 번호 목록(1., 2., 3.)을 쓰지 말고 불릿(-)만 사용하세요.
- 인사말, 격려 문구, 마무리 멘트("추가 질문이 있다면~" 등)는 쓰지 마세요.
- 이모지를 사용하지 마세요.
- 질문에 해당하는 내용만 간결하게 답변하세요.

[답변 길이]
- 기본 답변은 3~5문장으로 제한하세요.
- 추천/선택지 목록은 최대 3개까지만 제시하세요.
- 위험 신호, 병원 방문 기준, 금기 사항은 질문과 직접 관련된 핵심만 안내하세요.
- 증상/알레르기 질문은 위험 신호, 지금 할 일, 병원 방문 기준만 간결하게 답하세요. 6줄을 넘기지 마세요.
- 응급 가능성이 있는 질문은 긴 설명을 피하고 즉시 행동 안내를 먼저 제시하세요.
- 사용자가 "자세히", "이유도", "표로", "예시 더"라고 요청한 경우에만 더 길게 답하세요.
- 근거 수준 표시는 문장 수에 포함하지 않습니다.
- 같은 의미의 주의 문구를 반복하지 마세요.

[참고 문서]
{context}
"""

_SYSTEM_NO_CONTEXT = """\
당신은 맘마케어(MammaCare) 앱의 근거 기반 영유아 안전 어시스턴트입니다.
의료 진단과 처방은 제공하지 않으며, 안전 판단 보조와 행동 지침만 제공합니다.

[역할 및 범위]
- 아기 이유식, 영양, 알레르기, 수유, 돌봄, 성장 발달에 관한 질문만 답변합니다.
- 챗봇의 기능·역할을 묻는 질문("뭘 할 줄 알아", "뭘 도와줄 수 있어", "어떤 기능이야", "어떤 도움" 등)에는 아래 [앱 기능 목록]을 그대로 안내하세요.
- 육아와 무관한 질문(학업, 금융, 부동산, 여행, 게임, 정치 등)은 아래 문구로만 답하세요:
  "저는 아기 돌봄, 이유식, 영양, 알레르기 관련 질문만 도와드릴 수 있어요. 해당 주제로 질문해 주세요."

[앱 기능 목록 — 기능을 묻는 질문에 이 목록을 안내하세요]
1. 이유식·영양·알레르기·수유·성장 발달 질문 답변
2. 식단 등록: "어제 당근 먹였어요"처럼 입력하면 식단과 알레르기 테스팅을 자동 기록
3. 알레르기 반응 기록: 두드러기·발진 등 증상 기록 및 사진 첨부 가능
4. 레시피 검색: 재료나 키워드로 개월 수에 맞는 이유식 레시피 검색
5. AI 식단 계획: "이번 주 식단 짜줘"로 개월 수에 맞는 주간 식단 자동 생성
6. 성장 기록: "오늘 키 65cm, 몸무게 8kg"처럼 입력하면 성장 수치 자동 저장

[위험 신호 즉시 확인 — 아래 증상이 언급되면 답변 맨 앞에서 먼저 안내하세요]
- 호흡 곤란, 부기, 의식 저하, 전신 두드러기 → 즉시 119 또는 응급실
- 반복 구토, 혈변, 탈수 의심 → 해당 재료 중단 권유 후 소아과 방문 권고 (증상 심하면 응급실 고려)
- 국소 두드러기, 구토·설사 반복, 지속적 보챔 → 소아과 방문 권고

[모호한 증상 질문 대응 — 아래 정보가 부족하면 먼저 질문하세요]
- 먹은 음식과 양 / 아기가 생후 몇 개월인지 (아기 정보가 없는 경우)
- 증상 시작 시간과 지속 시간
- 호흡 곤란·부기·의식 변화 여부
- 반복 구토·설사 여부

[아기 기록 사용 규칙 — [아기 정보]가 제공된 경우]
- 확진 알레르기 식품: 절대 추천하지 마세요. 해당 식품이 언급되면 즉시 알레르기 위험을 먼저 알리세요.
- 현재 테스트 중인 식품: 안전 미확인 상태임을 명시하고 안전하다고 말하지 마세요.
- 반응이 나온 식품: 재시도를 권하지 마세요. 소아과 상담을 먼저 안내하세요.
- 아기 기록 기반 답변은 필요할 때만 짧게 언급하세요. "현재 등록된 아기 기록상…" 같은 긴 시작 문구를 반복하지 마세요.

[응답 규칙]
1. [아기 정보]가 있으면 해당 기록을 우선 참조하고, 기록 기반 내용은 [아기 기록 근거]로 표시하세요. 아기 기록만으로 충분히 답변 가능한 경우 [문서 없음 - 일반 정보]를 붙이지 마세요.
2. 앱 내 문서에서는 해당 정보를 찾지 못했습니다. 문서 근거가 없음을 명시하세요.
3. 일반 육아 상식 범위에서만 제한적으로 안내하세요. 단정적 표현을 피하고 개인차를 명시하세요.
4. 진단·처방·약 용량은 절대 제공하지 마세요. 중요한 사항은 소아청소년과 전문의에게 확인하도록 안내하세요.
5. 일반 육아 지식을 사용한 경우, 답변 말미에 반드시 1줄 표시하세요: [문서 없음 - 일반 정보] 앱 문서에 근거가 없으며 정확하지 않을 수 있습니다. 중요한 사항은 소아청소년과 전문의에게 확인하세요.
6. 번호 목록(1., 2., 3.)을 쓰지 말고 불릿(-)만 사용하세요.
7. 인사말, 격려 문구, 마무리 멘트는 쓰지 마세요.
8. 이모지를 사용하지 마세요.

[증상/알레르기 질문 출력 형식]
- 번호 목록을 사용하지 마세요.
- 6줄 이내로 답하세요.
- 아래 3개 묶음만 사용하세요: "먼저 확인", "지금 할 일", "진료 기준".
- 각 묶음은 한 줄 제목 + 최대 2개 불릿만 사용하세요.
- 위험 신호는 질문과 관련된 대표 항목만 2개까지 쓰고, 전체 목록을 나열하지 마세요.
- "관찰 기준", "근거 수준" 같은 별도 긴 섹션을 만들지 마세요.
- 근거 라벨은 마지막 줄에 대괄호 라벨만 간단히 붙이세요.

[답변 길이]
- 기본 답변은 3~5문장으로 제한하세요.
- 추천/선택지 목록은 최대 3개까지만 제시하세요.
- 위험 신호, 병원 방문 기준, 금기 사항은 질문과 직접 관련된 핵심만 안내하세요.
- 증상/알레르기 질문은 위험 신호, 지금 할 일, 병원 방문 기준만 간결하게 답하세요. 6줄을 넘기지 마세요.
- 응급 가능성이 있는 질문은 긴 설명을 피하고 즉시 행동 안내를 먼저 제시하세요.
- 사용자가 "자세히", "이유도", "표로", "예시 더"라고 요청한 경우에만 더 길게 답하세요.
- 근거 수준 표시는 문장 수에 포함하지 않습니다.
- 같은 의미의 주의 문구를 반복하지 마세요.
"""

_SYSTEM_PARTIAL_CONTEXT = """\
당신은 맘마케어(MammaCare) 앱의 근거 기반 영유아 안전 어시스턴트입니다.
의료 진단과 처방은 제공하지 않으며, 근거에 기반한 안전 판단 보조와 행동 지침만 제공합니다.

[역할 및 범위]
- 아기 이유식, 영양, 알레르기, 수유, 돌봄, 성장 발달에 관한 질문만 답변합니다.
- 챗봇의 기능·역할을 묻는 질문("뭘 할 줄 알아", "뭘 도와줄 수 있어", "어떤 기능이야", "어떤 도움" 등)에는 아래 [앱 기능 목록]을 그대로 안내하세요.
- 육아와 무관한 질문(학업, 금융, 부동산, 여행, 게임, 정치 등)은 아래 문구로만 답하세요:
  "저는 아기 돌봄, 이유식, 영양, 알레르기 관련 질문만 도와드릴 수 있어요. 해당 주제로 질문해 주세요."

[앱 기능 목록 — 기능을 묻는 질문에 이 목록을 안내하세요]
1. 이유식·영양·알레르기·수유·성장 발달 질문 답변
2. 식단 등록: "어제 당근 먹였어요"처럼 입력하면 식단과 알레르기 테스팅을 자동 기록
3. 알레르기 반응 기록: 두드러기·발진 등 증상 기록 및 사진 첨부 가능
4. 레시피 검색: 재료나 키워드로 개월 수에 맞는 이유식 레시피 검색
5. AI 식단 계획: "이번 주 식단 짜줘"로 개월 수에 맞는 주간 식단 자동 생성
6. 성장 기록: "오늘 키 65cm, 몸무게 8kg"처럼 입력하면 성장 수치 자동 저장

[위험 신호 즉시 확인 — 아래 증상이 언급되면 답변 맨 앞에서 먼저 안내하세요]
- 호흡 곤란, 부기, 의식 저하, 전신 두드러기 → 즉시 119 또는 응급실
- 국소 두드러기, 반복 구토·설사, 지속적 보챔 → 소아과 방문 권고

[모호한 증상 질문 대응 — 아래 정보가 부족하면 먼저 질문하세요]
- 먹은 음식과 양 / 아기가 생후 몇 개월인지 (아기 정보가 없는 경우)
- 증상 시작 시간과 지속 시간
- 호흡 곤란·부기·의식 변화 여부
- 반복 구토·설사 여부

[아기 기록 사용 규칙 — [아기 정보]가 제공된 경우]
- 확진 알레르기 식품: 절대 추천하지 마세요. 해당 식품이 언급되면 즉시 알레르기 위험을 먼저 알리세요.
- 현재 테스트 중인 식품: 안전 미확인 상태임을 명시하고 안전하다고 말하지 마세요.
- 반응이 나온 식품: 재시도를 권하지 마세요. 소아과 상담을 먼저 안내하세요.
- 아기 기록 기반 답변은 필요할 때만 짧게 언급하세요. "현재 등록된 아기 기록상…" 같은 긴 시작 문구를 반복하지 마세요.

[증상/알레르기 질문 출력 형식]
- 번호 목록을 사용하지 마세요.
- 6줄 이내로 답하세요.
- 아래 3개 묶음만 사용하세요: "먼저 확인", "지금 할 일", "진료 기준".
- 각 묶음은 한 줄 제목 + 최대 2개 불릿만 사용하세요.
- 위험 신호는 질문과 관련된 대표 항목만 2개까지 쓰고, 전체 목록을 나열하지 마세요.
- "관찰 기준", "근거 수준" 같은 별도 긴 섹션을 만들지 마세요.
- 근거 라벨은 마지막 줄에 대괄호 라벨만 간단히 붙이세요.

[일반 답변 구성 순서]
- 위험 신호 확인 (해당하는 경우 반드시 먼저)
- 금기 사항 및 주의 사항 (추천보다 반드시 앞에)
- 안전 판단 및 행동 지침 (문서 근거 우선)
- 근거 수준 표시 (답변 말미에 반드시)

[근거 수준 표시 — 답변 말미에 반드시 1줄로 표시]
- [앱 문서 근거]: 앱 내 지식 문서에 명시된 내용 기반
- [아기 기록 근거]: 등록된 아기 정보 기반 내용
- [문서 일부 근거 - 일반 정보 보충]: 문서는 있으나 세부 내용 부족으로 일반 지식을 일부 보충함

[응답 규칙]
- [참고 문서]를 최우선으로 사용하세요.
- 문서에 없는 세부 내용은 자유롭게 보충하지 마세요. 제한적으로만 안내하고 근거 수준을 반드시 표시하세요.
- 진단·처방·약 용량은 제공하지 마세요. 증상이 있으면 의료진을 안내하세요.
- 번호 목록(1., 2., 3.)을 쓰지 말고 불릿(-)만 사용하세요.
- 인사말, 격려 문구, 마무리 멘트는 쓰지 마세요.
- 이모지를 사용하지 마세요.
- 질문에 해당하는 내용만 간결하게 답변하세요.

[답변 길이]
- 기본 답변은 3~5문장으로 제한하세요.
- 추천/선택지 목록은 최대 3개까지만 제시하세요.
- 위험 신호, 병원 방문 기준, 금기 사항은 질문과 직접 관련된 핵심만 안내하세요.
- 증상/알레르기 질문은 위험 신호, 지금 할 일, 병원 방문 기준만 간결하게 답하세요. 6줄을 넘기지 마세요.
- 응급 가능성이 있는 질문은 긴 설명을 피하고 즉시 행동 안내를 먼저 제시하세요.
- 사용자가 "자세히", "이유도", "표로", "예시 더"라고 요청한 경우에만 더 길게 답하세요.
- 근거 수준 표시는 문장 수에 포함하지 않습니다.
- 같은 의미의 주의 문구를 반복하지 마세요.

[참고 문서]
{context}
"""

_SYSTEM_GENERAL_KNOWLEDGE = """\
당신은 맘마케어(MammaCare) 앱의 근거 기반 영유아 안전 어시스턴트입니다.
의료 진단과 처방은 제공하지 않으며, 안전 판단 보조와 행동 지침만 제공합니다.

[역할 및 범위]
- 아기 이유식, 영양, 알레르기, 수유, 돌봄, 성장 발달에 관한 질문만 답변합니다.
- 챗봇의 기능·역할을 묻는 질문("뭘 할 줄 알아", "뭘 도와줄 수 있어", "어떤 기능이야", "어떤 도움" 등)에는 아래 [앱 기능 목록]을 그대로 안내하세요.
- 육아와 무관한 질문(학업, 금융, 부동산, 여행, 게임, 정치 등)은 아래 문구로만 답하세요:
  "저는 아기 돌봄, 이유식, 영양, 알레르기 관련 질문만 도와드릴 수 있어요. 해당 주제로 질문해 주세요."

[앱 기능 목록 — 기능을 묻는 질문에 이 목록을 안내하세요]
1. 이유식·영양·알레르기·수유·성장 발달 질문 답변
2. 식단 등록: "어제 당근 먹였어요"처럼 입력하면 식단과 알레르기 테스팅을 자동 기록
3. 알레르기 반응 기록: 두드러기·발진 등 증상 기록 및 사진 첨부 가능
4. 레시피 검색: 재료나 키워드로 개월 수에 맞는 이유식 레시피 검색
5. AI 식단 계획: "이번 주 식단 짜줘"로 개월 수에 맞는 주간 식단 자동 생성
6. 성장 기록: "오늘 키 65cm, 몸무게 8kg"처럼 입력하면 성장 수치 자동 저장

[위험 신호 즉시 확인 — 아래 증상이 언급되면 답변 맨 앞에서 먼저 안내하세요]
- 호흡 곤란, 부기, 의식 저하, 전신 두드러기 → 즉시 119 또는 응급실
- 국소 두드러기, 반복 구토·설사, 지속적 보챔 → 소아과 방문 권고

[모호한 증상 질문 대응 — 아래 정보가 부족하면 먼저 질문하세요]
- 먹은 음식과 양 / 아기가 생후 몇 개월인지 (아기 정보가 없는 경우)
- 증상 시작 시간과 지속 시간
- 호흡 곤란·부기·의식 변화 여부
- 반복 구토·설사 여부

[아기 기록 사용 규칙 — [아기 정보]가 제공된 경우]
- 확진 알레르기 식품: 절대 추천하지 마세요. 해당 식품이 언급되면 즉시 알레르기 위험을 먼저 알리세요.
- 현재 테스트 중인 식품: 안전 미확인 상태임을 명시하고 안전하다고 말하지 마세요.
- 반응이 나온 식품: 재시도를 권하지 마세요. 소아과 상담을 먼저 안내하세요.
- 아기 기록 기반 답변은 필요할 때만 짧게 언급하세요. "현재 등록된 아기 기록상…" 같은 긴 시작 문구를 반복하지 마세요.

[응답 규칙]
1. [아기 정보]가 있으면 해당 기록을 우선 참조하고, 기록 기반 내용은 [아기 기록 근거]로 표시하세요.
2. [참고 문서] 내용과 충돌하지 않도록 답변하세요.
3. 일반 육아 지식을 기반으로 하되 단정적 표현을 피하고 개인차가 있을 수 있음을 명시하세요.
4. 진단·처방·약 용량은 제공하지 마세요. 증상이 있으면 소아과 전문의를 안내하세요.
5. 답변 말미에 반드시 1줄 표시하세요: [문서 없음 - 일반 정보] 앱 문서에 근거가 없으며 정확하지 않을 수 있습니다.
6. 번호 목록(1., 2., 3.)을 쓰지 말고 불릿(-)만 사용하세요.
7. 인사말, 격려 문구, 마무리 멘트는 쓰지 마세요.
8. 이모지를 사용하지 마세요.

[증상/알레르기 질문 출력 형식]
- 번호 목록을 사용하지 마세요.
- 6줄 이내로 답하세요.
- 아래 3개 묶음만 사용하세요: "먼저 확인", "지금 할 일", "진료 기준".
- 각 묶음은 한 줄 제목 + 최대 2개 불릿만 사용하세요.
- 위험 신호는 질문과 관련된 대표 항목만 2개까지 쓰고, 전체 목록을 나열하지 마세요.
- "관찰 기준", "근거 수준" 같은 별도 긴 섹션을 만들지 마세요.
- 근거 라벨은 마지막 줄에 대괄호 라벨만 간단히 붙이세요.

[답변 길이]
- 기본 답변은 3~5문장으로 제한하세요.
- 추천/선택지 목록은 최대 3개까지만 제시하세요.
- 위험 신호, 병원 방문 기준, 금기 사항은 질문과 직접 관련된 핵심만 안내하세요.
- 증상/알레르기 질문은 위험 신호, 지금 할 일, 병원 방문 기준만 간결하게 답하세요. 6줄을 넘기지 마세요.
- 응급 가능성이 있는 질문은 긴 설명을 피하고 즉시 행동 안내를 먼저 제시하세요.
- 사용자가 "자세히", "이유도", "표로", "예시 더"라고 요청한 경우에만 더 길게 답하세요.
- 근거 수준 표시는 문장 수에 포함하지 않습니다.
- 같은 의미의 주의 문구를 반복하지 마세요.

[참고 문서]
{context}
"""

FALLBACK_WARNING = "\n\n[문서 없음 - 일반 정보] 앱 문서에 근거가 없으며 정확하지 않을 수 있습니다. 중요한 사항은 소아청소년과 전문의에게 확인하세요."


def _has_fallback_label(answer: str) -> bool:
    return any(label in answer for label in _FALLBACK_LABELS)


def _has_any_basis_label(answer: str) -> bool:
    return any(label in answer for label in _ALL_BASIS_LABELS)


def _append_fallback_warning_if_needed(
    answer: str, used_fallback: bool
) -> tuple[str, bool]:
    """필요하면 FALLBACK_WARNING을 붙이고 (answer, warning_added)를 반환."""
    if not used_fallback:
        return answer, False
    if _has_any_basis_label(answer):
        return answer, False
    if "관련 질문만 도와드릴 수 있어요" in answer:
        return answer, False
    return answer + FALLBACK_WARNING, True


@dataclass(frozen=True)
class KnowledgeChunk:
    filename: str
    path: Path
    text: str
    tokens: set[str]


class ChatbotService:
    def __init__(self) -> None:
        self._openai = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            timeout=30.0,
        )
        self._chroma = None
        self._collection = None
        self._chroma_doc_count: int | None = None
        self._knowledge_manifest: tuple[tuple[str, int, int], ...] = ()
        self._knowledge_chunks: list[KnowledgeChunk] = []
        self._knowledge_last_checked_at = 0.0
        self._response_cache: OrderedDict[tuple, ChatResponse] = OrderedDict()
        self._refresh_knowledge_cache(force=True)

    # ── 임베딩 ────────────────────────────────────────────────────────────────

    async def _embed(self, text: str) -> list[float]:
        logger.debug("Azure OpenAI 임베딩 요청 시작.")
        try:
            response = await self._openai.embeddings.create(
                input=text,
                model=settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
            )
        except Exception:
            logger.exception("Azure OpenAI 임베딩 요청 실패.")
            raise
        logger.debug("Azure OpenAI 임베딩 요청 완료.")
        return response.data[0].embedding

    def _tokenize(self, text: str) -> set[str]:
        tokens: set[str] = set()
        for raw_token in _TOKEN_RE.findall(text):
            token = raw_token.lower()
            tokens.add(token)
            # 복합 조사를 단계적으로 제거 ("중기에는" → "중기에" → "중기")
            current = token
            for _ in range(3):
                stripped = False
                for suffix in _KOREAN_SUFFIXES:
                    if current.endswith(suffix) and len(current) > len(suffix) + 1:
                        current = current[: -len(suffix)]
                        tokens.add(current)
                        stripped = True
                        break
                if not stripped:
                    break
        return {token for token in tokens if token not in _STOPWORDS}

    def _chunk_text(self, text: str) -> list[str]:
        chunks: list[str] = []
        current = ""

        for para in _PARAGRAPH_SEP.split(text):
            para = para.strip()
            if not para:
                continue

            candidate = (current + "\n\n" + para).strip() if current else para
            if len(candidate) <= MAX_CHUNK_SIZE:
                current = candidate
                continue

            if current:
                chunks.append(current)

            if len(para) <= MAX_CHUNK_SIZE:
                current = para
                continue

            # 단락이 MAX_CHUNK_SIZE 초과 → 문장 단위 분리
            current = ""
            for sent in _SENTENCE_END.split(para):
                sent = sent.strip()
                if not sent:
                    continue
                candidate = (current + " " + sent).strip() if current else sent
                if len(candidate) <= MAX_CHUNK_SIZE:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    if len(sent) > MAX_CHUNK_SIZE:
                        for i in range(0, len(sent), MAX_CHUNK_SIZE):
                            piece = sent[i : i + MAX_CHUNK_SIZE].strip()
                            if piece:
                                chunks.append(piece)
                        current = ""
                    else:
                        current = sent

        if current:
            chunks.append(current)

        return [c for c in chunks if len(c) >= MIN_CHUNK_SIZE]

    def _knowledge_files(self) -> list[Path]:
        if not KNOWLEDGE_BASE_DIR.exists():
            return []
        return [
            path
            for path in sorted(KNOWLEDGE_BASE_DIR.rglob("*"))
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]

    def _build_knowledge_manifest(self) -> tuple[tuple[str, int, int], ...]:
        manifest: list[tuple[str, int, int]] = []
        for path in self._knowledge_files():
            try:
                stat = path.stat()
            except OSError:
                continue
            manifest.append((str(path), stat.st_mtime_ns, stat.st_size))
        return tuple(manifest)

    @staticmethod
    def _read_file_text(file_path: Path) -> str:
        suffix = file_path.suffix.lower()
        if suffix == ".csv":
            import csv as _csv
            lines: list[str] = []
            with file_path.open(encoding="utf-8-sig") as f:
                for row in _csv.DictReader(f):
                    sentence = ", ".join(f"{k}: {v}" for k, v in row.items() if v and str(v).strip())
                    if sentence:
                        lines.append(sentence)
            return "\n".join(lines)
        if suffix == ".json":
            import json as _json
            return _json.dumps(_json.loads(file_path.read_text(encoding="utf-8")), ensure_ascii=False)
        # .md, .txt
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return file_path.read_text(encoding="utf-8-sig")

    def _refresh_knowledge_cache(self, force: bool = False) -> None:
        now = time.monotonic()
        if (
            not force
            and now - self._knowledge_last_checked_at
            < KNOWLEDGE_CACHE_CHECK_INTERVAL_SECONDS
        ):
            return
        self._knowledge_last_checked_at = now

        manifest = self._build_knowledge_manifest()
        if not force and manifest == self._knowledge_manifest:
            return

        chunks: list[KnowledgeChunk] = []
        for path, _, _ in manifest:
            file_path = Path(path)
            try:
                text = self._read_file_text(file_path)
            except Exception as exc:
                logger.warning("지식 문서 읽기 실패: %s (%s)", file_path, exc)
                continue
            if not text.strip():
                continue

            for chunk in self._chunk_text(text):
                chunks.append(
                    KnowledgeChunk(
                        filename=file_path.name,
                        path=file_path,
                        text=chunk,
                        tokens=self._tokenize(chunk),
                    )
                )

        self._knowledge_manifest = manifest
        self._knowledge_chunks = chunks
        logger.info("지식 문서 캐시 갱신 완료: 파일 %d개, 청크 %d개", len(manifest), len(chunks))

    def _ensure_chroma_collection(self) -> bool:
        if self._collection is not None:
            return True

        CHROMA_DB_PATH.mkdir(parents=True, exist_ok=True)
        try:
            self._chroma = chromadb.PersistentClient(
                path=str(CHROMA_DB_PATH),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            self._collection = self._chroma.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata=COLLECTION_METADATA,
            )
            logger.info("ChromaDB 초기화 완료.")
            return True
        except Exception:
            logger.exception("ChromaDB 초기화 실패 — fallback 전용 모드로 동작합니다.")
            self._collection = None
            self._chroma_doc_count = None
            return False

    def _retrieve_from_files(
        self, query: str, query_tokens: set[str]
    ) -> list[tuple[int, KnowledgeChunk]]:
        if not self._knowledge_chunks or not query_tokens:
            return []

        min_score = 1 if len(query_tokens) <= 2 else 2
        normalized_query = query.strip().lower()
        matches: list[tuple[int, KnowledgeChunk]] = []

        for chunk in self._knowledge_chunks:
            score = len(query_tokens & chunk.tokens)
            if normalized_query and normalized_query in chunk.text.lower():
                score += 2
            if score >= min_score:
                matches.append((score, chunk))

        if not matches:
            return []

        matches.sort(key=lambda item: item[0], reverse=True)
        return matches[:RETRIEVAL_TOP_K]

    def _is_general_knowledge_request(
        self,
        message: str,
        conversation_history: list[ChatMessage],
    ) -> bool:
        normalized = message.strip().lower()
        if not any(pattern in normalized for pattern in _GENERAL_KNOWLEDGE_REQUEST_PATTERNS):
            return False

        recent_assistant_messages = [
            item.content
            for item in conversation_history[-CHAT_HISTORY_LIMIT:]
            if item.role == "assistant"
        ]
        if any(
            any(label in item for label in _FALLBACK_LABELS)
            for item in recent_assistant_messages
        ):
            return True

        return any(pattern in normalized for pattern in ("일반적으로", "문서에 없어도", "문서 밖", "외부"))

    def _is_partial_document_request(
        self, message: str, conversation_history: list[ChatMessage]
    ) -> bool:
        normalized = message.strip().lower()
        asks_for_specific_detail = any(
            pattern in normalized for pattern in _SPECIFIC_DETAIL_REQUEST_PATTERNS
        )
        if not asks_for_specific_detail:
            return False

        # 이전 AI 응답에서 "구체 정보 없음" 안내가 있었는지 확인
        recent_assistant = [
            item.content
            for item in conversation_history[-CHAT_HISTORY_LIMIT:]
            if item.role == "assistant"
        ]
        prev_said_no_specific = any(
            any(marker in msg for marker in _PARTIAL_CONTEXT_MARKERS)
            for msg in recent_assistant
        )
        return prev_said_no_specific

    async def _retrieve_from_chroma(
        self, query_embedding: list[float]
    ) -> list[tuple[float, str, dict]]:
        if not self._ensure_chroma_collection():
            return []

        if self._chroma_doc_count is None:
            try:
                self._chroma_doc_count = await to_thread(self._collection.count)
            except Exception:
                logger.exception("ChromaDB 문서 수 조회 실패.")
                return []

        if self._chroma_doc_count == 0:
            logger.warning("지식 베이스가 비어 있습니다. ingest_knowledge.py를 먼저 실행하세요.")
            return []

        logger.info("ChromaDB 임베딩 검색 시작. 문서 수: %d", self._chroma_doc_count)
        try:
            results = await to_thread(
                self._collection.query,
                query_embeddings=[query_embedding],
                n_results=min(RETRIEVAL_TOP_K, self._chroma_doc_count),
                include=["documents", "distances", "metadatas"],
            )
        except Exception:
            logger.exception("ChromaDB 검색 실패.")
            return []

        docs: list[str] = results["documents"][0]
        distances: list[float] = results["distances"][0]
        metadatas: list[dict] = results["metadatas"][0]

        # 코사인 유사도(1 - distance)로 변환, 내림차순 정렬된 채로 반환
        return [
            (1.0 - dist, doc, meta)
            for dist, doc, meta in zip(distances, docs, metadatas)
        ]

    # ── RRF 병합 ─────────────────────────────────────────────────────────────

    @staticmethod
    def _rrf_merge(
        lexical_ranked: list[tuple[int, KnowledgeChunk]],
        vector_ranked: list[tuple[float, str, dict]],
    ) -> list[tuple[str, str]]:
        scores: dict[str, float] = {}
        texts: dict[str, str] = {}
        filenames: dict[str, str] = {}

        for rank, (_, chunk) in enumerate(lexical_ranked):
            key = hashlib.md5(chunk.text.encode()).hexdigest()
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            texts[key] = chunk.text
            filenames[key] = chunk.filename

        for rank, (_, doc, meta) in enumerate(vector_ranked):
            key = hashlib.md5(doc.encode()).hexdigest()
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            if key not in texts:
                texts[key] = doc
                filenames[key] = meta.get("filename", "알 수 없음")

        sorted_keys = sorted(scores, key=lambda k: scores[k], reverse=True)
        return [(texts[k], filenames[k]) for k in sorted_keys[:FINAL_TOP_K]]

    # ── 검색 (Retrieve) ───────────────────────────────────────────────────────

    async def _retrieve(
        self, query: str,
        query_tokens: set[str] | None = None,
    ) -> tuple[str, list[SourceDocument], bool]:
        if query_tokens is None:
            query_tokens = self._tokenize(query)

        await to_thread(self._refresh_knowledge_cache)

        try:
            query_embedding = await self._embed(query)
        except Exception:
            logger.exception("임베딩 생성 실패 — lexical 검색만 사용합니다.")
            query_embedding = None

        lexical_results = self._retrieve_from_files(query, query_tokens)

        if query_embedding is not None:
            vector_results = await self._retrieve_from_chroma(query_embedding)
        else:
            vector_results = []

        merged = self._rrf_merge(lexical_results, vector_results)

        if not merged:
            logger.info("RRF 검색 결과가 없어 fallback 모드로 진입합니다.")
            return "", [], True

        context_parts: list[str] = []
        sources: list[SourceDocument] = []
        total_chars = 0

        for text, filename in merged:
            part = f"[출처: {filename}]\n{text}"
            if total_chars + len(part) > MAX_COMBINED_CONTEXT_CHARS:
                break
            context_parts.append(part)
            sources.append(
                SourceDocument(
                    filename=filename,
                    chunk_preview=(text[:120] + "...") if len(text) > 120 else text,
                )
            )
            total_chars += len(part)

        return "\n\n---\n\n".join(context_parts), sources, False

    # ── 생성 헬퍼 ────────────────────────────────────────────────────────────

    def _determine_response_basis(
        self,
        message: str,
        recent_history: list[ChatMessage],
        used_fallback: bool,
    ) -> tuple[str, bool]:
        if used_fallback:
            return "general_knowledge", True
        if self._is_general_knowledge_request(message, recent_history):
            return "general_knowledge", True
        if self._is_partial_document_request(message, recent_history):
            return "partial_document", False
        return "documented", False

    def _build_messages(
        self,
        message: str,
        recent_history: list[ChatMessage],
        context: str,
        response_basis: str,
        baby_context: str | None,
    ) -> list[dict]:
        if response_basis == "general_knowledge":
            system_content = (
                _SYSTEM_GENERAL_KNOWLEDGE.format(context=context)
                if context
                else _SYSTEM_NO_CONTEXT
            )
        elif response_basis == "partial_document":
            system_content = _SYSTEM_PARTIAL_CONTEXT.format(context=context)
        else:
            system_content = _SYSTEM_WITH_CONTEXT.format(context=context)

        if baby_context:
            system_content = baby_context + "\n\n" + system_content

        messages: list[dict] = [{"role": "system", "content": system_content}]
        for h in recent_history:
            messages.append({"role": h.role, "content": h.content})
        messages.append({"role": "user", "content": message})
        return messages

    # ── 쿼리 재구성 ──────────────────────────────────────────────────────────────

    async def _rewrite_query(
        self,
        message: str,
        recent_history: list[ChatMessage],
    ) -> str:
        if not recent_history:
            return message
        if not any(word in message for word in _REFERENCE_WORDS):
            return message

        history_text = "\n".join(
            f"{'사용자' if h.role == 'user' else 'AI'}: {h.content[:200]}"
            for h in recent_history[-4:]
        )
        prompt = (
            "대화 기록을 참고해 마지막 질문을 검색에 적합한 독립 문장으로 바꿔라.\n"
            "- 대명사(그, 이, 거기, 그것, 그거 등)를 실제 명사로 대체\n"
            "- 30자 이내, 간결하게\n"
            "- 이미 독립적이면 그대로만 출력\n\n"
            f"대화 기록:\n{history_text}\n\n"
            f"마지막 질문: {message}\n"
            "독립 질문:"
        )
        try:
            response = await self._openai.chat.completions.create(
                model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=60,
            )
            rewritten = (response.choices[0].message.content or "").strip()
            if rewritten:
                logger.debug("쿼리 재구성: %r → %r", message, rewritten)
                return rewritten
        except Exception:
            logger.warning("쿼리 재구성 실패 — 원본 메시지 사용.")
        return message

    # ── 생성 (Generate) ───────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        conversation_history: list[ChatMessage],
        baby_context: str | None = None,
    ) -> ChatResponse:
        message = message.strip()
        query_tokens = self._tokenize(message)
        recent_history = conversation_history[-CHAT_HISTORY_LIMIT:]

        # 검색 전에 캐시 조회 (knowledge_manifest로 지식베이스 변경 감지)
        await to_thread(self._refresh_knowledge_cache)
        cache_key = (
            message,
            tuple((h.role, h.content) for h in recent_history),
            baby_context,
            self._knowledge_manifest,
        )
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            self._response_cache.move_to_end(cache_key)
            return cached.model_copy(deep=True)

        search_query = await self._rewrite_query(message, recent_history)
        search_tokens = self._tokenize(search_query)
        context, sources, used_fallback = await self._retrieve(search_query, search_tokens)
        response_basis, used_fallback = self._determine_response_basis(message, recent_history, used_fallback)
        messages = self._build_messages(message, recent_history, context, response_basis, baby_context)

        try:
            response = await self._openai.chat.completions.create(
                model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=messages,
                temperature=0.1,
                max_tokens=1500,
            )
        except Exception as e:
            logger.exception("Azure OpenAI 챗봇 호출 실패: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI 챗봇 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            )

        answer: str = response.choices[0].message.content or ""

        if _has_fallback_label(answer):
            used_fallback = True
            response_basis = "general_knowledge"

        answer, _ = _append_fallback_warning_if_needed(answer, used_fallback)

        result = ChatResponse(
            answer=answer,
            used_fallback=used_fallback,
            response_basis=response_basis,
            sources=sources,
        )
        self._response_cache[cache_key] = result.model_copy(deep=True)
        if len(self._response_cache) > RESPONSE_CACHE_SIZE:
            self._response_cache.popitem(last=False)
        return result


    async def chat_stream(
        self,
        message: str,
        conversation_history: list[ChatMessage],
        baby_context: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        message = message.strip()
        query_tokens = self._tokenize(message)
        recent_history = conversation_history[-CHAT_HISTORY_LIMIT:]

        # 검색 전에 캐시 조회
        await to_thread(self._refresh_knowledge_cache)
        cache_key = (
            message,
            tuple((h.role, h.content) for h in recent_history),
            baby_context,
            self._knowledge_manifest,
        )
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            self._response_cache.move_to_end(cache_key)
            yield {
                "type": "meta",
                "used_fallback": cached.used_fallback,
                "response_basis": cached.response_basis,
                "sources": [
                    {"filename": s.filename, "chunk_preview": s.chunk_preview}
                    for s in cached.sources
                ],
            }
            for i in range(0, len(cached.answer), 12):
                yield {"type": "chunk", "text": cached.answer[i:i + 12]}
            yield {"type": "done"}
            return

        search_query = await self._rewrite_query(message, recent_history)
        search_tokens = self._tokenize(search_query)
        context, sources, used_fallback = await self._retrieve(search_query, search_tokens)
        response_basis, used_fallback = self._determine_response_basis(message, recent_history, used_fallback)

        yield {
            "type": "meta",
            "used_fallback": used_fallback,
            "response_basis": response_basis,
            "sources": [
                {"filename": s.filename, "chunk_preview": s.chunk_preview}
                for s in sources
            ],
        }

        messages = self._build_messages(message, recent_history, context, response_basis, baby_context)

        try:
            stream = await self._openai.chat.completions.create(
                model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
                messages=messages,
                temperature=0.1,
                max_tokens=1500,
                stream=True,
            )
        except Exception as e:
            logger.exception("Azure OpenAI 챗봇 스트림 호출 실패: %s", e)
            yield {"type": "error", "message": "AI 챗봇 호출 중 오류가 발생했습니다."}
            return

        full_answer = ""
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                full_answer += delta
                yield {"type": "chunk", "text": delta}

        full_answer, warning_added = _append_fallback_warning_if_needed(full_answer, used_fallback)
        if warning_added:
            yield {"type": "chunk", "text": FALLBACK_WARNING}

        if _has_fallback_label(full_answer):
            used_fallback = True
            response_basis = "general_knowledge"

        yield {"type": "done"}

        result = ChatResponse(
            answer=full_answer,
            used_fallback=used_fallback,
            response_basis=response_basis,
            sources=sources,
        )
        self._response_cache[cache_key] = result.model_copy(deep=True)
        if len(self._response_cache) > RESPONSE_CACHE_SIZE:
            self._response_cache.popitem(last=False)


# ── 싱글톤 ────────────────────────────────────────────────────────────────────
_service: Optional[ChatbotService] = None


def get_chatbot_service() -> ChatbotService:
    global _service
    if _service is None:
        _service = ChatbotService()
    return _service
