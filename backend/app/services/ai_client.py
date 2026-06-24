from openai import AsyncAzureOpenAI

from app.core.config import settings

_openai_client: AsyncAzureOpenAI | None = None


def get_client() -> AsyncAzureOpenAI:
    global _openai_client

    if _openai_client is None:
        _openai_client = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.rstrip("/"),
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )

    return _openai_client
