import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas
from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

settings = get_settings()

_ALLOWED_EXT: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def is_blob_path(value: str | None) -> bool:
    """data URL(레거시)·외부 URL이 아닌 Azure blob 경로인지 판별."""
    return bool(value) and not value.startswith(("data:", "http://", "https://"))


async def upload_image_to_blob(
    file: UploadFile,
    folder: str = "symptoms",
    max_size_bytes: int = 5 * 1024 * 1024,
) -> str:
    """이미지를 Azure Blob Storage에 업로드하고 blob_path 반환 (URL 아님)"""

    if file.content_type not in _ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 파일만 업로드 가능합니다. (jpeg, png, webp)",
        )

    contents = await file.read()

    if len(contents) > max_size_bytes:
        max_size_mb = max_size_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"파일 크기는 {max_size_mb}MB 이하만 가능합니다.",
        )

    ext = _ALLOWED_EXT[file.content_type]
    blob_path = f"{folder}/{uuid.uuid4()}.{ext}"

    def _upload() -> None:
        blob_service_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
        blob_client = blob_service_client.get_blob_client(
            container=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob=blob_path,
        )
        blob_client.upload_blob(contents)

    await asyncio.get_running_loop().run_in_executor(None, _upload)
    return blob_path


async def generate_sas_url(blob_path: str, expires_minutes: int = 15) -> str:
    """blob_path에 대한 임시 SAS URL 생성"""

    def _generate() -> str:
        conn_str = settings.AZURE_STORAGE_CONNECTION_STRING
        parts = dict(item.split("=", 1) for item in conn_str.split(";") if "=" in item)
        account_name = parts["AccountName"]
        account_key = parts["AccountKey"]
        container_name = settings.AZURE_STORAGE_CONTAINER_NAME
        expiry = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)

        sas_token = generate_blob_sas(
            account_name=account_name,
            container_name=container_name,
            blob_name=blob_path,
            account_key=account_key,
            permission=BlobSasPermissions(read=True),
            expiry=expiry,
        )
        return f"https://{account_name}.blob.core.windows.net/{container_name}/{blob_path}?{sas_token}"

    return await asyncio.get_running_loop().run_in_executor(None, _generate)


async def delete_image_from_blob(blob_path: str) -> None:
    """Azure Blob Storage에서 이미지 삭제"""

    def _delete() -> None:
        blob_service_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
        blob_client = blob_service_client.get_blob_client(
            container=settings.AZURE_STORAGE_CONTAINER_NAME,
            blob=blob_path,
        )
        blob_client.delete_blob()

    try:
        await asyncio.get_running_loop().run_in_executor(None, _delete)
    except Exception:
        pass
