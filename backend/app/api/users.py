# 파일명: users.py
from fastapi import APIRouter, HTTPException, Request, status

from app.core.constants import SUPPORTED_PROVIDERS
from app.core.deps import CurrentUser, DB
from app.core.response import ApiResponse, success_response
from app.core.security import sign_oauth_state
from app.schemas.oauth import (
    ConnectedSocialAccountsResponse,
    SocialAccountResponse,
    SocialConnectAuthorizeResponse,
    SocialDisconnectResponse,
)
from app.schemas.parent_user import (
    ParentLoginDeviceOut,
    ParentPasswordUpdate,
    ParentUserOut,
    ParentUserUpdate,
)
from app.services import login_device_service, oauth_service, user_service

router = APIRouter()


# [GET /users/me]
@router.get("/me", response_model=ParentUserOut)
async def get_me(user: CurrentUser) -> ParentUserOut:
    return ParentUserOut.model_validate(user)


# [PATCH /users/me]
@router.patch("/me", response_model=ParentUserOut)
async def update_me(
    payload: ParentUserUpdate, user: CurrentUser, db: DB
) -> ParentUserOut:
    updated = await user_service.update_parent(db, user, payload)
    return ParentUserOut.model_validate(updated)


# [PATCH /users/me/password]
@router.patch("/me/password")
async def update_my_password(
    payload: ParentPasswordUpdate, user: CurrentUser, db: DB
) -> dict:
    await user_service.update_parent_password(
        db,
        user,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return {"success": True, "data": {"message": "비밀번호가 변경되었습니다."}}


# [GET /users/me/devices]
@router.get("/me/devices")
async def list_my_login_devices(
    request: Request, user: CurrentUser, db: DB
) -> dict:
    current_user_agent = (request.headers.get("user-agent") or "unknown").strip() or "unknown"
    devices = await login_device_service.list_login_devices(db, user.id)
    return {
        "success": True,
        "data": {
            "devices": [
                ParentLoginDeviceOut.model_validate(
                    {
                        "id": device.id,
                        "device_type": device.device_type,
                        "device_name": device.device_name,
                        "last_login_at": device.last_login_at,
                        "is_current": device.user_agent == current_user_agent,
                    }
                ).model_dump(mode="json")
                for device in devices
            ]
        },
    }


# [DELETE /users/me]
@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, db: DB) -> None:
    await user_service.delete_parent(db, user)


# 소셜 계정 연결 관리


# [GET /users/me/social-accounts]
@router.get("/me/social-accounts", response_model=ConnectedSocialAccountsResponse)
async def list_my_social_accounts(
    user: CurrentUser, db: DB
) -> ConnectedSocialAccountsResponse:
    accounts = await oauth_service.list_social_accounts(db, user.id)
    connected_providers = {a.provider for a in accounts}
    # available = 지원 provider 중 아직 연결되지 않은 것들
    available = sorted(SUPPORTED_PROVIDERS - connected_providers)
    return ConnectedSocialAccountsResponse(
        connected=[SocialAccountResponse.model_validate(a) for a in accounts],
        available=available,
    )


# [GET /users/me/social-connect/{provider}]
@router.get("/me/social-connect/{provider}", response_model=ApiResponse)
async def start_social_connect(
    provider: str, user: CurrentUser
) -> ApiResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")
    # ⚠️ 보안: parent_id를 state에 HMAC 서명된 상태로 박음 → callback에서 위조 검증 가능
    state = sign_oauth_state(provider, action="connect", parent_id=str(user.id))
    url = oauth_service.build_authorize_url(provider, state)
    return success_response(
        data=SocialConnectAuthorizeResponse(authorize_url=url).model_dump(),
        message="소셜 계정 연결 URL을 생성했습니다.",
    )


# [DELETE /users/me/social-accounts/{provider}]
@router.delete("/me/social-accounts/{provider}", response_model=ApiResponse)
async def disconnect_my_social_account(
    provider: str, user: CurrentUser, db: DB
) -> ApiResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")
    result = await oauth_service.disconnect_social_account(db, user, provider)
    return success_response(
        data=SocialDisconnectResponse(**result).model_dump(),
        message="소셜 계정 연결을 해제했습니다.",
    )
