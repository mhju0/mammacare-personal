# 파일명: oauth.py (schemas)
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# [SocialAccountResponse]
class SocialAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str                        # 'google' | 'kakao' | 'naver'
    provider_email: str | None           # provider가 알려준 이메일 (없을 수 있음)
    created_at: datetime                 # 연결된 시각


# [ConnectedSocialAccountsResponse]
class ConnectedSocialAccountsResponse(BaseModel):
    connected: list[SocialAccountResponse]    # 이미 연결된 소셜 계정들
    available: list[str]                      # 아직 연결되지 않아 추가 연결 가능한 provider 이름


# [SocialConnectAuthorizeResponse]
class SocialConnectAuthorizeResponse(BaseModel):
    authorize_url: str


# [SocialDisconnectResponse]
class SocialDisconnectResponse(BaseModel):
    provider: str
    disconnected: bool
