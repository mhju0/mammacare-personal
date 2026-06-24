import re

SUPPORTED_PROVIDERS = frozenset({"google", "kakao", "naver"})

PHONE_RE = re.compile(r"^010-?\d{4}-?\d{4}$")


def _validate_nickname(v: str) -> str:
    s = v.strip()
    if len(s) < 2 or len(s) > 20:
        raise ValueError("닉네임은 2~20자여야 합니다.")
    return s


def _normalize_phone(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not PHONE_RE.match(v):
        raise ValueError("전화번호 형식이 올바르지 않습니다. 예) 010-1234-5678")
    digits = re.sub(r"\D", "", v)
    return f"{digits[0:3]}-{digits[3:7]}-{digits[7:11]}"
