from typing import Any, Optional
from pydantic import BaseModel


class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None


def success_response(data: Any = None, message: str = "성공") -> ApiResponse:
    return ApiResponse(success=True, message=message, data=data)


def error_response(message: str) -> ApiResponse:
    return ApiResponse(success=False, message=message, data=None)