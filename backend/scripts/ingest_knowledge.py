"""
지식 베이스 문서를 청킹하여 ChromaDB에 적재하는 스크립트.

지원 포맷:
  .md / .txt  — 일반 텍스트
  .csv        — 행별 텍스트 변환 (헤더 포함)
  .pdf        — pdfplumber로 텍스트 추출
  .json       — 공공데이터 등 JSON 배열/객체 처리

사용법:
    cd backend
    python scripts/ingest_knowledge.py

    # 특정 파일만 재적재
    python scripts/ingest_knowledge.py --file knowledge_base/my_doc.pdf

    # 컬렉션 초기화 후 전체 재적재
    python scripts/ingest_knowledge.py --reset
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import logging
import os
import shutil
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
from openai import AsyncAzureOpenAI

from app.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
)
logger = logging.getLogger("ingest")

_BASE_DIR = Path(__file__).resolve().parents[1]
KNOWLEDGE_BASE_DIR = _BASE_DIR / "knowledge_base"
CHROMA_DB_PATH = _BASE_DIR / "data" / "chroma_db"
COLLECTION_NAME = "knowledge_base"
COLLECTION_METADATA = {
    "hnsw:space": "cosine",
    # Windows + ChromaDB 0.5.x can crash around the default 100-document
    # HNSW flush boundary. Keep small local ingests in the in-memory batch.
    "hnsw:batch_size": 1000,
    "hnsw:sync_threshold": 1000,
}

MAX_CHUNK_SIZE = 500
MIN_CHUNK_SIZE = 80
EMBED_BATCH_SIZE = 20
UPSERT_BATCH_SIZE = 20
PROCESS_BATCH_SIZE = 100

_PARAGRAPH_SEP = re.compile(r"\n{2,}")
_SENTENCE_END = re.compile(r"(?<=[.!?。])\s+|\n+")

SUPPORTED_EXTENSIONS = {".md", ".txt", ".csv", ".pdf", ".json"}


# ── 파일 형식별 텍스트 추출 ────────────────────────────────────────────────────

def extract_text_plain(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_text_csv(path: Path) -> str:
    """CSV 각 행을 'key: value' 형태의 문장으로 변환."""
    lines: list[str] = []
    with path.open(encoding="utf-8-sig") as f:  # utf-8-sig: BOM 처리
        reader = csv.DictReader(f)
        for row in reader:
            sentence = ", ".join(
                f"{k}: {v}" for k, v in row.items() if v and v.strip()
            )
            if sentence:
                lines.append(sentence)
    return "\n".join(lines)


def extract_text_pdf(path: Path) -> str:
    """pdfplumber를 이용해 PDF에서 텍스트 추출."""
    try:
        import pdfplumber
    except ImportError:
        raise ImportError(
            "PDF 처리를 위해 pdfplumber가 필요합니다: pip install pdfplumber"
        )
    texts: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                texts.append(text.strip())
    return "\n\n".join(texts)


def extract_text_json(path: Path) -> str:
    """
    공공데이터 JSON 처리.

    지원 구조:
      - 배열: [{...}, {...}]
      - 공공데이터포털 표준: {"response": {"body": {"items": {"item": [...]}}}}
      - 기타 객체: key-value 재귀 탐색
    """
    raw = json.loads(path.read_text(encoding="utf-8"))

    # PDF OCR 결과 등 full_text 키가 있으면 우선 사용
    if isinstance(raw, dict) and "full_text" in raw:
        return raw["full_text"]

    def _extract_items(obj) -> list[dict]:
        """중첩 구조에서 dict 리스트 탐색."""
        if isinstance(obj, list):
            return [item for item in obj if isinstance(item, dict)]
        if isinstance(obj, dict):
            # 공공데이터포털 표준 응답 구조
            for key in ("item", "items", "data", "list", "records", "rows"):
                if key in obj:
                    return _extract_items(obj[key])
            # 한 depth 더 탐색
            for v in obj.values():
                if isinstance(v, (dict, list)):
                    result = _extract_items(v)
                    if result:
                        return result
        return []

    items = _extract_items(raw)
    if items:
        lines = []
        for item in items:
            sentence = ", ".join(
                f"{k}: {v}" for k, v in item.items() if v is not None and str(v).strip()
            )
            if sentence:
                lines.append(sentence)
        return "\n".join(lines)

    # 배열/객체 탐색 실패 시 전체를 평탄화
    return json.dumps(raw, ensure_ascii=False, indent=2)


def extract_text(path: Path) -> str:
    """파일 확장자에 따라 적절한 추출 함수 호출."""
    suffix = path.suffix.lower()
    if suffix in (".md", ".txt"):
        return extract_text_plain(path)
    if suffix == ".csv":
        return extract_text_csv(path)
    if suffix == ".pdf":
        return extract_text_pdf(path)
    if suffix == ".json":
        return extract_text_json(path)
    raise ValueError(f"지원하지 않는 파일 형식: {suffix}")


# ── 청킹 ─────────────────────────────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
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


def extract_chunks(file_path: Path) -> list[str]:
    """파일에서 텍스트를 추출한 뒤 청크로 분리."""
    text = extract_text(file_path)
    return chunk_text(text)


# ── 임베딩 ────────────────────────────────────────────────────────────────────

async def embed_texts(
    client: AsyncAzureOpenAI, texts: list[str]
) -> list[list[float]]:
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i : i + EMBED_BATCH_SIZE]
        response = await client.embeddings.create(
            input=batch,
            model=settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
        )
        all_embeddings.extend(d.embedding for d in response.data)
        logger.info(
            "  임베딩 처리: %d / %d",
            min(i + EMBED_BATCH_SIZE, len(texts)),
            len(texts),
        )
    return all_embeddings


def resolve_target_file(path: Path) -> Path:
    """CLI로 받은 파일 경로를 backend/ 또는 knowledge_base/ 기준으로 해석."""
    candidates = [path]
    if not path.is_absolute():
        candidates.extend(
            [
                _BASE_DIR / path,
                KNOWLEDGE_BASE_DIR / path,
                KNOWLEDGE_BASE_DIR / path.name,
            ]
        )

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    return candidates[0].resolve()


def discover_target_files() -> list[Path]:
    return [
        p
        for p in sorted(KNOWLEDGE_BASE_DIR.rglob("*"))
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    ]


def upsert_in_batches(
    collection,
    *,
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict],
) -> None:
    for i in range(0, len(ids), UPSERT_BATCH_SIZE):
        end = min(i + UPSERT_BATCH_SIZE, len(ids))
        logger.info("  ChromaDB 저장 시작: %d / %d", end, len(ids))
        collection.upsert(
            ids=ids[i:end],
            documents=documents[i:end],
            embeddings=embeddings[i:end],
            metadatas=metadatas[i:end],
        )
        logger.info("  ChromaDB 저장 완료: %d / %d", end, len(ids))


def filter_existing_documents(
    collection,
    *,
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict],
) -> tuple[list[str], list[str], list[list[float]], list[dict]]:
    existing = collection.get(ids=ids)
    existing_ids = set(existing.get("ids") or [])
    if not existing_ids:
        return ids, documents, embeddings, metadatas

    filtered_ids: list[str] = []
    filtered_documents: list[str] = []
    filtered_embeddings: list[list[float]] = []
    filtered_metadatas: list[dict] = []

    for doc_id, document, embedding, metadata in zip(
        ids, documents, embeddings, metadatas
    ):
        if doc_id in existing_ids:
            continue
        filtered_ids.append(doc_id)
        filtered_documents.append(document)
        filtered_embeddings.append(embedding)
        filtered_metadatas.append(metadata)

    logger.info("  기존 청크 건너뜀: %d / %d", len(existing_ids), len(ids))
    return filtered_ids, filtered_documents, filtered_embeddings, filtered_metadatas


# ── 메인 적재 로직 ─────────────────────────────────────────────────────────────

async def ingest(target_files: list[Path] | None = None, reset: bool = False) -> None:
    if not KNOWLEDGE_BASE_DIR.exists():
        logger.error("knowledge_base/ 폴더가 없습니다: %s", KNOWLEDGE_BASE_DIR)
        return

    if reset and CHROMA_DB_PATH.exists():
        shutil.rmtree(CHROMA_DB_PATH)
        logger.info("기존 ChromaDB 디렉토리 삭제 완료.")

    CHROMA_DB_PATH.mkdir(parents=True, exist_ok=True)

    client = AsyncAzureOpenAI(
        api_key=settings.AZURE_OPENAI_API_KEY,
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_version="2024-02-01",
        timeout=30.0,
    )
    chroma = chromadb.PersistentClient(
        path=str(CHROMA_DB_PATH),
        settings=ChromaSettings(anonymized_telemetry=False),
    )

    collection = chroma.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata=COLLECTION_METADATA,
    )

    if target_files is None:
        target_files = discover_target_files()
    else:
        target_files = [resolve_target_file(path) for path in target_files]

    if not target_files:
        logger.warning("처리할 파일이 없습니다. (지원 형식: %s)", ", ".join(SUPPORTED_EXTENSIONS))
        return

    logger.info("처리 대상 파일: %d개", len(target_files))
    for file_path in target_files:
        logger.info("  대상: %s", file_path)
    total_chunks = 0

    for file_path in target_files:
        filename = file_path.name
        logger.info("[%s] 처리 시작 (형식: %s)", filename, file_path.suffix.lower())

        try:
            chunks = extract_chunks(file_path)
        except Exception as e:
            logger.error("  [%s] 청크 생성 실패: %s", filename, e)
            continue

        if not chunks:
            logger.warning("  [%s] 청크가 비어 있습니다. 건너뜁니다.", filename)
            continue

        logger.info("  청크 수: %d", len(chunks))

        file_ok = True
        for p_start in range(0, len(chunks), PROCESS_BATCH_SIZE):
            p_end = min(p_start + PROCESS_BATCH_SIZE, len(chunks))
            batch_chunks = chunks[p_start:p_end]

            try:
                batch_embeddings = await embed_texts(client, batch_chunks)
            except Exception as e:
                logger.error("  [%s] 임베딩 실패 (%d-%d): %s", filename, p_start, p_end, e)
                file_ok = False
                break

            batch_ids = [
                hashlib.md5(f"{filename}:{p_start + i}:{chunk}".encode()).hexdigest()
                for i, chunk in enumerate(batch_chunks)
            ]
            batch_metadatas = [
                {
                    "filename": filename,
                    "file_type": file_path.suffix.lower().lstrip("."),
                    "chunk_index": p_start + i,
                    "source_path": str(file_path),
                }
                for i in range(len(batch_chunks))
            ]

            try:
                (
                    batch_ids,
                    batch_chunks,
                    batch_embeddings,
                    batch_metadatas,
                ) = filter_existing_documents(
                    collection,
                    ids=batch_ids,
                    documents=batch_chunks,
                    embeddings=batch_embeddings,
                    metadatas=batch_metadatas,
                )
                if not batch_ids:
                    continue

                upsert_in_batches(
                    collection,
                    ids=batch_ids,
                    documents=batch_chunks,
                    embeddings=batch_embeddings,
                    metadatas=batch_metadatas,
                )
            except Exception as e:
                logger.exception("  [%s] ChromaDB 저장 실패 (%d-%d): %s", filename, p_start, p_end, e)
                file_ok = False
                break

        if not file_ok:
            continue

        total_chunks += len(chunks)
        logger.info("  [%s] 완료 (%d 청크 적재)", filename, len(chunks))

    logger.info("=" * 50)
    logger.info("적재 완료: 파일 %d개, 총 청크 %d개", len(target_files), total_chunks)
    logger.info("ChromaDB 경로: %s", CHROMA_DB_PATH)
    logger.info("컬렉션 총 문서 수: %d", collection.count())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="지식 베이스 ChromaDB 적재 스크립트")
    parser.add_argument(
        "--file",
        type=Path,
        help="특정 파일만 적재 (예: knowledge_base/my_doc.pdf)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="기존 컬렉션 초기화 후 전체 재적재",
    )
    args = parser.parse_args()

    target = [args.file] if args.file else None
    asyncio.run(ingest(target_files=target, reset=args.reset))
