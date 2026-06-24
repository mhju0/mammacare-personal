# 파일명: limiter.py
# SlowAPI Limiter 싱글톤 — 라우터와 main.py에서 공유 import
import starlette.config as _sc

def _read_file_utf8(_, file_name, encoding="utf-8"):
    file_values = {}
    with open(file_name, encoding='utf-8') as input_file:
        for line in input_file.readlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("\"'")
                file_values[key] = value
    return file_values

_sc.Config._read_file = _read_file_utf8

from slowapi import Limiter
from slowapi.util import get_remote_address

# key_func: 클라이언트 IP 주소 기준으로 rate limit 카운트
limiter = Limiter(key_func=get_remote_address)
